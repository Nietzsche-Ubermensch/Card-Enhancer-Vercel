from __future__ import annotations

import base64
import io
import os
import time
from pathlib import Path
from typing import Any, Dict

import cv2
import httpx
import numpy as np
from PIL import Image

from app.utils.logger import log

HF_TOKEN = os.environ.get("HF_API_TOKEN", "")
REPLICATE_TOKEN = os.environ.get("REPLICATE_API_TOKEN", "")


class RealESRGANBackend:
    """
    Three-stage pipeline per the hybrid architecture paper:
      1. LaMa  (Replicate) — scratch / defect inpainting
      2. SwinIR (HF API)   — denoising + artefact removal
      3. Real-ESRGAN (Replicate) — 4x super-resolution

    Falls back gracefully: if any stage fails its output is
    skipped and the next stage receives the previous result.
    """

    name = "LaMa + SwinIR + Real-ESRGAN (API)"

    # ------------------------------------------------------------------ #
    #  Public API  (matches OpenCVBackend.enhance signature)               #
    # ------------------------------------------------------------------ #

    def enhance(self, input_path: str, output_path: str, opts: Dict[str, Any]) -> str:
        fmt = str(opts.get("format", "png")).lower()
        quality = int(opts.get("quality", 95))

        img = Image.open(input_path).convert("RGB")
        log.info(f"[Pipeline] Starting {Path(input_path).name}  {img.size}")
        t0 = time.time()

        # Stage 0 — card crop (contour detection)
        try:
            img = self._crop_card(img)
            log.info(f"[Pipeline] Crop done -> {img.size}")
        except Exception as exc:
            log.warning(f"[Pipeline] Crop skipped: {exc}")

        # Stage 1 — LaMa scratch removal
        try:
            img = self._run_lama(img)
            log.info(f"[Pipeline] LaMa done")
        except Exception as exc:
            log.warning(f"[Pipeline] LaMa skipped: {exc}")

        # Stage 2 — SwinIR denoising / artefact removal
        try:
            img = self._run_swinir(img)
            log.info(f"[Pipeline] SwinIR done -> {img.size}")
        except Exception as exc:
            log.warning(f"[Pipeline] SwinIR skipped: {exc}")

        # Stage 3 — Real-ESRGAN 4x upscale
        try:
            img = self._run_realesrgan(img)
            log.info(f"[Pipeline] Real-ESRGAN done -> {img.size}")
        except Exception as exc:
            log.warning(f"[Pipeline] Real-ESRGAN skipped: {exc}")

        # Write output
        self._write(img, output_path, fmt, quality)
        log.info(f"[Pipeline] Finished in {time.time() - t0:.2f}s -> {output_path}")
        return output_path

    # ------------------------------------------------------------------ #
    #  Stage 0 — Card crop via OpenCV contour detection                   #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _crop_card(img: Image.Image) -> Image.Image:
        cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
        gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
        blur = cv2.GaussianBlur(gray, (5, 5), 0)
        edges = cv2.Canny(blur, 50, 150)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return img
        largest = max(contours, key=cv2.contourArea)
        # Require contour to be at least 20% of image area to avoid noise
        img_area = img.width * img.height
        if cv2.contourArea(largest) < img_area * 0.20:
            return img
        peri = cv2.arcLength(largest, True)
        approx = cv2.approxPolyDP(largest, 0.02 * peri, True)
        if len(approx) == 4:
            pts = approx.reshape(4, 2).astype("float32")
            s = pts.sum(axis=1)
            diff = np.diff(pts, axis=1)
            ordered = np.array([
                pts[np.argmin(s)],
                pts[np.argmin(diff)],
                pts[np.argmax(s)],
                pts[np.argmax(diff)],
            ], dtype="float32")
            # Standard card: 2.5 x 3.5 inches → 500 x 700 px
            dst = np.array([[0, 0], [499, 0], [499, 699], [0, 699]], dtype="float32")
            M = cv2.getPerspectiveTransform(ordered, dst)
            warped = cv2.warpPerspective(cv_img, M, (500, 700))
            return Image.fromarray(cv2.cvtColor(warped, cv2.COLOR_BGR2RGB))
        x, y, w, h = cv2.boundingRect(largest)
        return img.crop((x, y, x + w, y + h))

    # ------------------------------------------------------------------ #
    #  Stage 1 — LaMa via Replicate                                       #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _run_lama(img: Image.Image) -> Image.Image:
        import replicate
        buf = io.BytesIO()
        img.save(buf, "PNG")
        buf.seek(0)
        output = replicate.run(
            "daanelson/lama:fb8af171cfa1616ddcf1242c851ffe6"
            "ae2780e99d0a0b9b4c42597fe9f28ad17",
            input={"image": buf, "mask": buf},
        )
        resp = httpx.get(str(output), timeout=120)
        resp.raise_for_status()
        return Image.open(io.BytesIO(resp.content)).convert("RGB")

    # ------------------------------------------------------------------ #
    #  Stage 2 — SwinIR via Hugging Face Inference API                    #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _pad_to_mult8(img: Image.Image) -> Image.Image:
        w, h = img.size
        nw = (w + 7) // 8 * 8
        nh = (h + 7) // 8 * 8
        if nw == w and nh == h:
            return img
        padded = Image.new("RGB", (nw, nh), (0, 0, 0))
        padded.paste(img, (0, 0))
        return padded

    def _run_swinir(self, img: Image.Image) -> Image.Image:
        if not HF_TOKEN:
            raise RuntimeError("HF_API_TOKEN not set")
        padded = self._pad_to_mult8(img)
        buf = io.BytesIO()
        padded.save(buf, "PNG")
        b64 = base64.b64encode(buf.getvalue()).decode()
        resp = httpx.post(
            "https://api-inference.huggingface.co/models/caidas/swin2SR-classical-sr-x4-64",
            headers={"Authorization": f"Bearer {HF_TOKEN}"},
            json={"inputs": b64},
            timeout=180,
        )
        if resp.status_code != 200:
            raise RuntimeError(f"SwinIR HTTP {resp.status_code}: {resp.text[:200]}")
        return Image.open(io.BytesIO(resp.content)).convert("RGB")

    # ------------------------------------------------------------------ #
    #  Stage 3 — Real-ESRGAN 4x via Replicate                             #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _run_realesrgan(img: Image.Image) -> Image.Image:
        import replicate
        buf = io.BytesIO()
        img.save(buf, "PNG")
        buf.seek(0)
        output = replicate.run(
            "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c"
            "7b8a939b4ca7e50df62e0c9c63780ad9",
            input={"image": buf, "scale": 4, "face_enhance": False},
        )
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
