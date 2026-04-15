# Card Enhancer AI

A production-quality card image enhancement web application built with FastAPI. Upload trading cards, business cards, or any images as a ZIP archive — they're upscaled, sharpened, denoised, and color-corrected with real-time progress via WebSocket.

Two backends:

| Backend | How it works | Tokens needed? |
|---|---|---|
| **OpenCV + Pillow (CPU)** | Lanczos upscale, CLAHE, unsharp mask, denoise — all local | No |
| **LaMa + SwinIR + Real-ESRGAN (API)** | Auto scratch removal, transformer denoising, neural 4x upscale | HF + Replicate |

---

## Features

- **Batch processing** — upload up to 3 000 images in a single ZIP (max 2 GB)
- **Two enhancement backends** — pure local OpenCV or AI-powered API pipeline (LaMa → SwinIR → Real-ESRGAN)
- **Auto scratch detection** — edge-detection based mask generation feeds LaMa for targeted inpainting
- **Card crop** — OpenCV contour detection auto-crops and perspective-corrects trading cards
- **5 built-in presets** — Mint Card, Worn Card, Damaged Card, Web Ready, Print Ready
- **Custom settings** — upscale factor (2×/4×/8×), output format (PNG/JPEG/WebP/TIFF), quality, denoise strength, and per-stage toggles
- **Real-time progress** — WebSocket pushes per-image status to the browser
- **Before / After compare** — slider overlay in the results view
- **Async throughout** — non-blocking I/O with `async/await`, background thread pool for CPU-bound work
- **SQLite job store** — persistent job metadata via SQLAlchemy async ORM
- **Graceful fallback** — if API tokens are missing or any pipeline stage fails, the next stage continues with the previous result

---

## Quick Start

### Local-only mode (no tokens needed)

```bash
git clone https://github.com/Nietzsche-Ubermensch/card-enhancer.git
cd card-enhancer

pip install -r requirements.txt

cp .env.example .env
# defaults to UPSCALE_BACKEND=opencv — works out of the box

python run.py
```

Open **http://localhost:8000**.

### AI pipeline mode (API tokens required)

```bash
cp .env.example .env
```

Edit `.env`:

```ini
HF_API_TOKEN=hf_your_token_here
REPLICATE_API_TOKEN=r8_your_token_here
UPSCALE_BACKEND=realesrgan
```

Get tokens at:
- **Hugging Face**: [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens) (free)
- **Replicate**: [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) (pay-per-use, ~$0.005/image)

Then `python run.py` — the header badge will show `LaMa + SwinIR + Real-ESRGAN (API)`.

If either token is missing, the app logs a warning and falls back to the OpenCV backend automatically.

---

## Environment Variables

All optional. Set in `.env` or export before running.

| Variable | Default | Description |
|---|---|---|
| `UPSCALE_BACKEND` | `realesrgan` | `realesrgan` for the AI pipeline, `opencv` for local-only |
| `HF_API_TOKEN` | _(empty)_ | Hugging Face token (required for `realesrgan` backend) |
| `REPLICATE_API_TOKEN` | _(empty)_ | Replicate token (required for `realesrgan` backend) |
| `DEBUG` | `false` | Enable debug logging and hot-reload |
| `HOST` | `0.0.0.0` | Bind address |
| `PORT` | `8000` | Bind port |
| `MAX_CONCURRENT_WORKERS` | `2` | Thread pool size for image processing |
| `DEFAULT_OUTPUT_QUALITY` | `95` | JPEG/WebP quality when not overridden |
| `DATABASE_URL` | `sqlite+aiosqlite:///./jobs.db` | SQLAlchemy async connection string |
| `CLEANUP_AFTER_HOURS` | `48` | Retention period for temp files |

---

## Architecture

```
card-enhancer/
├── run.py                     ← Uvicorn entrypoint
├── .env.example               ← Config template (copy to .env)
├── requirements.txt           ← Pinned PyPI dependencies
│
├── app/
│   ├── main.py                ← FastAPI app, lifespan, middleware, static mount
│   │
│   ├── core/
│   │   └── config.py          ← pydantic-settings: all env vars, presets, paths
│   │
│   ├── models/
│   │   ├── enums.py           ← JobStatus IntEnum (PENDING → COMPLETED)
│   │   └── schemas.py         ← Pydantic v2 request/response models
│   │
│   ├── db/
│   │   ├── database.py        ← Async engine, session factory, init_db()
│   │   └── models.py          ← SQLAlchemy Job ORM model (SQLite)
│   │
│   ├── services/
│   │   ├── upscalers/
│   │   │   ├── __init__.py    ← Backend registry with automatic fallback
│   │   │   ├── opencv_backend.py      ← Local OpenCV + Pillow pipeline
│   │   │   └── realesrgan_backend.py  ← LaMa + SwinIR + Real-ESRGAN API pipeline
│   │   ├── enhancement_service.py     ← Orchestrates upscaler calls
│   │   └── job_service.py     ← Job CRUD: create, get, update, add_result, stats
│   │
│   ├── workers/
│   │   └── batch_worker.py    ← Background thread pool + polling loop
│   │
│   ├── api/
│   │   └── routes.py          ← All REST + WebSocket endpoints
│   │
│   ├── static/
│   │   └── index.html         ← SPA frontend (Alpine.js + Tailwind CSS)
│   │
│   └── utils/
│       ├── logger.py          ← JSON structured logging
│       └── file_utils.py      ← ZIP extraction, path safety, format_bytes
│
├── outputs/                   ← (runtime) enhanced images per job
├── temp/                      ← (runtime) working directory per job
└── uploads/                   ← (runtime) raw uploads
```

