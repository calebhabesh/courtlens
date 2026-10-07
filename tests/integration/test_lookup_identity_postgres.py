"""PF03 scoped identity, cache isolation and temporal invariance on PostgreSQL."""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import date
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import Session

from courtlens.api.app import create_app
from courtlens.database import get_db
from courtlens.services.entity_lookup import (
    clear_lookup_caches,
    lookup_entities,
    scoped_team_associations,
)


@pytest.fixture
def facts() -> Iterator[Session]:
    url = os.getenv("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        pytest.fail("Explicit disposable PostgreSQL URL required for PF03 identity acceptance")
    engine = create_engine(url)
    clear_lookup_caches()
    with Session(engine) as session:
        session.execute(
            text("""
            CREATE TEMP TABLE workbench_player_games (
                dataset_id text, player_id text, team_id text, game_date date,
                season text, phase text, appearance text
            ) ON COMMIT DROP
        """)
        )
        session.execute(
            text("""
            CREATE TEMP TABLE workbench_identities (
                id text, namespace text, external_id text, canonical_id text,
                kind text, display_name text, metadata_json jsonb
            ) ON COMMIT DROP
        """)
        )
        session.execute(
            text("""
            INSERT INTO workbench_identities VALUES
                ('identity', 'nba', 'p', NULL, 'player', 'Traded Player', '{}');
            INSERT INTO workbench_player_games VALUES
                ('dataset', 'p', 'NJN', '2011-01-01', '2010-11', 'regular_season', 'appeared'),
                ('dataset', 'p', 'DAL', '2025-01-01', '2024-25', 'regular_season', 'appeared'),
                ('dataset', 'p', '1610612747', '2025-02-02', '2024-25',
                 'regular_season', 'appeared'),
                ('dataset', 'p', 'BOS', '2025-02-01', '2024-25', 'regular_season', 'did_not_play'),
                ('dataset', 'p', 'MIA', '2025-02-01', '2024-25', 'playoffs', 'appeared'),
                ('other', 'p', 'TOR', '2025-01-01', '2024-25', 'regular_season', 'appeared')
        """)
        )
        yield session
        session.rollback()
    engine.dispose()
    clear_lookup_caches()


def association(session: Session, **kwargs):
    result = lookup_entities(session, query="Traded", dataset_id="dataset", **kwargs)
    return result.items[0]


def test_exclusive_cutoff_trade_season_phase_and_dataset(facts: Session):
    prior = association(
        facts, season="2024-25", phase="regular_season", before_date=date(2025, 2, 2)
    )
    assert prior.team_association.teams == ["DAL"]
    traded = association(
        facts, season="2024-25", phase="regular_season", before_date=date(2025, 2, 3)
    )
    assert traded.team_association.teams == ["DAL", "LAL"]
    assert traded.team_association.basis == "selected_scope"
    assert "Active" not in traded.subtitle
    historical = association(facts, season="2010-11")
    assert historical.team_association.teams == ["NJN"]
    last = association(facts)
    assert last.team_association.teams == ["LAL"]
    assert last.team_association.basis == "last_observed"
    assert "Last observed 2025-02-02" in last.subtitle


def test_future_facts_do_not_change_prior_association(facts: Session):
    kwargs = {"season": "2024-25", "phase": "regular_season", "before_date": date(2025, 2, 2)}
    prior = association(facts, **kwargs).team_association.model_dump(mode="json")
    facts.execute(
        text("UPDATE workbench_player_games SET team_id='TOR' WHERE game_date >= '2025-02-02'")
    )
    clear_lookup_caches()
    assert association(facts, **kwargs).team_association.model_dump(mode="json") == prior


def test_empty_scope_suggestions_and_no_scope_fallback(facts: Session):
    result = lookup_entities(
        facts, query="", kinds=["player"], dataset_id="dataset", season="2026-27"
    )
    item = result.items[0]
    assert item.team_association.teams == []
    assert not item.availability.has_current_season
    assert "No observed appearances" in item.subtitle


def test_scope_cache_avoids_sql_per_keystroke(facts: Session):
    association(facts, season="2024-25")
    statements = []
    connection = facts.connection()

    def record(_conn, _cursor, statement, _parameters, _context, _many):
        statements.append(statement)

    event.listen(connection, "before_cursor_execute", record)
    try:
        lookup_entities(facts, query="Player", dataset_id="dataset", season="2024-25")
        lookup_entities(facts, query="Tra", dataset_id="dataset", season="2024-25")
        assert statements == []
    finally:
        event.remove(connection, "before_cursor_execute", record)


def test_http_passes_scope_and_cutoff_alias(facts: Session):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: facts
    with patch("courtlens.api.routers.workbench.resolve_lookup_binding") as resolve:
        resolve.return_value = ("release", "dataset")
        with TestClient(app) as client:
            for cutoff in ("before_date", "beforeDate"):
                result = client.get(
                    "/api/workbench/lookup",
                    params={
                        "q": "Traded",
                        "release_id": "release",
                        "season": "2024-25",
                        "phase": "regular_season",
                        cutoff: "2025-02-02",
                    },
                )
                assert result.status_code == 200, result.text
                assert result.json()["items"][0]["team_association"]["teams"] == ["DAL"]
                destination = result.json()["items"][0]["destination_url"]
                assert "before_date=2025-02-02" in destination
                assert "phase=regular_season" in destination


def test_comparison_api_enrichment_preserves_legacy_payload_and_window(facts: Session):
    facts.execute(text("ALTER TABLE workbench_player_games ADD COLUMN game_id text"))
    facts.execute(text("UPDATE workbench_player_games SET game_id=game_date::text"))
    facts.execute(
        text("""
        INSERT INTO workbench_player_games
            (dataset_id, player_id, team_id, game_date, season, phase, appearance, game_id)
        SELECT 'dataset', 'p', 'LAL', '2025-02-02'::date + n,
               '2024-25', 'regular_season', 'appeared', 'game-' || n
        FROM generate_series(1, 4) n
    """)
    )
    recent = scoped_team_associations(
        facts,
        "dataset",
        "2024-25",
        "regular_season",
        date(2025, 3, 1),
        ["p"],
        window="last_5",
    )
    assert recent["p"].teams == ["LAL"]
    whole = scoped_team_associations(
        facts,
        "dataset",
        "2024-25",
        "regular_season",
        date(2025, 3, 1),
        ["p"],
    )
    assert whole["p"].teams == ["DAL", "LAL"]
    context = SimpleNamespace(
        dataset_id="dataset",
        season="2024-25",
        phase="regular_season",
        before_date=date(2025, 3, 1),
        window="last_5",
        to_dict=lambda: {},
    )
    legacy = {
        "context": {},
        "player_a": {"id": "p", "name": "Traded Player"},
        "player_b": {"id": "unknown", "name": "Unknown Player"},
        "aligned_metrics": [],
        "no_forced_winner_notice": "No winner inference",
        "warnings": [],
    }
    app = create_app()
    app.dependency_overrides[get_db] = lambda: facts
    with (
        patch("courtlens.api.routers.workbench.resolve_workbench_context", return_value=context),
        patch("courtlens.api.routers.workbench.compare_players", return_value=legacy),
        TestClient(app) as client,
    ):
        response = client.get(
            "/api/workbench/compare", params={"playerA": "p", "playerB": "unknown"}
        )
        assert response.status_code == 200, response.text
        assert response.json()["player_a"]["teams"] == ["LAL"]
        assert response.json()["player_b"]["teams"] == []
    assert "teams" not in legacy["player_a"]
