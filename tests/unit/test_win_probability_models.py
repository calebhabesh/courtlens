from types import SimpleNamespace

import numpy as np
import pytest

from courtlens.domain.research_registry import load_registration
from courtlens.domain.win_probability_state import replay
from courtlens.evaluation.win_probability_data import (
    REGISTRATION,
    box_seconds,
    inactive,
    km,
    rotation_features,
    team_form,
)
from courtlens.evaluation.win_probability_models import (
    SHRINK,
    SPLITS,
    bootstrap_interval,
    calibration,
    fit_baseline,
    game_means,
    win_from_normal,
)
from courtlens.evaluation.win_probability_report import apply_calibration, blend


def test_registration_is_frozen_with_disjoint_splits():
    registration = load_registration(REGISTRATION)
    assert registration.seed == 2501
    assert "publish" in registration.negative_result_policy.lower()
    assert SHRINK == 0.7
    seen = [s for part in ("train", "select", "calibrate", "test") for s in SPLITS[part]]
    assert len(seen) == len(set(seen)) == 12
    assert SPLITS["test"] == ["2024-25", "2025-26"]
    assert (
        max(SPLITS["train"])
        < min(SPLITS["select"])
        < min(SPLITS["calibrate"])
        < min(SPLITS["test"])
    )


def test_inactive_list_excludes_coach_decisions():
    assert inactive("DND - Injury/Illness")
    assert inactive("NWT_TEAM_SUSPENSION")
    assert not inactive("DNP - Coach's Decision")
    assert not inactive("")


def test_box_seconds_and_distance():
    assert box_seconds("22:03") == 1323
    assert box_seconds("") == 0
    assert 3900 < km((40.75, -73.99), (34.04, -118.27)) < 4000


def test_team_form_ranks_the_winner_and_learns_home():
    earlier = [(100 + i, 0, 1, 10.0, 1.0) for i in range(30)]
    ratings, home = team_form(earlier, 140, 60)
    assert ratings[0] > ratings[1]
    assert home > 0


def test_team_form_decays_old_games():
    old = [(0, 0, 1, 20.0, 0.0)] * 20
    recent = [(1000, 1, 0, 20.0, 0.0)] * 5
    ratings, _ = team_form(old + recent, 1001, 30)
    assert ratings[1] > ratings[0]


@pytest.mark.parametrize("mean", [-8.0, -0.2, 0.0, 3.0])
def test_normal_win_probability_sums_to_one_across_views(mean):
    sd, tie = np.array([6.0]), np.array([0.6])
    home = win_from_normal(np.array([mean]), sd, tie)
    away = win_from_normal(np.array([-mean]), sd, 1 - tie)
    assert home[0] + away[0] == pytest.approx(1.0)


def test_ties_go_to_the_overtime_model():
    tied = win_from_normal(np.array([0.0]), np.array([0.01]), np.array([0.7]))
    assert tied[0] == pytest.approx(0.7)


def test_baseline_recovers_beta_and_sigma():
    rng = np.random.default_rng(1)
    n = 200_000
    fraction = rng.uniform(0.01, 1.0, n)
    mu = rng.normal(0, 6, n)
    margin = rng.normal(0, 8, n)
    target = margin + 0.9 * mu * fraction + rng.normal(0, 12 * np.sqrt(fraction))
    season = SimpleNamespace(
        target=target,
        margin=margin,
        fraction=fraction,
        weight=np.ones(n),
        game={"mu": mu},
    )
    fitted = fit_baseline([season], [np.ones(n)], "mu")
    assert fitted["beta"] == pytest.approx(0.9, abs=0.02)
    assert fitted["sigma"] == pytest.approx(12.0, abs=0.1)


def test_game_means_count_each_game_once():
    loss = np.array([1.0, 1.0, 1.0, 3.0])
    index = np.array([0, 0, 0, 1])
    means, reached = game_means(loss, index, 2)
    assert means.tolist() == [1.0, 3.0]
    assert reached.all()
    only_first, reached = game_means(loss, index, 2, index == 0)
    assert reached.tolist() == [True, False]
    assert only_first[0] == 1.0


def test_bootstrap_is_seeded_and_covers_the_mean():
    values = np.random.default_rng(0).normal(1, 1, 500)
    first, second = bootstrap_interval(values), bootstrap_interval(values)
    assert first == second
    assert first["low"] < first["mean"] < first["high"]


def test_calibration_is_zero_when_rates_match():
    p = np.repeat([0.025, 0.975], 2000)
    win = np.concatenate([np.arange(2000) < 50, np.arange(2000) < 1950]).astype(float)
    assert calibration(p, win, np.ones(4000))["ece"] == pytest.approx(0.0, abs=1e-9)


def test_calibration_slope_keeps_probabilities_summing_to_one():
    p = np.array([0.1, 0.5, 0.8])
    assert np.allclose(apply_calibration(p, 1.3) + apply_calibration(1 - p, 1.3), 1.0)
    assert apply_calibration(p, None) is p


def test_specialist_blend_ramps_with_time_left():
    season = SimpleNamespace(
        period=np.array([1, 4, 4, 5]), left=np.array([100.0, 120.0, 60.0, 0.0])
    )
    main = np.array([0.5, 0.5, 0.5, 0.5])
    special = np.array([np.nan, 1.0, 1.0, 1.0])
    assert blend(main, special, season).tolist() == [0.5, 0.5, 0.75, 1.0]


def _rotation(times, fouls=None, ejections=None):
    game = replay([], "1", "2")
    game.fouls = fouls or []
    game.ejections = ejections or []
    roster = [["a", 200.0, 4.0], ["b", 40.0, -2.0]]
    stint = {
        "period": 1,
        "end_seconds_remaining": 0.0,
        "duration_seconds": 720.0,
        "home_lineup_json": ["a", "c", "d", "e", "f"],
    }
    return rotation_features(np.array(times), [stint], "home", roster, game, 0.0)


def test_a_fouled_out_player_leaves_the_rotation_only_afterwards():
    fouls = [(500.0, "home", "a", 6)]
    out = _rotation([100.0, 600.0], fouls=fouls)
    assert out["lost"][0] == pytest.approx(0.0, abs=1e-9)
    assert out["rotation"][1] < out["rotation"][0]
    assert out["lost"][1] > 0


def test_an_ejection_counts_only_after_it_happens():
    out = _rotation([100.0, 600.0], ejections=[(500.0, "home", "a")])
    clean = _rotation([100.0, 600.0])
    assert out["rotation"][0] == pytest.approx(clean["rotation"][0])
    assert out["rotation"][1] < clean["rotation"][1]


def test_missing_ratings_leave_rotation_unknown_not_zero():
    game = replay([], "1", "2")
    out = rotation_features(np.array([1.0]), [], "home", [["a", 240.0, None]], game, 0.0)
    assert np.isnan(out["rotation"]).all()
