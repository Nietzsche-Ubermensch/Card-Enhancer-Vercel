FROM python:3.11-slim

# Dedicated non-root user
RUN useradd --create-home --shell /bin/bash appuser

WORKDIR /app

# System deps for OpenCV + health-check curl
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libsm6 libxrender1 libxext6 curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=appuser:appuser . .

# Runtime directories must be writable by appuser
RUN mkdir -p uploads temp outputs models \
    && chown -R appuser:appuser uploads temp outputs models

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
    CMD curl -f http://localhost:8000/v1/system || exit 1

CMD ["python", "run.py"]
