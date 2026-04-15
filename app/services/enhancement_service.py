from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Dict

from PIL import Image

from app.services.card_detector import detect_and_crop, is_available as yolo_available
from app.services.upscalers import get_upscaler
from app.utils.logger import log


class EnhancementService:

    def enhance_image(
        self,
        input_path: str,
        opts: Dict[str, Any],
        quality: int = 95,
    ) -> str:
        src = Path(input_path)
        fmt = opts.get("format", "png")
        out = src.with_suffix(f".enhanced.{fmt}")
        merged = {**opts, "quality": quality}

        # ── Stage 0: YOLO card crop (no-op if unavailable) ──
        yolo_ran = False
        if merged.get("auto_crop", True):
            try:
                img = Image.open(str(src)).convert("RGB")
                cropped = detect_and_crop(img)
                if cropped is not img:
                    # Save cropped version to a temp path, don't overwrite original
                    crop_path = src.with_suffix(".cropped.png")
                    cropped.save(str(crop_path), "PNG")
                    src = crop_path
                    yolo_ran = True
                    log.info(f"YOLO crop applied for {Path(input_path).name}")
            except Exception as exc:
                log.warning(f"YOLO crop failed, continuing without: {exc}")

        # Tell the backend to skip its own contour crop if YOLO already ran
        if yolo_ran:
            merged["_skip_crop"] = True

        backend = get_upscaler()
        log.info(f"Enhancing {Path(input_path).name} with {backend.name}")
        t0 = time.time()
        result = backend.enhance(str(src), str(out), merged)
        log.info(f"Done {Path(input_path).name} in {time.time() - t0:.2f}s")

        # Clean up temp crop file
        if yolo_ran and src.exists() and src != Path(input_path):
            try:
                src.unlink()
            except OSError:
                pass

        return result
