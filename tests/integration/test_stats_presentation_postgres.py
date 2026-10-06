"""PF01a arithmetic and API checks using transaction-local PostgreSQL facts."""

from __future__ import annotations

import os
from collections.abc import Iterator
from datetime import date
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from courtload.api.app import create_app
from courtload.database import get_db
from courtload.domain.query_spec import (
    PagingSpec,
    PredicateGroup,
    PredicateLeaf,
    QuerySpec,
    SampleFilter,
    SortSpec,
    TeamScope,
    WindowSpec,
)
from courtload.domain.stats_presentation import StatsPresentation
from courtload.services.stats_engine import (
    execute_stats_query,
    stats_cohort_summary,
    stats_presentation_hash,
)
from courtload.services.workbench_analytics import ResolvedContext


@pytest.fixture
def facts() -> Iterator[tuple[Session, ResolvedContext]]:
    url = os.getenv("COURTLOAD_TEST_POSTGRES_URL")
    if not url:
        if os.getenv("COURTLOAD_REQUIRE_POSTGRES_TESTS") == "1":
            pytest.fail("COURTLOAD_TEST_POSTGRES_URL is required")
        pytest.skip("explicit disposable PostgreSQL test URL required")
    engine = create_engine(url)
    with Session(engine) as session:
        # Temp relations shadow permanent ones on this connection and roll back.
        session.execute(
            text("""
            CREATE TEMP TABLE workbench_player_games (
                dataset_id text, player_id text, team_id text, game_id text,
                game_date date, season text, phase text, appearance text,
                minutes_seconds integer, points integer, stats_json jsonb
            ) ON COMMIT DROP
        """)
        )
        session.execute(
            text("""
            CREATE TEMP TABLE workbench_identities (
                external_id text, kind text, display_name text
            ) ON COMMIT DROP
        """)
        )
        # A: 2 games / 40 PTS / 20 PPG / 24 per 36.
        # B: 1 game / 30 PTS / 30 PPG / 36 per 36.
        # C: ties A's PPG, but 10 minutes -> 72 per 36.
        # D: known appearance with unrecorded outcome, excluded per metric.
        for index, (player_id, points, seconds) in enumerate(
            (
                ("a", 20, 1800),
                ("a", 20, 1800),
                ("b", 30, 1800),
                ("c", 20, 600),
                ("d", None, None),
            )
        ):
            session.execute(
                text("""
                INSERT INTO workbench_player_games VALUES (
                    'dataset', :pid, 'TOR', :gid, '2024-01-01', '2023-24',
                    'regular_season', 'appeared', :seconds, :points, '{}'
                )
            """),
                {
                    "pid": player_id,
                    "gid": f"game-{index}",
                    "seconds": seconds,
                    "points": points,
                },
            )
        session.execute(
            text("""
            INSERT INTO workbench_player_games VALUES
            ('dataset', 'a', 'TOR', 'future', '2024-02-01', '2023-24',
             'regular_season', 'appeared', 1800, 999, '{}'),
            ('dataset', 'a', 'TOR', 'dnp', '2024-01-02', '2023-24',
             'regular_season', 'did_not_play', 0, 0, '{}')
        """)
        )
        for player_id in ("a", "b", "c", "d"):
            session.execute(
                text("""
                INSERT INTO workbench_identities VALUES (:pid, 'player', :name)
            """),
                {"pid": player_id, "name": f"Player {player_id.upper()}"},
            )
        context = ResolvedContext(
            release_id="release",
            snapshot_id="release",
            dataset_id="dataset",
            dataset_type="workbench",
            semantic_signature="signature",
            mode="test",
            source="test",
            season="2023-24",
            phase="regular_season",
            before_date=date(2024, 2, 1),
            cutoff_utc="2024-02-01T05:00:00Z",
            window="season",
            coverage_start=date(2024, 1, 1),
            coverage_end=date(2024, 2, 1),
            default_before_date=date(2024, 2, 1),
            supported_dates=["2024-02-01"],
            published_at=None,
            warnings=[],
        )
        yield session, context
        session.rollback()
    engine.dispose()


