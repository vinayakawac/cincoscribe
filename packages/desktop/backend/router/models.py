"""
router/models.py — Model lifecycle endpoints: download, load, unload.

Endpoint surface:
  GET   /models                           — full registry + live state
  POST  /models/{model_id}/download       — enqueue background download
  GET   /models/{model_id}/download/status — poll download progress
  POST  /models/{model_id}/download/cancel — cancel in-flight download
  POST  /models/{model_id}/load           — instantiate WhisperModel / Voice model
  POST  /models/{model_id}/unload         — free memory, keep files

  GET   /engines/models/status            — legacy compat alias for GET /models
"""

from __future__ import annotations

import gc
import inspect
import logging
import shutil
import threading
import time
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import config
from model_registry import (
    MODEL_REGISTRY,
    STATUS_DOWNLOADED,
    STATUS_DOWNLOADING,
    STATUS_LOADED,
    STATUS_NOT_DOWNLOADED,
    registry,
)

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Pydantic payloads ─────────────────────────────────────────────────────────

class LoadPayload(BaseModel):
    compute_type: Optional[str] = None   # override; None → use model default
    device: Optional[str]       = None   # "cpu" | "cuda" | None → auto-detect
    keep_others: bool           = False  # if False, unload current model first


class SettingsPayload(BaseModel):
    models_dir: str


class DeletePayload(BaseModel):
    model_type: Optional[str] = None
    model_name: Optional[str] = None
    model_id: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _snapshot_path(model_id: str) -> Optional[str]:
    """Return the local snapshot directory or folder for a downloaded model, or None."""
    meta = MODEL_REGISTRY[model_id]
    folder = meta["folder"]
    target_path = config.models_dir / folder
    snapshots = target_path / "snapshots"
    if snapshots.is_dir():
        dirs = sorted(p for p in snapshots.iterdir() if p.is_dir())
        if dirs:
            return str(dirs[0])
    if target_path.is_dir() and any(target_path.iterdir()):
        return str(target_path)
    return None


def _detect_device() -> tuple[str, str]:
    """Return (device, compute_type) based on available hardware."""
    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            return "cuda", "float16"
    except ImportError:
        pass
    return "cpu", "int8"


def _mem_rss() -> int:
    """Current process RSS in bytes (CPU fallback)."""
    try:
        import psutil  # type: ignore
        return psutil.Process().memory_info().rss
    except Exception:
        return 0


def _cuda_mem() -> int:
    """Currently allocated CUDA memory in bytes."""
    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            return torch.cuda.memory_allocated()
    except Exception:
        pass
    return 0


def _free_cuda_cache() -> None:
    try:
        import torch  # type: ignore
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


try:
    from tqdm.auto import tqdm as _BaseTqdm  # type: ignore
    _TQDM_AVAILABLE = True
except ImportError:
    _BaseTqdm = object
    _TQDM_AVAILABLE = False

thread_local = threading.local()

_active_download_model_id: Optional[str] = None
_active_download_lock = threading.Lock()

if _TQDM_AVAILABLE:
    class CancellableTqdm(_BaseTqdm):  # type: ignore[misc]
        """Custom tqdm class that signals the registry and aborts if cancel_event is set."""

        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            with _active_download_lock:
                active_id = _active_download_model_id
            self._model_id = (
                getattr(thread_local, "active_model_id", None)
                or active_id
                or registry.get_any_downloading_model_id()
            )
            self._cancel_event = (
                getattr(thread_local, "active_cancel_event", None)
                or (registry.get_cancel_event(self._model_id) if self._model_id else None)
            )
            unit_str = str(getattr(self, "unit", "") or "").lower()
            self._is_byte_tqdm = (
                unit_str == "b"
                or getattr(self, "unit_scale", False)
                or (self.total is not None and self.total > 1024)
            )
            if self._model_id and self._is_byte_tqdm:
                registry.update_tqdm_bar(
                    self._model_id,
                    id(self),
                    getattr(self, "n", 0),
                    getattr(self, "total", 0),
                    0.0,
                )

        def update(self, n: int = 1) -> None:
            cancel_evt = self._cancel_event or getattr(thread_local, "active_cancel_event", None)
            if cancel_evt and cancel_evt.is_set():
                raise InterruptedError("Download cancelled by user")
            super().update(n)
            model_id = self._model_id or getattr(thread_local, "active_model_id", None)
            if model_id and self._is_byte_tqdm:
                rate = self.format_dict.get("rate") or 0.0
                registry.update_tqdm_bar(
                    model_id,
                    id(self),
                    getattr(self, "n", 0),
                    getattr(self, "total", 0),
                    float(rate),
                )
