import os
import threading
import time
import json
import tqdm
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from pathlib import Path
from config import models_dir, update_models_dir

router = APIRouter()

class DownloadPayload(BaseModel):
    model_type: str  # "asr" or "tts"
    model_name: str  # e.g., "base", "small", "qwen_1_7b", etc.

class SettingsPayload(BaseModel):
    models_dir: str

# Thread-local storage to track which model download task is running in which thread
thread_local = threading.local()

# Process-global thread-safe ProgressManager
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
                "last_update": time.time()
            }

    def update_task(self, task_id, downloaded_bytes, speed=None):
        with self._lock:
            if task_id in self.active_tasks:
                task = self.active_tasks[task_id]
                task["downloaded"] = downloaded_bytes
                task["last_update"] = time.time()
                if speed is not None:
                    try:
                        task["speed"] = float(speed)
                    except (ValueError, TypeError):
                        pass
                else:
                    elapsed = time.time() - task["start_time"]
                    if elapsed > 0:
                        task["speed"] = downloaded_bytes / elapsed

    def complete_task(self, task_id):
        with self._lock:
            if task_id in self.active_tasks:
                del self.active_tasks[task_id]

    def get_progress(self):
        with self._lock:
            return dict(self.active_tasks)

progress_manager = ProgressManager()

# Monkeypatch tqdm.tqdm to capture progress bar updates dynamically
original_tqdm = tqdm.tqdm

class PatchedTqdm(original_tqdm):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._model_key = getattr(thread_local, "active_model_key", None)
        if self._model_key:
            progress_manager.start_task(
                self._model_key,
                total_bytes=self.total or 0,
                desc=kwargs.get("desc", "Downloading")
            )

    def update(self, n=1):
        super().update(n)
        if hasattr(self, "_model_key") and self._model_key:
            rate = self.format_dict.get("rate")
            progress_manager.update_task(
                self._model_key,
                downloaded_bytes=self.n,
                speed=rate
            )

    def close(self):
        super().close()
        if hasattr(self, "_model_key") and self._model_key:
            progress_manager.complete_task(self._model_key)

tqdm.tqdm = PatchedTqdm

# HuggingFace Cache Folder Map for ASR and TTS models
MODEL_FOLDER_MAP = {
    # ASR Models
    "base": "models--openai--whisper-base",
    "small": "models--openai--whisper-small",
    "medium": "models--openai--whisper-medium",
    "large": "models--openai--whisper-large-v3",
    "turbo": "models--openai--whisper-large-v3-turbo",
    
    # TTS Models
    "kokoro": "kokoro-en-v0_19",
    "qwen_1_7b": "models--Qwen--Qwen3-TTS-12Hz-1.7B-Base",
    "qwen_0_6b": "models--Qwen--Qwen3-TTS-12Hz-0.6B-Base",
    "qwen_custom_1_7b": "models--Qwen--Qwen3-TTS-12Hz-1.7B-CustomVoice",
    "qwen_custom_0_6b": "models--Qwen--Qwen3-TTS-12Hz-0.6B-CustomVoice",
    "luxtts": "models--YatharthS--LuxTTS",
    "chatterbox_tts": "models--ResembleAI--chatterbox",
    "chatterbox_turbo": "models--ResembleAI--chatterbox-turbo",
    "tada_1b": "models--Qwen--Qwen3-0.6B",
    "tada_3b": "models--Qwen--Qwen3-1.7B"
}

# Expected model sizes in bytes
MODEL_SIZES_BYTES = {
    "base": 281 * 1024 * 1024,
    "small": 922 * 1024 * 1024,
    "medium": 1500 * 1024 * 1024,
    "large": 3000 * 1024 * 1024,
    "turbo": 1600 * 1024 * 1024,
    "kokoro": 82 * 1024 * 1024,
    "qwen_1_7b": 3400 * 1024 * 1024,
    "qwen_0_6b": 1200 * 1024 * 1024,
    "qwen_custom_1_7b": 3400 * 1024 * 1024,
    "qwen_custom_0_6b": 1200 * 1024 * 1024,
    "luxtts": 45 * 1024 * 1024,
    "chatterbox_tts": 350 * 1024 * 1024,
    "chatterbox_turbo": 180 * 1024 * 1024,
    "tada_1b": 2000 * 1024 * 1024,
    "tada_3b": 6000 * 1024 * 1024
}

