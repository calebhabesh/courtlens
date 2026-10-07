"""Unit tests for Block B17: Playoff bracket identity, series parsing, and aggregation.

Tests:
- Sub-block B17a: Canonical playoff game ID decomposition, round/conference mapping,
  series slug generation, alias resolution, and regular-season seed reconstruction with tie notes.
- Sub-block B17b: Phase-safe team Four Factors/ratings aggregation, player series box-score
  aggregations over strictly played games, and placeholder handling.
"""

from __future__ import annotations

from courtlens.domain.workbench_playoffs import (
    PLAYOFF_CAPABILITIES,
    PLAYOFF_DISCLAIMERS,
    aggregate_player_series_stats,
    aggregate_team_series_factors,
    build_series_id,
    build_series_slug,
    canonical_conference,
    compute_2_2_1_1_1_hosts,
    get_series_slug_aliases,
    parse_playoff_game_id,
    parse_season_param,
    reconstruct_regular_season_seeds,
)


def test_parse_season_param() -> None:
    """Verify season parameter parsing for integer and string formats."""
    c_season, end_year, start_yy = parse_season_param(2024)
    assert c_season == "2023-24"
    assert end_year == 2024
    assert start_yy == "23"

    c_season2, end_year2, start_yy2 = parse_season_param("2023-24")
    assert c_season2 == "2023-24"
    assert end_year2 == 2024
    assert start_yy2 == "23"

    c_season3, end_year3, start_yy3 = parse_season_param("2025")
    assert c_season3 == "2024-25"
    assert end_year3 == 2025
    assert start_yy3 == "24"


def test_parse_playoff_game_id_decomposition() -> None:
    """Verify canonical 10-digit NBA playoff game ID pattern decomposition."""
    # Round 1 Game 1: BOS vs MIA (0042300101)
    info1 = parse_playoff_game_id("0042300101")
    assert info1.game_id == "0042300101"
    assert info1.series_id == "004230010"
    assert info1.season_start_yy == "23"
    assert info1.season_ending_year == 2024
    assert info1.canonical_season == "2023-24"
    assert info1.round_number == 1
    assert info1.round_name == "First Round"
    assert info1.matchup_index == 0
    assert info1.conference == "Eastern"
    assert info1.game_number == 1

    # Round 1 West matchup 4: OKC vs NOP
    info_west = parse_playoff_game_id("0042300141")
    assert info_west.round_number == 1
    assert info_west.matchup_index == 4
    assert info_west.conference == "Western"

    # Round 2: Conference Semifinals
    info_r2 = parse_playoff_game_id("0042300201")
    assert info_r2.round_number == 2
    assert info_r2.round_name == "Conference Semifinals"
    assert info_r2.conference == "Eastern"

    info_r2_west = parse_playoff_game_id("0042300221")
    assert info_r2_west.round_number == 2
    assert info_r2_west.conference == "Western"

    # Round 3: Conference Finals
    info_ecf = parse_playoff_game_id("0042300301")
    assert info_ecf.round_number == 3
    assert info_ecf.round_name == "Conference Finals"
    assert info_ecf.conference == "Eastern"

    info_wcf = parse_playoff_game_id("0042300311")
    assert info_wcf.round_number == 3
    assert info_wcf.round_name == "Conference Finals"
    assert info_wcf.conference == "Western"

    # Round 4: NBA Finals
    info_finals = parse_playoff_game_id("0042300405")
    assert info_finals.round_number == 4
    assert info_finals.round_name == "NBA Finals"
    assert info_finals.matchup_index == 0
    assert info_finals.conference is None
    assert info_finals.game_number == 5


def test_canonical_conference_mapping() -> None:
    """Verify round and matchup index mapping to conferences."""
    # Round 1
    for m in range(4):
        assert canonical_conference(1, m) == "Eastern"
    for m in range(4, 8):
        assert canonical_conference(1, m) == "Western"

    # Round 2
    for m in range(2):
        assert canonical_conference(2, m) == "Eastern"
    for m in range(2, 4):
        assert canonical_conference(2, m) == "Western"

    # Round 3
    assert canonical_conference(3, 0) == "Eastern"
    assert canonical_conference(3, 1) == "Western"

    # Round 4
    assert canonical_conference(4, 0) is None


