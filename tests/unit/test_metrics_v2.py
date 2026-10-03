"""Unit tests for Metric Catalog v2, paired rows, missingness, and percentiles."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from courtload.domain.metrics import (
    METRIC_CATALOG,
    METRIC_CATALOG_V1,
    METRIC_CATALOG_V1_VERSION,
    METRIC_CATALOG_V2,
    METRIC_CATALOG_V2_VERSION,
    METRIC_CATALOG_VERSION,
    compute_metrics,
    compute_metrics_v1,
    compute_metrics_v2,
    get_metric_definition,
    list_metric_definitions,
    resolve_metric_alias,
    validate_metric_keys,
)
from courtload.domain.normalization import (
    normalize_metric_value,
    validate_metric_normalization,
)
from courtload.domain.percentiles import (
    CohortPercentileSummary,
    compute_cohort_percentiles,
    compute_midrank_percentile,
    describe_cohort_percentile,
)
from courtload.domain.query_spec import (
    MetricSelector,
    NormalizationMode,
)


class TestCatalogV2Integrity:
    """Test registry completeness, metadata, aliases, and version separation."""

    def test_catalog_v2_has_all_required_metrics(self) -> None:
        """Catalog v2 must include core counting, efficiency, per-36 rates, and team factors."""
        required_v2_keys = {
            "gp",
            "min",
            "min_per_game",
            "pts",
            "pts_per_game",
            "oreb",
            "oreb_per_game",
            "dreb",
            "dreb_per_game",
            "reb",
            "reb_per_game",
            "reb_total",
            "reb_total_per_game",
            "ast",
            "ast_per_game",
            "stl",
            "stl_per_game",
            "blk",
            "blk_per_game",
            "tov",
            "tov_per_game",
            "pf",
            "pf_per_game",
            "fgm",
            "fga",
            "fg_pct",
            "fg3m",
            "fg3a",
            "fg3_pct",
            "ftm",
            "fta",
            "ft_pct",
            "ts_pct",
            "efg_pct",
            "ftr",
            "pts_per_36",
            "reb_per_36",
            "ast_per_36",
            "stl_per_36",
            "blk_per_36",
            "tov_per_36",
            "pf_per_36",
            "oreb_per_36",
            "dreb_per_36",
            "fga_per_36",
            "fg3a_per_36",
            "fta_per_36",
            "team_pace",
            "team_possessions_estimated",
            "team_off_rtg_estimated",
            "team_def_rtg_estimated",
            "team_net_rtg_estimated",
            "team_efg_pct",
            "team_tov_pct",
            "team_oreb_pct",
            "team_ftr",
            "legacy_fantasy_score",
            "legacy_fantasy_score_per_game",
        }
        assert required_v2_keys.issubset(set(METRIC_CATALOG.keys()))
        assert METRIC_CATALOG_VERSION == METRIC_CATALOG_V2_VERSION

    def test_aliases_resolve_correctly(self) -> None:
        """reb_total and reb_total_per_game resolve to canonical keys."""
        assert resolve_metric_alias("reb_total") == "reb"
        assert resolve_metric_alias("reb_total_per_game") == "reb_per_game"
        assert resolve_metric_alias("pts") == "pts"

        defn_reb = get_metric_definition("reb")
        defn_alias = get_metric_definition("reb_total")
        assert defn_reb.category == defn_alias.category
        assert "reb_total" in defn_reb.aliases
        assert "reb" in defn_alias.aliases

    def test_version_separation(self) -> None:
        """V1 and V2 catalogs are distinct and independently retrievable."""
        v1_list = list_metric_definitions(version=METRIC_CATALOG_V1_VERSION)
        v2_list = list_metric_definitions(version=METRIC_CATALOG_V2_VERSION)
        assert len(v2_list) > len(v1_list)

        # ts_pct exists in v2, but not in v1
        assert "ts_pct" in METRIC_CATALOG_V2
        assert "ts_pct" not in METRIC_CATALOG_V1

        # V1 definitions retain version='v1'
        for defn in v1_list:
            assert defn.version == "v1"
        for defn in v2_list:
            assert defn.version == "v2"

    def test_good_direction_metadata(self) -> None:
        """Turnovers and fouls specify 'low' good_direction; points and assists specify 'high'."""
        assert get_metric_definition("pts").good_direction == "high"
        assert get_metric_definition("ast").good_direction == "high"
        assert get_metric_definition("ts_pct").good_direction == "high"
        assert get_metric_definition("efg_pct").good_direction == "high"
        assert get_metric_definition("tov").good_direction == "low"
        assert get_metric_definition("pf").good_direction == "low"
        assert get_metric_definition("tov_per_36").good_direction == "low"
        assert get_metric_definition("gp").good_direction is None

    def test_validation_rejects_unregistered_metric(self) -> None:
        """Arbitrary strings raise ValueError in validate_metric_keys."""
        with pytest.raises(ValueError, match="unsupported metric 'fabricated_stat'"):
            validate_metric_keys(["pts", "fabricated_stat"])


class TestArithmeticReconciliation:
    """Arithmetic reconciliation for conventional TS%, eFG%, FTR, and per-36 rates."""

    def test_ts_efg_ftr_reconciliation(self) -> None:
        """Canonical formulas produce mathematically exact results on known numbers."""
        games = [
            {
                "appearance": "appeared",
                "minutes_seconds": 1800,  # 30.0 mins
                "points": 25,
                "field_goals_made": 8,
                "field_goals_attempted": 15,
                "three_pointers_made": 3,
                "three_pointers_attempted": 6,
                "free_throws_made": 6,
                "free_throws_attempted": 8,
                "rebounds_total": 5,
                "assists": 4,
            },
            {
                "appearance": "appeared",
                "minutes_seconds": 2100,  # 35.0 mins
                "points": 35,
                "field_goals_made": 12,
                "field_goals_attempted": 25,
                "three_pointers_made": 5,
                "three_pointers_attempted": 10,
                "free_throws_made": 6,
                "free_throws_attempted": 10,
                "rebounds_total": 7,
                "assists": 8,
            },
        ]

        metrics, samples = compute_metrics_v2(games)

        # PTS = 25 + 35 = 60
        # FGA = 15 + 25 = 40
        # FTA = 8 + 10 = 18
        # FGM = 8 + 12 = 20
        # 3PM = 3 + 5 = 8
        # 3PA = 6 + 10 = 16
        # FTM = 6 + 6 = 12

        # 1. FG% = 20 / 40 = 0.5000
        assert metrics["fg_pct"] == 0.5000

        # 2. 3P% = 8 / 16 = 0.5000
        assert metrics["fg3_pct"] == 0.5000

        # 3. FT% = 12 / 18 = 0.6667
        assert metrics["ft_pct"] == round(12 / 18, 4)

        # 4. eFG% = (FGM + 0.5 * 3PM) / FGA = (20 + 0.5 * 8) / 40 = 24 / 40 = 0.6000
        assert metrics["efg_pct"] == 0.6000
        assert samples["efg_pct"] == 2

        # 5. TS% = PTS / (2 * (FGA + 0.44 * FTA))
        # denominator = 2 * (40 + 0.44 * 18) = 2 * (40 + 7.92) = 2 * 47.92 = 95.84
        # TS% = 60 / 95.84 = 0.6260434... -> round to 4 decimals = 0.6260
        expected_ts = round(60.0 / (2.0 * (40.0 + 0.44 * 18.0)), 4)
        assert metrics["ts_pct"] == expected_ts
        assert samples["ts_pct"] == 2

        # 6. FTR = FTA / FGA = 18 / 40 = 0.4500
        assert metrics["ftr"] == 0.4500
        assert samples["ftr"] == 2

        # 7. Per-36 minutes: total unrounded minutes = 30.0 + 35.0 = 65.0
        # PTS/36 = (60 / 65.0) * 36 = 33.2307... -> 33.2
        assert metrics["pts_per_36"] == round((60.0 / 65.0) * 36.0, 1)

    def test_zero_attempts_gives_none(self) -> None:
        """When attempts are 0, ratios and percentages return None, not ZeroDivisionError or 0.0."""
        games = [
            {
                "appearance": "appeared",
                "minutes_seconds": 600,
                "points": 0,
                "field_goals_made": 0,
                "field_goals_attempted": 0,
                "three_pointers_made": 0,
                "three_pointers_attempted": 0,
                "free_throws_made": 0,
                "free_throws_attempted": 0,
            }
        ]
        metrics, _ = compute_metrics_v2(games)
        assert metrics["fg_pct"] is None
        assert metrics["fg3_pct"] is None
        assert metrics["ft_pct"] is None
        assert metrics["efg_pct"] is None
        assert metrics["ts_pct"] is None
        assert metrics["ftr"] is None


class TestStrictMissingnessAndPairedRows:
    """Test proper null handling and paired makes/attempts requirement."""

    def test_unobserved_metrics_return_none_not_zero(self) -> None:
        """When a stat was never observed, total and per-game are None, sample size is 0."""
        games = [
            {
                "appearance": "appeared",
                "minutes_seconds": 1800,
                "points": 20,
                "rebounds_total": 5,
                "steals": None,  # Not tracked
                "blocks": None,  # Not tracked
            },
            {
                "appearance": "appeared",
                "minutes_seconds": 1800,
                "points": 22,
                "rebounds_total": 7,
                "steals": None,
                "blocks": None,
            },
        ]
        metrics, samples = compute_metrics_v2(games)

        # Observed metrics are populated
        assert metrics["pts"] == 42
        assert metrics["pts_per_game"] == 21.0
        assert samples["pts"] == 2

        # Unobserved metrics MUST BE None (null), not 0 or 0.0
        assert metrics["stl"] is None
        assert metrics["stl_per_game"] is None
        assert samples["stl"] == 0
        assert samples["stl_per_game"] == 0

        assert metrics["blk"] is None
        assert metrics["blk_per_game"] is None
        assert samples["blk"] == 0

    def test_partial_observations_mean_divides_by_valid_observations_not_gp(self) -> None:
        """A mean divides by that metric's valid observation count, not all appearances (gp)."""
        games = [
            {"appearance": "appeared", "minutes_seconds": 1800, "points": 30},
            {"appearance": "appeared", "minutes_seconds": 1800, "points": None},  # Missing points
            {"appearance": "appeared", "minutes_seconds": 1800, "points": None},  # Missing points
        ]
        metrics, samples = compute_metrics_v2(games)

        assert metrics["gp"] == 3
        assert samples["gp"] == 3

        # Points was recorded in only 1 game: 30 / 1 = 30.0, NOT 30 / 3 = 10.0!
        assert metrics["pts"] == 30
        assert samples["pts"] == 1
        assert metrics["pts_per_game"] == 30.0
        assert samples["pts_per_game"] == 1

    def test_paired_rows_for_percentages(self) -> None:
        """Ratios pair required inputs on the same rows; unpaired rows are excluded."""
        games = [
            # Game 1: Paired valid make and attempt
            {"appearance": "appeared", "field_goals_made": 6, "field_goals_attempted": 10},
            # Game 2: Unpaired make without attempt -> MUST be excluded from FG%
            {"appearance": "appeared", "field_goals_made": 5, "field_goals_attempted": None},
            # Game 3: Unpaired attempt without make -> MUST be excluded from FG%
            {"appearance": "appeared", "field_goals_made": None, "field_goals_attempted": 10},
            # Game 4: Paired valid make and attempt
            {"appearance": "appeared", "field_goals_made": 4, "field_goals_attempted": 10},
        ]
        metrics, samples = compute_metrics_v2(games)

        # Jointly valid games are Game 1 and Game 4:
        # FGM = 6 + 4 = 10, FGA = 10 + 10 = 20 -> FG% = 10 / 20 = 0.5000
        # Naively summing unpaired rows would yield incorrect denominators
        assert metrics["fg_pct"] == 0.5000
        assert samples["fg_pct"] == 2

    def test_per_36_requires_positive_minutes(self) -> None:
        """Games with 0 or missing minutes are excluded from per-36 exposure denominator."""
        games = [
            # Game 1: 30 mins, 20 pts
            {"appearance": "appeared", "minutes_seconds": 1800, "points": 20},
            # Game 2: 0 recorded seconds (e.g. DNP or round down)
            {"appearance": "appeared", "minutes_seconds": 0, "points": 5},
            # Game 3: Missing minutes
            {"appearance": "appeared", "minutes_seconds": None, "points": 10},
        ]
        metrics, samples = compute_metrics_v2(games)

        # Only Game 1 has positive minutes: (20 / 30.0) * 36 = 24.0
        assert metrics["pts_per_36"] == 24.0
        assert samples["pts_per_36"] == 1


