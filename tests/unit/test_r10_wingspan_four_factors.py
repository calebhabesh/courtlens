"""R10: Wingspan beside D-DPM rules and the four-factors counting and formula, on synthetic data."""

from __future__ import annotations

import math
from collections import Counter
from typing import Any

import numpy as np
import pytest

from courtlens.domain import four_factors as ff
from courtlens.evaluation import four_factors_runner as ffr
from courtlens.evaluation import wingspan_runner as wr

# --------------------------------------------------------------------------------------------
# Four factors


def row(
    n: int,
    team: str,
    kind: str,
    sub: str = "",
    desc: str = "",
    value: str = "0",
    person: str = "1",
    clock: str = "PT10M00.00S",
    period: str = "1",
) -> dict[str, str]:
    return {
        "actionNumber": str(n),
        "teamId": team,
        "personId": person,
        "actionType": kind,
        "subType": sub,
        "description": desc,
        "shotValue": value,
        "clock": clock,
        "period": period,
    }


def test_count_game_rebounds_free_throws_and_team_rows() -> None:
    rows = [
        row(1, "A", "Missed Shot", "Jump Shot", "MISS x 3PT", "3"),
        row(2, "0", "Rebound", "Unknown", "A Rebound", person="A"),  # team offensive rebound
        row(3, "A", "Made Shot", "Layup", "x Layup (2 PTS)", "2", clock="PT9M00.00S"),
        row(4, "A", "Free Throw", "Free Throw 1 of 1", "x Free Throw 1 of 1", clock="PT9M00.00S"),
        row(5, "B", "Missed Shot", "Jump Shot", "MISS y", "2"),
        row(6, "A", "Rebound", "Unknown", "z REBOUND"),  # defensive for B's miss
        row(7, "A", "Free Throw", "Free Throw 1 of 2", "MISS x Free Throw 1 of 2"),
        row(8, "0", "Rebound", "Normal Rebound", "A Rebound", person="A"),  # dead ball: skipped
        row(9, "A", "Free Throw", "Free Throw 2 of 2", "MISS x Free Throw 2 of 2"),
        row(10, "B", "Rebound", "Unknown", "y REBOUND"),
        row(11, "0", "Turnover", "Shot Clock Turnover", "B Shot Clock", person="B"),
        row(12, "B", "Missed Shot", "Jump Shot", "MISS y", "2"),
        row(13, "", "period", "end"),
    ]
    out = ff.count_game(rows)
    a, b = out.teams["A"], out.teams["B"]
    assert (a["fga"], a["fgm"], a["fg3a"], a["points"]) == (2, 1, 1, 3)
    assert (a["fta"], a["ftm"], a["ft_and_one"], a["ft_two_shot"]) == (3, 1, 1, 2)
    assert (a["ft_end"], a["ft_end_made"]) == (1, 0)
    assert (a["orb_three"], a["drb_ft_end"], a["miss_ft_end"]) == (1, 1, 1)
    assert (b["drb_two"], b["tov"], b["unrebounded_two"]) == (1, 1, 1)
    assert sum(c["orb_ft_end"] for c in out.teams.values()) == 0  # the placeholder was skipped


def test_three_rule_falls_back_to_the_description_and_final_score_is_read() -> None:
    assert ff.is_three({"shotValue": "3", "description": "x"})
    assert not ff.is_three({"shotValue": "2", "description": "3PT"})  # shotValue wins
    assert ff.is_three({"description": "MISS Curry 27' 3PT Jump Shot"})  # 2014-15..2023-24
    assert not ff.is_three({"description": "MISS Curry 17' Jump Shot"})
    rows = [
        {
            **row(1, "A", "Made Shot", "Jump Shot", "Curry 27' 3PT Jump Shot (3 PTS)"),
            "shotValue": "",
        },
        {**row(2, "", "period", "end"), "scoreHome": "3", "scoreAway": "0"},
    ]
    out = ff.count_game(rows)
    assert out.teams["A"]["fg3m"] == 1 and out.teams["A"]["points"] == 3
    assert out.final_points == 3


def counts(**over: float) -> Counter[str]:
    base: Counter[str] = Counter({k: 0 for k in ff.COUNT_KEYS})
    base.update(
        {
            "fga": 880,
            "fgm": 410,
            "fg3a": 350,
            "fg3m": 125,
            "fta": 220,
            "ftm": 172,
            "tov": 125,
            "orb_two": 70,
            "drb_two": 230,
            "orb_three": 50,
            "drb_three": 175,
            "orb_ft_end": 3,
            "drb_ft_end": 20,
            "points": 1117,
            "ft_end": 94,
            "ft_end_made": 75,
        }
    )
    for key, value in over.items():
        base[key] = value  # type: ignore[assignment]
    return base


def test_eq11_equals_eq3_exactly() -> None:
    f = ff.factors(counts(), mu=0.425)
    assert f["ortg_box"] is not None and f["ortg_factors"] is not None
    # Eq. (11) is algebraically Eq. (3) when points = FTM + 2 FGM + 3PM.
    pts = 172 + 2 * 410 + 125
    g = ff.factors(counts(points=pts), mu=0.425)
    assert g["ortg_factors"] == pytest.approx(g["ortg_box"], rel=1e-12)


def test_unknown_inputs_give_unknown_rating_and_marginal_signs() -> None:
    assert ff.ortg(None, 0.2, 0.12, 0.25, 0.47, 0.78, 0.43) is None
    assert ff.ortg(0.54, 0.2, 0.12, 0.25, 0.47, 0.0, 0.43) is None
    inputs = {"efg": 0.54, "ftr": 0.2, "tov_pct": 0.13, "orb_pct": 0.25, "fg": 0.47, "ft": 0.78}
    m = ff.marginals(inputs, 0.425)
    assert set(m) == {"efg", "tov_pct", "orb_pct", "ftr", "ft"}
    assert m["efg"] > 0 and m["tov_pct"] > 0 and m["orb_pct"] > 0


