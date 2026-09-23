"""Frozen transparent baseline formulas."""

from __future__ import annotations

import math
from collections.abc import Sequence


def last_n_mean(values: Sequence[float], *, window: int) -> float | None:
    """Return the arithmetic mean of the newest ``window`` values."""
    if len(values) < window:
        return None
    selected = values[-window:]
    return math.fsum(selected) / window


def available_history_mean(values: Sequence[float], *, minimum: int, maximum: int) -> float | None:
    """Return the product fallback mean without borrowing another season."""
    if len(values) < minimum:
        return None
    selected = values[-maximum:]
    return math.fsum(selected) / len(selected)


def ewma(values: Sequence[float], *, window: int, half_life: float) -> float | None:
    """Weight newest appearance at age zero with ``2 ** (-age / half_life)``."""
    if not values:
        return None
    selected = values[-window:]
    weighted = [(value, 2.0 ** (-age / half_life)) for age, value in enumerate(reversed(selected))]
    return math.fsum(value * weight for value, weight in weighted) / math.fsum(
        weight for _, weight in weighted
    )
