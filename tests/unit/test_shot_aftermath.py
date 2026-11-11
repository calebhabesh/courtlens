"""R17 Shot Aftermath: zones, values, status, tone and the whole runner on synthetic games."""

from __future__ import annotations

import math
from typing import Any

import numpy as np
import pytest

from courtlens.domain import shot_aftermath as sa
from courtlens.evaluation import shot_aftermath_runner as runner

A, B = "10", "20"
GID = "0022400001"


def ev(number: int, **values: float) -> dict[str, Any]:
    return {"locator": {"action_number": number}, "order_index": number, "values": values}


def poss(
    offense: str, events: list[dict[str, Any]], points: float, period: int = 1, counted: bool = True
) -> dict[str, Any]:
    return {
        "offense_team_id": offense,
        "defense_team_id": B if offense == A else A,
        "period": period,
        "points": points,
        "count_as_possession": counted,
        "stats_json": {"events": events},
    }


def shot(team: str, made: int, value: int = 2, zone: str = "rim", group: str = "guards") -> Any:
    return runner.Shot(team, made, value, zone, group)


def test_zones_follow_labels_then_distance() -> None:
    assert sa.zone(3, "Jump Shot", 25.0) == "three"
    assert sa.zone(2, "Driving Layup Shot", 7.0) == "rim"
    assert sa.zone(2, "Putback Dunk Shot", 9.0) == "rim"
    assert sa.zone(2, "Jump Shot", 4.0) == "rim"
    assert sa.zone(2, "Jump Shot", 5.0) == "short_mid"
    assert sa.zone(2, "Jump Shot", 14.0) == "short_mid"
    assert sa.zone(2, "Jump Shot", 15.0) == "long_mid"
    assert sa.zone(2, "Jump Shot", math.nan) == "unresolved"
    assert sa.position_group("C") == "bigs"
    assert sa.position_group(None) == "unclassified"


def test_game_sums_branches() -> None:
    possessions = [
        # 1: A makes a rim 2 (and-one FT 2 follows); B's next possession scores 3.
        poss(A, [ev(1, fga=1, fgm=1, points=2), ev(2, fta=1, ftm=1, points=1)], 3),
        poss(B, [ev(3, fga=1, fgm=1, points=3)], 3),
        # 3: A misses (blocked), offensive rebound, putback 2 and a free throw: second chance 3.
        poss(
            A,
            [
                ev(4, fga=1, fgm=0, points=0),
                ev(5, orb=1, orb_opportunities=1),
                ev(6, fga=1, fgm=1, points=2),
                ev(7, fta=1, ftm=1, points=1),
            ],
            3,
        ),
        # 4: B scores 0; an uncounted technical segment, then A's possession.
        poss(B, [ev(8, turnovers=1)], 0),
        poss(B, [ev(9, fta=1, ftm=1, points=1)], 1, counted=False),
        # 6: A misses, defensive rebound; B's next counted possession scores 2.
        poss(A, [ev(10, fga=1, fgm=0, points=0), ev(11, orb=0, orb_opportunities=1)], 0),
        poss(B, [ev(12, fga=1, fgm=1, points=2)], 2),
        # 8: A makes at the end of the period: censored.
        poss(A, [ev(13, fga=1, fgm=1, points=2)], 2),
        poss(B, [ev(14, fga=1, fgm=0, points=0)], 0, period=2),
    ]
    shots = {
        (GID, 1): shot(A, 1),
        (GID, 3): shot(B, 1, 3, "three"),
        (GID, 4): shot(A, 0),
        (GID, 6): shot(A, 1),
        (GID, 10): shot(A, 0, 2, "short_mid"),
        (GID, 12): shot(B, 1),
        (GID, 13): shot(A, 1),
        (GID, 14): shot(B, 0),
    }
    sums, matched = runner.game_sums(GID, possessions, shots, {(GID, 4)}, {(GID, 2)})
    rim = sums.cells[(A, "guards", "rim")]
    get = {name: rim[i] for i, name in enumerate(sa.SUMS)}
    assert get["attempts"] == 3 and get["makes"] == 2 and get["made_points"] == 4
    assert get["make_possessions"] == 1 and get["make_points"] == 3
    assert get["make_censored"] == 1 and get["and_ones"] == 1
    assert get["oreb"] == 1 and get["second_points"] == 3 and get["blocks"] == 1
    mid = sums.cells[(A, "guards", "short_mid")]
    assert mid[sa.S["dreb"]] == 1
    assert mid[sa.S["dreb_possessions"]] == 1 and mid[sa.S["dreb_points"]] == 2
    assert matched[(GID, 6)] is False  # the putback is a second-chance attempt
    assert sums.counts["second_chance_attempts"] == 1
    assert sums.possessions == 8 and sums.points == 13  # the uncounted segment is out
    # B's last attempt is in period 2 with no later possession: censored by game end.
    assert sums.cells[(B, "guards", "rim")][sa.S["make_possessions"]] == 1


