import sys
import os
import logging
import collections

# Thread-safe log buffer containing the last 2000 lines
log_buffer = collections.deque(maxlen=2000)

class MemoryLogHandler(logging.Handler):
    def emit(self, record):
        try:
            msg = self.format(record)
            log_buffer.append(msg)
        except Exception:
            self.handleError(record)

# Initialize standard logging config
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# Attach MemoryLogHandler to the root logger to capture all system logs
memory_handler = MemoryLogHandler()
memory_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s"))
logging.getLogger().addHandler(memory_handler)

logger = logging.getLogger("__main__")
logger.info("============================================================")
logger.info("cincoscribe-server starting up...")
logger.info(f"Python version: {sys.version}")
logger.info(f"Executable: {sys.executable}")
logger.info(f"Arguments: {sys.argv}")
logger.info("============================================================")
logger.info("Importing standard libraries...")
logger.info("Standard library imports successful")
logger.info("Importing backend config...")

from config import models_dir
logger.info(f"Model download path set to: {models_dir}")

logger.info("Importing routers and engine dependencies...")
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from router import health, tts, asr, models, merge
logger.info("Backend imports successful")

# GPU Detection
try:
    import torch  # type: ignore
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        logger.info(f"GPU: CUDA ({gpu_name})")
    else:
        logger.info("GPU: None (CPU only)")
except ImportError:
    logger.info("GPU: Torch not installed (CPU only)")

logger.info(f"Model cache: {models_dir}")
logger.info("Ready")

app = FastAPI(title="CincoScribe Sidecar", version="0.1.0", docs_url=None, redoc_url=None)

# The packaged renderer is loaded from file:// and therefore sends Origin: null.
# The per-launch sidecar token below remains the authorization boundary.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["null", "http://localhost:*", "http://127.0.0.1:*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "X-Sidecar-Token"],
    expose_headers=[],
    max_age=3600,
)


@app.middleware("http")
async def verify_sidecar_token(request: Request, call_next):
    expected_token = os.environ.get("SIDECAR_TOKEN")
    if not expected_token:
        return JSONResponse(status_code=503, content={"detail": "Sidecar launch token is unavailable"})

    if request.method == "OPTIONS":
        return await call_next(request)

    token = request.headers.get("x-sidecar-token")

    if token != expected_token:
        return JSONResponse(status_code=403, content={"detail": "Forbidden: Invalid or missing sidecar token"})

    return await call_next(request)

app.include_router(health.router)
app.include_router(tts.router)
app.include_router(asr.router)
app.include_router(models.router)
app.include_router(merge.router)

@app.get("/logs")
def get_logs():
    return {"logs": list(log_buffer)}

@app.post("/logs/clear")
def clear_logs():
    log_buffer.clear()
    return {"status": "success"}

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("SIDECAR_PORT", "5555"))
    logger.info(f"CincoScribe sidecar starting on 127.0.0.1:{port}")
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
        access_log=True,
    )
