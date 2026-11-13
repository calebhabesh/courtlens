"""courtlens-pregame-nonlinear-v1: the diagnostic's rules, on made-up games (no data files)."""

from __future__ import annotations

import numpy as np
import pytest

from courtlens.evaluation import pregame_nonlinear as pn

COLUMNS = len(pn.PREGAME_COLUMNS)


def games(seasons: tuple[str, ...], per_season: int, curved: bool, seed: int = 7) -> pn.Games:
    """Made-up games: a straight-line margin, or one that bends in the first input."""
    rng = np.random.default_rng(seed)
    n = per_season * len(seasons)
    x = rng.normal(size=(n, COLUMNS))
    x[:, 2] = 1.0  # the home column carries the intercept, as in the real table
    signal = 3.0 * x[:, 0] + 2.0 * x[:, 2] + (6.0 * np.abs(x[:, 0]) if curved else 0.0)
    margin = signal + rng.normal(scale=1.0, size=n)
    season = np.repeat(np.array(seasons), per_season)
    beta = pn.least_squares(x, margin)
    return pn.Games(season=season, x=x, margin=margin, own=x @ beta)


def test_the_grid_is_in_tie_break_order():
    grid = pn.settings()
    assert grid[0] == {"num_leaves": 2, "min_data_in_leaf": 400}
    assert [g["num_leaves"] for g in grid] == [2, 2, 4, 4, 8, 8]
    assert len(grid) == 6


@pytest.mark.parametrize(
    ("low", "high", "result"),
    [(0.1, 0.5, "better"), (-0.5, -0.1, "worse"), (-0.2, 0.3, "not distinguishable")],
)
def test_a_result_needs_an_interval_clear_of_zero(low, high, result):
    assert pn.result_of({"mean": 0.0, "low": low, "high": high, "games": 10}) == result


def test_a_candidate_is_compared_with_the_frozen_forecast_on_the_same_games():
    some = games(("2022-23",), 400, curved=True)
    body = pn.compare(some, {"same": some.own.copy(), "perfect": some.margin.copy()})
    assert body["same"]["squared_error_gain"]["mean"] == 0.0
    assert body["same"]["result"] == "not distinguishable"
    assert body["perfect"]["result"] == "better" and body["perfect"]["rmse"] == 0.0
    assert body["linear"]["games"] == 400
    # A forecast of exactly zero picks the away team.
    flat = pn.scores(np.array([5.0, -5.0]), np.array([0.0, 0.0]))
    assert flat["winner_accuracy"] == 0.5


def test_forward_validation_scores_each_season_from_earlier_seasons_only(monkeypatch):
    monkeypatch.setattr(pn, "MAX_ROUNDS", 150)
    monkeypatch.setattr(pn, "VALIDATION", ("2018-19", "2019-20"))
    seasons = ("2015-16", "2016-17", "2017-18", "2018-19", "2019-20")
    train = games(seasons, 500, curved=True)
    table = pn.forward_validation(train)
    assert table["games"] == 1000 and table["seasons"] == ["2018-19", "2019-20"]
    # The straight-line fit of each fold, by hand.
    total = 0.0
    for season in ("2018-19", "2019-20"):
        earlier, scored = train.only(train.season < season), train.only(train.season == season)
        beta = pn.least_squares(earlier.x, earlier.margin)
        total += float(np.sum((scored.margin - scored.x @ beta) ** 2))
    assert table["linear_rmse"] == pytest.approx((total / 1000) ** 0.5)
    for name in pn.CANDIDATES:
        kept = table["candidates"][name]["kept"]
        assert 1 <= kept["rounds"] <= 150
        assert kept["rmse"] == min(s["rmse"] for s in table["candidates"][name]["settings"])
        # A margin that bends is found by both candidates.
        assert kept["rmse"] < table["linear_rmse"]


def test_on_a_straight_line_the_correction_finds_nothing(monkeypatch):
    monkeypatch.setattr(pn, "MAX_ROUNDS", 150)
    monkeypatch.setattr(pn, "VALIDATION", ("2018-19",))
    train = games(("2015-16", "2016-17", "2017-18", "2018-19"), 500, curved=False)
    table = pn.forward_validation(train)
    kept = table["candidates"]["linear_plus_trees"]["kept"]
    assert kept["rmse"] == pytest.approx(table["linear_rmse"], rel=0.02)


def test_the_correction_starts_from_the_given_forecast():
    some = games(("2015-16",), 600, curved=True)
    setting = {"num_leaves": 2, "min_data_in_leaf": 100}
    booster = pn.fit(some.x, some.margin, some.own, setting, 1)
    raw = np.asarray(booster.predict(some.x, raw_score=True))
    # One round of stumps at a 0.02 learning rate is a small correction, not a forecast.
    assert float(np.max(np.abs(raw))) < 1.0
    assert set(pn.gain_shares(booster)) == set(pn.PREGAME_COLUMNS)


def test_the_published_result_was_fitted_under_the_registration_as_it_stands():
    import json
    from pathlib import Path

    from courtlens.domain.research_registry import registration_receipt
    from courtlens.services import win_probability_page as page

    body = json.loads(Path(pn.PUBLISHED).read_text())
    assert body["registration"] == registration_receipt(pn.REGISTRATION)
    assert body["reference_check"]["passed"] is True
    assert body["evaluation"]["seasons"] == list(pn.EVALUATION)
    pooled = body["evaluation"]["pooled"]
    # Every result follows from its own interval.
    for name in pn.CANDIDATES:
        assert pooled[name]["result"] == pn.result_of(pooled[name]["squared_error_gain"])
        kept = body["validation"]["candidates"][name]["kept"]
        assert kept in body["validation"]["candidates"][name]["settings"]
    # The page serves the pooled numbers unchanged.
    served = page.pregame_nonlinear()
    assert served is not None and served["candidates"]["trees"] == pooled["trees"]
    assert served["linear"] == pooled["linear"] and served["inputs"] == COLUMNS
    assert served["games"] == sum(
        body["evaluation"]["by_season"][s]["linear"]["games"] for s in pn.EVALUATION
    )


def test_the_page_has_no_diagnostic_when_the_file_is_missing(tmp_path, monkeypatch):
    from courtlens.services import win_probability_page as page

    monkeypatch.setattr(page, "NONLINEAR_PATH", tmp_path / "missing.json")
    assert page.pregame_nonlinear() is None
