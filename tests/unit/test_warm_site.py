"""The warm crawl after each data change (speed plan SP02)."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from typer.testing import CliRunner

from courtlens.api import read_cache
from courtlens.services import scheduled_jobs, warm_site
from courtlens.services.warm_site import (
    TOP_LEVEL_PAGES,
    WarmSite,
    build_urls,
    crawl,
    needs_crawl,
    read_health,
    write_health,
)

ROOT = Path(__file__).resolve().parents[2]
TEAM_IDS = [str(1610612737 + n) for n in range(30)]


def _roster() -> tuple[Path, dict[str, Any]]:
    players = [
        {"name": f"P{n}", "player_id": str(1000 + n), "team_id": TEAM_IDS[n % 30]}
        for n in range(60)
    ]
    players.append({"name": "Unmatched", "player_id": None, "team_id": TEAM_IDS[0]})
    players.append({"name": "Twice", "player_id": "1000", "team_id": TEAM_IDS[1]})
    teams = [{"team_id": team, "tricode": f"T{n}"} for n, team in enumerate(TEAM_IDS)]
    body = {
        "entry": {"observed_at": "2026-11-13T16:22:14+00:00", "players": players, "teams": teams}
    }
    return Path("abc.json"), body


# --- the URL list ----------------------------------------------------------------------------


def test_url_list_holds_top_level_pages_every_team_and_every_roster_player() -> None:
    listing = build_urls(_roster())
    assert listing.top_level == len(TOP_LEVEL_PAGES)
    assert listing.teams == 30 and listing.players == 60
    assert len(listing.urls) == len(TOP_LEVEL_PAGES) + 30 + 60
    assert listing.urls[: len(TOP_LEVEL_PAGES)] == TOP_LEVEL_PAGES
    assert {f"/teams/{team}" for team in TEAM_IDS} <= set(listing.urls)
    assert {f"/players/{1000 + n}" for n in range(60)} <= set(listing.urls)
    # Default scope: exactly the href entity-links.ts builds with no scope, so no query string.
    assert not any("?" in url or "#" in url for url in listing.urls)
    assert "/players/None" not in listing.urls
    assert len(set(listing.urls)) == len(listing.urls)
    assert listing.roster_source and listing.roster_source.startswith("abc.json")


def test_url_list_without_a_roster_bundle_is_the_top_level_pages() -> None:
    listing = build_urls(None)
    assert listing.urls == TOP_LEVEL_PAGES and listing.teams == listing.players == 0


def test_top_level_pages_render_on_the_server_and_leave_out_live_and_viewer_pages() -> None:
    nav = (ROOT / "dashboard/lib/nav-model.ts").read_text()
    for page in TOP_LEVEL_PAGES:
        route = ROOT / "dashboard/app" / page.lstrip("/") / "page.tsx"
        assert route.exists(), page
        # A static page fetches its data from the browser: crawling its HTML warms nothing.
        assert 'dynamic = "force-dynamic"' in route.read_text(), f"{page} is not server-rendered"
        assert f'"{page}"' in nav, f"{page} is not in the navigation"
    assert not {"/live", "/settings", "/planner", "/data-status"} & set(TOP_LEVEL_PAGES)


def test_hrefs_match_entity_links() -> None:
    source = (ROOT / "dashboard/lib/entity-links.ts").read_text()
    assert "return `/players/${encodeURIComponent(String(id).trim())}${scopeQuery(scope)}" in source
    assert "return `/teams/${encodeURIComponent(teamLinkId(team, scope?.season))}" in source
    assert warm_site.player_href(" 2544 ") == "/players/2544"
    assert warm_site.team_href("1610612747") == "/teams/1610612747"


# --- the generation check --------------------------------------------------------------------


def test_needs_crawl_only_for_a_generation_not_yet_warmed() -> None:
    assert needs_crawl("g1", {})
    assert not needs_crawl("g1", {"generation": "g1", "outcome": "complete"})
    assert not needs_crawl("g1", {"generation": "g1", "outcome": "partial"})
    assert needs_crawl("g2", {"generation": "g1", "outcome": "complete"})
    for outcome in ("stale", "stopped", "error", "not-ready"):
        assert needs_crawl("g1", {"generation": "g1", "outcome": outcome})
    assert not needs_crawl(None, {})


class FakeSite:
    """A dashboard and an API status route behind one MockTransport."""

    def __init__(self, statuses: list[dict[str, Any]], page_status: int = 200) -> None:
        self.statuses = statuses
        self.page_status = page_status
        self.pages: list[str] = []
        self.searches: list[str] = []
        self.request_headers: list[httpx.Headers] = []

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.request_headers.append(request.headers)
        if request.url.path == "/api/cache/status":
            body = self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]
            return httpx.Response(200, json=body)
        if request.url.path == "/api/workbench/lookup":
            self.searches.append(str(request.url))
            return httpx.Response(200, json={"items": []})
        self.pages.append(request.url.path)
        # A dashboard that sets a cookie must never get it back.
        return httpx.Response(
            self.page_status, text="<html>", headers={"set-cookie": "v=1; Path=/"}
        )


def _status(
    generation: str | None, running: list[str] | None = None, **extra: Any
) -> dict[str, Any]:
    return {
        "enabled": True,
        "generation": generation,
        "running_jobs": running or [],
        "entries": 0,
        "bytes": 0,
        "misses": 0,
        **extra,
    }


def _runner(site: FakeSite, root: Path, **options: Any) -> WarmSite:
    client = warm_site.no_cookie_client(transport=httpx.MockTransport(site.handler))
    return WarmSite(
        base_url="http://dashboard:3000",
        api_url="http://api:8000",
        root=root,
        client=client,
        roster_loader=_roster,
        sleep=lambda _: None,
        log=lambda _: None,
        **options,
    )


def test_a_new_settled_generation_is_crawled_and_recorded(tmp_path: Path) -> None:
    site = FakeSite([_status("g1")])
    record = _runner(site, tmp_path).run()
    assert record["outcome"] == "complete"
    assert record["generation"] == record["generation_after"] == "g1"
    assert record["pages"] == record["ok"] == len(TOP_LEVEL_PAGES) + 90
    assert set(site.pages) >= {"/teams/1610612747", "/players/1000"}
    assert read_health(tmp_path)["generation"] == "g1"
    # The new data's search index is built once, before the pages (SP09).
    assert site.searches == ["http://api:8000/api/workbench/lookup?q="]
    assert record["search_index"]["status"] == 200
    for headers in site.request_headers:  # no cookie and no credential header, ever
        names = {name.lower().encode() for name in headers}
        assert not names & read_cache.CREDENTIAL_HEADERS


def test_the_same_generation_is_not_crawled_twice(tmp_path: Path) -> None:
    write_health({"generation": "g1", "outcome": "complete"}, tmp_path)
    site = FakeSite([_status("g1")])
    record = _runner(site, tmp_path).run()
    assert record["outcome"] == "skipped"
    assert site.pages == ["/stats"]  # the readiness check only
    assert site.searches == []


def test_no_crawl_while_a_job_runs(tmp_path: Path) -> None:
    site = FakeSite([_status("g1", ["daily"])])
    record = _runner(site, tmp_path).run()
    assert record["outcome"] == "skipped" and "daily" in record["reason"]
    assert site.pages == ["/stats"]
    assert read_health(tmp_path) == {}  # a skip leaves the last record alone


def test_waits_until_the_generation_holds_across_a_recheck(tmp_path: Path) -> None:
    # g0 then g1 (a stamp change was still landing), then g1 again: crawl g1.
    site = FakeSite([_status("g0"), _status("g0"), _status("g1"), _status("g1")])
    record = _runner(site, tmp_path).run()
    assert record["outcome"] == "complete" and record["generation"] == "g1"


def test_a_generation_that_moves_during_the_crawl_is_recorded_stale(tmp_path: Path) -> None:
    statuses = [_status("g1"), _status("g1"), _status("g1"), _status("g2")]
    site = FakeSite(statuses)
    record = _runner(site, tmp_path).run()
    assert record["outcome"] == "stale" and record["generation_after"] == "g2"
    assert needs_crawl("g2", read_health(tmp_path))
    assert needs_crawl("g1", read_health(tmp_path))


def test_a_dashboard_that_never_answers_stops_within_the_ready_timeout(tmp_path: Path) -> None:
    site = FakeSite([_status("g1")], page_status=502)
    ticks = iter(range(0, 10_000, 5))
    record = _runner(site, tmp_path, ready_timeout=30, clock=lambda: float(next(ticks))).run()
    assert record["outcome"] == "not-ready" and "502" in record["reason"]
    assert len(site.pages) <= 8


def test_cache_off_is_not_ready(tmp_path: Path) -> None:
    site = FakeSite([{"enabled": False}])
    assert _runner(site, tmp_path).run()["outcome"] == "not-ready"


def test_an_unexpected_error_is_recorded_not_raised(tmp_path: Path) -> None:
    def broken() -> Any:
        raise RuntimeError("bundle unreadable")

    site = FakeSite([_status("g1")])
    record = warm_site.warm_site(
        base_url="http://dashboard:3000",
        api_url="http://api:8000",
        root=tmp_path,
        client=warm_site.no_cookie_client(transport=httpx.MockTransport(site.handler)),
        roster_loader=broken,
        sleep=lambda _: None,
        log=lambda _: None,
    )
    assert record["outcome"] == "error" and "bundle unreadable" in record["reason"]
    assert read_health(tmp_path)["outcome"] == "error"


# --- the failure stop ------------------------------------------------------------------------


def _pages(n: int) -> list[str]:
    return [f"/p/{i}" for i in range(n)]


def test_a_failed_search_warm_up_is_recorded_and_the_crawl_goes_on(tmp_path: Path) -> None:
    site = FakeSite([_status("g1")])

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/api/workbench/lookup":
            raise httpx.ReadTimeout("index still building", request=request)
        return site.handler(request)

    record = WarmSite(
        base_url="http://dashboard:3000",
        api_url="http://api:8000",
        root=tmp_path,
        client=warm_site.no_cookie_client(transport=httpx.MockTransport(handler)),
        roster_loader=_roster,
        sleep=lambda _: None,
        log=lambda _: None,
    ).run()
    assert record["outcome"] == "complete"
    assert record["search_index"]["error"] == "ReadTimeout"


def test_crawl_stops_after_repeated_server_errors() -> None:
    asked: list[str] = []

    def get(path: str) -> int:
        asked.append(path)
        return 503

    result = crawl(get, _pages(100), concurrency=2, max_consecutive_5xx=5)
    assert (result.stopped or "").endswith("server errors in a row")
    assert len(asked) <= 6  # two workers: at most one more request in flight
    assert result.ok == 0


def test_network_errors_count_as_server_errors_and_a_404_resets_the_run() -> None:
    def get(path: str) -> int:
        index = int(path.rsplit("/", 1)[1])
        if index % 4 == 3:
            return 404
        raise httpx.ConnectError("refused")

    result = crawl(get, _pages(40), concurrency=1, max_consecutive_5xx=5)
    assert result.stopped is None  # never 5 in a row: every fourth page is a 404
    assert result.pages == 40 and len(result.failures) == 40


def test_crawl_stops_at_its_deadline() -> None:
    now = [0.0]

    def get(path: str) -> int:
        now[0] += 10
        return 200

    result = crawl(get, _pages(100), concurrency=1, deadline=55, clock=lambda: now[0])
    assert result.stopped == "deadline passed" and result.ok == 6


def test_crawl_counts_and_concurrency() -> None:
    import threading

    active, peak = [0], [0]
    lock = threading.Lock()

    def get(path: str) -> int:
        with lock:
            active[0] += 1
            peak[0] = max(peak[0], active[0])
        import time

        time.sleep(0.005)
        with lock:
            active[0] -= 1
        return 200

    result = crawl(get, _pages(30))
    assert result.ok == result.pages == 30 and result.failures == []
    assert peak[0] <= warm_site.CONCURRENCY == 2
    assert result.slowest is not None and len(result.seconds) == 30


# --- the data stamp never moves for the crawl ------------------------------------------------


def test_writing_a_crawl_health_record_does_not_change_the_data_stamp(tmp_path: Path) -> None:
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
    derived.mkdir()
    moment = datetime(2026, 11, 14, 18, 0, tzinfo=UTC)

    def stamp() -> read_cache.StampReading:
        return read_cache.read_data_stamp(sessions, health, derived, now=lambda: moment)

    before = stamp()
    site = FakeSite([_status("g1")])
    record = _runner(site, health).run()  # a whole crawl, writing its record where jobs write
    assert record["outcome"] == "complete"
    assert (health / warm_site.HEALTH_FILE).exists()
    write_health({**record, "last_started": "x", "last_finished": "y"}, health)
    assert stamp() == before
    assert warm_site.HEALTH_FILE != read_cache.BUMP_FILE
    assert "warm-site" not in scheduled_jobs.BY_NAME
    assert all(f"{job.name}.json" != warm_site.HEALTH_FILE for job in scheduled_jobs.JOBS)


# --- the jobs loop's stdout contract --------------------------------------------------------


def test_run_jobs_next_wake_prints_only_the_wake_seconds_on_stdout(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from courtlens.cli import app

    report = [{"job": "daily", "last_exit": 0, "last_output": "lots of output\n"}]
    monkeypatch.setattr(scheduled_jobs, "run_due", lambda: report)
    monkeypatch.setattr(scheduled_jobs, "seconds_to_next", lambda: 4321)
    result = CliRunner().invoke(app, ["run-jobs", "--next-wake"])
    assert result.exit_code == 0
    assert result.stdout.splitlines() == ["4321"]
    assert json.loads(result.stderr.splitlines()[0])["job"] == "daily"


def test_warm_site_command_prints_nothing_on_stdout(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from courtlens.cli import app

    site = FakeSite([_status("g1")])
    real = warm_site.warm_site
    logged: list[str] = []

    def fake(**options: Any) -> dict[str, Any]:
        runner = _runner(site, tmp_path)
        return real(
            **options,
            root=tmp_path,
            client=runner.client,
            roster_loader=_roster,
            sleep=lambda _: None,
            log=logged.append,
        )

    monkeypatch.setattr(warm_site, "warm_site", fake)
    result = CliRunner().invoke(app, ["warm-site", "--base-url", "http://dashboard:3000"])
    assert result.exit_code == 0, result.output
    assert result.stdout == ""
    assert json.loads(logged[-1])["outcome"] == "complete"


def test_the_jobs_loop_runs_the_crawl_as_its_own_bounded_step() -> None:
    compose = (ROOT / "deploy/compose.prod.yml").read_text()
    loop = compose.split("  jobs:", 1)[1].split("\n  api:", 1)[0]
    assert "wait=$$(courtlens run-jobs --next-wake | tail -n 1);" in loop
    assert "timeout 1500 courtlens warm-site >&2 || " in loop
    assert (
        loop.index("run-jobs --next-wake") < loop.index("warm-site") < loop.index('sleep "$$wait"')
    )
    assert "COURTLENS_WARM_BASE_URL: http://dashboard:3000" in loop
    assert "COURTLENS_WARM_API_URL: http://api:8000" in loop


def test_status_route_rechecks_the_stamp() -> None:
    import asyncio

    calls: list[int] = []

    def reader() -> read_cache.StampReading:
        calls.append(1)
        return read_cache.StampReading(f"s{len(calls)}", ())

    store = read_cache.ReadCacheStore(reader, recheck_seconds=0)

    class App:
        class state:
            read_cache = store

    class FakeRequest:
        app = App

    first = asyncio.run(read_cache.cache_status(FakeRequest()))  # type: ignore[arg-type]
    second = asyncio.run(read_cache.cache_status(FakeRequest()))  # type: ignore[arg-type]
    assert first["stamp"] == "s1" and second["stamp"] == "s2"
    assert first["generation"] != second["generation"]
