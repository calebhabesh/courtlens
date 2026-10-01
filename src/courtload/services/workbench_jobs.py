"""Tracked allowlisted worker jobs, execution engine, locking, and recovery."""

from __future__ import annotations

import hashlib
import logging
import re
import time
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import distinct, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from courtload.config import get_settings
from courtload.domain.teams import NBA_TEAMS
from courtload.models import new_uuid, utc_now
from courtload.services.publication import (
    DEFAULT_CHANNEL,
    BuildInProgressError,
    publication_lock,
)
from courtload.services.workbench_forecasts import (
    get_active_points_policy,
    issue_prospective_forecasts,
    score_forecast_issuances,
)
from courtload.services.workbench_ingestion import (
    acquire_workbench_data,
    import_workbench_data,
    publish_workbench_release,
)
from courtload.warehouse_models import PublishedSnapshot
from courtload.workbench_models import (
    ModelPolicyActivation,
    PlayerPortrait,
    WorkbenchDataset,
    WorkbenchIdentity,
    WorkbenchJob,
    WorkbenchPlayerGame,
    WorkbenchReleaseBinding,
    WorkbenchTeamGame,
    allow_admin_mutation,
)

logger = logging.getLogger(__name__)

ALLOWLISTED_JOB_TYPES = {"bootstrap", "refresh", "portraits"}
_SECRET_PATTERN = re.compile(r"(password|token|secret|key)=([^\s&]+)", re.IGNORECASE)


def sanitize_error(message: str) -> str:
    """Sanitize secrets and truncate error messages."""
    sanitized = _SECRET_PATTERN.sub(r"\1=***", message)
    if len(sanitized) > 1000:
        return sanitized[:997] + "..."
    return sanitized


def enqueue_job(
    session: Session,
    job_type: str,
    arguments: dict[str, Any] | None = None,
) -> WorkbenchJob:
    """Enqueue an allowlisted job or return an active matching job (coalescing)."""
    if job_type not in ALLOWLISTED_JOB_TYPES:
        raise ValueError(
            f"job_type '{job_type}' is not allowlisted; allowed: {sorted(ALLOWLISTED_JOB_TYPES)}"
        )

    # Check for active existing job of same type
    existing = session.scalar(
        select(WorkbenchJob)
        .where(
            WorkbenchJob.job_type == job_type,
            WorkbenchJob.status.in_(["queued", "running"]),
        )
        .order_by(WorkbenchJob.created_at.asc())
        .limit(1)
    )
    if existing is not None:
        logger.info(
            "Coalesced job %s of type %s with existing job %s",
            job_type,
            job_type,
            existing.id,
        )
        return existing

    job = WorkbenchJob(
        id=new_uuid(),
        job_type=job_type,
        status="queued",
        arguments_json=arguments or {},
        created_at=utc_now(),
    )
    session.add(job)
    session.commit()
    logger.info("Enqueued job %s of type %s", job.id, job_type)
    return job


def recover_interrupted_jobs(
    session: Session,
    lease_timeout_seconds: int = 60,
) -> list[WorkbenchJob]:
    """Recover jobs left in running state whose worker died or lease expired."""
    cutoff = utc_now() - timedelta(seconds=lease_timeout_seconds)
    running_jobs = list(
        session.scalars(select(WorkbenchJob).where(WorkbenchJob.status == "running")).all()
    )
    recovered: list[WorkbenchJob] = []

    for job in running_jobs:
        hb = job.heartbeat_at or job.started_at or job.created_at
        if hb < cutoff:
            # Check if publication actually succeeded before process died
            output_refs = job.output_refs_json or {}
            snapshot_id = output_refs.get("snapshot_id")
            was_published = False
            if snapshot_id:
                pub = session.scalar(
                    select(PublishedSnapshot).where(
                        PublishedSnapshot.snapshot_id == snapshot_id,
                        PublishedSnapshot.channel == DEFAULT_CHANNEL,
                    )
                )
                was_published = pub is not None

            if was_published:
                job.status = "succeeded"
                job.finished_at = utc_now()
                job.stage = "completed"
                logger.info(
                    "Recovered job %s to succeeded: output snapshot was verified published", job.id
                )
            else:
                job.status = "interrupted"
                job.finished_at = utc_now()
                job.error_summary = (
                    "Worker process interrupted or lease expired without publication"
                )
                logger.warning(
                    "Recovered job %s to interrupted: lease expired at %s", job.id, hb.isoformat()
                )
            recovered.append(job)

    if recovered:
        session.commit()
    return recovered


