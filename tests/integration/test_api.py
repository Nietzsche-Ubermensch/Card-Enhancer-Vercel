"""Integration tests for the FastAPI application."""
from __future__ import annotations

import io
import os
import zipfile

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image

os.environ.setdefault("UPSCALE_BACKEND", "opencv")
os.environ.setdefault("YOLO_MODEL_PATH", "models/nonexistent_for_test.pt")
os.environ.setdefault("YOLO_CONFIDENCE", "0.4")
os.environ.setdefault("YOLO_DEVICE", "cpu")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_integration.db")


def _png_bytes(size: tuple[int, int] = (64, 64)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color=(100, 150, 200)).save(buf, format="PNG")
    return buf.getvalue()


def _make_zip(*filenames: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name in filenames:
            zf.writestr(name, _png_bytes())
    return buf.getvalue()


@pytest.fixture(scope="module")
async def client():
    from app.db.database import init_db
    from app.main import app
    await init_db()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c
    try:
        os.remove("test_integration.db")
    except FileNotFoundError:
        pass


# ── /v1/system ───────────────────────────────────────────────────────────────

async def test_system_endpoint(client: AsyncClient):
    resp = await client.get("/v1/system")
    assert resp.status_code == 200
    data = resp.json()
    assert "app_name" in data
    assert "active_backend" in data
    assert "version" in data


# ── /v1/presets ──────────────────────────────────────────────────────────────

async def test_presets_endpoint(client: AsyncClient):
    resp = await client.get("/v1/presets")
    assert resp.status_code == 200
    data = resp.json()
    assert "presets" in data
    assert len(data["presets"]) >= 1
    first = data["presets"][0]
    assert "name" in first
    assert "description" in first


# ── /v1/batch/upload ─────────────────────────────────────────────────────────

async def test_upload_zip_returns_job_id(client: AsyncClient):
    z = _make_zip("card1.png", "card2.png")
    resp = await client.post(
        "/v1/batch/upload",
        files={"zip_file": ("cards.zip", z, "application/zip")},
        data={"preset": "mint_card"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "job_id" in data
    assert data["status"] == "pending"


async def test_upload_zip_with_preset(client: AsyncClient):
    z = _make_zip("card.png")
    resp = await client.post(
        "/v1/batch/upload",
        files={"zip_file": ("test.zip", z, "application/zip")},
        data={"preset": "worn_card"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"


# ── /v1/batch/status ─────────────────────────────────────────────────────────

async def test_job_status_not_found(client: AsyncClient):
    resp = await client.get("/v1/batch/status/nonexistent_job_xyz")
    assert resp.status_code == 404


async def test_job_status_after_upload(client: AsyncClient):
    z = _make_zip("img.png")
    upload = await client.post(
        "/v1/batch/upload",
        files={"zip_file": ("t.zip", z, "application/zip")},
        data={"preset": "mint_card"},
    )
    job_id = upload.json()["job_id"]

    resp = await client.get(f"/v1/batch/status/{job_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["job_id"] == job_id
    assert data["status"] in ("pending", "analyzing", "processing", "completed", "failed")


# ── /v1/detect ───────────────────────────────────────────────────────────────

async def test_detect_endpoint_returns_200_with_png(client: AsyncClient):
    png = _png_bytes((128, 128))
    resp = await client.post(
        "/v1/detect",
        files={"image": ("test.png", png, "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "detections" in data
    assert "count" in data
    assert "image_width" in data
    assert "image_height" in data
    assert "inference_time_ms" in data
    assert "model" in data
    assert "model_available" in data
    assert isinstance(data["detections"], list)


async def test_detect_returns_correct_image_dimensions(client: AsyncClient):
    png = _png_bytes((200, 150))
    resp = await client.post(
        "/v1/detect",
        files={"image": ("card.png", png, "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["image_width"] == 200
    assert data["image_height"] == 150


async def test_detect_with_confidence_override(client: AsyncClient):
    png = _png_bytes()
    resp = await client.post(
        "/v1/detect",
        files={"image": ("card.png", png, "image/png")},
        params={"confidence": 0.8},
    )
    assert resp.status_code == 200
    assert resp.json()["confidence_threshold"] == pytest.approx(0.8)


async def test_detect_model_unavailable_returns_empty_not_error(client: AsyncClient):
    """When weights are missing, endpoint returns 200 with empty detections."""
    png = _png_bytes()
    resp = await client.post(
        "/v1/detect",
        files={"image": ("card.png", png, "image/png")},
    )
    # Must succeed even without model weights
    assert resp.status_code == 200
    data = resp.json()
    assert data["model_available"] is False
    assert data["detections"] == []


async def test_detect_rejects_non_image(client: AsyncClient):
    resp = await client.post(
        "/v1/detect",
        files={"image": ("doc.txt", b"not an image", "text/plain")},
    )
    assert resp.status_code == 415


async def test_detect_rejects_corrupt_image(client: AsyncClient):
    resp = await client.post(
        "/v1/detect",
        files={"image": ("bad.png", b"\x00\x01\x02\x03garbage", "image/png")},
    )
    assert resp.status_code == 422
