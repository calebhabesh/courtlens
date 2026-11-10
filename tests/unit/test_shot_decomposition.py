"""R06 Part A: free-throw rules, targets, ridge and the whole runner on synthetic data."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pytest
from sklearn.linear_model import Ridge

from courtlens.domain import shot_decomposition as sd
from courtlens.evaluation import expected_shot_v2_data as shots_data
from courtlens.evaluation import shot_decomposition_data as data
from courtlens.evaluation import shot_decomposition_runner as runner

TEAM_A, TEAM_B = "1", "2"


def row(
    number: int, kind: str, sub: str = "", team: str = TEAM_A, person: str = "10", **kw: Any
) -> dict[str, str]:
    return {
        "actionNumber": str(number),
        "actionType": kind,
        "subType": sub,
        "teamId": team,
        "personId": person,
        "period": str(kw.get("period", 1)),
        "clock": kw.get("clock", "PT05M00.00S"),
        "description": kw.get("description", "Player Free Throw"),
    }


def test_trip_kinds_cover_the_feed_vocabulary() -> None:
    assert sd.classify("Free Throw 1 of 2", False) == sd.TWO_SHOT
    assert sd.classify("Free Throw 3 of 3", False) == sd.THREE_SHOT
    assert sd.classify("Free Throw Technical", False) == sd.TECHNICAL
    assert sd.classify("Free Throw Technical 1 of 2", False) == sd.TECHNICAL
    assert sd.classify("Free Throw Flagrant 2 of 3", False) == sd.FLAGRANT
    assert sd.classify("Free Throw Clear Path 1 of 2", False) == sd.CLEAR_PATH
    assert sd.classify("Free Throw 1 of 1", True) == sd.AND_ONE
    assert sd.classify("Free Throw 1 of 1", False) == sd.ONE_SHOT_OTHER
    assert sd.classify("Free Throw Mystery", False) is None


def test_and_one_needs_a_same_team_make_at_the_same_clock_and_pairs_once() -> None:
    fts, unknown = sd.game_free_throws(
        [
            row(1, "Made Shot", person="11"),
            row(2, "Free Throw", "Free Throw 1 of 1", person="12"),  # substitute shooter
            row(3, "Free Throw", "Free Throw 1 of 1", person="12"),  # that make is already paired
            row(4, "Made Shot", team=TEAM_B, clock="PT04M00.00S"),
            row(5, "Free Throw", "Free Throw 1 of 1", clock="PT04M00.00S"),  # other team's make
            row(6, "Free Throw", "Free Throw Odd"),
        ]
    )
    assert [f.kind for f in fts] == [sd.AND_ONE, sd.ONE_SHOT_OTHER, sd.ONE_SHOT_OTHER]
    assert unknown == ["Free Throw Odd"]


def test_miss_detection_does_not_read_a_player_named_missi_as_a_miss() -> None:
    fts, _ = sd.game_free_throws(
        [
            row(
                1, "Free Throw", "Free Throw 1 of 2", description="Missi Free Throw 1 of 2 (1 PTS)"
            ),
            row(2, "Free Throw", "Free Throw 2 of 2", description="MISS Missi Free Throw 2 of 2"),
        ]
    )
    assert [f.made for f in fts] == [True, False]


@pytest.mark.parametrize(
    ("kind", "shots", "sq"),
    [
        (sd.TWO_SHOT, 0.5, 0.55),
        (sd.THREE_SHOT, 1 / 3, 1.1 / 3),
        (sd.AND_ONE, 0.0, 0.0),
        (sd.TECHNICAL, 0.0, 0.0),
        (sd.FLAGRANT, 0.0, 0.0),
        (sd.CLEAR_PATH, 0.0, 0.0),
        (sd.ONE_SHOT_OTHER, 0.0, 0.0),
    ],
)
def test_free_throw_targets_add_up_with_the_foul_baselines(
    kind: str, shots: float, sq: float
) -> None:
    t = sd.attempt_targets(kind, ft_probability=0.8, avg_points=1.1)
    assert t.shots == pytest.approx(shots)
    assert t.sq == pytest.approx(sq)
    assert t.make == 0
    assert t.ts == pytest.approx(0.8)
    assert t.ts == pytest.approx(t.sq + t.make + t.ft, abs=1e-15)


def test_databallr_worked_example_reproduces() -> None:
    # A 90% shooter fouled on a three: 2.7 expected, 1.09 baseline, +1.61 FT value.
    trip = [
        sd.attempt_targets(sd.THREE_SHOT, ft_probability=0.9, avg_points=1.09) for _ in range(3)
    ]
    assert sum(t.ts for t in trip) == pytest.approx(2.7)
    assert sum(t.sq for t in trip) == pytest.approx(1.09)
    assert sum(t.ft for t in trip) == pytest.approx(1.61)
    assert sum(t.shots for t in trip) == pytest.approx(1.0)


def test_field_goal_targets() -> None:
    t = sd.attempt_targets(sd.FGA, points=3.0, expected_points=1.2)
    assert (t.shots, t.ts, t.sq, t.ft) == (1.0, 3.0, 1.2, 0.0)
    assert t.make == pytest.approx(1.8)


def test_ft_probability_reads_only_earlier_dates() -> None:
    def ft(number: int, made: bool, person: str = "10") -> sd.FreeThrow:
        return sd.FreeThrow(number, person, TEAM_A, made, sd.TWO_SHOT, "Free Throw 1 of 2")

    events = {
        ("old", 1): (ft(1, True), 20220101, "2021-22"),
        ("g1", 1): (ft(1, True), 20230101, "2022-23"),
        ("g1", 2): (ft(2, False), 20230101, "2022-23"),
        ("g2", 1): (ft(1, True), 20230201, "2022-23"),
        ("ancient", 1): (ft(1, True), 20150101, "2014-15"),  # outside the history window
    }
    prior = {"alpha": 8.0, "beta": 2.0}
    first, summary = data.ft_probabilities(events, "2022-23", prior)
    # Same-day attempts are not "earlier": both free throws of g1 see only the 2021-22 make.
    assert first["g1", 1] == first["g1", 2] == pytest.approx(9 / 11)
    assert first["g2", 1] == pytest.approx(10 / 13)
    assert summary == {"free_throws_scored": 3, "shooter_without_earlier_attempts": 0}
    # A later result changes no earlier probability.
    changed = {**events, ("g3", 1): (ft(1, False), 20230301, "2022-23")}
    second, _ = data.ft_probabilities(changed, "2022-23", prior)
    assert {k: second[k] for k in first} == first


def synthetic_table(
    seed: int, make_skill: np.ndarray, sq_skill: np.ndarray, rows: int = 12000
) -> dict[str, np.ndarray]:
    """Forty players on two sides of random lineups; player 0..39 effects are known."""
    rng = np.random.default_rng(seed)
    games = rng.integers(0, 80, rows)
    off = np.zeros((rows, 5), dtype=np.int64)
    defense = np.zeros((rows, 5), dtype=np.int64)
    for i in range(rows):
        chosen = rng.choice(40, 10, replace=False)
        off[i], defense[i] = np.sort(chosen[:5]), np.sort(chosen[5:])
    home = rng.integers(0, 2, rows)
    kinds = rng.choice(
        [sd.FGA, sd.TWO_SHOT, sd.THREE_SHOT, sd.AND_ONE, sd.TECHNICAL],
        rows,
        p=[0.85, 0.1, 0.02, 0.02, 0.01],
    )
    fga = kinds == sd.FGA
    expected = 1.05 + 0.02 * sq_skill[off].sum(axis=1) + rng.normal(0, 0.1, rows)
    actual = np.where(
        fga,
        expected + 0.03 * make_skill[off].sum(axis=1) + rng.normal(0, 0.6, rows),
        rng.integers(0, 2, rows),
    )
    return {
        "game_id": np.array([f"g{g:03d}" for g in games], dtype=np.str_),
        "date": 20230101 + games,
        "action_number": np.arange(rows, dtype=np.int64),
        "off": off,
        "def": defense,
        "offense_home": home.astype(np.int8),
        "offense_team": (1 + home).astype(np.int64),
        "counted_possession": np.ones(rows, dtype=np.int8),
        "kind": kinds.astype(np.str_),
        "actual": actual.astype(np.float64),
        "expected_points": np.where(fga, expected, np.nan),
        "ft_probability": np.where(fga, np.nan, 0.5 + 0.03 * rng.random(rows) * 10),
        "shooter": np.where(fga, -1, off[:, 0]),
    }


@pytest.fixture
def small_bootstrap(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(runner, "REPLICATES", 12)
    monkeypatch.setattr(runner, "PERSISTENCE_REPLICATES", 50)
    monkeypatch.setattr(runner, "MIN_SHOTS", 200)
    monkeypatch.setattr(runner, "ALPHA", 30.0)


def test_targets_are_additive_on_every_row_and_shift_centres_make() -> None:
    table = synthetic_table(1, np.zeros(40), np.zeros(40), rows=2000)
    result = runner.targets(table)
    v = result["values"]
    assert np.max(np.abs(v[:, 0] - v[:, 1:].sum(axis=1))) <= 1e-12
    fga = table["kind"] == sd.FGA
    assert abs(v[fga, 2].mean()) < 1e-12  # the shift removes the season's make mean
    assert result["shots"][table["kind"] == sd.AND_ONE].sum() == 0


def test_targets_fail_loudly_on_an_unknown_value() -> None:
    table = synthetic_table(1, np.zeros(40), np.zeros(40), rows=500)
    table["expected_points"][int(np.flatnonzero(table["kind"] == sd.FGA)[0])] = np.nan
    with pytest.raises(SystemExit, match="no expected value"):
        runner.targets(table)


def test_grouping_is_exact_when_no_attempt_is_shot_free() -> None:
    table = synthetic_table(3, np.zeros(40), np.zeros(40), rows=1000)
    table["kind"][:] = sd.FGA
    table["expected_points"] = np.full(1000, 1.0)
    table["ft_probability"] = np.full(1000, np.nan)
    table["game_id"][:] = "g000"
    table["off"][500:] = table["off"][:500]
    table["def"][500:] = table["def"][:500]
    table["offense_home"][500:] = table["offense_home"][:500]
    tg = runner.targets(table)
    g = runner.groups(table, tg["shots"], tg["values"])
    _, x = runner.design(g)
    grouped, _ = runner.ridge(x, g["y"], g["weight"], 30.0)
    single = {
        "off": table["off"],
        "def": table["def"],
        "home": table["offense_home"].astype(np.int64),
        "weight": tg["shots"],
    }
    _, x2 = runner.design(single)
    each, _ = runner.ridge(x2, tg["values"], tg["shots"], 30.0)
    assert np.max(np.abs(grouped - each)) < 1e-9


def test_ridge_matches_sklearn_and_is_linear_in_the_target() -> None:
    table = synthetic_table(4, np.zeros(40), np.zeros(40), rows=1500)
    tg = runner.targets(table)
    g = runner.groups(table, tg["shots"], tg["values"])
    _, x = runner.design(g)
    coef, intercept = runner.ridge(x, g["y"], g["weight"], 30.0)
    model = Ridge(alpha=30.0, solver="lsqr", tol=1e-12, max_iter=20000)
    model.fit(x, g["y"][:, 0], sample_weight=g["weight"])
    assert np.max(np.abs(coef[:, 0] - model.coef_)) < 1e-5
    assert intercept[0] == pytest.approx(model.intercept_, abs=1e-5)
    assert np.max(np.abs(coef[:, 0] - coef[:, 1:].sum(axis=1))) < 1e-10


def test_singular_or_non_finite_solve_fails_loudly(monkeypatch: pytest.MonkeyPatch) -> None:
    table = synthetic_table(4, np.zeros(40), np.zeros(40), rows=500)
    tg = runner.targets(table)
    g = runner.groups(table, tg["shots"], tg["values"])
    _, x = runner.design(g)
    monkeypatch.setattr(runner, "SOLVE_TOLERANCE", 0.0)
    with pytest.raises(SystemExit, match="did not converge"):
        runner.ridge(x, g["y"], g["weight"], 30.0)


def test_wls_recovers_exact_additive_weights() -> None:
    rng = np.random.default_rng(0)
    x = rng.normal(size=(50, 3))
    out = runner.wls(x, x.sum(axis=1), np.ones(50))
    assert out["coefficients"] == pytest.approx([1.0, 1.0, 1.0])
    assert out["r2"] == pytest.approx(1.0)


def write_tables(root: Path, tables: dict[str, dict[str, np.ndarray]]) -> dict[str, str]:
    pins = {}
    root.mkdir(parents=True)
    for season, table in tables.items():
        digest = shots_data.content_sha(table)
        pins[season] = digest
        np.savez(root / f"{season}.{digest[:16]}.npz", **table)
    return pins


def test_whole_runner_on_synthetic_data_is_reproducible_and_recovers_the_signal(
    small_bootstrap: None, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    rng = np.random.default_rng(9)
    sq, make = rng.normal(0, 1, 40), rng.normal(0, 1, 40)
    seasons = ("2022-23", "2023-24", "2024-25")
    tables = {s: synthetic_table(100 + i, make, sq) for i, s in enumerate(seasons)}
    root = tmp_path / "tables"
    pins = write_tables(root, tables)
    loaded = {s: runner.load_table(s, pins[s], root) for s in seasons}
    receipt = {"identity": "test", "content_sha256": "x", "parameters": {}}
    first = runner.run(loaded, {"note": "receipts"}, receipt)
    second = runner.run(loaded, {"note": "receipts"}, receipt)
    result = first["result"]
    assert result["results_sha256"] == second["result"]["results_sha256"]
    assert "_seconds" not in json.dumps(result)
    season = result["seasons"]["2023-24"]
    for side in ("offense", "defense", "combined"):
        assert season["coefficient_additivity_residual"][side] < 1e-6
        assert season["second_stage"][side]["coefficients"] == pytest.approx([1, 1, 1], abs=1e-6)
        assert season["second_stage"][side]["r2"] == pytest.approx(1.0, abs=1e-6)
    served = [p for p in season["players"] if p["status"] == "served"]
    assert served
    ids = [int(p["player_id"]) for p in served]
    assert np.corrcoef([p["offense"]["make"] for p in served], make[ids])[0, 1] > 0.5
    assert np.corrcoef([p["offense"]["sq"] for p in served], sq[ids])[0, 1] > 0.5
    for p in served:
        low, high = p["offense_interval"]["ts"]
        assert low < high
    persistence = result["persistence"]
    assert persistence["pairs"] == sum(persistence["pairs_by_season"].values())
    low, high = persistence["correlations"]["offense:sq_minus_make"]["interval"]
    assert low <= high
    assert persistence["verdict"] in {
        "oMake persists less than oSQ",
        "oMake persists more than oSQ",
        "no clear difference",
    }
    extract = runner.evidence_extract(result)
    assert all("players" not in body for body in extract["seasons"].values())


def test_small_sample_players_have_no_values(
    small_bootstrap: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    table = synthetic_table(5, np.zeros(40), np.zeros(40), rows=1500)
    tg = runner.targets(table)
    g = runner.groups(table, tg["shots"], tg["values"])
    players, _ = runner.design(g)
    shots = runner.exposure(g, players, g["weight"])
    monkeypatch.setattr(runner, "MIN_SHOTS", float(np.median(shots.min(axis=1))))
    result = runner.season_result("2022-23", table, 0)
    statuses = {p["status"] for p in result["players"]}
    assert statuses == {"served", "small_sample"}
    for player in result["players"]:
        assert ("offense" in player) == (player["status"] == "served")
    monkeypatch.setattr(runner, "MIN_SHOTS", 10**9)
    with pytest.raises(SystemExit, match="no qualified"):
        runner.season_result("2022-23", table, 0)


def test_runner_refuses_a_changed_table(tmp_path: Path) -> None:
    table = synthetic_table(6, np.zeros(40), np.zeros(40), rows=200)
    root = tmp_path / "tables"
    pins = write_tables(root, {"2022-23": table})
    with pytest.raises(SystemExit, match="no pinned"):
        runner.load_table("2022-23", "0" * 64, root)
    changed = dict(table)
    changed["actual"] = table["actual"] + 1
    np.savez(root / f"2022-23.{pins['2022-23'][:16]}.npz", **changed)
    with pytest.raises(SystemExit, match="differs from the registration"):
        runner.load_table("2022-23", pins["2022-23"], root)
