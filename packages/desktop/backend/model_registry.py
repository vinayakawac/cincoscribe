"""
model_registry.py — Central singleton for model lifecycle state.

Owns all runtime state for ASR (faster-whisper) and TTS (voice) model downloads and loads.
State is NOT persisted; rebuilt from disk on sidecar restart.
"""

from __future__ import annotations

import gc
import logging
import os
import threading
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ── Static registry — all known ASR and Voice/TTS models ─────────────────────

MODEL_REGISTRY: dict[str, dict] = {
    # ── ASR Models (faster-whisper) ─────────────────────────────────────────
    "tiny": {
        "category": "asr",
        "repo_id": "Systran/faster-whisper-tiny",
        "folder": "models--Systran--faster-whisper-tiny",
        "size_bytes": 40 * 1024 * 1024,
        "size_label": "~40 MB",
        "default_compute_type": "int8",
        "min_vram_mb": 0,
        "description": "Fastest, smallest ASR. Good for quick drafts or low-end hardware.",
    },
    "base": {
        "category": "asr",
        "repo_id": "Systran/faster-whisper-base",
        "folder": "models--Systran--faster-whisper-base",
        "size_bytes": 281 * 1024 * 1024,
        "size_label": "~281 MB",
        "default_compute_type": "int8",
        "min_vram_mb": 0,
        "description": "Balanced accuracy and speed. Default recommended ASR model.",
    },
    "small": {
        "category": "asr",
        "repo_id": "Systran/faster-whisper-small",
        "folder": "models--Systran--faster-whisper-small",
        "size_bytes": 922 * 1024 * 1024,
        "size_label": "~922 MB",
        "default_compute_type": "int8",
        "min_vram_mb": 1024,
        "description": "Better accuracy for accents and noisy audio.",
    },
    "medium": {
        "category": "asr",
        "repo_id": "Systran/faster-whisper-medium",
        "folder": "models--Systran--faster-whisper-medium",
        "size_bytes": 1500 * 1024 * 1024,
        "size_label": "~1.5 GB",
        "default_compute_type": "int8",
        "min_vram_mb": 2048,
        "description": "High accuracy for complex audio or multiple accents.",
    },
    "large-v3": {
        "category": "asr",
        "repo_id": "Systran/faster-whisper-large-v3",
        "folder": "models--Systran--faster-whisper-large-v3",
        "size_bytes": 3000 * 1024 * 1024,
        "size_label": "~3.0 GB",
        "default_compute_type": "float16",
        "min_vram_mb": 6144,
        "description": "Maximum accuracy ASR. Slow on CPU — recommend GPU.",
    },
    "turbo": {
        "category": "asr",
        "repo_id": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
        "folder": "models--mobiuslabsgmbh--faster-whisper-large-v3-turbo",
        "size_bytes": 1600 * 1024 * 1024,
        "size_label": "~1.6 GB",
        "default_compute_type": "float16",
        "min_vram_mb": 3072,
        "description": "Optimised large model — high accuracy with faster runtime.",
    },

    # ── Voice / TTS Models ──────────────────────────────────────────────────
    "kokoro": {
        "category": "tts",
        "repo_id": "csukuangfj/kokoro-en-v0_19",
        "folder": "kokoro-en-v0_19",
        "local_dir": True,
        "allow_patterns": ["*.onnx", "*.txt", "espeak-ng-data/*"],
        "size_bytes": 82 * 1024 * 1024,
        "size_label": "~82 MB",
        "default_compute_type": "int8",
        "min_vram_mb": 0,
        "description": "Ultra lightweight, high-fidelity local speech synthesis.",
    },
    "qwen_1_7b": {
        "category": "tts",
        "repo_id": "Qwen/Qwen2-Audio-7B-Instruct",
        "folder": "models--Qwen--Qwen2-Audio-7B-Instruct",
        "size_bytes": 3400 * 1024 * 1024,
        "size_label": "~3.4 GB",
        "default_compute_type": "float16",
        "min_vram_mb": 4096,
        "description": "High-fidelity speech synthesis based on Qwen-Audio.",
    },
    "qwen_0_6b": {
        "category": "tts",
        "repo_id": "Qwen/Qwen2-0.5B-Instruct",
        "folder": "models--Qwen--Qwen2-0.5B-Instruct",
        "size_bytes": 1200 * 1024 * 1024,
        "size_label": "~1.2 GB",
        "default_compute_type": "int8",
        "min_vram_mb": 2048,
        "description": "Balanced quality and performance version of Qwen TTS.",
    },
    "qwen_custom_1_7b": {
        "category": "tts",
        "repo_id": "Qwen/Qwen2-Audio-7B",
        "folder": "models--Qwen--Qwen2-Audio-7B",
        "size_bytes": 3400 * 1024 * 1024,
        "size_label": "~3.4 GB",
        "default_compute_type": "float16",
        "min_vram_mb": 4096,
        "description": "Personalized voice cloning model based on Qwen.",
    },
    "qwen_custom_0_6b": {
        "category": "tts",
        "repo_id": "Qwen/Qwen2-0.5B",
        "folder": "models--Qwen--Qwen2-0.5B",
        "size_bytes": 1200 * 1024 * 1024,
        "size_label": "~1.2 GB",
        "default_compute_type": "int8",
        "min_vram_mb": 2048,
        "description": "Lightweight personal voice cloning model.",
    },
    "luxtts": {
        "category": "tts",
        "repo_id": "Lux-TTS/LuxTTS",
        "folder": "models--Lux-TTS--LuxTTS",
        "size_bytes": 45 * 1024 * 1024,
        "size_label": "~45 MB",
        "default_compute_type": "int8",
        "min_vram_mb": 0,
        "description": "Extremely fast and lightweight voice generation.",
    },
    "chatterbox_tts": {
        "category": "tts",
        "repo_id": "Chatterbox/Chatterbox-TTS",
        "folder": "models--Chatterbox--Chatterbox-TTS",
        "size_bytes": 350 * 1024 * 1024,
        "size_label": "~350 MB",
        "default_compute_type": "int8",
        "min_vram_mb": 1024,
        "description": "Natural sounding voice synthesis across multiple languages.",
    },
    "chatterbox_turbo": {
        "category": "tts",
        "repo_id": "Chatterbox/Chatterbox-Turbo",
        "folder": "models--Chatterbox--Chatterbox-Turbo",
        "size_bytes": 180 * 1024 * 1024,
        "size_label": "~180 MB",
        "default_compute_type": "int8",
        "min_vram_mb": 512,
        "description": "High speed English generation with support for emotional tags.",
    },
    "tada_1b": {
        "category": "tts",
        "repo_id": "TADA/TADA-1B",
        "folder": "models--TADA--TADA-1B",
        "size_bytes": 2000 * 1024 * 1024,
        "size_label": "~2.0 GB",
        "default_compute_type": "float16",
        "min_vram_mb": 2048,
        "description": "Advanced text-to-speech model optimized for expressive speech.",
    },
    "tada_3b": {
        "category": "tts",
        "repo_id": "TADA/TADA-3B",
        "folder": "models--TADA--TADA-3B",
        "size_bytes": 6000 * 1024 * 1024,
        "size_label": "~6.0 GB",
        "default_compute_type": "float16",
        "min_vram_mb": 6144,
        "description": "Large scale multilingual speech synthesis.",
    },
}

