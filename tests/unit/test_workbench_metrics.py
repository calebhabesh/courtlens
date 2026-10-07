"""Unit tests for the versioned CourtLens metric catalog and canonical formulas."""

from __future__ import annotations

import pytest

from courtlens.domain.metrics import (
    METRIC_CATALOG,
    METRIC_CATALOG_VERSION,
    compute_legacy_fantasy_score,
    compute_metrics,
    get_metric_definition,
    list_metric_definitions,
    validate_metric_keys,
)


def test_metric_catalog_completeness() -> None:
    """Metric catalog must contain all required core, efficiency, rate, and legacy metrics."""
    expected_keys = {
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
        "pts_per_36",
        "reb_per_36",
        "ast_per_36",
        "stl_per_36",
        "blk_per_36",
        "legacy_fantasy_score",
        "legacy_fantasy_score_per_game",
    }
    assert expected_keys.issubset(set(METRIC_CATALOG.keys()))
    assert len(list_metric_definitions()) >= len(expected_keys)

    for key, defn in METRIC_CATALOG.items():
        assert defn.key == key
        assert defn.version == METRIC_CATALOG_VERSION
        assert defn.display_name
        assert defn.short_name
        assert defn.unit
        assert defn.default_sort_direction in ("asc", "desc")
        assert len(defn.limitations) > 0


def test_metric_validation() -> None:
    """Unsupported metrics must be rejected with informative error messages."""
    defn = get_metric_definition("pts")
    assert defn.key == "pts"

    with pytest.raises(KeyError, match="unsupported metric 'win_probability'"):
        get_metric_definition("win_probability")

    with pytest.raises(ValueError, match="unsupported metric 'plus_minus'"):
        validate_metric_keys(["pts", "reb", "plus_minus"])


def test_compute_metrics_accuracy() -> None:
    """Canonical metric calculation produces exact basketball formulas."""
    games = [
        {
            "appearance": "appeared",
            "minutes_seconds": 1800,  # 30.0 mins
            "points": 24,
            "rebounds_offensive": 2,
            "rebounds_defensive": 6,
            "rebounds_total": 8,
            "assists": 7,
            "steals": 2,
            "blocks": 1,
            "turnovers": 3,
            "fouls_personal": 2,
            "field_goals_made": 9,
            "field_goals_attempted": 18,
            "three_pointers_made": 3,
            "three_pointers_attempted": 6,
            "free_throws_made": 3,
            "free_throws_attempted": 4,
        },
        {
            "appearance": "appeared",
            "minutes_seconds": 2400,  # 40.0 mins
            "points": 36,
            "rebounds_offensive": 1,
            "rebounds_defensive": 11,
            "rebounds_total": 12,
            "assists": 9,
            "steals": 1,
            "blocks": 2,
            "turnovers": 4,
            "fouls_personal": 3,
            "field_goals_made": 14,
            "field_goals_attempted": 22,
            "three_pointers_made": 4,
            "three_pointers_attempted": 8,
            "free_throws_made": 4,
            "free_throws_attempted": 5,
        },
        {
            "appearance": "reported_nonappearance",
            "minutes_seconds": None,
            "points": None,
            "rebounds_total": None,
        },
    ]

    metrics, samples = compute_metrics(games)

    # GP counts only confirmed active appearances
    assert metrics["gp"] == 2
    assert samples["gp"] == 2

    # Minutes
    assert metrics["min"] == 70.0
    assert metrics["min_per_game"] == 35.0

    # Points
    assert metrics["pts"] == 60
    assert metrics["pts_per_game"] == 30.0

    # Rebounds
    assert metrics["oreb"] == 3
    assert metrics["dreb"] == 17
    assert metrics["reb"] == 20
    assert metrics["reb_per_game"] == 10.0

    # Assists, Steals, Blocks, Turnovers
    assert metrics["ast"] == 16
    assert metrics["ast_per_game"] == 8.0
    assert metrics["stl"] == 3
    assert metrics["stl_per_game"] == 1.5
    assert metrics["blk"] == 3
    assert metrics["blk_per_game"] == 1.5
    assert metrics["tov"] == 7
    assert metrics["tov_per_game"] == 3.5

    # Percentages: paired makes / paired attempts
    # FG%: (9+14) / (18+22) = 23 / 40 = 0.575
    assert metrics["fg_pct"] == 0.575
    # 3P%: (3+4) / (6+8) = 7 / 14 = 0.5
    assert metrics["fg3_pct"] == 0.5
    # FT%: (3+4) / (4+5) = 7 / 9 = 0.7778
    assert metrics["ft_pct"] == 0.7778

    # Per-36 rates: (val / 70.0) * 36.0
    assert metrics["pts_per_36"] == round((60 / 70.0) * 36.0, 1)
    assert metrics["reb_per_36"] == round((20 / 70.0) * 36.0, 1)
    assert metrics["ast_per_36"] == round((16 / 70.0) * 36.0, 1)

    # Legacy fantasy score
    # Game 1: 24 + 1.2*8 (9.6) + 1.5*7 (10.5) + 3*2 (6) + 3*1 (3) - 3 = 50.1
    # Game 2: 36 + 1.2*12 (14.4) + 1.5*9 (13.5) + 3*1 (3) + 3*2 (6) - 4 = 68.9
    # Total: 119.0, per game: 59.5
    assert metrics["legacy_fantasy_score"] == 119.0
    assert metrics["legacy_fantasy_score_per_game"] == 59.5


def test_compute_metrics_zero_attempts_gives_none() -> None:
    """Percentage metrics must return None when attempts are zero, never 0.0 or division error."""
    games = [
        {
            "appearance": "appeared",
            "minutes_seconds": 600,
            "points": 0,
            "rebounds_total": 2,
            "assists": 1,
            "steals": 0,
            "blocks": 0,
            "turnovers": 1,
            "fouls_personal": 1,
            "field_goals_made": 0,
            "field_goals_attempted": 0,
            "three_pointers_made": 0,
            "three_pointers_attempted": 0,
            "free_throws_made": 0,
            "free_throws_attempted": 0,
        }
    ]
    metrics, _ = compute_metrics(games)
    assert metrics["fg_pct"] is None
    assert metrics["fg3_pct"] is None
    assert metrics["ft_pct"] is None


def test_compute_legacy_fantasy_score_missing_stat_returns_none() -> None:
    """Missing box score stats return None for legacy score, not inferred zeros."""
    complete = {
        "points": 20,
        "rebounds_total": 5,
        "assists": 5,
        "steals": 1,
        "blocks": 1,
        "turnovers": 2,
    }
    assert compute_legacy_fantasy_score(complete) == 20 + 6.0 + 7.5 + 3.0 + 3.0 - 2.0

    incomplete = dict(complete)
    incomplete["blocks"] = None
    assert compute_legacy_fantasy_score(incomplete) is None
