import gc
import logging
import threading
from pathlib import Path

from engines.base_asr import ASRBackend, EngineError

logger = logging.getLogger(__name__)

ASR_REPOSITORIES = {
    "tiny": "Systran/faster-whisper-tiny",
    "base": "Systran/faster-whisper-base",
    "small": "Systran/faster-whisper-small",
    "medium": "Systran/faster-whisper-medium",
    "large": "Systran/faster-whisper-large-v3",
    "large-v3": "Systran/faster-whisper-large-v3",
    "turbo": "mobiuslabsgmbh/faster-whisper-large-v3-turbo",
}

MODEL_FOLDERS = {
    "tiny": "models--Systran--faster-whisper-tiny",
    "base": "models--Systran--faster-whisper-base",
    "small": "models--Systran--faster-whisper-small",
    "medium": "models--Systran--faster-whisper-medium",
    "large": "models--Systran--faster-whisper-large-v3",
    "large-v3": "models--Systran--faster-whisper-large-v3",
    "turbo": "models--mobiuslabsgmbh--faster-whisper-large-v3-turbo",
}


class FasterWhisperASR(ASRBackend):
    def __init__(self, models_dir: str):
        self.models_dir = Path(models_dir)
        self._current_size = None
        self._current_device = None
        self._current_compute_type = None
        self._model = None
        self._model_lock = threading.RLock()

    @property
    def current_device(self) -> str | None:
        return self._current_device

    @property
    def current_compute_type(self) -> str | None:
        return self._current_compute_type

    def _get_local_model_path(self, model_size: str) -> str | None:
        folder_name = MODEL_FOLDERS.get(model_size)
        if not folder_name:
            return None

        snapshots_dir = self.models_dir / folder_name / "snapshots"
        if not snapshots_dir.is_dir():
            return None

        snapshots = sorted(path for path in snapshots_dir.iterdir() if path.is_dir())
        return str(snapshots[0]) if snapshots else None

    def loaded(self) -> dict:
        with self._model_lock:
            return {
                "loaded": self._model is not None,
                "model_size": self._current_size if self._model is not None else None,
                "device": self._current_device,
                "compute_type": self._current_compute_type,
            }

    def unload(self) -> bool:
        with self._model_lock:
            was_loaded = self._model is not None
            if was_loaded:
                logger.info("Unloading Whisper model %s", self._current_size)
            self._model = None
            self._current_size = None
            self._current_device = None
            self._current_compute_type = None
            gc.collect()
            return was_loaded


    def load(self, model_size: str):
        with self._model_lock:
            if self._model is not None and self._current_size == model_size:
                return self._model

            local_path = self._get_local_model_path(model_size)
            if local_path is None:
                if model_size not in ASR_REPOSITORIES:
                    raise EngineError(f"Unsupported Whisper model: {model_size}")
                raise EngineError(
                    f"Model is not downloaded: {model_size}. "
                    "Download it before loading or transcribing."
                )

            if self._model is not None:
                self.unload()

            try:
                from faster_whisper import WhisperModel
            except ImportError as exc:
                raise EngineError("faster-whisper is not installed.") from exc

            try:
                import torch
                device = "cuda" if torch.cuda.is_available() else "cpu"
                compute_type = "float16" if device == "cuda" else "int8"
            except ImportError:
                device = "cpu"
                compute_type = "int8"

            logger.info(
                "Loading local Whisper model %s from %s on %s (%s)",
                model_size,
                local_path,
                device,
                compute_type,
            )
            try:
                model = WhisperModel(
                    local_path,
                    device=device,
                    compute_type=compute_type,
                    download_root=str(self.models_dir),
                    cpu_threads=4,
                )
            except Exception as exc:
                raise EngineError(f"Failed to load Whisper model {model_size}: {exc}") from exc

            self._model = model
            self._current_size = model_size
            self._current_device = device
            self._current_compute_type = compute_type
            return model

    def _ensure_model(self, model_size: str):
        return self.load(model_size)

    def transcribe(self, audio_path: str, language: str = None, model_size: str = "base") -> dict:
        model = self._ensure_model(model_size)
        lang_arg = None if not language or language == "auto" else language
        try:
            segments_gen, _info = model.transcribe(
                audio_path,
                language=lang_arg,
                beam_size=5,
                word_timestamps=False,
            )
        except Exception as exc:
            raise EngineError(f"Transcription failed: {exc}") from exc

        segments = []
        texts = []
        for segment in segments_gen:
            text = segment.text.strip()
            segments.append({"start": segment.start, "end": segment.end, "text": text})
            texts.append(text)

        return {"text": " ".join(texts), "segments": segments}
