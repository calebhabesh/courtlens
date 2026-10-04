"""Final detail respects dataset/phase/cutoff and never creates Live demand."""

from dataclasses import replace
from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import func, select

from courtload.api.app import create_app
from courtload.database import get_db
from courtload.domain.live_history import HistoricalSlate
from courtload.live_models import LiveLease, LiveObservation
from courtload.services.live_history import historical_slate
from courtload.services.workbench_analytics import ResolvedContext
from courtload.workbench_models import WorkbenchDataset, WorkbenchPlayerGame, WorkbenchTeamGame

DAY = date(2025, 4, 15)


def seed(session):
    dataset = WorkbenchDataset(
        content_sha256="a" * 64,
        membership_sha256="b" * 64,
        semantic_signature="c" * 64,
        source_namespace="fixture",
        parser_version="test",
        quality_version="test",
        seasons_json=["2024-25"],
        phases_json=["regular_season", "playoffs"],
        manifest_json={},
        coverage_json={},
        exclusions_json={},
        status="ready",
    )
    session.add(dataset)
    session.flush()
    for game_id, phase, final, day in [
        ("0022401190", "regular_season", True, DAY),
        ("0042401190", "playoffs", True, DAY),
        ("0022401191", "regular_season", False, DAY),
        ("0022401192", "regular_season", True, date(2025, 4, 16)),
    ]:
        for team, opponent, side, points, opp_points in [
            ("1610612738", "1610612761", "home", 110, 100),
            ("1610612761", "1610612738", "away", 100, 110),
        ]:
            session.add(
                WorkbenchTeamGame(
                    dataset_id=dataset.id,
                    game_id=game_id,
                    team_id=team,
                    opponent_id=opponent,
                    side=side,
                    points=points,
                    opponent_points=opp_points,
                    is_final=final,
                    season="2024-25",
                    phase=phase,
                    game_date=day,
                    stats_json={"points": points, "assists": None},
                    source_version_id="fixture",
                    source_observation_id="fixture",
                )
            )
    session.add(
        WorkbenchPlayerGame(
            dataset_id=dataset.id,
            game_id="0022401190",
            player_id="player-observed",
            team_id="1610612761",
            opponent_id="1610612738",
            game_date=DAY,
            season="2024-25",
            phase="regular_season",
            appearance="reported",
            minutes_original="unknown",
            minutes_seconds=None,
            points=0,
            stats_json={"points": 0, "assists": None},
            source_version_id="fixture",
            source_observation_id="fixture",
        )
    )
    session.add(
        WorkbenchPlayerGame(
            dataset_id=dataset.id,
            game_id="0022401190",
            player_id="reported-nonappearance",
            team_id="1610612761",
            opponent_id="1610612738",
            game_date=DAY,
            season="2024-25",
            phase="regular_season",
            appearance="reported_nonappearance",
            minutes_original="0",
            minutes_seconds=0,
            points=0,
            stats_json={"points": 0},
            source_version_id="fixture",
            source_observation_id="fixture",
        )
    )
    session.flush()
    return ResolvedContext(
        release_id=dataset.id,
        snapshot_id=dataset.id,
        dataset_id=dataset.id,
        dataset_type="workbench",
        semantic_signature=dataset.semantic_signature,
        mode="historical_reconstruction",
        source="fixture",
        season="2024-25",
        phase="regular_season",
        before_date=date(2025, 4, 16),
        cutoff_utc="2025-04-16T04:00:00Z",
        window="season",
        coverage_start=DAY,
        coverage_end=DAY,
        default_before_date=date(2025, 4, 16),
        supported_dates=[DAY.isoformat()],
        published_at=None,
        warnings=[],
    )


def test_final_history_context_missingness_and_no_mutations(session):
    context = seed(session)
    output = HistoricalSlate.model_validate(historical_slate(session, context, DAY, "0022401190"))
    assert len(output.games) == 1
    assert output.games[0].provisional is False
    assert output.games[0].event_time is None
    assert [t.score for t in output.games[0].teams] == [100, 110]
    assert output.players and output.players[0].statistics["points"] == "0"
    assert output.players[0].statistics["assists"] is None
    assert output.players[0].reported_nonappearance is None
    assert output.players[1].reported_nonappearance is True
    assert all(value is None for value in output.players[1].statistics.values())
    assert session.scalar(select(func.count()).select_from(LiveLease)) == 0
    assert session.scalar(select(func.count()).select_from(LiveObservation)) == 0
    assert len(historical_slate(session, context, DAY)["games"]) == 1
    assert historical_slate(session, replace(context, before_date=DAY), DAY)["games"] == []
    assert historical_slate(session, replace(context, dataset_id="other"), DAY)["games"] == []
    playoffs = historical_slate(session, replace(context, phase="playoffs"), DAY)
    assert [g["source_id"] for g in playoffs["games"]] == ["0042401190"]
    assert historical_slate(session, context, DAY, "0022401191")["games"] == []


def test_archive_phase_gate(session):
    context = seed(session)
    with pytest.raises(HTTPException) as error:
        historical_slate(session, replace(context, dataset_type="archive", phase="playoffs"), DAY)
    assert error.value.status_code == 422


def test_historical_http_explicit_release_and_exclusive_cutoff(session):
    context = seed(session)
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    with TestClient(app) as client:
        params = {"slate_date": DAY.isoformat(), "releaseId": context.release_id}
        response = client.get("/api/live/historical", params=params)
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        assert response.json()["context"]["before_date"] == "2025-04-16"
        assert len(response.json()["games"]) == 1
        params["beforeDate"] = "2025-04-15"
        assert client.get("/api/live/historical", params=params).json()["games"] == []
        params["game_id"] = "../../jobs"
        assert client.get("/api/live/historical", params=params).status_code == 422
