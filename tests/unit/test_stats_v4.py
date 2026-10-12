"""courtlens-stats-v4 additions and position estimates (Databallr alignment, Stats row 1)."""

from __future__ import annotations

import json
import math
import sqlite3
from datetime import date
from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest
from fastapi import HTTPException

from courtlens.api.routers.workbench import get_metrics
from courtlens.config import Settings
from courtlens.domain.query_spec import QuerySpec, TeamScope, WindowSpec
from courtlens.domain.stats_v4_catalog import STATS_V4_CATALOG
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.evaluation.position_estimates import (
    FEATURES,
    POSITIONS,
    Sample,
    allowed_mask,
    bounded,
    estimate,
    feature_matrix,
)
from courtlens.services import position_estimates
from courtlens.services.impact_serving import derive_extras
from courtlens.services.stats_engine import (
    _offensive_load_sql,
    tracking_applies,
    tracking_query_fields,
)
from courtlens.services.workbench_analytics import ResolvedContext


def test_v4_catalog_extends_v3_without_changing_it() -> None:
    v3 = {m.key for m in get_metrics("courtlens-stats-v3").metrics}
    v4 = {m.key for m in get_metrics("courtlens-stats-v4").metrics}
    assert v3 < v4
    assert not v3 & set(STATS_V4_CATALOG)
    assert set(STATS_V4_CATALOG) == v4 - v3
    assert {"fg2_pct", "fg3a_per_game", "ctov_pct", "on_ball_pct", "pts_created_per_game"} <= v4


def test_rim_assist_rates_come_from_sealed_support() -> None:
    row = {
        "metrics": {"pbp_rim_assists": 61.0},
        "support": {
            "pbp_rim_assists": {"numerator": 61.0, "covered_games": 16, "qualified": True},
            "impact_ast_per100": {"denominator": 1184.0, "qualified": False},
        },
    }
    derive_extras(row)
    assert row["metrics"]["rim_ast_per_game"] == pytest.approx(61 / 16)
    assert row["metrics"]["rim_ast_per100"] == pytest.approx(100 * 61 / 1184)
    # Per-100 rates qualify only with enough possessions; per-game follows the count.
    assert row["support"]["rim_ast_per_game"]["qualified"] is True
    assert row["support"]["rim_ast_per100"]["qualified"] is False
    assert row["support"]["ctov_pct"]["qualified"] is False


def test_rim_assist_rates_are_unknown_without_support() -> None:
    row: dict = {"metrics": {}, "support": {}}
    derive_extras(row)
    assert row == {"metrics": {}, "support": {}}


def test_offensive_load_and_ctov_match_taylors_formula() -> None:
    db = sqlite3.connect(":memory:")
    db.execute(
        "CREATE TABLE aggregated_impact (player_id, ast, pts, tov, fga, fta, fg3a, fg3m, "
        "total_minutes, pbp_rim_assists, impact_support)"
    )
    support = json.dumps({"impact_ast_per100": {"denominator": 4000.0}})
    db.execute(
        "INSERT INTO aggregated_impact VALUES ('x', 530, 2144, 256, 1400, 650, 690, 250, "
        "2289, 61, ?), ('none', 1, 1, 1, 1, 1, 1, 1, 0, NULL, '{}')",
        (support,),
    )
    rows = db.execute(
        "WITH r AS (" + _offensive_load_sql(True) + ") "
        "SELECT player_id, offensive_load, ctov_pct, rim_ast_per_36 FROM r ORDER BY player_id"
    ).fetchall()
    per = {k: 100 * v / 4000 for k, v in {"a": 530, "p": 2144, "t": 256, "fga": 1400}.items()}
    fta, three = 100 * 650 / 4000, 100 * 690 / 4000
    p3 = (2 / (1 + math.exp(-three)) - 1) * 250 / 690
    bc = (
        per["a"] * 0.1843
        + (per["p"] + per["t"]) * 0.0969
        - 2.3021 * p3
        + 0.0582 * per["a"] * (per["p"] + per["t"]) * p3
        - 1.1942
    )
    load = (per["a"] - 0.38 * bc) * 0.75 + per["fga"] + 0.44 * fta + bc + per["t"]
    assert rows[1] == ("x", round(load, 1), round(per["t"] / load, 4), round(36 * 61 / 2289, 1))
    assert rows[0] == ("none", None, None, None)


def context() -> ResolvedContext:
    return ResolvedContext(
        release_id="r",
        snapshot_id="r",
        dataset_id="d",
        dataset_type="workbench",
        semantic_signature="s",
        mode="test",
        source="test",
        season="2025-26",
        phase="regular_season",
        before_date=date(2026, 6, 14),
        cutoff_utc="2026-06-14T00:00:00Z",
        window="season",
        coverage_start=None,
        coverage_end=None,
        default_before_date=None,
        supported_dates=[],
        published_at=None,
        warnings=[],
    )


def test_tracking_joins_only_whole_unfiltered_seasons() -> None:
    season = QuerySpec(season="2025-26", view_state={"columns": ["on_ball_pct", "pts"]})
    assert tracking_query_fields(season) == {"on_ball_pct"}
    assert tracking_applies(context(), season)
    assert not tracking_applies(
        context(), season.model_copy(update={"window": WindowSpec(kind="last_10")})
    )
    assert not tracking_applies(
        context(), season.model_copy(update={"team_scope": TeamScope(team_id="BOS")})
    )


def sample(pid: str, listed: str, height: float, ast: float, reb: float, blk: float) -> Sample:
    totals = {
        "ast": ast,
        "oreb": reb / 3,
        "dreb": reb,
        "blk": blk,
        "stl": 50,
        "fg3a": 200,
        "fta": 150,
        "pts": 1000,
    }
    return Sample("2025-26", pid, 2000.0, listed, height, 200.0 + height, totals)