else:
    CancellableTqdm = None  # type: ignore[assignment,misc]


# ── Download worker (runs in daemon thread) ───────────────────────────────────

def _download_worker(model_id: str, cancel_event: threading.Event) -> None:
    global _active_download_model_id
    meta     = MODEL_REGISTRY[model_id]
    repo_id  = meta["repo_id"]
    folder   = meta["folder"]
    dest_dir = config.models_dir / folder

    logger.info("[models] Starting download: %s from %s", model_id, repo_id)

    with _active_download_lock:
        _active_download_model_id = model_id

    thread_local.active_model_id = model_id
    thread_local.active_cancel_event = cancel_event

    try:
        from huggingface_hub import snapshot_download  # type: ignore

        kwargs: dict = dict(
            repo_id=repo_id,
            allow_patterns=meta.get("allow_patterns"),
            local_files_only=False,
            max_workers=2,
        )

        if meta.get("local_dir"):
            kwargs["local_dir"] = str(dest_dir)
        else:
            kwargs["cache_dir"] = str(config.models_dir)

        if CancellableTqdm is not None:
            kwargs["tqdm_class"] = CancellableTqdm

        try:
            snapshot_download(**kwargs)
        except (InterruptedError, KeyboardInterrupt):
            raise InterruptedError("Download cancelled by user")
        except Exception as net_err:
            if cancel_event.is_set():
                raise InterruptedError("Download cancelled by user")
            # Check if local snapshot already exists on disk when network/DNS fails
            snapshots_dir = dest_dir / "snapshots"
            has_local = (
                (dest_dir.is_dir() and any(f.suffix in ('.bin', '.onnx', '.safetensors', '.pt', '.json', '.txt') for f in dest_dir.rglob('*')))
                if meta.get("local_dir")
                else (snapshots_dir.is_dir() and any(p.is_dir() and any(f.suffix in ('.bin', '.onnx', '.safetensors', '.pt', '.json', '.txt') for f in p.rglob('*')) for p in snapshots_dir.iterdir()))
            )
            if has_local:
                logger.info("[models] Network offline/unavailable (%s); loading from local disk for %s", net_err, model_id)
                kwargs["local_files_only"] = True
                snapshot_download(**kwargs)
            else:
                err_msg = str(net_err)
                if "getaddrinfo failed" in err_msg or "ConnectError" in err_msg or "ConnectionError" in err_msg:
                    err_msg = f"Network offline or DNS error connecting to Hugging Face Hub for '{model_id}'. Please check internet connection and try again."
                raise RuntimeError(err_msg) from net_err

        if cancel_event.is_set():
            raise InterruptedError("Download cancelled by user")

        registry.set_downloaded(model_id)
        logger.info("[models] Download complete: %s", model_id)

    except InterruptedError:
        logger.info("[models] Download cancelled: %s — cleaning up partial files", model_id)
        _cleanup_partial(dest_dir)
        registry.set_failed(model_id, "cancelled")

    except Exception as exc:
        if cancel_event.is_set() or "cancelled" in str(exc).lower() or isinstance(exc, InterruptedError):
            logger.info("[models] Download cancelled: %s — cleaning up partial files", model_id)
            _cleanup_partial(dest_dir)
            registry.set_failed(model_id, "cancelled")
        else:
            logger.error("[models] Download failed: %s — %s", model_id, exc)
            _cleanup_partial(dest_dir)
            registry.set_failed(model_id, str(exc))

    finally:
        with _active_download_lock:
            if _active_download_model_id == model_id:
                _active_download_model_id = None
        thread_local.__dict__.pop("active_model_id", None)
        thread_local.__dict__.pop("active_cancel_event", None)


