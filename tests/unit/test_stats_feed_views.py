"""PC11 shaping over the stats feed marts: fictional rows (person ids 99xxx), no source claim."""

from __future__ import annotations

import pytest

from courtlens.services.stats_feed_views import (
    oriented_percentiles,
    rounded,
    shape_combine,
    shape_defenders,
    shape_play_types,
    shape_tracking,
)


def test_percentiles_are_oriented_tied_and_only_for_the_qualified() -> None:
    values = {"a": 1.0, "b": 2.0, "c": 2.0, "d": 3.0, "small": 9.0, "unknown": None}
    high = oriented_percentiles(values, ["a", "b", "c", "d", "unknown"], higher_is_better=True)
    assert high["a"] == 0.0 and high["d"] == 100.0
    assert high["b"] == high["c"] == 50.0  # ties share the midpoint rank
    assert high["small"] is None and high["unknown"] is None  # never ranked
    low = oriented_percentiles(values, ["a", "d"], higher_is_better=False)
    assert low["a"] == 100.0 and low["d"] == 0.0
    assert oriented_percentiles({"x": None}, ["x"], higher_is_better=True) == {"x": None}


def defender(pid: str, games: int | None, fga: float | None, fgm: float | None, **extra):  # type: ignore[no-untyped-def]
    return {
        "player_id": pid,
        "source_player_name": f"Fictional {pid}",
        "team_id": "1610612761",
        "games": games,
        "defended_fga": fga,
        "defended_fgm": fgm,
        "expected_fg_pct": 0.5,
        **extra,
    }


def test_defenders_compare_makes_with_expectation_and_keep_unknowns() -> None:
    rows = [
        defender("99001", 70, 1000, 440, hustle_games=70, contested_shots=700, deflections=140),
        defender("99002", 70, 1000, 520, hustle_games=70, contested_shots=350, deflections=70),
        defender("99003", 5, 30, 10),  # below the sample rule
        defender("99004", 70, None, None),  # unknown, not zero
    ]
    matchups = {"99001": {"matchup_seconds": 600, "partial_possessions": 200, "player_points": 40}}
    players = {p["player_id"]: p for p in shape_defenders(rows, matchups, {}, "regular_season")}
    best = players["99001"]
    assert best["makes_below_expected"] == pytest.approx(60.0)
    assert best["fg_pct_difference"] == pytest.approx(-0.06)
    assert best["contested_shots_per_game"] == pytest.approx(10.0)
    assert best["matchup_minutes"] == 10 and best["matchup_points_per_100"] == 20
    assert best["percentiles"]["makes_below_expected"] == 100.0
    assert best["percentiles"]["fg_pct_difference"] == 100.0  # lower allowed FG% ranks higher
    assert players["99002"]["matchup_points_per_100"] is None  # no matchup row: unobserved
    assert not players["99003"]["qualified"]
    assert players["99003"]["percentiles"]["makes_below_expected"] is None
    unknown = players["99004"]
    assert unknown["makes_below_expected"] is None and unknown["defended_fg_pct"] is None
    assert [p["player_id"] for p in shape_defenders(rows, {}, {}, "regular_season")][:2] == [
        "99001",
        "99002",
    ]


def play(pid: str, team: str, play_type: str, poss: float, pts: float) -> dict[str, object]:
    return {
        "player_id": pid,
        "team_id": team,
        "play_type": play_type,
        "source_player_name": f"Fictional {pid}",
        "games": 60,
        "possessions": poss,
        "points": pts,
        "fga": poss * 0.8,
        "fgm": pts * 0.4,
    }


def test_play_type_adjustment_uses_league_rates_for_the_same_mix() -> None:
    rows = [
        play("99001", "1610612761", "cut", 200, 300),  # league cut 1.25
        play("99002", "1610612761", "cut", 200, 200),
        play("99001", "1610612738", "isolation", 200, 200),  # traded: same player, other team
        play("99002", "1610612761", "isolation", 200, 160),  # league iso 0.9
    ]
    players, league = shape_play_types(rows, {}, "regular_season", "offensive")
    assert league["cut"]["points_per_possession"] == pytest.approx(1.25)
    by_id = {p["player_id"]: p for p in players}
    one = by_id["99001"]
    assert one["possessions"] == 400 and one["team_tricodes"] == ["BOS", "TOR"]
    # 500 points vs 200*1.25 + 200*0.9 = 430 expected -> +17.5 per 100.
    assert one["adjusted_per_100"] == pytest.approx(17.5)
    assert by_id["99002"]["adjusted_per_100"] == pytest.approx(-17.5)
    assert one["breakdown"][0]["league_points_per_possession"] in (1.25, 0.9)
    assert [p["player_id"] for p in players] == ["99001", "99002"]
    defensive, _ = shape_play_types(rows, {}, "regular_season", "defensive")
    assert [p["player_id"] for p in defensive] == ["99002", "99001"]  # fewer allowed first


def test_tracking_divides_totals_by_games_and_leaves_neutral_columns_unranked() -> None:
    rows = [
        {"player_id": pid, "team_id": "1610612761", "stat": stat, "value": value}
        for pid, games, minutes, drives, tov in (
            ("99001", 50, 1500, 500, 50),
            ("99002", 10, 80, 30, 1),
        )
        for stat, value in (("gp", games), ("min", minutes), ("drives", drives), ("drive_tov", tov))
    ]
    players = {p["player_id"]: p for p in shape_tracking(rows, {}, "regular_season", "drives")}
    assert players["99001"]["values"]["drives"] == 10 and players["99001"]["qualified"]
    assert players["99001"]["values"]["drive_fg_pct"] is None  # not observed, not zero
    assert players["99001"]["percentiles"]["drive_tov"] is None  # volume, not quality
    assert players["99002"]["percentiles"]["drives"] is None  # under 500 minutes


def test_combine_keeps_unknown_identity_and_measures_span_over_height() -> None:
    fields = {
        "height_shoes_inches": None,
        "standing_reach_inches": None,
        "weight_lbs": None,
        "body_fat_pct": None,
        "hand_length_inches": None,
        "hand_width_inches": None,
        "standing_vertical_inches": None,
        "max_vertical_inches": None,
        "lane_agility_seconds": None,
        "three_quarter_sprint_seconds": None,
    }
    rows = [
        {
            "player_id": "99001",
            "source_player_name": "Fictional One",
            "draft_year": 2025,
            "combine_position": "C",
            "height_no_shoes_inches": 84,
            "wingspan_inches": 92,
            **fields,
        },
        {
            "player_id": "-1",
            "source_player_name": "Placeholder",
            "draft_year": 2025,
            "combine_position": "",
            "height_no_shoes_inches": 78,
            "wingspan_inches": None,
            **fields,
        },
    ]
    picks = {("99001", 2025): {"overall_pick": 3, "drafting_team_id": "1610612761"}}
    one, placeholder = shape_combine(rows, picks)
    assert one["span_minus_height"] == 8 and one["pick_overall"] == 3 and one["drafted_by"] == "TOR"
    assert one["percentiles"]["span_minus_height"] == 100.0
    assert placeholder["player_id"] is None and placeholder["pick_overall"] is None
    assert placeholder["span_minus_height"] is None and placeholder["position"] is None
    assert placeholder["percentiles"]["span_minus_height"] is None


def test_rounding_keeps_structure_and_nulls() -> None:
    assert rounded({"a": [1 / 3, None, "x"], "b": 2}) == {"a": [0.3333, None, "x"], "b": 2}
