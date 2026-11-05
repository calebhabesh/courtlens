"""Research → Defensive Shot Quality (courtlens-defensive-shot-quality-v1): read-only results."""

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from courtlens.api.routers.shot_quality import _names
from courtlens.database import get_db
from courtlens.services import defensive_shot_quality as service

router = APIRouter(prefix="/defensive-shot-quality", tags=["defensive-shot-quality"])
SeasonQuery = Query(service.LATEST_SEASON, pattern=r"^\d{4}-\d{2}$")


def _or_503(value: dict[str, Any] | None) -> dict[str, Any]:
    if value is None:
        raise HTTPException(503, "Defensive Shot Quality results unavailable")
    return value


@router.get("")
def summary() -> dict[str, Any]:
    return _or_503(service.summary())


@router.get("/cards")
def cards(
    season: str = SeasonQuery,
    kind: Literal["all", "2pt", "3pt"] = "all",
    sort: Literal["dsq", "rapm", "fga", "xpps", "pps"] = "dsq",
    team: str | None = Query(None, max_length=16),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    board = _or_503(service.cards(season, kind, sort, team))
    if board["status"] != "available":
        return board
    ids = {row["player_id"] for row in board["rows"]}
    ids |= {m["player_id"] for row in board["rows"] for m in row["key_matchups"]}
    ids |= {row["player_id"] for row in board["unknown"]}
    names = _names(session, sorted(ids))

    def name(pid: str) -> str:
        return names.get(pid) or f"NBA player {pid}"

    return {
        **board,
        "rows": [
            {
                **row,
                "player_name": name(row["player_id"]),
                "key_matchups": [
                    {**m, "player_name": name(m["player_id"])} for m in row["key_matchups"]
                ],
            }
            for row in board["rows"]
        ],
        "unknown": [{**row, "player_name": name(row["player_id"])} for row in board["unknown"]],
    }