def _cleanup_partial(dest_dir: Path) -> None:
    """Remove incomplete download artefacts."""
    blobs = dest_dir / "blobs"
    tmp   = dest_dir / "tmp"
    for p in (blobs, tmp):
        if p.exists():
            try:
                shutil.rmtree(p)
            except Exception as e:
                logger.warning("[models] cleanup error for %s: %s", p, e)

    # Clean up incomplete files (.incomplete)
    if dest_dir.exists():
        for p in list(dest_dir.rglob("*.incomplete")):
            try:
                p.unlink()
            except Exception:
                pass
        # If dest_dir has no model files left, remove dest_dir
        has_weights = any(f.suffix in ('.bin', '.onnx', '.safetensors', '.pt', '.json', '.txt') for f in dest_dir.rglob('*'))
        if not has_weights:
            try:
                shutil.rmtree(dest_dir)
            except Exception:
                pass
    tmp   = dest_dir / "tmp"
    for p in (blobs, tmp):
        if p.exists():
            try:
                shutil.rmtree(p)
            except Exception as e:
                logger.warning("[models] cleanup error for %s: %s", p, e)


# ── Load helper with OOM fallback ─────────────────────────────────────────────

def _load_whisper(model_id: str, local_path: str, device: str, compute_type: str) -> tuple[object, str, str]:
    """
    Try to load WhisperModel with OOM fallback chain:
      float16/cuda → int8/cuda → int8/cpu
    Returns (model_instance, used_compute_type, used_device).
    """
    from faster_whisper import WhisperModel  # type: ignore

    attempts = [(device, compute_type)]
    if device == "cuda" and compute_type == "float16":
        attempts += [("cuda", "int8"), ("cpu", "int8")]
    elif device == "cuda":
        attempts += [("cpu", "int8")]

    last_exc: Exception = RuntimeError("no attempts")
    for dev, ct in attempts:
        try:
            logger.info("[models] Loading %s on %s/%s", model_id, dev, ct)
            try:
                model = WhisperModel(
                    local_path,
                    device=dev,
                    compute_type=ct,
                    download_root=str(config.models_dir),
                    cpu_threads=4,
                    local_files_only=True,
                )
            except Exception:
                model = WhisperModel(
                    local_path,
                    device=dev,
                    compute_type=ct,
                    download_root=str(config.models_dir),
                    cpu_threads=4,
                )
            if (dev, ct) != (device, compute_type):
                logger.warning(
                    "[models] OOM fallback for %s: using %s/%s instead of %s/%s",
                    model_id, dev, ct, device, compute_type,
                )
            return model, ct, dev
        except Exception as exc:
            logger.warning("[models] Load attempt (%s/%s) failed: %s", dev, ct, exc)
            last_exc = exc

    raise last_exc


# ── GET /models ───────────────────────────────────────────────────────────────

@router.get("/models")
def list_models():
    """Return the full model registry merged with live runtime state."""
    return {
        "models": registry.get_all(),
        "current_models_dir": str(config.models_dir),
    }


# ── GET /models/{model_id}/download/status ────────────────────────────────────

@router.get("/models/{model_id}/download/status")
def get_download_status(model_id: str):
    if model_id not in MODEL_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_id}")
    m = registry.get(model_id)
    return {
        "model_id":       model_id,
        "state":          m["status"],
        "progress":       m["progress"],
        "bytes_downloaded": m["bytes_downloaded"],
        "bytes_total":    m["bytes_total"],
        "speed_bps":      m["speed_bps"],
        "error":          m["error"],
    }


# ── POST /models/{model_id}/download ─────────────────────────────────────────

@router.post("/models/{model_id}/download")
def download_model(model_id: str):
    if model_id not in MODEL_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_id}")

    if registry.is_downloaded(model_id):
        return {"status": "completed", "message": f"{model_id} is already downloaded"}

    if registry.is_downloading(model_id):
        return {"status": "downloading", "message": f"{model_id} download already in progress"}

    cancel_event = threading.Event()
    registry.set_downloading(model_id, cancel_event)

    t = threading.Thread(
        target=_download_worker,
        args=(model_id, cancel_event),
        daemon=True,
        name=f"dl-{model_id}",
    )
    t.start()
    return {"status": "started", "message": f"Download started for {model_id}"}


# ── POST /models/{model_id}/download/cancel ───────────────────────────────────

