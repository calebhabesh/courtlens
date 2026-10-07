"""Frozen baseline formulas for points-v1 forecasting experiment."""

from __future__ import annotations

import math
from collections.abc import Sequence


def clip_point_prediction(val: float | None) -> float | None:
    """Declared points-v1 postprocessing rule: clip point predictions at zero."""
    if val is None:
        return None
    return max(0.0, float(val))


def current_rolling_mean(
    current_pts: Sequence[float],
    *,
    window: int = 10,
    min_appearances: int = 5,
    previous_season_mean: float | None = None,
) -> float | None:
    """Mean of last up to 10 valid current appearances once 5 exist.

    For 1-4 with an eligible prior, use previous-season mean.
    """
    n = len(current_pts)
    if n >= min_appearances:
        selected = current_pts[-window:]
        return clip_point_prediction(math.fsum(selected) / len(selected))
    if 1 <= n < min_appearances and previous_season_mean is not None:
        return clip_point_prediction(previous_season_mean)
    return None


def current_ewma(
    current_pts: Sequence[float],
    *,
    window: int = 20,
    half_life: float = 5.0,
    min_appearances: int = 5,
    previous_season_mean: float | None = None,
) -> float | None:
    """Last up to 20 valid current appearances, half-life 5 appearances.

    Normalized weights 2^(-age/5), once 5 exist.
    For 1-4 with an eligible prior, use previous-season mean.
    """
    n = len(current_pts)
    if n >= min_appearances:
        selected = current_pts[-window:]
        weights = [2.0 ** (-age / half_life) for age in range(len(selected))]
        # Most recent appearance has age 0 (reversed)
        weighted_sum = math.fsum(
            val * weight for val, weight in zip(reversed(selected), weights, strict=True)
        )
        total_weight = math.fsum(weights)
        return clip_point_prediction(weighted_sum / total_weight)
    if 1 <= n < min_appearances and previous_season_mean is not None:
        return clip_point_prediction(previous_season_mean)
    return None


def season_prior_blend(
    current_pts: Sequence[float],
    *,
    previous_season_mean: float | None,
    blend_threshold: int = 10,
    blend_weight: float = 10.0,
    ewma_window: int = 20,
    ewma_half_life: float = 5.0,
) -> float | None:
    """For n < 10, (n * current_mean + 10 * previous_season_mean) / (n + 10).

    At n >= 10, use current EWMA.
    Requires at least 1 current-season appearance.
    """
    n = len(current_pts)
    if n == 0:
        return None
    if n >= blend_threshold:
        return current_ewma(
            current_pts,
            window=ewma_window,
            half_life=ewma_half_life,
            min_appearances=blend_threshold,
        )
    if previous_season_mean is None:
        return None
    curr_mean = math.fsum(current_pts) / n
    blended = (n * curr_mean + blend_weight * previous_season_mean) / (n + blend_weight)
    return clip_point_prediction(blended)
