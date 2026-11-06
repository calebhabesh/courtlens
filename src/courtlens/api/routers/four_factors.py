"""Research → ORtg Calculator inputs (courtlens-four-factors-inputs-v2, R10). GET only."""

from typing import Any

from fastapi import APIRouter, HTTPException, Path

from courtlens.services import four_factors

router = APIRouter(prefix="/four-factors", tags=["four factors"])


def _unavailable(error: Exception) -> HTTPException:
    return HTTPException(503, "Four-factor inputs unavailable")


@router.get("")
def four_factors_summary() -> dict[str, Any]:
    try:
        return four_factors.summary()
    except (OSError, ValueError, KeyError) as error:
        raise _unavailable(error) from error


@router.get("/seasons/{season}")
def four_factors_season(season: str = Path(..., pattern=r"^[0-9]{4}-[0-9]{2}$")) -> dict[str, Any]:
    try:
        body = four_factors.season(season)
    except (OSError, ValueError, KeyError) as error:
        raise _unavailable(error) from error
    if body is None:
        raise HTTPException(404, f"No {season} inputs: seasons run 2014-15 to 2025-26.")
    return body
