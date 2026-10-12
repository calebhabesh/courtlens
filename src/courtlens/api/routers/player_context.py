"""Independent, pinned metadata inputs; GET handlers never acquire or publish data."""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from courtlens.api.player_context_schemas import (
    ContextCatalogResponse,
    ContextDatasetResponse,
    ProjectedRosterResponse,
)
from courtlens.database import get_db
from courtlens.services.player_context import (
    context_catalog,
    dataset_info,
    dataset_rows,
    projected_roster,
    resolve_dataset,
)

router = APIRouter(prefix="/workbench/player-context", tags=["player-context"])


@router.get("/catalog", response_model=ContextCatalogResponse)
def catalog(
    season: str = "2026-27",
    known_at: datetime | None = Query(None, alias="knownAt"),
    session: Session = Depends(get_db),
) -> ContextCatalogResponse:
    try:
        return ContextCatalogResponse.model_validate(context_catalog(session, season, known_at))
    except ValueError as error:
        raise HTTPException(422, str(error)) from error


@router.get("/datasets/{dataset_id}", response_model=ContextDatasetResponse)
def dataset(
    dataset_id: str,
    known_at: datetime | None = Query(None, alias="knownAt"),
    limit: int = Query(100, ge=1, le=100),
    offset: int = Query(0, ge=0, le=20000),
    session: Session = Depends(get_db),
) -> ContextDatasetResponse:
    data = resolve_dataset(session, dataset_id, known_at)
    rows = dataset_rows(session, data, limit + 1, offset)
    return ContextDatasetResponse(
        context=dataset_info(session, data),
        rows=rows[:limit],
        offset=offset,
        next_offset=offset + limit if len(rows) > limit else None,
    )


@router.get("/rosters", response_model=ProjectedRosterResponse)
def rosters(
    dataset_id: str = Query(alias="datasetId"),
    team_id: str | None = Query(None, alias="teamId"),
    statistics_release_id: str | None = Query(None, alias="statisticsReleaseId"),
    known_at: datetime | None = Query(None, alias="knownAt"),
    session: Session = Depends(get_db),
) -> ProjectedRosterResponse:
    return ProjectedRosterResponse.model_validate(
        projected_roster(session, dataset_id, team_id, statistics_release_id, known_at)
    )