@router.post("/models/{model_id}/download/cancel")
def cancel_download(model_id: str):
    if model_id not in MODEL_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_id}")

    cancelled = registry.cancel_download(model_id)
    if cancelled:
        return {"status": "cancelling", "message": f"Cancel signal sent for {model_id}"}
    return {"status": "noop", "message": f"{model_id} is not currently downloading"}


# ── POST /models/{model_id}/load ──────────────────────────────────────────────

@router.post("/models/{model_id}/load")
async def load_model(model_id: str, payload: LoadPayload = LoadPayload()):
    if model_id not in MODEL_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_id}")

    current = registry.get(model_id)

    if current["status"] == STATUS_LOADED:
        return {
            "status":       "loaded",
            "model_id":     model_id,
            "compute_type": current["compute_type"],
            "device":       current["device"],
            "message":      f"{model_id} is already loaded",
        }

    if current["status"] not in (STATUS_DOWNLOADED,):
        raise HTTPException(
            status_code=409,
            detail=f"Model {model_id} is not downloaded. "
                   f"POST /models/{model_id}/download first. "
                   f"Current status: {current['status']}"
        )

    if not payload.keep_others:
        for item in registry.get_all():
            loaded_id = item.get("id") or item.get("model_id")
            if loaded_id and loaded_id != model_id and item.get("status") == STATUS_LOADED:
                logger.info("[models] Unloading %s before loading %s", loaded_id, model_id)
                try:
                    unload_model(loaded_id)
                except Exception as ex:
                    logger.warning("[models] Error unloading %s: %s", loaded_id, ex)


    auto_device, auto_ct = _detect_device()
    device       = payload.device or auto_device
    compute_type = payload.compute_type or MODEL_REGISTRY[model_id]["default_compute_type"]
    if device == "cuda" and auto_device == "cpu":
        logger.warning("[models] CUDA requested for %s but not available; using CPU/int8", model_id)
        device       = "cpu"
        compute_type = "int8"

    local_path = _snapshot_path(model_id)
    if not local_path:
        raise HTTPException(status_code=409, detail=f"Snapshot not found for {model_id}; re-download required")

    is_cuda = device == "cuda"
    mem_before = _cuda_mem() if is_cuda else _mem_rss()

    meta = MODEL_REGISTRY[model_id]

    try:
        if meta.get("category") == "asr":
            model_instance, used_ct, used_dev = _load_whisper(model_id, local_path, device, compute_type)
            try:
                from router.asr import asr_engine
                asr_engine._model        = model_instance
                asr_engine._current_size = model_id
            except Exception:
                pass
        else:
            from backends import get_tts_backend_for_engine
            backend = get_tts_backend_for_engine(model_id)
            if hasattr(backend, "load_model"):
                load_fn = backend.load_model
                is_async = inspect.iscoroutinefunction(load_fn)
                try:
                    if is_async:
                        await load_fn(model_id)
                    else:
                        load_fn(model_id)
                except TypeError:
                    if is_async:
                        await load_fn()
                    else:
                        load_fn()
            model_instance = backend
            used_ct = compute_type
            used_dev = device
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load {model_id}: {exc}") from exc

    mem_after = _cuda_mem() if is_cuda else _mem_rss()
    mem_delta = max(0, mem_after - mem_before) if mem_before else None

    registry.set_loaded(model_id, model_instance, used_ct, used_dev, mem_delta)

    fallback_used = (used_ct != compute_type or used_dev != device)
    return {
        "status":         "loaded",
        "model_id":       model_id,
        "compute_type":   used_ct,
        "device":         used_dev,
        "fallback_used":  fallback_used,
        "fallback_reason": f"OOM: fell back from {device}/{compute_type}" if fallback_used else None,
        "mem_delta_bytes": mem_delta,
    }


# ── POST /models/{model_id}/unload ────────────────────────────────────────────