class TestMidrankPercentiles:
    """Test midrank cohort percentiles: 100 * (count_less + 0.5 * count_equal) / n for n >= 2."""

    def test_percentile_distinct_values(self) -> None:
        """Verify midrank percentile on distinct population [10, 20, 30, 40, 50]."""
        pop = [10.0, 20.0, 30.0, 40.0, 50.0]
        # n = 5
        # value=10: count_less=0, count_equal=1 -> 100 * 0.5 / 5 = 10.0%
        assert compute_midrank_percentile(10.0, pop) == 10.0
        # value=30 (median): count_less=2, count_equal=1 -> 100 * 2.5 / 5 = 50.0%
        assert compute_midrank_percentile(30.0, pop) == 50.0
        # value=50: count_less=4, count_equal=1 -> 100 * 4.5 / 5 = 90.0%
        assert compute_midrank_percentile(50.0, pop) == 90.0

    def test_percentile_identical_values_tie(self) -> None:
        """All identical values receive 50.0% midrank percentile."""
        pop = [25.0, 25.0, 25.0, 25.0]
        # count_less=0, count_equal=4 -> 100 * (0 + 2.0) / 4 = 50.0%
        assert compute_midrank_percentile(25.0, pop) == 50.0

    def test_percentile_population_too_small(self) -> None:
        """Population with n < 2 returns None (unavailable)."""
        assert compute_midrank_percentile(10.0, [10.0]) is None
        assert compute_midrank_percentile(10.0, []) is None
        assert compute_midrank_percentile(None, [10.0, 20.0]) is None

    def test_percentile_nulls_in_population_excluded(self) -> None:
        """Null/None values in population are excluded from n."""
        pop = [10.0, None, 20.0, None, 30.0]
        # Valid n = 3: [10.0, 20.0, 30.0]
        # value=20: count_less=1, count_equal=1 -> 100 * 1.5 / 3 = 50.0%
        assert compute_midrank_percentile(20.0, pop) == 50.0

    def test_compute_cohort_percentiles_aligned(self) -> None:
        """Cohort array preserves indices and None values."""
        values = [10.0, None, 30.0, 20.0]
        # Clean: [10, 20, 30], n = 3
        # 10: 100 * 0.5 / 3 = 16.67
        # None: None
        # 30: 100 * 2.5 / 3 = 83.33
        # 20: 100 * 1.5 / 3 = 50.0
        pcts = compute_cohort_percentiles(values)
        assert pcts == [16.67, None, 83.33, 50.0]

    def test_describe_cohort_percentile(self) -> None:
        """Metadata summary exposes valid observations, direction, and formula."""
        summary = describe_cohort_percentile("tov", 4.0, [2.0, 3.0, 4.0, 5.0])
        assert isinstance(summary, CohortPercentileSummary)
        assert summary.metric_key == "tov"
        assert summary.good_direction == "low"
        assert summary.valid_observations == 4
        assert summary.percentile == 62.5


