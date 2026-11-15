"""Server-Timing on API responses (speed plan SP00): handler time, database time, query count."""

from __future__ import annotations

import re
import threading
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, text
from sqlalchemy.exc import OperationalError

from courtlens.api.app import create_app
from courtlens.api.server_timing import RequestTiming, current_timing

HEADER = re.compile(r'^total;dur=(\d+\.\d), db;dur=(\d+\.\d), queries;desc="(\d+)"$')


def parse(header: str) -> tuple[float, float, int]:
    match = HEADER.match(header)
    assert match, header
    return float(match[1]), float(match[2]), int(match[3])


@pytest.fixture
def timed_client(test_engine: Engine) -> Generator[TestClient, None, None]:
    application = create_app()

    # Synchronous, like every route in the API: it runs in a worker thread.
    @application.get("/api/test-timing/queries")
    def queries(count: int = 3) -> dict[str, object]:
        with test_engine.connect() as connection:
            values = [
                connection.execute(text("SELECT :n"), {"n": n}).scalar() for n in range(count)
            ]
        in_worker = threading.current_thread() is not threading.main_thread()
        return {"values": values, "thread": in_worker}

    @application.get("/api/test-timing/fails")
    def fails() -> dict[str, object]:
        with test_engine.connect() as connection:
            with pytest.raises(OperationalError):
                connection.execute(text("SELECT * FROM no_such_table"))
            connection.execute(text("SELECT 1"))
        return {"ok": True}

    with TestClient(application) as client:
        yield client


def test_sync_route_queries_are_counted(timed_client: TestClient) -> None:
    response = timed_client.get("/api/test-timing/queries", params={"count": 3})
    assert response.status_code == 200
    total, db, count = parse(response.headers["Server-Timing"])
    assert count == 3
    assert 0 <= db <= total
    # The body is the route's own JSON, untouched.
    assert response.content == b'{"values":[0,1,2],"thread":true}'


def test_counts_do_not_leak_between_requests(timed_client: TestClient) -> None:
    timed_client.get("/api/test-timing/queries", params={"count": 5})
    second = timed_client.get("/api/test-timing/queries", params={"count": 1})
    assert parse(second.headers["Server-Timing"])[2] == 1


def test_route_without_queries_and_unknown_paths_report_zero(timed_client: TestClient) -> None:
    for path in ("/metrics", "/api/no-such-route"):
        _, db, count = parse(timed_client.get(path).headers["Server-Timing"])
        assert (db, count) == (0.0, 0)


def test_failed_statement_keeps_the_count_even(timed_client: TestClient) -> None:
    response = timed_client.get("/api/test-timing/fails")
    assert response.status_code == 200
    # The failed SELECT never completes; only the one that does is counted.
    assert parse(response.headers["Server-Timing"])[2] == 1


def test_queries_outside_a_request_are_ignored(test_engine: Engine) -> None:
    create_app()  # installs the listeners
    assert current_timing.get() is None
    with test_engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    assert current_timing.get() is None


def test_holder_header_format() -> None:
    timing = RequestTiming()
    timing.add_query(0.0125)
    timing.add_query(0.0005)
    assert timing.header(0.05) == 'total;dur=50.0, db;dur=13.0, queries;desc="2"'
