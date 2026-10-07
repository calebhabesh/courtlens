"""Observed release-bound Stats coverage; never changes legacy query defaults."""

from datetime import timedelta
from typing import Any

from sqlalchemy import func, literal, select
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchivePlayerGame
from courtlens.services.stats_engine import COLUMN_MAP
from courtlens.services.workbench_analytics import ResolvedContext
from courtlens.workbench_models import WorkbenchPlayerGame


def stats_catalog_scope(session: Session, context: ResolvedContext) -> dict[str, Any]:
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
    scopes = [
        {
            "season": season,
            "phase": observed_phase,
            "coverage_start": start.isoformat(),
            "coverage_end": end.isoformat(),
            "default_before_date": (end + timedelta(days=1)).isoformat(),
        }
        for season, observed_phase, start, end in session.execute(statement)
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
