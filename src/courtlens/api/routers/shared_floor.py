"""Read-only B21 operations; schemas are shared with manual and tool clients."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import ValidationError
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.domain.on_off import (
    SharedFloorRequest,
    SharedFloorResponse,
    StatShiftRosterRequest,
    StatShiftRosterResponse,
)
from courtlens.domain.wowy_combos import WowyCombosRequest
from courtlens.services.on_off import shared_floor_service, stat_shift_roster
from courtlens.services.wowy_combos import WowyCombosResponse, wowy_combos

router = APIRouter(prefix="/workbench/operations", tags=["shared-floor"])


@router.post("/wowy", response_model=SharedFloorResponse)
def wowy(payload: SharedFloorRequest, session: Session = Depends(get_db)) -> SharedFloorResponse:
    return shared_floor_service(session, payload, "wowy")


@router.post("/on-off", response_model=SharedFloorResponse)
def on_off(payload: SharedFloorRequest, session: Session = Depends(get_db)) -> SharedFloorResponse:
    return shared_floor_service(session, payload, "on-off")


@router.post("/stat-shift", response_model=SharedFloorResponse)
def stat_shift(
    payload: SharedFloorRequest, session: Session = Depends(get_db)
) -> SharedFloorResponse:
    return shared_floor_service(session, payload, "stat-shift")


@router.post("/stat-shift-roster", response_model=StatShiftRosterResponse)
def stat_shift_roster_route(
    payload: StatShiftRosterRequest, session: Session = Depends(get_db)
) -> StatShiftRosterResponse:
    return stat_shift_roster(session, payload)


@router.get("/wowy-combos", response_model=WowyCombosResponse)
def wowy_combos_route(
    payload: Annotated[WowyCombosRequest, Query()], session: Session = Depends(get_db)
) -> WowyCombosResponse:
    """Read-only, so a GET: the hosted demo's read-only boundary needs no allowlist entry."""
    try:
        return wowy_combos(session, payload)
    except ValidationError as error:
        raise HTTPException(422, detail={"reason": "invalid_request"}) from error
