"""Live date-strip counts read retained schedule and finals without Live demand (FO08)."""

from dataclasses import replace
from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from test_live_history import DAY, seed

from courtlens.api.app import create_app
from courtlens.database import get_db
from courtlens.live_models import LiveCurrent, LiveObservation
from courtlens.services.schedule_dates import schedule_dates
from courtlens.workbench_models import WorkbenchSchedule


def add_schedule(session, dataset_id: str) -> None:
    for game_id, phase, day, status in [
        ("0022401190", "regular_season", DAY, 3),
        ("0042401190", "playoffs", DAY, 3),
        ("0022401191", "regular_season", DAY, 2),
        ("0022401192", "regular_season", date(2025, 4, 16), 3),
        ("0022401193", "regular_season", date(2025, 4, 20), 1),
    ]:
        session.add(
            WorkbenchSchedule(
                dataset_id=dataset_id,
                game_id=game_id,
                season="2024-25",
                phase=phase,
                game_date=day,
                home_team_id="1610612738",
                away_team_id="1610612761",
                game_status=status,
                annotations_json={},
                source_version_id="fixture",
                source_observation_id="fixture",
            )
        )
    session.flush()


def counts(result):
    return {d["date"]: (d["scheduled"], d["finals"]) for d in result["days"]}


def test_counts_scheduled_and_admitted_finals_per_date(session):
    context = seed(session)
    add_schedule(session, context.dataset_id)
    result = schedule_dates(
        session, context, date(2025, 4, 14), date(2025, 4, 17), focus=date(2025, 4, 17)
    )
    assert counts(result) == {
        date(2025, 4, 14): (0, 0),
        DAY: (3, 2),  # the non-final game is scheduled but not an admitted final
        date(2025, 4, 16): (1, 1),
        date(2025, 4, 17): (0, 0),
    }
    assert result["nearest_scheduled"] == {"before": date(2025, 4, 16), "after": date(2025, 4, 20)}
    assert result["nearest_finals"] == {"before": date(2025, 4, 16), "after": None}
    assert session.scalar(select(func.count()).select_from(LiveCurrent)) == 0
    assert session.scalar(select(func.count()).select_from(LiveObservation)) == 0


def test_phase_and_exclusive_cutoff_narrow_counts(session):
    context = seed(session)
    add_schedule(session, context.dataset_id)
    window = (date(2025, 4, 15), date(2025, 4, 16))
    playoffs = schedule_dates(session, context, *window, phase="playoffs")
    assert counts(playoffs) == {DAY: (1, 1), date(2025, 4, 16): (0, 0)}
    cut = schedule_dates(session, context, *window, before_date=date(2025, 4, 16))
    # The cutoff applies to finals only; the schedule is a calendar, not an outcome.
    assert counts(cut) == {DAY: (3, 2), date(2025, 4, 16): (1, 0)}


def test_archive_schedule_and_non_regular_finals_stay_unknown(session):
    context = replace(seed(session), dataset_type="archive")
    result = schedule_dates(session, context, DAY, DAY, phase="playoffs")
    assert counts(result) == {DAY: (None, None)}
    assert result["nearest_scheduled"] == {"before": None, "after": None}
    assert result["warnings"]


def test_range_is_bounded(session):
    context = seed(session)
    with pytest.raises(HTTPException) as error:
        schedule_dates(session, context, date(2025, 1, 1), date(2025, 6, 1))
    assert error.value.status_code == 422
    with pytest.raises(HTTPException):
        schedule_dates(session, context, DAY, date(2025, 4, 1))


def test_http_endpoint_resolves_release_and_is_not_cached(session):
    context = seed(session)
    add_schedule(session, context.dataset_id)
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    with TestClient(app) as client:
        response = client.get(
            "/api/workbench/schedule/dates",
            params={"start": "2025-04-15", "end": "2025-04-16", "releaseId": context.release_id},
        )
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        body = response.json()
        assert body["dataset_id"] == context.dataset_id
        assert body["days"] == [
            {"date": "2025-04-15", "scheduled": 3, "finals": 2},
            {"date": "2025-04-16", "scheduled": 1, "finals": 1},
        ]
