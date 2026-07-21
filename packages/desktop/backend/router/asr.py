import asyncio
import os
import tempfile

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from config import models_dir
from engines.base_asr import EngineError
from engines.faster_whisper import FasterWhisperASR

router = APIRouter()
asr_engine = FasterWhisperASR(models_dir)


class ASRPayload(BaseModel):
    audio_path: str
    language: str = "auto"
    model_size: str = "base"


class ASRLoadPayload(BaseModel):
    model_size: str = "base"


@router.get("/engines/asr")
def get_asr_engines():
    return {"engines": ["faster-whisper"]}


@router.post("/engines/asr/load")
def load_asr_model(payload: ASRLoadPayload):
    try:
        asr_engine.load(payload.model_size)
        return asr_engine.loaded()
    except EngineError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/engines/asr/unload")
def unload_asr_model():
    return {"loaded": False, "unloaded": asr_engine.unload()}


@router.get("/engines/asr/loaded")
def get_loaded_asr_model():
    return asr_engine.loaded()


@router.post("/transcribe")
async def asr_transcribe(payload: ASRPayload):
    if not os.path.exists(payload.audio_path):
        raise HTTPException(status_code=400, detail="File not found")

    try:
        return await asyncio.to_thread(
            asr_engine.transcribe,
            payload.audio_path,
            payload.language,
            payload.model_size,
        )
    except EngineError as exc:
        status_code = 400 if "not downloaded" in str(exc) else 500
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ASR failed: {exc}") from exc


@router.post("/transcribe/upload")
async def asr_transcribe_upload(
    file: UploadFile = File(...),
    language: str = Form("auto"),
    model_size: str = Form("base"),
):
    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        return await asyncio.to_thread(
            asr_engine.transcribe,
            tmp_path,
            language,
            model_size,
        )
    except EngineError as exc:
        status_code = 400 if "not downloaded" in str(exc) else 500
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"ASR failed: {exc}") from exc
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass
