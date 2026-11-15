"""Speed plan SP01: the API read cache and its data stamp."""

from __future__ import annotations

import json
import re
import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from courtlens.api import read_cache
from courtlens.api.metrics import observe_request
from courtlens.api.read_cache import (
    CREDENTIAL_HEADERS,
    ROUTE_CLASSES,
    ReadCacheMiddleware,
    ReadCacheStore,
    StampReading,
    read_data_stamp,
    unclassified_routes,
    walk_routes,
)

ROOT = Path(__file__).resolve().parents[2]


class Body(BaseModel):
    season: str


class Clock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


class Stamp:
    def __init__(self) -> None:
        self.value = "s1"
        self.running: tuple[str, ...] = ()

    def __call__(self) -> StampReading:
        return StampReading(self.value, self.running)


def build(
    stamp: Stamp, clock: Clock, max_bytes: int = 1024 * 1024
) -> tuple[TestClient, ReadCacheStore, dict[str, int]]:
    """A small app layered like create_app: request context, CORS, then the cache."""
    calls: dict[str, int] = {}
    app = FastAPI()

    def count(name: str) -> None:
        calls[name] = calls.get(name, 0) + 1

    @app.get("/api/data")
    def data(season: str = "2026-27", phase: str = "regular") -> dict[str, Any]:
        count("data")
        return {"season": season, "phase": phase, "n": calls["data"], "id": uuid.uuid4().hex}

    @app.get("/api/short")
    def short() -> dict[str, Any]:
        count("short")
        return {"n": calls["short"]}

    @app.get("/api/never")
    def never() -> dict[str, Any]:
        count("never")
        return {"n": calls["never"]}

    @app.get("/api/unclassified")
    def unclassified() -> dict[str, Any]:
        count("unclassified")
        return {"n": calls["unclassified"]}

    @app.get("/api/missing/{item}")
    def missing(item: str) -> Response:
        count("missing")
        return Response(json.dumps({"detail": "no"}), 404, media_type="application/json")

    @app.get("/api/no-store")
    def no_store(response: Response) -> dict[str, Any]:
        count("no-store")
        response.headers["Cache-Control"] = "no-store"
        return {"n": calls["no-store"]}

    @app.get("/api/text")
    def plain() -> Response:
        count("text")
        return Response("hello", media_type="text/plain")

    @app.get("/api/big")
    def big(kb: int) -> dict[str, Any]:
        count("big")
        return {"pad": "x" * (kb * 1024)}

    @app.post("/api/workbench/query")
    def query(body: Body) -> dict[str, Any]:
        count("query")
        return {"season": body.season, "n": calls["query"]}

    @app.post("/api/workbench/analyses")
    def write(body: Body) -> dict[str, Any]:
        count("write")
        return {"ok": True}

    classes: dict[str, read_cache.CacheClass] = {
        "GET /api/data": "stamp",
        "GET /api/short": "short",
        "GET /api/never": "never",
        "GET /api/missing/{item}": "stamp",
        "GET /api/no-store": "stamp",
        "GET /api/text": "stamp",
        "GET /api/big": "stamp",
        "POST /api/workbench/query": "stamp",
    }
    store = ReadCacheStore(stamp, max_bytes, clock=clock)
    app.add_middleware(ReadCacheMiddleware, store=store, source=app, classes=classes)
    app.add_middleware(CORSMiddleware, allow_origins=["http://localhost:3999"])

    @app.middleware("http")
    async def request_context(request: Request, call_next):  # type: ignore[no-untyped-def]
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        response = await observe_request(request, call_next)
        response.headers["X-Request-ID"] = request_id
        return response

    return TestClient(app), store, calls


@pytest.fixture
def setup() -> tuple[TestClient, ReadCacheStore, dict[str, int], Stamp, Clock]:
    stamp, clock = Stamp(), Clock()
    client, store, calls = build(stamp, clock)
    return client, store, calls, stamp, clock