class TestNormalizationCompatibility:
    """Test normalization modes, validation against catalog, and exposure calculation."""

    def test_valid_normalizations(self) -> None:
        """Counting metrics allow raw, per_game, per_36, per_75, per_100."""
        validate_metric_normalization("pts", "raw")
        validate_metric_normalization("pts", "per_game")
        validate_metric_normalization("pts", "per_36")

        # Value normalization
        assert normalize_metric_value(600.0, "per_game", exposure=20.0) == 30.0
        assert normalize_metric_value(600.0, "per_36", exposure=720.0) == 30.0

    def test_incompatible_normalization_rejected(self) -> None:
        """Ratios and percentages (FG%, TS%, eFG%) reject per_game or per_36 normalization."""
        with pytest.raises(ValueError, match="does not support normalization 'per_game'"):
            validate_metric_normalization("fg_pct", "per_game")

        with pytest.raises(ValueError, match="does not support normalization 'per_36'"):
            validate_metric_normalization("ts_pct", "per_36")

    def test_query_spec_metric_selector_validates_compatibility(self) -> None:
        """Pydantic model validator rejects incompatible normalization on MetricSelector."""
        # Compatible
        sel_valid = MetricSelector(key="pts", normalization=NormalizationMode.PER_36)
        assert sel_valid.normalization == NormalizationMode.PER_36

        # Incompatible
        with pytest.raises(ValidationError, match="does not support normalization 'per_36'"):
            MetricSelector(key="ts_pct", normalization=NormalizationMode.PER_36)


