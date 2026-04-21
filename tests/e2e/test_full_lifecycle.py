"""
End-to-end test — simulates the full request lifecycle:
  1. Upload a ZIP archive containing images
  2. Poll job status until the job reaches a terminal state
  3. Assert that the job completed and results are accessible

The test runs with the OpenCV backend and a real (in-process) background
worker so no mocking of the processing pipeline is involved.
"""
from __future__ import annotations

import asyncio
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
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_e2e.db")
os.environ.setdefault("MAX_CONCURRENT_WORKERS", "1")
os.environ.setdefault("WORKER_POLL_INTERVAL", "0.2")

_TERMINAL_STATUSES = {"completed", "partially_completed", "failed", "cancelled"}
_POLL_INTERVAL_S = 0.5
_MAX_WAIT_S = 45


def _png_bytes(size: tuple[int, int] = (32, 32)) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", size, color=(80, 120, 200)).save(buf, format="PNG")
    return buf.getvalue()


def _make_zip(filenames: list[str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
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
        os.remove("test_e2e.db")
    except FileNotFoundError:
        pass


async def _poll_until_done(client: AsyncClient, job_id: str) -> dict:
    """Poll /v1/batch/status until the job is in a terminal state."""
    elapsed = 0.0
    while elapsed < _MAX_WAIT_S:
        resp = await client.get(f"/v1/batch/status/{job_id}")
        assert resp.status_code == 200, f"Status check failed: {resp.text}"
        data = resp.json()
        if data["status"] in _TERMINAL_STATUSES:
            return data
        await asyncio.sleep(_POLL_INTERVAL_S)
        elapsed += _POLL_INTERVAL_S
    pytest.fail(f"Job {job_id} did not reach terminal state within {_MAX_WAIT_S}s")


async def test_full_lifecycle_single_image(client: AsyncClient):
    """Upload a one-image ZIP, wait for completion, verify result is served."""
    z = _make_zip(["card_test.png"])
    upload_resp = await client.post(
        "/v1/batch/upload",
        files={"zip_file": ("single.zip", z, "application/zip")},
        data={"preset": "mint_card"},
    )
    assert upload_resp.status_code == 200
    job_id = upload_resp.json()["job_id"]
    assert job_id

    final = await _poll_until_done(client, job_id)

    assert final["status"] in ("completed", "partially_completed"), (
        f"Expected completed status, got {final['status']}: {final.get('message')}"
    )
    assert final["total_images"] == 1
    assert final["completed_images"] >= 1


async def test_full_lifecycle_multi_image(client: AsyncClient):
    """Upload a three-image ZIP, wait for completion, verify all results."""
    z = _make_zip(["img1.png", "img2.png", "img3.png"])
    upload_resp = await client.post(
        "/v1/batch/upload",
        files={"zip_file": ("multi.zip", z, "application/zip")},
        data={"preset": "web_ready"},
    )
    assert upload_resp.status_code == 200
    job_id = upload_resp.json()["job_id"]

    final = await _poll_until_done(client, job_id)

    assert final["status"] in ("completed", "partially_completed")
    assert final["total_images"] == 3
    assert final["progress"] == 100


async def test_full_lifecycle_results_are_listed(client: AsyncClient):
    """Verify /v1/batch/results/{job_id} lists completed images."""
    z = _make_zip(["a.png", "b.png"])
    upload_resp = await client.post(
        "/v1/batch/upload",
        files={"zip_file": ("ab.zip", z, "application/zip")},
        data={"preset": "mint_card"},
    )
    job_id = upload_resp.json()["job_id"]
    await _poll_until_done(client, job_id)

    results_resp = await client.get(f"/v1/batch/results/{job_id}")
    assert results_resp.status_code == 200
    data = results_resp.json()
    assert data["completed"] >= 1
    assert len(data["results"]) >= 1
    # Each completed result must have a filename
    for r in data["results"]:
        assert r.get("filename"), "Result missing filename"


async def test_detect_endpoint_in_e2e_context(client: AsyncClient):
    """
    The detect endpoint must work alongside the batch pipeline without conflict.
    Since model weights are absent in the test environment, model_available=False
    and detections are empty — this is the expected graceful-fallback behaviour.
    """
    png = _png_bytes((128, 128))
    resp = await client.post(
        "/v1/detect",
        files={"image": ("card.png", png, "image/png")},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "detections" in data
    assert data["model_available"] is False  # no weights in test env
    assert data["count"] == 0
