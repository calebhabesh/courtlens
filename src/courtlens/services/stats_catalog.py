"""Observed release-bound Stats coverage; never changes legacy query defaults."""

from datetime import timedelta
from typing import Any

from sqlalchemy import func, literal, select
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchivePlayerGame
from courtlens.services.stats_engine import COLUMN_MAP
from courtlens.services.workbench_analytics import ResolvedContext, dataset_fingerprint
from courtlens.workbench_models import WorkbenchDataset, WorkbenchPlayerGame

# Coverage of a published ("ready") workbench dataset, cached: recomputing it scanned every season
# on each catalog request. Appended rows change the fingerprint and so the key.
_READY_SCOPES: dict[tuple[Any, ...], list[tuple[Any, ...]]] = {}


def _observed_scopes(session: Session, context: ResolvedContext) -> list[tuple[Any, ...]]:
    model = WorkbenchPlayerGame if context.dataset_type == "workbench" else ArchivePlayerGame
    phase = (
        WorkbenchPlayerGame.phase
        if context.dataset_type == "workbench"
        else literal("regular_season")
    )
    statement = (
        select(model.season, phase, func.min(model.game_date), func.max(model.game_date))
        .where(model.dataset_id == context.dataset_id)
        .group_by(model.season, phase)
        .order_by(model.season, phase)
    )
    if context.dataset_type == "workbench":
        statement = statement.where(WorkbenchPlayerGame.appearance == "appeared")
    key: tuple[Any, ...] = (context.dataset_id, context.semantic_signature)
    if context.dataset_type == "workbench":
        key = (*key, *dataset_fingerprint(session, context.dataset_id))
        if key in _READY_SCOPES:
            return _READY_SCOPES[key]
    rows = [tuple(row) for row in session.execute(statement)]
    dataset = (
        session.get(WorkbenchDataset, context.dataset_id)
        if context.dataset_type == "workbench"
        else None
    )
    if dataset is not None and dataset.status == "ready":
        _READY_SCOPES[key] = rows
    return rows


def stats_catalog_scope(session: Session, context: ResolvedContext) -> dict[str, Any]:
    scopes = [
        {
            "season": season,
            "phase": observed_phase,
            "coverage_start": start.isoformat(),
            "coverage_end": end.isoformat(),
            "default_before_date": (end + timedelta(days=1)).isoformat(),
        }
        for season, observed_phase, start, end in _observed_scopes(session, context)
    ]
    seasons = sorted({scope["season"] for scope in scopes})
    phases = sorted({scope["phase"] for scope in scopes})
    latest = [scope for scope in scopes if scope["season"] == seasons[-1]] if seasons else []
    default = next(
        (scope for scope in latest if scope["phase"] == "regular_season"),
        latest[0] if latest else None,
    )
    return {
        "seasons": seasons,
        "phases": phases,
        "stats_scopes": scopes,
        "default_season": default["season"] if default else context.season,
        "default_phase": default["phase"] if default else context.phase,
        "default_before_date": default["default_before_date"]
        if default
        else context.default_before_date.isoformat(),
        "stats_windows": ["season", "last_10", "last_5"],
        "stats_normalizations": ["per_game", "raw", "per_36"],
        "stats_sort_fields": sorted(COLUMN_MAP),
    }
