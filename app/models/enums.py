from __future__ import annotations
from enum import IntEnum


class JobStatus(IntEnum):
    PENDING = 0
    ANALYZING = 1
    PROCESSING = 2
    QUALITY_CHECK = 3
    COMPLETED = 4
    FAILED = 5
    CANCELLED = 6
    PARTIALLY_COMPLETED = 7

    @property
    def label(self) -> str:
        return self.name.lower()
