"""Hand-computed probability/baseline errors and frozen-prediction game uncertainty."""

import pytest

from courtlens.evaluation.expected_shot import (
    baseline_predictions,
    bootstrap_games,
    probability_metrics,
    train_baseline,
)


def test_probability_metrics_calibration_edges_and_point_values() -> None:
    result = probability_metrics([0, 1], [0, 1], [2, 3])
    assert result["brier"] == result["ece"] == result["expected_points_mae"] == 0
    assert result["calibration_bins"][0]["rows"] == result["calibration_bins"][9]["rows"] == 1
    mixed = probability_metrics([0, 1], [0.5, 0.5], [2, 3])
    assert mixed["brier"] == 0.25 and mixed["expected_points_mae"] == 1.25
    assert mixed["ece"] == 0
    with pytest.raises(ValueError, match="probability"):
        probability_metrics([1], [float("nan")], [2])


def test_zone_type_baseline_uses_only_supplied_training_rows_and_fixed_fallbacks() -> None:
    training = [
        {"zone": "rim", "shot_value": 2, "made": True},
        {"zone": "rim", "shot_value": 2, "made": False},
    ]
    baseline = train_baseline(training)
    held = [
        {"zone": "rim", "shot_value": 2, "made": True},
        {"zone": "unknown", "shot_value": 2, "made": False},
        {"zone": "unknown", "shot_value": 3, "made": False},
    ]
    assert baseline_predictions(held, baseline).tolist() == [0.5, 0.5, 0.5]
    held[0]["made"] = False
    assert baseline_predictions(held, baseline).tolist() == [0.5, 0.5, 0.5]


def test_bootstrap_resamples_whole_games_and_is_reproducible() -> None:
    rows = [{"game_id": "a"}, {"game_id": "a"}, {"game_id": "b"}]
    first = bootstrap_games(rows, [1, 1, 1], [1, 1, 1], [0, 0, 0], 2501)
    assert first == bootstrap_games(rows, [1, 1, 1], [1, 1, 1], [0, 0, 0], 2501)
    assert first["replicates"] == 200
    assert first["brier_difference_lower"] == first["brier_difference_upper"] == -1
