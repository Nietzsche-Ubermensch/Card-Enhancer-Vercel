"""Integration tests for the FastAPI application."""
from __future__ import annotations

import io
import os
import zipfile

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from PIL import Image

os.environ.setdefault("UPSCALER_BACKEND", "opencv")
os.environ.setdefault("FALLBACK_TO_CPU", "true")
os.environ.setdefault("DEBUG", "true")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_jobs.db")


def _png_bytes(size=(64, 64)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color=(100, 150, 200)).save(buf, format="PNG")
    return buf.getvalue()


def _make_zip(*filenames) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name in filenames:
            zf.writestr(name, _png_bytes())
    return buf.getvalue()


@pytest.fixture(scope="module")
def anyio_backend():
    return "asyncio"


@pytest_asyncio.fixture(scope="module")
async def client():
    from app.db.database import init_db
    from app.main import app
    await init_db()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as c:
        yield c
    # Clean up test DB
    try:
        os.remove("test_jobs.db")
    except FileNotFoundError:
        pass


@pytest.mark.anyio
async def test_system_endpoint(client: AsyncClient):
    resp = await client.get("/v1/system")
    assert resp.status_code == 200
    data = resp.json()
    assert "app_name" in data
    assert "active_backend" in data


@pytest.mark.anyio
async def test_presets_endpoint(client: AsyncClient):
    resp = await client.get("/v1/presets")
    assert resp.status_code == 200
    data = resp.json()
    assert "presets" in data
    assert len(data["presets"]) >= 1


@pytest.mark.anyio
async def test_upload_zip(client: AsyncClient):
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
    return data["job_id"]


@pytest.mark.anyio
async def test_job_status_not_found(client: AsyncClient):
    resp = await client.get("/v1/batch/status/nonexistentjob123")
    assert resp.status_code == 404
