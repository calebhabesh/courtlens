from __future__ import annotations

from datetime import UTC, date, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchiveDataset, ArchiveTeamGame
from courtlens.services.publication import FEATURE_VERSION, METRIC_VERSION, SCORING_VERSION
from courtlens.warehouse_models import (
    PublishedSnapshot,
    ServingOpponentContext,
    ServingPlayerGame,
    ServingPlayerProfile,
    ServingSnapshot,
    WarehouseBuild,
)


def seed_analytics_snapshot(session: Session) -> ServingSnapshot:
    dataset = ArchiveDataset(
        content_sha256="c" * 64,
        observation_sha256="o" * 64,
        source_namespace="fixture:analytics",
        parser_version="test-v1",
        manifest_json={},
        status="accepted",
    )
    session.add(dataset)
    session.flush()
    build = WarehouseBuild(
        dataset_id=dataset.id,
        status="ready",
        candidate_schema="cl_candidate_analytics",
        code_version="test",
        metric_version=METRIC_VERSION,
        feature_version=FEATURE_VERSION,
        scoring_version=SCORING_VERSION,
    )
    session.add(build)
    session.flush()
    snapshot = ServingSnapshot(
        build_id=build.id,
        dataset_id=dataset.id,
        status="ready",
        mode="historical_reconstruction",
        source=dataset.source_namespace,
        coverage_start=date(2023, 1, 1),
        coverage_end=date(2023, 1, 20),
        default_replay_date=date(2023, 1, 10),
        supported_replay_dates_json=["2023-01-02", "2023-01-10"],
        code_version="test",
        metric_version=METRIC_VERSION,
        feature_version=FEATURE_VERSION,
        scoring_version=SCORING_VERSION,
        quality_report_json={"status": "passed"},
    )
    session.add(snapshot)
    session.flush()
    session.add(
        PublishedSnapshot(channel="public", snapshot_id=snapshot.id, published_at=datetime.now(UTC))
    )
    stats = {
        "points": 28,
        "reboundsTotal": 8,
        "assists": 7,
        "steals": 1,
        "blocks": 1,
        "turnovers": 3,
        "fieldGoalsMade": 10,
        "fieldGoalsAttempted": 19,
        "threePointersMade": 2,
        "threePointersAttempted": 6,
        "freeThrowsMade": 6,
        "freeThrowsAttempted": 7,
    }
    games = [
        ("0000000001", date(2023, 1, 1), 2100, 42.5),
        ("0000000002", date(2023, 1, 4), 2220, 45.5),
        ("0000000003", date(2023, 1, 8), 2280, 48.5),
    ]
    for game_id, game_date, minutes, reference in games:
        session.add(
            ServingPlayerGame(
                snapshot_id=snapshot.id,
                dataset_id=dataset.id,
                game_id=game_id,
                player_id="23",
                player_name="Fixture Star",
                team_id="100",
                opponent_id="200",
                game_date=game_date,
                season="2022-23",
                appearance="appeared",
                minutes_seconds=minutes,
                stats_json=stats,
                reference_points=reference,
                source_version_id=f"version-{game_id}",
                source_observation_id=f"observation-{game_id}",
            )
        )
    session.add_all(
        [
            ArchiveTeamGame(
                dataset_id=dataset.id,
                game_id="0000000004",
                team_id="100",
                opponent_id="200",
                game_date=date(2023, 1, 11),
                date_precision="date_only",
                season="2022-23",
                side="home",
                points=110,
                stats_json={},
                source_version_id="team-version-100",
                source_observation_id="team-observation-100",
            ),
            ArchiveTeamGame(
                dataset_id=dataset.id,
                game_id="0000000004",
                team_id="200",
                opponent_id="100",
                game_date=date(2023, 1, 11),
                date_precision="date_only",
                season="2022-23",
                side="away",
                points=105,
                stats_json={},
                source_version_id="team-version-200",
                source_observation_id="team-observation-200",
            ),
        ]
    )
    summary = {
        "n": 3,
        "minutes_n": 3,
        "minutes_per_game": 36.0,
        "points_n": 3,
        "points_per_game": 28.0,
        "reference_points_n": 3,
        "reference_points_per_game": 45.5,
        "reference_points_per_minute": 1.26,
        "fg_pct": 0.526,
        "fg3_pct": 0.333,
        "ft_pct": 0.857,
    }
    session.add(
        ServingPlayerProfile(
            snapshot_id=snapshot.id,
            dataset_id=dataset.id,
            player_id="23",
            player_name="Fixture Star",
            season="2022-23",
            replay_date=date(2023, 1, 10),
            cutoff_utc=datetime(2023, 1, 10, 5, tzinfo=UTC),
            inferred_team_id="100",
            last_observed_date=date(2023, 1, 8),
            target_game_id="0000000004",
            target_game_date=date(2023, 1, 11),
            target_opponent_id="200",
            lead_days=1,
            last_5_json=summary,
            last_10_json=summary,
            season_json={**summary, "reference_points_stddev": 3.0},
            max_history_date=date(2023, 1, 8),
        )
    )
    session.add(
        ServingOpponentContext(
            snapshot_id=snapshot.id,
            dataset_id=dataset.id,
            team_id="200",
            season="2022-23",
            replay_date=date(2023, 1, 10),
            eligible_games=7,
            context_json={
                "eligible_games": 7,
                "points_allowed_per_game": 112.4,
                "rebounds_allowed_per_game": 43.0,
                "assists_allowed_per_game": 25.1,
            },
            max_history_date=date(2023, 1, 8),
        )
    )
    session.commit()
    return snapshot


