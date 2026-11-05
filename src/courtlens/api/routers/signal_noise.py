"""Research → Signal vs Noise (courtlens-signal-noise-v1): read-only served results."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.services import signal_noise
from courtlens.services.workbench_analytics import resolve_workbench_context
from courtlens.workbench_models import WorkbenchIdentity

router = APIRouter(prefix="/signal-noise", tags=["signal vs noise"])
Phase = Literal["regular_season", "playoffs"]


def _results_or_503(value: dict[str, Any] | None) -> dict[str, Any]:
    if value is None:
        raise HTTPException(503, "Signal vs Noise results unavailable")
    return value


@router.get("")
def signal_noise_summary() -> dict[str, Any]:
    return _results_or_503(signal_noise.summary())


@router.get("/shrinkage")
def signal_noise_shrinkage(
    season: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    phase: Phase = "regular_season",
) -> dict[str, Any]:
    return _results_or_503(signal_noise.shrinkage(season, phase))


@router.get("/player")
def signal_noise_player(
    player_id: str | None = Query(None, alias="playerId", max_length=128),
    season: str = Query(signal_noise.EXAMPLE_SEASON, pattern=r"^\d{4}-\d{2}$"),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    context = resolve_workbench_context(session)
    chosen = player_id
    rule = None
    if chosen is None:
        season = signal_noise.EXAMPLE_SEASON
        chosen = signal_noise.default_example_player(session, context.dataset_id)
        rule = signal_noise.EXAMPLE_RULE
        if chosen is None:
            raise HTTPException(404, "No default example player in the published data.")
    example = _results_or_503(
        signal_noise.player_example(session, context.dataset_id, chosen, season)
    )
    name = session.scalar(
        select(WorkbenchIdentity.display_name).where(
            WorkbenchIdentity.kind == "player", WorkbenchIdentity.external_id == chosen
        )
    )
    return {**example, "player_name": name or f"NBA player {chosen}", "selection_rule": rule}
