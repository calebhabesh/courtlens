"""Live GETs only read cache. Protected mutations express bounded view demand."""

from datetime import date, timedelta
from typing import Any
from urllib.parse import urlsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from courtload.api.routers.workbench import verify_workspace_operator_access
from courtload.config import get_settings
from courtload.database import get_db
from courtload.domain.live import LiveCache, LiveLeaseResult, LiveSubscription
from courtload.domain.live_history import HistoricalSlate
from courtload.services.live import cached, release, subscribe
from courtload.services.live_history import historical_slate
from courtload.services.workbench_analytics import resolve_workbench_context

router = APIRouter(prefix="/live", tags=["live"])


def protect_demand(request: Request) -> None:
    origin = request.headers.get("origin")
    if origin:
        parsed = urlsplit(origin)
        if origin not in get_settings().cors_origins and (
            parsed.netloc != request.headers.get("host") or parsed.scheme not in {"http", "https"}
        ):
            raise HTTPException(403, "Cross-origin Live demand rejected")


@router.get("", response_model=LiveCache)
def live_cache(
    slate_date: date, response: Response, session: Session = Depends(get_db)
) -> dict[str, Any]:
    response.headers["Cache-Control"] = "no-store"
    return cached(session, slate_date, enabled=get_settings().live_enabled)


@router.get("/games/{game_id}", response_model=LiveCache)
def game_cache(
    game_id: str, slate_date: date, response: Response, session: Session = Depends(get_db)
) -> dict[str, Any]:
    if not game_id.isdigit() or len(game_id) > 20:
        raise HTTPException(422, "Invalid ESPN game ID")
    response.headers["Cache-Control"] = "no-store"
    return cached(session, slate_date, game_id, enabled=get_settings().live_enabled)


@router.post(
    "/subscriptions",
    response_model=LiveLeaseResult,
    dependencies=[Depends(verify_workspace_operator_access), Depends(protect_demand)],
)
def activate(payload: LiveSubscription, session: Session = Depends(get_db)) -> dict[str, Any]:
    return subscribe(session, payload)


@router.post(
    "/subscriptions/{lease_id}/heartbeat",
    response_model=LiveLeaseResult,
    dependencies=[Depends(verify_workspace_operator_access), Depends(protect_demand)],
)
def heartbeat(
    lease_id: UUID, payload: LiveSubscription, session: Session = Depends(get_db)
) -> dict[str, Any]:
    return subscribe(session, payload, str(lease_id))


@router.delete(
    "/subscriptions/{lease_id}",
    status_code=204,
    dependencies=[Depends(verify_workspace_operator_access), Depends(protect_demand)],
)
def deactivate(lease_id: UUID, session: Session = Depends(get_db)) -> None:
    release(session, str(lease_id))


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
