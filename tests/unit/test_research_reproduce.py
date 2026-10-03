import numpy as np
import pytest

from courtload.evaluation.research_reproduce import replay_probabilities


def test_replay_uses_saved_scaling_and_calibration_only_in_registered_roles():
    rows = [{"x_feet": 2, "y_feet": 1, "distance_feet": 5, "shot_value": 3}]
    model = {
        "mean": [1, 0, 4, 24, 0],
        "scale": [1, 1, 1, 1, 1],
        "coefficients": [0.2, -0.2, 0.1, -0.1, 0],
        "intercept": 0,
        "calibration_intercept": np.log(3),
    }
    assert replay_probabilities(rows, model, "selection")[0] == pytest.approx(0.5)
    assert replay_probabilities(rows, model, "calibration")[0] == pytest.approx(0.75)
    assert replay_probabilities(rows, model, "final_test")[0] == pytest.approx(0.75)
    with pytest.raises(ValueError, match="unregistered"):
        replay_probabilities(rows, model, "training")
