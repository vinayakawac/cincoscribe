import asyncio
import inspect
import io
import logging
import os
import wave
from typing import Optional

import numpy as np
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel, Field

from backends import get_tts_backend_for_engine
from config import models_dir
from engines.base_tts import EngineError
from engines.sherpa_tts import SherpaTTS

logger = logging.getLogger(__name__)

router = APIRouter()

tts_engine = SherpaTTS(models_dir)


class TTSPayload(BaseModel):
    text: str = Field(..., max_length=2000)
    voice: str = Field(...)
    speed: float = Field(1.0, ge=0.5, le=2.0)
    model_size: Optional[str] = None
    model_id: Optional[str] = None
    voice_prompt: Optional[dict] = None


@router.get("/engines/tts")
def get_tts_engines():
    return {"engines": ["sherpa-onnx", "chatterbox"]}


@router.post("/tts")
async def tts_generate(payload: TTSPayload):
    target_model = (payload.model_id or payload.model_size or "kokoro").lower()

    # Route generation to active loaded backend if present
    try:
        backend = get_tts_backend_for_engine(target_model)
        if backend and hasattr(backend, "is_loaded") and backend.is_loaded():
            gen_fn = backend.generate
            if inspect.iscoroutinefunction(gen_fn):
                res = await gen_fn(
                    text=payload.text,
                    voice=payload.voice,
                    speed=payload.speed,
                    voice_prompt=payload.voice_prompt,
                )
            else:
                res = gen_fn(
                    text=payload.text,
                    voice=payload.voice,
                    speed=payload.speed,
                    voice_prompt=payload.voice_prompt,
                )

            if isinstance(res, tuple) and len(res) == 2:
                audio_array, sample_rate = res
                pcm16 = (np.asarray(audio_array) * 32767).clip(-32768, 32767).astype(np.int16)
                buf = io.BytesIO()
                with wave.open(buf, "wb") as wf:
                    wf.setnchannels(1)
                    wf.setsampwidth(2)
                    wf.setframerate(sample_rate)
                    wf.writeframes(pcm16.tobytes())
                return Response(content=buf.getvalue(), media_type="audio/wav")
            elif isinstance(res, (bytes, bytearray)):
                return Response(content=res, media_type="audio/wav")
    except Exception as e:
        logger.warning("[TTS Router] Active backend '%s' failed: %s", target_model, e)
        if payload.model_id or payload.model_size:
            raise HTTPException(status_code=500, detail=f"Synthesis failed for '{target_model}': {e}") from e

    # Fallback to default SherpaTTS engine
    try:
        audio_bytes = await asyncio.to_thread(
            tts_engine.generate,
            payload.text,
            payload.voice,
            payload.speed,
            payload.voice_prompt,
        )
    except EngineError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except TypeError:
        audio_bytes = await asyncio.to_thread(
            tts_engine.generate,
            payload.text,
            payload.voice,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS synthesis failed: {e}")

    return Response(
        content=audio_bytes,
        media_type="audio/wav",
    )
