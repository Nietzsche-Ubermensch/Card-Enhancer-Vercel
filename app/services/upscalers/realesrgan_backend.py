from __future__ import annotations

import io
import time
from pathlib import Path
from typing import Any, Dict

import cv2
import httpx
import numpy as np
from PIL import Image

from app.core.config import settings
from app.core.constants import (
    CARD_WARP_HEIGHT,
    CARD_WARP_WIDTH,
    CONTOUR_APPROX_EPSILON,
    MIN_CONTOUR_AREA_RATIO,
    REPLICATE_OUTPUT_FETCH_TIMEOUT_SECONDS,
    SWINIR_MAX_RETRIES,
    SWINIR_RETRY_BASE_WAIT_SECONDS,
    SWINIR_TIMEOUT_SECONDS,
)
from app.utils.logger import log


class RealESRGANBackend:
    """
    Three-stage pipeline:
      0. Card crop  (OpenCV contour / perspective warp)
      1. LaMa       (Replicate) — scratch inpainting with auto mask
      2. SwinIR     (HF Inference API) — denoise + artefact removal
      3. Real-ESRGAN (Replicate) — 4x super-resolution

    Each stage degrades gracefully on failure.
    """

    name = "LaMa + SwinIR + Real-ESRGAN (API)"

    # Verified working Replicate version hashes (April 2026)
    # daanelson/lama is deprecated/private — allenhooo/lama is the active public fork
    _LAMA_VERSION = "allenhooo/lama"
    _REALESRGAN_VERSION = (
        "nightmareai/real-esrgan:"
        "f121d640bd286e1fdc67f9799164c1d5be36ff74576ee11c803ae5b665dd46aa"
    )

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    def enhance(self, input_path: str, output_path: str, opts: Dict[str, Any]) -> str:
        fmt     = str(opts.get("format", "png")).lower()
        quality = int(opts.get("quality", 95))

        img = Image.open(input_path).convert("RGB")
        log.info(f"[Pipeline] Start {Path(input_path).name}  {img.size}")
        t0 = time.time()

        # Stage 0 — card crop
        if not opts.get("_skip_crop", False):
            try:
                img = self._crop_card(img)
                log.info(f"[Pipeline] Crop -> {img.size}")
            except Exception as exc:
                log.warning(f"[Pipeline] Crop skipped: {exc}")
        else:
            log.info("[Pipeline] Contour crop skipped (YOLO already ran)")

        # Stage 1 — LaMa scratch inpainting
        try:
            img = self._run_lama(img)
            log.info("[Pipeline] LaMa done")
        except Exception as exc:
            log.warning(f"[Pipeline] LaMa skipped: {exc}")

        # Stage 2 — SwinIR denoising
        try:
            img = self._run_swinir(img)
            log.info(f"[Pipeline] SwinIR -> {img.size}")
        except Exception as exc:
            log.warning(f"[Pipeline] SwinIR skipped: {exc}")

        # Stage 3 — Real-ESRGAN 4x upscale
        try:
            img = self._run_realesrgan(img)
            log.info(f"[Pipeline] Real-ESRGAN -> {img.size}")
        except Exception as exc:
            log.warning(f"[Pipeline] Real-ESRGAN skipped: {exc}")

        self._write(img, output_path, fmt, quality)
        log.info(f"[Pipeline] Finished in {time.time() - t0:.2f}s -> {output_path}")
        return output_path

    # ------------------------------------------------------------------ #
    #  Stage 0 — Card crop                                                #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _crop_card(img: Image.Image) -> Image.Image:
        cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        gray   = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
        blur   = cv2.GaussianBlur(gray, (5, 5), 0)
        edges  = cv2.Canny(blur, 50, 150)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return img
        largest  = max(contours, key=cv2.contourArea)
        img_area = img.width * img.height
        if cv2.contourArea(largest) < img_area * MIN_CONTOUR_AREA_RATIO:
            return img
        peri   = cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, CONTOUR_APPROX_EPSILON * peri, True)
        if len(approx) == 4:
            pts     = approx.reshape(4, 2).astype("float32")
            s       = pts.sum(axis=1)
            diff    = np.diff(pts, axis=1)
            ordered = np.array([
                pts[np.argmin(s)],
                pts[np.argmin(diff)],
                pts[np.argmax(s)],
                pts[np.argmax(diff)],
            ], dtype="float32")
            dst    = np.array(
                [[0, 0], [CARD_WARP_WIDTH - 1, 0],
                 [CARD_WARP_WIDTH - 1, CARD_WARP_HEIGHT - 1], [0, CARD_WARP_HEIGHT - 1]],
                dtype="float32",
            )
            M      = cv2.getPerspectiveTransform(ordered, dst)
            warped = cv2.warpPerspective(cv_img, M, (CARD_WARP_WIDTH, CARD_WARP_HEIGHT))
            return Image.fromarray(cv2.cvtColor(warped, cv2.COLOR_BGR2RGB))
        x, y, w, h = cv2.boundingRect(largest)
        return img.crop((x, y, x + w, y + h))

    # ------------------------------------------------------------------ #
    #  Stage 1 — LaMa via Replicate                                       #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _make_scratch_mask(img: Image.Image) -> Image.Image | None:
        gray     = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
        kernel   = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 25))
        tophat   = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, kernel)
        _, mask  = cv2.threshold(tophat, 20, 255, cv2.THRESH_BINARY)
        dilate_k = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        mask     = cv2.dilate(mask, dilate_k, iterations=2)
        if mask.sum() < mask.size * 0.001 * 255:
            return None
        return Image.fromarray(mask).convert("RGB")

    @staticmethod
    def _pil_to_bytes(img: Image.Image, fmt: str = "PNG") -> bytes:
        buf = io.BytesIO()
        img.save(buf, fmt)
        buf.seek(0)
        return buf.getvalue()

    @staticmethod
    def _read_replicate_output(output: Any) -> Image.Image:
        """Handles replicate SDK >=1.0 FileOutput / iterator / legacy URL string."""
        if hasattr(output, "read"):
            return Image.open(output).convert("RGB")
        if hasattr(output, "__iter__"):
            first = next(iter(output))
            if hasattr(first, "read"):
                return Image.open(first).convert("RGB")
            resp = httpx.get(str(first), timeout=REPLICATE_OUTPUT_FETCH_TIMEOUT_SECONDS)
            resp.raise_for_status()
            return Image.open(io.BytesIO(resp.content)).convert("RGB")
        resp = httpx.get(str(output), timeout=REPLICATE_OUTPUT_FETCH_TIMEOUT_SECONDS)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")

    def _run_lama(self, img: Image.Image) -> Image.Image:
        import replicate
        if not settings.REPLICATE_API_TOKEN:
            raise RuntimeError("REPLICATE_API_TOKEN not set")
        mask = self._make_scratch_mask(img)
        if mask is None:
            log.info("[LaMa] No scratches detected — skipping")
            return img
        output = replicate.run(
            self._LAMA_VERSION,
            input={
                "image": io.BytesIO(self._pil_to_bytes(img)),
                "mask":  io.BytesIO(self._pil_to_bytes(mask)),
            },
        )
        return self._read_replicate_output(output)

    # ------------------------------------------------------------------ #
    #  Stage 2 — SwinIR via HF Inference API                             #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _pad_to_mult8(img: Image.Image) -> Image.Image:
        w, h = img.size
        nw   = (w + 7) // 8 * 8
        nh   = (h + 7) // 8 * 8
        if nw == w and nh == h:
            return img
        padded = Image.new("RGB", (nw, nh), (0, 0, 0))
        padded.paste(img, (0, 0))
        return padded

    def _run_swinir(self, img: Image.Image) -> Image.Image:
        if not settings.HF_API_TOKEN:
            raise RuntimeError("HF_API_TOKEN not set")
        padded    = self._pad_to_mult8(img)
        buf       = io.BytesIO()
        padded.save(buf, "PNG")
        raw_bytes = buf.getvalue()

        last_exc: Exception | None = None
        for attempt in range(SWINIR_MAX_RETRIES):
            try:
                resp = httpx.post(
                    "https://api-inference.huggingface.co/models/caidas/swin2SR-classical-sr-x4-64",
                    headers={
                        "Authorization": f"Bearer {settings.HF_API_TOKEN}",
                        "Content-Type":  "image/png",
                    },
                    content=raw_bytes,
                    timeout=SWINIR_TIMEOUT_SECONDS,
                )
                if resp.status_code == 503:
                    wait = SWINIR_RETRY_BASE_WAIT_SECONDS * (attempt + 1)
                    log.info(
                        f"[SwinIR] 503 cold start, retrying in {wait}s "
                        f"(attempt {attempt + 1}/{SWINIR_MAX_RETRIES})"
                    )
                    time.sleep(wait)
                    continue
                if resp.status_code != 200:
                    raise RuntimeError(f"SwinIR HTTP {resp.status_code}: {resp.text[:200]}")
                return Image.open(io.BytesIO(resp.content)).convert("RGB")
            except (httpx.RemoteProtocolError, httpx.ReadTimeout) as exc:
                last_exc = exc
                wait = SWINIR_RETRY_BASE_WAIT_SECONDS * (attempt + 1)
                log.info(
                    f"[SwinIR] Connection error, retrying in {wait}s "
                    f"(attempt {attempt + 1}/{SWINIR_MAX_RETRIES})"
                )
                time.sleep(wait)

        raise RuntimeError(f"SwinIR failed after {SWINIR_MAX_RETRIES} attempts: {last_exc}")

    # ------------------------------------------------------------------ #
    #  Stage 3 — Real-ESRGAN via Replicate                                #
    # ------------------------------------------------------------------ #

    def _run_realesrgan(self, img: Image.Image) -> Image.Image:
        import replicate
        if not settings.REPLICATE_API_TOKEN:
            raise RuntimeError("REPLICATE_API_TOKEN not set")
        buf = io.BytesIO()
        img.save(buf, "PNG")
        buf.seek(0)
        output = replicate.run(
            self._REALESRGAN_VERSION,
            input={"image": buf, "scale": 4, "face_enhance": False},
        )
        return self._read_replicate_output(output)

    # ------------------------------------------------------------------ #
    #  Output writer                                                       #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _write(img: Image.Image, path: str, fmt: str, quality: int) -> None:
        if fmt in ("jpg", "jpeg"):
            img.save(path, "JPEG", quality=quality, optimize=True)
        elif fmt == "webp":
            img.save(path, "WEBP", quality=quality)
        elif fmt in ("tiff", "tif"):
            img.save(path, "TIFF")
        else:
            img.save(path, "PNG", optimize=True)
