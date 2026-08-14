"""Structured JSON logging. Never logs secrets or raw environment variables."""

from __future__ import annotations

import json
import logging
import sys
import time
from typing import Any

_SERVICE_NAME = "dcpt-pipeline"


class _JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(record.created)),
            "severity": record.levelname,
            "service": _SERVICE_NAME,
            "event": record.getMessage(),
        }
        for key in ("request_id", "run_id", "duration_ms"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        if record.exc_info and record.exc_info[0] is not None:
            payload["exception_type"] = record.exc_info[0].__name__
        return json.dumps(payload)


def get_logger(name: str = _SERVICE_NAME) -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(_JsonFormatter())
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False
    return logger
