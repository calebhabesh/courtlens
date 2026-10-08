from __future__ import annotations

from collections.abc import Iterator
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest
from impact_serving_fixture import make_store
from sqlalchemy.orm import Session
from test_stats_presentation_postgres import facts as stats_facts

from courtlens.config import Settings
from courtlens.domain.query_spec import (
    PagingSpec,
    PredicateGroup,
    PredicateLeaf,
    QuerySpec,
    SortSpec,
)
from courtlens.domain.stats_presentation import StatsPresentation
from courtlens.services.stats_engine import execute_stats_query, export_stats_query
from courtlens.services.workbench_analytics import (
    ResearchQuery,
    ResolvedContext,
    reproduce_investigation,
    resolve_workbench_context,
    save_investigation,
)


@pytest.fixture
def impact_facts() -> Iterator[tuple[Session, ResolvedContext]]:
    yield from stats_facts.__wrapped__()


def test_impact_sql_ranks_filters_and_pages_complete_cohort(
    impact_facts: tuple[Session, ResolvedContext], tmp_path: Path
) -> None:
    session, context = impact_facts
    path, _ = make_store(tmp_path)
    with patch(
        "courtlens.services.impact_serving.get_settings",
        return_value=Settings(impact_serving_manifest=path),
    ):
        cursor = None
        seen = []
        while True:
            query = QuerySpec(
                season="2023-24",
                sort=[SortSpec(field="rapm")],
                page=PagingSpec(limit=1, cursor=cursor),
            )
            items, count, cursor, more = execute_stats_query(
                session, context, query, presentation=StatsPresentation()
            )
            assert count == 4
            seen.extend(item["player_id"] for item in items)
            if items[0]["player_id"] == "a":
                assert items[0]["metrics"]["rapm"] == 2
                assert items[0]["percentiles"]["rapm"] == 67
                assert items[0]["cohort_sample_sizes"]["rapm"] == 3
                assert items[0]["impact_support"]["rapm"]["covered_games"] == 30
            if items[0]["player_id"] == "d":
                assert items[0]["metrics"]["rapm"] is None
                assert items[0]["sample_sizes"]["rapm"] == 0
                assert items[0]["percentiles"]["rapm"] is None
            if not more:
                break
        assert seen == ["a", "c", "b", "d"]
        filtered = QuerySpec(season="2023-24", name="Player C", sort=[SortSpec(field="rapm")])
        rows, count, _, _ = execute_stats_query(
            session, context, filtered, presentation=StatsPresentation()
        )
        assert count == 1 and rows[0]["percentiles"]["rapm"] == 67
        predicate = QuerySpec(
            season="2023-24",
            sort=[SortSpec(field="rapm")],
            predicates=PredicateGroup(predicates=[PredicateLeaf(field="rapm", op="gt", value=0)]),
        )
        assert [r["player_id"] for r in export_stats_query(session, context, predicate)] == [
            "a",
            "c",
        ]


def test_extras_keep_descriptive_values_but_qualified_percentiles(
    impact_facts: tuple[Session, ResolvedContext], tmp_path: Path
) -> None:
    session, context = impact_facts
    path, _ = make_store(tmp_path)
    with patch(
        "courtlens.services.impact_serving.get_settings",
        return_value=Settings(impact_serving_manifest=path),
    ):
        rows, _, _, _ = execute_stats_query(
            session,
            context,
            QuerySpec(season="2023-24", sort=[SortSpec(field="pbp_stl_per100")]),
            presentation=StatsPresentation(),
        )
        by_id = {r["player_id"]: r for r in rows}
        assert by_id["b"]["metrics"]["pbp_stl_per100"] == 2
        assert by_id["b"]["percentiles"]["pbp_stl_per100"] is None
        assert by_id["a"]["percentiles"]["pbp_stl_per100"] == 25
        assert by_id["c"]["percentiles"]["pbp_stl_per100"] == 75


def test_saved_impact_replays_pinned_bundle_after_default_changes(
    workbench_db: Session, tmp_path: Path
) -> None:
    import courtlens.services.workbench_analytics as analytics
    from courtlens.evaluation.impact_rating_inputs import write_artifact

    path, body = make_store(tmp_path / "stores")
    for entry in body["entries"]:
        entry["players"] = {"1630567": entry["players"]["a"]}
    path, _ = write_artifact(path.parent, body)
    settings = Settings(impact_serving_manifest=path)
    context = resolve_workbench_context(
        workbench_db,
        requested_season="2023-24",
        requested_before_date=date(2024, 2, 1),
    )
    with (
        patch("courtlens.services.impact_serving.get_settings", return_value=settings),
        patch.object(analytics, "ARTIFACTS_DIR", tmp_path / "saved"),
    ):
        saved = save_investigation(
            workbench_db,
            context,
            "Pinned CourtLens impact",
            ResearchQuery(
                release_id=context.release_id,
                season="2023-24",
                before_date=context.before_date,
                metrics=["rapm"],
                sort_metric="rapm",
                sort_direction="desc",
                impact_manifest_sha256=path.stem,
            ),
        )
        assert saved.metric_version == "courtlens-stats-v3"
        assert saved.query_json["impact_manifest_sha256"] == path.stem
        body["entries"][0]["players"]["1630567"]["metrics"]["rapm"] = 9
        replacement, _ = write_artifact(path.parent, body)
        with patch(
            "courtlens.services.impact_serving.get_settings",
            return_value=Settings(impact_serving_manifest=replacement),
        ):
            assert reproduce_investigation(workbench_db, saved.id)["reproducible"]


def test_custom_view_can_opt_into_serving_catalog(workbench_db: Session) -> None:
    from courtlens.api.routers.workbench import add_custom_view_endpoint
    from courtlens.api.workbench_schemas import CreateCustomViewRequest
    from courtlens.services.personal_state import get_or_create_workspace

    workspace = get_or_create_workspace(workbench_db)
    updated = add_custom_view_endpoint(
        CreateCustomViewRequest(
            name="Impact",
            columns=["player_name", "rapm", "d_ts", "pbp_blk_per100"],
            sort_field="rapm",
            metric_version="courtlens-stats-v3",
        ),
        workspace_id="default",
        expected_version=workspace.version,
        _auth=None,
        session=workbench_db,
    )
    view = next(view for view in updated.views if view.name == "Impact")
    assert view.metric_version == "courtlens-stats-v3"
    assert not view.unavailable_columns
