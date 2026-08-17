"""End-to-end batch workflow tests with ZERO AI provider credentials.

Covers the product path: import -> orientation -> crop -> perspective ->
optimize -> batch process -> export. Failure isolation, retry, and original
preservation are verified. Concurrency is bounded.
"""
import asyncio
import json
import os
import zipfile

import numpy as np
import cv2
import pytest

from app.models.schemas import CardState, EnhancementSettings, JobStatus
from app.services.batch_processor import BatchProcessor


def _card(path, w=300, h=420, rotate=None, text_bar=True):
    img = np.random.randint(60, 200, (h, w, 3), dtype=np.uint8)
    cv2.rectangle(img, (10, 10), (w - 10, h - 10), (255, 255, 255), 2)
    if text_bar:
        cv2.rectangle(img, (20, 20), (w - 20, 60), (255, 255, 255), -1)
    if rotate == 90:
        img = cv2.rotate(img, cv2.ROTATE_90_CLOCKWISE)
    elif rotate == 180:
        img = cv2.rotate(img, cv2.ROTATE_180)
    elif rotate == 270:
        img = cv2.rotate(img, cv2.ROTATE_90_COUNTERCLOCKWISE)
    cv2.imwrite(str(path), cv2.cvtColor(img, cv2.COLOR_RGB2BGR))
    return str(path)


@pytest.fixture
def processor(tmp_path, monkeypatch):
    """A BatchProcessor writing to a temp output dir."""
    from app.core.config import settings
    out = tmp_path / "outputs"
    out.mkdir()
    monkeypatch.setattr(settings, "OUTPUT_DIR", out)
    return BatchProcessor(max_concurrent=2, max_concurrent_cards=3)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


async def _wait_done(proc, job_id, timeout=60):
    """Wait until all cards reach a terminal state."""
    terminal = {CardState.COMPLETED, CardState.FAILED, CardState.CANCELLED}
    for _ in range(int(timeout * 10)):
        job = await proc.get_job(job_id)
        if job and all(c.state in terminal for c in job.cards):
            return job
        await asyncio.sleep(0.1)
    raise TimeoutError("job did not finish")


class TestBatchSizes:
    def test_single_card(self, processor, tmp_path):
        async def go():
            await processor.start()
            src = _card(tmp_path / "one.png")
            job_id = await processor.submit_job([src], EnhancementSettings())
            job = await _wait_done(processor, job_id)
            await processor.stop()
            return job
        job = asyncio.run(go())
        assert job.cards[0].state == CardState.COMPLETED
        assert os.path.exists(job.cards[0].output_path)
        # Original preserved.
        assert os.path.exists(job.cards[0].source_path)

    def test_five_cards(self, processor, tmp_path):
        async def go():
            await processor.start()
            srcs = [_card(tmp_path / f"c{i}.png") for i in range(5)]
            job_id = await processor.submit_job(srcs, EnhancementSettings())
            job = await _wait_done(processor, job_id)
            await processor.stop()
            return job
        job = asyncio.run(go())
        assert all(c.state == CardState.COMPLETED for c in job.cards)
        assert len(job.cards) == 5

    def test_twenty_cards(self, processor, tmp_path):
        async def go():
            await processor.start()
            srcs = [_card(tmp_path / f"c{i}.png", w=120, h=160) for i in range(20)]
            job_id = await processor.submit_job(srcs, EnhancementSettings())
            job = await _wait_done(processor, job_id, timeout=120)
            await processor.stop()
            return job
        job = asyncio.run(go())
        assert all(c.state == CardState.COMPLETED for c in job.cards)
        assert len(job.cards) == 20


class TestOrientationAndRotation:
    def test_rotated_cards_produce_orientation_metadata(self, processor, tmp_path):
        async def go():
            await processor.start()
            srcs = [
                _card(tmp_path / "up.png"),
                _card(tmp_path / "r90.png", rotate=90),
                _card(tmp_path / "r180.png", rotate=180),
                _card(tmp_path / "r270.png", rotate=270),
            ]
            job_id = await processor.submit_job(srcs, EnhancementSettings())
            job = await _wait_done(processor, job_id)
            await processor.stop()
            return job
        job = asyncio.run(go())
        for card in job.cards:
            assert card.state == CardState.COMPLETED
            assert card.orientation is not None
            assert card.orientation["orientation_degrees"] in (0, 90, 180, 270)
            assert "orientation_confidence" in card.orientation
            assert "orientation_method" in card.orientation

    def test_manual_orientation_override(self, processor, tmp_path):
        async def go():
            await processor.start()
            src = _card(tmp_path / "m.png")
            job_id = await processor.submit_job(
                [src], EnhancementSettings(),
                process_options={"manual_orientation": 90},
            )
            job = await _wait_done(processor, job_id)
            await processor.stop()
            return job
        job = asyncio.run(go())
        assert job.cards[0].orientation["orientation_method"] == "manual"
        assert job.cards[0].orientation["orientation_degrees"] == 90


