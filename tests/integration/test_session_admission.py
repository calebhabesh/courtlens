"""Requests beyond the connection pool wait their turn instead of deadlocking it (2026-11-18).

The production API hung for an hour: more requests were in flight than the pool had
connections, every worker thread sat in a handler waiting for a connection, and every
connection sat in a finished request waiting for a thread to validate its response. This runs
the real session dependency on a real two-connection PostgreSQL pool under uvicorn and floods a
sync endpoint shaped like the API's (a session query and a response model).
"""

from __future__ import annotations

import asyncio
import os
import socket
import threading
import time
from collections.abc import Iterator

import httpx
import pytest
import uvicorn
from fastapi import Depends, FastAPI
from pydantic import BaseModel
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session, sessionmaker

from courtlens.database import admission_limit, request_sessions

REQUESTS = 120


@pytest.fixture
def small_pool() -> Iterator[Engine]:
    url = os.environ.get("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        if os.environ.get("CI") or os.environ.get("COURTLENS_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("Use make test-python to supply disposable PostgreSQL fixtures")
        pytest.skip("disposable PostgreSQL fixtures required; use make test-python")
    engine = create_engine(url, pool_size=2, max_overflow=0, pool_timeout=3)
    yield engine
    engine.dispose()


def serve(application: FastAPI) -> tuple[uvicorn.Server, int]:
    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = int(probe.getsockname()[1])
    server = uvicorn.Server(uvicorn.Config(application, port=port, log_level="error"))
    threading.Thread(target=server.run, daemon=True).start()
    deadline = time.monotonic() + 10
    while not server.started:
        assert time.monotonic() < deadline, "uvicorn did not start"
        time.sleep(0.02)
    return server, port


def test_more_requests_than_connections_all_succeed(small_pool: Engine) -> None:
    limit = admission_limit(small_pool, reserved=0)
    assert limit == 2
    get_db = request_sessions(sessionmaker(bind=small_pool), limit)

    class Rows(BaseModel):
        rows: list[int]

    application = FastAPI()

    @application.get("/rows", response_model=Rows)
    def rows(session: Session = Depends(get_db)) -> Rows:
        session.execute(text("SELECT pg_sleep(0.01)"))
        return Rows(rows=list(range(100)))

    server, port = serve(application)

    async def flood() -> list[int]:
        async with httpx.AsyncClient(
            timeout=30, limits=httpx.Limits(max_connections=200)
        ) as client:
            replies = await asyncio.gather(
                *(client.get(f"http://127.0.0.1:{port}/rows") for _ in range(REQUESTS)),
                return_exceptions=True,
            )
        return [reply.status_code if isinstance(reply, httpx.Response) else 0 for reply in replies]

    try:
        began = time.monotonic()
        codes = asyncio.run(flood())
        elapsed = time.monotonic() - began
    finally:
        server.should_exit = True

    assert codes.count(200) == REQUESTS, f"{REQUESTS - codes.count(200)} requests failed"
    # A deadlock is broken only by the pool's timeout; admitted requests never meet it.
    assert elapsed < 3, f"took {elapsed:.1f} s"
    assert small_pool.pool.checkedout() == 0  # type: ignore[attr-defined]