def test_rates_shrink_toward_listed_group_for_small_samples() -> None:
    big = sample("big", "G", 75, 500, 200, 10)
    small = Sample("2025-26", "small", 10.0, "G", 75, 190, {f: 0.0 for f in big.totals})
    x = feature_matrix([big, small])
    ast = FEATURES.index("ast")
    # 10 scoreless minutes still look like the group's rate, not zero.
    assert x[1, ast] == pytest.approx(36 * 300 * 500 / 2010 / 310, rel=1e-6)
    assert x[0, ast] > 0


def test_estimate_separates_positions_and_reports_grouped_evaluation() -> None:
    rng = np.random.default_rng(0)
    profiles = {
        "PG": ("G", 74, 600, 250, 10),
        "SG": ("G", 77, 300, 300, 15),
        "SF": ("F", 79, 220, 400, 30),
        "PF": ("F", 81, 180, 600, 60),
        "C": ("C", 84, 150, 800, 120),
    }
    samples, labels = [], {}
    for position, (listed, height, ast, reb, blk) in profiles.items():
        for i in range(12):
            pid = f"{position}-{i}"
            jitter = rng.normal(1, 0.05, 3)
            samples.append(
                sample(pid, listed, height, ast * jitter[0], reb * jitter[1], blk * jitter[2])
            )
            labels[pid] = position
    result = estimate(samples, labels)
    assert result["evaluation"]["model"]["accuracy"] >= 0.9
    assert result["evaluation"]["model"]["players"] == 60
    season = result["seasons"]["2025-26"]
    assert {season[f"{p}-0"]["position"] for p in POSITIONS} == set(POSITIONS)
    assert all(abs(sum(row["probabilities"]) - 1) < 0.01 for row in season.values())


def test_position_service_reads_a_verified_artifact(tmp_path: Path) -> None:
    body = {
        "version": position_estimates.VERSION,
        "seasons": {"2025-26": {"1": {"position": "PG"}, "2": {"position": "C"}}},
    }
    path, _ = write_artifact(tmp_path, body)
    with patch(
        "courtlens.services.position_estimates.get_settings",
        return_value=Settings(position_estimates_manifest=path),
    ):
        assert position_estimates.season_positions("2025-26") == {"1": "PG", "2": "C"}
        assert position_estimates.position_player_ids("2025-26", ["C", "SF"]) == {"2"}
        assert position_estimates.season_positions("2023-24") == {}
    tampered = tmp_path / path.name
    tampered.write_text(json.dumps({**body, "seasons": {}}))
    with (
        patch(
            "courtlens.services.position_estimates.get_settings",
            return_value=Settings(position_estimates_manifest=tampered),
        ),
        pytest.raises(HTTPException),
    ):
        position_estimates.season_positions("2025-26")


def test_listing_bounds_the_estimate() -> None:
    mask = allowed_mask(["C", "G-F", "F", None])
    assert mask.tolist() == [
        [False, False, False, False, True],
        [True, True, True, True, False],
        [False, False, True, True, False],
        [True, True, True, True, True],
    ]
    # A listed center is never estimated as a forward, however guard-like the rates.
    probs = bounded(np.asarray([[0.1, 0.1, 0.1, 0.6, 0.1]]), mask[:1])
    assert probs.tolist() == [[0.0, 0.0, 0.0, 0.0, 1.0]]


def _row(pid: str, name: str, **metrics: object) -> dict:
    support = metrics.pop("support", {})
    return {"player_id": pid, "player_name": name, "metrics": metrics, "impact_support": support}


def test_cached_cohorts_sort_like_sql() -> None:
    from courtlens.domain.query_spec import SortSpec
    from courtlens.services.stats_cohort_cache import sort_rows

    rows = [
        _row("3", "Aaron", ast_per_game=5.0, bpr=2.0, support={"bpr": {"qualified": False}}),
        _row("1", "AJ", ast_per_game=None, bpr=1.0, support={"bpr": {"qualified": True}}),
        _row("2", "Zed", ast_per_game=5.0, bpr=3.0, support={"bpr": {"qualified": True}}),
    ]
    ids = lambda sort: [r["player_id"] for r in sort_rows(rows, sort)]  # noqa: E731
    # Ties break by player_id; unknown values sort last unless declared otherwise.
    assert ids([SortSpec(field="ast_per_game")]) == ["2", "3", "1"]
    assert ids([SortSpec(field="ast_per_game", nulls_last=False)]) == ["1", "2", "3"]
    # An unqualified impact value orders as unknown, as the SQL CASE does.
    assert ids([SortSpec(field="bpr")]) == ["2", "1", "3"]
    # Code-point name order matches the database's C collation.
    assert ids([SortSpec(field="player_name", direction="asc")]) == ["1", "3", "2"]


def test_views_and_sorts_of_one_scope_share_a_cohort() -> None:
    from courtlens.services.stats_cohort_cache import cohort_query

    overview = QuerySpec(
        season="2025-26", view_state={"columns": ["bpr", "pts_per_game"]}, sort=[{"field": "pts"}]
    )
    impact = QuerySpec(season="2025-26", view_state={"columns": ["rapm"]}, sort=[{"field": "rapm"}])
    box = QuerySpec(season="2025-26", view_state={"columns": ["reb_per_game"]})
    assert cohort_query(overview) == cohort_query(impact)
    assert cohort_query(box) != cohort_query(overview)
    assert cohort_query(box).view_state is None
