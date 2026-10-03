"""B21 API against isolated PostgreSQL fixtures; transaction rollback preserves real data."""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import date
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from courtload.api.app import create_app
from courtload.config import get_settings
from courtload.database import get_db
from courtload.models import new_uuid
from courtload.workbench_models import (
    WorkbenchDataset,
    WorkbenchLineupStint,
    WorkbenchObservation,
    WorkbenchSchedule,
    WorkbenchVersion,
    allow_admin_mutation,
)

pytestmark = pytest.mark.postgres


@pytest.fixture
def fixture_api() -> Iterator[tuple[TestClient, Session, dict, list[WorkbenchLineupStint]]]:
    url = os.getenv("COURTLOAD_TEST_POSTGRES_URL") or get_settings().database_url
    if not url.startswith("postgresql"):
        pytest.skip("PostgreSQL required")
    engine = create_engine(url)
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(connection, expire_on_commit=False)
    namespace = uuid4().hex
    dataset = WorkbenchDataset(
        id=new_uuid(),
        content_sha256=namespace * 2,
        membership_sha256=namespace * 2,
        semantic_signature=namespace * 2,
        source_namespace="test-b21",
        parser_version="test",
        quality_version="test",
        seasons_json=["2023-24"],
        phases_json=["regular_season", "playoffs"],
        manifest_json={},
        coverage_json={},
        exclusions_json={},
        status="active",
    )
    version = session.scalar(select(WorkbenchVersion))
    obs = session.scalar(select(WorkbenchObservation))
    assert version is not None and obs is not None, "Requires admitted baseline source metadata"
    stints = []
    with allow_admin_mutation(session):
        session.add(dataset)
        session.flush()
        # Two prior games, same-day, future, wrong phase, unfinished, and missing warehouse game.
        for index, (day, phase, status) in enumerate(
            [
                (10, "regular_season", 3),
                (11, "regular_season", 3),
                (15, "regular_season", 3),
                (20, "regular_season", 3),
                (10, "playoffs", 3),
                (10, "regular_season", 2),
                (12, "regular_season", 3),
            ]
        ):
            gid = f"99{namespace[:6]}{index:02d}"
            session.add(
                WorkbenchSchedule(
                    id=new_uuid(),
                    dataset_id=dataset.id,
                    game_id=gid,
                    game_date=date(2024, 1, day),
                    season="2023-24",
                    phase=phase,
                    home_team_id="TOR",
                    away_team_id="O",
                    game_status=status,
                    source_version_id=version.id,
                    source_observation_id=obs.id,
                )
            )
            if index == 6:
                continue
            for j, lineup in enumerate(
                [
                    ["a", "b", "f", "d", "e"],
                    ["x", "b", "f", "d", "e"],
                ]
            ):
                stint = WorkbenchLineupStint(
                    id=new_uuid(),
                    dataset_id=dataset.id,
                    game_id=gid,
                    stint_index=j,
                    period=1,
                    start_clock="12:00",
                    end_clock="06:00",
                    start_seconds_remaining=720,
                    end_seconds_remaining=360,
                    duration_seconds=360,
                    home_team_id="TOR",
                    away_team_id="O",
                    home_lineup_json=lineup,
                    away_lineup_json=["o1", "o2", "o3", "o4", "o5"],
                    home_lineup_key="|".join(sorted(lineup)),
                    away_lineup_key="o1|o2|o3|o4|o5",
                    home_points=12 if j == 0 else 8,
                    away_points=9,
                    home_possessions=10,
                    away_possessions=9,
                    player_stats_json={"f": {"points": 6 if j == 0 else 2}},
                    source_hash=namespace * 2,
                    policy_version="possession-policy-v1",
                    status="valid",
                )
                stints.append(stint)
                session.add(stint)
        session.flush()
    app = create_app()

    def database() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_db] = database
    payload = {
        "release_id": dataset.id,
        "season": "2023-24",
        "phase": "regular_season",
        "before_date": "2024-01-15",
        "team_id": "1610612761",
        "together": ["a"],
        "min_games": 1,
        "min_possessions": 1,
    }
    try:
        with TestClient(app) as client:
            yield client, session, payload, stints
    finally:
        session.close()
        transaction.rollback()
        connection.close()
        engine.dispose()


