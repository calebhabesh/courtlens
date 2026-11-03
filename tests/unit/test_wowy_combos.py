"""WOWY combos (alignment row 5): partitions, held players, filters and gates."""

from __future__ import annotations

from typing import Any

import pytest
from pydantic import ValidationError

from courtlens.domain.wowy_combos import (
    WowyCombosRequest,
    combo_cells,
    filter_rows,
    garbage_time,
    in_clock,
    side_totals,
    tier_teams,
)

BOX = {"fgm": 4, "fga": 8, "fg3m": 1, "fg3a": 3, "ftm": 2, "fta": 2, "oreb": 1, "dreb": 3, "tov": 1}


def stint(
    game: str,
    lineup: list[str],
    *,
    period: int = 1,
    start: float = 720.0,
    end: float = 600.0,
    margin: int = 0,
    points: float = 10.0,
    allowed: float = 8.0,
    opponent: str = "BOS",
    opponent_lineup: list[str] | None = None,
    date: str = "2025-11-01",
) -> dict[str, Any]:
    return {
        "game_id": game,
        "game_date": date,
        "opponent_team_id": opponent,
        "period": period,
        "lineup": sorted(lineup),
        "opponent_lineup": opponent_lineup or ["o1", "o2", "o3", "o4", "o5"],
        "seconds": start - end,
        "start_remaining": start,
        "end_remaining": end,
        "start_margin": margin,
        "off": 10.0,
        "def": 10.0,
        "points": points,
        "allowed": allowed,
        "totals": dict(BOX),
        "opp_totals": dict(BOX),
    }


def request(**kwargs: Any) -> WowyCombosRequest:
    return WowyCombosRequest(team_id="TOR", min_possessions=1, min_games=1, **kwargs)


ROWS = [
    stint("g1", ["a", "b", "c", "d", "e"]),
    stint("g1", ["a", "c", "d", "e", "f"], points=20),
    stint("g2", ["b", "c", "d", "e", "f"], allowed=20),
    stint("g2", ["c", "d", "e", "f", "g"]),
]


def test_every_mix_partitions_the_rows() -> None:
    cells, shifts, total = combo_cells(ROWS, request(combo=["a", "b"]))
    # Truth-table order, whatever the minutes: both on, a only, b only, neither.
    assert [c.key for c in cells] == ["11", "10", "01", "00"]
    assert sum(c.stints for c in cells) == total.stints == 4
    both = next(c for c in cells if c.key == "11")
    assert both.present == ["a", "b"] and both.offensive_rating == pytest.approx(100.0)
    a_only = next(c for c in cells if c.key == "10")
    assert a_only.offensive_rating == pytest.approx(200.0)
    shift = next(s for s in shifts if s.player_id == "a")
    # a on: 30 scored, 16 allowed over 20 each way; off: 20 scored, 28 allowed.
    assert shift.net_difference == pytest.approx((150 - 80) - (100 - 140))


def test_held_players_apply_to_every_row() -> None:
    kept = filter_rows(ROWS, request(combo=["a"], on=["c"], off=["g"]), None)
    assert len(kept) == 3
    kept = filter_rows(ROWS, request(combo=["a"], off=["f"]), None)
    assert [r["lineup"] for r in kept] == [["a", "b", "c", "d", "e"]]


def test_gates_mark_small_samples() -> None:
    gated = WowyCombosRequest(team_id="TOR", combo=["a"], min_possessions=15, min_games=1)
    cells, shifts, _ = combo_cells(ROWS, gated)
    on = next(c for c in cells if c.key == "1")
    assert on.sample_status == "available"
    assert all(s.net_difference is not None for s in shifts)
    strict = WowyCombosRequest(team_id="TOR", combo=["a"], min_possessions=15, min_games=2)
    _, shifts, _ = combo_cells(ROWS, strict)
    assert shifts[0].net_difference is None


def test_clock_windows_use_the_stint_midpoint() -> None:
    late = stint("g", ["a"], period=4, start=400, end=200)
    straddle = stint("g", ["a"], period=4, start=420, end=320)
    assert in_clock(late, request(clock="clutch"))
    assert not in_clock(straddle, request(clock="clutch"))
    assert in_clock(stint("g", ["a"], period=6), request(clock="clutch"))
    assert in_clock(late, request(clock="h2")) and not in_clock(late, request(clock="h1"))
    custom = request(clock="custom", periods=[4], clock_from=7, clock_to=5.5)
    assert in_clock(straddle, custom) and not in_clock(late, custom)
    overtime = request(clock="custom", periods=[5], clock_from=5, clock_to=0)
    assert in_clock(stint("g", ["a"], period=7, start=200, end=100), overtime)


def test_garbage_time_rule() -> None:
    assert garbage_time(stint("g", ["a"], period=4, start=700, end=600, margin=-25))
    assert not garbage_time(stint("g", ["a"], period=4, start=700, end=600, margin=24))
    assert garbage_time(stint("g", ["a"], period=4, start=400, end=300, margin=20))
    assert garbage_time(stint("g", ["a"], period=4, start=200, end=100, margin=10))
    assert not garbage_time(stint("g", ["a"], period=3, start=200, end=100, margin=40))
    assert not garbage_time(stint("g", ["a"], period=5, start=200, end=100, margin=40))


