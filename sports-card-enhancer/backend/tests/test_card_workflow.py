from __future__ import annotations

import io
import sys
import time
from pathlib import Path

import numpy as np
from fastapi.testclient import TestClient
from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.main import app
from app.services.descratch_service import descratch_service
from app.services.real_esrgan_service import RealESRGANService
from app.utils.image_utils import validate_upload


def make_sheet_bytes() -> bytes:
    image = Image.new("RGB", (1400, 1000), (45, 45, 45))
    draw = ImageDraw.Draw(image)
    for index, x in enumerate((170, 830), start=1):
        draw.rounded_rectangle((x, 180, x + 280, 620), radius=22, fill=(245, 245, 245), outline=(12, 12, 12), width=12)
        draw.text((x + 50, 510), f"CARD {index}", fill=(30, 30, 30))
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    return buffer.getvalue()


def wait_for_cards(client: TestClient, batch_id: str, minimum_cards: int = 1) -> dict:
    deadline = time.time() + 10
    latest = None
    while time.time() < deadline:
        latest = client.get(f"/api/batches/{batch_id}")
        payload = latest.json()
        if payload["batch"]["detected_card_count"] >= minimum_cards:
            return payload
        time.sleep(0.25)
    raise AssertionError(f"Timed out waiting for {minimum_cards} detected cards. Latest={latest.json() if latest else None}")


def wait_for_artifact(client: TestClient, card_id: str, artifact_key: str) -> dict:
    deadline = time.time() + 10
    latest = None
    while time.time() < deadline:
        latest = client.get(f"/api/cards/{card_id}")
        payload = latest.json()
        artifact = payload["artifacts"].get(artifact_key)
        if artifact:
            return payload
        time.sleep(0.25)
    raise AssertionError(f"Timed out waiting for artifact {artifact_key}. Latest={latest.json() if latest else None}")


def test_validate_upload_decodes_real_image() -> None:
    content = make_sheet_bytes()
    metadata = validate_upload(content, "sheet.png", "image/png")
    assert metadata["width"] == 1400
    assert metadata["height"] == 1000
    assert metadata["mime_type"] == "image/png"
    assert metadata["image"].shape[:2] == (1000, 1400)


def test_upscale_fallback_metadata() -> None:
    service = RealESRGANService()
    image = np.full((64, 64, 3), 120, dtype=np.uint8)
    output, used_real_sr, metadata = service.upscale_with_fallback(image, outscale=2.0)
    assert output.shape == (128, 128, 3)
    assert used_real_sr is False
    assert metadata.method == "lanczos_fallback"


def test_real_batch_upload_detects_cards_and_exports(tmp_path: Path) -> None:
    with TestClient(app) as client:
        batch_response = client.post("/api/batches")
        assert batch_response.status_code == 200
        batch_id = batch_response.json()["batch"]["batch_id"]

        upload_response = client.post(
            f"/api/batches/{batch_id}/sources",
            files=[("files", ("sheet.png", make_sheet_bytes(), "image/png"))],
        )
        assert upload_response.status_code == 200

        batch_payload = wait_for_cards(client, batch_id, minimum_cards=1)
        assert batch_payload["batch"]["source_count"] == 1
        assert batch_payload["batch"]["detected_card_count"] >= 1
        card_id = batch_payload["cards"][0]["card_id"]

        detail = client.get(f"/api/cards/{card_id}")
        assert detail.status_code == 200
        assert detail.json()["artifacts"]["RECTIFIED"] is not None

        upscale_response = client.post(f"/api/cards/{card_id}/upscale", json={"scale": 2})
        assert upscale_response.status_code == 200
        artifact_payload = wait_for_artifact(client, card_id, "UPSCALED")
        assert artifact_payload["artifacts"]["UPSCALED"]["processing_parameters"]["actual_scale"] == 2

        export_response = client.post(
            "/api/exports",
            json={
                "batch_id": batch_id,
                "scope": "selected_cards",
                "artifact_type": "RECTIFIED",
                "format": "png",
                "card_ids": [card_id],
            },
        )
        assert export_response.status_code == 200
        export_payload = export_response.json()["export"]
        assert export_payload["manifest"]["card_count"] == 1
        download = client.get(f"/api/exports/{export_payload['export_id']}/download")
        assert download.status_code == 200
        assert download.content


def test_descratch_detects_simple_scanner_line() -> None:
    image = np.full((300, 220, 3), 190, dtype=np.uint8)
    image[:, 105:108] = 20
    result = descratch_service.process(image, "medium")
    assert result.metadata["descratch_enabled"] is True
    assert result.metadata["candidate_count"] >= 1
    if result.success:
        assert result.image is not None
        assert not np.array_equal(result.image, image)
    else:
        assert result.warnings
