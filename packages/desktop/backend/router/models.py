import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
from config import models_dir, update_models_dir

router = APIRouter()

class DownloadPayload(BaseModel):
    model_type: str  # "asr" or "tts"
    model_name: str  # "base", "small", "medium", "large", "turbo", or "kokoro"

class SettingsPayload(BaseModel):
    models_dir: str

def check_asr_model(size: str) -> bool:
    hf_name = size
    if size == "large":
        hf_name = "large-v3"
    elif size == "turbo":
        hf_name = "large-v3-turbo"
    model_folder = f"models--Systran--faster-whisper-{hf_name}"
    path = models_dir / "faster-whisper" / model_folder
    if path.exists():
        snapshots = path / "snapshots"
        if snapshots.exists() and any(snapshots.iterdir()):
            return True
    return False

def check_tts_model() -> bool:
    path = models_dir / "kokoro-en-v0_19" / "model.onnx"
    return path.exists()

@router.get("/engines/models/status")
def get_models_status():
    return {
        "asr": {
            "base": check_asr_model("base"),
            "small": check_asr_model("small"),
            "medium": check_asr_model("medium"),
            "large": check_asr_model("large"),
            "turbo": check_asr_model("turbo")
        },
        "tts": {
            "kokoro": check_tts_model()
        },
        "current_models_dir": str(models_dir)
    }

@router.post("/engines/models/download")
def download_model(payload: DownloadPayload):
    try:
        if payload.model_type == "asr":
            from router.asr import asr_engine
            asr_engine._ensure_model(payload.model_name)
        elif payload.model_type == "tts":
            from router.tts import tts_engine
            tts_engine._ensure_model()
        else:
            raise HTTPException(status_code=400, detail="Invalid model type")
        return {"status": "success", "message": f"Model {payload.model_name} downloaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/settings/models-dir")
def change_models_dir(payload: SettingsPayload):
    try:
        update_models_dir(payload.models_dir)
        return {"status": "success", "models_dir": str(models_dir)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
