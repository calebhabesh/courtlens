"""R14 lineup model: leakage, ridge exactness, antisymmetry, torch/numpy parity, determinism and
the registered verdict rule, on synthetic stints."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pytest

from courtlens.evaluation import lineup_model_core as core
from courtlens.evaluation import lineup_model_data as data

torch = pytest.importorskip("torch")

from courtlens.evaluation.lineup_model_train import Config, check_parity, train  # noqa: E402

PLAYERS = 40


def synthetic(
    seasons: range = range(2018, 2022), per_season: int = 400, seed: int = 3
) -> tuple[data.Stints, data.Boxes]:
    rng = np.random.default_rng(seed)
    rows = []
    for year in seasons:
        start = date(year, 11, 1).toordinal()
        for i in range(per_season):
            pool = PLAYERS if year < seasons[-1] else PLAYERS + 5
            odds = np.ones(pool)
            odds[30:PLAYERS] = 0.05  # rare players: below the threshold, on the box fallback
            ten = rng.choice(pool, size=10, replace=False, p=odds / odds.sum())
            rows.append((year, start + i // 8, i // 8 + 1000 * (year - 2000), ten))
    players = [f"p{i:03d}" for i in range(PLAYERS + 5)]
    games = sorted({f"g{r[2]:06d}" for r in rows})
    gindex = {g: i for i, g in enumerate(games)}
    n = len(rows)
    possessions = rng.integers(0, 9, size=(n, 2)).astype(float)
    points = rng.integers(0, 12, size=(n, 2)).astype(float)
    stints = data.Stints(
        players,
        games,
        np.array([r[0] for r in rows], dtype=np.int16),
        np.array([r[1] for r in rows], dtype=np.int32),
        np.array([gindex[f"g{r[2]:06d}"] for r in rows], dtype=np.int32),
        np.array([[r[3][:5], r[3][5:]] for r in rows], dtype=np.int32),
        rng.uniform(5, 300, n),
        points,
        possessions,
        np.zeros(n, dtype=bool),
    )
    box_rows = {}
    for year in seasons:
        for p in range(PLAYERS + (5 if year == seasons[-1] else 0)):
            box_rows[(data.season_label(year), players[p])] = {
                "seconds": float(rng.uniform(600, 90000)),
                "games": 30.0,
                **{s: float(rng.uniform(0, 400)) for s in data.BOX_STATS},
            }
    return stints, data.Boxes(box_rows)


@pytest.fixture(autouse=True)
def small_threshold(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(data, "MIN_POSSESSIONS", 600.0)


def test_window_reads_only_the_three_seasons_before_the_target() -> None:
    assert data.window_seasons("2023-24") == ("2020-21", "2021-22", "2022-23")
    s, b = synthetic()
    w = data.make_window(s, b, "2021-22")
    assert set(s.season[w.train].tolist()) == {2018, 2019, 2020}
    assert s.usable()[w.train].all()


def test_later_outcomes_never_change_an_earlier_fit() -> None:
    s, b = synthetic()
    w = data.make_window(s, b, "2021-22")
    before = core.fit_ridge(core.encode(s, w.train, w), len(w.own), 100.0)
    later = s.season == 2021
    s.points[later] = s.points[later][::-1] + 7
    b.rows[("2021-22", "p001")]["points"] = 99999.0
    w2 = data.make_window(s, b, "2021-22")
    after = core.fit_ridge(core.encode(s, w2.train, w2), len(w2.own), 100.0)
    np.testing.assert_array_equal(before.b_own, after.b_own)
    assert before.home == after.home


def test_newcomers_and_cold_start_read_the_fallback() -> None:
    s, b = synthetic()
    w = data.make_window(s, b, "2021-22")
    newcomer = s.players.index("p044")  # first seen in the target season, no window boxes
    assert newcomer not in w.own and not w.has_box[newcomer]
    assert np.all(w.features[newcomer] == 0)
    assert np.all(w.features[w.own] == 0)


def test_ridge_solves_the_weighted_normal_equations() -> None:
    s, b = synthetic()
    w = data.make_window(s, b, "2021-22")
    e = core.encode(s, w.train, w)
    k = len(w.own)
    model = core.fit_ridge(e, k, 50.0)
    gram, rhs = core.ridge_design(e, k)
    beta = np.concatenate([model.b_own, model.gamma, [model.gamma0, model.home]])
    penalty = np.full(len(beta), 50.0)
    penalty[-1] = 0
    np.testing.assert_allclose(gram @ beta + penalty * beta, rhs, atol=1e-8)
    # Prediction equals X beta, per 100.
    rebuilt = core.predict_ridge(model, e)
    b_ = core.additive(e, model.b_own, model.gamma, model.gamma0)
    np.testing.assert_allclose(
        rebuilt, 100 * (model.home * e.home + b_[:, 0].sum(1) - b_[:, 1].sum(1))
    )


def trained(seed: int = 11) -> tuple[core.Encoded, dict[str, np.ndarray], int]:
    s, b = synthetic()
    w = data.make_window(s, b, "2021-22")
    e = core.encode(s, w.train, w)
    weights, _ = train(e, len(w.own), 100.0, Config(8, 1e-4), seed)
    return e, weights, len(w.own)


def test_training_is_deterministic_on_cpu() -> None:
    _, first, _ = trained()
    _, second, _ = trained()
    assert first.keys() == second.keys()
    for name in first:
        np.testing.assert_array_equal(first[name], second[name])
    assert data.array_hash(first, {}) == data.array_hash(second, {})


def test_numpy_forward_equals_torch() -> None:
    e, weights, _ = trained()
    assert check_parity(e, weights) < 1e-4


def test_swapping_the_fives_negates_the_prediction_apart_from_home() -> None:
    e, weights, _ = trained()
    neutral = core.Encoded(e.slots, e.features, np.zeros(len(e.y)), e.y, e.w, e.game)
    swapped = core.Encoded(
        e.slots[:, ::-1], e.features[:, ::-1], np.zeros(len(e.y)), e.y, e.w, e.game
    )
    np.testing.assert_allclose(
        core.predict_lineup(weights, neutral), -core.predict_lineup(weights, swapped), atol=1e-9
    )


def test_zero_interaction_is_exactly_ridge() -> None:
    e, weights, k = trained()
    flat = dict(weights)
    flat["w_out"] = np.zeros_like(weights["w_out"])
    ridge = core.Ridge(
        100.0, weights["b_own"], weights["gamma"], float(weights["gamma0"]), float(weights["home"])
    )
    np.testing.assert_allclose(
        core.predict_lineup(flat, e), core.predict_ridge(ridge, e), rtol=1e-6, atol=1e-6
    )
    assert k > 0


def test_final_additive_part_is_the_ridge_solution_given_the_interaction() -> None:
    e, weights, k = trained()
    inter = core.interaction(e, {n: np.asarray(v, np.float64) for n, v in weights.items()})
    refit = core.fit_ridge(
        core.Encoded(e.slots, e.features, e.home, e.y - inter, e.w, e.game), k, 100.0
    )
    np.testing.assert_allclose(refit.b_own, weights["b_own"], atol=1e-4)


def test_game_sums_give_the_possession_weighted_rmse() -> None:
    e, weights, _ = trained()
    pred = core.predict_lineup(weights, e)
    games = np.unique(e.game)
    direct = np.sqrt(np.sum(e.w * (100 * e.y - pred) ** 2) / e.w.sum())
    assert core.wrmse(core.game_sums(e, pred, games), core.game_weights(e, games)) == pytest.approx(
        direct
    )


def test_verdict_rule() -> None:
    assert core.verdict({"low": 0.1, "high": 0.5}, [0.2, 0.1, -0.1]) == "lineup_better"
    assert core.verdict({"low": 0.1, "high": 0.5}, [0.2, -0.1, -0.1]) == "no_difference"
    assert core.verdict({"low": -0.5, "high": -0.1}, [-0.2, -0.1, 0.3]) == "ridge_better"
    assert core.verdict({"low": -0.1, "high": 0.4}, [0.2, 0.1, 0.1]) == "no_difference"


def test_resampling_is_seeded_and_shared() -> None:
    a = core.resample_counts(50, 1401, 2023, replicates=20)
    b = core.resample_counts(50, 1401, 2023, replicates=20)
    np.testing.assert_array_equal(a, b)
    assert (a.sum(axis=1) == 50).all()


def test_dataset_hash_ignores_nothing() -> None:
    s, _ = synthetic()
    before = data.stints_hash(s)
    s.points[0, 0] += 1
    assert data.stints_hash(s) != before


def test_box_features_are_none_without_minutes() -> None:
    _, b = synthetic()
    assert data.box_features(b, ("1999-00",), "p001") is None
    f = data.box_features(b, ("2018-19",), "p001")
    assert f is not None and len(f) == len(data.BOX_FEATURES)


def test_registration_matches_the_module_constants() -> None:
    from courtlens.evaluation import lineup_model_runner as runner

    path = Path("evaluation/research/registrations/courtlens-lineup-model-v1.json")
    if not path.exists():
        pytest.skip("registered after the code commit")
    parameters = json.loads(path.read_text())["parameters"]
    for key, value in runner.registered_constants().items():
        if key != "min_possessions":  # patched to 600 for the synthetic stints
            assert parameters[key] == value, key
    assert parameters["min_possessions"] == 1000.0
