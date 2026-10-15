"""Career table reads and the persisted Stats cohort store, on seeded PostgreSQL facts."""

from __future__ import annotations

import logging
import threading
from datetime import date
from typing import Any
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select, text, update
from sqlalchemy.orm import Session

from courtlens.api.app import create_app
from courtlens.database import get_db
from courtlens.domain.stats_presentation import StatsPresentation
from courtlens.services import stats_cohort_cache, stats_cohort_store
from courtlens.services.player_career import JOINED_COLUMNS, career_query, warm_stats_cohorts
from courtlens.services.stats_cohort_cache import (
    cohort_query,
    persisted_key,
    presentation_cohort,
    presentation_key,
)
from courtlens.services.stats_engine import execute_stats_query
from courtlens.services.workbench_analytics import resolve_workbench_context, season_context
from courtlens.stats_cohort_models import StatsCohortEntry
from courtlens.workbench_models import WorkbenchDataset, WorkbenchPlayerGame

PLAYER = "2544"
SEASONS = ["2025-26", "2024-25", "2023-24"]
ROW_FIELDS = (
    "player_name",
    "teams",
    "stints_count",
    "games_played",
    "total_minutes",
    "metrics",
    "sample_sizes",
    "table_qualified",
    "table_percentiles",
    "table_cohort_sample_sizes",
    "position",
)


@pytest.fixture(autouse=True)
def tracking_mart(workbench_db: Session, monkeypatch: pytest.MonkeyPatch) -> str:
    """The dbt tracking mart, inside the isolated schema: one observed feed for 2025-26."""
    schema = workbench_db.scalar(text("SELECT current_schema()"))
    mart = f"{schema}.mart_stats_player_tracking"
    workbench_db.execute(
        text(
            f"CREATE TABLE {mart} (dataset_id text, season text, season_type text, "
            "player_id text, team_id text, measure text, stat text, value numeric, row_key text)"
        )
    )
    add_tracking(workbench_db, mart, "feed-1")
    for module in ("stats_engine", "stats_cohort_store"):
        monkeypatch.setattr(f"courtlens.services.{module}.TRACKING_MART", mart)
    return mart


def add_tracking(session: Session, mart: str, dataset_id: str) -> None:
    session.execute(
        text(
            f"INSERT INTO {mart} VALUES "
            "(:d,'2025-26','regular_season',:p,'LAL','possessions','time_of_poss',300,:d||'a'),"
            "(:d,'2025-26','regular_season',:p,'LAL','possessions','min',900,:d||'b'),"
            "(:d,'2025-26','regular_season',:p,'LAL','passing','ast_pts_created',120,:d||'c')"
        ),
        {"d": dataset_id, "p": PLAYER},
    )
    session.commit()


@pytest.fixture
def client(workbench_db: Session):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: workbench_db
    with TestClient(app) as client:
        yield client


def stats_rows(
    client: TestClient, season: str, *, seasons: list[str] | None = None, ranks: bool = True
) -> list[dict[str, Any]]:
    """The player's rows from the Stats query, as the career table requested them before."""
    catalog = client.get("/api/workbench/catalog").json()
    scope = next(
        s
        for s in catalog["stats_scopes"]
        if s["season"] == season and s["phase"] == "regular_season"
    )
    query: dict[str, Any] = {
        "release_id": catalog["release_id"],
        "season": season,
        "phase": "regular_season",
        "before_date": scope["default_before_date"],
        "window": {"kind": "season"},
        "view_state": {"columns": JOINED_COLUMNS},
        "sort": [{"field": "gp", "direction": "desc"}],
        "page": {"limit": 1},
        "impact_manifest_sha256": catalog["impact"]["manifest_sha256"],
    }
    if seasons:
        query["season_scope"] = {"seasons": seasons, "aggregate_multi_season": True}
    else:
        query["darko_manifest_sha256"] = catalog["darko"]["manifest_sha256"]
    presentation: dict[str, Any] = {"player_ids": [PLAYER]}
    if ranks:
        presentation["table_percentiles"] = True
    response = client.post(
        "/api/workbench/query", json={"query": query, "presentation": presentation}
    )
    assert response.status_code == 200, response.text
    return list(response.json()["items"])


def qualification(item: dict[str, Any]) -> dict[str, Any]:
    return {key: entry.get("qualified") for key, entry in (item["impact_support"] or {}).items()}


def stored_entries(session: Session) -> int:
    session.commit()  # End the snapshot so entries committed by the store are visible.
    return int(session.scalar(select(func.count()).select_from(StatsCohortEntry)) or 0)


