from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator, Callable, Generator
from contextlib import contextmanager
from weakref import WeakKeyDictionary

import anyio
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import QueuePool

from courtlens.config import Settings, get_settings


class Base(DeclarativeBase):
    pass


# SQLAlchemy's QueuePool defaults, stated so the request admission below can be read off them.
POOL_SIZE = 5
MAX_OVERFLOW = 10
# Connections taken outside a request's session: the read cache's data stamp reader, the API's
# warm start and a Stats cohort write (stats_cohort_store.save_cohort's own transaction).
RESERVED_CONNECTIONS = 3


def build_engine(settings: Settings | None = None) -> Engine:
    current = settings or get_settings()
    options: dict[str, object] = {"pool_pre_ping": True}
    if current.database_url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False}
    elif current.database_url.startswith("postgresql"):
        # Scenario before/after reads must not observe different concurrent refresh commits.
        options["isolation_level"] = "REPEATABLE READ"
        options["pool_size"] = POOL_SIZE
        options["max_overflow"] = MAX_OVERFLOW
    return create_engine(current.database_url, **options)


def admission_limit(bind: Engine, reserved: int = RESERVED_CONNECTIONS) -> int | None:
    """How many requests may hold a session at once, or None when the pool does not bound it."""
    pool = bind.pool
    if not isinstance(pool, QueuePool):
        return None
    return max(1, pool.size() + pool._max_overflow - reserved)


def request_sessions(
    factory: Callable[[], Session], limit: int | None
) -> Callable[[], AsyncGenerator[Session, None]]:
    """A FastAPI session dependency that admits at most `limit` requests at a time.

    A request keeps its session, and the connection its first query checks out, until FastAPI
    closes the dependency after the response is sent. Between the handler and that close,
    FastAPI validates a sync endpoint's response on the shared 40-thread pool. With more
    requests in flight than connections, the threads all ended up in handlers waiting on the
    pool while the connections all sat in finished requests waiting for a thread, and only the
    pool's 30 s timeout broke it (production, 2026-11-18). Waiting here, on the event loop, holds
    neither a thread nor a connection, and an admitted request always gets a connection, so it
    always finishes and returns it.
    """
    gates: WeakKeyDictionary[asyncio.AbstractEventLoop, anyio.Semaphore] = WeakKeyDictionary()

    async def get_db() -> AsyncGenerator[Session, None]:
        if limit is None:
            session = factory()
            try:
                yield session
            finally:
                await _close(session)
            return
        loop = asyncio.get_running_loop()
        gate = gates.get(loop)
        if gate is None:
            gate = gates[loop] = anyio.Semaphore(limit)
        async with gate:
            session = factory()
            try:
                yield session
            finally:
                await _close(session)

    return get_db


async def _close(session: Session) -> None:
    # Closing rolls back over the network, so it runs in a thread: one of its own (a fresh
    # limiter, as FastAPI closes sync dependencies), never waiting on the shared pool, and
    # shielded so a cancelled request still returns its connection.
    with anyio.CancelScope(shield=True):
        await anyio.to_thread.run_sync(session.close, limiter=anyio.CapacityLimiter(1))


engine = build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
get_db = request_sessions(SessionLocal, admission_limit(engine))


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
