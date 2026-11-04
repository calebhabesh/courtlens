"""Scorecard arithmetic: calibration from stored bins, the drift flag, and the headline groups."""

import numpy as np

from courtlens.domain.win_probability_scorecard import (
    calibration_curve,
    calibration_error,
    drift_status,
    game_bins,
    interval_for,
    losses,
    paired_interval,
    phase_masks,
    summarize,
)

TABLE = [
    {"games": 25, "low": 0.03, "high": 0.09, "median": 0.05},
    {"games": 100, "low": 0.02, "high": 0.05, "median": 0.03},
]


def row(day, game, prospective=True, p=0.7, win=1.0, espn=0.6):
    states = np.full(10, p)
    log_loss, brier = losses(states, win)
    their_loss, their_brier = losses(np.full(10, espn), win)
    return {
        "game_id": game,
        "date": day,
        "home": "BOS",
        "away": "NY",
        "home_score": 100,
        "away_score": 90,
        "prospective": prospective,
        "availability": "tip_off_capture" if prospective else "hindsight_box",
        "courtlens": {"log_loss": log_loss, "brier": brier, "phases": {}},
        "bins_courtlens": game_bins(states, win),
        "espn": {
            "log_loss": their_loss,
            "brier": their_brier,
            "courtlens_log_loss": log_loss,
            "courtlens_brier": brier,
            "matched_share": 1.0,
            "bins": game_bins(np.full(10, espn), win),
            "bins_courtlens": game_bins(states, win),
        },
    }


def test_bins_reproduce_direct_calibration_error():
    # Every state at 0.7 and the team won: the error is |0.7 - 1|.
    bins = np.array(game_bins(np.full(10, 0.7), 1.0))
    assert abs(bins[:, 0].sum() - 1) < 1e-5
    assert abs(calibration_error(bins) - 0.3) < 1e-5
    curve = calibration_curve(bins)
    assert len(curve) == 1 and abs(curve[0]["predicted"] - 0.7) < 1e-5


def test_two_games_pool_before_the_absolute_value():
    # 0.5 predicted: one win and one loss are perfectly calibrated together.
    both = np.array(game_bins(np.full(4, 0.5), 1.0)) + np.array(game_bins(np.full(4, 0.5), 0.0))
    assert calibration_error(both) < 1e-6


def test_interval_needs_the_smallest_window():
    assert interval_for(10, TABLE) is None
    low, high = interval_for(100, TABLE)
    assert (low, high) == (0.02, 0.05)


def test_drift_flag_each_status():
    assert drift_status(0.2, 10, TABLE)["status"] == "insufficient"
    assert drift_status(0.1, 25, TABLE)["status"] == "above"
    assert drift_status(0.05, 25, TABLE)["status"] == "within"
    assert drift_status(0.01, 25, TABLE)["status"] == "below"


def test_paired_interval_needs_twenty_games():
    assert paired_interval(np.ones(5)) is None
    assert paired_interval(np.ones(30)) == {"mean": 1.0, "low": 1.0, "high": 1.0, "games": 30}


def test_phases_split_the_game():
    masks = phase_masks(np.array([0.0, 1500.0, 2200.0, 2800.0, 2900.0]))
    assert [int(np.flatnonzero(masks[k])[0]) for k in masks] == [0, 1, 2, 3, 4]


def test_prospective_games_are_kept_apart_and_positive_gaps_favour_courtlens():
    rows = [row("2026-11-05", str(i)) for i in range(25)] + [row("2026-10-25", "x", False)]
    result = summarize(rows, TABLE)
    assert result["games_scored"] == 26
    assert result["prospective"]["games"] == 25
    assert result["pre_freeze_replay"]["games"] == 1
    assert result["drift"]["basis"] == "prospective"
    assert result["drift"]["latest"]["games"] == 25
    assert result["prospective"]["same_events"]["log_loss_gap"]["mean"] > 0


def test_drift_uses_only_the_thirty_day_window():
    rows = [row("2026-11-01", str(i), p=0.99, win=0.0) for i in range(5)]
    rows += [row("2026-12-20", f"later{i}") for i in range(25)]
    latest = summarize(rows, TABLE)["drift"]["latest"]
    assert latest["games"] == 25


def test_empty_scorecard():
    result = summarize([], TABLE)
    assert result["prospective"] == {"games": 0}
    assert result["drift"]["latest"]["status"] == "insufficient"