# Alias for backwards compatibility
WHISPER_REGISTRY = MODEL_REGISTRY

# Status constants
STATUS_NOT_DOWNLOADED = "not_downloaded"
STATUS_DOWNLOADING    = "downloading"
STATUS_DOWNLOADED     = "downloaded"
STATUS_LOADED         = "loaded"


# ── Runtime state entry ───────────────────────────────────────────────────────

def _blank_state() -> dict:
    return {
        "status":           STATUS_NOT_DOWNLOADED,
        "progress":         0.0,
        "bytes_downloaded": 0,
        "bytes_total":      0,
        "speed_bps":        0.0,
        "error":            None,
        "instance":         None,   # Model instance
        "compute_type":     None,
        "device":           None,
        "mem_freed_bytes":  None,
        # internal — never serialised to API
        "_cancel_event":    None,
    }


# ── Registry singleton ────────────────────────────────────────────────────────

class ModelRegistry:
    """
    Thread-safe singleton that manages download + load state for all models.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._state: dict[str, dict] = {mid: _blank_state() for mid in MODEL_REGISTRY}

    # ── startup scan ─────────────────────────────────────────────────────────

    def scan_disk(self, models_dir: Path) -> None:
        """
        Walk models_dir and mark models whose snapshot folder or dir exists as downloaded.
        Called once at sidecar startup; safe to call again after modelsDir change.
        """
        with self._lock:
            for model_id, meta in MODEL_REGISTRY.items():
                target_path = models_dir / meta["folder"]
                snapshots = target_path / "snapshots"
                is_downloaded = (
                    (snapshots.is_dir() and any(p.is_dir() for p in snapshots.iterdir()))
                    or (target_path.is_dir() and any(target_path.iterdir()))
                )
                s = self._state[model_id]
                if s["status"] in (STATUS_NOT_DOWNLOADED, STATUS_DOWNLOADED):
                    s["status"] = STATUS_DOWNLOADED if is_downloaded else STATUS_NOT_DOWNLOADED
                    s["progress"] = 1.0 if is_downloaded else 0.0
        logger.info("[registry] Disk scan complete — %s", {
            mid: self._state[mid]["status"] for mid in MODEL_REGISTRY
        })

    # ── public read ───────────────────────────────────────────────────────────

    def get_all(self) -> list[dict]:
        with self._lock:
            return [self._public(mid) for mid in MODEL_REGISTRY]

    def get(self, model_id: str) -> dict:
        with self._lock:
            if model_id not in self._state:
                raise KeyError(model_id)
            return self._public(model_id)

    def _public(self, model_id: str) -> dict:
        """Return state merged with static registry, stripping internal fields."""
        meta = MODEL_REGISTRY[model_id]
        s    = self._state[model_id]
        return {
            "model_id":     model_id,
            "category":     meta.get("category", "asr"),
            "repo_id":      meta["repo_id"],
            "size_label":   meta["size_label"],
            "size_bytes":   meta["size_bytes"],
            "default_compute_type": meta["default_compute_type"],
            "min_vram_mb":  meta["min_vram_mb"],
            "description":  meta["description"],
            # runtime
            "status":           s["status"],
            "progress":         s["progress"],
            "bytes_downloaded": s["bytes_downloaded"],
            "bytes_total":      s["bytes_total"],
            "speed_bps":        s["speed_bps"],
            "error":            s["error"],
            "loaded":           s["status"] == STATUS_LOADED,
            "downloaded":       s["status"] in (STATUS_DOWNLOADED, STATUS_LOADED),
            "compute_type":     s["compute_type"],
            "device":           s["device"],
            "mem_freed_bytes":  s["mem_freed_bytes"],
        }

    # ── download lifecycle ────────────────────────────────────────────────────

    def set_downloading(self, model_id: str, cancel_event: threading.Event) -> None:
        with self._lock:
            s = self._state[model_id]
            s["status"]        = STATUS_DOWNLOADING
            s["progress"]      = 0.0
            s["bytes_downloaded"] = 0
            s["bytes_total"]   = MODEL_REGISTRY[model_id]["size_bytes"]
            s["speed_bps"]     = 0.0
            s["error"]         = None
            s["_cancel_event"] = cancel_event

    def update_progress(
        self,
        model_id: str,
        bytes_downloaded: int,
        bytes_total: int,
        speed_bps: float,
    ) -> None:
        with self._lock:
            s = self._state[model_id]
            s["bytes_downloaded"] = bytes_downloaded
            if bytes_total:
                s["bytes_total"] = bytes_total
            total = s["bytes_total"] or 1
            s["progress"]  = min(0.99, bytes_downloaded / total)
            s["speed_bps"] = speed_bps

    def set_downloaded(self, model_id: str) -> None:
        with self._lock:
            s = self._state[model_id]
            s["status"]        = STATUS_DOWNLOADED
            s["progress"]      = 1.0
            s["speed_bps"]     = 0.0
            s["error"]         = None
            s["_cancel_event"] = None

    def set_failed(self, model_id: str, error: str) -> None:
        with self._lock:
            s = self._state[model_id]
            s["status"]        = STATUS_NOT_DOWNLOADED
            s["progress"]      = 0.0
            s["error"]         = error
            s["_cancel_event"] = None

    def cancel_download(self, model_id: str) -> bool:
        with self._lock:
            s = self._state[model_id]
            event = s.get("_cancel_event")
            if event and s["status"] == STATUS_DOWNLOADING:
                event.set()
                return True
            return False

    def is_downloading(self, model_id: str) -> bool:
        with self._lock:
            return self._state[model_id]["status"] == STATUS_DOWNLOADING

    def is_downloaded(self, model_id: str) -> bool:
        with self._lock:
            return self._state[model_id]["status"] in (STATUS_DOWNLOADED, STATUS_LOADED)

    # ── load / unload lifecycle ───────────────────────────────────────────────

    def set_loaded(
        self,
        model_id: str,
        instance: object,
        compute_type: str,
        device: str,
        mem_freed_bytes: Optional[int] = None,
    ) -> None:
        with self._lock:
            s = self._state[model_id]
            s["status"]       = STATUS_LOADED
            s["instance"]     = instance
            s["compute_type"] = compute_type
            s["device"]       = device
            s["error"]        = None
            s["mem_freed_bytes"] = mem_freed_bytes

    def get_loaded_instance(self, model_id: str) -> Optional[object]:
        with self._lock:
            s = self._state[model_id]
            if s["status"] == STATUS_LOADED:
                return s["instance"]
            return None

    def get_any_loaded_model_id(self) -> Optional[str]:
        with self._lock:
            for mid, s in self._state.items():
                if s["status"] == STATUS_LOADED:
                    return mid
            return None

    def set_unloaded(self, model_id: str, mem_freed_bytes: Optional[int] = None) -> None:
        with self._lock:
            s = self._state[model_id]
            if s["status"] == STATUS_LOADED:
                s["status"]      = STATUS_DOWNLOADED
                s["instance"]    = None
                s["compute_type"] = None
                s["device"]       = None
                s["mem_freed_bytes"] = mem_freed_bytes


# ── Module-level singleton ────────────────────────────────────────────────────
registry = ModelRegistry()
