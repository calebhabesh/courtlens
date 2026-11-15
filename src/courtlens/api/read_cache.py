"""API read cache and data stamp (speed plan SP01).

An in-memory LRU of read responses, bounded by total bytes, in front of the routes. A hit is
answered here, before routing, so it never enters the thread pool where the synchronous routes and
their queries run.

Every GET route, and every read-only POST the hosted demo's Caddy allows, has a class in
`ROUTE_CLASSES` (a test fails on one without):

- `stamp`: published or job-written data. Kept until the data stamp changes, at most 6 hours.
- `short`: data that moves between jobs (Win Probability, data and pipeline status). 30 seconds.
- `never`: everything per viewer, live, written through the API, binary or uncertain.

The data stamp is a SHA-256 over what the writers of served data change (the writer list is in
docs/speed-progress.md, SP01): the publication pointers, the bundle `.current` pointers, each
scheduled job's start and finish in its health record, the manual bump file written by
`courtlens bump-data-stamp`, and today's date (some reads compare against it). It is read lazily,
at most every 5 seconds; when it changes the cache is emptied. While a scheduled job is running,
`stamp` reads are not stored at all, because jobs write as they go and record their finish last.

Safety rules, each one a reason to pass a request straight through:
- a request carrying a credential or viewer header (`CREDENTIAL_HEADERS`) is `bypass`;
- only a complete status-200 JSON response whose only headers are content headers is stored, and
  only when FastAPI dispatched the request to the same route the class came from and the cache
  generation did not change while it ran;
- the key is the method, path, every query parameter (sorted by name, values in their order) and,
  for a POST, the content type and the SHA-256 of the body.

A hit replays the stored body and content headers only; the outer middleware gives it a fresh
`X-Request-ID` and its own `Server-Timing`, and CORS (outside this layer) adds its headers.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import threading
import time
import uuid
from collections import OrderedDict
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any, Literal
from urllib.parse import parse_qsl
from zoneinfo import ZoneInfo

import anyio
from fastapi import APIRouter, FastAPI, Request
from fastapi import routing as fastapi_routing
from starlette.types import ASGIApp, Message, Receive, Scope, Send

logger = logging.getLogger(__name__)

CacheClass = Literal["stamp", "short", "never"]

MAX_AGE: dict[str, float] = {"stamp": 6 * 3600.0, "short": 30.0}
STAMP_RECHECK_SECONDS = 5.0
MAX_ENTRY_BYTES = 4 * 1024 * 1024
MAX_REQUEST_BODY_BYTES = 1024 * 1024
# Python-side cost of one entry beyond its body: the key, the entry object, the dict slot.
ENTRY_OVERHEAD_BYTES = 512
DEFAULT_MAX_BYTES = 128 * 1024 * 1024

# The read-only POSTs deploy/Caddyfile lets through to the API (a test keeps these in step).
READ_POST_PATHS = ("/api/workbench/query",)
READ_POST_PREFIXES = ("/api/workbench/operations/",)

# Every request header the API reads that names a viewer or carries a credential, plus Cookie
# (the API reads none, but a browser's cookies mean a viewer). Lower-case, as ASGI sends them.
CREDENTIAL_HEADERS = frozenset(
    {
        b"authorization",
        b"cookie",
        b"x-operator-token",
        b"x-courtlens-account-token",
        b"x-courtlens-ask-token",
        b"x-courtlens-visitor",
        b"x-courtlens-client",
    }
)
# The only response headers a stored response may carry (anything else means "do not store").
STORED_HEADERS = frozenset({b"content-type", b"content-length"})

HEALTH_DIR = Path("data/derived/job-health")
DERIVED_DIR = Path("data/derived")
BUMP_FILE = "data-stamp-bump"
EASTERN = ZoneInfo("America/New_York")
# A job whose start has no later finish counts as running until its timeout plus this margin
# (a killed loop never writes the finish; `run_job` always does within the timeout).
RUNNING_MARGIN = timedelta(minutes=10)


def _classes(text: str, klass: CacheClass) -> dict[str, CacheClass]:
    return {line.strip(): klass for line in text.strip().splitlines() if line.strip()}


ROUTE_CLASSES: dict[str, CacheClass] = {
    **_classes(
        """
        GET /api/analytics/evaluations
        GET /api/analytics/compare
        GET /api/analytics/catalog
        GET /api/analytics/players
        GET /api/analytics/players/{player_id}
        GET /api/analytics/players/{player_id}/games
        GET /api/analytics/lineage
        GET /api/methodology
        GET /api/models/runs
        GET /api/playoffs
        GET /api/playoffs/series/{series_id}
        GET /api/workbench/catalog
        GET /api/workbench/metrics
        GET /api/workbench/impact
        GET /api/workbench/roster-shapes
        GET /api/workbench/roster-shapes/history
        GET /api/workbench/defense
        GET /api/workbench/season-matchups
        GET /api/workbench/player-twins/players
        GET /api/workbench/player-twins
        GET /api/workbench/play-types
        GET /api/workbench/tracking
        GET /api/workbench/player-dashboard/feeds
        GET /api/workbench/players/{player_id}/tracking
        GET /api/workbench/players/{player_id}/bio
        GET /api/workbench/wowy
        GET /api/workbench/combine
        GET /api/workbench/draft-classes
        GET /api/workbench/players/{player_id}/career
        GET /api/workbench/compare/career
        GET /api/workbench/compare/group
        GET /api/workbench/player-seasons
        GET /api/workbench/value-archetypes
        POST /api/workbench/query
        GET /api/workbench/lookup
        GET /api/workbench/players
        GET /api/workbench/players/{id}
        GET /api/workbench/players/{id}/games
        GET /api/workbench/teams
        GET /api/workbench/teams/six-factors
        GET /api/workbench/teams/{id}
        GET /api/workbench/teams/{id}/starters
        GET /api/workbench/teams/{id}/schedule
        GET /api/workbench/teams/{id}/four-factors
        GET /api/workbench/teams/{id}/peers
        GET /api/workbench/teams/{id}/three-point-variation
        GET /api/workbench/playoffs
        GET /api/workbench/playoffs/series/{series_id}
        GET /api/workbench/compare
        GET /api/workbench/lineage
        GET /api/workbench/portrait-credits
        GET /api/workbench/forecasts/evaluation
        GET /api/workbench/forecasts
        GET /api/workbench/forecasts/{id}
        POST /api/workbench/operations/compare-periods
        GET /api/workbench/operations/compare-periods
        POST /api/workbench/operations/distribution
        GET /api/workbench/operations/distribution
        POST /api/workbench/operations/splits
        GET /api/workbench/operations/splits
        POST /api/workbench/operations/opponent-context
        GET /api/workbench/operations/opponent-context
        POST /api/workbench/operations/similarity
        GET /api/workbench/operations/similarity
        POST /api/workbench/operations/rank
        GET /api/workbench/operations/rank
        GET /api/workbench/measurements
        GET /api/workbench/players/{player_id}/measurements
        GET /api/workbench/crosswalk
        GET /api/workbench/player-context/catalog
        GET /api/workbench/player-context/datasets/{dataset_id}
        GET /api/workbench/player-context/rosters
        POST /api/workbench/operations/wowy
        POST /api/workbench/operations/on-off
        POST /api/workbench/operations/stat-shift
        POST /api/workbench/operations/stat-shift-roster
        GET /api/workbench/operations/wowy-combos
        POST /api/workbench/operations/finance
        GET /api/workbench/operations/finance/books
        GET /api/workbench/operations/finance/books/{book_id}
        GET /api/workbench/operations/finance/refreshes
        GET /api/workbench/operations/finance/refreshes/{refresh_id}
        GET /api/workbench/operations/finance/refreshes/{refresh_id}/teams
        GET /api/workbench/operations/finance/refreshes/{refresh_id}/teams/{team}
        GET /api/workbench/operations/free-agency
        GET /api/workbench/operations/finance/thresholds
        POST /api/workbench/operations/{operation}
        GET /api/workbench/research/runs
        GET /api/workbench/research/runs/{run_id}
        GET /api/workbench/research/experiments
        GET /api/projected-impact
        GET /api/projected-impact/players/{player_id}
        GET /api/metric-backtest
        GET /api/draft
        GET /api/draft/classes/{year}
        GET /api/draft/combine
        GET /api/draft/rookies
        GET /api/draft/rookies/{player_id}
        GET /api/lineup-model
        GET /api/lineup-model/players
        GET /api/lineup-model/fit
        GET /api/wingspan
        GET /api/wingspan/nearest/{player_id}
        GET /api/four-factors
        GET /api/four-factors/seasons/{season}
        GET /api/six-factor
        GET /api/six-factor/tree
        GET /api/signal-noise
        GET /api/signal-noise/shrinkage
        GET /api/signal-noise/player
        GET /api/zts
        GET /api/zts/leaderboard
        GET /api/zts/player
        GET /api/zts/teams
        GET /api/zts/role-moves
        GET /api/shot-quality/decomposition
        GET /api/shot-quality/decomposition/players
        GET /api/shot-quality
        GET /api/shot-quality/players
        GET /api/shot-quality/player
        GET /api/defensive-shot-quality
        GET /api/defensive-shot-quality/cards
        GET /api/shot-aftermath
        GET /api/shot-aftermath/scope
        GET /api/shot-aftermath/teams
        """,
        "stamp",
    ),
    **_classes(
        # Moves between jobs, compares against the clock, or reads tables no job owns.
        """
        GET /api/data-status
        GET /api/schedule/week
        GET /api/players
        GET /api/players/{player_id}/form
        GET /api/lineage/player-games/{source_stat_id}
        GET /api/workbench/status
        GET /api/workbench/backfill/status
        GET /api/win-probability
        GET /api/win-probability/games/{game_id}/breakdown
        GET /api/win-probability/wpa
        """,
        "short",
    ),
    **_classes(
        """
        GET /api/openapi.json
        GET /api/docs
        GET /docs/oauth2-redirect
        GET /metrics
        GET /api/health
        GET /api/cache/status
        GET /api/job-health
        GET /api/workbench/schedule/dates
        GET /api/workbench/analyses
        GET /api/workbench/analyses/{id}
        GET /api/workbench/analyses/{id}/reproduce
        GET /api/workbench/analyses/{id}/export
        GET /api/workbench/jobs
        GET /api/workbench/jobs/{id}
        GET /api/workbench/media/players/{hash}
        GET /api/workbench/college-logos/{espn_id}
        GET /api/workbench/players/{id}/portrait
        GET /api/workbench/assistant/status
        GET /api/workbench/workspace
        GET /api/workbench/workspace/export
        GET /api/workbench/workspace/presets
        GET /api/workbench/workspace/views
        GET /api/workbench/workspace/views/{view_id}
        GET /api/workbench/workspace/favorites
        GET /api/workbench/workspace/compare-tray
        GET /api/workbench/workspace/ranking-boards
        GET /api/workbench/workspace/ranking-boards/{board_id}
        GET /api/workbench/workspace/tier-lists
        GET /api/workbench/workspace/tier-lists/{tier_list_id}
        GET /api/workbench/workspace/preferences
        GET /api/workbench/assistant/operations
        GET /api/workbench/assistant/v2/limits
        GET /api/workbench/assistant/v2/threads
        GET /api/workbench/assistant/v2/threads/{thread_id}/turns
        GET /api/workbench/assistant/investigations
        GET /api/workbench/assistant/investigations/{analysis_id}
        GET /api/workbench/assistant/investigations/{analysis_id}/reproduce
        GET /api/workbench/assistant/investigations/{analysis_id}/export
        GET /api/live
        GET /api/live/games/{game_id}
        GET /api/live/games/{game_id}/win-probability
        GET /api/live/standings
        GET /api/live/teams/{team}/schedule
        GET /api/live/historical
        GET /api/auth/me
        GET /api/me
        GET /api/me/favorites
        GET /api/fantasy/leagues
        GET /api/fantasy/leagues/{league_id}
        GET /api/fantasy/leagues/{league_id}/roster
        GET /api/fantasy/leagues/{league_id}/watchlist
        GET /api/fantasy/leagues/{league_id}/planner
        GET /api/fantasy/leagues/{league_id}/scenarios/{scenario_id}
        """,
        "never",
    ),
}


def is_read_post(path: str) -> bool:
    return path in READ_POST_PATHS or path.startswith(READ_POST_PREFIXES)


def unclassified_routes(app: FastAPI, classes: Mapping[str, str] = ROUTE_CLASSES) -> list[str]:
    """GET routes and read-only POSTs without a class (a test fails on any)."""
    needed = {
        f"{entry.method} {entry.path}"
        for entry in walk_routes(app)
        if entry.method == "GET" or (entry.method == "POST" and is_read_post(entry.path))
    }
    return sorted(needed - classes.keys())


# --- routes -----------------------------------------------------------------------------------


@dataclass(frozen=True)
class RouteEntry:
    method: str
    path: str
    regex: Any
    route: Any  # the object FastAPI puts in scope["route"] when it dispatches here


def walk_routes(app: FastAPI) -> list[RouteEntry]:
    """Every route in dispatch order, recursing into FastAPI's included routers.

    In this FastAPI version `app.routes` holds `_IncludedRouter` branches; a flat walk finds only
    the four routes added to the app itself.
    """
    entries: list[RouteEntry] = []

    def visit(routes: list[Any]) -> None:
        for route in routes:
            if isinstance(route, fastapi_routing._IncludedRouter):
                visit(list(route.effective_candidates()))
                continue
            original = getattr(route, "original_route", route)
            path = getattr(route, "path", None)
            regex = getattr(route, "path_regex", None)
            if path is None or regex is None:
                continue
            for method in sorted(getattr(route, "methods", None) or ()):
                entries.append(RouteEntry(method, path, regex, original))

    visit(list(app.routes))
    return entries


class RouteTable:
    def __init__(self, entries: list[RouteEntry]) -> None:
        self._entries = entries

    def resolve(self, method: str, path: str) -> RouteEntry | None:
        """The first route whose path and method match, as Starlette dispatches."""
        for entry in self._entries:
            if entry.method == method and entry.regex.match(path):
                return entry
        return None


# --- data stamp -------------------------------------------------------------------------------


@dataclass(frozen=True)
class StampReading:
    stamp: str
    running: tuple[str, ...]  # scheduled jobs running now: `stamp` reads are not stored


def _health(path: Path) -> dict[str, Any]:
    try:
        body = json.loads(path.read_text())
    except FileNotFoundError:
        return {}
    return body if isinstance(body, dict) else {}


def read_data_stamp(
    session_factory: Callable[[], Any],
    health_dir: Path = HEALTH_DIR,
    derived_dir: Path = DERIVED_DIR,
    now: Callable[[], datetime] = lambda: datetime.now(UTC),
) -> StampReading:
    """Hash everything the writers of served data change (see the module docstring)."""
    from sqlalchemy import text

    from courtlens.services.scheduled_jobs import JOBS

    moment = now()
    with session_factory() as session:
        pointers = [
            [str(value) for value in row]
            for row in session.execute(
                text(
                    "SELECT channel, snapshot_id, published_at FROM published_snapshots "
                    "ORDER BY channel"
                )
            ).all()
        ]
    bundle_pointers = {
        str(path): path.read_text().strip()
        for pattern in ("*/.current", "*/*/.current")
        for path in sorted(derived_dir.glob(pattern))
    }
    jobs: dict[str, list[str | None]] = {}
    running: list[str] = []
    for job in JOBS:
        health = _health(health_dir / f"{job.name}.json")
        started, finished = health.get("last_started"), health.get("last_finished")
        jobs[job.name] = [started, finished]
        if started and (not finished or finished < started):
            begun = datetime.fromisoformat(started)
            if moment < begun + job.timeout + RUNNING_MARGIN:
                running.append(job.name)
    bump_path = health_dir / BUMP_FILE
    bump = bump_path.read_text().strip() if bump_path.exists() else None
    parts = {
        "published_snapshots": pointers,
        "bundle_pointers": bundle_pointers,
        "jobs": jobs,
        "bump": bump,
        "dates": [date.today().isoformat(), moment.astimezone(EASTERN).date().isoformat()],
    }
    digest = hashlib.sha256(json.dumps(parts, sort_keys=True).encode()).hexdigest()
    return StampReading(digest, tuple(running))


def bump_data_stamp(health_dir: Path = HEALTH_DIR) -> str:
    """Write a new bump value (for hand-run writes of served data); returns it."""
    health_dir.mkdir(parents=True, exist_ok=True)
    value = f"{datetime.now(UTC).isoformat(timespec='seconds')} {uuid.uuid4()}"
    temporary = health_dir / f"{BUMP_FILE}.tmp"
    temporary.write_text(value + "\n")
    os.replace(temporary, health_dir / BUMP_FILE)
    return value


# --- store ------------------------------------------------------------------------------------


@dataclass(frozen=True)
class Entry:
    body: bytes
    headers: tuple[tuple[bytes, bytes], ...]
    klass: str
    stored_at: float
    size: int
    route: Any


class ReadCacheStore:
    """The LRU, its counters and the stamp; every method runs on the event loop thread."""

    def __init__(
        self,
        stamp_reader: Callable[[], StampReading],
        max_bytes: int = DEFAULT_MAX_BYTES,
        clock: Callable[[], float] = time.monotonic,
        recheck_seconds: float = STAMP_RECHECK_SECONDS,
    ) -> None:
        self.max_bytes = max_bytes
        self._stamp_reader = stamp_reader
        self._clock = clock
        self._recheck = recheck_seconds
        self._entries: OrderedDict[str, Entry] = OrderedDict()
        self._lock = threading.Lock()  # status reads come from a worker thread
        self._refresh_lock = asyncio.Lock()
        self.bytes = 0
        self.hits = 0
        self.misses = 0
        self.bypasses = 0
        self.evictions = 0
        self.process_id = uuid.uuid4().hex
        self.reading: StampReading | None = None
        self.generation = ""
        self._checked_at: float | None = None

    # The stamp, checked at most every `recheck_seconds`.
    async def current(self) -> StampReading | None:
        if self._checked_at is not None and self._clock() - self._checked_at < self._recheck:
            return self.reading
        async with self._refresh_lock:
            if self._checked_at is not None and self._clock() - self._checked_at < self._recheck:
                return self.reading
            try:
                reading: StampReading | None = await anyio.to_thread.run_sync(self._stamp_reader)
            except Exception:
                logger.exception("read cache: data stamp unreadable; serving uncached")
                reading = None
            self.apply(reading)
            return reading

    def apply(self, reading: StampReading | None) -> None:
        """Record a stamp reading; a changed (or unreadable) stamp empties the cache."""
        previous = self.reading.stamp if self.reading else None
        new = reading.stamp if reading else None
        self._checked_at = self._clock()
        if new != previous or new is None:
            self.clear()
            self.generation = (
                hashlib.sha256(f"{self.process_id}:{new}".encode()).hexdigest()[:16] if new else ""
            )
        self.reading = reading

    def clear(self) -> None:
        with self._lock:
            self._entries.clear()
            self.bytes = 0

    def get(self, key: str) -> Entry | None:
        with self._lock:
            entry = self._entries.get(key)
            if entry is None:
                return None
            if self._clock() - entry.stored_at > MAX_AGE[entry.klass]:
                del self._entries[key]
                self.bytes -= entry.size
                return None
            self._entries.move_to_end(key)
            return entry

    def put(
        self,
        key: str,
        body: bytes,
        headers: tuple[tuple[bytes, bytes], ...],
        klass: str,
        route: Any,
    ) -> bool:
        size = len(body) + len(key) + sum(len(n) + len(v) for n, v in headers)
        size += ENTRY_OVERHEAD_BYTES
        if size > self.max_bytes or len(body) > MAX_ENTRY_BYTES:
            return False
        with self._lock:
            old = self._entries.pop(key, None)
            if old is not None:
                self.bytes -= old.size
            while self._entries and self.bytes + size > self.max_bytes:
                _, evicted = self._entries.popitem(last=False)
                self.bytes -= evicted.size
                self.evictions += 1
            self._entries[key] = Entry(body, headers, klass, self._clock(), size, route)
            self.bytes += size
        return True

    def status(self, enabled: bool = True) -> dict[str, Any]:
        with self._lock:
            entries = len(self._entries)
            used = self.bytes
        return {
            "enabled": enabled,
            "entries": entries,
            "bytes": used,
            "max_bytes": self.max_bytes,
            "hits": self.hits,
            "misses": self.misses,
            "bypasses": self.bypasses,
            "evictions": self.evictions,
            "stamp": self.reading.stamp if self.reading else None,
            "running_jobs": list(self.reading.running) if self.reading else [],
            "generation": self.generation or None,
        }


def cache_key(scope: Scope, body: bytes | None) -> str:
    query = parse_qsl(scope.get("query_string", b"").decode("latin-1"), keep_blank_values=True)
    parts: list[Any] = [
        scope["method"],
        scope.get("root_path", ""),
        scope["path"],
        sorted(query, key=lambda pair: pair[0]),  # stable: repeated names keep their order
    ]
    if body is not None:
        content_type = next(
            (v.decode("latin-1") for n, v in scope["headers"] if n == b"content-type"), ""
        )
        parts += [content_type, hashlib.sha256(body).hexdigest()]
    return hashlib.sha256(json.dumps(parts).encode()).hexdigest()


# --- middleware -------------------------------------------------------------------------------


def _with_header(message: Message, label: bytes) -> Message:
    headers = [*message.get("headers", []), (b"x-cache", label)]
    return {**message, "headers": headers}


class ReadCacheMiddleware:
    """Pure ASGI, directly around the router (inside CORS and the request-context middleware)."""

    def __init__(
        self,
        app: ASGIApp,
        store: ReadCacheStore,
        source: FastAPI,
        classes: Mapping[str, CacheClass] = ROUTE_CLASSES,
    ) -> None:
        self.app = app
        self.store = store
        self._classes = classes
        self._source = source
        self._table: RouteTable | None = None

    def _routes(self) -> RouteTable:
        if self._table is None:
            self._table = RouteTable(walk_routes(self._source))
        return self._table

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        method = scope["method"]
        path = scope["path"]
        lookup = "GET" if method == "HEAD" else method
        if lookup not in ("GET", "POST") or (lookup == "POST" and not is_read_post(path)):
            await self.app(scope, receive, send)
            return
        entry = self._routes().resolve(lookup, path)
        if entry is None:
            await self.app(scope, receive, send)
            return
        klass = self._classes.get(f"{lookup} {entry.path}", "never")
        credentialed = any(name in CREDENTIAL_HEADERS for name, _ in scope["headers"])
        if klass == "never" or method == "HEAD" or credentialed:
            await self._bypass(scope, receive, send)
            return

        body: bytes | None = None
        if method == "POST":
            body, receive = await _buffer_body(receive)
            if body is None:  # too large to key; never cached
                await self._bypass(scope, receive, send)
                return

        reading = await self.store.current()
        if reading is None or (klass == "stamp" and reading.running):
            await self._bypass(scope, receive, send)
            return
        key = cache_key(scope, body)
        hit = self.store.get(key)
        if hit is not None:
            self.store.hits += 1
            scope["route"] = hit.route  # metrics label the hit with its route
            await send(
                {
                    "type": "http.response.start",
                    "status": 200,
                    "headers": [
                        *hit.headers,
                        (b"content-length", str(len(hit.body)).encode()),
                        (b"x-cache", b"hit"),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": hit.body})
            return

        self.store.misses += 1
        generation = self.store.generation
        headers_to_store: tuple[tuple[bytes, bytes], ...] | None = None
        chunks: list[bytes] = []
        size = 0

        async def capture(message: Message) -> None:
            nonlocal headers_to_store, size
            if message["type"] == "http.response.start":
                headers = [(name.lower(), value) for name, value in message.get("headers", [])]
                names = {name for name, _ in headers}
                content_type = next((v for n, v in headers if n == b"content-type"), b"")
                if (
                    message["status"] == 200
                    and names <= STORED_HEADERS
                    and content_type.startswith(b"application/json")
                ):
                    headers_to_store = tuple((n, v) for n, v in headers if n == b"content-type")
                await send(_with_header(message, b"miss"))
                return
            if message["type"] == "http.response.body" and headers_to_store is not None:
                chunk = message.get("body", b"")
                size += len(chunk)
                if size > MAX_ENTRY_BYTES:
                    headers_to_store = None
                    chunks.clear()
                else:
                    chunks.append(chunk)
                if headers_to_store is not None and not message.get("more_body", False):
                    # Stored before the last chunk goes out, so the client's next request finds
                    # it (code after `await self.app` runs only once outer middleware finishes).
                    if scope.get("route") is entry.route and self.store.generation == generation:
                        self.store.put(key, b"".join(chunks), headers_to_store, klass, entry.route)
                    headers_to_store = None
            await send(message)

        await self.app(scope, receive, capture)

    async def _bypass(self, scope: Scope, receive: Receive, send: Send) -> None:
        self.store.bypasses += 1

        async def label(message: Message) -> None:
            if message["type"] == "http.response.start":
                message = _with_header(message, b"bypass")
            await send(message)

        await self.app(scope, receive, label)


async def _buffer_body(receive: Receive) -> tuple[bytes | None, Receive]:
    """Read a request body for its key, and a receive that replays it to the route."""
    messages: list[Message] = []
    size = 0
    while True:
        message = await receive()
        messages.append(message)
        if message["type"] != "http.request":
            break
        size += len(message.get("body", b""))
        if size > MAX_REQUEST_BODY_BYTES or not message.get("more_body", False):
            break
    replay = list(messages)

    async def replaying() -> Message:
        if replay:
            return replay.pop(0)
        return await receive()

    complete = (
        size <= MAX_REQUEST_BODY_BYTES
        and messages[-1]["type"] == "http.request"
        and not messages[-1].get("more_body", False)
    )
    body = b"".join(m.get("body", b"") for m in messages) if complete else None
    return body, replaying


# --- status route -----------------------------------------------------------------------------

router = APIRouter(tags=["operations"])


@router.get("/cache/status")
def cache_status(request: Request) -> dict[str, Any]:
    """The read cache: entries, bytes, hits, misses, the data stamp and its generation."""
    store: ReadCacheStore | None = getattr(request.app.state, "read_cache", None)
    if store is None:
        return {"enabled": False}
    return store.status()
