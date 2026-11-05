"""Research → Shot Quality (courtlens-expected-shot-v2): read-only served results."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.services import shot_decomposition, shot_quality
from courtlens.workbench_models import WorkbenchIdentity

router = APIRouter(prefix="/shot-quality", tags=["shot-quality"])
SeasonQuery = Query(shot_quality.LATEST_SEASON, pattern=r"^\d{4}-\d{2}$")
Sort = Literal["shot_making", "xpps", "pps", "fga"]


def _results_or_503(value: dict[str, Any] | None) -> dict[str, Any]:
    if value is None:
        raise HTTPException(503, "Shot Quality results unavailable")
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


@router.get("/decomposition")
def shot_decomposition_summary() -> dict[str, Any]:
    return _results_or_503(shot_decomposition.summary())


@router.get("/decomposition/players")
def shot_decomposition_players(
    season: str = SeasonQuery,
    side: Literal["offense", "defense", "combined"] = "offense",
    sort: Literal["ts", "sq", "make", "ft", "shots"] = "ts",
    team: str | None = Query(None, max_length=16),
    min_shots: int = Query(shot_decomposition.DEFAULT_MIN_SHOTS, alias="minShots", ge=0, le=20000),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    board = _results_or_503(shot_decomposition.board(season, side, sort, team, min_shots))
    if board["status"] != "available":
        return board
    names = _names(session, [r["player_id"] for r in board["rows"] + board["unknown"]])
    return {
        **board,
        "rows": _named(board["rows"], names),
        "unknown": _named(board["unknown"], names),
    }


@router.get("")
def shot_quality_summary() -> dict[str, Any]:
    return _results_or_503(shot_quality.summary())


@router.get("/players")
def shot_quality_players(
    season: str = SeasonQuery,
    sort: Sort = "shot_making",
    team: str | None = Query(None, max_length=16),
    min_fga: int = Query(shot_quality.DEFAULT_MIN_FGA, alias="minFga", ge=0, le=3000),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    board = _results_or_503(shot_quality.leaderboard(season, sort, team, min_fga))
    if board["status"] != "available":
        return board
    names = _names(session, [r["player_id"] for r in board["rows"] + board["unknown"]])
    return {
        **board,
        "rows": _named(board["rows"], names),
        "unknown": _named(board["unknown"], names),
    }


@router.get("/player")
def shot_quality_player(
    player_id: str | None = Query(None, alias="playerId", max_length=128),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    chosen = player_id
    rule = None
    if chosen is None:
        chosen = shot_quality.default_player()
        rule = shot_quality.EXAMPLE_RULE
        if chosen is None:
            raise HTTPException(503, "Shot Quality results unavailable")
    result = _results_or_503(shot_quality.player(chosen))
    name = _names(session, [chosen]).get(chosen) or f"NBA player {chosen}"
    return {**result, "player_id": chosen, "player_name": name, "selection_rule": rule}