def test_four_factor_summary_keys() -> None:
    s = ffr.summarize(counts(), 0.425)
    for key in (
        "counts",
        "inputs",
        "fg2",
        "fg3",
        "fg3a_rate",
        "ts",
        "possessions",
        "ortg_box",
        "ortg_factors",
        "rebounds_by_miss",
        "marginals",
    ):
        assert key in s
    assert s["rebounds_by_miss"]["ft_end"]["orb_rate"] == pytest.approx(3 / 23, abs=1e-6)
    empty = ffr.summarize(Counter({k: 0 for k in ff.COUNT_KEYS}), 0.425)
    assert empty["ortg_factors"] is None and empty["marginals"] == {}


# --------------------------------------------------------------------------------------------
# Wingspan


def combine_row(
    year: int, h: float | None, w: float | None, pos: str | None = "SF"
) -> dict[str, Any]:
    return {
        "draft_year": year,
        "name": "P",
        "position": pos,
        "height_no_shoes_inches": h,
        "height_shoes_inches": None if h is None else h + 1,
        "wingspan_inches": w,
        "standing_reach_inches": None,
        "weight_lbs": None,
    }


def season(minutes: float | None, d: float | None, team: str = "TOR") -> dict[str, Any]:
    return {"minutes": minutes, "games": 10, "team": team, "d_dpm": d, "on_board": d is not None}


def synthetic_tables(n: int = 60) -> dict[str, Any]:
    rng = np.random.default_rng(1)
    combine: dict[str, Any] = {}
    seasons: dict[str, Any] = {}
    positions = ["PG", "SG", "SF", "PF", "C"]
    for i in range(n):
        pid = str(1000 + i)
        h = 74 + i % 12 + float(rng.normal())
        w = h + 4 + float(rng.normal())
        combine[pid] = [combine_row(2010, h, w, f"{positions[i % 5]}-SF")]
        seasons[pid] = {
            "2015-16": season(800 + i, float(rng.normal())),
            "2016-17": season(300, 9.0),
        }
    combine["9"] = [combine_row(2004, None, None)]  # not measured
    combine["8"] = [combine_row(2012, 78, 82)]  # measured, never played
    seasons["7"] = {"2010-11": season(900, None)}
    combine["7"] = [combine_row(2009, 77, 80, "")]  # played but never rated
    combine["6"] = [combine_row(2006, 76, 79), combine_row(2007, 76.5, None)]
    seasons["6"] = {"2012-13": season(600, 1.0), "2013-14": season(400, -1.0)}
    return {"combine": {"players": combine}, "seasons": {"players": seasons, "boards": {}}}


def receipt() -> dict[str, Any]:
    return {
        "identity": wr.REGISTRATION,
        "parameters": {"table_sha256": {"combine": "c", "seasons": "s"}},
    }


def test_wingspan_rules_and_exclusions() -> None:
    players = {p["player_id"]: p for p in wr.player_rows(synthetic_tables())}
    assert players["9"]["exclusion"] == "not_measured" and players["9"]["diff"] is None
    assert players["9"]["d_dpm"] is None  # missing measurement is unknown, never zero
    assert players["8"]["exclusion"] == "no_nba_minutes"
    assert players["7"]["exclusion"] == "no_darko_rating_in_qualifying_seasons"
    assert players["7"]["position"] is None
    six = players["6"]
    assert six["combine_year"] == 2006  # the 2007 combine lacks a wingspan
    assert six["d_dpm"] == pytest.approx(1.0)  # the 400-minute season is below the minimum
    assert six["career"]["photo_season"] == "2012-13" and six["career"]["photo_team"] == "TOR"
    weighted = players["1000"]
    assert weighted["career"]["seasons"] == 1 and weighted["in_population"]


def test_wingspan_run_has_every_key_and_is_deterministic() -> None:
    tables = synthetic_tables()
    one = wr.run(tables, receipt())
    two = wr.run(tables, receipt())
    assert [k for k in wr.EXPECTED_KEYS if k not in one] == []
    assert one["results_sha256"] == two["results_sha256"]
    assert one["population"]["analysis"] == 61  # 60 synthetic players and player 6
    assert one["population"]["exclusions"] == {
        "no_darko_rating_in_qualifying_seasons": 1,
        "no_nba_minutes": 1,
        "not_measured": 1,
    }
    first = one["correlations"][0]
    assert (first["x"], first["y"], first["population"]) == ("diff", "d_dpm", "analysis")
    assert first["low"] <= first["r"] <= first["high"]
    assert {a["position"] for a in one["positional_averages"]} == {"ALL", *wr.POSITIONS}
    assert all(not math.isnan(a["height"]["mean"]) for a in one["positional_averages"])
    assert one["nearest"]["k"] == wr.NEAREST_K


def test_pearson_and_partial() -> None:
    x = np.arange(10, dtype=float)
    assert wr.pearson(x, 2 * x + 1) == pytest.approx(1.0)
    assert math.isnan(wr.pearson(x[:2], x[:2]))
    z = np.arange(10, dtype=float)
    e = np.array([0.3, -1.2, 0.8, 0.1, -0.5, 1.1, -0.9, 0.4, -0.2, 0.6])
    assert wr.partial(z + e, 2 * z + e, z) == pytest.approx(1.0)
    assert (
        wr.verdict(0.1, 0.3) == "positive"
        and wr.verdict(-0.1, 0.3) == "not_distinguishable_from_zero"
    )
