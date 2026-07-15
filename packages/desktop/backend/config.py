import os
import shutil
from pathlib import Path

DEFAULT_MODELS_DIR = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "models")))
models_dir = DEFAULT_MODELS_DIR

def update_models_dir(new_path_str: str):
    global models_dir
    new_path = Path(os.path.abspath(new_path_str))
    if new_path == models_dir:
        return
        
    # Ensure new directory exists
    new_path.mkdir(parents=True, exist_ok=True)
    
    # If old directory exists and contains files/folders, move them
    if models_dir.exists() and models_dir != new_path:
        for item in models_dir.iterdir():
            if item.name in [".venv", "__pycache__", "venv"]:
                continue
            dest_item = new_path / item.name
            try:
                if item.is_dir():
                    if dest_item.exists():
                        shutil.rmtree(dest_item)
                    shutil.move(str(item), str(new_path))
                else:
                    if dest_item.exists():
                        dest_item.unlink()
                    shutil.move(str(item), str(dest_item))
            except Exception as e:
                print(f"Error moving {item.name}: {e}")
                
    models_dir = new_path
    
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
