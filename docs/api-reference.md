# API Reference

Concise reference for the Card Enhancer backend in
`/home/runner/work/Card-Enhancer-Vercel/Card-Enhancer-Vercel/sports-card-enhancer/backend/app/main.py`.

Interactive docs are also available at:

- `GET /docs`
- `GET /redoc`

## Base behavior

- Content type is JSON unless an endpoint explicitly returns a file.
- Upload endpoints use `multipart/form-data`.
- `settings_json` and `process_json` are JSON-encoded strings inside multipart form data.
- Job status values: `pending`, `uploading`, `processing`, `completed`, `failed`, `cancelled`.
- Card state values: `queued`, `validating`, `processing`, `completed`, `failed`, `retrying`, `cancelled`.

## Core endpoints

### `GET /`

Returns basic service metadata and a small endpoint index.

### `GET /health`

Returns service health:

| Field | Type | Notes |
|---|---|---|
| `status` | string | Expected value: `healthy` |
| `timestamp` | string | ISO timestamp |
| `version` | string | Backend version |

### `GET /providers`

Reports whether optional AI providers are configured.

| Field | Type | Notes |
|---|---|---|
| `any_configured` | boolean | `true` when at least one provider is configured |
| `configured_providers` | string[] | Provider names |
| `note` | string | Clarifies that providers are optional |

## Upload and processing

### `POST /upload`

Uploads images without starting processing.

**Form fields**

| Field | Type | Required | Notes |
|---|---|---|---|
| `files` | file[] | Yes | Supported image types only |
| `settings_json` | string | No | JSON matching `EnhancementSettings` |

**Response**

| Field | Type |
|---|---|
| `job_id` | string |
| `status` | string |
| `message` | string |
| `total_files` | number |
| `accepted_files` | number |
| `rejected_files` | number |
| `rejected_reasons` | string[] |

### `POST /enhance`

Uploads files and starts the enhancement pipeline.

Accepts image files and `.zip` archives containing images.

**Form fields**

| Field | Type | Required | Notes |
|---|---|---|---|
| `files` | file[] | Yes | Images or ZIP archives |
| `settings_json` | string | No | JSON matching `EnhancementSettings` |

**Response**

| Field | Type |
|---|---|
| `job_id` | string |
| `status` | string |
| `message` | string |
| `estimated_time_seconds` | number |

### `POST /process`

Uploads files and runs the core card pipeline without requiring an AI provider.

Pipeline summary: orientation -> crop -> perspective -> optimize.

**Form fields**

| Field | Type | Required | Notes |
|---|---|---|---|
| `files` | file[] | Yes | Images or ZIP archives |
| `process_json` | string | No | JSON matching `ProcessRequest` |
| `settings_json` | string | No | JSON matching `EnhancementSettings` |

**Response**

Same shape as `POST /enhance`.

### `POST /preview`

Generates a quick preview image for one uploaded file.

**Form fields**

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | file | Yes | Single image upload |
| `settings_json` | string | No | JSON matching `EnhancementSettings` |

**Response**

Returns the generated preview file directly.

## Job lifecycle

### `GET /status/{job_id}`

Returns full job state, aggregate progress, and per-image details.

Top-level response fields:

- `job_id`
- `status`
- `progress`
- `total_images`
- `completed_images`
- `failed_images`
- `images`
- `created_at`
- `updated_at`

Each item in `images` can include:

- file metadata: `id`, `filename`, `original_path`, `processed_path`, `width`, `height`, `format`, `size_bytes`
- progress metadata: `status`, `progress`, `processing_time_ms`, `error_message`
- pipeline metadata: `card_state`, `orientation`, `crop_confidence`, `metrics`, `artifacts`, `warnings`, `retry_count`
- blemish metadata: `detected_blemishes`

### `GET /jobs/{job_id}/progress`

Returns compact aggregate counts for a batch:

| Field | Type |
|---|---|
| `total` | number |
| `queued` | number |
| `running` | number |
| `completed` | number |
| `failed` | number |
| `progress` | number |

### `DELETE /jobs/{job_id}`

Deletes a job and related generated files. If the job is still running, it is cancelled first.

### `POST /jobs/{job_id}/retry`

Retries failed cards for a job.

**Query parameters**

| Field | Type | Required | Notes |
|---|---|---|---|
| `card_id` | string | No | When omitted, retries all failed cards |

### `POST /jobs/{job_id}/orientation`

Applies a manual orientation override and requeues the job's cards.

**Query parameters**

| Field | Type | Required | Notes |
|---|---|---|---|
| `degrees` | number | Yes | Must be `0`, `90`, `180`, or `270` |

### `POST /jobs/{job_id}/export`

Exports selected cards, or all completed cards when no image list is provided.

**JSON body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `image_ids` | string[] | No | Specific card IDs to export |
| `format` | string | No | Currently validated as `zip`, `png`, or `jpg` |

**Response**

| Field | Type |
|---|---|
| `job_id` | string |
| `download_url` | string |
| `file_count` | number |
| `total_size_bytes` | number |
| `manifest` | object |

## Downloads

### `GET /download/{job_id}`

Returns download metadata for a completed job.

| Field | Type |
|---|---|
| `job_id` | string |
| `download_url` | string |
| `expires_at` | string |
| `total_size_bytes` | number |
| `file_count` | number |

### `GET /download/{job_id}/file`

Returns the actual file download:

- a ZIP archive for multi-image jobs
- a single image file for single-image jobs

## WebSocket

### `GET /ws/{job_id}` (WebSocket)

Streams progress updates for a job.

Typical server message fields:

| Field | Type |
|---|---|
| `job_id` | string |
| `image_id` | string \| null |
| `status` | string |
| `progress` | number |
| `message` | string |
| `timestamp` | string |

The client may also send:

```json
{"action":"cancel"}
```

to request job cancellation.

## Request schema highlights

### `EnhancementSettings`

Main knobs accepted through `settings_json`:

- `blemish_removal`
- `blemish_sensitivity`
- `sharpening`
- `sharpening_amount`
- `color_correction`
- `color_temperature`
- `saturation`
- `contrast_enhancement`
- `contrast_amount`
- `noise_reduction`
- `noise_reduction_strength`
- `upscaling`
- `upscale_factor`
- `sr_model`
- `preserve_holographic`
- `output_format`
- `output_quality`
- `output_dpi`

### `ProcessRequest`

Main fields accepted through `process_json`:

- `manual_orientation`
- `output_format`
- `output_quality`
- `output_dpi`
- `aggressive`

## Common failure cases

- `400` for invalid JSON, unsupported files, invalid orientation, or requests made before job completion
- `404` for unknown `job_id`
- `500` for missing generated outputs or preview-generation failures
