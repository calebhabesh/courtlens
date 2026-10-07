from __future__ import annotations

from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from courtlens.config import Settings, get_settings


class Base(DeclarativeBase):
    pass


def build_engine(settings: Settings | None = None) -> Engine:
    current = settings or get_settings()
    options: dict[str, object] = {"pool_pre_ping": True}
    if current.database_url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
    elif current.database_url.startswith("postgresql"):
        # Scenario before/after reads must not observe different concurrent refresh commits.
        options["isolation_level"] = "REPEATABLE READ"
    return create_engine(current.database_url, **options)


engine = build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
