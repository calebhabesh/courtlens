"""Bounded immutable book discovery; labels never establish financial associations."""

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, defer

from courtload.domain.finance_query import QueryModel
from courtload.finance_models import FinanceMember, FinanceRelease
from courtload.services.finance_import import release_rows
from courtload.workbench_models import WorkbenchIdentity


class FinanceBookSummary(QueryModel):
    book_id: str
    book_sha256: str
    parent_book_id: str | None
    created_at: datetime
    coverage_note: str


class FinanceBookDetail(FinanceBookSummary):
    financial_seasons: tuple[str, ...]
    latest_observed_at: datetime
    player_labels: dict[str, str]
    label_scope: str = "identity display labels only; not dated financial evidence"


def list_books(session: Session) -> tuple[FinanceBookSummary, ...]:
    books = session.scalars(
        select(FinanceRelease)
        .options(defer(FinanceRelease.csv_bytes))
        .order_by(FinanceRelease.created_at.desc(), FinanceRelease.id)
        .limit(101)
    ).all()
    if len(books) > 100:
        raise HTTPException(422, "Book discovery bound exceeded; use an explicit book UUID")
    return tuple(summary(book) for book in books)


def summary(book: FinanceRelease) -> FinanceBookSummary:
    return FinanceBookSummary(
        book_id=book.id,
        book_sha256=book.content_sha256,
        parent_book_id=book.parent_release_id,
        created_at=book.created_at,
        coverage_note=book.manifest_json["coverage_note"],
    )


def book_detail(session: Session, book_id: str) -> FinanceBookDetail:
    book = session.scalar(
        select(FinanceRelease)
        .options(defer(FinanceRelease.csv_bytes))
        .where(FinanceRelease.id == book_id)
    )
    if book is None:
        raise HTTPException(404, "Finance book not found")
    count = session.scalar(
        select(func.count()).select_from(FinanceMember).where(FinanceMember.release_id == book_id)
    )
    if count is None or not 0 < count <= 5000:
        raise HTTPException(422, "Empty or over-bound finance book")
    rows = release_rows(session, book_id)
    if not rows or len(rows) > 5000:
        raise HTTPException(422, "Empty or over-bound finance book")
    players = {row.nba_player_id for _, row in rows}
    labels = session.scalars(
        select(WorkbenchIdentity).where(
            WorkbenchIdentity.namespace == "nba",
            WorkbenchIdentity.kind == "player",
            WorkbenchIdentity.external_id.in_(players),
        )
    ).all()
    return FinanceBookDetail(
        **summary(book).model_dump(),
        financial_seasons=tuple(
            sorted({r.financial_season for _, r in rows if r.financial_season})
        ),
        latest_observed_at=max(r.observed_at for _, r in rows),
        player_labels={p.external_id: p.display_name for p in labels},
    )
