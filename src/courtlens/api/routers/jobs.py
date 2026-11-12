"""Job health (W7): each scheduled job's last success and failure, and whether it is stale."""

from typing import Any

from fastapi import APIRouter, Response

router = APIRouter(prefix="/jobs", tags=["operations"])


@router.get("")
def job_health(response: Response) -> dict[str, Any]:
    from courtlens.services.scheduled_jobs import status

    response.headers["Cache-Control"] = "no-store"
    return status()
