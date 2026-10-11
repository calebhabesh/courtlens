"""Per-date game counts from a release's retained schedule and finals (FO08 Live date strip).

Read-only: no Live demand, provider I/O or publication. Scheduled counts come from the dataset's
retained schedule rows; final counts are distinct admitted final games, the same rows the
historical Live slate reads. Unknown stays unknown: archive datasets retain no schedule, so their
scheduled counts are null rather than zero.
"""

from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchiveTeamGame
from courtlens.services.workbench_analytics import ResolvedContext
from courtlens.workbench_models import WorkbenchSchedule, WorkbenchTeamGame

MAX_RANGE_DAYS = 62


def schedule_dates(
    session: Session,
    context: ResolvedContext,
    start: date,
    end: date,
    *,
    phase: str | None = None,
    before_date: date | None = None,
    focus: date | None = None,
) -> dict[str, Any]:
    if end < start:
        raise HTTPException(422, "end must not precede start")
    if (end - start).days + 1 > MAX_RANGE_DAYS:
        raise HTTPException(422, f"date range exceeds {MAX_RANGE_DAYS} days")

    workbench = context.dataset_type == "workbench"
    team_model = WorkbenchTeamGame if workbench else ArchiveTeamGame
    final_filters: list[Any] = [team_model.dataset_id == context.dataset_id]
    if workbench:
        final_filters.append(WorkbenchTeamGame.is_final.is_(True))
        if phase:
            final_filters.append(WorkbenchTeamGame.phase == phase)
    if before_date is not None:
        final_filters.append(team_model.game_date < before_date)

    schedule_filters: list[Any] = [WorkbenchSchedule.dataset_id == context.dataset_id]
    if phase:
        schedule_filters.append(WorkbenchSchedule.phase == phase)

    # Archive finalized boxes cover the regular season only; other phases are unknown, not zero.
    finals_known = workbench or not phase or phase == "regular_season"
    finals: dict[date, int] = {}
    if finals_known:
        finals = {
            day: count
            for day, count in session.execute(
                select(team_model.game_date, func.count(func.distinct(team_model.game_id)))
                .where(*final_filters, team_model.game_date >= start, team_model.game_date <= end)
                .group_by(team_model.game_date)
            ).all()
        }
    scheduled: dict[date, int] = {}
    if workbench:
        scheduled = {
            day: count
            for day, count in session.execute(
                select(WorkbenchSchedule.game_date, func.count())
                .where(
                    *schedule_filters,
                    WorkbenchSchedule.game_date >= start,
                    WorkbenchSchedule.game_date <= end,
                )
                .group_by(WorkbenchSchedule.game_date)
            ).all()
        }

    days = []
    for offset in range((end - start).days + 1):
        day = start + timedelta(days=offset)
        days.append(
            {
                "date": day,
                "scheduled": scheduled.get(day, 0) if workbench else None,
                "finals": finals.get(day, 0) if finals_known else None,
            }
        )

    def nearest(column: Any, filters: list[Any], anchor: date) -> dict[str, date | None]:
        return {
            "before": session.scalar(select(func.max(column)).where(*filters, column < anchor)),
            "after": session.scalar(select(func.min(column)).where(*filters, column > anchor)),
        }

    anchor = focus or start
    warnings = (
        [] if workbench else ["Archive datasets retain no schedule; scheduled counts are unknown."]
    )
    return {
        "release_id": context.release_id,
        "dataset_id": context.dataset_id,
        "start": start,
        "end": end,
        "phase": phase,
        "before_date": before_date,
        "focus": anchor,
        "days": days,
        "nearest_scheduled": nearest(WorkbenchSchedule.game_date, schedule_filters, anchor)
        if workbench
        else {"before": None, "after": None},
        "nearest_finals": nearest(team_model.game_date, final_filters, anchor)
        if finals_known
        else {"before": None, "after": None},
        "warnings": warnings,
    }
