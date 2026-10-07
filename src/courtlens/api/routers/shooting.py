"""Read-only shot/profile, source assignment and sequence operations."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.domain.shooting import Operation, ShootingRequest, ShootingResponse
from courtlens.services.shooting import shooting_service

router = APIRouter(prefix="/workbench/operations", tags=["shooting"])


@router.post("/{operation}", response_model=ShootingResponse)
def shooting(
    operation: Operation, payload: ShootingRequest, session: Session = Depends(get_db)
) -> ShootingResponse:
    return shooting_service(session, payload, operation)
