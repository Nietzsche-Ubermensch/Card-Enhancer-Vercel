# API Reference

Minimal reference for the Card Enhancer backend. For full live schemas, use:

- `GET /docs`
- `GET /redoc`

## Conventions

- JSON by default
- `multipart/form-data` for uploads
- `settings_json` and `process_json` are JSON strings inside form data
- Job statuses: `pending`, `uploading`, `processing`, `completed`, `failed`, `cancelled`
- Card states: `queued`, `validating`, `processing`, `completed`, `failed`, `retrying`, `cancelled`

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/` | Service metadata and endpoint index |
| `GET` | `/health` | Health check |
| `GET` | `/providers` | Optional AI provider status |
| `POST` | `/upload` | Upload images without processing |
| `POST` | `/enhance` | Upload and start enhancement |
| `POST` | `/process` | Upload and run the core card pipeline |
| `POST` | `/preview` | Generate a quick preview image |
| `GET` | `/status/{job_id}` | Full job status and per-image results |
| `GET` | `/jobs/{job_id}/progress` | Compact batch progress counts |
| `DELETE` | `/jobs/{job_id}` | Delete a job and its generated files |
| `POST` | `/jobs/{job_id}/retry` | Retry failed cards |
| `POST` | `/jobs/{job_id}/orientation` | Override orientation and requeue cards |
| `POST` | `/jobs/{job_id}/export` | Export completed cards |
| `GET` | `/download/{job_id}` | Download metadata |
| `GET` | `/download/{job_id}/file` | Direct file download |
| `WS` | `/ws/{job_id}` | Real-time progress stream |

## Upload forms

### `POST /upload`

| Field | Type | Required | Notes |
|---|---|---|---|
| `files` | file[] | Yes | Supported image files |
| `settings_json` | string | No | `EnhancementSettings` JSON |

Response fields: `job_id`, `status`, `message`, `total_files`, `accepted_files`, `rejected_files`, `rejected_reasons`.

### `POST /enhance`

| Field | Type | Required | Notes |
|---|---|---|---|
| `files` | file[] | Yes | Images or `.zip` archives |
| `settings_json` | string | No | `EnhancementSettings` JSON |

Response fields: `job_id`, `status`, `message`, `estimated_time_seconds`.

### `POST /process`

Runs the built-in card pipeline: orientation -> crop -> perspective -> optimize.

| Field | Type | Required | Notes |
|---|---|---|---|
| `files` | file[] | Yes | Images or `.zip` archives |
| `process_json` | string | No | `ProcessRequest` JSON |
| `settings_json` | string | No | `EnhancementSettings` JSON |

Response fields: `job_id`, `status`, `message`, `estimated_time_seconds`.

### `POST /preview`

| Field | Type | Required | Notes |
|---|---|---|---|
| `file` | file | Yes | Single image |
| `settings_json` | string | No | `EnhancementSettings` JSON |

Returns the generated preview file directly.

## Job and export operations

### `GET /status/{job_id}`

Returns:

- top-level job fields: `job_id`, `status`, `progress`, `total_images`, `completed_images`, `failed_images`, `created_at`, `updated_at`
- `images`: per-card records with file info, progress, pipeline metadata, warnings, retry count, and detected blemishes

### `GET /jobs/{job_id}/progress`

Response fields: `total`, `queued`, `running`, `completed`, `failed`, `progress`.

### `DELETE /jobs/{job_id}`

Deletes the job and generated files. Running jobs are cancelled first.

### `POST /jobs/{job_id}/retry`

Query parameter:

| Field | Type | Required | Notes |
|---|---|---|---|
| `card_id` | string | No | Omit to retry all failed cards |

### `POST /jobs/{job_id}/orientation`

Query parameter:

| Field | Type | Required | Notes |
|---|---|---|---|
| `degrees` | number | Yes | Must be `0`, `90`, `180`, or `270` |

### `POST /jobs/{job_id}/export`

JSON body:

| Field | Type | Required | Notes |
|---|---|---|---|
| `image_ids` | string[] | No | Specific cards to export |
| `format` | string | No | Validated as `zip`, `png`, or `jpg` |

Response fields: `job_id`, `download_url`, `file_count`, `total_size_bytes`, `manifest`.

## Downloads

### `GET /download/{job_id}`

Response fields: `job_id`, `download_url`, `expires_at`, `total_size_bytes`, `file_count`.

### `GET /download/{job_id}/file`

Returns:

- a ZIP for multi-image jobs
- a single image for single-image jobs

## WebSocket

### `WS /ws/{job_id}`

Typical server message fields:

- `job_id`
- `image_id`
- `status`
- `progress`
- `message`
- `timestamp`

Client cancel message:

```json
{"action":"cancel"}
```

## Request schema highlights

### `EnhancementSettings`

Common fields:

- `blemish_removal`, `blemish_sensitivity`
- `sharpening`, `sharpening_amount`
- `color_correction`, `color_temperature`, `saturation`
- `contrast_enhancement`, `contrast_amount`
- `noise_reduction`, `noise_reduction_strength`
- `upscaling`, `upscale_factor`, `sr_model`
- `preserve_holographic`
- `output_format`, `output_quality`, `output_dpi`

### `ProcessRequest`

Fields:

- `manual_orientation`
- `output_format`
- `output_quality`
- `output_dpi`
- `aggressive`

## Common errors

- `400`: invalid JSON, unsupported files, invalid orientation, or premature download/export request
- `404`: unknown `job_id`
- `500`: preview failure or missing generated output
