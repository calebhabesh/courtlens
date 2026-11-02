"""Stored Stats cohort keys bind every source and the serving code (stats_cohort_store)."""

from __future__ import annotations

from datetime import date
from unittest.mock import patch

from courtlens.domain.query_spec import (
    PredicateGroup,
    PredicateLeaf,
    QuerySpec,
    SampleFilter,
    TeamScope,
    ViewState,
    WindowSpec,
)
from courtlens.services import stats_cohort_store
from courtlens.services.stats_cohort_store import carries_table_ranks, entry_key
from courtlens.services.workbench_analytics import ResolvedContext

CONTEXT = ResolvedContext(
    release_id="r",
    snapshot_id="r",
    dataset_id="d",
    dataset_type="workbench",
    semantic_signature="s",
    mode="test",
    source="test",
    season="2025-26",
    phase="regular_season",
    before_date=date(2026, 4, 13),
    cutoff_utc="2026-04-13T04:00:00+00:00",
    window="season",
    coverage_start=date(2025, 10, 21),
    coverage_end=date(2026, 4, 12),
    default_before_date=date(2026, 4, 13),
    supported_dates=[],
    published_at=None,
    warnings=[],
)
FACTS = {
    "dataset": [880000, "2026-04-12"],
    "names": [2770, "n1"],
    "tracking": {"2025-26:regular_season": "t1", "2024-25:regular_season": "t0"},
}
TRACKED = QuerySpec(
    season="2025-26", phase="regular_season", view_state=ViewState(columns=["on_ball_pct"])
)
BOX = QuerySpec(season="2025-26", phase="regular_season")


def changed(**facts: object) -> dict[str, object]:
    return {**FACTS, **facts}


def test_keys_bind_rows_names_and_the_joined_tracking_feed() -> None:
    key = entry_key(FACTS, CONTEXT, TRACKED, "scope")
    assert entry_key(FACTS, CONTEXT, TRACKED, "scope") == key
    assert entry_key(FACTS, CONTEXT, TRACKED, "other") != key
    assert entry_key(changed(dataset=[880001, "2026-04-12"]), CONTEXT, TRACKED, "scope") != key
    assert entry_key(changed(names=[2770, "n2"]), CONTEXT, TRACKED, "scope") != key
    tracking = {"2025-26:regular_season": "t2", "2024-25:regular_season": "t0"}
    assert entry_key(changed(tracking=tracking), CONTEXT, TRACKED, "scope") != key
    # Another season's feed, or a view without tracking columns, keeps the key.
    other_season = {"2025-26:regular_season": "t1", "2024-25:regular_season": "t9"}
    assert entry_key(changed(tracking=other_season), CONTEXT, TRACKED, "scope") == key
    box = entry_key(FACTS, CONTEXT, BOX, "scope")
    assert entry_key(changed(tracking=tracking), CONTEXT, BOX, "scope") == box


def test_keys_bind_the_serving_code() -> None:
    key = entry_key(FACTS, CONTEXT, BOX, "scope")
    stats_cohort_store.engine_fingerprint.cache_clear()
    real_open = open

    def edited(path: str, mode: str = "r"):  # type: ignore[no-untyped-def]
        handle = real_open(path, mode)
        if path.endswith("table_percentiles.py"):
            return _Appended(handle)
        return handle

    try:
        with patch("builtins.open", edited):
            assert entry_key(FACTS, CONTEXT, BOX, "scope") != key
    finally:
        stats_cohort_store.engine_fingerprint.cache_clear()
    assert entry_key(FACTS, CONTEXT, BOX, "scope") == key


class _Appended:
    """A source file read with one extra line, as after an edit."""

    def __init__(self, handle) -> None:  # type: ignore[no-untyped-def]
        self.handle = handle

    def __enter__(self) -> _Appended:
        return self

    def __exit__(self, *exc: object) -> None:
        self.handle.close()

    def read(self) -> bytes:
        return bytes(self.handle.read()) + b"\n# edited\n"


def test_only_whole_season_league_scopes_carry_table_ranks() -> None:
    assert carries_table_ranks(BOX)
    assert not carries_table_ranks(BOX.model_copy(update={"window": WindowSpec(kind="last_10")}))
    assert not carries_table_ranks(BOX.model_copy(update={"team_scope": TeamScope(team_id="TOR")}))
    assert not carries_table_ranks(
        BOX.model_copy(update={"sample_filters": SampleFilter(min_games=10)})
    )
    predicate = PredicateGroup(predicates=[PredicateLeaf(field="pts", op="gt", value=1)])
    assert not carries_table_ranks(BOX.model_copy(update={"predicates": predicate}))


def test_sort_ties_and_unknown_columns_fall_back_to_minutes() -> None:
    from courtlens.domain.query_spec import QuerySpec, SortSpec, ViewState
    from courtlens.services.stats_cohort_cache import empty_fields, sort_rows

    def row(pid: str, minutes: float | None, dpm: float | None = None) -> dict[str, object]:
        return {
            "player_id": pid,
            "player_name": pid,
            "total_minutes": minutes,
            "metrics": {"dpm": dpm, "on_ball_pct": None, "pts": 1.0},
        }

    rows = [row("1", 10), row("2", None), row("3", 120), row("4", 40, dpm=1.5)]
    order = [r["player_id"] for r in sort_rows(rows, [SortSpec(field="dpm")])]
    assert order == ["4", "3", "1", "2"]
    ascending = sort_rows(rows, [SortSpec(field="min", direction="asc")])
    assert [r["player_id"] for r in ascending] == ["1", "4", "3", "2"]

    view = ViewState(columns=["dpm", "on_ball_pct", "pts", "not_computed"])
    assert empty_fields(rows, QuerySpec(view_state=view, sort=[SortSpec(field="pts")])) == [
        "on_ball_pct"
    ]
    # The sorted column stays, and an empty scope hides nothing.
    assert (
        empty_fields(rows, QuerySpec(view_state=view, sort=[SortSpec(field="on_ball_pct")])) == []
    )
    assert empty_fields([], QuerySpec(view_state=view)) == []