@pytest.mark.parametrize(
    "metric, expected",
    [
        ("pts", ["a", "b", "c", "d"]),
        ("pts_per_game", ["b", "a", "c", "d"]),
        ("pts_per_36", ["c", "b", "a", "d"]),
    ],
)
def test_independent_arithmetic_across_pages(
    facts: tuple[Session, ResolvedContext], metric: str, expected: list[str]
) -> None:
    session, context = facts
    cursor = None
    seen = []
    while True:
        query = QuerySpec(
            season="2023-24", sort=[SortSpec(field=metric)], page=PagingSpec(limit=1, cursor=cursor)
        )
        items, count, cursor, more = execute_stats_query(
            session, context, query, presentation=StatsPresentation()
        )
        assert count == 4
        seen.extend(item["player_id"] for item in items)
        row = items[0]
        expected_values = {
            "a": (40, 20, 24),
            "b": (30, 30, 36),
            "c": (20, 20, 72),
            "d": (None, None, None),
        }
        assert (
            tuple(row["metrics"][key] for key in ("pts", "pts_per_game", "pts_per_36"))
            == (expected_values[row["player_id"]])
        )
        assert row["cohort_sample_sizes"]["pts_per_game"] == 3
        # Midranks for 20, 20, 30: 33, 33, 83; null excluded.
        assert (
            row["percentiles"]["pts_per_game"]
            == {"a": 33, "b": 83, "c": 33, "d": None}[row["player_id"]]
        )
        if not more:
            break
    assert seen == expected


def test_search_favorites_empty_and_analytical_cohort(
    facts: tuple[Session, ResolvedContext],
) -> None:
    session, context = facts
    query = QuerySpec(season="2023-24", name="Player B")
    presentation = StatsPresentation(player_ids=["b"])
    items, count, _, more = execute_stats_query(session, context, query, presentation=presentation)
    assert count == 1 and not more
    assert items[0]["percentiles"]["pts_per_game"] == 83
    summary = stats_cohort_summary(session, context, query, presentation)
    assert summary["eligible_players"] == 4
    assert summary["good_directions"]["tov"] == "low"
    assert execute_stats_query(
        session, context, query, presentation=StatsPresentation(player_ids=[])
    )[:2] == ([], 0)
    analytical = query.model_copy(
        update={"sample_filters": SampleFilter(min_games=2), "name": None}
    )
    items, count, _, _ = execute_stats_query(
        session, context, analytical, presentation=StatsPresentation()
    )
    assert count == 1 and items[0]["player_id"] == "a"
    assert items[0]["percentiles"]["pts_per_game"] is None
    assert items[0]["cohort_sample_sizes"]["pts_per_game"] == 1
    assert stats_cohort_summary(session, context, analytical, presentation)["eligible_players"] == 1


def test_cursor_binds_all_semantics_and_cohort_excludes_presentation(
    facts: tuple[Session, ResolvedContext],
) -> None:
    session, context = facts
    query = QuerySpec(season="2023-24", page=PagingSpec(limit=1))
    presentation = StatsPresentation()
    _, _, cursor, _ = execute_stats_query(session, context, query, presentation=presentation)
    assert cursor
    changes = [
        {"sample_filters": SampleFilter(min_attempts=1)},
        {"season_scope": {"seasons": ["2024-25"]}},
        {"window": WindowSpec(kind="last_5")},
        {"team_scope": TeamScope(team_id="BOS")},
        {"predicates": PredicateGroup(predicates=[PredicateLeaf(field="pts", op="gt", value=20)])},
        {"sort": [SortSpec(field="pts"), SortSpec(field="gp")]},
    ]
    for changeset in changes:
        changed = QuerySpec.model_validate(
            {**query.model_dump(), **changeset, "page": {"limit": 1, "cursor": cursor}}
        )
        with pytest.raises(HTTPException) as error:
            execute_stats_query(session, context, changed, presentation=presentation)
        assert error.value.status_code == 422
    paged = query.model_copy(update={"page": PagingSpec(limit=3, cursor=cursor)})
    assert len(execute_stats_query(session, context, paged, presentation=presentation)[0]) == 3
    with pytest.raises(HTTPException, match="cursor does not match"):
        execute_stats_query(
            session, context, paged, presentation=StatsPresentation(player_ids=["b"])
        )
    named = query.model_copy(update={"name": "Player B", "sort": [SortSpec(field="gp")]})
    assert stats_presentation_hash(context, query, presentation, cohort=True) == (
        stats_presentation_hash(context, named, StatsPresentation(player_ids=["b"]), cohort=True)
    )


