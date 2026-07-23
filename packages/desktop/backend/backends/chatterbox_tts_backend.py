"""
backends/chatterbox_tts_backend.py — ResembleAI Chatterbox zero-shot voice cloning backend.
"""

import asyncio
import contextlib
import hashlib
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import config
from utils.audio import save_audio

logger = logging.getLogger(__name__)

# Prompt cache storage
_VOICE_PROMPT_CACHE: Dict[str, Dict[str, Any]] = {}


def get_torch_device(
    force_cpu_on_mac: bool = False,
    allow_xpu: bool = True,
    allow_directml: bool = True,
) -> str:
    """Detect PyTorch device (cuda, mps, xpu, directml, or cpu)."""
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
        if not force_cpu_on_mac and hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            return "mps"
        if allow_xpu and hasattr(torch, "xpu") and torch.xpu.is_available():
            return "xpu"
    except ImportError:
        pass
    return "cpu"


def empty_device_cache(device: Optional[str] = None) -> None:
    """Release GPU/MPS memory cache."""
    try:
        import torch

        if torch.cuda.is_available():
            torch.cuda.empty_cache()
        if hasattr(torch, "mps") and hasattr(torch.mps, "empty_cache"):
            torch.mps.empty_cache()
    except Exception:
        pass


def manual_seed(seed: int, device: Optional[str] = None) -> None:
    """Set random seed for reproducibility."""
    try:
        import torch

        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)
    except Exception:
        pass


@contextlib.contextmanager
def model_load_progress(model_name: str, is_cached: bool):
    """Log model loading lifecycle."""
    status = "from disk cache" if is_cached else "downloading from HuggingFace"
    logger.info("Loading model '%s' (%s)...", model_name, status)
    try:
        yield
    finally:
        logger.info("Finished loading model '%s'.", model_name)


def is_model_cached(repo_id: str, required_files: List[str]) -> bool:
    """Check if model repository files exist in local cache."""
    cache_dir = config.models_dir
    if not cache_dir.exists():
        return False
    for fname in required_files:
        matches = list(cache_dir.glob(f"**/{fname}"))
        if not matches:
            return False
    return True


def get_cache_key(audio_path: str | Path, reference_text: str) -> str:
    """Compute MD5 hash key for voice prompt caching."""
    key_src = f"{Path(audio_path).resolve()}:{reference_text.strip()}"
    return hashlib.md5(key_src.encode("utf-8")).hexdigest()


def get_cached_voice_prompt(cache_key: str) -> Optional[Dict[str, Any]]:
    """Retrieve voice prompt dict from cache."""
    return _VOICE_PROMPT_CACHE.get(cache_key)


def cache_voice_prompt(cache_key: str, voice_prompt: Dict[str, Any]) -> None:
    """Store voice prompt dict in cache."""
    _VOICE_PROMPT_CACHE[cache_key] = voice_prompt


async def _combine_voice_prompts(
    audio_paths: List[str | Path],
    reference_texts: List[str],
) -> Tuple[Dict[str, Any], bool]:
    """Concatenate multiple audio sample paths and combine reference texts."""
    import soundfile as sf

    combined_audio = []
    target_sr = None

    for path in audio_paths:
        p = Path(path)
        if not p.exists():
            continue
        data, sr = sf.read(str(p), dtype="float32")
        if len(data.shape) > 1 and data.shape[1] > 1:
            data = np.mean(data, axis=1)
        if target_sr is None:
            target_sr = sr

        if sr != target_sr:
            num_samples = int(round(len(data) * target_sr / float(sr)))
            x_old = np.linspace(0, 1, len(data), endpoint=False)
            x_new = np.linspace(0, 1, num_samples, endpoint=False)
            data = np.interp(x_new, x_old, data)

        combined_audio.append(data.astype(np.float32))
        gap_samples = int(round(0.3 * target_sr))
        combined_audio.append(np.zeros(gap_samples, dtype=np.float32))

    if not combined_audio or target_sr is None:
        raise ValueError("Failed to load reference audio sample files for concatenation.")

    final_data = np.concatenate(combined_audio, axis=0)
    hash_src = "-".join([str(p) for p in audio_paths])
    hash_key = hashlib.md5(hash_src.encode("utf-8")).hexdigest()[:12]
    combined_dest = config.get_data_dir() / "cache" / f"combined_{hash_key}.wav"

    await asyncio.to_thread(save_audio, final_data, combined_dest, target_sr)

    combined_text = " ".join([t.strip() for t in reference_texts if t])
    voice_prompt = {
        "ref_audio": str(combined_dest),
        "ref_text": combined_text,
    }
    return voice_prompt, False


