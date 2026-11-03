from __future__ import annotations

from copy import deepcopy
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from impact_serving_fixture import make_store

from courtlens.api.routers.workbench import get_metrics
from courtlens.config import Settings
from courtlens.domain.impact_catalog import IMPACT_CATALOG
from courtlens.domain.metrics import list_metric_definitions
from courtlens.domain.query_spec import QuerySpec, SortSpec, TeamScope, WindowSpec
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.services.impact_serving import impact_for_query, load_impact_store
from courtlens.services.stats_engine import impact_query_binding
from courtlens.services.workbench_analytics import ResolvedContext


def test_content_address_rejects_tamper_after_cached_read(tmp_path: Path) -> None:
    path, _ = make_store(tmp_path)
    with patch(
        "courtlens.services.impact_serving.get_settings",
        return_value=Settings(impact_serving_manifest=path),
    ):
        assert load_impact_store()
        path.write_bytes(path.read_bytes().replace(b'"rapm":2.0', b'"rapm":9.0'))
        with pytest.raises(HTTPException, match="503"):
            load_impact_store()


@pytest.mark.parametrize(
    "cutoff, expected",
    [("2024-01-31", "unavailable"), ("2024-02-01", "available"), ("2024-07-01", "available")],
)
def test_exclusive_selected_game_cutoff(tmp_path: Path, cutoff: str, expected: str) -> None:
    path, _ = make_store(tmp_path)
    with patch(
        "courtlens.services.impact_serving.get_settings",
        return_value=Settings(impact_serving_manifest=path),
    ):
        assert impact_for_query(QuerySpec(season="2023-24"), cutoff)["status"] == expected
        assert (
            impact_for_query(QuerySpec(season="2023-24", phase="playoffs"), cutoff)["status"]
            == "unavailable"
        )


def test_short_window_and_absent_store_are_explicit(tmp_path: Path) -> None:
    path, _ = make_store(tmp_path)
    with patch(
        "courtlens.services.impact_serving.get_settings",
        return_value=Settings(impact_serving_manifest=path),
    ):
        result = impact_for_query(
            QuerySpec(season="2023-24", window=WindowSpec(kind="last_10")), "2024-07-01"
        )
        assert result["status"] == "unavailable" and not result["players"]
    with patch(
        "courtlens.services.impact_serving.get_settings",
        return_value=Settings(impact_serving_manifest=None),
    ):
        assert impact_for_query(QuerySpec(), "2026-07-01")["status"] == "unavailable"


def test_traded_onoff_and_team_filtered_extras_never_pool(tmp_path: Path) -> None:
    path, _ = make_store(tmp_path)
    with patch(
        "courtlens.services.impact_serving.get_settings",
        return_value=Settings(impact_serving_manifest=path),
    ):
        result = impact_for_query(QuerySpec(season="2023-24"), "2024-02-01")
        assert result["players"]["a"]["metrics"]["onoff_net_rating"] == 10
        assert "onoff_net_rating" not in result["players"]["c"]["metrics"]
        assert len(result["players"]["c"]["on_off"]) == 2
        selected = impact_for_query(
            QuerySpec(season="2023-24", team_scope=TeamScope(team_id="TOR")), "2024-02-01"
        )
        assert selected["players"]["c"]["metrics"]["onoff_net_rating"] == 10
        assert "pbp_stl_per100" not in selected["players"]["a"]["metrics"]
        assert selected["players"]["a"]["metrics"]["rapm"] == 2