def test_analytics_requires_a_published_snapshot(api_client: TestClient) -> None:
    response = api_client.get("/api/analytics/catalog")

    assert response.status_code == 503
    assert response.json()["detail"]["reason"] == "no_published_data"


def test_catalog_search_and_profile_pin_one_snapshot(
    api_client: TestClient, session: Session
) -> None:
    snapshot = seed_analytics_snapshot(session)

    catalog = api_client.get("/api/analytics/catalog")
    search = api_client.get(
        "/api/analytics/players",
        params={"query": "star", "season": "2022-23", "snapshotId": snapshot.id},
    )
    profile = api_client.get(
        "/api/analytics/players/23",
        params={"date": "2023-01-10", "snapshotId": snapshot.id},
    )

    assert catalog.status_code == 200
    assert catalog.json()["snapshot_id"] == snapshot.id
    assert catalog.json()["default_replay_date"] == "2023-01-10"
    assert search.json()["players"][0]["name"] == "Fixture Star"
    assert profile.status_code == 200, profile.text
    assert profile.json()["snapshot_id"] == snapshot.id
    assert profile.json()["summaries"]["last_5"]["minutes_per_game"] == 36.0
    assert profile.json()["estimate"]["status"] == "insufficient_history"
    assert profile.json()["target"]["side"] == "home"


def test_game_log_is_prior_only_paginated_and_cursor_bound(
    api_client: TestClient, session: Session
) -> None:
    snapshot = seed_analytics_snapshot(session)
    params = {"date": "2023-01-10", "snapshotId": snapshot.id, "limit": 2}

    first = api_client.get("/api/analytics/players/23/games", params=params)
    assert first.status_code == 200, first.text
    assert [row["date"] for row in first.json()["games"]] == ["2023-01-08", "2023-01-04"]
    cursor = first.json()["next_cursor"]
    second = api_client.get("/api/analytics/players/23/games", params={**params, "cursor": cursor})
    assert [row["date"] for row in second.json()["games"]] == ["2023-01-01"]

    wrong_date = api_client.get(
        "/api/analytics/players/23/games",
        params={**params, "date": "2023-01-02", "cursor": cursor},
    )
    assert wrong_date.status_code == 422


def test_empty_history_and_unsupported_date_are_explicit(
    api_client: TestClient, session: Session
) -> None:
    snapshot = seed_analytics_snapshot(session)

    empty = api_client.get(
        "/api/analytics/players/23",
        params={"date": "2023-01-02", "snapshotId": snapshot.id},
    )
    invalid = api_client.get(
        "/api/analytics/players/23",
        params={"date": "2023-01-03", "snapshotId": snapshot.id},
    )

    assert empty.status_code == 200
    assert empty.json()["summaries"]["last_5"] is None
    assert empty.json()["estimate"]["history_n"] == 0
    assert invalid.status_code == 422
    assert invalid.json()["detail"]["reason"] == "unsupported_replay_date"
    assert invalid.json()["detail"]["nearest_supported_dates"] == ["2023-01-02", "2023-01-10"]


def test_comparison_rejects_identical_players_and_pins_snapshot(
    api_client: TestClient, session: Session
) -> None:
    snapshot = seed_analytics_snapshot(session)

    response = api_client.get(
        "/api/analytics/compare",
        params={
            "playerA": "23",
            "playerB": "23",
            "date": "2023-01-10",
            "snapshotId": snapshot.id,
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"]["reason"] == "identical_players"


def test_evaluation_never_attaches_to_a_different_snapshot(
    api_client: TestClient, session: Session
) -> None:
    snapshot = seed_analytics_snapshot(session)

    response = api_client.get("/api/analytics/evaluations", params={"snapshotId": snapshot.id})

    assert response.status_code == 404
    assert response.json()["detail"]["reason"] == "evaluation_snapshot_mismatch"