def test_api_directional_exposure_coverage_and_partitions(fixture_api: tuple) -> None:
    client, _, payload, _ = fixture_api
    result = client.post("/api/workbench/operations/on-off", json=payload)
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["context"]["before_date"] == "2024-01-15"
    assert data["expected_games"] == 3 and data["observed_games"] == 2
    assert data["coverage_status"] == "partial"
    assert [c["stints"] for c in data["cells"]] == [2, 2]
    assert data["cells"][0]["offensive_possessions"] == 20
    assert data["cells"][0]["defensive_possessions"] == 18
    assert data["cells"][0]["raw_metrics"]["offensive_rating"] == 120
    assert data["cells"][0]["raw_metrics"]["defensive_rating"] == 100
    assert data["shifts"][0]["difference"] == 40
    assert sum(c["seconds"] for c in data["partitions"]) == 1440
    # Away orientation must use the opponent's scoring/exposure.
    away = dict(payload, team_id="O", together=["o1"])
    data = client.post("/api/workbench/operations/on-off", json=away).json()
    assert data["cells"][0]["raw_metrics"]["offensive_rating"] == 100
    assert data["cells"][1]["sample_status"] == "empty"


def test_same_day_future_mutations_do_not_change_evidence(fixture_api: tuple) -> None:
    client, session, payload, stints = fixture_api
    initial = client.post("/api/workbench/operations/wowy", json=payload).json()
    with allow_admin_mutation(session):
        stints[4].home_points = 500  # Same-day.
        stints[6].home_points = 999  # Future.
        stints[8].home_points = 999  # Different phase.
        session.flush()
    after = client.post("/api/workbench/operations/wowy", json=payload).json()
    assert initial["input_hash"] == after["input_hash"]
    assert initial["evidence_hash"] == after["evidence_hash"]
    with allow_admin_mutation(session):
        stints[0].home_points = 11
        session.flush()
    changed = client.post("/api/workbench/operations/wowy", json=payload).json()
    assert changed["evidence_hash"] != initial["evidence_hash"]


def test_teammate_shifts_exact_units_and_date_range(fixture_api: tuple) -> None:
    client, _, payload, _ = fixture_api
    shifted = client.post("/api/workbench/operations/stat-shift", json=dict(payload, player_id="f"))
    assert shifted.status_code == 200
    data = shifted.json()
    pts = next(s for s in data["shifts"] if s["metric"] == "points_per_100")
    assert pts["selected_value"] == 60 and pts["complement_value"] == 20
    assert pts["difference"] == 40
    unit = dict(payload, exact_unit=["a", "b"], lower_date="2024-01-11")
    unit.pop("together")
    result = client.post("/api/workbench/operations/wowy", json=unit).json()
    assert result["observed_games"] == 1
    assert len(result["partitions"]) == 4
    assert result["cells"][0]["stints"] == 1
    unit["exact_unit"] = ["a", "b", "f", "d", "e"]
    result = client.post("/api/workbench/operations/wowy", json=unit).json()
    assert len(result["partitions"]) == 32
    assert sum(c["stints"] for c in result["partitions"]) == 2


def test_invalid_game_quarantine_and_source_blocked(fixture_api: tuple) -> None:
    client, session, payload, stints = fixture_api
    with allow_admin_mutation(session):
        stints[0].home_lineup_json = ["a"]
        session.flush()
    data = client.post("/api/workbench/operations/wowy", json=payload).json()
    assert data["excluded_stints"] == 2  # Entire incomplete game's segments excluded.
    assert data["observed_games"] == 1
    no_data = dict(payload, lower_date="2024-01-12")
    data = client.post("/api/workbench/operations/wowy", json=no_data).json()
    assert data["coverage_status"] == "source_blocked"
    assert data["cells"][0]["points"] is None


def test_schema_scope_and_query_bounds(fixture_api: tuple, monkeypatch: pytest.MonkeyPatch) -> None:
    client, _, payload, _ = fixture_api
    for changes in [
        {"together": ["a", "a"]},
        {"together": [str(i) for i in range(6)]},
        {"leverage": True},
        {"min_possessions": 0},
        {"season": "2000-01"},
        {"before_date": "2030-01-01"},
        {"lower_date": "2020-01-01"},
    ]:
        result = client.post("/api/workbench/operations/wowy", json=dict(payload, **changes))
        assert result.status_code == 422
    assert client.post("/api/workbench/operations/stat-shift", json=payload).status_code == 422
    assert (
        client.post("/api/workbench/operations/on-off", json=dict(payload, apart=["b"])).status_code
        == 422
    )
    monkeypatch.setattr("courtload.services.on_off.MAX_STINTS", 1)
    result = client.post("/api/workbench/operations/wowy", json=payload)
    assert result.status_code == 422
    assert result.json()["detail"]["reason"] == "query_bound_exceeded"


def test_team_tricode_resolves_to_canonical_identity(fixture_api: tuple) -> None:
    client, _, payload, _ = fixture_api
    canonical = client.post("/api/workbench/operations/wowy", json=payload).json()
    alias = client.post("/api/workbench/operations/wowy", json=dict(payload, team_id="TOR"))
    assert alias.status_code == 200
    assert alias.json()["request"]["team_id"] == "1610612761"
    assert alias.json()["evidence_hash"] == canonical["evidence_hash"]
