import os
import logging
from fastapi import FastAPI
from router import health, tts, asr, models

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

app = FastAPI(title="CincoScribe Sidecar", version="2.0.0", docs_url=None, redoc_url=None)

app.include_router(health.router)
app.include_router(tts.router)
app.include_router(asr.router)
app.include_router(models.router)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("SIDECAR_PORT", "3901"))
    logging.info(f"CincoScribe sidecar starting on 127.0.0.1:{port}")
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=port,
        log_level="info",
        access_log=False,
    )
