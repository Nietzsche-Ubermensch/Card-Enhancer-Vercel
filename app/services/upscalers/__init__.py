from __future__ import annotations

from app.services.upscalers.opencv_backend import OpenCVBackend

_backend = OpenCVBackend()


def get_upscaler() -> OpenCVBackend:
    return _backend


def get_backend_name() -> str:
    return _backend.name
