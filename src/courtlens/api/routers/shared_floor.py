"""Read-only B21 operations; schemas are shared with manual and tool clients."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.domain.on_off import (
    SharedFloorRequest,
    SharedFloorResponse,
    StatShiftRosterRequest,
    StatShiftRosterResponse,
)
from courtlens.services.on_off import shared_floor_service, stat_shift_roster

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
