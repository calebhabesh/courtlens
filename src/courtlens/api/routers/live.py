"""Live reads: GETs that fetch ESPN on demand when the cached copy is stale (alignment row 7)."""

from datetime import date, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.domain.live import LiveCache
from courtlens.domain.live_history import HistoricalSlate
from courtlens.services.live import read, with_injury_counts
from courtlens.services.live_history import historical_slate
from courtlens.services.live_provider import ESPNLiveProvider
from courtlens.services.workbench_analytics import resolve_workbench_context

router = APIRouter(prefix="/live", tags=["live"])


def get_provider() -> ESPNLiveProvider:
    return ESPNLiveProvider()


@router.get("", response_model=LiveCache)
def live_slate(
    slate_date: date,
    response: Response,
    session: Session = Depends(get_db),
    provider: ESPNLiveProvider = Depends(get_provider),
) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    result = read(session, provider, slate_date)
    games = (result.get("data") or {}).get("games") or []
    if any(game["status"] == "scheduled" for game in games):
        result = with_injury_counts(result, read(session, provider, None))
    return result


@router.get("/games/{game_id}", response_model=LiveCache)
def live_game(
    game_id: str,
    slate_date: date,
    response: Response,
    session: Session = Depends(get_db),
    provider: ESPNLiveProvider = Depends(get_provider),
) -> dict[str, Any]:
    if not game_id.isdigit() or len(game_id) > 20:
        raise HTTPException(422, "Invalid ESPN game ID")
    response.headers["Cache-Control"] = "no-store"
    return read(session, provider, slate_date, game_id)


@router.get("/historical", response_model=HistoricalSlate)
def historical_cache(
    slate_date: date,
    response: Response,
    game_id: str | None = Query(None, pattern=r"^[0-9]{1,20}$"),
    release_id: str | None = Query(None, alias="releaseId"),
    season: str | None = None,
    phase: str = "regular_season",
    before_date: date | None = Query(None, alias="beforeDate"),
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    year = slate_date.year if slate_date.month >= 7 else slate_date.year - 1
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season or f"{year}-{str(year + 1)[-2:]}",
        requested_phase=phase,
        requested_before_date=before_date or slate_date + timedelta(days=1),
    )
    response.headers["Cache-Control"] = "no-store"
    return historical_slate(session, context, slate_date, game_id)