def test_series_slug_and_aliases() -> None:
    """Verify slug generation and flexible alias resolution."""
    slug_r1 = build_series_slug(2024, 1, "BOS", "MIA", 0)
    assert slug_r1 == "2024-r1-bos-mia"

    slug_r2 = build_series_slug(2024, 2, "BOS", "CLE", 0)
    assert slug_r2 == "2024-r2-bos-cle"

    slug_ecf = build_series_slug(2024, 3, "BOS", "IND", 0)
    assert slug_ecf == "2024-ecf-bos-ind"

    slug_wcf = build_series_slug(2024, 3, "MIN", "DAL", 1)
    assert slug_wcf == "2024-wcf-min-dal"

    slug_finals = build_series_slug(2024, 4, "BOS", "DAL", 0)
    assert slug_finals == "2024-finals-bos-dal"

    series_id = build_series_id(2024, 4, 0)
    assert series_id == "004230040"

    aliases = get_series_slug_aliases(2024, 4, "BOS", "DAL", 0)
    assert "2024-finals-bos-dal" in aliases
    assert "2024-finals-dal-bos" in aliases
    assert "2024-finals" in aliases
    assert "finals" in aliases
    assert "004230040" in aliases


def test_compute_2_2_1_1_1_hosts() -> None:
    """Verify standard 2-2-1-1-1 host sequence."""
    hosts = compute_2_2_1_1_1_hosts("BOS", "MIA")
    assert hosts[1] == ("BOS", "MIA")
    assert hosts[2] == ("BOS", "MIA")
    assert hosts[3] == ("MIA", "BOS")
    assert hosts[4] == ("MIA", "BOS")
    assert hosts[5] == ("BOS", "MIA")
    assert hosts[6] == ("MIA", "BOS")
    assert hosts[7] == ("BOS", "MIA")


def test_aggregate_team_series_factors() -> None:
    """Verify phase-safe Four Factors, pace, and ratings aggregation for a team."""
    completed_games = [
        {
            "game_id": "0042300401",
            "team_id": "BOS",
            "opponent_id": "DAL",
            "points": 107,
            "opponent_points": 89,
            "stats": {
                "field_goals_made": 39,
                "field_goals_attempted": 82,
                "three_pointers_made": 16,
                "three_pointers_attempted": 42,
                "free_throws_made": 13,
                "free_throws_attempted": 19,
                "rebounds_offensive": 10,
                "rebounds_defensive": 37,
                "rebounds_total": 47,
                "assists": 23,
                "steals": 6,
                "blocks": 9,
                "turnovers": 12,
                "fouls_personal": 16,
            },
        },
        {
            "game_id": "0042300401",
            "team_id": "DAL",
            "opponent_id": "BOS",
            "points": 89,
            "opponent_points": 107,
            "stats": {
                "field_goals_made": 35,
                "field_goals_attempted": 84,
                "three_pointers_made": 7,
                "three_pointers_attempted": 27,
                "free_throws_made": 12,
                "free_throws_attempted": 19,
                "rebounds_offensive": 9,
                "rebounds_defensive": 34,
                "rebounds_total": 43,
                "assists": 9,
                "steals": 7,
                "blocks": 1,
                "turnovers": 11,
                "fouls_personal": 17,
            },
        },
    ]

    bos_factors = aggregate_team_series_factors("BOS", completed_games)
    assert bos_factors["games_played"] == 1
    assert bos_factors["wins"] == 1
    assert bos_factors["losses"] == 0
    assert bos_factors["points_per_game"] == 107.0
    assert bos_factors["opponent_points_per_game"] == 89.0
    assert bos_factors["average_margin"] == 18.0
    assert bos_factors["efg_pct"] == round((39 + 0.5 * 16) / 82, 4)
    assert bos_factors["tov_pct"] is not None
    assert bos_factors["off_rating"] is not None
    assert bos_factors["def_rating"] is not None
    assert bos_factors["net_rating"] == round(
        bos_factors["off_rating"] - bos_factors["def_rating"], 2
    )