### Enhancement Pipelines

**OpenCV backend** (local, no network):

```
Image → Lanczos upscale → fastNlMeansDenoising → CLAHE contrast → Unsharp mask → Color boost → Output
```

**Real-ESRGAN backend** (API-powered):

```
Image → Card crop (contour detection)
      → LaMa scratch removal (auto-mask via edge detection)
      → SwinIR denoising (HF Inference API, padded to 8x multiples)
      → Real-ESRGAN 4x upscale (Replicate)
      → Output
```

Each stage is wrapped in try/except — if it fails, the pipeline continues with the previous result.

### Request Flow

```
Browser                    FastAPI                  Worker Thread
  │                          │                          │
  ├─ POST /v1/batch/upload ──►  Save ZIP, create Job    │
  │◄── { job_id } ──────────┤                          │
  │                          │                          │
  ├─ WS /v1/ws/{job_id} ────►  Register callback       │
  │                          │                          │
  │                          │   Poller picks up job ──►│
  │                          │                          ├─ Extract ZIP
  │                          │                          ├─ For each image:
  │                          │◄── WS push { progress } ─┤   run selected
  │◄── real-time updates ────┤                          │   backend pipeline
  │                          │                          │
  │                          │◄── WS push { completed }─┤
  │◄── "completed" ─────────┤                          │
  │                          │                          │
  ├─ GET /v1/image/{job}/{f}─►  Serve enhanced file     │
  │◄── image bytes ──────────┤                          │
```

---

## API Reference

Base URL: `http://localhost:8000`

### System

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/` | Serve the web UI |
| `GET` | `/v1/system` | App name, version, active backend, job counts, disk usage |
| `GET` | `/v1/presets` | List all available enhancement presets with their settings |
| `GET` | `/docs` | Swagger UI (auto-generated) |
| `GET` | `/redoc` | ReDoc (auto-generated) |

### Batch Processing

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/v1/batch/upload` | Upload a ZIP archive for processing |
| `GET` | `/v1/batch/status/{job_id}` | Full job status with per-image results |
| `GET` | `/v1/batch/results/{job_id}` | Completed image results only |
| `DELETE` | `/v1/batch/{job_id}` | Cancel a running or pending job |

### Image Serving

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/v1/image/{job_id}/{filename}` | Download an enhanced image |
| `GET` | `/v1/original/{job_id}/{filename}` | Download the original image |

### WebSocket

| Endpoint | Description |
|---|---|
| `WS /v1/ws/{job_id}` | Real-time job progress. Sends JSON with `status`, `progress`, `message`, `completed_images`, `failed_images`, `total_images`. Accepts `{"action": "cancel"}` to cancel. |

### Upload Examples

```bash
# Using a preset
curl -X POST http://localhost:8000/v1/batch/upload \
  -F "zip_file=@cards.zip" \
  -F "preset=worn_card"

# Using custom settings
curl -X POST http://localhost:8000/v1/batch/upload \
  -F "zip_file=@cards.zip" \
  -F 'settings_json={"upscale_factor":4,"format":"png","denoise":true,"denoise_strength":"high","sharpen":true,"sharpen_strength":0.7,"auto_contrast":true,"color_correct":true,"quality":95}'
```

---

## Presets

| Preset | Scale | Denoise | Sharpen | Contrast | Color | Format | Use Case |
|---|---|---|---|---|---|---|---|
| `mint_card` | 2x | Off | 0.3 | CLAHE | Off | PNG | Near-mint cards, minimal touch-up |
| `worn_card` | 4x | Medium | 0.6 | CLAHE | On | PNG | Moderate wear, restore edges and color |
| `damaged_card` | 4x | High | 0.8 | CLAHE | On | PNG | Heavy damage, aggressive restoration |
| `web_ready` | 2x | Low | 0.4 | CLAHE | On | WebP | Optimized for web, smaller file size |
| `print_ready` | 4x | Medium | 0.5 | Off | On | TIFF | High-res archival or print |

---

## Dependencies

All from PyPI. No model downloads, no GPU required.

```
fastapi==0.115.12          uvicorn[standard]==0.34.2
pydantic==2.11.3           pydantic-settings==2.9.1
python-multipart==0.0.20   aiofiles==24.1.0
sqlalchemy[asyncio]==2.0.41 aiosqlite==0.21.0
pillow==11.2.1             opencv-python-headless==4.11.0.86
numpy>=1.24,<2.0           websockets==15.0.1
jinja2==3.1.6              httpx==0.27.0
replicate==1.0.4           huggingface_hub==0.27.0
```

---

## GitHub Actions

The repo includes `.github/workflows/deploy.yml`. To use it, add your tokens as repository secrets:

1. Go to **Settings > Secrets and variables > Actions**
2. Add `HF_API_TOKEN` and `REPLICATE_API_TOKEN`

The workflow installs deps, verifies secrets are loaded, and starts the app for a health check on every push to `main`.

---

## License

MIT
