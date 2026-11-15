"""Server-Timing for API responses: handler time, database time and query count.

Route functions are synchronous and run in a worker thread, so a value the handler sets in a
ContextVar never reaches the middleware afterwards. The middleware therefore creates one mutable
holder per request and binds it to a ContextVar *before* calling the route; the worker thread runs
in a copy of that context, sees the same holder and the SQLAlchemy cursor events add to it.
Response bodies are not touched.
"""

from __future__ import annotations

import threading
import time
from contextvars import ContextVar
from typing import Any

from sqlalchemy import event
from sqlalchemy.engine import Engine


class RequestTiming:
    """Database time and query count for one request; safe to add to from several threads."""

    __slots__ = ("_lock", "db_seconds", "queries")

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.db_seconds = 0.0
        self.queries = 0

    def add_query(self, seconds: float) -> None:
        with self._lock:
            self.db_seconds += seconds
            self.queries += 1

    def header(self, total_seconds: float) -> str:
        with self._lock:
            db_ms = self.db_seconds * 1000
            queries = self.queries
        return f'total;dur={total_seconds * 1000:.1f}, db;dur={db_ms:.1f}, queries;desc="{queries}"'


current_timing: ContextVar[RequestTiming | None] = ContextVar("courtlens_timing", default=None)

_STARTED_KEY = "courtlens_query_started"


def _before_cursor_execute(conn: Any, *_args: Any) -> None:
    if current_timing.get() is not None:
        conn.info.setdefault(_STARTED_KEY, []).append(time.perf_counter())


def _after_cursor_execute(conn: Any, *_args: Any) -> None:
    timing = current_timing.get()
    started: list[float] | None = conn.info.get(_STARTED_KEY)
    if timing is None or not started:
        return
    timing.add_query(time.perf_counter() - started.pop())


def _handle_error(context: Any) -> None:
    # A failed statement never reaches after_cursor_execute; drop its start so the stack stays even.
    connection = context.connection
    started: list[float] | None = connection.info.get(_STARTED_KEY) if connection else None
    if started:
        started.pop()


_installed = False


def install_query_timing() -> None:
    """Listen on every Engine, once per process; outside a request the listeners do nothing."""
    global _installed
    if _installed:
        return
    event.listen(Engine, "before_cursor_execute", _before_cursor_execute)
    event.listen(Engine, "after_cursor_execute", _after_cursor_execute)
    event.listen(Engine, "handle_error", _handle_error)
    _installed = True
