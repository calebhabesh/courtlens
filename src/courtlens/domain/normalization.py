"""Metric exposure normalization routines and compatibility validation (Block B02)."""

from __future__ import annotations

from courtlens.domain.metrics import get_metric_definition


def validate_metric_normalization(metric_key: str, mode: str) -> None:
    """Validate that a normalization mode is compatible with the registered metric.

    Raises:
        ValueError if the normalization mode is not supported by the metric.
    """
    defn = get_metric_definition(metric_key)
    if mode not in defn.compatible_normalizations:
        valid_modes = ", ".join(defn.compatible_normalizations) or "none"
        raise ValueError(
            f"metric '{metric_key}' does not support normalization '{mode}'; "
            f"compatible modes: [{valid_modes}]"
        )


def normalize_metric_value(
    value: float | None,
    mode: str,
    exposure: float | None,
) -> float | None:
    """Normalize a raw metric value by exposure according to the mode.

    Modes:
        raw: unadjusted value (exposure ignored).
        per_game: value / valid appearances.
        per_36: (value / valid minutes) * 36.0.
        per_75: (value / valid possessions) * 75.0.
        per_100: (value / valid possessions) * 100.0.

    Requires positive exposure (>0) for rates; returns None if exposure is null, zero, or negative.
    """
    if value is None:
        return None
    if mode == "raw":
        return value
    if exposure is None or exposure <= 0:
        return None

    if mode == "per_game":
        return round(value / exposure, 1)
    if mode == "per_36":
        return round((value / exposure) * 36.0, 1)
    if mode == "per_75":
        return round((value / exposure) * 75.0, 1)
    if mode == "per_100":
        return round((value / exposure) * 100.0, 1)

    raise ValueError(f"unsupported normalization mode '{mode}'")
