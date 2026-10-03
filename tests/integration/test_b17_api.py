"""Integration tests for Block B17: Playoff / Series Data API against live PostgreSQL data.

Tests:
- Sub-block B17a: Bracket hierarchy, series identities, slug and code resolution,
  reconstructed regular-season seed evidence with explicit tie notes.
- Sub-block B17b: 7-game cards with unplayed placeholders, side-by-side Four Factors & ratings,
  player series box scores over strictly played games, temporal cutoff discipline,
  and zero-inferred-claims guardrails.
"""

from __future__ import annotations

import os

import pytest
from fastapi.testclient import TestClient

from courtload.api.app import create_app


@pytest.fixture
def client() -> TestClient:
    app = create_app()
    return TestClient(app)


def _require_test_db() -> None:
    if not os.environ.get("COURTLOAD_TEST_POSTGRES_URL") and not os.environ.get(
        "COURTLOAD_DATABASE_URL"
    ):
        pytest.skip("Database is not configured")


def test_b17_playoff_bracket_hierarchy(client: TestClient) -> None:
    """Verify GET /api/workbench/playoffs returns 4 rounds and seed evidence."""
    _require_test_db()
    res = client.get("/api/workbench/playoffs?season=2024")
    assert res.status_code == 200
    data = res.json()

    assert data["season"] == "2023-24"
    assert data["season_year"] == 2024
    assert len(data["rounds"]) == 4

    # Round 1: First Round (8 series: 4 East, 4 West)
    r1 = data["rounds"][0]
    assert r1["round_number"] == 1
    assert r1["round_name"] == "First Round"
    assert len(r1["series"]) == 8
    assert len(r1["eastern_series"]) == 4
    assert len(r1["western_series"]) == 4

    bos_mia = next((s for s in r1["eastern_series"] if "bos-mia" in s["slug"]), None)
    assert bos_mia is not None
    assert bos_mia["team1"]["tricode"] == "BOS"
    assert bos_mia["team2"]["tricode"] == "MIA"
    assert bos_mia["team1"]["wins"] == 4
    assert bos_mia["team2"]["wins"] == 1
    assert bos_mia["status"] == "finished"
    assert bos_mia["winner_tricode"] == "BOS"

    # Round 2: Conference Semifinals (4 series: 2 East, 2 West)
    r2 = data["rounds"][1]
    assert r2["round_number"] == 2
    assert r2["round_name"] == "Conference Semifinals"
    assert len(r2["series"]) == 4
    assert len(r2["eastern_series"]) == 2
    assert len(r2["western_series"]) == 2

    # Round 3: Conference Finals (2 series: 1 East, 1 West)
    r3 = data["rounds"][2]
    assert r3["round_number"] == 3
    assert r3["round_name"] == "Conference Finals"
    assert len(r3["series"]) == 2
    assert len(r3["eastern_series"]) == 1
    assert len(r3["western_series"]) == 1

    ecf = r3["eastern_series"][0]
    assert ecf["team1"]["tricode"] == "BOS"
    assert ecf["team2"]["tricode"] == "IND"
    assert ecf["team1"]["wins"] == 4
    assert ecf["team2"]["wins"] == 0
    assert ecf["is_sweep"] is True
    assert ecf["winner_tricode"] == "BOS"

    wcf = r3["western_series"][0]
    assert wcf["team1"]["tricode"] == "MIN"
    assert wcf["team2"]["tricode"] == "DAL"
    assert wcf["team2"]["wins"] == 4
    assert wcf["winner_tricode"] == "DAL"

    # Round 4: NBA Finals (1 series: BOS 4 - DAL 1)
    r4 = data["rounds"][3]
    assert r4["round_number"] == 4
    assert r4["round_name"] == "NBA Finals"
    assert len(r4["finals_series"]) == 1

    finals = r4["finals_series"][0]
    assert finals["series_id"] == "004230040"
    assert finals["slug"] == "2024-finals-bos-dal"
    assert finals["team1"]["tricode"] == "BOS"
    assert finals["team2"]["tricode"] == "DAL"
    assert finals["team1"]["wins"] == 4
    assert finals["team2"]["wins"] == 1
    assert finals["winner_tricode"] == "BOS"
    assert finals["games_count"] == 5

    # Reconstructed seeds evidence
    assert "seeds" in data
    assert "Eastern" in data["seeds"]
    assert "Western" in data["seeds"]
    assert len(data["seeds"]["Eastern"]) == 15
    assert len(data["seeds"]["Western"]) == 15

    bos_seed = next((t for t in data["seeds"]["Eastern"] if t["tricode"] == "BOS"), None)
    assert bos_seed is not None
    assert bos_seed["seed"] == 1
    assert bos_seed["wins"] == 64
    assert bos_seed["losses"] == 18
    assert bos_seed["is_tied"] is False

    # Check that ties in regular season standings have explicit tie notes
    tied_teams = [t for t in data["seeds"]["Eastern"] + data["seeds"]["Western"] if t["is_tied"]]
    assert len(tied_teams) > 0
    for t in tied_teams:
        assert t["tie_note"] is not None
        assert "do not establish official conference placement" in t["tie_note"]

    # Guardrails and capabilities
    assert data["capabilities"]["box_scores"] == "admitted"
    assert data["capabilities"]["series_facts"] == "admitted"
    assert data["capabilities"]["playoff_forecasts"] == "not_admitted_inferred_claims_forbidden"
    assert data["capabilities"]["play_by_play"] == "gated_b19"
    assert len(data["disclaimers"]) >= 3


