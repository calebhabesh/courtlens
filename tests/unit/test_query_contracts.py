"""Unit tests for canonical query, context, and URL serialization contracts (Block B01)."""

from __future__ import annotations

import datetime

import pytest
from pydantic import ValidationError

from courtload.domain.context import (
    CapabilityEntry,
    CapabilityStatus,
    FinalizedResearchContext,
)
from courtload.domain.query_spec import (
    EntityKind,
    PagingSpec,
    PredicateGroup,
    PredicateLeaf,
    PredicateOp,
    QuerySpec,
    SampleFilter,
    SortSpec,
    TeamScope,
    WindowKind,
    WindowSpec,
)
from courtload.domain.query_url import (
    deserialize_params_to_query,
    query_spec_to_research_query,
    research_query_to_query_spec,
    serialize_query_to_params,
    serialize_query_to_url_string,
)


class TestQuerySpecValidation:
    """Test validation and guardrails on canonical QuerySpec."""

    def test_default_query_spec_is_valid(self) -> None:
        query = QuerySpec(season="2025-26", phase="regular_season")
        assert query.season == "2025-26"
        assert query.phase == "regular_season"
        assert query.entity_kind == EntityKind.PLAYER
        assert query.window.kind == WindowKind.SEASON
        assert query.page.limit == 50
        assert query.page.cursor is None
        assert query.sort == [SortSpec(field="pts", direction="desc")]
        assert query.predicates is None

    def test_rejects_unsupported_phase(self) -> None:
        with pytest.raises(ValidationError, match="unsupported phase"):
            QuerySpec(season="2025-26", phase="preseason_draft")

    def test_rejects_more_than_three_sort_fields(self) -> None:
        with pytest.raises(ValidationError, match="maximum 3 sort fields allowed"):
            QuerySpec(
                season="2025-26",
                phase="regular_season",
                sort=[
                    SortSpec(field="pts", direction="desc"),
                    SortSpec(field="ast", direction="desc"),
                    SortSpec(field="reb", direction="desc"),
                    SortSpec(field="stl", direction="desc"),
                ],
            )

    def test_rejects_unknown_sort_field(self) -> None:
        with pytest.raises(ValidationError, match="unsupported sort field"):
            QuerySpec(
                season="2025-26",
                phase="regular_season",
                sort=[SortSpec(field="arbitrary_unregistered_metric", direction="desc")],
            )

    def test_accepts_catalog_and_metadata_sort_fields(self) -> None:
        query = QuerySpec(
            season="2025-26",
            phase="regular_season",
            sort=[
                SortSpec(field="player_name", direction="asc"),
                SortSpec(field="pts", direction="desc"),
            ],
        )
        assert len(query.sort) == 2

    def test_rejects_unknown_predicate_field(self) -> None:
        with pytest.raises(ValidationError, match="unsupported predicate field"):
            PredicateLeaf(field="unknown_super_stat", op=PredicateOp.GTE, value=10)

    def test_rejects_more_than_twelve_leaf_predicates(self) -> None:
        # Construct group with 13 leaf predicates
        leaves = [PredicateLeaf(field="pts", op=PredicateOp.GTE, value=i) for i in range(13)]
        with pytest.raises(ValidationError, match="maximum 12 leaf predicates allowed"):
            QuerySpec(
                season="2025-26",
                phase="regular_season",
                predicates=PredicateGroup(
                    combinator="and",
                    predicates=leaves,
                ),
            )

    def test_accepts_nested_predicates_within_limit(self) -> None:
        group = PredicateGroup(
            combinator="and",
            predicates=[
                PredicateLeaf(field="pts", op=PredicateOp.GTE, value=20),
                PredicateGroup(
                    combinator="or",
                    predicates=[
                        PredicateLeaf(field="ast", op=PredicateOp.GTE, value=5),
                        PredicateLeaf(field="reb", op=PredicateOp.GTE, value=7),
                    ],
                ),
            ],
        )
        query = QuerySpec(season="2025-26", phase="regular_season", predicates=group)
        assert query.predicates is not None

    def test_window_validation_bounds(self) -> None:
        # n must be 1..82
        with pytest.raises(ValidationError, match="greater than or equal to 1"):
            WindowSpec(kind=WindowKind.LAST_N_APPEARANCES, n=0)

        with pytest.raises(ValidationError, match="less than or equal to 82"):
            WindowSpec(kind=WindowKind.LAST_N_APPEARANCES, n=83)

        # date_range from_date <= to_date
        with pytest.raises(ValidationError, match="from_date must be strictly before to_date"):
            WindowSpec(
                kind=WindowKind.DATE_RANGE,
                from_date=datetime.date(2026, 3, 1),
                to_date=datetime.date(2026, 2, 1),
            )


