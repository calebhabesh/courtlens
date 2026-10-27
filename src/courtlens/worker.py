"""CourtLens background worker: job queue processor, daily refresh, and interruption recovery."""

from __future__ import annotations

import logging
import signal
import sys
import time
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from courtlens.config import get_settings
from courtlens.database import SessionLocal, engine
from courtlens.services.publication import DEFAULT_CHANNEL
from courtlens.services.workbench_jobs import (
    enqueue_job,
    execute_job,
    recover_interrupted_jobs,
)
from courtlens.warehouse_models import PublishedSnapshot
from courtlens.workbench_models import WorkbenchJob

logger = logging.getLogger("courtlens.worker")


class CourtLensWorker:
    """Single local worker managing allowlisted jobs and scheduled daily refresh."""

    def __init__(self, worker_id: str | None = None) -> None:
        self.worker_id = worker_id or f"worker-{uuid4().hex[:8]}"
        self.settings = get_settings()
        self.should_stop = False
        self._last_refresh_date: str | None = None

    def stop(self, *args: Any) -> None:
        """Signal handler to terminate worker loop gracefully."""
        logger.info("Termination signal received for worker %s", self.worker_id)
        self.should_stop = True

    def _is_refresh_due(self) -> bool:
        """Check if daily refresh is due based on configured UTC time and last execution."""
        now = datetime.now(UTC)
        today_str = now.strftime("%Y-%m-%d")

        # Parse target UTC time (e.g. "09:00")
        target_parts = self.settings.worker_refresh_time_utc.split(":")
        target_hour = int(target_parts[0])
        target_minute = int(target_parts[1]) if len(target_parts) > 1 else 0

        target_time = now.replace(hour=target_hour, minute=target_minute, second=0, microsecond=0)

        if now < target_time:
            return False

        # If already ran today in this worker instance
        if self._last_refresh_date == today_str:
            return False

        # Check database for any succeeded refresh job today
        with SessionLocal() as session:
            recent_refresh = session.scalar(
                select(WorkbenchJob).where(
                    WorkbenchJob.job_type == "refresh",
                    WorkbenchJob.status == "succeeded",
                    WorkbenchJob.finished_at >= target_time,
                )
            )
            if recent_refresh is not None:
                self._last_refresh_date = today_str
                return False

        return True

    def startup(self) -> None:
        """Startup checks: recover interrupted jobs, check bootstrap, catch-up refresh."""
        logger.info("Worker %s starting up...", self.worker_id)

        # 1. Recover interrupted jobs
        with SessionLocal() as session:
            recovered = recover_interrupted_jobs(
                session, lease_timeout_seconds=self.settings.worker_lease_timeout_seconds
            )
            if recovered:
                logger.info("Recovered %d interrupted job(s)", len(recovered))

        # 2. Check if bootstrap is needed (no published snapshot on public channel)
        with SessionLocal() as session:
            pub = session.get(PublishedSnapshot, DEFAULT_CHANNEL)
            if pub is None:
                logger.info("No published release found; enqueuing bootstrap job")
                enqueue_job(session, "bootstrap")

        # 3. Check if daily refresh is due (catch-up once on startup)
        if self._is_refresh_due():
            logger.info("Daily refresh is due on startup; enqueuing refresh job")
            with SessionLocal() as session:
                enqueue_job(session, "refresh")
            self._last_refresh_date = datetime.now(UTC).strftime("%Y-%m-%d")

    def run_next_job(self) -> bool:
        """Find and execute the oldest queued job. Return True if a job was processed."""
        with SessionLocal() as session:
            queued_job = session.scalar(
                select(WorkbenchJob)
                .where(WorkbenchJob.status == "queued")
                .order_by(WorkbenchJob.created_at.asc())
                .limit(1)
            )
            if queued_job is None:
                return False
            job_id = queued_job.id

        logger.info("Executing job %s...", job_id)
        try:
            execute_job(engine, job_id, worker_id=self.worker_id)
            logger.info("Job %s finished", job_id)
            return True
        except Exception as exc:
            logger.error("Error executing job %s: %s", job_id, exc)
            return True

    def run_loop(self) -> None:
        """Main worker execution loop."""
        self.startup()

        # Register signal handlers
        signal.signal(signal.SIGINT, self.stop)
        signal.signal(signal.SIGTERM, self.stop)

        logger.info("Worker %s ready. Listening for jobs...", self.worker_id)

        while not self.should_stop:
            # Check scheduled refresh
            if self._is_refresh_due():
                logger.info("Scheduled refresh due; enqueuing refresh job")
                with SessionLocal() as session:
                    enqueue_job(session, "refresh")
                self._last_refresh_date = datetime.now(UTC).strftime("%Y-%m-%d")

            # Process queued job if available
            processed = self.run_next_job()
            if not processed:
                time.sleep(self.settings.worker_poll_interval_seconds)

        logger.info("Worker %s shut down cleanly", self.worker_id)


def start_worker(worker_id: str | None = None, once: bool = False) -> None:
    """Entrypoint to run the local worker."""
    logging.basicConfig(
        level=getattr(logging, get_settings().log_level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    worker = CourtLensWorker(worker_id=worker_id)
    if once:
        worker.startup()
        while worker.run_next_job():
            pass
    else:
        worker.run_loop()


if __name__ == "__main__":
    once_flag = "--once" in sys.argv
    start_worker(once=once_flag)
