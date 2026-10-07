"""Independent partition, denominator, missingness and clustered uncertainty checks."""

from dataclasses import replace
from datetime import date

import pytest
from pydantic import ValidationError

from courtlens.domain.on_off import (
    SharedFloorRequest,
    difference_interval,
    lineup_matches,
    ratio_interval,
)
from courtlens.services.on_off import aggregate_shared_floor
from courtlens.services.workbench_analytics import ResolvedContext


def context() -> ResolvedContext:
    return ResolvedContext(
        release_id="release",
        snapshot_id="snapshot",
        dataset_id="dataset",
        dataset_type="workbench",
        semantic_signature="test",
        mode="historical_reconstruction",
        source="test",
        season="2023-24",
        phase="regular_season",
        before_date=date(2024, 2, 1),
        cutoff_utc="2024-02-01T05:00:00+00:00",
        window="season",
        coverage_start=date(2024, 1, 1),
        coverage_end=date(2024, 1, 31),
        default_before_date=date(2024, 2, 1),
        supported_dates=[],
        published_at=None,
        warnings=[],
    )


def rows() -> list[dict]:
    return [
        {
            "game_id": "g1",
            "lineup": ["a", "b", "f", "d", "e"],
            "seconds": 120,
            "off": 10.5,
            "def": 9.5,
            "points": 14,
            "allowed": 10,
            "stats": {"points": 4},
        },
        {
            "game_id": "g1",
            "lineup": ["a", "c", "f", "d", "e"],
            "seconds": 60,
            "off": 5.5,
            "def": 6.5,
            "points": 4,
            "allowed": 8,
            "stats": {"points": 2},
        },
        {
            "game_id": "g2",
            "lineup": ["b", "c", "f", "d", "e"],
            "seconds": 60,
            "off": 5,
            "def": 5,
            "points": 6,
            "allowed": 4,
            "stats": {},
        },
        {
            "game_id": "g2",
            "lineup": ["b", "c", "x", "d", "e"],
            "seconds": 60,
            "off": 5,
            "def": 5,
            "points": 6,
            "allowed": 4,
            "stats": {"points": 99},
        },
    ]


@pytest.mark.parametrize(
    "kwargs",
    [
        {},
        {"together": ["a", "a"]},
        {"together": ["a"], "apart": ["a"]},
        {"together": [str(i) for i in range(6)]},
        {"exact_unit": ["a"]},
        {"exact_unit": ["a", "b"], "apart": ["c"]},
        {"together": [""]},
        {"together": ["a"], "min_possessions": 0},
        {"together": ["a"], "min_games": 0},
        {"together": ["a"], "leverage": True},
        {"together": ["a"], "before_date": "2024-01-01", "lower_date": "2024-01-01"},
    ],
)
def test_invalid_conditions(kwargs: dict) -> None:
    with pytest.raises(ValidationError):
        SharedFloorRequest(team_id="T", **kwargs)


def test_set_predicates_and_exact_units() -> None:
    lineup = ["a", "b", "c", "d", "e"]
    assert lineup_matches(lineup, SharedFloorRequest(team_id="T", together=["a", "b"], apart=["x"]))
    assert not lineup_matches(lineup, SharedFloorRequest(team_id="T", apart=["a"]))
    assert lineup_matches(lineup, SharedFloorRequest(team_id="T", exact_unit=["b", "a"]))
    assert lineup_matches(
        lineup, SharedFloorRequest(team_id="T", exact_unit=list(reversed(lineup)))
    )
    assert not lineup_matches(
        lineup, SharedFloorRequest(team_id="T", exact_unit=["a", "b", "c", "d", "x"])
    )


def test_partitions_reconcile_and_use_directional_denominators() -> None:
    req = SharedFloorRequest(
        team_id="T", together=["a"], apart=["b"], min_games=1, min_possessions=1
    )
    result = aggregate_shared_floor(rows(), req, "wowy", context(), 2)
    assert len(result.partitions) == 4
    assert sum(p.stints for p in result.partitions) == 4
    assert sum(p.seconds for p in result.partitions) == 300
    assert sum(p.offensive_possessions for p in result.partitions) == 26
    assert sum(p.defensive_possessions for p in result.partitions) == 26
    a, b = result.cells
    assert a.stints == 1 and b.stints == 3
    assert a.raw_metrics["offensive_rating"] == pytest.approx(400 / 5.5)
    assert a.raw_metrics["defensive_rating"] == pytest.approx(800 / 6.5)
    shift = result.shifts[0]
    assert shift.difference == pytest.approx(400 / 5.5 - 2600 / 20.5)
    assert shift.interval.lower is None