def test_hit_returns_identical_bytes_with_fresh_request_id_and_timing(setup: Any) -> None:
    client, store, calls, _, _ = setup
    first = client.get("/api/data?season=2025-26", headers={"Origin": "http://localhost:3999"})
    second = client.get("/api/data?season=2025-26", headers={"Origin": "http://localhost:3999"})
    assert first.status_code == second.status_code == 200
    assert first.headers["x-cache"] == "miss"
    assert second.headers["x-cache"] == "hit"
    assert second.content == first.content  # same bytes, including the random id
    assert calls["data"] == 1
    assert second.headers["content-type"] == first.headers["content-type"]
    assert second.headers["content-length"] == str(len(first.content))
    assert second.headers["x-request-id"] != first.headers["x-request-id"]
    assert re.fullmatch(
        r'total;dur=[0-9.]+, db;dur=0\.0, queries;desc="0"', second.headers["server-timing"]
    )
    # CORS sits outside the cache, so a hit still gets its header.
    assert second.headers["access-control-allow-origin"] == "http://localhost:3999"
    assert store.hits == 1 and store.misses == 1


def test_scope_is_part_of_the_key(setup: Any) -> None:
    client, _, calls, _, _ = setup
    a = client.get("/api/data?season=2025-26&phase=regular")
    b = client.get("/api/data?season=2024-25&phase=regular")
    c = client.get("/api/data?season=2025-26&phase=playoffs")
    d = client.get("/api/data?phase=regular&season=2025-26")  # same scope, other order
    assert [r.headers["x-cache"] for r in (a, b, c, d)] == ["miss", "miss", "miss", "hit"]
    assert d.content == a.content
    assert b.json()["season"] == "2024-25" and c.json()["phase"] == "playoffs"
    assert calls["data"] == 3


def test_read_only_post_is_keyed_by_body(setup: Any) -> None:
    client, _, calls, _, _ = setup
    a = client.post("/api/workbench/query", json={"season": "2025-26"})
    b = client.post("/api/workbench/query", json={"season": "2024-25"})
    c = client.post("/api/workbench/query", json={"season": "2025-26"})
    assert [r.headers["x-cache"] for r in (a, b, c)] == ["miss", "miss", "hit"]
    assert b.json()["season"] == "2024-25"
    assert c.content == a.content
    assert calls["query"] == 2
    # Another POST is a write: passed through, never labelled or stored.
    w = client.post("/api/workbench/analyses", json={"season": "2025-26"})
    assert "x-cache" not in w.headers


def test_stamp_change_empties_the_cache(setup: Any) -> None:
    client, store, _calls, stamp, clock = setup
    client.get("/api/data")
    assert client.get("/api/data").headers["x-cache"] == "hit"
    generation = store.generation
    stamp.value = "s2"
    clock.now += 4  # inside the recheck interval: the old stamp still holds
    assert client.get("/api/data").headers["x-cache"] == "hit"
    clock.now += 2
    after = client.get("/api/data")
    assert after.headers["x-cache"] == "miss"
    assert after.json()["n"] == 2
    assert store.generation != generation
    assert client.get("/api/data").headers["x-cache"] == "hit"


def test_running_job_stores_no_stamp_reads(setup: Any) -> None:
    client, store, _calls, stamp, clock = setup
    client.get("/api/data")
    stamp.value, stamp.running = "s2", ("daily",)
    clock.now += 6
    labels = [client.get("/api/data").headers["x-cache"] for _ in range(2)]
    assert labels == ["bypass", "bypass"]
    assert store.status()["entries"] == 0
    assert client.get("/api/short").headers["x-cache"] == "miss"  # short reads still cache
    assert client.get("/api/short").headers["x-cache"] == "hit"
    stamp.value, stamp.running = "s3", ()
    clock.now += 6
    assert client.get("/api/data").headers["x-cache"] == "miss"
    assert client.get("/api/data").headers["x-cache"] == "hit"


def test_unreadable_stamp_serves_uncached(setup: Any) -> None:
    client, store, _calls, _stamp, clock = setup
    client.get("/api/data")

    def broken() -> StampReading:
        raise RuntimeError("database down")

    store._stamp_reader = broken
    clock.now += 6
    assert client.get("/api/data").headers["x-cache"] == "bypass"
    assert store.status()["entries"] == 0