def test_career_rows_equal_each_seasons_stats_row(client: TestClient) -> None:
    career = client.get(f"/api/workbench/players/{PLAYER}/career").json()
    assert career["player_id"] == PLAYER and career["phase"] == "regular_season"
    assert [entry["season"] for entry in career["seasons"]] == SEASONS
    for entry in career["seasons"]:
        [expected] = stats_rows(client, entry["season"])
        for field in ROW_FIELDS:
            assert entry["item"][field] == expected[field], (entry["season"], field)
        assert qualification(entry["item"]) == qualification(expected)
        assert entry["item"]["table_percentiles"]
    [expected] = stats_rows(client, SEASONS[0], seasons=sorted(SEASONS), ranks=False)
    for field in ("games_played", "total_minutes", "metrics", "sample_sizes", "teams"):
        assert career["career"][field] == expected[field], field
    assert career["career"]["games_played"] == 90
    assert career["career"]["table_percentiles"] is None
    # The tracking join is live: 300 of 900 tracked minutes on the ball.
    assert career["seasons"][0]["item"]["metrics"]["on_ball_pct"] == pytest.approx(0.3333)
    assert career["seasons"][1]["item"]["metrics"]["on_ball_pct"] is None


def test_unknown_player_and_phase_without_games_are_empty(client: TestClient) -> None:
    unknown = client.get("/api/workbench/players/nobody/career").json()
    assert unknown["seasons"] == [] and unknown["career"] is None
    playoffs = client.get(f"/api/workbench/players/{PLAYER}/career?phase=playoffs").json()
    assert playoffs["seasons"] == [] and playoffs["career"] is None
    assert client.get(f"/api/workbench/players/{PLAYER}/career?phase=preseason").status_code == 422


def test_stored_seasons_serve_career_and_stats_without_aggregating_again(
    client: TestClient, workbench_db: Session
) -> None:
    first = client.get(f"/api/workbench/players/{PLAYER}/career").json()
    assert stored_entries(workbench_db) == len(SEASONS)
    before = stats_rows(client, "2024-25")
    # A new process: nothing in memory, so every season must come from the store.
    stats_cohort_cache.clear()
    with patch(
        "courtlens.services.stats_engine.execute_stats_query",
        side_effect=AssertionError("a stored season was aggregated again"),
    ):
        assert client.get(f"/api/workbench/players/{PLAYER}/career").json() == first
        assert stats_rows(client, "2024-25") == before
    assert stored_entries(workbench_db) == len(SEASONS)


def test_appended_games_supersede_stored_entries(client: TestClient, workbench_db: Session) -> None:
    first = client.get(f"/api/workbench/players/{PLAYER}/career").json()
    dataset_id = workbench_db.scalar(select(WorkbenchDataset.id))
    template = workbench_db.scalars(
        select(WorkbenchPlayerGame).where(
            WorkbenchPlayerGame.player_id == PLAYER, WorkbenchPlayerGame.season == "2024-25"
        )
    ).first()
    assert template is not None and dataset_id is not None
    columns = {
        column.key: getattr(template, column.key)
        for column in WorkbenchPlayerGame.__table__.columns
        if column.key != "id"
    }
    # Inside the stored cutoff: same scope, one more game.
    workbench_db.add(
        WorkbenchPlayerGame(**{**columns, "game_id": "0022599999", "game_date": date(2025, 1, 15)})
    )
    workbench_db.commit()
    stats_cohort_cache.clear()
    second = client.get(f"/api/workbench/players/{PLAYER}/career").json()
    games = {entry["season"]: entry["item"]["games_played"] for entry in second["seasons"]}
    assert games["2024-25"] == first["seasons"][1]["item"]["games_played"] + 1
    assert second["career"]["games_played"] == first["career"]["games_played"] + 1
    # Every season's key moved with the dataset fingerprint; superseded entries are gone.
    assert stored_entries(workbench_db) == len(SEASONS)


def test_new_tracking_observations_supersede_only_that_season(
    client: TestClient, workbench_db: Session, tracking_mart: str
) -> None:
    client.get(f"/api/workbench/players/{PLAYER}/career")
    keys = set(workbench_db.scalars(select(StatsCohortEntry.key)))
    workbench_db.execute(text(f"DELETE FROM {tracking_mart}"))
    workbench_db.commit()
    add_tracking(workbench_db, tracking_mart, "feed-2")
    stats_cohort_cache.clear()
    client.get(f"/api/workbench/players/{PLAYER}/career")
    workbench_db.commit()
    after = set(workbench_db.scalars(select(StatsCohortEntry.key)))
    # Only 2025-26 joins tracking; its entry was rebuilt, the others were reused.
    assert len(after) == len(SEASONS) and len(after - keys) == 1


def test_unready_datasets_never_persist(client: TestClient, workbench_db: Session) -> None:
    expected = client.get(f"/api/workbench/players/{PLAYER}/career").json()
    workbench_db.execute(text("DELETE FROM stats_cohort_entries"))
    workbench_db.execute(update(WorkbenchDataset).values(status="validating"))
    workbench_db.commit()
    stats_cohort_cache.clear()
    assert client.get(f"/api/workbench/players/{PLAYER}/career").json() == expected
    assert stored_entries(workbench_db) == 0


