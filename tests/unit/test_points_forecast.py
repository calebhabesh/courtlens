"""Unit tests for CourtLoad basketball-points-v1 forecasting protocol and models."""

from __future__ import annotations

from datetime import date
from pathlib import Path

import pytest

from courtload.evaluation.points_baselines import (
    clip_point_prediction,
    current_ewma,
    current_rolling_mean,
    season_prior_blend,
)
from courtload.evaluation.points_config import (
    load_points_config,
    points_config_hash,
)
from courtload.evaluation.points_features import (
    PointsPlayerGame,
    compute_player_features,
)
from courtload.evaluation.points_runner import evaluate_promotion_gates


def test_points_config_splits_order() -> None:
    """Config validates strictly chronological non-overlapping splits."""
    config_path = Path("evaluation/config/points-v1.yaml")
    if not config_path.exists():
        pytest.skip("Config file not found")
    config = load_points_config(config_path)
    assert config.version == "points-v1"
    assert config.target.formula == "PTS"
    assert set(config.baselines.keys()) == {"rolling_mean", "ewma_20_hl5", "prior_blend"}

    cfg_hash = points_config_hash(config)
    assert len(cfg_hash) == 64

    # Verify chronological ordering of splits: T < V1 < V2 < C < F
    splits = config.splits
    assert splits["t"].end < splits["v1"].start
    assert splits["v1"].end < splits["v2"].start
    assert splits["v2"].end < splits["c"].start
    assert splits["c"].end < splits["f"].start


def test_points_baselines_formulas() -> None:
    """Baselines match formulas and enforce non-negative clipping."""
    # 1. Rolling mean (last 10, min appearances 5)
    history_4 = [10.0, 20.0, 30.0, 40.0]
    # Under 5 without prior returns None
    assert current_rolling_mean(history_4, window=10, min_appearances=5) is None
    # Under 5 with prior returns prior
    assert (
        current_rolling_mean(history_4, window=10, min_appearances=5, previous_season_mean=18.0)
        == 18.0
    )

    history_15 = [float(x) for x in range(1, 16)]  # 1 to 15, last 10 are 6 to 15 (mean = 10.5)
    assert current_rolling_mean(history_15, window=10) == 10.5
    assert current_rolling_mean([], window=10) is None

    # 2. EWMA (half-life = 5, min appearances 5)
    assert current_ewma([25.0] * 5, half_life=5.0, min_appearances=5) == 25.0
    assert current_ewma([20.0, 20.0], half_life=5.0, min_appearances=5) is None
    assert current_ewma([], half_life=5.0) is None

    # 3. Prior blend
    # When n >= 10, returns EWMA
    ewma_val = current_ewma(history_15, window=20, half_life=5.0, min_appearances=10)
    assert (
        season_prior_blend(
            history_15,
            previous_season_mean=18.0,
            blend_threshold=10,
        )
        == ewma_val
    )

    # When n == 0, returns None
    assert season_prior_blend([], previous_season_mean=18.0) is None

    # When n == 5, blends 5 current and 10 prior weight: (5 * curr_mean + 10 * prior_mean) / 15
    n5_history = [20.0] * 5
    blend_val = season_prior_blend(
        n5_history,
        previous_season_mean=10.0,
        blend_threshold=10,
    )
    # curr_mean = 20, prior = 10 -> (5*20 + 10*10)/15 = 200/15 = 13.3333
    assert blend_val == pytest.approx(200.0 / 15.0, abs=1e-4)

    # 4. Zero clipping
    assert clip_point_prediction(-5.0) == 0.0
    assert clip_point_prediction(12.3) == 12.3
    assert clip_point_prediction(None) is None


