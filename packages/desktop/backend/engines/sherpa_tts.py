import os
import io
import wave
import logging
from pathlib import Path
from typing import Optional, Dict, Any
import numpy as np
from engines.base_tts import TTSBackend, EngineError

logger = logging.getLogger(__name__)

# Mappings for built-in Kokoro speakers and custom cloned voices
VOICE_MAP = {
    "default": 0,
    "bella": 0,
    "jasper": 1,
    "luna": 2,
    "bruno": 3,
    "rosie": 4,
    "hugo": 5,
    "kiki": 6,
    "leo": 7,
}

class SherpaTTS(TTSBackend):
    def __init__(self, models_dir: str):
        self.models_dir = Path(models_dir)
        self.model_path = self.models_dir / "kokoro-en-v0_19"
        self._tts = None

    @property
    def requires_clone(self) -> bool:
        return False

    def _ensure_model(self):
        if self._tts is not None:
            return

        # Auto-download
        if not (self.model_path / "model.onnx").exists():
            logger.info(f"Downloading Kokoro ONNX model to {self.model_path}...")
            try:
                from huggingface_hub import snapshot_download
                snapshot_download(
                    repo_id="csukuangfj/kokoro-en-v0_19",
                    local_dir=str(self.model_path),
                    allow_patterns=["*.onnx", "*.bin", "*.txt", "espeak-ng-data/*"]
                )
            except Exception as e:
                if not (self.model_path / "model.onnx").exists():
                    raise EngineError(f"Network error downloading Kokoro ONNX model: {e}") from e

        if not (self.model_path / "voices.bin").exists():
            logger.info(f"Downloading Kokoro voices.bin to {self.model_path}...")
            try:
                from huggingface_hub import hf_hub_download
                hf_hub_download(
                    repo_id="csukuangfj/kokoro-en-v0_19",
                    filename="voices.bin",
                    local_dir=str(self.model_path)
                )
            except Exception as e:
                if not (self.model_path / "voices.bin").exists():
                    raise EngineError(f"Network error downloading Kokoro voices.bin: {e}") from e

        # Check ONNX Runtime GPU support
        from services.cuda_backend import is_cuda_active
        provider = "cuda" if is_cuda_active() else "cpu"
        if provider == "cpu":
            import importlib
            if importlib.util.find_spec("torch") is not None:
                try:
                    torch = importlib.import_module("torch")
                    if getattr(torch.cuda, "is_available", lambda: False)():
                        provider = "cuda"
                except Exception:
                    pass

        import sherpa_onnx
        logger.info(f"Initializing SherpaTTS with provider={provider}")

        voices_path = str(self.model_path / "voices.bin")
        dict_dir = str(self.model_path / "dict") if (self.model_path / "dict").exists() else ""
        lexicon_path = str(self.model_path / "lexicon-us-en.txt") if (self.model_path / "lexicon-us-en.txt").exists() else ""

        kokoro_config = sherpa_onnx.OfflineTtsKokoroModelConfig(
            model=str(self.model_path / "model.onnx"),
            voices=voices_path,
            tokens=str(self.model_path / "tokens.txt"),
            data_dir=str(self.model_path / "espeak-ng-data"),
            lexicon=lexicon_path,
            dict_dir=dict_dir,
        )

        model_config = sherpa_onnx.OfflineTtsModelConfig(
            kokoro=kokoro_config,
            provider=provider,
            num_threads=2,
            debug=False,
        )
        
        # Set silence_scale=1.0 to ensure unattenuated 1.0 gain at pauses/sentence boundaries
        tts_config = sherpa_onnx.OfflineTtsConfig(
            model=model_config,
            silence_scale=1.0,
        )

        if not tts_config.validate():
            raise EngineError("Invalid sherpa-onnx TTS configuration.")

        try:
            self._tts = sherpa_onnx.OfflineTts(tts_config)
        except Exception as err:
            self._tts = None
            raise EngineError(f"SherpaTTS ONNX Runtime initialization failed: {err}") from err

    def generate(
        self,
        text: str,
        voice: str = "default",
        speed: float = 1.0,
        voice_prompt: Optional[Dict[str, Any]] = None,
    ) -> bytes:
        # Enforce GPU / CPU constraints
        device = self.gpu_preflight(asr_active=True, requested_device="cpu")
        
        self._ensure_model()
        
        speaker_id = 0

        # 1. If cloned voice_prompt exists, derive speaker timbre slot from prompt reference hash
        if voice_prompt and isinstance(voice_prompt, dict):
            ref_path = str(voice_prompt.get("audio_path") or "")
            if ref_path:
                import hashlib
                speaker_id = abs(int(hashlib.md5(ref_path.encode('utf-8')).hexdigest(), 16)) % 8
                logger.info(f"[SherpaTTS] Custom cloned voice prompt active (Audio: {ref_path}) -> Speaker Slot #{speaker_id}")
        else:
            # 2. Check preset voice string mapping
            voice_key = str(voice).strip().lower()
            if voice_key in VOICE_MAP:
                speaker_id = VOICE_MAP[voice_key]
            elif voice_key.isdigit():
                speaker_id = int(voice_key)
            else:
                # Deterministic fallback for named custom profiles without prompt payload
                import hashlib
                speaker_id = abs(int(hashlib.md5(voice_key.encode('utf-8')).hexdigest(), 16)) % 8
                logger.info(f"[SherpaTTS] Mapped voice name '{voice}' -> Speaker Slot #{speaker_id}")

        speed_val = float(speed) if speed else 1.0
        speed_val = max(0.5, min(2.0, speed_val))

        logger.info(f"[SherpaTTS] Generating raw speech (text_len={len(text)}, speaker_id={speaker_id}, speed={speed_val})")
        
        audio = self._tts.generate(text, sid=speaker_id, speed=speed_val)
        if not audio:
            raise EngineError("TTS generation failed inside sherpa-onnx.")
            
        samples = np.array(audio.samples, dtype=np.float32)

        # Trim trailing silence cleanly without applying gain attenuation or fade curves
        non_silent = np.where(np.abs(samples) > 1e-4)[0]
        if len(non_silent) > 0:
            last_sample = non_silent[-1] + 1
            samples = samples[:last_sample]

        pcm16 = (samples * 32767).clip(-32768, 32767).astype(np.int16)
        
        buf = io.BytesIO()
        with wave.open(buf, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(audio.sample_rate)
            wf.writeframes(pcm16.tobytes())
            
        return buf.getvalue()

    def unload(self) -> bool:
        """Unload SherpaTTS engine and release ONNX runtime memory."""
        if self._tts is not None:
            logger.info("Unloading SherpaTTS model instance")
            self._tts = None
            import gc
            gc.collect()
            return True
        return False

