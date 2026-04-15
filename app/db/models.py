from __future__ import annotations

import datetime
import uuid

from sqlalchemy import JSON, Column, DateTime, Integer, String, Text
from app.db.database import Base


def _uuid4() -> str:
    return uuid.uuid4().hex


def _utcnow() -> datetime.datetime:
    return datetime.datetime.now(datetime.timezone.utc)


class Job(Base):
    __tablename__ = "jobs"

    id = Column(String(32), primary_key=True, default=_uuid4)
    status = Column(Integer, default=0, nullable=False, index=True)
    progress = Column(Integer, default=0, nullable=False)
    message = Column(Text, default="")
    data = Column(JSON, default=dict)
    zip_path = Column(Text, default="")
    settings = Column(JSON, default=dict)
    preset = Column(String(50), default="")
    total_images = Column(Integer, default=0)
    completed_images = Column(Integer, default=0)
    failed_images = Column(Integer, default=0)
    backend_used = Column(String(50), default="")
    created_at = Column(DateTime, default=_utcnow, nullable=False)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow, nullable=False)

    def touch(self) -> None:
        self.updated_at = _utcnow()

    @property
    def elapsed_seconds(self) -> float:
        if self.created_at:
            created = self.created_at
            now = _utcnow()
            # Normalize: if created_at lost tzinfo through SQLite round-trip,
            # attach UTC so subtraction works.
            if created.tzinfo is None:
                created = created.replace(tzinfo=datetime.timezone.utc)
            if now.tzinfo is None:
                now = now.replace(tzinfo=datetime.timezone.utc)
            return (now - created).total_seconds()
        return 0.0
