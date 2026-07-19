"""Regression checks for model-download progress and local-sidecar safety.

These checks intentionally inspect lightweight source contracts because this checkout's
Python environment cannot currently import FastAPI/Pydantic (pydantic_core binary is absent).

LegacyArtifactTests is intentionally omitted: root legacy files must not be deleted.
# LegacyArtifactTests removed per user request to ignore deletion of legacy files.
"""

from pathlib import Path
import unittest


BACKEND = Path(__file__).resolve().parents[1]
DESKTOP = BACKEND.parent
MODELS_ROUTER = (BACKEND / "router" / "models.py").read_text(encoding="utf-8")
SIDECAR_MAIN = (BACKEND / "main.py").read_text(encoding="utf-8")
ASR_ENGINE = (BACKEND / "engines" / "faster_whisper.py").read_text(encoding="utf-8")
ASR_ROUTER = (BACKEND / "router" / "asr.py").read_text(encoding="utf-8")
MODELS_PAGE = (DESKTOP / "renderer" / "js" / "pages" / "models.js").read_text(encoding="utf-8")
RENDERER_STATE = (DESKTOP / "renderer" / "js" / "state.js").read_text(encoding="utf-8")


class ModelDownloadContractTests(unittest.TestCase):
    def test_model_downloads_use_explicit_progress_aware_hub_downloads(self):
        self.assertIn("ASR_REPO_MAP", MODELS_ROUTER)
        self.assertIn("tqdm_class=PatchedTqdm", MODELS_ROUTER)
        self.assertNotIn("from faster_whisper.utils import download_model", MODELS_ROUTER)
        self.assertNotIn("tqdm.tqdm = PatchedTqdm", MODELS_ROUTER)

    def test_asr_engine_fallback_uses_ctranslate2_repositories(self):
        self.assertNotIn('load_target = f"openai/whisper-{repo_size}"', ASR_ENGINE)
        self.assertIn("Systran/faster-whisper", ASR_ENGINE)
        self.assertIn("def load(", ASR_ENGINE)
        self.assertIn("def unload(", ASR_ENGINE)
        self.assertIn("def loaded(", ASR_ENGINE)
        self.assertIn("Model is not downloaded", ASR_ENGINE)

    def test_stub_tts_models_cannot_create_fake_installations(self):
        self.assertNotIn("mock_model_data", MODELS_ROUTER)
        self.assertIn("SUPPORTED_TTS_MODELS", MODELS_ROUTER)
        self.assertIn("Coming soon", MODELS_PAGE)

    def test_models_router_contains_only_download_status_delete_and_settings(self):
        self.assertNotIn("MigrationProgress", MODELS_ROUTER)
        self.assertNotIn("/models/migrate", MODELS_ROUTER)
        self.assertNotIn("/models/progress", MODELS_ROUTER)
        self.assertNotIn("qwen_1_7b", MODELS_ROUTER)
        self.assertIn('"models--Systran--faster-whisper-base"', MODELS_ROUTER)
        self.assertIn('"models--Systran--faster-whisper-large-v3"', MODELS_ROUTER)
        self.assertNotIn("/models/migrate", MODELS_PAGE)
        self.assertNotIn("/models/progress", MODELS_PAGE)

    def test_asr_router_exposes_load_unload_and_loaded_state(self):
        self.assertIn('@router.post("/engines/asr/load")', ASR_ROUTER)
        self.assertIn('@router.post("/engines/asr/unload")', ASR_ROUTER)
        self.assertIn('@router.get("/engines/asr/loaded")', ASR_ROUTER)
        self.assertIn('status_code=400', ASR_ROUTER)

    def test_polling_only_renders_after_a_model_state_transition(self):
        polling_start = MODELS_PAGE.index("function startPolling()")
        polling_end = MODELS_PAGE.index("function stopPolling()")
        polling = MODELS_PAGE[polling_start:polling_end]
        self.assertIn("if (nextState !== prevState)", polling)
        self.assertNotIn("await fetchState();\n        render();", polling)


class SidecarSecurityContractTests(unittest.TestCase):
    def test_sidecar_fails_closed_when_no_launch_token_was_provided(self):
        self.assertIn("if not expected_token:", SIDECAR_MAIN)
        self.assertIn("status_code=503", SIDECAR_MAIN)

    def test_cors_is_not_a_wildcard_capability_grant(self):
        self.assertNotIn('allow_origins=["*"]', SIDECAR_MAIN)
        self.assertNotIn('allow_methods=["*"]', SIDECAR_MAIN)
        self.assertNotIn('allow_headers=["*"]', SIDECAR_MAIN)

    def test_renderer_only_attaches_the_token_to_a_parsed_loopback_url(self):
        self.assertIn("new URL(", RENDERER_STATE)
        self.assertNotIn("url.includes('127.0.0.1')", RENDERER_STATE)


if __name__ == "__main__":
    unittest.main()