# Tracking active background downloads
active_downloads = set()
download_errors = {}

def check_model_downloaded(key: str) -> bool:
    if key == "kokoro":
        path = models_dir / "kokoro-en-v0_19" / "model.onnx"
        return path.exists()
        
    folder_name = MODEL_FOLDER_MAP.get(key)
    if not folder_name:
        return False
    path = models_dir / folder_name
    if path.exists():
        snapshots = path / "snapshots"
        if snapshots.exists():
            dirs = [p for p in snapshots.iterdir() if p.is_dir()]
            if dirs:
                return True
    return False

@router.get("/engines/models/status")
def get_models_status():
    progress = {}
    active_progress = progress_manager.get_progress()
    for key in list(active_downloads):
        parts = key.split(":")
        if len(parts) == 2:
            m_type, m_name = parts
            
            # Check ProgressManager first (highest fidelity real-time tqdm statistics)
            if key in active_progress:
                progress[key] = {
                    "downloaded": active_progress[key]["downloaded"],
                    "total": active_progress[key]["total"],
                    "percentage": int((active_progress[key]["downloaded"] / active_progress[key]["total"] * 100)) if active_progress[key]["total"] > 0 else 5,
                    "speed": active_progress[key]["speed"]
                }
            else:
                # Fallback to checking disk space folder sizes
                folder_name = MODEL_FOLDER_MAP.get(m_name)
                if folder_name:
                    path = models_dir / folder_name
                    total = MODEL_SIZES_BYTES.get(m_name, 100 * 1024 * 1024)
                    if path.exists():
                        downloaded = sum(f.stat().st_size for f in path.glob('**/*') if f.is_file())
                        if downloaded > total:
                            total = downloaded
                        pct = int((downloaded / total) * 100) if total > 0 else 0
                        progress[key] = {
                            "downloaded": downloaded,
                            "total": total,
                            "percentage": pct,
                            "speed": 0.0
                        }
                    else:
                        progress[key] = {
                            "downloaded": 0,
                            "total": total,
                            "percentage": 5,
                            "speed": 0.0
                        }

    return {
        "asr": {
            "base": check_model_downloaded("base"),
            "small": check_model_downloaded("small"),
            "medium": check_model_downloaded("medium"),
            "large": check_model_downloaded("large"),
            "turbo": check_model_downloaded("turbo")
        },
        "tts": {
            "qwen_1_7b": check_model_downloaded("qwen_1_7b"),
            "qwen_0_6b": check_model_downloaded("qwen_0_6b"),
            "qwen_custom_1_7b": check_model_downloaded("qwen_custom_1_7b"),
            "qwen_custom_0_6b": check_model_downloaded("qwen_custom_0_6b"),
            "luxtts": check_model_downloaded("luxtts"),
            "chatterbox_tts": check_model_downloaded("chatterbox_tts"),
            "chatterbox_turbo": check_model_downloaded("chatterbox_turbo"),
            "tada_1b": check_model_downloaded("tada_1b"),
            "tada_3b": check_model_downloaded("tada_3b"),
            "kokoro": check_model_downloaded("kokoro")
        },
        "downloading": list(active_downloads),
        "progress": progress,
        "errors": download_errors,
        "current_models_dir": str(models_dir)
    }

@router.get("/models/progress")
def get_models_progress_stream():
    async def event_generator():
        while True:
            # Send latest progress tracking packet
            active_progress = progress_manager.get_progress()
            
            # Format and format progress maps
            progress_packet = {}
            for key, val in active_progress.items():
                pct = int((val["downloaded"] / val["total"] * 100)) if val["total"] > 0 else 5
                progress_packet[key] = {
                    "downloaded": val["downloaded"],
                    "total": val["total"],
                    "percentage": pct,
                    "speed": val["speed"]
                }
            
            yield f"data: {json.dumps(progress_packet)}\n\n"
            # Stream updates every second
            import asyncio
            await asyncio.sleep(1.0)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/engines/models/download")