def _fetch_player_portrait(
    client: httpx.Client,
    player_id: str,
    cache_dir: Path,
) -> tuple[str, Path, int] | None:
    """Fetch headshot for an NBA player from official CDN and cache it locally."""
    url = f"https://cdn.nba.com/headshots/nba/latest/260x190/{player_id}.png"
    try:
        resp = client.get(url, timeout=10.0)
        if resp.status_code != 200:
            return None
        content = resp.content
        if len(content) == 0 or len(content) > 1_000_000:
            return None
        sha256 = hashlib.sha256(content).hexdigest()
        cache_dir.mkdir(parents=True, exist_ok=True)
        img_path = cache_dir / f"{sha256}.png"
        if not img_path.exists():
            img_path.write_bytes(content)
        return sha256, img_path, len(content)
    except Exception as exc:
        logger.debug("Failed to fetch portrait for player %s: %s", player_id, exc)
        return None


def execute_job(
    engine_or_session: Engine | Session,
    job_id: str,
    worker_id: str = "local-worker",
) -> WorkbenchJob:
    """Execute a single queued workbench job holding coordinated PostgreSQL advisory lock."""
    if isinstance(engine_or_session, Session):
        engine = engine_or_session.get_bind()
        if not isinstance(engine, Engine):
            raise RuntimeError("execute_job requires a session bound to an Engine")
    else:
        engine = engine_or_session

    settings = get_settings()

    with Session(engine, expire_on_commit=False) as session:
        job = session.get(WorkbenchJob, job_id)
        if job is None:
            raise ValueError(f"job '{job_id}' not found")
        if job.status != "queued":
            return job
        job_type = job.job_type
        job_args = job.arguments_json or {}

    timings: dict[str, float] = {}
    start_total = time.monotonic()

    # Acquire PostgreSQL coordinated publication lock
    try:
        with publication_lock(engine):
            with Session(engine, expire_on_commit=False) as session:
                job = session.get(WorkbenchJob, job_id)
                assert job is not None
                job.status = "running"
                job.owner = worker_id
                job.started_at = utc_now()
                job.heartbeat_at = utc_now()
                job.stage = "starting"
                session.commit()

            def update_heartbeat(stage_name: str) -> None:
                with Session(engine, expire_on_commit=False) as s:
                    j = s.get(WorkbenchJob, job_id)
                    if j is not None:
                        j.heartbeat_at = utc_now()
                        j.stage = stage_name
                        j.timings_json = timings
                        s.commit()

            try:
                if job_type == "bootstrap":
                    # Stage: checking
                    t0 = time.monotonic()
                    update_heartbeat("checking")
                    with Session(engine, expire_on_commit=False) as s:
                        current_pub = s.scalar(
                            select(PublishedSnapshot).where(
                                PublishedSnapshot.channel == DEFAULT_CHANNEL
                            )
                        )
                        if current_pub is not None:
                            binding = s.scalar(
                                select(WorkbenchReleaseBinding).where(
                                    WorkbenchReleaseBinding.snapshot_id == current_pub.snapshot_id
                                )
                            )
                            if binding is not None:
                                timings["checking"] = round(time.monotonic() - t0, 3)
                                j = s.get(WorkbenchJob, job_id)
                                assert j is not None
                                j.status = "succeeded"
                                j.stage = "completed"
                                j.finished_at = utc_now()
                                j.timings_json = timings
                                j.output_refs_json = {
                                    "action": "already_bootstrapped",
                                    "snapshot_id": current_pub.snapshot_id,
                                    "dataset_id": binding.dataset_id,
                                }
                                s.commit()
                                return j
                    timings["checking"] = round(time.monotonic() - t0, 3)

                    # Stage: acquiring
                    t0 = time.monotonic()
                    update_heartbeat("acquiring")
                    manifests = acquire_workbench_data(
                        raw_root=settings.raw_store_path,
                    )
                    timings["acquiring"] = round(time.monotonic() - t0, 3)

                    # Stage: importing
                    t0 = time.monotonic()
                    update_heartbeat("importing")
                    with Session(engine) as s:
                        dataset = import_workbench_data(
                            s,
                            raw_root=settings.raw_store_path,
                        )
                        dataset_id = dataset.id
                        dataset_sig = dataset.semantic_signature
                    timings["importing"] = round(time.monotonic() - t0, 3)

                    # Stage: publishing (includes dbt build and validation)
                    t0 = time.monotonic()
                    update_heartbeat("publishing")
                    with Session(engine) as s:
                        binding = publish_workbench_release(
                            s,
                            dataset_id,
                            channel=DEFAULT_CHANNEL,
                            acquire_lock=False,  # Worker already holds publication lock!
                        )
                        snapshot_id = binding.snapshot_id
                    timings["publishing"] = round(time.monotonic() - t0, 3)

                    # Stage: forecasting policy check and prospective issuance
                    t0 = time.monotonic()
                    update_heartbeat("forecasting")
                    forecast_info: dict[str, Any] = {"forecast_status": "no_policy_registered"}
                    with Session(engine, expire_on_commit=False) as s:
                        active_policy = get_active_points_policy(s)
                        if active_policy is not None:
                            iss_res = issue_prospective_forecasts(s, release_id=snapshot_id)
                            score_res = score_forecast_issuances(s, dataset_id=dataset_id)
                            forecast_info = {
                                "forecast_status": "active_policy_issued",
                                "forecast_policy": active_policy.policy_name,
                                "forecasts_issued_count": iss_res.get("issued_count", 0),
                                "forecasts_scored_count": score_res.get("scored_count", 0),
                            }
                    timings["forecasting"] = round(time.monotonic() - t0, 3)

                    # Complete job
                    timings["total"] = round(time.monotonic() - start_total, 3)
                    with Session(engine, expire_on_commit=False) as s:
                        j = s.get(WorkbenchJob, job_id)
                        assert j is not None
                        j.status = "succeeded"
                        j.stage = "completed"
                        j.finished_at = utc_now()
                        j.timings_json = timings
                        j.input_refs_json = {"manifests_count": len(manifests)}
                        j.output_refs_json = {
                            "dataset_id": dataset_id,
                            "snapshot_id": snapshot_id,
                            "semantic_signature": dataset_sig,
                            **forecast_info,
                        }
                        s.commit()
                        return j

                elif job_type == "refresh":
                    # Stage: checking & acquiring
                    t0 = time.monotonic()
                    update_heartbeat("checking")
                    manifests = acquire_workbench_data(
                        raw_root=settings.raw_store_path,
                    )
                    timings["acquiring"] = round(time.monotonic() - t0, 3)

                    # Stage: importing
                    t0 = time.monotonic()
                    update_heartbeat("importing")
                    with Session(engine, expire_on_commit=False) as s:
                        dataset = import_workbench_data(
                            s,
                            raw_root=settings.raw_store_path,
                        )
                        dataset_id = dataset.id
                        dataset_sig = dataset.semantic_signature
                    timings["importing"] = round(time.monotonic() - t0, 3)

                    # Stage: publishing
                    t0 = time.monotonic()
                    update_heartbeat("publishing")
                    with Session(engine, expire_on_commit=False) as s:
                        binding = publish_workbench_release(
                            s,
                            dataset_id,
                            channel=DEFAULT_CHANNEL,
                            acquire_lock=False,
                        )
                        snapshot_id = binding.snapshot_id
                    timings["publishing"] = round(time.monotonic() - t0, 3)

                    # Stage: forecasting policy check and prospective issuance
                    t0 = time.monotonic()
                    update_heartbeat("forecasting")
                    forecast_info = {"forecast_status": "no_policy_registered"}
                    with Session(engine, expire_on_commit=False) as s:
                        active_policy = get_active_points_policy(s)
                        if active_policy is not None:
                            iss_res = issue_prospective_forecasts(s, release_id=snapshot_id)
                            score_res = score_forecast_issuances(s, dataset_id=dataset_id)
                            forecast_info = {
                                "forecast_status": "active_policy_issued",
                                "forecast_policy": active_policy.policy_name,
                                "forecasts_issued_count": iss_res.get("issued_count", 0),
                                "forecasts_scored_count": score_res.get("scored_count", 0),
                            }
                    timings["forecasting"] = round(time.monotonic() - t0, 3)

                    # Complete job
                    timings["total"] = round(time.monotonic() - start_total, 3)
                    with Session(engine, expire_on_commit=False) as s:
                        j = s.get(WorkbenchJob, job_id)
                        assert j is not None
                        j.status = "succeeded"
                        j.stage = "completed"
                        j.finished_at = utc_now()
                        j.timings_json = timings
                        j.output_refs_json = {
                            "dataset_id": dataset_id,
                            "snapshot_id": snapshot_id,
                            "semantic_signature": dataset_sig,
                            **forecast_info,
                        }
                        s.commit()
                        return j

                elif job_type == "portraits":
                    t0 = time.monotonic()
                    update_heartbeat("acquiring_portraits")
                    cache_path = settings.portraits_cache_path
                    acquired_count = 0
                    failed_count = 0
                    limit_count = int(job_args.get("limit", 200))

                    with Session(engine, expire_on_commit=False) as s:
                        players = list(
                            s.scalars(
                                select(WorkbenchIdentity.external_id)
                                .where(
                                    WorkbenchIdentity.kind == "player",
                                    ~WorkbenchIdentity.external_id.like("test_%"),
                                )
                                .limit(limit_count)
                            ).all()
                        )

                    with httpx.Client(follow_redirects=True, timeout=10.0) as http_client:
                        for pid in players:
                            with Session(engine, expire_on_commit=False) as s:
                                existing_p = s.scalar(
                                    select(PlayerPortrait).where(
                                        PlayerPortrait.player_id == pid,
                                        PlayerPortrait.source_name == "nba_cdn",
                                    )
                                )
                                if existing_p is not None:
                                    continue

                            res = _fetch_player_portrait(http_client, pid, cache_path)
                            if res is not None:
                                sha256, path, size = res
                                with (
                                    Session(engine, expire_on_commit=False) as s,
                                    allow_admin_mutation(s),
                                ):
                                    s.add(
                                        PlayerPortrait(
                                            player_id=pid,
                                            source_name="nba_cdn",
                                            content_sha256=sha256,
                                            storage_path=str(path),
                                            mime_type="image/png",
                                            bytes=size,
                                            attribution="NBA CDN 260x190 headshot",
                                            status="active",
                                            acquired_at=utc_now(),
                                        )
                                    )
                                    s.commit()
                                acquired_count += 1
                            else:
                                failed_count += 1

                    timings["portraits"] = round(time.monotonic() - t0, 3)
                    timings["total"] = round(time.monotonic() - start_total, 3)
                    with Session(engine, expire_on_commit=False) as s:
                        j = s.get(WorkbenchJob, job_id)
                        assert j is not None
                        j.status = "succeeded"
                        j.stage = "completed"
                        j.finished_at = utc_now()
                        j.timings_json = timings
                        j.output_refs_json = {
                            "portraits_acquired": acquired_count,
                            "portraits_failed": failed_count,
                        }
                        s.commit()
                        return j

                else:
                    raise ValueError(f"unsupported job_type '{job_type}'")

            except Exception as exc:
                logger.error("Job %s failed: %s", job_id, exc, exc_info=True)
                timings["total"] = round(time.monotonic() - start_total, 3)
                with Session(engine, expire_on_commit=False) as s:
                    j = s.get(WorkbenchJob, job_id)
                    if j is not None:
                        j.status = "failed"
                        j.stage = "failed"
                        j.finished_at = utc_now()
                        j.timings_json = timings
                        j.error_summary = sanitize_error(f"{type(exc).__name__}: {exc}")
                        s.commit()
                        return j
                raise

    except BuildInProgressError:
        logger.warning("Job %s skipped: publication lock is held by another process", job_id)
        with Session(engine, expire_on_commit=False) as s:
            j = s.get(WorkbenchJob, job_id)
            if j is not None:
                j.status = "failed"
                j.stage = "lock_conflict"
                j.finished_at = utc_now()
                j.error_summary = "Publication lock is held by another build/process"
                s.commit()
                return j
        raise


