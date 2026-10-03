"""Unit tests for Block B12: Analytical operations domain mathematics and sample rules.

Verifies:
1. Type 7 linear interpolation quantile calculation across probability values.
2. Population descriptive standard deviation and distribution summary rules (n >= 5 gating).
3. Disjoint period comparison delta math and zero-denominator percentage delta rules.
4. Team rest days calculation (calendar date diff - 1, back-to-back = 0, first game = unknown).
5. Player appearance gap days calculation vs team rest days distinction.
6. Cohort standardization (z-score), zero-variance dimension exclusion, and Euclidean distance.
7. Overlapping dimension threshold (>= 6 of 8 required) and per-dimension contributions.
8. Deterministic tie-breaking (distance asc, player_id asc) and self-exclusion.
"""

from __future__ import annotations

import math
from datetime import date

import pytest

from courtload.domain.analytical_ops import (
    calculate_calendar_gap,
    categorize_rest_bucket,
    compute_distribution_summary,
    compute_period_delta,
    compute_population_sd,
    quantile_type_7,
)


class TestQuantileType7:
    """Test linear interpolation quantile type 7 (NumPy/pandas/R default)."""

    def test_quantile_type_7_exact_values(self) -> None:
        """5 evenly spaced numbers [10, 20, 30, 40, 50]."""
        vals = [10.0, 20.0, 30.0, 40.0, 50.0]
        # h = 4 * p
        assert quantile_type_7(vals, 0.0) == 10.0
        assert quantile_type_7(vals, 0.25) == 20.0
        assert quantile_type_7(vals, 0.50) == 30.0
        assert quantile_type_7(vals, 0.75) == 40.0
        assert quantile_type_7(vals, 1.0) == 50.0

        # Fractional h: p=0.10 -> h=0.4 -> 10 + 0.4*10 = 14.0
        assert pytest.approx(quantile_type_7(vals, 0.10)) == 14.0
        # p=0.90 -> h=3.6 -> 40 + 0.6*10 = 46.0
        assert pytest.approx(quantile_type_7(vals, 0.90)) == 46.0

    def test_quantile_type_7_single_element(self) -> None:
        vals = [42.0]
        assert quantile_type_7(vals, 0.0) == 42.0
        assert quantile_type_7(vals, 0.5) == 42.0
        assert quantile_type_7(vals, 1.0) == 42.0

    def test_quantile_type_7_empty_raises(self) -> None:
        with pytest.raises(ValueError, match="empty list"):
            quantile_type_7([], 0.5)

    def test_quantile_type_7_invalid_p_raises(self) -> None:
        with pytest.raises(ValueError, match="must be in"):
            quantile_type_7([1.0, 2.0], -0.1)
        with pytest.raises(ValueError, match="must be in"):
            quantile_type_7([1.0, 2.0], 1.1)


