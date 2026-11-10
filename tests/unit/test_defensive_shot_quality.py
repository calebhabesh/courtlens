"""R06 Part B: matchup rows, the leave-one-defender-out rule and the whole runner."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import numpy as np
import pytest

from courtlens.evaluation import defensive_shot_quality_data as data
from courtlens.evaluation import defensive_shot_quality_runner as runner
from courtlens.evaluation import expected_shot_v2_data as shots_data


def archive_row(**kw: Any) -> dict[str, str]:
    row = {
        "game_id": "22500001",
        "home_team_id": "1",
        "away_team_id": "2",
        "team_id": "1",
        "person_id": "10",
        "matchups_person_id": "20",
        "player_points": "5",
        "matchup_field_goals_attempted": "4",
        "matchup_field_goals_made": "2",
        "matchup_three_pointers_attempted": "1",
        "matchup_three_pointers_made": "1",
        "matchup_free_throws_made": "0",
        "help_field_goals_attempted": "0",
    }
    return {k: str(v) for k, v in {**row, **kw}.items()}


def test_rows_split_two_and_three_point_attempts_and_name_the_defending_team() -> None:
    arrays, counts, games = data.rows_from(
        [
            archive_row(),
            archive_row(
                person_id="11",
                matchup_field_goals_attempted="0",
                matchup_field_goals_made="0",
                matchup_three_pointers_attempted="0",
                matchup_three_pointers_made="0",
                player_points="0",
            ),
        ]
    )
    assert games == {"0022500001"}
    assert counts["rows"] == 2 and counts["rows_without_fga"] == 1
    assert arrays["fga2"].tolist() == [3] and arrays["fgm2"].tolist() == [1]
    assert arrays["fga3"].tolist() == [1] and arrays["fgm3"].tolist() == [1]
    assert arrays["shooter_team"].tolist() == [1] and arrays["defender_team"].tolist() == [2]


@pytest.mark.parametrize(
    "bad",
    [
        {"matchup_field_goals_made": "5"},
        {"matchup_three_pointers_attempted": "5"},
        {"game_id": "42500001"},
        {"team_id": "3"},
        {"matchups_person_id": "10"},
    ],
)
def test_impossible_rows_stop_the_build(bad: dict[str, str]) -> None:
    with pytest.raises(SystemExit):
        data.rows_from([archive_row(**bad)])


def table(rows: list[tuple[str, int, int, int, int, int, int]]) -> dict[str, np.ndarray]:
    a = np.array([r[1:] for r in rows], dtype=np.int64)
    return {
        "game_id": np.array([r[0] for r in rows], dtype=np.str_),
        "shooter": a[:, 0],
        "defender": a[:, 1],
        "shooter_team": np.ones(len(rows), dtype=np.int64),
        "defender_team": np.full(len(rows), 2, dtype=np.int64),
        "fga2": a[:, 2],
        "fgm2": a[:, 3],
        "fga3": a[:, 4],
        "fgm3": a[:, 5],
    }


def test_expected_rate_leaves_out_this_defender_and_only_this_defender() -> None:
    t = table(
        [
            ("g1", 10, 20, 10, 10, 0, 0),  # 10 for 10 against defender 20
            ("g2", 10, 20, 10, 10, 0, 0),
            ("g1", 10, 21, 10, 2, 0, 0),
            ("g3", 11, 20, 10, 5, 0, 0),
        ]
    )
    rates = runner.expected_rates(t, "fga2", "fgm2", (1.0, 1.0))
    assert rates[0] == rates[1] == pytest.approx((1 + 2) / (2 + 10))  # only the attempts on 21
    assert rates[2] == pytest.approx((1 + 20) / (2 + 20))  # only the attempts on 20
    assert rates[3] == pytest.approx(1 / 2)  # nothing left: the prior mean
    changed = {k: v.copy() for k, v in t.items()}
    changed["fgm2"][0] = 0  # how he shot on defender 20 cannot change defender 20's expectation
    assert runner.expected_rates(changed, "fga2", "fgm2", (1.0, 1.0))[0] == rates[0]


def synthetic(seed: int, skill: np.ndarray, games: int = 90) -> dict[str, np.ndarray]:
    """Fifty shooters against twenty defenders; defenders lower the make rate by `skill`."""
    rng = np.random.default_rng(seed)
    rows = []
    for g in range(games):
        for _ in range(60):
            shooter, defender = int(rng.integers(100, 150)), int(rng.integers(0, 20))
            a2, a3 = int(rng.integers(0, 4)), int(rng.integers(0, 3))
            if a2 + a3 == 0:
                continue
            m2 = int(rng.binomial(a2, 0.5 - skill[defender]))
            m3 = int(rng.binomial(a3, 0.36 - skill[defender]))
            rows.append((f"g{g:03d}", shooter, defender, a2, m2, a3, m3))
    # One row per (game, shooter, defender), as the feed has.
    merged: dict[tuple[str, int, int], list[int]] = {}
    for g_id, s, d, a2, m2, a3, m3 in rows:
        slot = merged.setdefault((g_id, s, d), [0, 0, 0, 0])
        for i, v in enumerate((a2, m2, a3, m3)):
            slot[i] += v
    return table([(*k, *v) for k, v in sorted(merged.items())])


SYNTHETIC_SEASONS = ("2021-22", "2022-23", "2023-24")
PRIOR = {
    "fg2_pct": {
        s: {"alpha": 50.0, "beta": 50.0, "converged": True, "on_bound": False}
        for s in SYNTHETIC_SEASONS
    },
    "fg3_pct": {
        s: {"alpha": 36.0, "beta": 64.0, "converged": True, "on_bound": False}
        for s in SYNTHETIC_SEASONS
    },
}


def part_a(players: list[str]) -> dict[str, Any]:
    rng = np.random.default_rng(3)
    return {
        "results_sha256": "a" * 64,
        "seasons": {
            "2022-23": {
                "players": [
                    {
                        "player_id": p,
                        "status": "served",
                        "defense_shots": 2000.0,
                        "defense": {m: float(rng.normal()) for m in runner.PART_A_METRICS},
                    }
                    for p in players
                ]
            }
        },
    }


def test_whole_runner_on_synthetic_data(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(runner, "REPLICATES", 60)
    monkeypatch.setattr(runner, "MIN_FGA", 100)
    monkeypatch.setattr(runner, "MIN_TYPE_FGA", 60)
    skill = np.linspace(-0.08, 0.08, 20)
    tables = {s: synthetic(i, skill) for i, s in enumerate(("2021-22", "2022-23", "2023-24"))}
    root = tmp_path / "tables"
    root.mkdir()
    loaded = {}
    for s, t in tables.items():
        digest = shots_data.content_sha(t)
        np.savez(root / f"{s}.{digest[:16]}.npz", **t)
        loaded[s] = runner.load_table(s, digest, root)
    a = part_a([str(i) for i in range(20)])
    first = runner.run(loaded, PRIOR, a, {"note": "receipts"}, {"identity": "test"})
    second = runner.run(loaded, PRIOR, a, {"note": "receipts"}, {"identity": "test"})
    assert first["results_sha256"] == second["results_sha256"]
    block = first["seasons"]["2022-23"]
    served = [p for p in block["players"] if p["status"] == "served"]
    assert len(served) == 20
    ids = [int(p["player_id"]) for p in served]
    dsq = [p["kinds"]["all"]["dsq"] for p in served]
    # Positive is good: the planted better defenders score higher.
    assert np.corrcoef(dsq, skill[ids])[0, 1] > 0.8
    # The league term centres D-SQ: the shot-weighted mean over every defender is zero.
    weights = [p["fga"] for p in served]
    assert abs(np.average(dsq, weights=weights)) < 0.5
    for p in served:
        value = p["kinds"]["all"]
        low, high = value["interval"]
        assert low < value["dsq"] < high
        assert value["dsq"] == pytest.approx(
            100 * (value["xpps"] - value["pps"] - block["league"]["all"]["term"]), abs=1e-6
        )
        assert len(p["key_matchups"]) == runner.KEY_MATCHUPS
    assert first["signal"]["share"] > 0.05
    assert first["persistence"]["correlations"]["dsq"]["r"] > 0.5
    assert first["persistence"]["pairs"] == sum(first["persistence"]["pairs_by_season"].values())
    assert first["agreement_with_rapm"]["pairs"] == 20
    assert "players" not in str(runner.evidence_extract(first)["seasons"].keys())


def test_a_small_type_sample_is_unknown_not_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "REPLICATES", 10)
    monkeypatch.setattr(runner, "MIN_FGA", 5)
    monkeypatch.setattr(runner, "MIN_TYPE_FGA", 5)
    t = table(
        [(f"g{i}", 10, 20, 2, 1, 0, 0) for i in range(5)]
        + [("g9", 11, 21, 2, 1, 1, 0), ("g8", 12, 22, 5, 2, 5, 2)]
    )
    prior = {"2pt": (5.0, 5.0), "3pt": (3.0, 7.0)}
    result = runner.season_result("2022-23", t, prior)
    defender = next(p for p in result["players"] if p["player_id"] == "20")
    assert defender["kinds"]["2pt"]["status"] == "served"
    assert defender["kinds"]["3pt"] == {
        "status": "small_sample",
        "fga": 0.0,
        "pps": None,
        "xpps": None,
        "dsq": None,
        "interval": None,
    }
    assert next(p for p in result["players"] if p["player_id"] == "21")["status"] == "small_sample"


def test_changed_tables_and_priors_are_refused(tmp_path: Path) -> None:
    with pytest.raises(SystemExit, match="no pinned"):
        runner.load_table("2022-23", "0" * 64, tmp_path)
    bad = {
        "fg2_pct": {"2022-23": {"alpha": 1, "beta": 1, "converged": False, "on_bound": False}},
        "fg3_pct": PRIOR["fg3_pct"],
    }
    with pytest.raises(SystemExit, match="not usable"):
        runner.priors("2022-23", bad)
