from __future__ import annotations

from app.core.config import settings
from app.utils.logger import log

_backend = None


def _init_backend():
    global _backend
    if _backend is not None:
        return

    backend_name = settings.UPSCALE_BACKEND.lower()

    if backend_name == "realesrgan":
        # Only activate if both tokens are actually set
        hf = settings.HF_API_TOKEN
        rep = settings.REPLICATE_API_TOKEN
        if hf and rep:
            from app.services.upscalers.realesrgan_backend import RealESRGANBackend
            _backend = RealESRGANBackend()
            log.info(f"Backend: {_backend.name}")
            return
        else:
            missing = []
            if not hf:
                missing.append("HF_API_TOKEN")
            if not rep:
                missing.append("REPLICATE_API_TOKEN")
            log.warning(
                f"UPSCALE_BACKEND=realesrgan but missing: {', '.join(missing)}. "
                f"Falling back to OpenCV."
            )

    from app.services.upscalers.opencv_backend import OpenCVBackend
    _backend = OpenCVBackend()
    log.info(f"Backend: {_backend.name}")


def get_upscaler():
    _init_backend()
    return _backend


def get_backend_name() -> str:
    _init_backend()
    return _backend.name
