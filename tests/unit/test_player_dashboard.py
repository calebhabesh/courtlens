"""Player Dashboard tracking cells (alignment row 22): pure shaping, no database."""

from __future__ import annotations

import pytest

from courtlens.services.player_dashboard import shape_feed_players, shape_play_families


def _tracking(pid: str, minutes: float, games: float, potential: float, created: float, top: float):
    stats = {
        ("possessions", "min"): minutes,
        ("possessions", "gp"): games,
        ("possessions", "time_of_poss"): top,
        ("passing", "potential_ast"): potential,
        ("passing", "ast_pts_created"): created,
    }
    return [
        {"player_id": pid, "measure": measure, "stat": stat, "value": value}
        for (measure, stat), value in stats.items()
    ]


def _defense(pid: str, category: str, fga: float, fgm: float, expected: float):
    return {
        "player_id": pid,
        "category": category,
        "games": 60,
        "defended_fga": fga,
        "defended_fgm": fgm,
        "expected_fg_pct": expected,
    }


def test_rates_ratios_and_percentiles() -> None:
    tracking = [
        *_tracking("1", 1800, 60, 300, 420, 150),
        *_tracking("2", 1200, 50, 100, 120, 40),
        *_tracking("3", 300, 20, 90, 100, 30),
    ]
    defense = [
        _defense("1", "overall", 600, 250, 0.45),
        _defense("1", "less-than-6ft", 200, 100, 0.6),
        _defense("2", "overall", 500, 240, 0.44),
    ]
    hustle = [
        {
            "player_id": "1",
            "games": 60,
            "minutes": 1800,
            "contested_shots": 500,
            "deflections": 120,
            "charges_drawn": 6,
            "loose_balls_recovered": 30,
        }
    ]
    players = shape_feed_players(tracking, defense, hustle, "regular_season")
    one = players["1"]
    assert one["per_game"]["potential_ast"] == pytest.approx(5.0)
    assert one["per_36"]["potential_ast"] == pytest.approx(6.0)
    assert one["per_game"]["ast_efg"] == pytest.approx(0.7)
    assert one["per_game"]["potential_ast_per_min"] == pytest.approx(2.0)
    assert one["per_game"]["defended_diff"] == pytest.approx(250 / 600 - 0.45)
    assert one["per_36"]["deflections"] == pytest.approx(2.4)
    # Two qualified players: player 1 leads potential assists; a lower DIFF is better.
    assert one["percentiles"]["per_36"]["potential_ast"] == 100.0
    assert players["2"]["percentiles"]["per_36"]["potential_ast"] == 0.0
    assert one["percentiles"]["per_game"]["defended_diff"] == 100.0
    # Under the 500-minute floor: values shown, never ranked.
    assert players["3"]["qualified"] is False
    assert players["3"]["per_game"]["potential_ast"] == pytest.approx(4.5)
    assert players["3"]["percentiles"]["per_36"]["potential_ast"] is None
    # No hustle row: unknown, not zero.
    assert players["2"]["per_game"]["deflections"] is None


def test_play_families_share_and_relative_rate() -> None:
    def row(pid: str, play: str, poss: float, points: float):
        return {"player_id": pid, "play_type": play, "possessions": poss, "points": points}

    rows = [
        row("1", "isolation", 200, 220),
        row("1", "prballhandler", 100, 90),
        row("1", "spotup", 80, 100),
        row("1", "misc", 20, 10),
        row("2", "isolation", 100, 80),
        row("2", "cut", 200, 260),
        row("2", "transition", 30, 36),
    ]
    families = shape_play_families(rows, "regular_season")
    creation = families["1"][0]
    assert creation["family"] == "creation"
    assert creation["frequency"] == pytest.approx(300 / 400)
    league_creation = (220 + 90 + 80) / 400
    assert creation["relative_per_100"] == pytest.approx(100 * (310 / 300 - league_creation))
    # Under the family floor (50 possessions): share shown, efficiency not rated.
    transition = next(f for f in families["2"] if f["family"] == "transition")
    assert transition["frequency"] == pytest.approx(30 / 330)
    assert transition["relative_per_100"] is None
    # Absent family: zero possessions with no rate.
    spacing = next(f for f in families["2"] if f["family"] == "spacing")
    assert spacing["possessions"] == 0.0
    assert spacing["points_per_possession"] is None