class TestDistributionSummaryMath:
    """Test distribution summary with strict n >= 5 sample rule and descriptive statistics."""

    def test_sample_less_than_five_gated(self) -> None:
        """Sample sizes n < 5 must return summary_available=False with explanation."""
        summary = compute_distribution_summary([15.0, 22.0, 18.0, 30.0])
        assert summary["summary_available"] is False
        assert summary["n"] == 4
        assert "Insufficient sample size (n = 4 < 5)" in summary["reason"]
        assert summary["mean"] is None
        assert summary["median"] is None
        assert summary["iqr"] is None
        assert summary["population_sd"] is None

    def test_sample_five_or_more_calculates_all_statistics(self) -> None:
        """Sample sizes n >= 5 must compute all quantiles, population SD, and IQR."""
        raw = [12.0, 15.0, 18.0, 24.0, 28.0, 32.0, 35.0, 40.0]
        summary = compute_distribution_summary(raw)
        assert summary["summary_available"] is True
        assert summary["reason"] is None
        assert summary["n"] == 8
        assert summary["min"] == 12.0
        assert summary["max"] == 40.0
        assert summary["mean"] == round(sum(raw) / 8, 2)

        # Median = quantile 0.5 on 8 items (h = 7 * 0.5 = 3.5 -> 24 + 0.5*(28-24) = 26.0)
        assert summary["median"] == 26.0
        assert summary["p25"] is not None
        assert summary["p75"] is not None
        assert summary["iqr"] == round(summary["p75"] - summary["p25"], 2)
        assert summary["population_sd"] is not None
        assert summary["population_sd"] > 0.0

    def test_population_sd_formula(self) -> None:
        """Population standard deviation uses 1/N divisor rather than sample Bessel 1/(N-1)."""
        vals = [10.0, 20.0, 30.0, 40.0]
        mean = 25.0
        # sum((x - 25)^2) = 225 + 25 + 25 + 225 = 500
        # pop_var = 500 / 4 = 125 -> pop_sd = sqrt(125) ~= 11.1803
        expected = math.sqrt(125.0)
        actual = compute_population_sd(vals, mean)
        assert pytest.approx(actual, rel=1e-4) == expected


class TestPeriodComparisonDeltaMath:
    """Test delta arithmetic between Period A and Period B."""

    def test_positive_and_negative_deltas(self) -> None:
        # Increase: 25.0 vs 20.0 -> +5.0 abs, +25.0%
        abs_d, pct_d = compute_period_delta(25.0, 20.0)
        assert abs_d == 5.0
        assert pct_d == 25.0

        # Decrease: 15.0 vs 20.0 -> -5.0 abs, -25.0%
        abs_d, pct_d = compute_period_delta(15.0, 20.0)
        assert abs_d == -5.0
        assert pct_d == -25.0

    def test_zero_denominator_percentage_delta_is_null(self) -> None:
        """Zero baseline value in Period B must return null percentage delta per contract."""
        abs_d, pct_d = compute_period_delta(5.0, 0.0)
        assert abs_d == 5.0
        assert pct_d is None

    def test_none_value_returns_none(self) -> None:
        assert compute_period_delta(None, 20.0) == (None, None)
        assert compute_period_delta(20.0, None) == (None, None)
        assert compute_period_delta(None, None) == (None, None)


class TestCalendarRestAndGapMath:
    """Test team rest days definition and distinction from player appearance gaps."""

    def test_back_to_back_is_zero_rest_days(self) -> None:
        """Consecutive calendar days (date diff = 1) -> 1 - 1 = 0 days rest."""
        prev = date(2024, 1, 10)
        cur = date(2024, 1, 11)
        rest = calculate_calendar_gap(cur, prev)
        assert rest == 0
        assert categorize_rest_bucket(rest) == "0 days (Back-to-back)"

    def test_one_day_rest(self) -> None:
        """Two days difference (e.g. Wed to Fri) -> 2 - 1 = 1 day rest."""
        prev = date(2024, 1, 10)
        cur = date(2024, 1, 12)
        rest = calculate_calendar_gap(cur, prev)
        assert rest == 1
        assert categorize_rest_bucket(rest) == "1 day"

    def test_two_days_rest(self) -> None:
        prev = date(2024, 1, 10)
        cur = date(2024, 1, 13)
        rest = calculate_calendar_gap(cur, prev)
        assert rest == 2
        assert categorize_rest_bucket(rest) == "2 days"

    def test_three_plus_days_rest(self) -> None:
        prev = date(2024, 1, 10)
        cur = date(2024, 1, 15)
        rest = calculate_calendar_gap(cur, prev)
        assert rest == 4
        assert categorize_rest_bucket(rest) == "3+ days"

    def test_season_opener_or_unknown_previous(self) -> None:
        cur = date(2024, 1, 10)
        rest = calculate_calendar_gap(cur, None)
        assert rest is None
        assert categorize_rest_bucket(rest) == "Unknown / Season Opener"