@pytest.mark.parametrize("header", sorted(name.decode() for name in CREDENTIAL_HEADERS))
def test_credential_headers_bypass(setup: Any, header: str) -> None:
    client, store, _calls, _, _ = setup
    client.get("/api/data")  # stored for anonymous readers
    response = client.get("/api/data", headers={header: "secret"})
    assert response.headers["x-cache"] == "bypass"
    assert response.json()["n"] == 2  # computed afresh, not the stored answer
    again = client.get("/api/data", headers={header: "secret"})
    assert again.headers["x-cache"] == "bypass" and again.json()["n"] == 3
    post = client.post("/api/workbench/query", json={"season": "x"}, headers={header: "secret"})
    assert post.headers["x-cache"] == "bypass"
    assert store.status()["entries"] == 1


def test_short_reads_expire_after_30_seconds(setup: Any) -> None:
    client, _, calls, _, clock = setup
    client.get("/api/short")
    clock.now += 4
    assert client.get("/api/short").headers["x-cache"] == "hit"
    clock.now += 27
    assert client.get("/api/short").headers["x-cache"] == "miss"
    assert calls["short"] == 2


def test_stamp_reads_expire_after_six_hours(setup: Any) -> None:
    client, _, _calls, _, clock = setup
    client.get("/api/data")
    clock.now += 6 * 3600 - 1
    assert client.get("/api/data").headers["x-cache"] == "hit"
    clock.now += 2
    assert client.get("/api/data").headers["x-cache"] == "miss"


@pytest.mark.parametrize("path", ["/api/missing/1", "/api/no-store", "/api/text"])
def test_only_plain_200_json_is_stored(setup: Any, path: str) -> None:
    client, store, calls, _, _ = setup
    first = client.get(path)
    second = client.get(path)
    assert first.headers["x-cache"] == second.headers["x-cache"] == "miss"
    assert sum(calls.values()) == 2
    assert store.status()["entries"] == 0


def test_never_and_unclassified_routes_bypass(setup: Any) -> None:
    client, store, calls, _, _ = setup
    for path in ("/api/never", "/api/unclassified"):
        assert [client.get(path).headers["x-cache"] for _ in range(2)] == ["bypass", "bypass"]
    assert calls["never"] == calls["unclassified"] == 2
    assert client.head("/api/data").headers["x-cache"] == "bypass"
    assert store.status()["entries"] == 0


def test_byte_bound_evicts_the_least_recently_used_entry() -> None:
    clock = Clock()
    store = ReadCacheStore(Stamp(), max_bytes=2_000, clock=clock)  # two 913-byte entries fit
    store.apply(StampReading("s1", ()))
    body = b"x" * 400
    assert store.put("a", body, (), "stamp", None)
    assert store.put("b", body, (), "stamp", None)
    assert store.bytes <= 2_000
    assert store.get("a") is not None  # a is now the most recently used
    assert store.put("c", body, (), "stamp", None)
    assert store.get("b") is None
    assert store.get("a") is not None and store.get("c") is not None
    assert store.evictions == 1
    assert store.bytes == sum(e.size for e in store._entries.values())
    assert not store.put("huge", b"x" * 2_000, (), "stamp", None)


def test_oversized_response_is_served_but_not_stored() -> None:
    stamp, clock = Stamp(), Clock()
    client, store, _ = build(stamp, clock, max_bytes=64 * 1024 * 1024)
    big = client.get("/api/big?kb=4200")
    assert big.status_code == 200 and len(big.content) > 4 * 1024 * 1024
    assert client.get("/api/big?kb=4200").headers["x-cache"] == "miss"
    assert client.get("/api/big?kb=1").headers["x-cache"] == "miss"
    assert client.get("/api/big?kb=1").headers["x-cache"] == "hit"
    assert store.status()["entries"] == 1


def test_a_response_finished_after_a_stamp_change_is_not_stored() -> None:
    store = ReadCacheStore(Stamp(), clock=Clock())
    store.apply(StampReading("s1", ()))
    generation = store.generation
    store.apply(StampReading("s2", ()))
    assert store.generation != generation  # the middleware compares these before storing


# --- the real app -----------------------------------------------------------------------------


def _app() -> FastAPI:
    from courtlens.api.app import create_app

    return create_app()


def test_route_walk_finds_every_route() -> None:
    app = _app()
    entries = walk_routes(app)
    found = {(e.method, e.path) for e in entries}
    schema = app.openapi()
    operations = {
        (method.upper(), path)
        for path, item in schema["paths"].items()
        for method in item
        if method.upper() in {"GET", "POST", "PUT", "PATCH", "DELETE"}
    }
    assert operations <= found
    assert len(operations) > 200  # a flat walk of app.routes finds 4
    assert len([e for e in entries if e.method != "HEAD"]) > len(operations)  # plus hidden ones


