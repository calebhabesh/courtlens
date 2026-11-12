"""The scheduled jobs on the VPS (Win Probability v4, W7): the PC's timers, run in one service.

Each job is the same `courtlens` command its PC timer ran, on the same schedule, run as its own
process so a failure or a memory peak never takes the loop down. One job at a time, in schedule
order. A job is due when its newest scheduled time is later than the last one it was attempted
for; a job seen for the first time records that time without running, so a deploy never starts a
refresh by surprise (`--run` starts one by hand). Every attempt writes the job's health record:
last success, last failure, how long it took and the tail of its output. `GET /api/job-health` returns
them; a job whose last success is older than its stale limit is stale.
"""

from __future__ import annotations

import json
import os
import subprocess
import time as clock
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")
HEALTH_DIR = Path("data/derived/job-health")
OUTPUT_TAIL = 2_000
MIN_SLEEP = 60
CATCH_UP = timedelta(hours=20)


def _daily(
    at: time, tz: ZoneInfo | Any = UTC, weekday: int | None = None
) -> Callable[[datetime], datetime]:
    """The newest scheduled time at or before `now` (optionally one weekday only)."""

    def last(now: datetime) -> datetime:
        local = now.astimezone(tz)
        day = local.date()
        for back in range(8):
            candidate_day: date = day - timedelta(days=back)
            if weekday is not None and candidate_day.weekday() != weekday:
                continue
            candidate = datetime.combine(candidate_day, at, tz)
            if candidate <= local:
                return candidate.astimezone(UTC)
        raise AssertionError("no scheduled time in the last week")

    return last


def _every_six_hours_eastern(now: datetime) -> datetime:
    local = now.astimezone(EASTERN)
    hour = (local.hour // 6) * 6
    return datetime.combine(local.date(), time(hour), EASTERN).astimezone(UTC)


@dataclass(frozen=True)
class Job:
    name: str
    args: tuple[str, ...]
    timeout: timedelta
    last_slot: Callable[[datetime], datetime]
    period: timedelta
    stale_after: timedelta

    def next_slot(self, now: datetime) -> datetime:
        """The first scheduled time after `now` (searching forward by minutes is exact here)."""
        last = self.last_slot(now)
        probe = now + timedelta(minutes=1)
        while self.last_slot(probe) == last:
            probe += (
                timedelta(minutes=1) if self.period <= timedelta(hours=6) else timedelta(minutes=5)
            )
        return self.last_slot(probe)


# The PC's timers (scripts/install_data_refresh.sh), in the order they run each morning.
JOBS: tuple[Job, ...] = (
    Job(
        "rosters",
        ("refresh-espn-rosters",),
        timedelta(minutes=15),
        _every_six_hours_eastern,
        timedelta(hours=6),
        timedelta(hours=13),
    ),
    Job(
        "daily",
        ("refresh-daily",),
        timedelta(hours=2),
        _daily(time(13, 30)),
        timedelta(days=1),
        timedelta(hours=30),
    ),
    Job(
        "lineups",
        ("refresh-season-lineups",),
        timedelta(hours=1),
        _daily(time(14, 5)),
        timedelta(days=1),
        timedelta(hours=30),
    ),
    Job(
        "season-impact",
        ("refresh-season-impact",),
        timedelta(hours=2),
        _daily(time(14, 30), UTC, weekday=0),
        timedelta(days=7),
        timedelta(days=8),
    ),
    Job(
        "metric-backtest",
        ("refresh-metric-backtest",),
        timedelta(minutes=30),
        _daily(time(15, 0)),
        timedelta(days=1),
        timedelta(hours=30),
    ),
)
BY_NAME = {job.name: job for job in JOBS}


def health_path(job: Job, root: Path = HEALTH_DIR) -> Path:
    return root / f"{job.name}.json"


def read_health(job: Job, root: Path = HEALTH_DIR) -> dict[str, Any]:
    path = health_path(job, root)
    if not path.exists():
        return {"job": job.name}
    body: dict[str, Any] = json.loads(path.read_text())
    return body


def write_health(job: Job, body: dict[str, Any], root: Path = HEALTH_DIR) -> None:
    root.mkdir(parents=True, exist_ok=True)
    path = health_path(job, root)
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")
    os.replace(temporary, path)


def _iso(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds")


def run_job(
    job: Job,
    slot: datetime,
    root: Path = HEALTH_DIR,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> dict[str, Any]:
    """Run one job now for its scheduled time `slot`; record the attempt either way."""
    health = read_health(job, root)
    started = now()
    begun = clock.monotonic()
    health.update(last_attempt_slot=_iso(slot), last_started=_iso(started))
    write_health(job, health, root)
    try:
        result = runner(
            ["courtlens", *job.args],
            capture_output=True,
            text=True,
            timeout=job.timeout.total_seconds(),
            check=False,
        )
        code, output = result.returncode, (result.stdout or "") + (result.stderr or "")
    except subprocess.TimeoutExpired as error:
        code, output = -1, f"timed out after {job.timeout}: {error}"
    except OSError as error:
        code, output = -1, repr(error)
    finished = now()
    health.update(
        last_finished=_iso(finished),
        last_seconds=round(clock.monotonic() - begun, 1),
        last_exit=code,
        last_output=output[-OUTPUT_TAIL:],
    )
    if code == 0:
        health["last_success"] = _iso(finished)
    else:
        health["last_failure"] = _iso(finished)
    write_health(job, health, root)
    return health


def due(job: Job, now: datetime, root: Path = HEALTH_DIR) -> datetime | None:
    """The scheduled time to run for, or None. A job seen for the first time records a baseline."""
    slot = job.last_slot(now)
    health = read_health(job, root)
    attempted = health.get("last_attempt_slot")
    if attempted is None:
        health["last_attempt_slot"] = _iso(slot)
        health["baseline"] = "first seen; waits for its next scheduled time"
        write_health(job, health, root)
        return None
    if datetime.fromisoformat(attempted) >= slot or now - slot > CATCH_UP:
        return None
    return slot


def run_due(
    now: datetime | None = None,
    root: Path = HEALTH_DIR,
    runner: Callable[..., subprocess.CompletedProcess[str]] = subprocess.run,
) -> list[dict[str, Any]]:
    """Run every due job, one at a time, in schedule order."""
    ran = []
    for job in JOBS:
        at = now or datetime.now(UTC)
        slot = due(job, at, root)
        if slot is not None:
            ran.append(run_job(job, slot, root, runner))
    return ran


def seconds_to_next(now: datetime | None = None) -> int:
    now = now or datetime.now(UTC)
    wake = min(job.next_slot(now) for job in JOBS)
    return max(MIN_SLEEP, int((wake - now).total_seconds()) + 1)


def status(now: datetime | None = None, root: Path = HEALTH_DIR) -> dict[str, Any]:
    """Every job's health, with `stale` when its last success is older than its limit."""
    now = now or datetime.now(UTC)
    jobs = []
    for job in JOBS:
        health = read_health(job, root)
        success = health.get("last_success")
        stale = success is None or now - datetime.fromisoformat(success) > job.stale_after
        jobs.append(
            {
                "job": job.name,
                "command": "courtlens " + " ".join(job.args),
                "next_run": _iso(job.next_slot(now)),
                "stale_after_hours": job.stale_after.total_seconds() / 3600,
                "stale": stale,
                **{k: v for k, v in health.items() if k != "last_output"},
                "last_output_tail": (health.get("last_output") or "")[-400:],
            }
        )
    return {"checked_at": _iso(now), "jobs": jobs}