def test_future_artifacts_do_not_change_prior_binding(tmp_path: Path) -> None:
    path, body = make_store(tmp_path)
    query = QuerySpec(season="2023-24", sort=[SortSpec(field="rapm")])
    context = ResolvedContext(
        release_id="r",
        snapshot_id="r",
        dataset_id="d",
        dataset_type="workbench",
        semantic_signature="s",
        mode="test",
        source="test",
        season="2023-24",
        phase="regular_season",
        before_date=date(2024, 2, 1),
        cutoff_utc="2024-02-01T00:00:00Z",
        window="season",
        coverage_start=date(2024, 1, 1),
        coverage_end=date(2024, 1, 31),
        default_before_date=date(2024, 2, 1),
        supported_dates=[],
        published_at=None,
        warnings=[],
    )
    with patch(
        "courtlens.services.impact_serving.get_settings",
        return_value=Settings(impact_serving_manifest=path),
    ):
        before = impact_query_binding(context, query)
    future = deepcopy(body["entries"][0])
    future["sha256"] = "future"
    future["scope"]["last_included_date"] = "2024-02-01"
    body["entries"].append(future)
    later, _ = write_artifact(tmp_path, body)
    with patch(
        "courtlens.services.impact_serving.get_settings",
        return_value=Settings(impact_serving_manifest=later),
    ):
        assert impact_query_binding(context, query) == before


def test_serving_catalog_extends_and_preserves_explicit_versions() -> None:
    assert set(IMPACT_CATALOG).issubset({m.key for m in get_metrics("courtlens-stats-v3").metrics})
    for version in ("v1", "v2"):
        assert [m.model_dump() for m in get_metrics(version).metrics] == [
            m.to_dict() for m in list_metric_definitions(version)
        ]


def test_retired_play_type_analogues_never_leave_the_server(tmp_path: Path) -> None:
    """Owner, 2026-10-13: sealed extras still carry the bucket analogues; nothing serves them."""
    from courtlens.domain.impact_extras_catalog import IMPACT_EXTRAS_CATALOG, RETIRED_METRICS
    from courtlens.domain.personal_state import CustomViewDefinition

    assert len(RETIRED_METRICS) == 24 and IMPACT_EXTRAS_CATALOG.keys() >= RETIRED_METRICS
    assert not RETIRED_METRICS & IMPACT_CATALOG.keys()
    assert not RETIRED_METRICS & {m.key for m in get_metrics("courtlens-stats-v4").metrics}
    _, body = make_store(tmp_path / "base")
    extras = deepcopy(body)
    for row in extras["entries"][1]["players"].values():
        row["metrics"]["pbp_create_ts"] = 1.3
        row["support"]["pbp_create_ts"] = {"qualified": True}
    path, _ = write_artifact(tmp_path, extras)
    with patch(
        "courtlens.services.impact_serving.get_settings",
        return_value=Settings(impact_serving_manifest=path),
    ):
        player = impact_for_query(QuerySpec(season="2023-24"), "2024-02-01")["players"]["a"]
    assert "pbp_create_ts" not in player["metrics"] and "pbp_create_ts" not in player["support"]
    assert player["metrics"]["pbp_stl_per100"] == 1
    saved = CustomViewDefinition.model_validate(
        {
            "name": "Old",
            "metric_version": "courtlens-stats-v4",
            "columns": ["pts_per_game", "pbp_create_ts"],
            "sort_field": "pbp_create_ts",
        }
    )
    assert saved.columns == ["pts_per_game"] and saved.sort_field is None


@pytest.mark.parametrize("configured", [True, False])
def test_query_binding_artifacts_equal_the_full_selection(tmp_path: Path, configured: bool) -> None:
    """impact_artifacts skips assembling player values but selects exactly impact_for_query's."""
    from courtlens.domain.query_spec import SeasonScope
    from courtlens.services.impact_serving import impact_artifacts

    path, _ = make_store(tmp_path)
    queries = [
        QuerySpec(season="2023-24"),
        QuerySpec(season="2023-24", phase="playoffs"),
        QuerySpec(season="2024-25"),
        QuerySpec(season="2023-24", team_scope=TeamScope(team_id="TOR")),
        QuerySpec(season="2023-24", window=WindowSpec(kind="last_10")),
        QuerySpec(
            season="2023-24",
            season_scope=SeasonScope(seasons=["2022-23", "2023-24"], aggregate_multi_season=True),
        ),
    ]
    with patch(
        "courtlens.services.impact_serving.get_settings",
        return_value=Settings(impact_serving_manifest=path if configured else None),
    ):
        for query in queries:
            for cutoff in ("2024-01-31", "2024-02-01", "2024-07-01"):
                full = impact_for_query(query, cutoff)
                assert impact_artifacts(query, cutoff) == (full["artifacts"], full["status"])
