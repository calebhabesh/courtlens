"""B29 bounded read-only finance operation shared by manual and future tool clients."""

from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from courtlens.database import get_db
from courtlens.domain.finance_query import FinanceQuery, FinanceResult
from courtlens.services.finance_catalog import (
    FinanceBookDetail,
    FinanceBookSummary,
    book_detail,
    list_books,
)
from courtlens.services.finance_query import finance_query

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
