import os
import logging
from pathlib import Path
from engines.base_asr import ASRBackend, EngineError

logger = logging.getLogger(__name__)

class FasterWhisperASR(ASRBackend):
    def __init__(self, models_dir: str):
        self.models_dir = Path(models_dir)
        self._models = {}
        
    def _ensure_model(self, model_size: str):
        if model_size in self._models:
            return self._models[model_size]
            
        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise EngineError("faster-whisper is not installed.") from exc

        repo_size = model_size
        if model_size == "large":
            repo_size = "large-v3"
        elif model_size == "turbo":
            repo_size = "large-v3-turbo"

        logger.info(f"Loading Faster-Whisper {model_size} model (CPU)...")
        try:
            model = WhisperModel(
                repo_size,
                device="cpu",
                compute_type="int8",
                download_root=str(self.models_dir / "faster-whisper")
            )
            self._models[model_size] = model
            return model
        except Exception as exc:
            raise EngineError(f"Failed to load Whisper model {model_size}: {exc}")

    def transcribe(self, audio_path: str, language: str = None, model_size: str = "base") -> dict:
        model = self._ensure_model(model_size)
        
        lang_arg = None if not language or language == "auto" else language
        try:
            segments_gen, info = model.transcribe(
                audio_path,
                language=lang_arg,
                beam_size=5,
                word_timestamps=False,
            )
        except Exception as exc:
            raise EngineError(f"Transcription failed: {exc}")
            
        segments = []
        texts = []
        for seg in segments_gen:
            segments.append({"start": seg.start, "end": seg.end, "text": seg.text.strip()})
            texts.append(seg.text.strip())
            
        return {
            "text": " ".join(texts),
            "segments": segments
        }
