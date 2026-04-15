# Card Enhancer AI

A production-quality card image enhancement web application built with FastAPI. Upload trading cards, business cards, or any images as a ZIP archive — they're upscaled, sharpened, denoised, and color-corrected through an OpenCV + Pillow pipeline, with real-time progress via WebSocket.

100 % local. Zero cloud dependencies. Zero telemetry.

---

## Features

- **Batch processing** — upload up to 3 000 images in a single ZIP (max 2 GB)
- **Enhancement pipeline** — Lanczos upscaling, adaptive sharpening (unsharp mask), fast non-local means denoising, CLAHE contrast, and color saturation correction
- **5 built-in presets** — Mint Card, Worn Card, Damaged Card, Web Ready, Print Ready
- **Custom settings** — choose upscale factor (2×/4×/8×), output format (PNG/JPEG/WebP/TIFF), quality, denoise strength, and toggle each pipeline stage
- **Real-time progress** — WebSocket pushes per-image status to the browser
- **Before / After compare** — slider overlay in the results view
- **Async throughout** — non-blocking I/O with `async/await`, background thread pool for CPU-bound OpenCV work
- **SQLite job store** — persistent job metadata via SQLAlchemy async ORM
- **Polished dark UI** — Alpine.js + Tailwind CSS, drag-and-drop upload, grid gallery, filmstrip navigation

---

## Quick Start

```bash
# Clone
git clone https://github.com/Nietzsche-Ubermensch/card-enhancer.git
cd card-enhancer

# Install dependencies (Python 3.10+)
pip install -r requirements.txt

# Run
python run.py
```

Open **http://localhost:8000** — drop a ZIP of images and pick a preset.

### Environment Variables

All optional. Set in `.env` or export before running.

| Variable | Default | Description |
|---|---|---|
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
├── .env                       ← Runtime configuration
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
│   │   │   ├── __init__.py    ← Backend registry (get_upscaler / get_backend_name)
│   │   │   └── opencv_backend.py  ← OpenCV + Pillow enhancement pipeline
│   │   ├── enhancement_service.py ← Orchestrates upscaler calls
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
├── uploads/                   ← (runtime) raw uploads
├── temp/                      ← (runtime) working directory per job
└── outputs/                   ← (runtime) enhanced images per job
```

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
  │                          │◄── WS push { progress } ─┤   upscale → denoise
  │◄── real-time updates ────┤                          │   → CLAHE → sharpen
  │                          │                          │   → color correct
  │                          │                          │   → write output
  │                          │◄── WS push { completed }─┤
  │◄── "completed" ─────────┤                          │
  │                          │                          │
  ├─ GET /v1/image/{job}/{f}─►  Serve enhanced file     │
  │◄── image bytes ──────────┤                          │
```

### Enhancement Pipeline

Each image passes through up to 6 stages (configurable per preset):

1. **Lanczos upscale** — `cv2.INTER_LANCZOS4` resize to target dimensions
2. **Denoise** — `cv2.fastNlMeansDenoisingColored` (low / medium / high strength)
3. **CLAHE contrast** — adaptive histogram equalization on the L channel in LAB color space
4. **Unsharp mask sharpen** — Gaussian blur subtraction with configurable strength
5. **Color saturation boost** — Pillow `ImageEnhance.Color` at 1.15×
6. **Format-aware write** — PNG, JPEG (quality param), WebP (quality param), or TIFF

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
| `WS /v1/ws/{job_id}` | Real-time job progress. Sends JSON frames with `status`, `progress`, `message`, `completed_images`, `failed_images`, `total_images`. Accepts `{"action": "cancel"}` to cancel. |

### Upload Example

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

### Response Schemas

<details>
<summary><strong>UploadResponse</strong></summary>

```json
{
  "job_id": "abc123...",
  "status": "pending",
  "message": "Queued for processing",
  "total_files": 0,
  "accepted_files": 0,
  "rejected_files": 0
}
```
</details>

<details>
<summary><strong>JobStatusResponse</strong></summary>

```json
{
  "job_id": "abc123...",
  "status": "completed",
  "progress": 100,
  "total_images": 3,
  "completed_images": 3,
  "failed_images": 0,
  "results": [
    {
      "filename": "card_enhanced.png",
      "original_size": "3.3 KB",
      "enhanced_size": "236.6 KB",
      "status": "completed",
      "processing_time_ms": 122
    }
  ],
  "message": "Done in 0.2s — 3 ok, 0 failed",
  "backend_used": "OpenCV + Pillow (CPU)",
  "created_at": "2026-04-15T05:23:24.167248",
  "elapsed_seconds": 2.06
}
```
</details>

---

## Presets

| Preset | Scale | Denoise | Sharpen | Contrast | Color | Format | Use Case |
|---|---|---|---|---|---|---|---|
| `mint_card` | 2× | Off | 0.3 | CLAHE | Off | PNG | Near-mint cards, minimal touch-up |
| `worn_card` | 4× | Medium | 0.6 | CLAHE | On | PNG | Moderate wear, restore edges and color |
| `damaged_card` | 4× | High | 0.8 | CLAHE | On | PNG | Heavy damage, aggressive restoration |
| `web_ready` | 2× | Low | 0.4 | CLAHE | On | WebP | Optimized for web, smaller file size |
| `print_ready` | 4× | Medium | 0.5 | Off | On | TIFF | High-res archival or print |

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
jinja2==3.1.6
```

---

## License

MIT