@router.post("/models/{model_id}/unload")
def unload_model(model_id: str):
    if model_id not in MODEL_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_id}")

    current = registry.get(model_id)
    if current["status"] != STATUS_LOADED:
        return {
            "status":    "noop",
            "model_id":  model_id,
            "message":   f"{model_id} is not currently loaded",
            "freed_bytes": None,
        }

    is_cuda = current.get("device") == "cuda"
    mem_before = _cuda_mem() if is_cuda else _mem_rss()

    registry.set_unloaded(model_id)
    try:
        from router.asr import asr_engine
        if asr_engine._current_size == model_id:
            asr_engine._model        = None
            asr_engine._current_size = None
    except Exception:
        pass

    try:
        from router.tts import tts_engine
        if hasattr(tts_engine, "unload"):
            tts_engine.unload()
    except Exception:
        pass

    try:
        from backends import get_tts_backend_for_engine
        chatterbox = get_tts_backend_for_engine("chatterbox")
        if hasattr(chatterbox, "unload_model"):
            chatterbox.unload_model()
    except Exception:
        pass

    gc.collect()
    _free_cuda_cache()

    mem_after = _cuda_mem() if is_cuda else _mem_rss()
    freed = max(0, mem_before - mem_after) if mem_before else None

    return {
        "status":      "unloaded",
        "model_id":    model_id,
        "freed_bytes": freed,
    }


# ── Delete model endpoints ───────────────────────────────────────────────────

def _delete_model_files(model_id: str) -> bool:
    if model_id not in MODEL_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Unknown model: {model_id}")

    current = registry.get(model_id)
    if current["status"] == STATUS_LOADED:
        unload_model(model_id)

    meta = MODEL_REGISTRY[model_id]
    folder = meta["folder"]
    target_path = config.models_dir / folder

    deleted = False
    if target_path.exists():
        try:
            if target_path.is_dir():
                shutil.rmtree(target_path)
            else:
                target_path.unlink()
            deleted = True
        except Exception as exc:
            logger.error("[models] Failed to delete model directory %s: %s", target_path, exc)
            raise HTTPException(status_code=500, detail=f"Failed to delete model files: {exc}") from exc

    registry.set_deleted(model_id)
    return deleted


@router.post("/engines/models/delete")
def legacy_delete_model(payload: DeletePayload):
    model_id = payload.model_name or payload.model_id
    if not model_id:
        raise HTTPException(status_code=400, detail="Missing model_name or model_id")
    _delete_model_files(model_id)
    return {"status": "deleted", "model_id": model_id, "message": f"{model_id} removed successfully"}


@router.delete("/models/{model_id}")
def delete_model_endpoint(model_id: str):
    _delete_model_files(model_id)
    return {"status": "deleted", "model_id": model_id, "message": f"{model_id} removed successfully"}


@router.post("/models/{model_id}/delete")
def delete_model_post_endpoint(model_id: str):
    _delete_model_files(model_id)
    return {"status": "deleted", "model_id": model_id, "message": f"{model_id} removed successfully"}


# ── Legacy compat: GET /engines/models/status ────────────────────────────────

@router.get("/engines/models/status")
def legacy_models_status():
    """
    Backward-compatible endpoint used by older frontend code.
    Returns the same data as GET /models in the legacy shape.
    """
    all_models = registry.get_all()
    asr_status = {
        m["model_id"]: m["status"] in (STATUS_DOWNLOADED, STATUS_LOADED)
        for m in all_models if m["category"] == "asr"
    }
    tts_status = {
        m["model_id"]: m["status"] in (STATUS_DOWNLOADED, STATUS_LOADED)
        for m in all_models if m["category"] == "tts"
    }
    downloading = [m["model_id"] for m in all_models if m["status"] == STATUS_DOWNLOADING]
    progress = {
        m["model_id"]: {
            "downloaded": m["bytes_downloaded"],
            "total":      m["bytes_total"],
            "percentage": int(m["progress"] * 100),
            "speed":      m["speed_bps"],
        }
        for m in all_models
        if m["status"] == STATUS_DOWNLOADING
    }
    errors = {
        m["model_id"]: m["error"]
        for m in all_models
        if m["error"] and m["status"] == STATUS_NOT_DOWNLOADED
    }
    return {
        "asr":                asr_status,
        "tts":                tts_status,
        "downloading":        downloading,
        "progress":           progress,
        "errors":             errors,
        "current_models_dir": str(config.models_dir),
        "models":             all_models,
    }


# ── Legacy: POST /settings/models-dir ────────────────────────────────────────

@router.post("/settings/models-dir")
def change_models_dir(payload: SettingsPayload):
    try:
        config.update_models_dir(payload.models_dir)
        return {"status": "success", "models_dir": str(config.models_dir)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
