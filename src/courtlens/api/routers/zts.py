"""Research → zTS (courtlens-zts-validation-v1): read-only served results."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.services import zts
from courtlens.workbench_models import WorkbenchIdentity

router = APIRouter(prefix="/zts", tags=["zts"])
SeasonQuery = Query(zts.LATEST_SEASON, pattern=r"^\d{4}-\d{2}$")
BoardSeason = Query(zts.LATEST_SEASON, pattern=r"^(\d{4}-\d{2}|all)$")
Sort = Literal["zts", "zts_add"]


def _results_or_503(value: dict[str, Any] | None) -> dict[str, Any]:
    if value is None:
        raise HTTPException(503, "zTS results unavailable")
    return value


def _names(session: Session, ids: list[str]) -> dict[str, str]:
    if not ids:
        return {}
    rows = session.execute(
        select(WorkbenchIdentity.external_id, WorkbenchIdentity.display_name).where(
            WorkbenchIdentity.kind == "player", WorkbenchIdentity.external_id.in_(ids)
        )
    ).all()
    return {pid: name for pid, name in rows}


def _named(rows: list[dict[str, Any]], names: dict[str, str]) -> list[dict[str, Any]]:
    return [
        {**row, "player_name": names.get(row["player_id"]) or f"NBA player {row['player_id']}"}
        for row in rows
    ]


@router.get("")
def zts_summary() -> dict[str, Any]:
    return _results_or_503(zts.summary())


@router.get("/leaderboard")
def zts_leaderboard(
    season: str = BoardSeason,
    limit: int = Query(zts.TOP_LIMIT, ge=1, le=1000),
    sort: Sort = "zts",
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    board = _results_or_503(zts.leaderboard(season, limit, sort))
    if board["status"] != "available":
        return board
    names = _names(session, [r["player_id"] for r in board["rows"] + board["unknown"]])
    return {
        **board,
        "rows": _named(board["rows"], names),
        "unknown": _named(board["unknown"], names),
    }


@router.get("/player")
def zts_player(
    player_id: str | None = Query(None, alias="playerId", max_length=128),
    season: str = SeasonQuery,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    chosen = player_id
    rule = None
    if chosen is None:
        chosen = zts.default_player()
        season = zts.LATEST_SEASON
        rule = zts.EXAMPLE_RULE
        if chosen is None:
            raise HTTPException(503, "zTS results unavailable")
    result = _results_or_503(zts.player(chosen, season))
    name = _names(session, [chosen]).get(chosen) or f"NBA player {chosen}"
    return {**result, "player_id": chosen, "player_name": name, "selection_rule": rule}
