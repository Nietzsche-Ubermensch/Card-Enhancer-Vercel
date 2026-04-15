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
from app.utils.logger import log


class RealESRGANBackend:
    """
    Three-stage pipeline:
      1. LaMa  (Replicate) — scratch / defect inpainting (auto-mask via edge detection)
      2. SwinIR (HF Inference API) — denoising + artifact removal
      3. Real-ESRGAN (Replicate) — 4x super-resolution

    Falls back gracefully: if any stage fails or is skipped,
    the next stage receives the previous result unchanged.
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

        # Stage 1 — LaMa scratch removal (only if scratches detected)
        if opts.get("denoise", True):
            try:
                img = self._run_lama(img)
                log.info("[Pipeline] LaMa done")
            except Exception as exc:
                log.warning(f"[Pipeline] LaMa skipped: {exc}")

        # Stage 2 — SwinIR denoising / artifact removal
        try:
            img = self._run_swinir(img)
            log.info(f"[Pipeline] SwinIR done -> {img.size}")
        except Exception as exc:
            log.warning(f"[Pipeline] SwinIR skipped: {exc}")

        # Stage 3 — Real-ESRGAN 4x upscale
        try:
            scale = int(opts.get("upscale_factor", 4))
            img = self._run_realesrgan(img, scale=scale)
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
        # Require contour to be at least 20% of image area
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
            dst = np.array([[0, 0], [499, 0], [499, 699], [0, 699]], dtype="float32")
            M = cv2.getPerspectiveTransform(ordered, dst)
            warped = cv2.warpPerspective(cv_img, M, (500, 700))
            return Image.fromarray(cv2.cvtColor(warped, cv2.COLOR_BGR2RGB))
        x, y, w, h = cv2.boundingRect(largest)
        return img.crop((x, y, x + w, y + h))

    # ------------------------------------------------------------------ #
    #  Stage 1 — LaMa via Replicate (with auto-generated scratch mask)    #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _generate_scratch_mask(img: Image.Image) -> Image.Image | None:
        """
        Detect thin linear scratches using morphological filtering.
        Returns a white-on-black mask, or None if no scratches found.
        """
        cv_img = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2GRAY)
        # Detect edges
        edges = cv2.Canny(cv_img, 30, 100)
        # Use a long thin kernel to isolate linear features (scratches)
        h_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 1))
        v_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 15))
        h_lines = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, h_kernel)
        v_lines = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, v_kernel)
        combined = cv2.bitwise_or(h_lines, v_lines)
        # Dilate to give the inpainter room to work
        dilated = cv2.dilate(combined, np.ones((3, 3), np.uint8), iterations=2)
        # If less than 0.5% of pixels are marked, probably no real scratches
        if np.sum(dilated > 0) < (dilated.size * 0.005):
            return None
        return Image.fromarray(dilated)

    @staticmethod
    def _run_lama(img: Image.Image) -> Image.Image:
        import replicate

        mask = RealESRGANBackend._generate_scratch_mask(img)
        if mask is None:
            log.info("[Pipeline] LaMa: no scratches detected, skipping")
            return img

        img_buf = io.BytesIO()
        img.save(img_buf, "PNG")
        img_buf.seek(0)

        mask_buf = io.BytesIO()
        mask.save(mask_buf, "PNG")
        mask_buf.seek(0)

        output = replicate.run(
            "daanelson/lama:fb8af171cfa1616ddcf1242c851ffe6"
            "ae2780e99d0a0b9b4c42597fe9f28ad17",
            input={"image": img_buf, "mask": mask_buf},
        )
        # replicate 1.x returns FileOutput or iterator — get the URL
        url = _extract_replicate_url(output)
        resp = httpx.get(url, timeout=120, follow_redirects=True)
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
        token = settings.HF_API_TOKEN
        if not token:
            raise RuntimeError("HF_API_TOKEN not set")
        padded = self._pad_to_mult8(img)
        buf = io.BytesIO()
        padded.save(buf, "PNG")
        img_bytes = buf.getvalue()

        # HF Inference API for image models expects raw image bytes
        resp = httpx.post(
            "https://api-inference.huggingface.co/models/caidas/swin2SR-classical-sr-x4-64",
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "image/png",
            },
            content=img_bytes,
            timeout=180,
        )
        if resp.status_code == 503:
            # Model is loading — wait and retry once
            wait = resp.json().get("estimated_time", 30)
            log.info(f"[Pipeline] SwinIR model loading, waiting {wait:.0f}s...")
            import time as _time
            _time.sleep(min(wait, 60))
            resp = httpx.post(
                "https://api-inference.huggingface.co/models/caidas/swin2SR-classical-sr-x4-64",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "image/png",
                },
                content=img_bytes,
                timeout=180,
            )
        if resp.status_code != 200:
            raise RuntimeError(f"SwinIR HTTP {resp.status_code}: {resp.text[:300]}")
        return Image.open(io.BytesIO(resp.content)).convert("RGB")

    # ------------------------------------------------------------------ #
    #  Stage 3 — Real-ESRGAN via Replicate                                #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _run_realesrgan(img: Image.Image, scale: int = 4) -> Image.Image:
        import replicate

        buf = io.BytesIO()
        img.save(buf, "PNG")
        buf.seek(0)
        output = replicate.run(
            "nightmareai/real-esrgan:42fed1c4974146d4d2414e2be2c5277c"
            "7b8a939b4ca7e50df62e0c9c63780ad9",
            input={"image": buf, "scale": min(scale, 4), "face_enhance": False},
        )
        url = _extract_replicate_url(output)
        resp = httpx.get(url, timeout=180, follow_redirects=True)
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


# ------------------------------------------------------------------ #
#  Helpers                                                              #
# ------------------------------------------------------------------ #

def _extract_replicate_url(output) -> str:
    """
    replicate 1.x can return:
      - a FileOutput (has .url attribute, or str() gives the URL)
      - an iterator yielding FileOutput items
      - a raw URL string (older SDK / some models)
    Normalize to a plain URL string.
    """
    if isinstance(output, str):
        return output
    # Iterator (e.g. models that yield multiple outputs)
    if hasattr(output, "__iter__") and not hasattr(output, "url"):
        for item in output:
            return _extract_replicate_url(item)
    # FileOutput or similar object
    if hasattr(output, "url"):
        return str(output.url)
    # Last resort
    return str(output)