def download_model(payload: DownloadPayload):
    key = f"{payload.model_type}:{payload.model_name}"
    if key in active_downloads:
        return {"status": "downloading", "message": "Model is already downloading"}
        
    active_downloads.add(key)
    download_errors.pop(key, None)
    
    def run_download():
        thread_local.active_model_key = key
        try:
            if payload.model_type == "asr":
                repo_size = payload.model_name
                if payload.model_name == "large":
                    repo_size = "large-v3"
                elif payload.model_name == "turbo":
                    repo_size = "large-v3-turbo"
                
                from faster_whisper.utils import download_model as fw_download_model
                fw_download_model(
                    repo_size,
                    cache_dir=str(models_dir),
                    local_files_only=False
                )
            elif payload.model_type == "tts":
                if payload.model_name == "kokoro":
                    from huggingface_hub import snapshot_download
                    model_path = models_dir / "kokoro-en-v0_19"
                    snapshot_download(
                        repo_id="csukuangfj/kokoro-en-v0_19",
                        local_dir=str(model_path),
                        allow_patterns=["*.onnx", "*.txt", "espeak-ng-data/*"]
                    )
                else:
                    # Simulated download progress for demo models
                    total_mock = MODEL_SIZES_BYTES.get(payload.model_name, 100 * 1024 * 1024)
                    progress_manager.start_task(key, total_bytes=total_mock, desc=f"Downloading {payload.model_name}")
                    for step in range(1, 11):
                        time.sleep(0.5)
                        downloaded = int(total_mock * (step / 10))
                        progress_manager.update_task(key, downloaded_bytes=downloaded, speed=total_mock / 5.0)
                    
                    folder_name = MODEL_FOLDER_MAP.get(payload.model_name)
                    if folder_name:
                        snap_dir = models_dir / folder_name / "snapshots" / "mock_commit_hash"
                        snap_dir.mkdir(parents=True, exist_ok=True)
                        with open(snap_dir / "model.onnx", "w") as f:
                            f.write("mock_model_data")
                    progress_manager.complete_task(key)
            else:
                raise ValueError("Invalid model type")
        except Exception as e:
            download_errors[key] = str(e)
            progress_manager.complete_task(key)
        finally:
            if key in active_downloads:
                active_downloads.remove(key)
            
    thread = threading.Thread(target=run_download, daemon=True)
    thread.start()
    
    return {"status": "started", "message": f"Model {payload.model_name} download started in background"}

@router.post("/engines/models/delete")
def delete_model(payload: DownloadPayload):
    folder_name = MODEL_FOLDER_MAP.get(payload.model_name)
    if not folder_name:
        raise HTTPException(status_code=400, detail="Invalid model name")
        
    path = models_dir / folder_name
    if not path.exists():
        return {"status": "success", "message": "Model folder does not exist"}
        
    try:
        import shutil
        shutil.rmtree(path)
        return {"status": "success", "message": f"Model {payload.model_name} removed successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove model: {e}")

class MigratePayload(BaseModel):
    destination: str

# Process-global migration progress tracker
class MigrationProgress:
    def __init__(self):
        self._lock = threading.Lock()
        self.state = {
            "status": "idle",  # "idle" | "checking" | "migrating" | "completed" | "failed"
            "copied": 0,
            "total": 0,
            "percentage": 0,
            "error": None,
            "same_fs": True
        }

    def start(self, total=0, same_fs=True):
        with self._lock:
            self.state = {
                "status": "migrating",
                "copied": 0,
                "total": total,
                "percentage": 0,
                "error": None,
                "same_fs": same_fs
            }

    def update(self, copied, total=None):
        with self._lock:
            self.state["copied"] = copied
            if total is not None:
                self.state["total"] = total
            if self.state["total"] > 0:
                self.state["percentage"] = min(100, int((self.state["copied"] / self.state["total"]) * 100))
            else:
                self.state["percentage"] = 0

    def fail(self, err_msg):
        with self._lock:
            self.state["status"] = "failed"
            self.state["error"] = err_msg

    def complete(self):
        with self._lock:
            self.state["status"] = "completed"
            self.state["percentage"] = 100

    def get_state(self):
        with self._lock:
            return dict(self.state)

migration_progress = MigrationProgress()

def _copy_folder_with_progress(src: Path, dst: Path, base_copied: int, total_bytes: int, on_progress):
    dst.mkdir(parents=True, exist_ok=True)
    current_copied = base_copied
    
    for dirpath, dirnames, filenames in os.walk(src):
        rel_dir = os.path.relpath(dirpath, src)
        if rel_dir == ".":
            target_dir = dst
        else:
            target_dir = dst / rel_dir
            target_dir.mkdir(parents=True, exist_ok=True)
            
        for filename in filenames:
            src_file = Path(dirpath) / filename
            dst_file = target_dir / filename
            
            with open(src_file, 'rb') as fsrc:
                with open(dst_file, 'wb') as fdst:
                    while True:
                        buf = fsrc.read(1024 * 1024)
                        if not buf:
                            break
                        fdst.write(buf)
                        current_copied += len(buf)
                        on_progress(current_copied, total_bytes)

