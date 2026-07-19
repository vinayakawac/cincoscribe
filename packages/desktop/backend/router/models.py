import threading
import time

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tqdm.auto import tqdm as base_tqdm

from config import models_dir, update_models_dir

router = APIRouter()


class DownloadPayload(BaseModel):
    model_type: str
    model_name: str


class SettingsPayload(BaseModel):
    models_dir: str


thread_local = threading.local()


class ProgressManager:
    def __init__(self):
        self._lock = threading.Lock()
        self.active_tasks = {}

    def start_task(self, task_id, total_bytes, desc="Downloading"):
        with self._lock:
            self.active_tasks[task_id] = {
                "desc": desc,
                "downloaded": 0,
                "total": total_bytes or 0,
                "speed": 0.0,
                "start_time": time.time(),
            }

    def update_task(self, task_id, downloaded_bytes, speed=None):
        with self._lock:
            task = self.active_tasks.get(task_id)
            if task is None:
                return
            task["downloaded"] = downloaded_bytes
            if speed is not None:
                task["speed"] = float(speed)
            else:
                elapsed = time.time() - task["start_time"]
                task["speed"] = downloaded_bytes / elapsed if elapsed > 0 else 0.0

    def complete_task(self, task_id):
        with self._lock:
            self.active_tasks.pop(task_id, None)

    def get_progress(self):
        with self._lock:
            return {key: dict(value) for key, value in self.active_tasks.items()}


progress_manager = ProgressManager()


class PatchedTqdm(base_tqdm):
    """Explicit progress adapter; do not monkeypatch tqdm module globals."""

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._model_key = getattr(thread_local, "active_model_key", None)
        if self._model_key:
            progress_manager.start_task(
                self._model_key,
                total_bytes=self.total or 0,
                desc=kwargs.get("desc", "Downloading"),
            )

    def update(self, n=1):
        super().update(n)
        if self._model_key:
            progress_manager.update_task(
                self._model_key,
                downloaded_bytes=self.n,
                speed=self.format_dict.get("rate"),
            )

    def close(self):
        super().close()
        if self._model_key:
            progress_manager.complete_task(self._model_key)


MODEL_FOLDER_MAP = {
    "base": "models--Systran--faster-whisper-base",
    "small": "models--Systran--faster-whisper-small",
    "medium": "models--Systran--faster-whisper-medium",
    "large": "models--Systran--faster-whisper-large-v3",
    "turbo": "models--mobiuslabsgmbh--faster-whisper-large-v3-turbo",
    "kokoro": "kokoro-en-v0_19",
}

ASR_REPO_MAP = {
    "base": "Systran/faster-whisper-base",
    "small": "Systran/faster-whisper-small",
    "medium": "Systran/faster-whisper-medium",
    "large": "Systran/faster-whisper-large-v3",
    "turbo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
}
SUPPORTED_TTS_MODELS = {"kokoro"}
MODEL_SIZES_BYTES = {
    "base": 281 * 1024 * 1024,
    "small": 922 * 1024 * 1024,
    "medium": 1500 * 1024 * 1024,
    "large": 3000 * 1024 * 1024,
    "turbo": 1600 * 1024 * 1024,
    "kokoro": 82 * 1024 * 1024,
}

active_downloads = set()
download_errors = {}


def check_model_downloaded(key: str) -> bool:
    if key == "kokoro":
        return (models_dir / "kokoro-en-v0_19" / "model.onnx").exists()
    folder_name = MODEL_FOLDER_MAP.get(key)
    if not folder_name:
        return False
    snapshots = models_dir / folder_name / "snapshots"
    return snapshots.is_dir() and any(path.is_dir() for path in snapshots.iterdir())


def _disk_progress(model_name: str) -> dict:
    folder_name = MODEL_FOLDER_MAP[model_name]
    path = models_dir / folder_name
    total = MODEL_SIZES_BYTES[model_name]
    downloaded = (
        sum(file.stat().st_size for file in path.glob("**/*") if file.is_file())
        if path.exists()
        else 0
    )
    display_total = max(total, downloaded)
    return {
        "downloaded": downloaded,
        "total": display_total,
        "percentage": min(99, int(downloaded / display_total * 100)) if display_total else 0,
        "speed": 0.0,
    }