def test_feature_extractor_temporal_cutoff() -> None:
    """Feature generation strictly excludes games on or after cutoff date."""
    cutoff = date(2024, 1, 15)
    target_date = date(2024, 1, 16)

    # 3 games: 2 before cutoff, 1 on cutoff date
    current_history = [
        PointsPlayerGame(
            game_id="g1",
            player_id="p1",
            team_id="100",
            opponent_id="200",
            game_date=date(2024, 1, 10),
            season="2023-24",
            phase="regular_season",
            appearance="appeared",
            minutes_seconds=1800,  # 30 min
            points=20,
            field_goal_attempts=15,
            free_throw_attempts=4,
        ),
        PointsPlayerGame(
            game_id="g2",
            player_id="p1",
            team_id="100",
            opponent_id="300",
            game_date=date(2024, 1, 12),
            season="2023-24",
            phase="regular_season",
            appearance="appeared",
            minutes_seconds=2100,  # 35 min
            points=30,
            field_goal_attempts=20,
            free_throw_attempts=6,
        ),
        # On cutoff date (MUST BE EXCLUDED)
        PointsPlayerGame(
            game_id="g3",
            player_id="p1",
            team_id="100",
            opponent_id="400",
            game_date=date(2024, 1, 15),
            season="2023-24",
            phase="regular_season",
            appearance="appeared",
            minutes_seconds=2400,
            points=50,
            field_goal_attempts=30,
            free_throw_attempts=10,
        ),
    ]

    features, valid_pts, _prior_pts = compute_player_features(
        current_history=current_history,
        prior_season_history=None,
        cutoff=cutoff,
        target_game_date=target_date,
    )

    # Only the 2 games strictly before cutoff must be included
    assert len(valid_pts) == 2
    assert valid_pts == [20.0, 30.0]
    # Mean should be 25.0, not (20+30+50)/3
    assert features["last_5_pts_mean"] == pytest.approx(25.0, abs=1e-4)
    assert features["valid_history_count_capped_50"] == 2


def test_promotion_gates_logic() -> None:
    """Promotion gates evaluate strictly and trigger baseline fallback on failure."""
    config_path = Path("evaluation/config/points-v1.yaml")
    if not config_path.exists():
        pytest.skip("Config file not found")
    config = load_points_config(config_path)

    # 1. Failing case: Challenger has worse pooled validation MAE (like our actual result)
    validation_results_fail = {
        "baseline_validation": {
            "pooled": {"prior_blend": {"mae": 4.613}},
            "folds": {
                "v1": {"prior_blend": {"mae": 4.641}},
                "v2": {"prior_blend": {"mae": 4.588}},
            },
        },
        "finalist_validation": {
            "pooled": {"mae": 4.633},
            "folds": {
                "v1": {"mae": 4.625},
                "v2": {"mae": 4.641},
            },
        },
    }

    final_metrics = {
        "prior_blend": {"mae": 4.643},
        "player_only": {"mae": 4.628},
    }
    uncertainty_fail = {
        "lower": -0.052,
        "upper": 0.014,  # upper > 0 -> Gate 2 fails
    }
    slices_pass = {
        "team_rest_slice": {
            "1_day": {
                "prior_blend": {
                    "mae": 4.636,
                    "forecast_rows": 30000,
                    "unique_player_games": 15000,
                    "target_dates": 150,
                },
                "player_only": {
                    "mae": 4.612,
                    "forecast_rows": 30000,
                    "unique_player_games": 15000,
                    "target_dates": 150,
                },
            }
        }
    }
    intervals_pass = {
        "prior_blend": {"core": {"coverage": 0.806, "mean_width": 14.81}},
        "player_only": {"core": {"coverage": 0.804, "mean_width": 14.59}},
    }

    result = evaluate_promotion_gates(
        config,
        baseline_name="prior_blend",
        finalist_name="player_only",
        validation_results=validation_results_fail,
        final_metrics=final_metrics,
        uncertainty=uncertainty_fail,
        slices=slices_pass,
        intervals=intervals_pass,
    )

    assert result["decision"] == "do_not_promote"
    assert result["gates"]["validation_improvement"]["passed"] is False
    assert result["gates"]["final_paired_superiority"]["passed"] is False
    assert result["gates"]["supported_slices"]["passed"] is True
    assert result["gates"]["interval_guardrails"]["passed"] is True