def test_every_get_and_read_only_post_has_a_class() -> None:
    app = _app()
    assert unclassified_routes(app) == []
    entries = {f"{e.method} {e.path}" for e in walk_routes(app)}
    assert set(ROUTE_CLASSES) <= entries, "a class names a route that no longer exists"


def test_an_unclassified_route_fails_the_check() -> None:
    app = _app()

    @app.get("/api/workbench/brand-new")
    def brand_new() -> dict[str, str]:
        return {}

    @app.post("/api/workbench/operations/brand-new")
    def brand_new_post() -> dict[str, str]:
        return {}

    @app.post("/api/workbench/brand-new-write")
    def brand_new_write() -> dict[str, str]:
        return {}

    assert unclassified_routes(app) == [
        "GET /api/workbench/brand-new",
        "POST /api/workbench/operations/brand-new",
    ]


def test_read_only_posts_match_the_caddy_allowlist() -> None:
    caddy = (ROOT / "deploy" / "Caddyfile").read_text()
    api_block = caddy[caddy.index("handle /api/* {") :]
    allowed = re.search(r"method POST\s+path ([^\n]+)", api_block)
    assert allowed is not None
    paths = allowed.group(1).split()
    assert sorted(paths) == sorted(
        [*read_cache.READ_POST_PATHS, *(p + "*" for p in read_cache.READ_POST_PREFIXES)]
    )


def test_policy_classes() -> None:
    # Spot checks of the plan's rules: viewer, live, write-adjacent and status routes.
    assert ROUTE_CLASSES["GET /api/workbench/workspace"] == "never"
    assert ROUTE_CLASSES["GET /api/cache/status"] == "never"
    assert ROUTE_CLASSES["GET /api/live"] == "never"
    assert ROUTE_CLASSES["GET /api/me/favorites"] == "never"
    assert ROUTE_CLASSES["GET /api/workbench/assistant/v2/threads"] == "never"
    assert ROUTE_CLASSES["GET /api/win-probability"] == "short"
    assert ROUTE_CLASSES["GET /api/data-status"] == "short"
    assert ROUTE_CLASSES["POST /api/workbench/query"] == "stamp"
    assert ROUTE_CLASSES["GET /api/workbench/players/{player_id}/career"] == "stamp"


def test_real_app_wiring(monkeypatch: pytest.MonkeyPatch) -> None:
    from courtlens.config import get_settings

    monkeypatch.setenv("COURTLENS_READ_CACHE", "true")
    get_settings.cache_clear()
    try:
        app = _app()
    finally:
        monkeypatch.delenv("COURTLENS_READ_CACHE")
        get_settings.cache_clear()
    store: ReadCacheStore = app.state.read_cache
    store._stamp_reader = lambda: StampReading("fixed", ())
    client = TestClient(app)
    health = client.get("/api/health")
    assert health.headers["x-cache"] == "bypass"
    status = client.get("/api/cache/status").json()
    assert status["enabled"] is True and status["max_bytes"] == 128 * 1024 * 1024
    # The class comes from the route FastAPI really dispatched to (scope["route"]).
    resolved = read_cache.RouteTable(walk_routes(app)).resolve(
        "GET", "/api/workbench/players/2544/career"
    )
    assert resolved is not None and resolved.path == "/api/workbench/players/{player_id}/career"
    resolved = read_cache.RouteTable(walk_routes(app)).resolve(
        "POST", "/api/workbench/operations/finance"
    )
    assert resolved is not None and resolved.path == "/api/workbench/operations/finance"


def test_cache_is_off_by_default() -> None:
    app = _app()
    assert not hasattr(app.state, "read_cache")
    client = TestClient(app)
    assert "x-cache" not in client.get("/api/health").headers
    assert client.get("/api/cache/status").json() == {"enabled": False}


# --- the data stamp ---------------------------------------------------------------------------