@router.get("/engines/models/status")
def get_models_status():
    progress = {}
    active_progress = progress_manager.get_progress()
    for key in list(active_downloads):
        model_name = key.split(":", 1)[-1]
        if key in active_progress:
            task = active_progress[key]
            total = task["total"]
            progress[key] = {
                "downloaded": task["downloaded"],
                "total": total,
                "percentage": min(99, int(task["downloaded"] / total * 100)) if total else 5,
                "speed": task["speed"],
            }
        elif model_name in MODEL_FOLDER_MAP:
            progress[key] = _disk_progress(model_name)

    return {
        "asr": {name: check_model_downloaded(name) for name in ASR_REPO_MAP},
        "tts": {name: check_model_downloaded(name) for name in SUPPORTED_TTS_MODELS},
        "downloading": list(active_downloads),
        "progress": progress,
        "errors": download_errors,
        "current_models_dir": str(models_dir),
    }


@router.post("/engines/models/download")
def download_model(payload: DownloadPayload):
    if payload.model_type == "asr" and payload.model_name not in ASR_REPO_MAP:
        raise HTTPException(status_code=400, detail="Unsupported ASR model")
    if payload.model_type == "tts" and payload.model_name not in SUPPORTED_TTS_MODELS:
        raise HTTPException(status_code=400, detail="This TTS model is not available")
    if payload.model_type not in {"asr", "tts"}:
        raise HTTPException(status_code=400, detail="Invalid model type")

    key = f"{payload.model_type}:{payload.model_name}"
    if key in active_downloads:
        return {"status": "downloading", "message": "Model is already downloading"}

    active_downloads.add(key)
    download_errors.pop(key, None)

    def run_download():
        thread_local.active_model_key = key
        try:
            from huggingface_hub import snapshot_download

            if payload.model_type == "asr":
                snapshot_download(
                    ASR_REPO_MAP[payload.model_name],
                    cache_dir=str(models_dir),
                    allow_patterns=[
                        "config.json",
                        "preprocessor_config.json",
                        "model.bin",
                        "tokenizer.json",
                        "vocabulary.*",
                    ],
                    tqdm_class=PatchedTqdm,
                    local_files_only=False,
                )
            else:
                snapshot_download(
                    repo_id="csukuangfj/kokoro-en-v0_19",
                    local_dir=str(models_dir / "kokoro-en-v0_19"),
                    allow_patterns=["*.onnx", "*.txt", "espeak-ng-data/*"],
                    tqdm_class=PatchedTqdm,
                )
        except Exception as exc:
            download_errors[key] = str(exc)
        finally:
            progress_manager.complete_task(key)
            active_downloads.discard(key)
            thread_local.__dict__.pop("active_model_key", None)

    threading.Thread(target=run_download, daemon=True).start()
    return {"status": "started", "message": f"Model {payload.model_name} download started"}


@router.post("/engines/models/delete")
def delete_model(payload: DownloadPayload):
    if payload.model_type == "asr":
        valid_model = payload.model_name in ASR_REPO_MAP
    elif payload.model_type == "tts":
        valid_model = payload.model_name in SUPPORTED_TTS_MODELS
    else:
        valid_model = False
    if not valid_model:
        raise HTTPException(status_code=400, detail="Invalid model name")

    path = models_dir / MODEL_FOLDER_MAP[payload.model_name]
    if not path.exists():
        return {"status": "success", "message": "Model folder does not exist"}
    try:
        import shutil
        shutil.rmtree(path)
    except OSError as exc:
        raise HTTPException(status_code=500, detail=f"Failed to remove model: {exc}") from exc
    return {"status": "success", "message": f"Model {payload.model_name} removed successfully"}


@router.post("/settings/models-dir")
def change_models_dir(payload: SettingsPayload):
    try:
        update_models_dir(payload.models_dir)
        return {"status": "success", "models_dir": str(models_dir)}
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
