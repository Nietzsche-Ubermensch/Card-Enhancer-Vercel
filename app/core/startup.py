"""Startup validation — fails fast with descriptive errors for bad config."""
from __future__ import annotations

from app.utils.logger import log


class StartupConfigError(Exception):
    pass


def validate_startup(settings) -> None:
    """
    Validate all required configuration before the server accepts requests.

    Raises StartupConfigError (with all violations listed) if anything is wrong.
    Caller is responsible for exiting the process.
    """
    errors: list[str] = []

    # Backend
    if settings.UPSCALE_BACKEND not in ("opencv", "realesrgan"):
        errors.append(
            f"UPSCALE_BACKEND must be 'opencv' or 'realesrgan', "
            f"got: {settings.UPSCALE_BACKEND!r}"
        )

    if settings.UPSCALE_BACKEND == "realesrgan":
        if not settings.HF_API_TOKEN:
            errors.append(
                "HF_API_TOKEN is required when UPSCALE_BACKEND=realesrgan. "
                "Get a token at https://huggingface.co/settings/tokens"
            )
        if not settings.REPLICATE_API_TOKEN:
            errors.append(
                "REPLICATE_API_TOKEN is required when UPSCALE_BACKEND=realesrgan. "
                "Get a token at https://replicate.com/account/api-tokens"
            )

    # Worker pool
    if settings.MAX_CONCURRENT_WORKERS < 1:
        errors.append(
            f"MAX_CONCURRENT_WORKERS must be >= 1, got: {settings.MAX_CONCURRENT_WORKERS}"
        )

    # Network
    if not (1 <= settings.PORT <= 65535):
        errors.append(f"PORT must be 1–65535, got: {settings.PORT}")

    # YOLO
    if not (0.0 <= settings.YOLO_CONFIDENCE <= 1.0):
        errors.append(
            f"YOLO_CONFIDENCE must be in [0.0, 1.0], got: {settings.YOLO_CONFIDENCE}"
        )

    if errors:
        bullet_list = "\n".join(f"  • {e}" for e in errors)
        raise StartupConfigError(
            f"Cannot start: {len(errors)} configuration error(s):\n{bullet_list}"
        )

    log.info("Startup configuration validated OK")
