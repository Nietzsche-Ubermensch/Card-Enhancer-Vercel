from __future__ import annotations

from typing import Any, Dict

import cv2
import numpy as np
from PIL import Image, ImageEnhance, ImageOps

from app.utils.logger import log


class OpenCVBackend:
    """
    Pure OpenCV + Pillow upscaler.
    100% PyPI. No model downloads. Works on any CPU.
    Supports: Lanczos resize, denoise, unsharp mask sharpen,
              auto-contrast, CLAHE local contrast, colour correction.
    """

    name = "OpenCV + Pillow (CPU)"

    # ------------------------------------------------------------------ #
    #  Public API                                                          #
    # ------------------------------------------------------------------ #

    def enhance(self, input_path: str, output_path: str, opts: Dict[str, Any]) -> str:
        factor      = int(opts.get("upscale_factor", 2))
        quality     = int(opts.get("quality", 95))
        fmt         = str(opts.get("format", "png")).lower()

        img = cv2.imread(input_path, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError(f"Cannot read image: {input_path}")

        h, w = img.shape[:2]
        tw = int(opts.get("target_width",  w * factor))
        th = int(opts.get("target_height", h * factor))

        log.info(f"[OpenCV] {w}x{h} -> {tw}x{th}  fmt={fmt}  q={quality}")

        # 1. Upscale
        img = cv2.resize(img, (tw, th), interpolation=cv2.INTER_LANCZOS4)

        # 2. Denoise
        if opts.get("denoise", True):
            strength_map = {"low": 5, "medium": 9, "high": 13}
            h_val = strength_map.get(str(opts.get("denoise_strength", "medium")), 9)
            img = cv2.fastNlMeansDenoisingColored(img, None, h_val, h_val, 7, 21)

        # 3. CLAHE local contrast (before sharpen)
        if opts.get("auto_contrast", True):
            lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
            l = clahe.apply(l)
            img = cv2.cvtColor(cv2.merge([l, a, b]), cv2.COLOR_LAB2BGR)

        # 4. Unsharp mask sharpen
        if opts.get("sharpen", True):
            s = float(opts.get("sharpen_strength", 0.5))
            blur = cv2.GaussianBlur(img, (0, 0), 3)
            img = cv2.addWeighted(img, 1 + s, blur, -s, 0)

        # 5. Colour saturation boost
        if opts.get("color_correct", True):
            pil = Image.fromarray(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            pil = ImageEnhance.Color(pil).enhance(1.15)
            img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)

        # 6. Write output
        self._write(img, output_path, fmt, quality)
        return output_path

    # ------------------------------------------------------------------ #
    #  Internal                                                            #
    # ------------------------------------------------------------------ #

    @staticmethod
    def _write(img: np.ndarray, path: str, fmt: str, quality: int) -> None:
        if fmt in ("jpg", "jpeg"):
            cv2.imwrite(path, img, [cv2.IMWRITE_JPEG_QUALITY, quality])
        elif fmt == "webp":
            cv2.imwrite(path, img, [cv2.IMWRITE_WEBP_QUALITY, quality])
        elif fmt in ("tiff", "tif"):
            cv2.imwrite(path, img)
        else:
            cv2.imwrite(path, img)
