"""Cohort percentile calculation using midrank formula (Block B02)."""

from __future__ import annotations

import math
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any


def compute_midrank_percentile(
    value: float | None,
    population: Iterable[float | None],
) -> float | None:
    """Calculate the midrank percentile for a value relative to an eligible cohort population.

    Canonical contract formula (docs/design/replica-analytics-contract.md lines 79-80):
        100 * (count_less + 0.5 * count_equal) / n for n >= 2; otherwise unavailable (None).

    Strict missingness rules:
    - Excludes null/None and NaN observations from the population.
    - If value is None or NaN, returns None.
    - If eligible cohort size n < 2, returns None (requires at least 2 observations).
    """
    if value is None or math.isnan(value):
        return None

    clean_pop = [float(x) for x in population if x is not None and not math.isnan(x)]
    n = len(clean_pop)
    if n < 2:
        return None

    count_less = sum(1 for x in clean_pop if x < value)
    count_equal = sum(1 for x in clean_pop if x == value)

    percentile = 100.0 * (count_less + 0.5 * count_equal) / n
    return round(percentile, 2)


def compute_cohort_percentiles(
    values: list[float | None],
) -> list[float | None]:
    """Calculate midrank percentiles for an entire cohort aligned with the input list.

    Preserves list indices, mapping None inputs to None percentiles.
    """
    clean_pop = [float(x) for x in values if x is not None and not math.isnan(x)]
    n = len(clean_pop)
    if n < 2:
        return [None for _ in values]

    result: list[float | None] = []
    for val in values:
        if val is None or math.isnan(val):
            result.append(None)
        else:
            count_less = sum(1 for x in clean_pop if x < val)
            count_equal = sum(1 for x in clean_pop if x == val)
            result.append(round(100.0 * (count_less + 0.5 * count_equal) / n, 2))
    return result


@dataclass(frozen=True)
class CohortPercentileSummary:
    """Metadata describing a cohort percentile evaluation."""

    metric_key: str
    value: float | None
    percentile: float | None
    cohort_size: int
    valid_observations: int
    formula: str
    good_direction: str | None

    def to_dict(self) -> dict[str, Any]:
        return {
            "metric_key": self.metric_key,
            "value": self.value,
            "percentile": self.percentile,
            "cohort_size": self.cohort_size,
            "valid_observations": self.valid_observations,
            "formula": self.formula,
            "good_direction": self.good_direction,
        }


def describe_cohort_percentile(
    metric_key: str,
    value: float | None,
    population: Iterable[float | None],
) -> CohortPercentileSummary:
    """Compute midrank percentile and wrap with catalog definition and direction metadata."""
    from courtlens.domain.metrics import METRIC_CATALOG

    clean_pop = [float(x) for x in population if x is not None and not math.isnan(x)]
    pct = compute_midrank_percentile(value, clean_pop)
    defn = METRIC_CATALOG.get(metric_key)
    good_dir = defn.good_direction if defn else None

    pop_list = list(population)
    return CohortPercentileSummary(
        metric_key=metric_key,
        value=value,
        percentile=pct,
        cohort_size=len(pop_list),
        valid_observations=len(clean_pop),
        formula="100 * (count_less + 0.5 * count_equal) / n",
        good_direction=good_dir,
    )
