# Card Enhancer AI — API Reference

Base URL: `http://localhost:8000` (override with `HOST` / `PORT`).

FastAPI serves two live, interactive versions of this reference — use them to try
requests straight from the browser:

| URL | What it is |
| --- | --- |
| `/docs` | Swagger UI — expand an endpoint, hit **Try it out**, upload a real file |
| `/redoc` | ReDoc — cleaner read-only reference, good for scanning schemas |
| `/openapi.json` | The raw OpenAPI schema, for client codegen |

All JSON responses are `application/json`. Errors use FastAPI's standard shape:

```json
{ "detail": "Job not found" }
```

Unhandled server-side exceptions are caught by a global handler and always return
`500 {"detail": "Internal server error"}` — details go to the log, never the response.

---

## Endpoint summary

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/` | Serve the single-page web UI |
| `GET` | `/v1/presets` | List enhancement presets |
| `GET` | `/v1/system` | App version, active backend, job counts, disk usage |
| `POST` | `/v1/batch/upload` | Queue a ZIP of images for enhancement |
| `GET` | `/v1/batch/status/{job_id}` | Full job status incl. per-image results |
| `GET` | `/v1/batch/results/{job_id}` | Completed images only |
| `DELETE` | `/v1/batch/{job_id}` | Cancel an in-flight job |
| `GET` | `/v1/image/{job_id}/{filename}` | Download an enhanced image |
| `GET` | `/v1/original/{job_id}/{filename}` | Download the original upload |
| `POST` | `/v1/detect` | YOLO object detection on one image |
| `WS` | `/v1/ws/{job_id}` | Live progress stream + cancel channel |

---

## System & presets

### `GET /v1/system`

```bash
curl http://localhost:8000/v1/system
```

```json
{
  "app_name": "Card Enhancer AI",
  "version": "5.0.0",
  "active_backend": "opencv",
  "active_jobs": 1,
  "completed_jobs": 42,
  "storage_used_gb": 13.7
}
```

`active_backend` reflects the resolved `UPSCALE_BACKEND` (`opencv` or `realesrgan`).

### `GET /v1/presets`

Returns every preset with its full settings dict. Built-in presets:

| Preset | Upscale | Denoise | Format | Intended for |
| --- | --- | --- | --- | --- |
| `mint_card` | 2x | off | png | Near-mint cards — minimal processing |
| `worn_card` | 4x | medium | png | Moderately worn — restore colors and edges |
| `damaged_card` | 4x | high | png | Heavily damaged — aggressive restoration |
| `web_ready` | 2x | low | webp | Optimised for web — smaller file size |
| `print_ready` | 4x | medium | tiff | High-res for print or archival |

---

## Batch enhancement

### `POST /v1/batch/upload`

`multipart/form-data`:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `zip_file` | file | yes | ZIP archive of images |
| `preset` | string | no | One of the preset names above |
| `settings_json` | string | no | JSON object overriding individual preset keys |

A `preset` supplies the base settings; `settings_json` is merged on top, so you can
start from `worn_card` and change only `upscale_factor`. Keys beginning with `_` are
stripped — they are internal and cannot be set by callers.

```bash
curl -X POST http://localhost:8000/v1/batch/upload \
  -F "zip_file=@cards.zip" \
  -F "preset=worn_card" \
  -F 'settings_json={"upscale_factor": 2, "format": "webp"}'