class TestBackwardCompatibility:
    """Test preservation of v1 computations and offline evaluation invariants."""

    def test_compute_metrics_v1_exact_preservation(self) -> None:
        """compute_metrics_v1 reproduces original v1 outputs with legacy 0-initialization."""
        games = [
            {"appearance": "appeared", "minutes_seconds": 1800, "points": 24, "rebounds_total": 8},
            {"appearance": "appeared", "minutes_seconds": 2400, "points": 36, "rebounds_total": 12},
        ]
        m1, s1 = compute_metrics_v1(games)
        m2, s2 = compute_metrics(games, version=METRIC_CATALOG_V1_VERSION)
        assert m1 == m2
        assert s1 == s2
        assert m1["pts"] == 60
        assert m1["reb"] == 20
        # v1 did not have ts_pct or efg_pct
        assert "ts_pct" not in m1
        assert "efg_pct" not in m1

    def test_default_compute_metrics_is_v2(self) -> None:
        """compute_metrics without explicit version defaults to v2 with TS% and eFG%."""
        games = [
            {
                "appearance": "appeared",
                "minutes_seconds": 1800,
                "points": 24,
                "rebounds_total": 8,
                "field_goals_made": 9,
                "field_goals_attempted": 18,
                "three_pointers_made": 3,
                "three_pointers_attempted": 6,
                "free_throws_made": 3,
                "free_throws_attempted": 4,
            }
        ]
        m, s = compute_metrics(games)
        assert "ts_pct" in m
        assert "efg_pct" in m
        assert "ftr" in m
        assert "reb_total" in m
        assert m["reb_total"] == m["reb"]
        assert "ts_pct" in s
        assert "efg_pct" in s
