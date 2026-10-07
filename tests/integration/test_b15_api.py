"""Integration tests for Block B15 API endpoints: team operations, schedule, four factors, peers."""

from __future__ import annotations

import os
from collections.abc import Generator
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from courtlens.api.app import create_app


@pytest.fixture
def client() -> TestClient:
    app = create_app()
    return TestClient(app)


@pytest.fixture(autouse=True)
def setup_postgres_env() -> Generator[None, None, None]:
    url = os.getenv("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        if os.getenv("CI") or os.getenv("COURTLENS_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("COURTLENS_TEST_POSTGRES_URL must be configured")
        pytest.skip("COURTLENS_TEST_POSTGRES_URL is not configured")
    with patch.dict(os.environ, {"COURTLENS_DATABASE_URL": url}):
        yield


def test_teams_overview_enriched_percentages(client: TestClient) -> None:
    """GET /api/workbench/teams returns all 30 teams with enriched shooting percentages."""
    resp = client.get("/api/workbench/teams?season=2023-24")
    assert resp.status_code == 200
    data = resp.json()

    assert "teams" in data
    assert len(data["teams"]) == 30

    toronto = next((t for t in data["teams"] if t["tricode"] == "TOR"), None)
    assert toronto is not None
    assert toronto["games_played"] == 82
    assert toronto["wins"] + toronto["losses"] == 82

    prod = toronto["production"]
    assert prod["pts_per_game"] > 100.0
    assert prod["fg_pct"] is not None
    assert 0.40 <= prod["fg_pct"] <= 0.60
    assert prod["fg3_pct"] is not None
    assert 0.25 <= prod["fg3_pct"] <= 0.45
    assert prod["efg_pct"] is not None
    assert prod["efg_pct"] >= prod["fg_pct"]

    allow = toronto["allowance"]
    assert allow["pts_allowed_per_game"] > 100.0
    assert allow["fg_pct_allowed"] is not None
    assert allow["efg_pct_allowed"] is not None


def test_team_detail_enhanced_splits(client: TestClient) -> None:
    """GET /api/workbench/teams/{id} returns full record, home/away splits, streak, and cohort."""
    resp = client.get("/api/workbench/teams/1610612761?season=2023-24")
    assert resp.status_code == 200
    data = resp.json()

    assert data["team"]["tricode"] == "TOR"
    assert data["team"]["name"] == "Toronto Raptors"
    assert data["record"]["games_played"] == 82

    assert "home_split" in data
    assert data["home_split"]["games_played"] > 0
    home_w = data["home_split"]["wins"]
    home_l = data["home_split"]["losses"]
    assert home_w + home_l == data["home_split"]["games_played"]

    assert "away_split" in data
    assert data["away_split"]["games_played"] > 0
    away_w = data["away_split"]["wins"]
    away_l = data["away_split"]["losses"]
    assert away_w + away_l == data["away_split"]["games_played"]

    assert (
        data["home_split"]["games_played"] + data["away_split"]["games_played"]
        == data["record"]["games_played"]
    )

    assert "current_streak" in data
    assert data["current_streak"] is not None

    cohort_names = [p["player_name"] for p in data["player_cohort"]]
    assert any("Scottie Barnes" in name for name in cohort_names)


def test_team_schedule_endpoint(client: TestClient) -> None:
    """GET /api/workbench/teams/{id}/schedule returns schedule, rest days, and B2B summary."""
    resp = client.get("/api/workbench/teams/1610612761/schedule?season=2023-24")
    assert resp.status_code == 200
    data = resp.json()

    assert data["team"]["tricode"] == "TOR"
    assert data["overall_record"]["games_played"] == 82

    games = data["games"]
    assert len(games) == 82

    # Game 1 (opener): rest_days is None
    assert games[0]["rest_days"] is None
    assert games[0]["is_back_to_back"] is False

    # Verify all subsequent games have integer rest days
    for g in games[1:]:
        assert g["rest_days"] is not None
        assert g["rest_days"] >= 0
        if g["rest_days"] == 0:
            assert g["is_back_to_back"] is True
            assert g["rest_bucket"] == "0_days_rest"
        else:
            assert g["is_back_to_back"] is False

    # Rest splits
    rest_splits = data["rest_splits"]
    assert len(rest_splits) == 4
    bucket_keys = [rs["bucket_key"] for rs in rest_splits]
    assert "0_days_rest" in bucket_keys
    assert "1_day_rest" in bucket_keys
    assert "2_days_rest" in bucket_keys
    assert "3+_days_rest" in bucket_keys

    # Back-to-Back Summary
    b2b = data["back_to_back_summary"]
    second_leg = b2b["second_leg_games"]
    assert second_leg["games"] > 0
    assert second_leg["wins"] + second_leg["losses"] == second_leg["games"]

    first_leg = b2b["first_leg_games"]
    assert first_leg["games"] > 0
    assert first_leg["wins"] + first_leg["losses"] == first_leg["games"]

    assert data["longest_homestand"] > 0
    assert data["longest_road_trip"] > 0


def test_team_schedule_temporal_cutoff(client: TestClient) -> None:
    """Schedule context strictly excludes games on or after beforeDate."""
    resp = client.get(
        "/api/workbench/teams/1610612761/schedule?season=2023-24&beforeDate=2024-01-01"
    )
    assert resp.status_code == 200
    data = resp.json()

    cutoff_games = data["games"]
    assert len(cutoff_games) < 82
    assert len(cutoff_games) > 0
    for g in cutoff_games:
        assert g["game_date"] < "2024-01-01"

    assert data["overall_record"]["games_played"] == len(cutoff_games)


def test_team_four_factors_endpoint(client: TestClient) -> None:
    """GET /api/workbench/teams/{id}/four-factors computes factors and league ranks."""
    resp = client.get("/api/workbench/teams/1610612761/four-factors?season=2023-24")
    assert resp.status_code == 200
    data = resp.json()

    assert data["team"]["tricode"] == "TOR"
    assert data["games_played"] == 82
    assert data["pace"] is not None
    assert 90.0 <= data["pace"] <= 110.0
    assert data["off_rating"] is not None
    assert data["def_rating"] is not None
    assert data["net_rating"] is not None

    # Offense Four Factors
    off_factors = {item["key"]: item for item in data["offense_factors"]}
    assert "efg_pct" in off_factors
    assert "tov_pct" in off_factors
    assert "oreb_pct" in off_factors
    assert "ftr" in off_factors

    for k in ["efg_pct", "tov_pct", "oreb_pct", "ftr"]:
        item = off_factors[k]
        assert item["value"] is not None
        assert item["league_avg"] is not None
        assert 1 <= item["rank"] <= 30
        assert 0.0 <= item["percentile"] <= 100.0

    # Defense Four Factors
    def_factors = {item["key"]: item for item in data["defense_factors"]}
    assert "opp_efg_pct" in def_factors
    assert "opp_tov_pct" in def_factors
    assert "dreb_pct" in def_factors
    assert "opp_oreb_pct" in def_factors
    assert "opp_ftr" in def_factors

    for k in ["opp_efg_pct", "opp_tov_pct", "dreb_pct", "opp_ftr"]:
        item = def_factors[k]
        assert item["value"] is not None
        assert item["league_avg"] is not None
        assert 1 <= item["rank"] <= 30

    # Three-Point Variation Scenario
    scenario = data["three_point_scenario"]
    assert scenario["observed_fg3m"] > 0
    assert scenario["observed_fg3a"] > 0
    assert scenario["league_3p_pct"] > 0.30
    assert scenario["hypothetical_fg3m"] > 0
    assert "what-if accounting" in scenario["disclaimer"]


def test_team_peers_endpoint(client: TestClient) -> None:
    """GET /api/workbench/teams/{id}/peers returns statistically similar teams."""
    resp = client.get("/api/workbench/teams/1610612761/peers?season=2023-24&limit=5")
    assert resp.status_code == 200
    data = resp.json()

    assert data["team"]["tricode"] == "TOR"
    peers = data["peers"]
    assert len(peers) == 5

    # Self-exclusion: Toronto must not be in its own peers
    assert all(p["tricode"] != "TOR" for p in peers)
    assert all(p["team_id"] != "1610612761" for p in peers)

    # Sorted by distance ascending
    for i in range(len(peers) - 1):
        assert peers[i]["distance"] <= peers[i + 1]["distance"]
        assert peers[i]["similarity_score"] >= peers[i + 1]["similarity_score"]


def test_team_three_point_variation_endpoint(client: TestClient) -> None:
    """GET /api/workbench/teams/{id}/three-point-variation returns Feature F18 scenario."""
    resp = client.get("/api/workbench/teams/1610612761/three-point-variation?season=2023-24")
    assert resp.status_code == 200
    data = resp.json()

    assert data["team"]["tricode"] == "TOR"
    scen = data["scenario"]
    assert scen["observed_fg3a"] > 0
    assert "disclaimer" in scen
    assert "what-if accounting" in scen["disclaimer"]


def test_team_endpoints_not_found(client: TestClient) -> None:
    """Unknown team id returns 404."""
    resp_factors = client.get("/api/workbench/teams/999999999/four-factors?season=2023-24")
    assert resp_factors.status_code == 404

    resp_sched = client.get("/api/workbench/teams/999999999/schedule?season=2023-24")
    assert resp_sched.status_code == 404
