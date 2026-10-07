from __future__ import annotations

from datetime import UTC, datetime

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from courtlens.demo import DEMO_EMAIL, DEMO_PASSWORD, DEMO_WEEK_START
from courtlens.models import FantasyLeague, Game, IngestionRun, User
from courtlens.security import hash_password


def token_for(client: TestClient, email: str, password: str) -> str:
    response = client.post("/api/auth/token", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_health_and_methodology_are_public(api_client: TestClient) -> None:
    assert api_client.get("/api/health").json()["status"] == "ok"
    methodology = api_client.get("/api/methodology")
    assert methodology.status_code == 200
    assert "startable_player_game" in methodology.json()["metrics"]


def test_public_data_status_exposes_failure_type_but_redacts_detail(
    demo_league, api_client: TestClient, session: Session
) -> None:  # type: ignore[no-untyped-def]
    failed = IngestionRun(
        source_name="balldontlie",
        status="failed",
        error_summary="ProviderSchemaError: private source row content",
    )
    session.add(failed)
    session.commit()

    response = api_client.get("/api/data-status")

    assert response.status_code == 200
    assert response.json()["latest_attempt"]["error"] == "ProviderSchemaError"
    assert "private source row" not in response.text
    assert response.json()["freshness"]["status"] == "fixture"


def test_schedule_excludes_postponed_games_from_slate_counts(
    demo_league, api_client: TestClient, session: Session
) -> None:  # type: ignore[no-untyped-def]
    game = session.get(Game, 8010)
    assert game is not None
    game.postponed = True
    game.status_state = "postponed"
    session.commit()

    response = api_client.get("/api/schedule/week", params={"start": DEMO_WEEK_START.isoformat()})

    assert response.status_code == 200
    first_day = response.json()["days"][0]
    assert first_day["game_count"] == 1
    assert {game["id"] for game in first_day["games"]} == {8011}


def test_schedule_flags_back_to_back_from_day_before_selected_week(
    demo_league, api_client: TestClient, session: Session
) -> None:  # type: ignore[no-untyped-def]
    prior_game = session.get(Game, 8006)
    assert prior_game is not None
    prior_game.scheduled_start_utc = datetime(2025, 2, 2, 23, 30, tzinfo=UTC)
    session.commit()

    response = api_client.get("/api/schedule/week", params={"start": DEMO_WEEK_START.isoformat()})

    first_day_games = response.json()["days"][0]["games"]
    team_flags = {
        team["id"]: team["back_to_back"]
        for game in first_day_games
        for team in (game["away"], game["home"])
    }
    assert team_flags[9002] is True
    assert team_flags[9003] is True
    assert team_flags[9001] is False
    assert team_flags[9004] is False


def test_player_form_links_to_non_payload_lineage_trace(
    demo_league, api_client: TestClient
) -> None:  # type: ignore[no-untyped-def]
    form_response = api_client.get(
        "/api/players/9101/form", params={"asOf": "2025-02-03T00:00:00Z", "window": 10}
    )
    assert form_response.status_code == 200
    first_game = form_response.json()["games"][0]

    lineage_response = api_client.get(first_game["lineage_url"])

    assert lineage_response.status_code == 200
    lineage = lineage_response.json()
    assert lineage["player_game"]["source_object_id"] == first_game["source_object_id"]
    assert len(lineage["raw_source"]["content_sha256"]) == 64
    assert "mart_player_point_in_time_features" in lineage["warehouse_path"]
    assert lineage["raw_payload_exposed"] is False


def test_private_planner_requires_owner_and_reconciles(demo_league, api_client: TestClient) -> None:  # type: ignore[no-untyped-def]
    anonymous = api_client.get(
        f"/api/fantasy/leagues/{demo_league.id}/planner",
        params={"weekStart": DEMO_WEEK_START.isoformat()},
    )
    assert anonymous.status_code == 401

    token = token_for(api_client, DEMO_EMAIL, DEMO_PASSWORD)
    response = api_client.get(
        f"/api/fantasy/leagues/{demo_league.id}/planner",
        params={"weekStart": DEMO_WEEK_START.isoformat()},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["summary"]["startable_player_games"] > 0


def test_weekly_lock_league_is_rejected_explicitly(demo_league, api_client: TestClient) -> None:  # type: ignore[no-untyped-def]
    token = token_for(api_client, DEMO_EMAIL, DEMO_PASSWORD)
    response = api_client.post(
        "/api/fantasy/leagues",
        headers={"Authorization": f"Bearer {token}"},
        json={"name": "Unsupported weekly league", "lineup_mode": "weekly"},
    )

    assert response.status_code == 422
    assert "daily lineups only" in response.text


def test_cross_owner_league_is_not_disclosed(
    demo_league, api_client: TestClient, session: Session
) -> None:  # type: ignore[no-untyped-def]
    outsider = User(email="outsider@example.com", password_hash=hash_password("a-long-password"))
    session.add(outsider)
    session.commit()
    outsider_token = token_for(api_client, "outsider@example.com", "a-long-password")

    response = api_client.get(
        f"/api/fantasy/leagues/{demo_league.id}",
        headers={"Authorization": f"Bearer {outsider_token}"},
    )
    assert response.status_code == 404


def test_acquisition_exhaustion_returns_explained_invalid_state(
    demo_league: FantasyLeague, api_client: TestClient, session: Session
) -> None:
    from courtlens.models import FantasyWeekState

    state = (
        session.query(FantasyWeekState)
        .filter_by(league_id=demo_league.id, week_start=DEMO_WEEK_START)
        .one()
    )
    state.acquisitions_used = demo_league.acquisition_limit
    session.commit()
    token = token_for(api_client, DEMO_EMAIL, DEMO_PASSWORD)
    response = api_client.post(
        f"/api/fantasy/leagues/{demo_league.id}/scenarios",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "week_start": DEMO_WEEK_START.isoformat(),
            "effective_date": DEMO_WEEK_START.isoformat(),
            "dropped_player_id": 9102,
            "added_player_id": 9106,
            "added_eligible_slots": ["G"],
        },
    )
    assert response.status_code == 409
    assert response.json()["detail"]["reason"] == "acquisition_limit_exhausted"