def test_common_games_and_opponents() -> None:
    kept = filter_rows(ROWS, request(combo=["a", "g"], common_games=True), None)
    assert kept == []
    kept = filter_rows(ROWS, request(combo=["a", "b"], common_games=True), None)
    assert {r["game_id"] for r in kept} == {"g1"}
    assert filter_rows(ROWS, request(combo=["a"]), {"NYK"}) == []


def test_player_vs_player() -> None:
    rows = [
        stint("g", ["a"], opponent_lineup=["x", "o2", "o3", "o4", "o5"]),
        stint("g", ["b"]),
    ]
    on = filter_rows(rows, request(combo=["a"], vs_team="BOS", vs_player="x"), None)
    assert len(on) == 1
    off = request(combo=["a"], vs_team="BOS", vs_player="x", vs_state="off")
    assert len(filter_rows(rows, off, None)) == 1
    split = request(combo=["a"], vs_team="BOS", vs_player="x", vs_state="split")
    cells, _, _ = combo_cells(filter_rows(rows, split, None), split)
    assert sorted(c.key for c in cells) == ["00", "01", "10", "11"]
    assert next(c for c in cells if c.key == "11").present == ["a", "x"]


def test_unknown_box_fields_are_left_out() -> None:
    stats = {"a": {"fga": 3, "fgm": 1}, "b": {"fga": 2}}
    assert side_totals(stats, ["a", "b"]) == {"fga": 5.0}
    rows = [stint("g", ["a"]), {**stint("g2", ["a"]), "totals": {}}]
    cells, _, _ = combo_cells(rows, request(combo=["a"]))
    on = next(c for c in cells if c.key == "1")
    assert on.factor_stints["efg_pct"] == 1
    assert on.factors["efg_pct"] == pytest.approx(100 * 4.5 / 8)


def test_tiers_rank_defense_low_first() -> None:
    teams = [{"team_id": str(i), "ortg": 100 + i, "drtg": 100 + i, "net": 0.0} for i in range(30)]
    top = tier_teams(teams, "defense", "top")
    assert [t["team_id"] for t in top][:2] == ["0", "1"] and top[0]["rank"] == 1
    assert [t["rank"] for t in tier_teams(teams, "offense", "bottom")] == list(range(21, 31))


def test_request_validation() -> None:
    with pytest.raises(ValidationError):
        WowyCombosRequest(team_id="TOR", combo=["a"], on=["a"])
    with pytest.raises(ValidationError):
        WowyCombosRequest(team_id="TOR", combo=["a", "b", "c", "d", "e", "f"])
    with pytest.raises(ValidationError):
        WowyCombosRequest(team_id="TOR", clock="custom", clock_from=2, clock_to=5)
    with pytest.raises(ValidationError):
        WowyCombosRequest(team_id="TOR", tier="top")
    with pytest.raises(ValidationError):
        WowyCombosRequest(team_id="TOR", vs_player="x")


def test_teammates_share_and_weighted_darko() -> None:
    # Two stints with "a" on and "b" off: c, d, e play both (100%), f one (50%), g none.
    rows = [stint("g1", ["a", "c", "d", "e", "f"]), stint("g2", ["a", "c", "d", "e", "g"])]
    ratings = {"c": {"dpm": 2.0, "o_dpm": 1.5, "d_dpm": 0.5}, "f": {"dpm": -1.0}}
    cells, _, total = combo_cells(rows, request(combo=["a", "b"]), ratings)
    on = next(c for c in cells if c.present == ["a"])
    shares = {m.player_id: m.share for m in on.teammates}
    assert shares == {"c": 100.0, "d": 100.0, "e": 100.0, "f": 50.0, "g": 50.0}
    help_ = on.teammate_help
    assert help_ is not None and help_.players == 5
    # Minutes-weighted over rated teammates only: (2 * 2 + 1 * -1) / 3.
    assert help_.net == pytest.approx(1.0)
    assert help_.offense == pytest.approx(1.5)
    assert help_.coverage == pytest.approx(100.0 * 3 / 8)
    # Unrated, or the total row, carries no help.
    assert next(c for c in cells if c.present == []).teammate_help is None
    assert total.teammate_help is None


def test_true_shooting_and_turnovers_per_possession() -> None:
    cells, _, _ = combo_cells([stint("g1", ["a", "b", "c", "d", "e"])], request(combo=["a"]))
    factors = next(c for c in cells if c.present == ["a"]).factors
    assert factors["ts_pct"] == pytest.approx(100.0 * 10.0 / (2 * (8 + 0.44 * 2)))
    assert factors["opp_ts_pct"] == pytest.approx(100.0 * 8.0 / (2 * (8 + 0.44 * 2)))
    assert factors["tov_100"] == pytest.approx(10.0)
