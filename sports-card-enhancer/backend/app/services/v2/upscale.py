"""Upscaling with honest provenance: real SR is never mislabeled."""
from __future__ import annotations

import logging
from typing import Dict, Tuple

import numpy as np

from app.services.real_esrgan_service import RealESRGANService

logger = logging.getLogger(__name__)

ALLOWED_SCALES = (2, 4)

# Shared service so models load once, never per card.
_shared_service: RealESRGANService | None = None


def _service() -> RealESRGANService:
    global _shared_service
    if _shared_service is None:
        _shared_service = RealESRGANService()
    return _shared_service


def upscale_card(card_image: np.ndarray, scale: int = 2,
                 model: str | None = None) -> Tuple[np.ndarray, Dict]:
    """Upscale a card image; metadata states exactly what produced the output.

    used_real_sr is True only when Real-ESRGAN actually ran. Interpolation
    fallback is reported as used_real_sr=False — never mislabeled.
    """
    if scale not in ALLOWED_SCALES:
        raise ValueError(f"scale must be one of {ALLOWED_SCALES}, got {scale}")

    h, w = card_image.shape[:2]
    service = _service()
    output, used_sr = service.upscale_with_fallback(card_image, outscale=scale)

    oh, ow = output.shape[:2]
    meta: Dict = {
        "upscale_requested": True,
        "upscale_scale": scale,
        "upscale_model": model or getattr(service, "model_name", None)
        or getattr(getattr(service, "model_type", None), "value", "real_esrgan_x4plus"),
        "upscale_method": "real_esrgan" if used_sr else "opencv_lanczos4",
        "used_real_sr": bool(used_sr),
        "input_width": w, "input_height": h,
        "output_width": ow, "output_height": oh,
    }
    if not used_sr:
        meta["warning"] = ("Real-ESRGAN unavailable or failed; output produced "
                           "by interpolation fallback, not AI super-resolution")
    return output, meta