class TestFailureIsolationAndRetry:
    def test_one_bad_file_does_not_fail_batch(self, processor, tmp_path):
        async def go():
            await processor.start()
            good = [_card(tmp_path / f"g{i}.png") for i in range(3)]
            bad = tmp_path / "corrupt.png"
            bad.write_bytes(b"this is not an image")
            job_id = await processor.submit_job(good + [str(bad)], EnhancementSettings())
            job = await _wait_done(processor, job_id)
            await processor.stop()
            return job
        job = asyncio.run(go())
        states = [c.state for c in job.cards]
        assert states.count(CardState.COMPLETED) == 3
        assert states.count(CardState.FAILED) == 1
        # Batch as a whole completed (partial success).
        assert job.status == JobStatus.COMPLETED
        counts = job.counts()
        assert counts["completed"] == 3 and counts["failed"] == 1

    def test_retry_failed_card(self, processor, tmp_path):
        async def go():
            await processor.start()
            good = _card(tmp_path / "good.png")
            bad = tmp_path / "bad.png"
            bad.write_bytes(b"junk")
            job_id = await processor.submit_job([good, str(bad)], EnhancementSettings())
            job = await _wait_done(processor, job_id)
            assert job.counts()["failed"] == 1

            # Fix the bad file in place, then retry it.
            _card(bad)
            requeued = await processor.retry_failed(job_id)
            assert requeued == 1
            job = await _wait_done(processor, job_id)
            await processor.stop()
            return job
        job = asyncio.run(go())
        assert all(c.state == CardState.COMPLETED for c in job.cards)
        assert job.counts()["failed"] == 0


class TestExport:
    def test_export_all_completed_zip_and_manifest(self, processor, tmp_path):
        async def go():
            await processor.start()
            srcs = [_card(tmp_path / f"e{i}.png") for i in range(3)]
            job_id = await processor.submit_job(srcs, EnhancementSettings())
            job = await _wait_done(processor, job_id)
            result = await processor.export(job_id)
            await processor.stop()
            return job, result
        job, result = asyncio.run(go())
        assert result is not None
        assert result["file_count"] == 3
        assert os.path.exists(result["zip_path"])
        with zipfile.ZipFile(result["zip_path"]) as zf:
            assert "CardEnhance_Export/manifest.json" in zf.namelist()
            manifest = json.loads(zf.read("CardEnhance_Export/manifest.json"))
            assert manifest["image_count"] == 3
            imgs = [n for n in zf.namelist()
                    if n.startswith("CardEnhance_Export/images/")]
            assert len(imgs) == 3

    def test_export_selected(self, processor, tmp_path):
        async def go():
            await processor.start()
            srcs = [_card(tmp_path / f"s{i}.png") for i in range(4)]
            job_id = await processor.submit_job(srcs, EnhancementSettings())
            job = await _wait_done(processor, job_id)
            selected = [job.cards[0].id, job.cards[2].id]
            result = await processor.export(job_id, image_ids=selected)
            await processor.stop()
            return result
        result = asyncio.run(go())
        assert result is not None
        assert result["file_count"] == 2

    def test_export_none_completed_returns_none(self, processor, tmp_path):
        async def go():
            await processor.start()
            bad = tmp_path / "bad.png"
            bad.write_bytes(b"junk")
            job_id = await processor.submit_job([str(bad)], EnhancementSettings())
            await _wait_done(processor, job_id)
            result = await processor.export(job_id)
            await processor.stop()
            return result
        assert asyncio.run(go()) is None


class TestArtifactsAndPreservation:
    def test_distinct_artifacts_and_original_preserved(self, processor, tmp_path):
        src = _card(tmp_path / "orig.png")
        original_bytes = open(src, "rb").read()

        async def go():
            await processor.start()
            job_id = await processor.submit_job([src], EnhancementSettings())
            job = await _wait_done(processor, job_id)
            await processor.stop()
            return job
        job = asyncio.run(go())
        card = job.cards[0]
        assert card.state == CardState.COMPLETED

        # Distinct artifacts exist.
        arts = card.artifacts
        for key in ("normalized", "rectified", "optimized"):
            assert arts.get(key) and os.path.exists(arts[key]), key
        # Original untouched.
        assert os.path.exists(src)
        assert open(src, "rb").read() == original_bytes
        assert arts["original"] == src


class TestNoProviderConfigured:
    def test_core_workflow_without_any_provider(self, processor, tmp_path, monkeypatch):
        # Ensure no provider env keys are set.
        for var in ("GEMINI_API_KEY", "OPENAI_API_KEY", "OPENROUTER_API_KEY",
                    "VENICE_API_KEY", "XAI_API_KEY"):
            monkeypatch.delenv(var, raising=False)

        from app.services.providers import ProviderManager
        mgr = ProviderManager()
        assert mgr.any_configured() is False

        # The card workflow must still work.
        async def go():
            await processor.start()
            src = _card(tmp_path / "np.png")
            job_id = await processor.submit_job([src], EnhancementSettings())
            job = await _wait_done(processor, job_id)
            await processor.stop()
            return job
        job = asyncio.run(go())
        assert job.cards[0].state == CardState.COMPLETED

        # Provider call degrades gracefully.
        result = mgr.call("anything")
        assert result.success is False
        assert result.failure_reason == "AI_AUGMENTATION_UNAVAILABLE"
