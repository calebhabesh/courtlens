"""W7: the PC's timers as one VPS service; due rules, health records and staleness."""

from __future__ import annotations

import subprocess
from datetime import UTC, datetime, timedelta

import pytest

from courtlens.services import scheduled_jobs as jobs

DAILY = jobs.BY_NAME["daily"]
ROSTERS = jobs.BY_NAME["rosters"]
IMPACT = jobs.BY_NAME["season-impact"]


def utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)


def test_the_schedule_is_the_pcs_timers():
    assert [j.args[0] for j in jobs.JOBS] == [
        "refresh-espn-rosters",
        "refresh-daily",
        "refresh-season-lineups",
        "refresh-season-impact",
        "refresh-metric-backtest",
    ]
    assert DAILY.last_slot(utc(2026, 11, 12, 13, 29)) == utc(2026, 11, 11, 13, 30)
    assert DAILY.last_slot(utc(2026, 11, 12, 13, 30)) == utc(2026, 11, 12, 13, 30)
    assert jobs.BY_NAME["lineups"].next_slot(utc(2026, 11, 12, 13, 0)) == utc(2026, 11, 12, 14, 5)
    # Rosters every six hours on Eastern time: 18:00 EST is 23:00 UTC.
    assert ROSTERS.last_slot(utc(2026, 11, 12, 23, 30)) == utc(2026, 11, 12, 23, 0)
    assert ROSTERS.next_slot(utc(2026, 11, 12, 23, 30)) == utc(2026, 11, 13, 5, 0)
    # Season impact: Mondays only (2026-11-16 is a Monday).
    assert IMPACT.next_slot(utc(2026, 11, 12, 20, 0)) == utc(2026, 11, 16, 14, 30)
    assert IMPACT.last_slot(utc(2026, 11, 12, 20, 0)) == utc(2026, 11, 9, 14, 30)


def ok(args, **kwargs):
    return subprocess.CompletedProcess(args, 0, "done\n", "")


def fail(args, **kwargs):
    return subprocess.CompletedProcess(args, 2, "", "boom\n")


def test_a_job_seen_first_records_a_baseline_and_does_not_run(tmp_path):
    calls = []
    ran = jobs.run_due(utc(2026, 11, 12, 20, 0), tmp_path, lambda a, **k: calls.append(a) or ok(a))
    assert ran == [] and calls == []
    assert jobs.read_health(DAILY, tmp_path)["last_attempt_slot"] == "2026-11-12T13:30:00+00:00"


def test_each_due_job_runs_once_for_its_slot(tmp_path):
    jobs.run_due(utc(2026, 11, 12, 20, 0), tmp_path, ok)  # baselines
    calls = []

    def runner(args, **kwargs):
        calls.append(args[1])
        return ok(args)

    jobs.run_due(utc(2026, 11, 13, 13, 31), tmp_path, runner)
    assert calls == ["refresh-espn-rosters", "refresh-daily"]
    jobs.run_due(utc(2026, 11, 13, 13, 50), tmp_path, runner)
    assert calls == ["refresh-espn-rosters", "refresh-daily"]  # nothing new is due
    health = jobs.read_health(DAILY, tmp_path)
    assert health["last_exit"] == 0 and "last_success" in health and "last_failure" not in health


def test_a_failed_job_is_recorded_and_the_loop_continues(tmp_path):
    jobs.run_due(utc(2026, 11, 12, 20, 0), tmp_path, ok)
    calls = []

    def runner(args, **kwargs):
        calls.append(args[1])
        return fail(args) if args[1] == "refresh-daily" else ok(args)

    jobs.run_due(utc(2026, 11, 13, 15, 1), tmp_path, runner)
    assert calls == [
        "refresh-espn-rosters",
        "refresh-daily",
        "refresh-season-lineups",
        "refresh-metric-backtest",
    ]
    health = jobs.read_health(DAILY, tmp_path)
    assert health["last_exit"] == 2 and "boom" in health["last_output"]
    assert "last_success" not in health and "last_failure" in health


def test_a_timeout_is_a_failure(tmp_path):
    def slow(args, **kwargs):
        raise subprocess.TimeoutExpired(args, kwargs["timeout"])

    health = jobs.run_job(DAILY, utc(2026, 11, 13, 13, 30), tmp_path, slow)
    assert health["last_exit"] == -1 and "timed out" in health["last_output"]


def test_a_slot_older_than_the_catch_up_window_is_skipped(tmp_path):
    jobs.run_due(utc(2026, 11, 12, 20, 0), tmp_path, ok)
    calls = []
    jobs.run_due(utc(2026, 11, 14, 12, 0), tmp_path, lambda a, **k: calls.append(a[1]) or ok(a))
    # Daily's newest slot (13 Nov 13:30) is 22.5 h old: past the 20 h window, so it waits.
    assert "refresh-daily" not in calls


def test_status_marks_a_job_stale_after_its_limit(tmp_path):
    now = utc(2026, 11, 13, 20, 0)
    jobs.write_health(
        DAILY, {"job": "daily", "last_success": "2026-11-13T13:40:00+00:00"}, tmp_path
    )
    jobs.write_health(
        ROSTERS, {"job": "rosters", "last_success": "2026-11-12T05:00:00+00:00"}, tmp_path
    )
    by = {j["job"]: j for j in jobs.status(now, tmp_path)["jobs"]}
    assert by["daily"]["stale"] is False and by["rosters"]["stale"] is True
    assert by["lineups"]["stale"] is True  # never succeeded
    assert by["daily"]["next_run"] == "2026-11-14T13:30:00+00:00"


@pytest.mark.parametrize("now", [utc(2026, 11, 12, 20, 0), utc(2026, 11, 16, 14, 29)])
def test_the_service_sleeps_until_the_next_scheduled_time(now):
    seconds = jobs.seconds_to_next(now)
    wake = now + timedelta(seconds=seconds)
    assert (
        min(j.next_slot(now) for j in jobs.JOBS)
        <= wake
        <= min(j.next_slot(now) for j in jobs.JOBS) + timedelta(seconds=61)
    )


def test_the_health_endpoint(tmp_path, monkeypatch):
    from fastapi.testclient import TestClient

    from courtlens.api.app import create_app

    monkeypatch.setattr(jobs, "HEALTH_DIR", tmp_path)
    monkeypatch.setattr(jobs.status, "__defaults__", (None, tmp_path))
    jobs.write_health(
        DAILY, {"job": "daily", "last_success": "2026-11-13T13:40:00+00:00"}, tmp_path
    )
    response = TestClient(create_app()).get("/api/job-health")
    assert response.status_code == 200 and response.headers["cache-control"] == "no-store"
    names = [j["job"] for j in response.json()["jobs"]]
    assert names == ["rosters", "daily", "lineups", "season-impact", "metric-backtest"]
