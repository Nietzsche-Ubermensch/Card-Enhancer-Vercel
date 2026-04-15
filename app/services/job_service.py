from __future__ import annotations

from typing import Any, Dict, List, Optional, Sequence

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.db.models import Job
from app.models.enums import JobStatus
from app.utils.logger import log


async def create_job(
    session: AsyncSession,
    job_id: str,
    zip_path: str,
    settings_dict: Dict,
    preset: str = "",
    total_images: int = 0,
) -> Job:
    job = Job(
        id=job_id,
        status=JobStatus.PENDING,
        zip_path=zip_path,
        settings=settings_dict,
        preset=preset,
        total_images=total_images,
        data={"results": []},
    )
    session.add(job)
    await session.commit()
    await session.refresh(job)
    log.info(f"Job created: {job_id}")
    return job


async def get_job(session: AsyncSession, job_id: str) -> Optional[Job]:
    r = await session.execute(select(Job).where(Job.id == job_id))
    return r.scalar_one_or_none()


async def get_pending_jobs(session: AsyncSession, limit: int = 10) -> Sequence[Job]:
    r = await session.execute(
        select(Job)
        .where(Job.status == JobStatus.PENDING)
        .order_by(Job.created_at)
        .limit(limit)
    )
    return r.scalars().all()


async def update_job(session: AsyncSession, job: Job, **kwargs) -> Job:
    for k, v in kwargs.items():
        if hasattr(job, k):
            setattr(job, k, v)
    job.touch()
    await session.commit()
    await session.refresh(job)
    return job


async def add_result(
    session: AsyncSession, job: Job, result: Dict[str, Any]
) -> None:
    current_data = dict(job.data) if job.data else {}
    results: List = list(current_data.get("results", []))
    results.append(result)
    current_data["results"] = results
    job.data = current_data
    flag_modified(job, "data")
    job.touch()
    await session.commit()


async def get_stats(session: AsyncSession) -> Dict:
    r1 = await session.execute(
        select(func.count(Job.id)).where(Job.status == JobStatus.PROCESSING)
    )
    r2 = await session.execute(
        select(func.count(Job.id)).where(Job.status == JobStatus.COMPLETED)
    )
    return {"active": r1.scalar() or 0, "completed": r2.scalar() or 0}
