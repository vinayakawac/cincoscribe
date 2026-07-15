import os
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field
from engines.sherpa_tts import SherpaTTS
from engines.base_tts import EngineError
from config import models_dir

router = APIRouter()

tts_engine = SherpaTTS(models_dir)

class TTSPayload(BaseModel):
    text: str = Field(..., max_length=2000)
    voice: str = Field("default")
    speed: float = Field(1.0, ge=0.5, le=2.0)

@router.get("/engines/tts")
def get_tts_engines():
    return {"engines": ["sherpa-onnx"]}

@router.post("/tts")
def tts_generate(payload: TTSPayload):
    try:
        audio_bytes = tts_engine.generate(payload.text, payload.voice)
    except EngineError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS failed: {e}")

    return Response(
        content=audio_bytes,
        media_type="audio/wav"
    )