def test_b17_playoff_series_detail_slug_and_code(client: TestClient) -> None:
    """Verify series detail endpoint resolves by both slug and 9-digit series code."""
    _require_test_db()

    # Query by slug
    res_slug = client.get("/api/workbench/playoffs/series/2024-finals-bos-dal")
    assert res_slug.status_code == 200
    by_slug = res_slug.json()

    # Query by code
    res_code = client.get("/api/workbench/playoffs/series/004230040")
    assert res_code.status_code == 200
    by_code = res_code.json()

    assert by_slug["series_id"] == by_code["series_id"] == "004230040"
    assert by_slug["slug"] == by_code["slug"] == "2024-finals-bos-dal"
    assert by_slug["status"] == "finished"
    assert by_slug["winner_tricode"] == "BOS"

    # Game cards: Exactly 7 cards (Games 1-5 final, Games 6-7 unplayed_placeholder)
    cards = by_slug["game_cards"]
    assert len(cards) == 7

    for g_num in range(1, 6):
        card = cards[g_num - 1]
        assert card["game_number"] == g_num
        assert card["status"] == "final"
        assert card["home_score"] is not None
        assert card["away_score"] is not None
        assert card["margin"] is not None
        assert card["winner_team_id"] is not None

    # Game 1: BOS 107 vs DAL 89
    assert cards[0]["home_team_tricode"] == "BOS"
    assert cards[0]["home_score"] == 107
    assert cards[0]["away_team_tricode"] == "DAL"
    assert cards[0]["away_score"] == 89

    # Games 6 and 7: Strict placeholder treatment
    assert cards[5]["game_number"] == 6
    assert cards[5]["status"] == "unplayed_placeholder"
    assert cards[5]["home_score"] is None
    assert cards[5]["away_score"] is None
    assert cards[5]["home_team_tricode"] == "DAL"
    assert cards[5]["away_team_tricode"] == "BOS"

    assert cards[6]["game_number"] == 7
    assert cards[6]["status"] == "unplayed_placeholder"
    assert cards[6]["home_score"] is None
    assert cards[6]["away_score"] is None
    assert cards[6]["home_team_tricode"] == "BOS"
    assert cards[6]["away_team_tricode"] == "DAL"

    # Side-by-side Four Factors & Ratings
    t1 = by_slug["team1"]
    t2 = by_slug["team2"]
    assert t1["tricode"] == "BOS"
    assert t1["wins"] == 4
    assert t1["losses"] == 1
    assert t1["games_played"] == 5
    assert t1["off_rating"] == 110.23
    assert t1["def_rating"] == 105.68
    assert t1["pace"] is not None
    assert t1["efg_pct"] == 0.5204

    assert t2["tricode"] == "DAL"
    assert t2["wins"] == 1
    assert t2["losses"] == 4
    assert t2["games_played"] == 5
    assert t2["off_rating"] == 105.68
    assert t2["def_rating"] == 110.23

    # Player series statistics: Tatum and Brown for Boston, Doncic and Irving for Dallas
    t1_players = by_slug["team1_players"]
    assert len(t1_players) > 0
    tatum = next((p for p in t1_players if p["player_name"] == "Jayson Tatum"), None)
    assert tatum is not None
    assert tatum["games_played"] == 5
    assert tatum["points_total"] == 111
    assert tatum["points_per_game"] == 22.2
    assert tatum["rebounds_total"] == 39
    assert tatum["assists_total"] == 36
    assert tatum["ts_pct"] is not None
    assert tatum["efg_pct"] is not None

    brown = next((p for p in t1_players if p["player_name"] == "Jaylen Brown"), None)
    assert brown is not None
    assert brown["games_played"] == 5
    assert brown["points_total"] == 104
    assert brown["points_per_game"] == 20.8

    t2_players = by_slug["team2_players"]
    assert len(t2_players) > 0
    doncic = next((p for p in t2_players if p["player_name"] == "Luka Dončić"), None)
    assert doncic is not None
    assert doncic["games_played"] == 5
    assert doncic["points_total"] == 146
    assert doncic["points_per_game"] == 29.2