class TestQuerySerializationParity:
    """Test URL serializer/deserializer round trips and snake_case/camelCase parity."""

    def test_camel_case_serialization_and_deserialization(self) -> None:
        query = QuerySpec(
            release_id="rel_20260210_v1",
            season="2025-26",
            phase="regular_season",
            before_date=datetime.date(2026, 2, 10),
            name="LeBron",
            team_scope=TeamScope(team_id="LAL"),
            sample_filters=SampleFilter(min_games=15, min_minutes=200.0),
            sort=[SortSpec(field="pts", direction="desc")],
            page=PagingSpec(limit=25, cursor="cur_abc123"),
        )

        params = serialize_query_to_params(query, style="camelCase")
        assert params["releaseId"] == "rel_20260210_v1"
        assert params["season"] == "2025-26"
        assert params["beforeDate"] == "2026-02-10"
        assert params["teamId"] == "LAL"
        assert params["minGames"] == "15"
        assert params["minMinutes"] == "200.0"
        assert params["sortMetric"] == "pts"
        assert params["cursor"] == "cur_abc123"

        roundtrip = deserialize_params_to_query(params)
        assert roundtrip.release_id == query.release_id
        assert roundtrip.season == query.season
        assert roundtrip.before_date == datetime.date(2026, 2, 10)
        assert roundtrip.name == query.name
        assert roundtrip.team_scope == query.team_scope
        assert roundtrip.sample_filters is not None
        assert roundtrip.sample_filters.min_games == 15
        assert roundtrip.sample_filters.min_minutes == 200.0
        assert roundtrip.page.cursor == "cur_abc123"
        assert roundtrip.page.limit == 25

    def test_snake_case_deserialization_solves_reopened_queries(self) -> None:
        # Saved analyses serialized in snake_case
        snake_params = {
            "release_id": "rel_snapshot_xyz",
            "season": "2024-25",
            "phase": "playoffs",
            "before_date": "2025-05-15",
            "min_games": "8",
            "min_avg_minutes": "28.5",
            "sort_metric": "ast",
            "sort_direction": "asc",
            "cursor": "next_page_cursor_token",
        }

        query = deserialize_params_to_query(snake_params)
        assert query.release_id == "rel_snapshot_xyz"
        assert query.season == "2024-25"
        assert query.phase == "playoffs"
        assert query.before_date == datetime.date(2025, 5, 15)
        assert query.sample_filters is not None
        assert query.sample_filters.min_games == 8
        assert query.sample_filters.min_avg_minutes == 28.5
        assert query.sort[0].field == "ast"
        assert query.sort[0].direction == "asc"
        assert query.page.cursor == "next_page_cursor_token"

    def test_url_string_serialization(self) -> None:
        query = QuerySpec(
            release_id="rel_1",
            season="2025-26",
            phase="regular_season",
            sort=[SortSpec(field="pts", direction="desc")],
        )
        url_str = serialize_query_to_url_string(query)
        assert "releaseId=rel_1" in url_str
        assert "season=2025-26" in url_str
        assert "sortMetric=pts" in url_str

    def test_query_spec_to_legacy_and_back(self) -> None:
        spec = QuerySpec(
            release_id="release-123",
            season="2025-26",
            phase="regular_season",
            before_date=datetime.date(2026, 1, 15),
            team_scope=TeamScope(team_id="BOS"),
            sample_filters=SampleFilter(min_games=10),
            page=PagingSpec(limit=50, cursor="cursor_token"),
            sort=[SortSpec(field="pts", direction="desc")],
        )
        legacy = query_spec_to_research_query(spec)
        assert legacy.release_id == "release-123"
        assert legacy.season == "2025-26"
        assert legacy.team_id == "BOS"
        assert legacy.min_games == 10
        assert legacy.cursor == "cursor_token"

        converted_back = research_query_to_query_spec(legacy)
        assert converted_back.release_id == spec.release_id
        assert converted_back.season == spec.season
        assert converted_back.team_scope == spec.team_scope
        assert converted_back.page.cursor == spec.page.cursor


class TestFinalizedResearchContext:
    """Test context boundary and capability contracts."""

    def test_valid_context_structure(self) -> None:
        ctx = FinalizedResearchContext(
            release_id="rel_20260210_verified",
            snapshot_id="5bbb6035-6794-4bb0-b894-7208f52ef7ad",
            dataset_id="c0a80101-0000-0000-0000-000000000001",
            dataset_type="workbench",
            semantic_signature="sig_12345",
            mode="historical_point_in_time",
            source="sportsdataverse",
            season="2025-26",
            phase="regular_season",
            before_date=datetime.date(2026, 2, 10),
            cutoff_utc="2026-02-11T04:00:00Z",
            window="season",
            coverage_start=datetime.date(2023, 10, 24),
            coverage_end=datetime.date(2026, 6, 13),
            default_before_date=datetime.date(2026, 6, 13),
            capabilities={
                "core_stats": CapabilityEntry(
                    name="core_stats",
                    status=CapabilityStatus.AVAILABLE,
                ),
                "hypothetical": CapabilityEntry(
                    name="hypothetical",
                    status=CapabilityStatus.NOT_IMPLEMENTED,
                ),
            },
        )
        assert ctx.release_id == "rel_20260210_verified"
        assert ctx.capabilities["core_stats"].status == CapabilityStatus.AVAILABLE
        as_dict = ctx.to_dict()
        assert as_dict["release_id"] == "rel_20260210_verified"
        assert as_dict["cutoff_utc"] == "2026-02-11T04:00:00Z"
        assert as_dict["capabilities"]["core_stats"]["status"] == "available"
