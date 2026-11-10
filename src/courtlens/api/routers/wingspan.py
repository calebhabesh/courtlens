"""Research → Wingspan (courtlens-wingspan-ddpm-v1, R10): results and nearest builds. GET only."""

from typing import Any

from fastapi import APIRouter, HTTPException, Path

from courtlens.services import wingspan

router = APIRouter(prefix="/wingspan", tags=["wingspan"])


def _unavailable(error: Exception) -> HTTPException:
    return HTTPException(503, "Wingspan results unavailable")


@router.get("")
def wingspan_summary() -> dict[str, Any]:
    try:
        return wingspan.summary()
    except (OSError, ValueError, KeyError) as error:
        raise _unavailable(error) from error


@router.get("/nearest/{player_id}")
def wingspan_nearest(player_id: str = Path(..., pattern=r"^[0-9]{1,10}$")) -> dict[str, Any]:
    try:
        body = wingspan.nearest(player_id)
    except (OSError, ValueError, KeyError) as error:
        raise _unavailable(error) from error
    if body is None:
        raise HTTPException(404, "No combine record for this player since 2000.")
    return body
