from __future__ import annotations

from copy import deepcopy

import pytest

from courtload.evaluation.challenger import (
    _matrix,
    _model,
    _promotion,
    _validation_selection,
    feature_names,
)
from courtload.evaluation.config import load_config

CONFIG = load_config(__import__("pathlib").Path("evaluation/config/baseline-v1.yaml"))


def test_frozen_feature_variants_and_estimator_parameters() -> None:
    player = feature_names("player_only")
    context = feature_names("player_plus_context")
    assert set(player) < set(context)
    assert "lead_days" in player
    assert "opponent_context_missing" not in player
    assert "opponent_context_missing" in context
    assert "player_id" not in context
    assert _matrix([{"lead_days": 2}], "player_only")[0][-1] == 2
    model = _model(CONFIG, leaves=15, l2=1)
    assert model.get_params()["early_stopping"] is False
    assert model.get_params()["max_iter"] == 200
    assert model.get_params()["max_bins"] == 255
    assert model.get_params()["random_state"] == 20260920


def test_validation_fold_training_is_chronological_and_budget_is_equal(monkeypatch) -> None:
    calls: list[tuple[str, tuple[str, ...], tuple[str, ...], int, float]] = []

    def fake_fit(config, variant, train_rows, predict_rows, leaves, l2):
        calls.append(
            (
                variant,
                tuple(row["split"] for row in train_rows),
                tuple(row["split"] for row in predict_rows),
                leaves,
                l2,
            )
        )
        return object(), [float(leaves) for _ in predict_rows]

    monkeypatch.setattr("courtload.evaluation.challenger._fit_predict", fake_fit)
    rows = [
        {
            "candidate_id": split,
            "split": split,
            "actual": 20.0,
            "player_id": split,
            "target_game_id": split,
            "target_game_date": "2022-11-01",
        }
        for split in ("s1", "v1", "v2", "calibration")
    ]
    selection, predictions = _validation_selection(rows, CONFIG)
    assert len(calls) == 16
    assert len(predictions) == 16
    assert {call[0] for call in calls} == {"player_only", "player_plus_context"}
    assert all(call[1] == ("s1",) for call in calls if call[2] == ("v1",))
    assert all(call[1] == ("s1", "v1") for call in calls if call[2] == ("v2",))
    assert all("calibration" not in call[1] for call in calls)
    assert selection["challenger_finalist"] == "player_only"
    assert selection["variants"]["player_only"]["selected_config"] == "leaf_15__l2_1"


def test_promotion_requires_every_frozen_gate() -> None:
    metric = {"mae": 8.0, "forecast_rows": 500, "unique_player_games": 300, "target_dates": 30}
    selected = {"pooled": {"mae": 7.0}, "folds": {"v1": {"mae": 7.0}, "v2": {"mae": 7.0}}}
    validation = {
        "baseline_validation": {
            "pooled": {"mae": 8.0},
            "folds": {"v1": {"mae": 8.0}, "v2": {"mae": 8.0}},
        },
        "variants": {"player_only": {"selected_config": "x", "configs": {"x": selected}}},
    }
    slices = {
        "lead_days_slice": {"0": {"ewma_20_hl5": metric, "player_only": {**metric, "mae": 7.0}}}
    }
    intervals = {
        "ewma_20_hl5": {"coverage": 0.80, "mean_width": 20.0},
        "player_only": {"coverage": 0.78, "mean_width": 21.0},
    }
    result = _promotion(
        CONFIG,
        "ewma_20_hl5",
        "player_only",
        validation,
        {"ewma_20_hl5": {"mae": 8.0}, "player_only": {"mae": 7.0}},
        {"upper": -0.1, "lower": -1.5},
        slices,
        intervals,
    )
    assert result["decision"] == "promote"
    changed = deepcopy(slices)
    changed["lead_days_slice"]["0"]["player_only"]["mae"] = 8.5
    result = _promotion(
        CONFIG,
        "ewma_20_hl5",
        "player_only",
        validation,
        {"ewma_20_hl5": {"mae": 8.0}, "player_only": {"mae": 7.0}},
        {"upper": -0.1, "lower": -1.5},
        changed,
        intervals,
    )
    assert result["decision"] == "do_not_promote"
    assert not result["gates"]["supported_slices"]["passed"]


def test_final_command_requires_explicit_open() -> None:
    from courtload.evaluation.challenger import run_final_evaluation

    with pytest.raises(ValueError, match="--open-final-test"):
        run_final_evaluation(
            None,  # type: ignore[arg-type]
            config=CONFIG,
            config_path=__import__("pathlib").Path("evaluation/config/baseline-v1.yaml"),
            dataset_manifest=__import__("pathlib").Path(
                "evaluation/manifests/accepted-archive-v1.json"
            ),
            output_root=__import__("pathlib").Path("data/artifacts/evaluation"),
            baseline_run_id="3cf4ae8eb331ac02d3b3",
            open_final_test=False,
        )