@router.post("/models/migrate")
def migrate_models(payload: MigratePayload):
    import shutil
    from config import DEFAULT_MODELS_DIR
    src_dir = models_dir.resolve()
    
    if payload.destination == "DEFAULT":
        dest_dir = DEFAULT_MODELS_DIR.resolve()
    else:
        dest_dir = Path(os.path.abspath(payload.destination)).resolve()
    
    # Sanity checks
    if not src_dir.exists():
        raise HTTPException(status_code=400, detail="Source directory does not exist")
        
    if src_dir == dest_dir:
        raise HTTPException(status_code=400, detail="Source and destination directories are identical")
        
    if src_dir in dest_dir.parents:
        raise HTTPException(status_code=400, detail="Destination directory cannot be nested inside the source directory")
        
    # File system boundary check (device IDs)
    try:
        dest_dir.parent.mkdir(parents=True, exist_ok=True)
        src_dev = src_dir.stat().st_dev
        if dest_dir.exists():
            dest_dev = dest_dir.stat().st_dev
        else:
            dest_dev = dest_dir.parent.stat().st_dev
        same_fs = (src_dev == dest_dev)
    except Exception:
        same_fs = False

    def migrate_background():
        try:
            migration_progress.start(same_fs=same_fs)
            
            # Find folders to relocate (models--* and kokoro-en-v0_19)
            items_to_move = []
            for item in src_dir.iterdir():
                if item.name in [".venv", "__pycache__", "venv"]:
                    continue
                if item.is_dir() and (item.name.startswith("models--") or item.name == "kokoro-en-v0_19"):
                    items_to_move.append(item)
                    
            if not items_to_move:
                migration_progress.complete()
                update_models_dir(str(dest_dir))
                return
                
            if same_fs:
                # Same Filesystem: instant directory metadata re-pointing
                for item in items_to_move:
                    dest_item = dest_dir / item.name
                    if dest_item.exists():
                        shutil.rmtree(dest_item)
                    shutil.move(str(item), str(dest_dir))
                migration_progress.complete()
                update_models_dir(str(dest_dir))
            else:
                # Different Filesystem: Copy with progress, then delete
                total_bytes = 0
                for item in items_to_move:
                    for dirpath, _, filenames in os.walk(item):
                        for f in filenames:
                            fp = os.path.join(dirpath, f)
                            try:
                                total_bytes += os.path.getsize(fp)
                            except OSError:
                                pass
                                
                migration_progress.update(0, total=total_bytes)
                copied_bytes = 0
                
                def on_copy_progress(copied, total):
                    migration_progress.update(copied, total=total)
                    
                for item in items_to_move:
                    dest_item = dest_dir / item.name
                    if dest_item.exists():
                        shutil.rmtree(dest_item)
                    _copy_folder_with_progress(item, dest_item, copied_bytes, total_bytes, on_copy_progress)
                    copied_bytes += sum(f.stat().st_size for f in item.glob('**/*') if f.is_file())
                    
                for item in items_to_move:
                    shutil.rmtree(item)
                    
                migration_progress.complete()
                update_models_dir(str(dest_dir))
        except Exception as e:
            migration_progress.fail(str(e))
            
    thread = threading.Thread(target=migrate_background, daemon=True)
    thread.start()
    
    return {"status": "started", "same_fs": same_fs}

@router.get("/models/migrate/progress")
def get_migration_progress_stream():
    async def event_generator():
        while True:
            state = migration_progress.get_state()
            yield f"data: {json.dumps(state)}\n\n"
            if state["status"] in ["completed", "failed"]:
                break
            import asyncio
            await asyncio.sleep(0.5)
            
    return StreamingResponse(event_generator(), media_type="text/event-stream")

@router.post("/settings/models-dir")
def change_models_dir(payload: SettingsPayload):
    try:
        update_models_dir(payload.models_dir)
        return {"status": "success", "models_dir": str(models_dir)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