```

```json
{
  "job_id": "9f2c1a7b4e5d6f8a0b1c2d3e4f5a6b7c",
  "status": "pending",
  "message": "Queued for processing",
  "total_files": 0,
  "accepted_files": 0,
  "rejected_files": 0
}
```

Errors: `413` ZIP exceeds `MAX_ZIP_SIZE` (default 2 GB) · `400` `settings_json` is not
valid JSON, or is valid JSON but not an object.

### `GET /v1/batch/status/{job_id}`

The endpoint to poll. `progress` is an integer percentage; `results` holds one entry
per image processed so far.

```json
{
  "job_id": "9f2c1a7b...",
  "status": "processing",
  "progress": 64,
  "total_images": 50,
  "completed_images": 32,
  "failed_images": 0,
  "results": [
    {
      "filename": "card_001.jpg",
      "original_path": "temp/9f2c1a7b.../card_001.jpg",
      "enhanced_path": "outputs/9f2c1a7b.../card_001.png",
      "original_size": "800x1120",
      "enhanced_size": "3200x4480",
      "status": "completed",
      "error": null,
      "processing_time_ms": 4120
    }
  ],
  "message": "Enhancing card_033.jpg",
  "backend_used": "opencv",
  "created_at": "2026-08-18T14:02:11.483210",
  "updated_at": "2026-08-18T14:05:47.001922",
  "elapsed_seconds": 215.5
}
```

`status` is one of `pending`, `analyzing`, `processing`, `quality_check`, `completed`,
`failed`, `cancelled`, `partially_completed`. Use `partially_completed` as your cue to
inspect `failed_images` — the job finished but not every image made it.

Errors: `404` unknown `job_id`.

### `GET /v1/batch/results/{job_id}`

Same data filtered to successful images — convenient when you only want download links.

```json
{ "job_id": "9f2c1a7b...", "total": 50, "completed": 48, "results": [] }
```

### `DELETE /v1/batch/{job_id}`

Cancels a running job and deletes its temp directory.

```json
{ "ok": true, "job_id": "9f2c1a7b..." }
```

Errors: `404` unknown job · `400` job already `completed` / `failed` / `cancelled`.

---

## Downloading images

```bash
curl -O http://localhost:8000/v1/image/9f2c1a7b.../card_001.png     # enhanced
curl -O http://localhost:8000/v1/original/9f2c1a7b.../card_001.jpg  # original
```

Both resolve the path and verify it stays inside `OUTPUT_DIR` / `TEMP_DIR`
respectively, so `..` traversal is rejected with `400`. A missing file is `404`.

Originals live under `TEMP_DIR` and are removed by cleanup after
`CLEANUP_AFTER_HOURS` (default 48) — fetch them before then.

---

## `POST /v1/detect` — YOLO detection

Runs the card-detection model on a **single** image. Inference is blocking, so it is
dispatched to a thread-pool worker and never stalls the event loop.

| Param | In | Type | Notes |
| --- | --- | --- | --- |
| `image` | form-data | file | Any `image/*`; jpeg, png, webp, gif, tiff verified |
| `confidence` | query | float `0.0`–`1.0` | Overrides the `YOLO_CONFIDENCE` setting |

```bash
curl -X POST "http://localhost:8000/v1/detect?confidence=0.55" \
  -F "image=@scan.jpg"
```

```json
{
  "detections": [
    {
      "label": "card",
      "confidence": 0.94,
      "bbox": { "x1": 0.102, "y1": 0.081, "x2": 0.491, "y2": 0.633 }
    }
  ],
  "count": 1,
  "image_width": 2550,
  "image_height": 3300,
  "inference_time_ms": 182.4,
  "model": "card_detector_obb.pt",
  "model_available": true,
  "confidence_threshold": 0.55
}
```

**Bounding boxes are normalized** — every coordinate is a fraction in `[0, 1]`, with
`(x1, y1)` top-left and `(x2, y2)` bottom-right. Multiply by `image_width` /
`image_height` for pixels:

```python
px1 = bbox["x1"] * resp["image_width"]
py1 = bbox["y1"] * resp["image_height"]
```

**Graceful degradation:** if the weights file is missing or `ultralytics` isn't
installed, the endpoint still returns `200` with `detections: []`, `count: 0`, and
`model_available: false` — it does *not* return `503`. Always branch on
`model_available` before treating an empty list as "no cards in this image".

Errors: `415` non-image content type · `413` larger than `MAX_FILE_SIZE` (default
100 MB) · `422` bytes could not be decoded as an image.

---

## `WS /v1/ws/{job_id}` — live progress

Preferred over polling `/v1/batch/status`. On connect the server immediately pushes
the current state, then a fresh frame on every change:

```json
{
  "status": "processing",
  "progress": 64,
  "message": "Enhancing card_033.jpg",
  "completed_images": 32,
  "failed_images": 0,
  "total_images": 50,
  "backend": "opencv"
}
```

The socket also accepts commands. Send a JSON object to cancel:

```json
{ "action": "cancel" }
```

and the server replies `{"action": "cancel", "success": true}` once the job is marked
cancelled. Malformed input is answered with `{"error": "Invalid JSON"}` or
`{"error": "Expected JSON object"}` and the connection stays open.

```javascript
const ws = new WebSocket(`ws://localhost:8000/v1/ws/${jobId}`);
ws.onmessage = (e) => {
  const s = JSON.parse(e.data);
  if (s.error) return console.warn(s.error);
  console.log(`${s.progress}% — ${s.message}`);
};
// later: ws.send(JSON.stringify({ action: "cancel" }));
```

---

## Configuration that shapes the API

Set in `.env` (see `.env.example`). Startup validation rejects bad values and exits
before the server accepts traffic, listing every problem at once.

| Variable | Default | Effect |
| --- | --- | --- |
| `UPSCALE_BACKEND` | `realesrgan` | `opencv` (local, no keys) or `realesrgan` (needs both API tokens below) |
| `HF_API_TOKEN` | — | Required when backend is `realesrgan` |
| `REPLICATE_API_TOKEN` | — | Required when backend is `realesrgan` |
| `YOLO_MODEL_PATH` | `models/card_detector_obb.pt` | Weights for `/v1/detect` |
| `YOLO_CONFIDENCE` | `0.4` | Default detection threshold, must be in `[0, 1]` |
| `YOLO_DEVICE` | `cpu` | `cpu` or `cuda` |
| `MAX_FILE_SIZE` | 100 MB | Upper bound for `/v1/detect` |
| `MAX_ZIP_SIZE` | 2 GB | Upper bound for `/v1/batch/upload` |
| `MAX_BATCH_SIZE` | 3000 | Images per job |
| `MAX_CONCURRENT_WORKERS` | `2` | Parallel enhancement workers, must be >= 1 |
| `CLEANUP_AFTER_HOURS` | `48` | When temp files and originals are purged |
| `CORS_ORIGINS` | `["*"]` | Credentials are only allowed when origins are explicit |

Running with `UPSCALE_BACKEND=opencv` needs no API keys at all — the fastest way to
exercise the API locally.

---

## Typical flow

```bash
# 1. confirm the backend that will be used
curl -s localhost:8000/v1/system | jq .active_backend

# 2. queue the batch
JOB=$(curl -s -X POST localhost:8000/v1/batch/upload \
        -F "zip_file=@cards.zip" -F "preset=worn_card" | jq -r .job_id)

# 3. watch it (or open the WebSocket instead)
until [ "$(curl -s localhost:8000/v1/batch/status/$JOB | jq -r .status)" = "completed" ]; do
  curl -s localhost:8000/v1/batch/status/$JOB | jq -r '"\(.progress)% \(.message)"'
  sleep 2
done

# 4. collect the enhanced files
curl -s localhost:8000/v1/batch/results/$JOB | jq -r '.results[].enhanced_path'
```
