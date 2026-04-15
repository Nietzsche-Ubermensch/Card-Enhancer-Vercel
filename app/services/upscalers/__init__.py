from __future__ import annotations

import os

BACKEND = os.environ.get("UPSCALE_BACKEND", "realesrgan")

if BACKEND == "opencv":
    from app.services.upscalers.opencv_backend import OpenCVBackend as _BackendClass
else:
    from app.services.upscalers.realesrgan_backend import RealESRGANBackend as _BackendClass

_backend = _BackendClass()


def get_upscaler():
    return _backend


def get_backend_name() -> str:
    return _backend.name
