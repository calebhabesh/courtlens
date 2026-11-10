"""Research → Six-Factor RAPM: read-only values from the served impact bundle."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.services.six_factor_research import impact_tree, season_page
from courtlens.workbench_models import WorkbenchIdentity

router = APIRouter(prefix="/six-factor", tags=["six factor"])
Season = Query("2025-26", pattern=r"^\d{4}-\d{2}$")
Phase = Literal["regular_season", "playoffs"]


def _names(session: Session, ids: list[str]) -> dict[str, str]:
    rows = session.execute(
        select(WorkbenchIdentity.external_id, WorkbenchIdentity.display_name).where(
            WorkbenchIdentity.kind == "player", WorkbenchIdentity.external_id.in_(ids)
        )
    ).all()
    return {pid: name for pid, name in rows}


def _display(names: dict[str, str], player_id: str) -> str:
    return names.get(player_id) or f"NBA player {player_id}"


@router.get("")
def six_factor_page(
    season: str = Season,
    phase: Phase = "regular_season",
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    page = season_page(season, phase)
    if page is None:
        raise HTTPException(503, "Impact serving unavailable")
    if page["status"] != "available":
        return page
    names = _names(session, [row["player_id"] for row in page["players"]])
    return {
        **page,
        "players": [
            {**row, "player_name": _display(names, row["player_id"])} for row in page["players"]
        ],
    }


@router.get("/tree")
def six_factor_tree(
    player_id: str = Query(..., alias="playerId", max_length=128),
    season: str = Season,
    phase: Phase = "regular_season",
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    tree = impact_tree(player_id, season, phase)
    if tree is None:
        raise HTTPException(404, f"No one-year impact fit is served for {season} {phase}.")
    return {**tree, "player_name": _display(_names(session, [player_id]), player_id)}
