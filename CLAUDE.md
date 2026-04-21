# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Card Enhancer AI is a FastAPI web application for batch-processing trading card and image files. Users upload a ZIP, a background worker pipeline enhances each image, and real-time progress is streamed back via WebSocket. Two swappable backends exist: a local OpenCV/Pillow CPU pipeline and a three-stage API pipeline (LaMa inpainting → SwinIR denoise → Real-ESRGAN 4× upscale via Hugging Face and Replicate).

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Start development server (hot-reload enabled when DEBUG=true)
python run.py

# Run all tests (pytest not in requirements.txt — install separately first)
pip install pytest pytest-asyncio httpx
python -m pytest tests/ -v

# Run a single test file or test
python -m pytest tests/unit/test_opencv_backend.py -v
python -m pytest tests/integration/test_api.py::test_system_endpoint -v

# Generate a synthetic test card image
python tests/generatetest_card.py --output test_card.png [--worn]

# Compute quality metrics on an enhanced image
python tests/quality_metrics.py --input original.png --output enhanced.png --time <ms>

# Train the YOLO11-OBB card detector
python train_detector.py --data <yaml_or_url>

# Docker
docker-compose up --build
```

## Architecture

### Request Lifecycle

1. `POST /v1/batch/upload` — saves ZIP to `temp/{job_id}/`, creates a PENDING `Job` row in SQLite, returns `job_id`.
2. `GET /v1/ws/{job_id}` — WebSocket registers a progress callback in a shared dict (with threading lock).
3. Background polling loop (`batch_worker.py`) detects PENDING jobs every `WORKER_POLL_INTERVAL` seconds and submits them to a `ThreadPoolExecutor` (size: `MAX_CONCURRENT_WORKERS`, default 2).
4. Worker thread: extracts ZIP (path-traversal-safe) → runs enhancement pipeline → writes results to `outputs/{job_id}/` → updates DB → pushes progress via the registered WebSocket callback.
5. Served images are fetched via `GET /v1/image/{job_id}/{filename}`.

### Backend Selection

`UPSCALE_BACKEND` env var selects the backend at startup via a registry in `app/services/upscalers/__init__.py`:

- `opencv` — `opencv_backend.py`: Lanczos upscale → fast-NL denoise → CLAHE contrast → unsharp mask → color boost. No API tokens needed.
- `realesrgan` (default) — `realesrgan_backend.py`: three sequential API calls (LaMa via Replicate, SwinIR via HF Inference API, Real-ESRGAN via Replicate). Requires `HF_API_TOKEN` and `REPLICATE_API_TOKEN`.

Both backends are wrapped by `EnhancementService` (`app/services/enhancement_service.py`), which prepends optional YOLO11-OBB card crop detection (`card_detector.py`) before invoking the selected backend.

### Async / Threading Bridge

FastAPI routes and DB operations are fully `async`. Image processing is CPU/IO-bound, so the worker runs in a plain thread. The thread bridges back to async DB operations via `asyncio.run()` — avoid introducing `await` directly inside worker thread code.

### YOLO Card Detector

`app/services/card_detector.py` lazy-loads `models/card_detector_obb.pt` on first call (thread-safe lock). If the model file or `ultralytics` package is absent the detector silently falls back — do not remove this fallback. **ultralytics is pinned to `8.3.x`** because 8.4.x changed the OBB output tensor format.

### Presets

Five named presets are defined in `app/core/config.py` (`mint_card`, `worn_card`, `damaged_card`, `web_ready`, `print_ready`). Each preset is a dict of enhancement options passed through to the active backend. Adding a new preset only requires editing this dict.

### Key File Locations

| Concern | Path |
|---|---|
| App entry point | `run.py`, `app/main.py` |
| All env vars / presets | `app/core/config.py` |
| Magic numbers & thresholds | `app/core/constants.py` |
| REST + WebSocket routes | `app/api/routes.py` |
| Job DB CRUD | `app/services/job_service.py` |
| Background worker & thread pool | `app/workers/batch_worker.py` |
| OpenCV pipeline | `app/services/upscalers/opencv_backend.py` |
| API pipeline | `app/services/upscalers/realesrgan_backend.py` |
| Frontend SPA | `app/static/index.html` (Alpine.js + Tailwind CSS) |
| CI pipeline | `.github/workflows/deploy.yml` |

## Environment Variables

Copy `.env.example` to `.env`. All variables have defaults that support local-only mode (opencv backend, no tokens required).

| Variable | Default | Notes |
|---|---|---|
| `UPSCALE_BACKEND` | `realesrgan` | `opencv` or `realesrgan` |
| `HF_API_TOKEN` | _(empty)_ | Required for SwinIR stage |
| `REPLICATE_API_TOKEN` | _(empty)_ | Required for LaMa + Real-ESRGAN stages |
| `MAX_CONCURRENT_WORKERS` | `2` | Thread pool size |
| `MAX_ZIP_SIZE` | 2 GB | Bytes |
| `MAX_BATCH_SIZE` | `3000` | Images per ZIP |
| `DATABASE_URL` | `sqlite+aiosqlite:///./jobs.db` | Async SQLAlchemy DSN |
| `DEBUG` | `false` | Enables hot-reload |

## Conventions

- **Error handling**: every enhancement stage is wrapped in `try/except`; failures degrade gracefully rather than aborting the whole batch. Follow this pattern when adding new pipeline stages.
- **Logging**: use the structured JSON logger from `app/utils/logger.py` — do not use `print()`.
- **Pydantic v2**: all schemas use `BaseModel` with `Field`; use `model_validator` / `computed_field` rather than v1-style `validator`.
- **Type hints**: files use `from __future__ import annotations` (PEP 563 deferred evaluation).
- **Private methods**: prefix with `_` (e.g., `_run_lama`, `_notify`).
