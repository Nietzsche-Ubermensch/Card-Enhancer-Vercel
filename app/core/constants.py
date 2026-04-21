from __future__ import annotations

_MB = 1024 * 1024
_GB = 1024 * _MB

# Zip extraction safety limits
MAX_UNZIPPED_BYTES: int = 5 * _GB

# Card crop (OpenCV contour / perspective warp)
MIN_CONTOUR_AREA_RATIO: float = 0.20
CONTOUR_APPROX_EPSILON: float = 0.02
CARD_WARP_WIDTH: int = 500
CARD_WARP_HEIGHT: int = 700

# Card detection (YOLO)
YOLO_CONFIDENCE_THRESHOLD: float = 0.55
MIN_CROP_WIDTH_PX: int = 100
MIN_CROP_HEIGHT_PX: int = 140

# SwinIR HuggingFace Inference API
SWINIR_TIMEOUT_SECONDS: int = 240
SWINIR_RETRY_BASE_WAIT_SECONDS: int = 20
SWINIR_MAX_RETRIES: int = 3

# HTTP timeout for fetching Replicate output URLs
REPLICATE_OUTPUT_FETCH_TIMEOUT_SECONDS: int = 180