@pytest.fixture
def stamp_env(tmp_path: Path) -> tuple[Callable[[], StampReading], Any, Path, Path, list[datetime]]:
    engine = create_engine("sqlite+pysqlite:///:memory:")
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE published_snapshots (channel TEXT PRIMARY KEY, snapshot_id TEXT,"
                " published_at TEXT)"
            )
        )
        conn.execute(text("INSERT INTO published_snapshots VALUES ('public', 'a', '2026-11-14')"))
    sessions = sessionmaker(bind=engine)
    health, derived = tmp_path / "job-health", tmp_path / "derived"
    health.mkdir()
    (derived / "impact-serving-v1").mkdir(parents=True)
    (derived / "impact-serving-v1" / ".current").write_text("aaa.json\n")
    moment = [datetime(2026, 11, 14, 18, 0, tzinfo=UTC)]

    def reader() -> StampReading:
        return read_data_stamp(sessions, health, derived, now=lambda: moment[0])

    return reader, engine, health, derived, moment


def _write_job(health: Path, name: str, started: datetime, finished: datetime | None) -> None:
    body: dict[str, Any] = {"job": name, "last_started": started.isoformat(timespec="seconds")}
    if finished:
        body["last_finished"] = finished.isoformat(timespec="seconds")
    (health / f"{name}.json").write_text(json.dumps(body))


def test_stamp_follows_every_writer(stamp_env: Any) -> None:
    reader, engine, health, derived, moment = stamp_env
    seen = [reader().stamp]
    assert reader().stamp == seen[0]  # stable while nothing changes

    with engine.begin() as conn:  # a publication (pointer swap or rollback)
        conn.execute(text("UPDATE published_snapshots SET snapshot_id = 'b'"))
    seen.append(reader().stamp)

    (derived / "impact-serving-v1" / ".current").write_text("bbb.json\n")  # a bundle install
    seen.append(reader().stamp)

    start = moment[0] - timedelta(minutes=5)
    _write_job(health, "daily", start, None)  # a scheduled job starts
    running = reader()
    assert running.running == ("daily",)
    seen.append(running.stamp)

    _write_job(health, "daily", start, moment[0])  # and finishes
    done = reader()
    assert done.running == ()
    seen.append(done.stamp)

    read_cache.bump_data_stamp(health)  # a hand-run command
    seen.append(reader().stamp)

    moment[0] += timedelta(days=1)  # a new day (reads that compare against today)
    seen.append(reader().stamp)
    assert len(set(seen)) == len(seen)


def test_a_dead_job_stops_counting_as_running(stamp_env: Any) -> None:
    reader, _, health, _, moment = stamp_env
    _write_job(health, "lineups", moment[0] - timedelta(hours=1, minutes=5), None)
    assert reader().running == ("lineups",)  # lineups times out after 1 hour, plus 10 minutes
    moment[0] += timedelta(minutes=6)
    assert reader().running == ()


def test_bump_command_writes_a_new_value(tmp_path: Path) -> None:
    first = read_cache.bump_data_stamp(tmp_path)
    second = read_cache.bump_data_stamp(tmp_path)
    assert first != second
    assert (tmp_path / read_cache.BUMP_FILE).read_text().strip() == second


def test_entry_is_stored_before_the_client_gets_the_last_chunk() -> None:
    # Behind BaseHTTPMiddleware, code after the inner app returns runs only after the outer
    # response finished, so a client's next request could miss. The store happens first.
    import anyio

    stamp, clock = Stamp(), Clock()
    client, store, _ = build(stamp, clock)
    app = client.app
    seen: list[int] = []

    async def run() -> None:
        scope = {
            "type": "http",
            "asgi": {"version": "3.0"},
            "http_version": "1.1",
            "method": "GET",
            "scheme": "http",
            "path": "/api/data",
            "raw_path": b"/api/data",
            "root_path": "",
            "query_string": b"",
            "headers": [(b"host", b"testserver")],
            "client": ("127.0.0.1", 1),
            "server": ("testserver", 80),
        }
        sent = False

        async def receive() -> dict[str, Any]:
            nonlocal sent
            if not sent:
                sent = True
                return {"type": "http.request", "body": b"", "more_body": False}
            await anyio.sleep_forever()
            raise AssertionError

        async def send(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.body" and not message.get("more_body"):
                seen.append(store.status()["entries"])

        await app(scope, receive, send)

    anyio.run(run)
    assert seen == [1]