def test_values_follow_databallrs_formula() -> None:
    s = np.zeros(len(sa.SUMS))
    for name, value in {
        "attempts": 10,
        "makes": 6,
        "made_points": 12,
        "oreb": 1,
        "dreb": 3,
        "second_points": 2,
        "make_possessions": 6,
        "make_points": 6.6,
        "dreb_possessions": 3,
        "dreb_points": 3.6,
    }.items():
        s[sa.S[name]] = value
    v = sa.cell_values(s, np.array(1.1))
    assert v["fg_pct"] == pytest.approx(0.6)
    assert v["own"] == pytest.approx(1.2 + 0.4 * 0.5)
    assert v["cost"] == pytest.approx(0.6 * 0.0 + 0.4 * 0.75 * 0.1)
    assert v["net"] == pytest.approx(v["own"] - v["cost"])
    assert v["miss_cost"] == pytest.approx(0.075)
    assert v["dreb_cost"] == pytest.approx(0.1)
    empty = sa.cell_values(np.zeros(len(sa.SUMS)), np.array(1.1))
    assert all(np.isnan(empty[name]) for name in sa.VALUES)
    assert sa.count_residual(s) == 0


def test_status_and_tone() -> None:
    assert sa.status(0, 0, 0) == "unknown"
    assert sa.status(99, 100, 100) == "thin"
    assert sa.status(500, 30, 10) == "thin"
    assert sa.status(500, 40, 10) == "ok"
    assert sa.tone("ok", 60, -0.02, -0.01) == "benefit"
    assert sa.tone("ok", 60, 0.01, 0.02) == "cost"
    assert sa.tone("ok", 60, -0.01, 0.02) is None
    assert sa.tone("thin", 60, -0.02, -0.01) is None
    assert sa.tone("ok", 49, -0.02, -0.01) is None


def test_aggregate_shapes_and_all_rows() -> None:
    team_sums = np.arange(2 * 4 * 5 * len(sa.SUMS), dtype=float).reshape(2, 4, 5, -1)
    out = runner.aggregate(team_sums)
    assert out.shape == (3, 4, 5, len(sa.SUMS))
    assert np.allclose(out[0, 0, 4], team_sums.sum(axis=(0, 1, 2)))
    assert np.allclose(out[1, 1, 0], team_sums[0, 0, 0])  # guards rim of team 0
    assert np.allclose(out[1, 0, 4], team_sums[0].sum(axis=(0, 1)))  # unclassified kept in all


def synthetic_inputs(seed: int) -> runner.SeasonInputs:
    rng = np.random.default_rng(seed)
    shots: dict[tuple[str, int], runner.Shot] = {}
    games = []
    for g in range(40):
        gid = f"00224{g:05d}"
        possessions = []
        number = 0
        for k in range(60):
            team = A if k % 2 == 0 else B
            number += 1
            made = int(rng.random() < 0.5)
            zone = sa.BASE_ZONES[k % 4]
            shots[(gid, number)] = shot(team, made, 3 if zone == "three" else 2, zone)
            events = [ev(number, fga=1, fgm=made, points=2 * made)]
            if not made:
                number += 1
                events.append(ev(number, orb=0, orb_opportunities=1))
            possessions.append(poss(team, events, 2 * made, period=1 + k // 30))
        games.append((gid, possessions))
    return runner.extract("2024-25", shots, games, set(), set())


def test_season_result_is_deterministic_and_complete() -> None:
    first = runner.season_result(synthetic_inputs(1))
    second = runner.season_result(synthetic_inputs(1))
    assert runner.canonical(runner._rounded(first)) == runner.canonical(runner._rounded(second))
    assert len(first["cells"]) == 3 * 4 * 5
    assert first["checks"]["identity_residual"] <= runner.IDENTITY_TOLERANCE
    cell = next(c for c in first["cells"] if c["team"] == "all" and c["position"] == "all")
    assert cell["status"] in ("ok", "thin")
    assert cell["values"]["fg_pct"]["low"] <= cell["values"]["fg_pct"]["value"]
    bigs = next(c for c in first["cells"] if c["position"] == "bigs")
    assert bigs["status"] == "unknown" and bigs["values"]["fg_pct"] is None
    assert first["databallr_comparison"]["all"]["databallr"] == 190685


def test_module_constants_match_registration() -> None:
    params = runner.parameters()
    assert params["seasons"] == list(runner.SEASONS)
