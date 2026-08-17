# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Stage 1: build the React/Vite frontend
# ---------------------------------------------------------------------------
FROM node:22-slim AS frontend-builder
WORKDIR /frontend

# Install pnpm (the frontend uses a pnpm lockfile). Pin via npm rather than
# corepack so the build does not depend on corepack's registry metadata fetch.
RUN npm install -g pnpm@10

COPY sports-card-enhancer/app/package.json sports-card-enhancer/app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY sports-card-enhancer/app/ ./
# The backend is served same-origin in this image, so no VITE_API_URL is needed;
# the frontend falls back to window.location.origin.
RUN pnpm build


# ---------------------------------------------------------------------------
# Stage 2: FastAPI backend runtime (serves the built frontend as static files)
# ---------------------------------------------------------------------------
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# System libraries required by OpenCV / image stack
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY sports-card-enhancer/backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY sports-card-enhancer/backend/ ./

# Copy built frontend assets (served by FastAPI at "/")
COPY --from=frontend-builder /frontend/dist ./static

# Runtime directories for uploads/outputs/temp/models
RUN mkdir -p uploads outputs temp models

# Non-root user for security
RUN useradd --create-home --uid 10001 appuser \
    && chown -R appuser:appuser /app
USER appuser

# Default port; platforms like Render/Fly inject $PORT
ENV PORT=8000 \
    HOST=0.0.0.0 \
    USE_GPU=false

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD python -c "import os,urllib.request;urllib.request.urlopen('http://127.0.0.1:'+os.environ.get('PORT','8000')+'/health',timeout=4)"

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
