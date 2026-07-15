import os
import logging
import gc
from pathlib import Path
from engines.base_asr import ASRBackend, EngineError

logger = logging.getLogger(__name__)

class FasterWhisperASR(ASRBackend):
    def __init__(self, models_dir: str):
        self.models_dir = Path(models_dir)
        self._current_size = None
        self._model = None
        
    def _get_local_model_path(self, model_size: str) -> str:
        hf_name = model_size
        if model_size == "large":
            hf_name = "large-v3"
        elif model_size == "turbo":
            hf_name = "large-v3-turbo"
            
        model_folder = f"models--Systran--faster-whisper-{hf_name}"
        snapshots_dir = self.models_dir / "faster-whisper" / model_folder / "snapshots"
        if snapshots_dir.exists():
            snapshots = [p for p in snapshots_dir.iterdir() if p.is_dir()]
            if snapshots:
                return str(snapshots[0])
        return None

    def _ensure_model(self, model_size: str):
        if self._model is not None and self._current_size == model_size:
            return self._model
            
        if self._model is not None:
            logger.info(f"Unloading Whisper model {self._current_size} to release memory...")
            self._model = None
            gc.collect()

        try:
            from faster_whisper import WhisperModel
        except ImportError as exc:
            raise EngineError("faster-whisper is not installed.") from exc

        local_path = self._get_local_model_path(model_size)
        if local_path:
            logger.info(f"Loading local Whisper model from {local_path} (bypassing HF Hub latency)...")
            load_target = local_path
        else:
            repo_size = model_size
            if model_size == "large":
                repo_size = "large-v3"
            elif model_size == "turbo":
                repo_size = "large-v3-turbo"
            load_target = f"Systran/faster-whisper-{repo_size}"
            logger.info(f"Downloading and loading Whisper model {model_size} from HuggingFace Hub...")

        try:
            self._model = WhisperModel(
                load_target,
                device="cpu",
                compute_type="int8",
                download_root=str(self.models_dir / "faster-whisper"),
                cpu_threads=4
            )
            self._current_size = model_size
            return self._model
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
