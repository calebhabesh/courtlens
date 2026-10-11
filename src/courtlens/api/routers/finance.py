"""B29 bounded read-only finance operation shared by manual and future tool clients."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.domain.finance_context import RefreshInfo, ThresholdInfo
from courtlens.domain.finance_query import FinanceQuery, FinanceResult
from courtlens.finance_context_models import FinanceRefresh, FinanceThreshold
from courtlens.ingestion.player_context import valid_season
from courtlens.services.finance_catalog import (
    FinanceBookDetail,
    FinanceBookSummary,
    book_detail,
    list_books,
)
from courtlens.services.finance_query import finance_query
from courtlens.services.finance_refresh import refresh_info, threshold_info

router = APIRouter(prefix="/workbench/operations", tags=["finance"])


@router.post("/finance", response_model=FinanceResult)
def query_finance(payload: FinanceQuery, session: Session = Depends(get_db)) -> FinanceResult:
    return finance_query(session, payload)


@router.get("/finance/books", response_model=tuple[FinanceBookSummary, ...])
def finance_books(session: Session = Depends(get_db)) -> tuple[FinanceBookSummary, ...]:
    return list_books(session)


@router.get("/finance/books/{book_id}", response_model=FinanceBookDetail)
def finance_book(book_id: UUID, session: Session = Depends(get_db)) -> FinanceBookDetail:
    return book_detail(session, str(book_id))


@router.get("/finance/refreshes", response_model=tuple[RefreshInfo, ...])
def finance_refreshes(
    season: str = "2026-27",
    known_at: datetime | None = Query(None, alias="knownAt"),
    session: Session = Depends(get_db),
) -> tuple[RefreshInfo, ...]:
    _validate_scope(season, known_at)
    query = select(FinanceRefresh).where(FinanceRefresh.season == season)
    if known_at is not None:
        query = query.where(FinanceRefresh.observed_at <= known_at)
    records = session.scalars(
        query.order_by(FinanceRefresh.observed_at.desc(), FinanceRefresh.id).limit(10)
    )
    return tuple(refresh_info(session, r.id, known_at) for r in records)


@router.get("/finance/refreshes/{refresh_id}", response_model=RefreshInfo)
def finance_refresh(
    refresh_id: UUID,
    known_at: datetime | None = Query(None, alias="knownAt"),
    session: Session = Depends(get_db),
) -> RefreshInfo:
    return refresh_info(session, str(refresh_id), known_at)


@router.get("/finance/thresholds", response_model=tuple[ThresholdInfo, ...])
def finance_thresholds(
    season: str = "2026-27",
    known_at: datetime | None = Query(None, alias="knownAt"),
    session: Session = Depends(get_db),
) -> tuple[ThresholdInfo, ...]:
    _validate_scope(season, known_at)
    query = select(FinanceThreshold).where(FinanceThreshold.season == season)
    if known_at is not None:
        query = query.where(FinanceThreshold.observed_at <= known_at)
    records = session.scalars(
        query.order_by(FinanceThreshold.observed_at.desc(), FinanceThreshold.id).limit(10)
    )
    return tuple(threshold_info(r) for r in records)


def _validate_scope(season: str, known_at: datetime | None) -> None:
    try:
        valid_season(season)
        if known_at is not None and (known_at.tzinfo is None or known_at.utcoffset() is None):
            raise ValueError("knownAt must include a timezone")
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