def test_focal_player_exposure_missing_stats_and_metric_gates() -> None:
    req = SharedFloorRequest(
        team_id="T", together=["a"], player_id="f", min_games=1, min_possessions=1
    )
    result = aggregate_shared_floor(rows(), req, "stat-shift", context(), 2)
    a, b = result.cells
    assert a.seconds == 180 and b.seconds == 60  # Excludes absent focal player's 99 points.
    assert a.raw_metrics["points_per_100"] == 37.5
    assert b.raw_metrics["points_per_100"] is None
    assert b.metric_valid_stints["points_per_100"] == 0
    assert b.metric_denominators["points_per_100"] == 0
    assert next(s for s in result.shifts if s.metric == "points_per_100").difference is None
    assert sum(p.stints for p in result.partitions) == 3


def test_empty_and_minimum_sample_gates() -> None:
    req = SharedFloorRequest(team_id="T", together=["a"])
    result = aggregate_shared_floor(rows(), req, "on-off", context(), 3)
    assert result.coverage_status == "partial"
    assert all(c.sample_status == "insufficient_sample" for c in result.cells)
    assert all(s.difference is None for s in result.shifts)
    assert result.cells[0].raw_metrics["offensive_rating"] is not None
    empty = aggregate_shared_floor([], req, "on-off", context(), 3)
    assert empty.coverage_status == "source_blocked"
    assert empty.cells[0].points is None
    assert empty.cells[0].raw_metrics["offensive_rating"] is None


def test_cluster_interval_independent_math_and_pair_covariance() -> None:
    # Ten games, equal denominators: SE equals sample SD / sqrt(n).
    data = {str(i): (float(i), 100.0) for i in range(10)}
    interval = ratio_interval(data)
    assert interval.lower == pytest.approx(4.5 - 1.959963984540054 * (82.5 / 9 / 10) ** 0.5)
    assert interval.upper == pytest.approx(4.5 + 1.959963984540054 * (82.5 / 9 / 10) ** 0.5)
    paired = difference_interval(data, data)
    assert paired.lower == paired.upper == 0
    assert ratio_interval({"g": (2, 1)}).lower is None


def test_hash_ignores_release_identity_but_binds_prior_facts() -> None:
    req = SharedFloorRequest(team_id="T", together=["a"])
    first = aggregate_shared_floor(rows(), req, "wowy", context(), 2)
    moved = aggregate_shared_floor(
        rows(),
        req.model_copy(update={"release_id": "other"}),
        "wowy",
        replace(context(), release_id="other", dataset_id="other", semantic_signature="future"),
        2,
    )
    assert first.input_hash == moved.input_hash
    assert first.evidence_hash == moved.evidence_hash
    changed = rows()
    changed[0]["points"] = 999
    assert (
        aggregate_shared_floor(changed, req, "wowy", context(), 2).evidence_hash
        != first.evidence_hash
    )


def test_joint_net_rating_interval_accounts_for_covariance() -> None:
    from courtlens.domain.on_off import linear_ratio_interval

    data = {str(i): (float(i), 100.0) for i in range(10)}
    canceled = linear_ratio_interval([(data, 1), (data, -1)])
    assert canceled.lower == canceled.upper == 0
    doubled = linear_ratio_interval([(data, 1), (data, 1)])
    single = ratio_interval(data)
    assert single.lower is not None and single.upper is not None
    assert doubled.lower == pytest.approx(2 * single.lower)
    assert doubled.upper == pytest.approx(2 * single.upper)


def test_production_shifts_gate_on_jointly_valid_exposure() -> None:
    req = SharedFloorRequest(
        team_id="T", together=["a"], player_id="f", min_games=1, min_possessions=10
    )
    data = rows()
    data[0]["stats"] = {}  # Only 5.5 possessions remain valid on the selected side.
    data[2]["stats"] = {"points": 0}
    result = aggregate_shared_floor(data, req, "stat-shift", context(), 2)
    assert result.cells[0].metric_denominators["points_per_100"] == 5.5
    assert result.cells[1].raw_metrics["points_per_100"] == 0
    assert result.cells[0].event_totals["points"] == 2
    assert result.cells[0].event_totals["ast"] is None
    assert next(s for s in result.shifts if s.metric == "points_per_100").difference is None
