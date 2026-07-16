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
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from router import health, tts, asr, models, merge
logger.info("Backend imports successful")

# GPU Detection
try:
    import torch
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

# Add CORS Middleware to permit requests from browser
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=3600,
)

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
