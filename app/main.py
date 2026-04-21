from __future__ import annotations

import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.core.config import settings
from app.core.startup import StartupConfigError, validate_startup
from app.db.database import init_db
from app.utils.logger import log
from app.workers.batch_worker import start_worker, stop_worker


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast before accepting any traffic
    try:
        validate_startup(settings)
    except StartupConfigError as exc:
        log.error(str(exc))
        sys.exit(1)

    log.info(f"Starting {settings.APP_NAME} v{settings.APP_VERSION}")
    await init_db()

    # Load YOLO model weights once at startup (non-blocking — runs synchronously
    # here because the model must be ready before requests are served)
    from app.services.yolo_detector import get_detector
    get_detector().load()

    start_worker()
    yield
    log.info("Shutting down...")
    stop_worker()


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.error(f"Unhandled exception on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    # credentials require explicit origins — not compatible with wildcard
    allow_credentials="*" not in settings.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")

app.include_router(router)
