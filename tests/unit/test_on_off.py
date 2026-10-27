"""Independent partition, denominator, missingness and clustered uncertainty checks."""

from dataclasses import replace
from datetime import date
from typing import Any

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


def shift_rows() -> list[dict]:
    """Two games; focal f with teammate a on and off the floor; every lineup field is known."""

    def stats(fga: int, fta: int, tov: int, points: int, fg3a: int = 0, fg3m: int = 0) -> dict:
        return {"fga": fga, "fta": fta, "tov": tov, "points": points, "fg3a": fg3a, "fg3m": fg3m}

    out = []
    for game in ("g1", "g2", "g3", "g4", "g5", "g6"):
        for together, off in ((True, 30.0), (False, 20.0)):
            lineup = ["a", "f", "x", "y", "z"] if together else ["b", "f", "x", "y", "z"]
            focal = stats(6, 2, 1, 8, 2, 1) if together else stats(6, 4, 2, 10, 3, 1)
            mate = stats(4, 0, 1, 4)
            out.append(
                {
                    "game_id": game,
                    "lineup": lineup,
                    "seconds": 600,
                    "off": off,
                    "def": off,
                    "points": 30,
                    "allowed": 28,
                    "stats": focal,
                    "player_stats": {p: focal if p == "f" else mate for p in lineup},
                    "team_plays": 0.0,
                }
            )
            out[-1]["team_plays"] = sum(
                s["fga"] + 0.44 * s["fta"] + s["tov"] for s in out[-1]["player_stats"].values()
            )
    return out


def test_rate_metrics_are_ratios_of_sums_and_gate_on_the_cells() -> None:
    req = SharedFloorRequest(team_id="T", player_id="f", together=["a"], min_possessions=50)
    result = aggregate_shared_floor(shift_rows(), req, "stat-shift", context(), 6)
    shifts = {s.metric: s for s in result.shifts}
    usage_with = 100 * (6 + 0.88 + 1) / (6 + 0.88 + 1 + 4 * 5)
    assert shifts["usage_pct"].selected_value == pytest.approx(usage_with)
    assert shifts["ts_pct"].selected_value == pytest.approx(100 * 8 / (2 * (6 + 0.88)))
    assert shifts["fg3_pct"].selected_value == pytest.approx(50.0)
    assert shifts["fg3_pct"].complement_value == pytest.approx(100 / 3)
    # Three-point attempts never reach 50, yet the difference shows: the cells pass the gates.
    assert shifts["fg3_pct"].difference == pytest.approx(50.0 - 100 / 3)


def test_rebounds_combine_both_directions_with_one_interval() -> None:
    data = shift_rows()
    for r in data:
        r["stats"] = {**r["stats"], "oreb": 1, "dreb": 2}
    req = SharedFloorRequest(team_id="T", player_id="f", together=["a"], min_possessions=50)
    result = aggregate_shared_floor(data, req, "stat-shift", context(), 6)
    shifts = {s.metric: s for s in result.shifts}
    assert shifts["reb_per_100"].selected_value == pytest.approx(100 * 3 / 30)
    assert shifts["reb_per_100"].complement_value == pytest.approx(100 * 3 / 20)
    assert shifts["reb_per_100"].difference == pytest.approx(
        shifts["oreb_per_100"].difference + shifts["dreb_per_100"].difference
    )


def test_unknown_team_plays_drop_a_stint_from_usage_only() -> None:
    data = shift_rows()
    data[0]["team_plays"] = None
    req = SharedFloorRequest(team_id="T", player_id="f", together=["a"], min_possessions=50)
    result = aggregate_shared_floor(data, req, "stat-shift", context(), 6)
    selected = result.cells[0]
    assert selected.metric_valid_stints["usage_pct"] == 5
    assert selected.metric_valid_stints["ts_pct"] == 6


def test_game_plus_minus_sums_on_floor_margin_and_keeps_unknowns(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from types import SimpleNamespace

    import courtlens.services.on_off as on_off

    def stint(game: str, home: list[str], away: list[str], hp: int, ap: int, **kw: object) -> Any:
        base = dict(
            game_id=game,
            home_lineup_json=home,
            away_lineup_json=away,
            home_points=hp,
            away_points=ap,
            status="valid",
            policy_version="possession-policy-v2",
            duration_seconds=60.0,
            home_possessions=2.0,
            away_possessions=2.0,
        )
        return SimpleNamespace(**(base | kw))

    home, away = ["p", "b", "c", "d", "e"], ["v", "w", "x", "y", "z"]
    bench = ["q", "b", "c", "d", "e"]
    stints = [
        stint("g1", home, away, 10, 4),  # p on, +6
        stint("g1", bench, away, 0, 9),  # p off
        stint("g2", away, home, 3, 5),  # p away side, +2
        stint("g3", home, away, 5, 5, status="rejected"),  # any rejected stint: unknown
        stint("g4", bench, away, 2, 0),  # minutes but never on: unknown
    ]
    session = SimpleNamespace(scalars=lambda _query: SimpleNamespace(all=lambda: stints))
    monkeypatch.setattr(on_off, "stint_dataset_id", lambda _s, _c: "stints")
    games = [("g1", True), ("g2", True), ("g3", True), ("g4", True), ("g5", True)]
    result = on_off.game_plus_minus(session, context(), "p", games)  # type: ignore[arg-type]
    assert result == {"g1": 6, "g2": 2, "g3": None, "g4": None, "g5": None}
    monkeypatch.setattr(on_off, "stint_dataset_id", lambda _s, _c: None)
    assert on_off.game_plus_minus(session, context(), "p", games) == {}  # type: ignore[arg-type]


def test_accepted_stints_include_im03_clean_and_patched() -> None:
    from types import SimpleNamespace

    from courtlens.services.on_off import accepted_stint

    def stint(status: str) -> Any:
        return SimpleNamespace(
            status=status,
            policy_version="possession-policy-v2",
            home_lineup_json=["a", "b", "c", "d", "e"],
            away_lineup_json=["v", "w", "x", "y", "z"],
            duration_seconds=60.0,
            home_possessions=2.0,
            away_possessions=2.0,
        )

    # IM03 marks games needing no repair "clean"; dropping them lost whole games (2026-27).
    assert all(accepted_stint(stint(s)) for s in ("valid", "clean", "patched"))
    assert not accepted_stint(stint("excluded"))