def test_subject_players_aggregate_exactly_their_cohort_rows(workbench_db: Session) -> None:
    base = resolve_workbench_context(workbench_db, requested_phase="regular_season")
    cutoff = date(2026, 1, 31)
    players = ["2544", "1626153", "1628424", "qa-050", "absent"]
    for seasons in (None, ["2024-25", "2025-26"], ["2023-24", "2024-25", "2025-26"]):
        query = career_query(base, "2025-26", cutoff, seasons=seasons)
        context = season_context(base, "2025-26", cutoff)
        cohort, _, _, _ = execute_stats_query(
            workbench_db, context, query, is_export=True, presentation=StatsPresentation()
        )
        subject, _, _, _ = execute_stats_query(
            workbench_db,
            context,
            query,
            is_export=True,
            presentation=StatsPresentation(),
            cohort_percentiles=False,
            subject_player_ids=players,
        )
        by_id = {row["player_id"]: row for row in cohort}
        assert {row["player_id"] for row in subject} == set(players) & set(by_id)
        assert len(subject) == len(set(players) & set(by_id)) == 4
        for row in subject:
            whole = by_id[row["player_id"]]
            for field in ("metrics", "sample_sizes", "games_played", "total_minutes", "teams"):
                assert row[field] == whole[field], (seasons, row["player_id"], field)
    with pytest.raises(ValueError, match="whole cohort"):
        execute_stats_query(
            workbench_db,
            season_context(base, "2025-26", cutoff),
            career_query(base, "2025-26", cutoff),
            is_export=True,
            presentation=StatsPresentation(),
            subject_player_ids=[PLAYER],
        )


def test_season_context_equals_a_resolved_context(workbench_db: Session) -> None:
    base = resolve_workbench_context(workbench_db, requested_phase="regular_season")
    for season, cutoff in (("2023-24", date(2024, 1, 31)), ("2025-26", date(2026, 1, 15))):
        assert season_context(base, season, cutoff) == resolve_workbench_context(
            workbench_db,
            requested_season=season,
            requested_phase="regular_season",
            requested_before_date=cutoff,
        )
    with pytest.raises(ValueError):
        season_context(
            resolve_workbench_context(workbench_db, requested_window="last_10"),
            "2025-26",
            date(2026, 1, 15),
        )


def test_concurrent_writers_store_one_entry_and_supersede_older_ones(
    workbench_db: Session, caplog: pytest.LogCaptureFixture
) -> None:
    base = resolve_workbench_context(workbench_db, requested_phase="regular_season")
    cutoff = date(2026, 1, 31)
    context = season_context(base, "2025-26", cutoff)
    scope = cohort_query(career_query(context, "2025-26", cutoff))
    rows, count = presentation_cohort(workbench_db, context, scope)
    scope_key, key = presentation_key(context, scope), persisted_key(workbench_db, context, scope)
    assert key is not None
    workbench_db.execute(text("DELETE FROM stats_cohort_entries"))
    workbench_db.add(
        StatsCohortEntry(
            key="superseded",
            scope_key=scope_key,
            release_id=context.release_id,
            season="2025-26",
            phase="regular_season",
            row_count=0,
            eligible=0,
        )
    )
    workbench_db.commit()

    def write() -> None:
        stats_cohort_store.save_cohort(workbench_db, context, scope, scope_key, key, rows, count)

    caplog.set_level(logging.WARNING, logger="courtlens.services.stats_cohort_store")
    writers = [threading.Thread(target=write) for _ in range(4)]
    for writer in writers:
        writer.start()
    for writer in writers:
        writer.join()
    assert not caplog.records
    workbench_db.commit()
    assert workbench_db.execute(select(StatsCohortEntry.key, StatsCohortEntry.row_count)).all() == [
        (key, len(rows))
    ]
    assert stats_cohort_store.load_cohort(workbench_db, key) == (rows, count)


def test_warm_stores_every_scope_once_and_prunes_other_releases(workbench_db: Session) -> None:
    workbench_db.add(
        StatsCohortEntry(
            key="other-release",
            scope_key="other-scope",
            release_id="retired-release",
            season="2023-24",
            phase="regular_season",
            row_count=0,
            eligible=0,
        )
    )
    workbench_db.commit()
    first = warm_stats_cohorts(workbench_db, prune=True)
    assert (first["built"], first["existing"], first["pruned"]) == (len(SEASONS), 0, 1)
    second = warm_stats_cohorts(workbench_db)
    assert (second["built"], second["existing"]) == (0, len(SEASONS))
    assert stored_entries(workbench_db) == len(SEASONS)


def test_comparison_career_stops_at_the_compared_season_and_cutoff(client: TestClient) -> None:
    catalog = client.get("/api/workbench/catalog").json()
    cutoff = next(
        s["default_before_date"]
        for s in catalog["stats_scopes"]
        if s["season"] == "2024-25" and s["phase"] == "regular_season"
    )
    response = client.get(
        "/api/workbench/compare/career",
        params={"playerA": PLAYER, "playerB": "nobody", "season": "2024-25", "beforeDate": cutoff},
    ).json()
    career = response["player_a"]
    assert career["seasons"] == ["2023-24", "2024-25"]
    # Alignment row 3, 21: the 2025-26 games after the compared season never count.
    [expected] = stats_rows(client, "2024-25", seasons=["2023-24", "2024-25"], ranks=False)
    for field in ("games_played", "total_minutes", "metrics"):
        assert career["item"][field] == expected[field], field
    assert response["player_b"] == {"player_id": "nobody", "seasons": [], "item": None}