def test_aggregate_player_series_stats() -> None:
    """Verify player box-score aggregation strictly over games played."""
    player_games = [
        {
            "player_id": "1628369",
            "team_id": "BOS",
            "appearance": "appeared",
            "minutes_seconds": 2400,  # 40 mins
            "points": 24,
            "stats": {
                "field_goals_made": 9,
                "field_goals_attempted": 20,
                "three_pointers_made": 2,
                "three_pointers_attempted": 7,
                "free_throws_made": 4,
                "free_throws_attempted": 6,
                "rebounds_offensive": 1,
                "rebounds_defensive": 9,
                "rebounds_total": 10,
                "assists": 8,
                "steals": 2,
                "blocks": 1,
                "turnovers": 3,
                "fouls_personal": 2,
            },
        },
        {
            "player_id": "1628369",
            "team_id": "BOS",
            "appearance": "appeared",
            "minutes_seconds": 2160,  # 36 mins
            "points": 20,
            "stats": {
                "field_goals_made": 7,
                "field_goals_attempted": 18,
                "three_pointers_made": 1,
                "three_pointers_attempted": 5,
                "free_throws_made": 5,
                "free_throws_attempted": 6,
                "rebounds_offensive": 2,
                "rebounds_defensive": 6,
                "rebounds_total": 8,
                "assists": 6,
                "steals": 1,
                "blocks": 0,
                "turnovers": 2,
                "fouls_personal": 1,
            },
        },
        # DNP player should not be included
        {
            "player_id": "999999",
            "team_id": "BOS",
            "appearance": "reported_nonappearance",
            "minutes_seconds": 0,
            "points": 0,
            "stats": {},
        },
    ]

    identities = {"1628369": "Jayson Tatum"}
    results = aggregate_player_series_stats(player_games, identities)

    assert len(results) == 1
    tatum = results[0]
    assert tatum["player_id"] == "1628369"
    assert tatum["player_name"] == "Jayson Tatum"
    assert tatum["games_played"] == 2
    assert tatum["points_total"] == 44
    assert tatum["points_per_game"] == 22.0
    assert tatum["minutes_per_game"] == 38.0
    assert tatum["rebounds_total"] == 18
    assert tatum["rebounds_per_game"] == 9.0
    assert tatum["assists_total"] == 14
    assert tatum["assists_per_game"] == 7.0
    # TS% = 44 / (2 * (38 + 0.44 * 12)) = 44 / (2 * 43.28) = 44 / 86.56 = 0.5083
    assert tatum["ts_pct"] == round(44 / (2.0 * (38 + 0.44 * 12)), 4)
    # eFG% = (16 + 0.5 * 3) / 38 = 17.5 / 38 = 0.4605
    assert tatum["efg_pct"] == round((16 + 0.5 * 3) / 38, 4)


def test_reconstruct_regular_season_seeds_with_ties() -> None:
    """Verify seed reconstruction, ordering by win pct, and explicit tie notes."""
    team_records = [
        {"team_id": "1610612738", "gp": 82, "wins": 64, "losses": 18},  # BOS (Eastern)
        {"team_id": "1610612752", "gp": 82, "wins": 50, "losses": 32},  # NYK (Eastern)
        {"team_id": "1610612754", "gp": 82, "wins": 47, "losses": 35},  # IND (Eastern)
        {
            "team_id": "1610612753",
            "gp": 82,
            "wins": 47,
            "losses": 35,
        },  # ORL (Eastern, tied with IND)
        {"team_id": "1610612760", "gp": 82, "wins": 57, "losses": 25},  # OKC (Western)
        {
            "team_id": "1610612743",
            "gp": 82,
            "wins": 57,
            "losses": 25,
        },  # DEN (Western, tied with OKC)
    ]

    seeds = reconstruct_regular_season_seeds(team_records)
    east = seeds["Eastern"]
    west = seeds["Western"]

    assert east[0]["tricode"] == "BOS"
    assert east[0]["seed"] == 1
    assert east[0]["is_tied"] is False
    assert east[0]["tie_note"] is None

    assert east[1]["tricode"] == "NYK"
    assert east[1]["seed"] == 2
    assert east[1]["is_tied"] is False

    # IND and ORL tied at 47-35
    ind_orl = [t for t in east if t["wins"] == 47]
    assert len(ind_orl) == 2
    for t in ind_orl:
        assert t["is_tied"] is True
        assert "Record tied with" in t["tie_note"]
        assert (
            "Regular-season record ties do not establish official conference placement"
            in t["tie_note"]
        )

    # OKC and DEN tied at 57-25 in Western
    assert len(west) == 2
    for t in west:
        assert t["is_tied"] is True
        assert "57-25" in t["tie_note"]


def test_capabilities_and_disclaimers_present() -> None:
    """Verify domain capabilities and guardrail disclaimers."""
    assert PLAYOFF_CAPABILITIES["box_scores"] == "admitted"
    assert PLAYOFF_CAPABILITIES["series_facts"] == "admitted"
    assert PLAYOFF_CAPABILITIES["playoff_forecasts"] == "not_admitted_inferred_claims_forbidden"
    assert PLAYOFF_CAPABILITIES["play_by_play"] == "gated_b19"
    assert len(PLAYOFF_DISCLAIMERS) >= 3
    assert any("placeholder" in d.lower() for d in PLAYOFF_DISCLAIMERS)
    assert any("ties do not establish" in d.lower() for d in PLAYOFF_DISCLAIMERS)
