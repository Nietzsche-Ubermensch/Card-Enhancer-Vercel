# Card Enhancer Deployment

This repository deploys **Card Enhancer** — a React/Vite frontend and a FastAPI
backend — as a single self-contained service. It has **no dependency on any
specific hosting platform** (no Vercel, Netlify, etc.); the whole stack runs
from one Docker container.

## Architecture

| Component | Path | Tech |
|-----------|------|------|
| Frontend  | `sports-card-enhancer/app` | React 19 + Vite 7 + TypeScript |
| Backend   | `sports-card-enhancer/backend` | FastAPI + Uvicorn |

In a single-service deployment the FastAPI backend serves the built frontend
(`app/dist`) as static files at `/` and exposes the REST/WebSocket API under the
same origin. Because they share an origin, **no CORS configuration is needed**
and the frontend does not need `VITE_API_URL` set.

## Build & run with Docker (recommended)

```bash
docker build -t card-enhancer .
docker run -p 8000:8000 card-enhancer
```

Then open http://localhost:8000 — the frontend loads and talks to the backend
on the same origin.

- Health check: `GET /health`
- API docs: `GET /docs`

## Deploy to a platform

### Render.com

The included `render.yaml` blueprint deploys the Docker image:

1. Push this repository to GitHub.
2. In Render: **New → Blueprint** → pick the repo. Render reads `render.yaml`
   and builds the root `Dockerfile`.
3. Render injects `PORT`; the container listens on it automatically.

### Fly.io

The included `fly.toml` targets the root `Dockerfile`:

```bash
fly launch --no-deploy   # optional: customize app name/region
fly deploy
```

### Any other container platform (Railway, ECS, Cloud Run, a VM, …)

Build the root `Dockerfile` and route traffic to the container's `$PORT`
(default 8000). No platform-specific configuration is required.

## Environment variables

### Backend (FastAPI)

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8000` | Port the server binds to (platforms inject this) |
| `HOST` | `0.0.0.0` | Bind host |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins. Set to your frontend origin when hosting the frontend separately. |
| `USE_GPU` | `true` in config, `false` in Docker | Enable CUDA acceleration |
| `MAX_FILE_SIZE` | `52428800` (50MB) | Max single upload size |
| `MAX_BATCH_SIZE` | `100` | Max images per job |
| `STATIC_DIR` | `./static` | Directory of built frontend assets to serve |
| `HUGGINGFACE_API_TOKEN` | — | Optional, for model downloads |
| `REPLICATE_API_TOKEN` | — | Optional, for alternative inference |

Set secrets via your platform's environment-variable facility. Never commit
`.env` files (they are git-ignored).

### Frontend (Vite)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_URL` | same-origin (or `http://localhost:8000` in dev) | Base URL of the backend. Only needed when the frontend is hosted **separately** from the backend. Must be set at **build time** (`VITE_API_URL=https://api.example.com pnpm build`). |

## Split hosting (optional)

To host the frontend and backend on different origins:

1. Build the frontend with the backend URL baked in:
   `VITE_API_URL=https://your-backend.example.com pnpm build`
2. Serve `sports-card-enhancer/app/dist` from any static host.
3. On the backend set `CORS_ORIGINS=https://your-frontend.example.com`.

The frontend resolves relative `download_url` paths returned by the API against
`VITE_API_URL`, so downloads work cross-origin.

## Local development

```bash
# Backend
cd sports-card-enhancer/backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (in another shell)
cd sports-card-enhancer/app
pnpm install
pnpm dev   # uses http://localhost:8000 as the API by default
```

## Notes on ML models

Real-ESRGAN super-resolution weights are downloaded lazily on first use. If the
models are unavailable (no network / no GPU), the service automatically falls
back to high-quality Lanczos interpolation, so the API remains functional.