def test_b17_temporal_cutoff_discipline(client: TestClient) -> None:
    """Verify temporal replay cutoff date excludes subsequent games from outcomes and ratings."""
    _require_test_db()
    # Cutoff date after Game 2 of 2024 Finals (June 10, 2024; Game 3 was on June 12)
    res = client.get("/api/workbench/playoffs/series/2024-finals-bos-dal?cutoffDate=2024-06-10")
    assert res.status_code == 200
    data = res.json()

    # Series status as of June 10 was in_progress (Boston led 2-0, not 4-1 yet)
    assert data["status"] == "in_progress"
    assert data["winner_team_id"] is None
    assert data["winner_tricode"] is None
    assert "2-0" in data["series_score"]

    # Exactly 2 games completed
    assert data["team1"]["wins"] == 2
    assert data["team1"]["losses"] == 0
    assert data["team1"]["games_played"] == 2
    assert data["team2"]["wins"] == 0
    assert data["team2"]["losses"] == 2
    assert data["team2"]["games_played"] == 2

    # Cards after cutoff must be scheduled
    cards = data["game_cards"]
    assert cards[0]["status"] == "final"
    assert cards[1]["status"] == "final"
    assert cards[2]["status"] == "scheduled"
    assert cards[2]["home_score"] is None
    assert cards[3]["status"] == "scheduled"
    assert cards[4]["status"] == "scheduled"
    assert cards[5]["status"] == "unplayed_placeholder"
    assert cards[6]["status"] == "unplayed_placeholder"

    # Player stats denominator is strictly 2 games
    tatum = next((p for p in data["team1_players"] if p["player_name"] == "Jayson Tatum"), None)
    assert tatum is not None
    assert tatum["games_played"] == 2


def test_b17_public_route_compatibility(client: TestClient) -> None:
    """Verify public endpoints /api/playoffs and /api/playoffs/series/finals work identically."""
    _require_test_db()
    res1 = client.get("/api/playoffs?season=2024")
    assert res1.status_code == 200
    bracket = res1.json()
    assert len(bracket["rounds"]) == 4

    res2 = client.get("/api/playoffs/series/finals")
    assert res2.status_code == 200
    finals = res2.json()
    assert finals["series_id"] == "004230040"
    assert finals["slug"] == "2024-finals-bos-dal"


def test_b17_unknown_series_404(client: TestClient) -> None:
    """Verify unknown series identifier returns typed 404 error."""
    _require_test_db()
    res = client.get("/api/workbench/playoffs/series/invalid-series-slug-999")
    assert res.status_code == 404
    err = res.json()
    assert "not found" in err["detail"].lower()