class ChatterboxTTSBackend:
    """Chatterbox zero-shot voice cloning backend for CincoScribe."""

    def __init__(self):
        self.model = None
        self.model_size = "default"
        self._device = None
        self._model_load_lock = asyncio.Lock()

    def _get_device(self) -> str:
        """Mac with MPS is fine for Chatterbox non-turbo."""
        return get_torch_device(force_cpu_on_mac=False, allow_xpu=True, allow_directml=True)

    def is_loaded(self) -> bool:
        return self.model is not None

    def _is_model_cached(self) -> bool:
        return is_model_cached(
            "ResembleAI/chatterbox",
            required_files=["ve.safetensors", "t3_cfg.safetensors", "s3gen.safetensors"],
        )

    async def load_model(self, model_size: str = "default") -> None:
        """Double-checked locking async model loader."""
        if self.model is not None:
            return
        async with self._model_load_lock:
            if self.model is not None:
                return
            await asyncio.to_thread(self._load_model_sync)

    def _load_model_sync(self) -> None:
        model_name = "chatterbox"
        is_cached = self._is_model_cached()

        with model_load_progress(model_name, is_cached):
            from huggingface_hub import snapshot_download

            local_path = snapshot_download(
                repo_id="ResembleAI/chatterbox",
                local_dir=str(config.models_dir / "chatterbox"),
                allow_patterns=["*.safetensors", "*.json", "*.txt", "*.pt", "*.model"],
            )

            device = self._get_device()
            self._device = device

            try:
                from chatterbox.tts import ChatterboxTTS
                self.model = ChatterboxTTS.from_local(local_path, device=device)
            except (ImportError, AttributeError):
                import chatterbox
                if hasattr(chatterbox, "ChatterboxTTS"):
                    self.model = chatterbox.ChatterboxTTS.from_local(local_path, device=device)
                elif hasattr(chatterbox, "ChatterboxMultilingualTTS"):
                    self.model = chatterbox.ChatterboxMultilingualTTS.from_pretrained(device=device)
                else:
                    raise RuntimeError("Chatterbox library (ResembleAI/chatterbox) is required for zero-shot voice cloning.")

        logger.info("Chatterbox TTS loaded on %s", device)

    def unload_model(self) -> None:
        """Unload Chatterbox model and free device memory."""
        device = self._device
        if hasattr(self, "model") and self.model is not None:
            del self.model
        self.model = None
        self._device = None
        if device:
            empty_device_cache(device)

    async def create_voice_prompt(
        self,
        audio_path: str | Path,
        reference_text: str,
        use_cache: bool = True,
    ) -> Tuple[Dict[str, Any], bool]:
        """Chatterbox processes reference audio at generation time."""
        if use_cache:
            cache_key = get_cache_key(audio_path, reference_text)
            cached = get_cached_voice_prompt(cache_key)
            if cached and isinstance(cached, dict):
                ref = cached.get("ref_audio")
                if ref and Path(ref).exists():
                    return cached, True

        voice_prompt = {
            "ref_audio": str(audio_path),
            "ref_text": reference_text,
        }

        if use_cache:
            cache_voice_prompt(cache_key, voice_prompt)

        return voice_prompt, False

    async def combine_voice_prompts(
        self,
        audio_paths: List[str | Path],
        reference_texts: List[str],
    ) -> Tuple[Dict[str, Any], bool]:
        """Combine multiple reference audio files into a single prompt."""
        return await _combine_voice_prompts(audio_paths, reference_texts)

    def _assert_loaded(self) -> None:
        try:
            from model_registry import registry, STATUS_LOADED
            st = None
            for key in ("chatterbox_tts", "chatterbox", "chatterbox_turbo"):
                try:
                    s = registry.get(key)
                    if s.get("status") == STATUS_LOADED:
                        st = s
                        break
                except KeyError:
                    continue
            if not st or st.get("status") != STATUS_LOADED:
                raise RuntimeError("Model not loaded. Call POST /models/chatterbox_tts/load first.")
            if self.model is None and st.get("instance") is not None:
                self.model = st["instance"]
                self._device = st.get("device")
        except KeyError:
            if self.model is None:
                raise RuntimeError("Model not loaded. Call POST /models/chatterbox_tts/load first.")

    async def generate(
        self,
        text: str,
        voice_prompt: Dict[str, Any],
        language: str = "en",
        seed: Optional[int] = None,
        instruct: Optional[str] = None,
    ) -> Tuple[np.ndarray, int]:
        """Synthesize speech using Chatterbox zero-shot voice cloning."""
        self._assert_loaded()

        ref_audio = None
        if isinstance(voice_prompt, dict):
            ref_audio = voice_prompt.get("ref_audio") or voice_prompt.get("audio_path")

        logger.info(
            "generate() called — ref_audio=%s exists=%s",
            ref_audio,
            Path(ref_audio).exists() if ref_audio else False,
        )

        if not ref_audio:
            raise RuntimeError("voice_prompt missing ref_audio — voice sample path not set")
        if not Path(ref_audio).exists():
            raise RuntimeError(f"Reference audio not found at {ref_audio}. Re-upload the voice sample.")

        def _generate_sync() -> Tuple[np.ndarray, int]:
            import torch

            if seed is not None:
                manual_seed(seed, self._device)

            assert ref_audio is not None

            wav = self.model.generate(
                text,
                audio_prompt_path=ref_audio,
                exaggeration=0.5,
                cfg_weight=0.5,
            )

            if isinstance(wav, torch.Tensor):
                audio = wav.squeeze().cpu().numpy().astype(np.float32)
            else:
                audio = np.asarray(wav, dtype=np.float32)

            sample_rate = getattr(self.model, "sr", None) or 24000
            return audio, sample_rate

        return await asyncio.to_thread(_generate_sync)


# Alias for backward compatibility
CincoScribeTTSBackend = ChatterboxTTSBackend
