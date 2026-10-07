"""Integration tests for Block B16: Team Explorer and Comparison backend integration."""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from courtlens.api.app import create_app
from courtlens.database import get_db


@pytest.fixture
def client(workbench_db):
    app = create_app()
    app.dependency_overrides[get_db] = lambda: workbench_db
    with TestClient(app) as client:
        yield client


def _require_test_db() -> None:
    if not os.environ.get("COURTLENS_TEST_POSTGRES_URL"):
        pytest.skip("COURTLENS_TEST_POSTGRES_URL is not configured")


@pytest.mark.requires_published_data
def test_b16_teams_research_enriched_factors(client: TestClient) -> None:
    """Verify GET /api/workbench/teams returns conference, division, ratings, and four factors."""
    _require_test_db()
    res = client.get("/api/workbench/teams?season=2023-24")
    assert res.status_code == 200
    data = res.json()

    assert "teams" in data
    assert len(data["teams"]) == 30
    assert "order_notice" in data
    expected_notice = "Ties in record ordering do not establish official conference placement"
    assert expected_notice in data["order_notice"]
    assert "league_averages" in data
    assert "off_rating" in data["league_averages"]
    assert "def_rating" in data["league_averages"]
    assert "efg_pct" in data["league_averages"]

    bos = next((t for t in data["teams"] if t["tricode"] == "BOS"), None)
    assert bos is not None
    assert bos["conference"] == "Eastern"
    assert bos["division"] == "Atlantic"
    assert bos["wins"] == 64
    assert bos["ratings"] is not None
    assert bos["four_factors"] is not None


@pytest.mark.requires_published_data
def test_b16_toronto_reconciled_investigation(client: TestClient) -> None:
    """Verify Toronto 2023-24 participation cohort and participation/current-roster distinction."""
    _require_test_db()
    res = client.get("/api/workbench/teams/1610612761?season=2023-24")
    assert res.status_code == 200
    tor = res.json()

    assert tor["team"]["tricode"] == "TOR"
    assert tor["record"]["wins"] == 25
    assert tor["record"]["losses"] == 57
    assert tor["record"]["games_played"] == 82

    # In 2023-24, Toronto traded Siakam, Anunoby, Schroder, acquiring Barrett, Quickley, Olynyk
    # resulting in a 31-player participation cohort across the season
    cohort = tor["player_cohort"]
    assert len(cohort) == 31, f"Expected 31 players in Toronto cohort, got {len(cohort)}"

    cohort_names = {p["player_name"] for p in cohort}
    assert "Scottie Barnes" in cohort_names
    assert "Pascal Siakam" in cohort_names
    assert "RJ Barrett" in cohort_names
    assert "Immanuel Quickley" in cohort_names


def test_b16_team_peers_comparison(client: TestClient) -> None:
    """Verify statistical peer retrieval for team comparison."""
    _require_test_db()
    res_bos = client.get("/api/workbench/teams/1610612738/peers?season=2023-24&limit=5")
    assert res_bos.status_code == 200
    data_bos = res_bos.json()
    assert len(data_bos["peers"]) == 5
    assert all(p["distance"] >= 0 for p in data_bos["peers"])
    assert all(0 <= p["similarity_score"] <= 1 for p in data_bos["peers"])

    res_tor = client.get("/api/workbench/teams/1610612761/peers?season=2023-24&limit=5")
    assert res_tor.status_code == 200
    data_tor = res_tor.json()
    assert len(data_tor["peers"]) == 5


@pytest.mark.requires_published_data
def test_b16_head_to_head_schedule(client: TestClient) -> None:
    """Verify head-to-head match details in schedule for two-team comparison."""
    _require_test_db()
    res = client.get("/api/workbench/teams/1610612738/schedule?season=2023-24")
    assert res.status_code == 200
    sched = res.json()

    # Boston vs Dallas in 2023-24 regular season
    dal_games = [g for g in sched["games"] if g["opponent_tricode"] == "DAL"]
    assert len(dal_games) == 2
    for g in dal_games:
        assert g["team_points"] is not None
        assert g["opponent_points"] is not None
        assert g["is_win"] is True  # Boston won both regular season games vs Dallas