def test_http_opt_in_and_legacy_payload(facts: tuple[Session, ResolvedContext]) -> None:
    session, context = facts
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    with (
        patch("courtload.api.routers.workbench.resolve_workbench_context", return_value=context),
        TestClient(app) as client,
    ):
        query = {"season": "2023-24", "name": "Player B"}
        body = client.post("/api/workbench/query", json={"query": query, "presentation": {}})
        assert body.status_code == 200, body.text
        result = body.json()
        assert result["total_eligible_players"] == 4
        assert result["output_offset"] == 0
        assert result["total_output_players"] == 1
        assert result["cohort"]["eligible_players"] == 4
        assert result["items"][0]["percentiles"]["pts_per_game"] == 83
        first = client.post(
            "/api/workbench/query",
            json={"query": {"season": "2023-24", "page": {"limit": 1}}, "presentation": {}},
        ).json()
        second = client.post(
            "/api/workbench/query",
            json={
                "query": {
                    "season": "2023-24",
                    "page": {"limit": 1, "cursor": first["next_cursor"]},
                },
                "presentation": {},
            },
        ).json()
        assert second["output_offset"] == 1
        empty = client.post(
            "/api/workbench/query", json={"query": query, "presentation": {"player_ids": []}}
        ).json()
        assert empty["items"] == [] and empty["total_output_players"] == 0
        assert empty["cohort"]["eligible_players"] == 4
        legacy = client.post("/api/workbench/query", json={"query": query}).json()
        assert legacy["total_eligible_players"] == 1
        assert legacy["output_offset"] is None
        assert legacy["cohort"] is None
        assert legacy["items"][0]["metrics"]["pts"] == 30
        assert (
            client.post(
                "/api/workbench/query",
                json={"query": query, "presentation": {"version": "future"}},
            ).status_code
            == 422
        )


def test_per36_pairing_and_exact_half_rounding(facts: tuple[Session, ResolvedContext]) -> None:
    session, context = facts
    session.execute(
        text("""
        UPDATE workbench_player_games SET points = 30, minutes_seconds = 3456
        WHERE player_id = 'c'
    """)
    )
    query = QuerySpec(season="2023-24", name="Player C")
    legacy = execute_stats_query(session, context, query)[0][0]
    corrected = execute_stats_query(session, context, query, presentation=StatsPresentation())[0][0]
    assert legacy["metrics"]["pts_per_36"] == 18.7
    assert corrected["metrics"]["pts_per_36"] == 18.8
    session.execute(
        text("""
        INSERT INTO workbench_player_games VALUES
        ('dataset', 'c', 'TOR', 'zero-exposure', '2024-01-03', '2023-24',
         'regular_season', 'appeared', 0, 7, '{}')
    """)
    )
    corrected = execute_stats_query(session, context, query, presentation=StatsPresentation())[0][0]
    assert corrected["metrics"]["pts"] == 37
    assert corrected["metrics"]["pts_per_36"] == 18.8
    assert corrected["sample_sizes"]["pts_per_36"] == 1


def test_future_outcomes_do_not_change_prior_cohort(facts: tuple[Session, ResolvedContext]) -> None:
    session, context = facts
    query = QuerySpec(season="2023-24")
    before = execute_stats_query(session, context, query, presentation=StatsPresentation())
    summary = stats_cohort_summary(session, context, query, StatsPresentation())
    session.execute(
        text("UPDATE workbench_player_games SET points = 9999 WHERE game_id = 'future'")
    )
    assert execute_stats_query(session, context, query, presentation=StatsPresentation()) == before
    assert stats_cohort_summary(session, context, query, StatsPresentation()) == summary


@pytest.mark.parametrize(
    "changes",
    [
        {"entity_kind": "team"},
        {"team_scope": {"current_roster_only": True}},
        {"sample_filters": {"min_possessions": 1}},
        {"window": {"kind": "last_n_team_games", "n": 10}},
        {"metric_selectors": [{"key": "pts"}]},
        {"sort": [{"field": "phase"}]},
        {"predicates": {"predicates": [{"field": "phase", "op": "eq", "value": "playoffs"}]}},
    ],
)
def test_unsupported_scope_is_explicit(
    facts: tuple[Session, ResolvedContext], changes: dict[str, object]
) -> None:
    session, context = facts
    query = QuerySpec.model_validate({"season": "2023-24", **changes})
    with pytest.raises(HTTPException) as error:
        execute_stats_query(session, context, query, presentation=StatsPresentation())
    assert error.value.status_code == 422


def test_catalog_observed_pairs_and_exclusive_defaults(
    facts: tuple[Session, ResolvedContext],
) -> None:
    from courtload.services.stats_catalog import stats_catalog_scope

    session, context = facts
    session.execute(
        text("""
        INSERT INTO workbench_player_games VALUES
        ('dataset', 'new', 'TOR', 'recent', '2025-04-01', '2024-25',
         'playoffs', 'appeared', 1800, 25, '{}'),
        ('dataset', 'future', 'TOR', 'scheduled', '2026-01-01', '2025-26',
         'regular_season', 'unknown', NULL, NULL, '{}')
        """)
    )
    catalog = stats_catalog_scope(session, context)
    assert catalog["seasons"] == ["2023-24", "2024-25"]
    assert catalog["default_season"] == "2024-25"
    assert catalog["default_phase"] == "playoffs"
    assert catalog["default_before_date"] == "2025-04-02"
    assert [(s["season"], s["phase"]) for s in catalog["stats_scopes"]] == [
        ("2023-24", "regular_season"),
        ("2024-25", "playoffs"),
    ]
    assert "pts_per_36" in catalog["stats_sort_fields"]