def get_workbench_status(session: Session) -> dict[str, Any]:
    """Retrieve operational status for pipeline, source freshness, jobs, and capabilities."""
    pointer = session.get(PublishedSnapshot, DEFAULT_CHANNEL)
    binding: WorkbenchReleaseBinding | None = None
    dataset: WorkbenchDataset | None = None

    if pointer is not None:
        binding = session.scalar(
            select(WorkbenchReleaseBinding).where(
                WorkbenchReleaseBinding.snapshot_id == pointer.snapshot_id
            )
        )
        if binding is not None:
            dataset = session.get(WorkbenchDataset, binding.dataset_id)

    # Latest game and schedule dates
    max_game_date: date | None = None
    min_game_date: date | None = None
    if dataset is not None:
        coverage = session.execute(
            select(
                func.min(WorkbenchTeamGame.game_date),
                func.max(WorkbenchTeamGame.game_date),
            ).where(WorkbenchTeamGame.dataset_id == dataset.id)
        ).one()
        min_game_date, max_game_date = coverage[0], coverage[1]

    # Latest job
    latest_job = session.scalar(
        select(WorkbenchJob).order_by(WorkbenchJob.created_at.desc()).limit(1)
    )
    running_job = session.scalar(
        select(WorkbenchJob).where(WorkbenchJob.status == "running").limit(1)
    )

    settings = get_settings()

    return {
        "status": "healthy" if pointer is not None else "uninitialized",
        "release": {
            "channel": DEFAULT_CHANNEL,
            "snapshot_id": pointer.snapshot_id if pointer else None,
            "dataset_id": dataset.id if dataset else None,
            "semantic_signature": dataset.semantic_signature if dataset else None,
            "published_at": pointer.published_at.isoformat() if pointer else None,
            "coverage_start": min_game_date.isoformat() if min_game_date else None,
            "coverage_end": max_game_date.isoformat() if max_game_date else None,
        },
        "source": {
            "namespace": dataset.source_namespace if dataset else "sportsdataverse",
            "admitted_seasons": (
                dataset.seasons_json if dataset else ["2023-24", "2024-25", "2025-26", "2026-27"]
            ),
            "latest_finalized_date": max_game_date.isoformat() if max_game_date else None,
        },
        "worker": {
            "scheduled_refresh_utc": settings.worker_refresh_time_utc,
            "active_job": (
                {
                    "id": running_job.id,
                    "job_type": running_job.job_type,
                    "stage": running_job.stage,
                    "started_at": (
                        running_job.started_at.isoformat() if running_job.started_at else None
                    ),
                }
                if running_job
                else None
            ),
            "latest_job": (
                {
                    "id": latest_job.id,
                    "job_type": latest_job.job_type,
                    "status": latest_job.status,
                    "stage": latest_job.stage,
                    "finished_at": (
                        latest_job.finished_at.isoformat() if latest_job.finished_at else None
                    ),
                }
                if latest_job
                else None
            ),
        },
        "capabilities": {
            "research": True,
            "forecasting": (
                session.scalar(
                    select(ModelPolicyActivation.policy_name)
                    .where(ModelPolicyActivation.is_active == True)  # noqa: E712
                    .order_by(ModelPolicyActivation.activated_at.desc())
                    .limit(1)
                )
                or "no_policy_registered"
            ),
            "teams_count": len(NBA_TEAMS),
            "portraits": {
                "total_cached": session.scalar(select(func.count(PlayerPortrait.id))) or 0,
                "active": session.scalar(
                    select(func.count(PlayerPortrait.id)).where(PlayerPortrait.status == "active")
                )
                or 0,
                "total_players": session.scalar(
                    select(func.count(distinct(WorkbenchPlayerGame.player_id)))
                )
                or 0,
                "storage_path": str(settings.portraits_cache_path),
            },
        },
    }
