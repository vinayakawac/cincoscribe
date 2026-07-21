import os
import shutil
from pathlib import Path

# Primary env var: CINCOSCRIBE_MODELS_DIR
# Fallback: legacy VOICEBOX_MODELS_DIR, then default path alongside .models
_env_dir = (
    os.environ.get("CINCOSCRIBE_MODELS_DIR")
    or os.environ.get("VOICEBOX_MODELS_DIR")
)
if _env_dir:
    DEFAULT_MODELS_DIR = Path(os.path.abspath(_env_dir))
else:
    DEFAULT_MODELS_DIR = Path(
        os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "..", "..", ".models")
        )
    )

models_dir = DEFAULT_MODELS_DIR

# On startup, override HF_HUB_CACHE so huggingface_hub stores files here
os.environ["HF_HUB_CACHE"] = str(models_dir)


import threading

def update_models_dir(new_path_str: str) -> None:
    global models_dir
    new_path = Path(os.path.abspath(new_path_str))
    if new_path == models_dir:
        return

    old_path = models_dir
    models_dir = new_path
    os.environ["HF_HUB_CACHE"] = str(models_dir)
    os.environ["CINCOSCRIBE_MODELS_DIR"] = str(models_dir)
    os.environ["VOICEBOX_MODELS_DIR"] = str(models_dir)

    try:
        from router.asr import asr_engine
        asr_engine.models_dir = models_dir
    except ImportError:
        pass

    try:
        from router.tts import tts_engine
        tts_engine.models_dir = models_dir
        tts_engine.model_path = models_dir / "kokoro-en-v0_19"
    except ImportError:
        pass

    def _migrate():
        new_path.mkdir(parents=True, exist_ok=True)
        if old_path.exists() and old_path != new_path:
            for item in old_path.iterdir():
                if item.name in {".venv", "__pycache__", "venv"}:
                    continue
                dest_item = new_path / item.name
                try:
                    if item.is_dir():
                        if dest_item.exists():
                            shutil.rmtree(dest_item)
                        shutil.move(str(item), str(dest_item))
                    else:
                        if dest_item.exists():
                            dest_item.unlink()
                        shutil.move(str(item), str(dest_item))
                except Exception as e:
                    print(f"Error moving {item.name}: {e}")

        try:
            from model_registry import registry
            registry.scan_disk(models_dir)
        except Exception:
            pass

    threading.Thread(target=_migrate, daemon=True).start()
