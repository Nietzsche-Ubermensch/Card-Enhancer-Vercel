from __future__ import annotations

import io
import time
from pathlib import Path
from typing import Any, Dict

import cv2
import httpx
import numpy as np
from PIL import Image

from app.core.config import settings  # single source of truth for tokens
from app.utils.logger import log


class RealESRGANBackend:
    """
    Three-stage pipeline:
      0. Card crop  (OpenCV contour / perspective warp)
      1. LaMa       (Replicate) — scratch / defect inpainting with auto mask
      2. SwinIR     (HF Inference API, raw bytes) — denoise + artefact removal
      3. Real-ESRGAN (Replicate) — 4x super-resolution

    Each stage falls back gracefully: failure passes the previous
    result unchanged to the next stage.
    """

    name = "LaMa + SwinIR + Real-ESRGAN (API)"

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
        # Skipped if YOLO already cropped upstream (enhancement_service sets _skip_crop)
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
        if cv2.contourArea(largest) < img_area * 0.20:
            return img
        peri   = cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, 0.02 * peri, True)
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
            dst = np.array([[0, 0], [499, 0], [499, 699], [0, 699]], dtype="float32")
            M   = cv2.getPerspectiveTransform(ordered, dst)
            warped = cv2.warpPerspective(cv_img, M, (500, 700))
            return Image.fromarray(cv2.cvtColor(warped, cv2.COLOR_BGR2RGB))
        x, y, w, h = cv2.boundingRect(largest)
        return img.crop((x, y, x + w, y + h))

    # ------------------------------------------------------------------ #
    #  Stage 1 — LaMa via Replicate (with auto scratch mask)              #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _make_scratch_mask(img: Image.Image) -> Image.Image | None:
        """
        Detect bright linear scratches via morphological top-hat + threshold.
        Returns a binary PIL mask (white = damaged), or None if no scratches found.
        """
        gray = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
        # Top-hat: isolates thin bright structures
        kernel  = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 25))
        tophat  = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, kernel)
        _, mask = cv2.threshold(tophat, 20, 255, cv2.THRESH_BINARY)
        # Dilate slightly so LaMa has context around each scratch
        dilate_k = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
        mask     = cv2.dilate(mask, dilate_k, iterations=2)
        # Only proceed if scratches cover more than 0.1% of image
        if mask.sum() < mask.size * 0.001 * 255:
            return None
        return Image.fromarray(mask).convert("RGB")

    @staticmethod
    def _pil_to_bytes(img: Image.Image, fmt: str = "PNG") -> bytes:
        buf = io.BytesIO()
        img.save(buf, fmt)
        buf.seek(0)
        return buf.getvalue()

    def _run_lama(self, img: Image.Image) -> Image.Image:
        import replicate
        if not settings.REPLICATE_API_TOKEN:
            raise RuntimeError("REPLICATE_API_TOKEN not set")

        mask = self._make_scratch_mask(img)
        if mask is None:
            log.info("[LaMa] No scratches detected — skipping")
            return img

        img_bytes  = self._pil_to_bytes(img)
        mask_bytes = self._pil_to_bytes(mask)

        output = replicate.run(
            "daanelson/lama:fb8af171cfa1616ddcf1242c851ffe6"
            "ae2780e99d0a0b9b4c42597fe9f28ad17",
            input={
                "image": io.BytesIO(img_bytes),
                "mask":  io.BytesIO(mask_bytes),
            },
        )

        # replicate SDK >=1.0 returns FileOutput or an iterator — handle both
        if hasattr(output, "read"):          # FileOutput
            return Image.open(output).convert("RGB")
        if hasattr(output, "__iter__"):      # iterator of FileOutput / URLs
            first = next(iter(output))
            if hasattr(first, "read"):
                return Image.open(first).convert("RGB")
            # Legacy: URL string
            resp = httpx.get(str(first), timeout=120)
            resp.raise_for_status()
            return Image.open(io.BytesIO(resp.content)).convert("RGB")
        # Fallback for plain URL string (old SDK)
        resp = httpx.get(str(output), timeout=120)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")

    # ------------------------------------------------------------------ #
    #  Stage 2 — SwinIR via HF Inference API (raw PNG bytes)             #
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
        padded = self._pad_to_mult8(img)
        buf    = io.BytesIO()
        padded.save(buf, "PNG")
        raw_bytes = buf.getvalue()
        # HF Inference API for image-to-image: POST raw bytes, Content-Type: image/png
        resp = httpx.post(
            "https://api-inference.huggingface.co/models/caidas/swin2SR-classical-sr-x4-64",
            headers={
                "Authorization": f"Bearer {settings.HF_API_TOKEN}",
                "Content-Type":  "image/png",
            },
            content=raw_bytes,
            timeout=180,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"SwinIR HTTP {resp.status_code}: {resp.text[:200]}")
        return Image.open(io.BytesIO(resp.content)).convert("RGB")

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
            "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c"
            "7b8a939b4ca7e50df62e0c9c63780ad9",
            input={"image": buf, "scale": 4, "face_enhance": False},
        )
        # Same output-type handling as LaMa
        if hasattr(output, "read"):
            return Image.open(output).convert("RGB")
        if hasattr(output, "__iter__"):
            first = next(iter(output))
            if hasattr(first, "read"):
                return Image.open(first).convert("RGB")
            resp = httpx.get(str(first), timeout=180)
            resp.raise_for_status()
            return Image.open(io.BytesIO(resp.content)).convert("RGB")
        resp = httpx.get(str(output), timeout=180)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")

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
