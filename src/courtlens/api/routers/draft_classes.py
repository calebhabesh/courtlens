"""Research → Draft Classes (courtlens-draft-value-v1): frozen results and the rookie tracker."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Path
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.services import draft_classes
from courtlens.services.workbench_analytics import resolve_workbench_context

router = APIRouter(prefix="/draft", tags=["draft classes"])


def _unavailable(error: Exception) -> HTTPException:
    return HTTPException(503, "Draft Classes results unavailable")


@router.get("")
def draft_summary() -> dict[str, Any]:
    try:
        return draft_classes.summary()
    except (OSError, ValueError, KeyError) as error:
        raise _unavailable(error) from error


@router.get("/classes/{year}")
def draft_class(year: int = Path(..., ge=1900, le=2100)) -> dict[str, Any]:
    try:
        body = draft_classes.draft_class(year)
    except (OSError, ValueError, KeyError) as error:
        raise _unavailable(error) from error
    if body is None:
        raise HTTPException(404, f"No {year} draft class: classes run 1966 to 2026.")
    return body


@router.get("/combine")
def draft_combine() -> dict[str, Any]:
    try:
        return draft_classes.combine()
    except (OSError, ValueError, KeyError) as error:
        raise _unavailable(error) from error


@router.get("/rookies")
def draft_rookies(session: Session = Depends(get_db)) -> dict[str, Any]:
    context = resolve_workbench_context(session)
    try:
        return draft_classes.rookies(session, context.dataset_id)
    except (OSError, ValueError, KeyError) as error:
        raise _unavailable(error) from error


@router.get("/rookies/{player_id}")
def draft_rookie(
    player_id: str = Path(..., pattern=r"^[0-9]{1,12}$"), session: Session = Depends(get_db)
) -> dict[str, Any]:
    context = resolve_workbench_context(session)
    try:
        body = draft_classes.rookie(session, context.dataset_id, player_id)
    except (OSError, ValueError, KeyError) as error:
        raise _unavailable(error) from error
    if body is None:
        raise HTTPException(404, "Not a 2026 draft pick.")
    return body
