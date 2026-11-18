"""Warm the API read cache after each data change (speed plan SP02).

`courtlens warm-site` requests pages from the dashboard, two at a time, so the API read cache is
filled by the same server renders visitors trigger: the top-level pages, all 30 team pages and the
page of every player on a current roster, each in its default scope (exactly the href
`dashboard/lib/entity-links.ts` builds, so the cache keys are the ones a click makes). Rosters come
from the newest sealed ESPN roster bundle, the same source free agency and Live read.

It crawls only a settled generation: no scheduled job running (`running_jobs` empty at
`/api/cache/status`) and the generation unchanged across one stamp recheck. It crawls only when
that generation differs from the one its last complete crawl warmed. The generation is read again
at the end; a crawl whose generation moved underneath it is recorded as `stale`, so the next jobs
loop crawls again.

Its health record is `data/derived/job-health/warm-site.json`. The data stamp never reads it: the
stamp hashes only the `scheduled_jobs.JOBS` records and the bump file, and warm-site is not a JOBS
entry. A crawl that changed the stamp would empty the cache it had just filled and then crawl
forever, so a test holds this.

A failed, stopped or skipped crawl only leaves pages on the cold path. It never fails a job, never
sends a cookie or credential header (any of those makes every API read a bypass), and stops after
repeated 5xx responses or when its deadline passes.
"""

from __future__ import annotations

import json
import logging
import os
import statistics
import sys
import threading
import time
from collections.abc import Callable, Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime
from http.cookiejar import CookieJar, DefaultCookiePolicy
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx

logger = logging.getLogger(__name__)

HEALTH_DIR = Path("data/derived/job-health")
# Not a scheduled job's name and not the bump file: the data stamp never reads it.
HEALTH_FILE = "warm-site.json"
CONCURRENCY = 2  # plan rule: the VPS is shared
MAX_CONSECUTIVE_5XX = 5
REQUEST_TIMEOUT = 30.0
DEADLINE_SECONDS = 1200.0
READY_TIMEOUT = 180.0
# One more than the API's stamp recheck (read_cache.STAMP_RECHECK_SECONDS), so a status read
# after this wait reflects a stamp checked after the previous read.
SETTLE_SECONDS = 6.0
SETTLE_ATTEMPTS = 10
USER_AGENT = "courtlens-warm-site/1"
# Outcomes after which the same generation is not crawled again. `partial` means the crawl ran
# to the end but some pages did not answer 200 (a 404 would otherwise recrawl on every loop).
DONE_OUTCOMES = frozenset({"complete", "partial"})

# The pages people open most that render published data on the server: the header's direct links
# and the menu pages whose route is `force-dynamic`. Static pages (Research, Wingspan, Draft,
# Matchups, Player Twins, Forecasts, Calculator) fetch their data from the browser, so crawling
# their HTML warms nothing. Live (`never` reads), Settings, Data Status and Planner (per viewer or
# `short`) are left out.
TOP_LEVEL_PAGES: tuple[str, ...] = (
    # Not "/": it is a config redirect to /stats (2026-11-17), so its HTML warms nothing.
    "/stats",
    "/wowy",
    "/stat-line-shift",
    "/playoffs",
    "/last-games",
    "/showcase",
    "/players",
    "/teams",
    "/standings",
    "/roster-shapes",
    "/contracts",
    "/free-agency",
    "/compare",
    "/team-compare",
    "/methodology",
)


def player_href(player_id: str) -> str:
    """`playerHref(id)` in dashboard/lib/entity-links.ts with no scope."""
    return f"/players/{quote(str(player_id).strip(), safe='')}"


def team_href(team_id: str) -> str:
    """`teamHref(id)` with no scope; a current NBA team id is its own franchise id."""
    return f"/teams/{quote(str(team_id).strip(), safe='')}"


@dataclass(frozen=True)
class CrawlList:
    urls: tuple[str, ...]
    teams: int
    players: int
    top_level: int
    roster_source: str | None


def build_urls(roster: tuple[Path, dict[str, Any]] | None) -> CrawlList:
    """Top-level pages, then team pages, then roster players (sorted, no duplicates)."""
    teams: list[str] = []
    players: list[str] = []
    source = None
    if roster is not None:
        path, body = roster
        entry = body["entry"]
        source = f"{path.name} (observed {entry.get('observed_at')})"
        teams = sorted({str(team["team_id"]) for team in entry.get("teams", [])})
        teams = teams or sorted({str(p["team_id"]) for p in entry["players"] if p.get("team_id")})
        # A player ESPN lists without a verified NBA id has no page to warm.
        players = sorted({str(p["player_id"]) for p in entry["players"] if p.get("player_id")})
    urls = [*TOP_LEVEL_PAGES, *map(team_href, teams), *map(player_href, players)]
    unique = tuple(dict.fromkeys(urls))
    return CrawlList(unique, len(teams), len(players), len(TOP_LEVEL_PAGES), source)


def load_roster() -> tuple[Path, dict[str, Any]] | None:
    from courtlens.services.espn_rosters import load_latest

    return load_latest()


# --- health record ---------------------------------------------------------------------------


def health_path(root: Path = HEALTH_DIR) -> Path:
    return root / HEALTH_FILE


def read_health(root: Path = HEALTH_DIR) -> dict[str, Any]:
    try:
        body = json.loads(health_path(root).read_text())
    except (FileNotFoundError, ValueError):
        return {}
    return body if isinstance(body, dict) else {}


def write_health(body: dict[str, Any], root: Path = HEALTH_DIR) -> None:
    root.mkdir(parents=True, exist_ok=True)
    path = health_path(root)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")
    os.replace(temporary, path)


def needs_crawl(generation: str | None, last: dict[str, Any]) -> bool:
    """A settled generation that the last complete crawl did not warm."""
    if not generation:
        return False
    return not (last.get("generation") == generation and last.get("outcome") in DONE_OUTCOMES)


# --- crawl -----------------------------------------------------------------------------------


def no_cookie_client(
    timeout: float = REQUEST_TIMEOUT, transport: httpx.BaseTransport | None = None
) -> httpx.Client:
    """No cookies are ever stored or sent, and no credential header is set."""
    jar = CookieJar(policy=DefaultCookiePolicy(allowed_domains=[]))
    return httpx.Client(
        timeout=timeout,
        transport=transport,
        cookies=jar,
        follow_redirects=False,
        headers={"user-agent": USER_AGENT},
    )


@dataclass
class CrawlResult:
    pages: int = 0
    ok: int = 0
    failures: list[dict[str, Any]] = field(default_factory=list)
    seconds: list[float] = field(default_factory=list)
    slowest: tuple[str, float] | None = None
    stopped: str | None = None


def crawl(
    get: Callable[[str], int],
    paths: Iterable[str],
    concurrency: int = CONCURRENCY,
    max_consecutive_5xx: int = MAX_CONSECUTIVE_5XX,
    deadline: float | None = None,
    clock: Callable[[], float] = time.monotonic,
) -> CrawlResult:
    """GET every path, `concurrency` at a time; stop on repeated 5xx or the deadline.

    `get` returns the status code, or raises on a network error or timeout (counted as a 5xx).
    """
    result = CrawlResult()
    lock = threading.Lock()
    queue = iter(paths)
    stop = threading.Event()
    consecutive = 0

    def next_path() -> str | None:
        with lock:
            if stop.is_set():
                return None
            if deadline is not None and clock() >= deadline:
                result.stopped = result.stopped or "deadline passed"
                stop.set()
                return None
            return next(queue, None)

    def worker() -> None:
        nonlocal consecutive
        while (path := next_path()) is not None:
            began = clock()
            try:
                status: int | None = get(path)
                error = None
            except Exception as failure:  # network errors and timeouts
                status, error = None, f"{type(failure).__name__}: {failure}"
            took = clock() - began
            with lock:
                result.pages += 1
                result.seconds.append(took)
                if result.slowest is None or took > result.slowest[1]:
                    result.slowest = (path, took)
                if status == 200:
                    result.ok += 1
                    consecutive = 0
                    continue
                result.failures.append({"path": path, "status": status, "error": error})
                if status is None or status >= 500:
                    consecutive += 1
                    if consecutive >= max_consecutive_5xx and not stop.is_set():
                        result.stopped = f"{consecutive} server errors in a row"
                        stop.set()
                else:
                    consecutive = 0

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(concurrency)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    return result


# --- the command -----------------------------------------------------------------------------


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).isoformat(timespec="seconds")


def _cache_counts(status: dict[str, Any]) -> dict[str, Any]:
    keys = ("entries", "bytes", "max_bytes", "hits", "misses", "bypasses", "evictions")
    return {key: status.get(key) for key in keys}


@dataclass
class WarmSite:
    """One run: wait for both services, settle the generation, crawl, record."""

    base_url: str
    api_url: str
    root: Path = HEALTH_DIR
    deadline_seconds: float = DEADLINE_SECONDS
    ready_timeout: float = READY_TIMEOUT
    settle_seconds: float = SETTLE_SECONDS
    force: bool = False
    client: httpx.Client | None = None
    roster_loader: Callable[[], tuple[Path, dict[str, Any]] | None] = load_roster
    sleep: Callable[[float], None] = time.sleep
    clock: Callable[[], float] = time.monotonic
    now: Callable[[], datetime] = lambda: datetime.now(UTC)
    log: Callable[[str], None] = lambda line: print(line, file=sys.stderr, flush=True)

    def _http(self) -> httpx.Client:
        if self.client is None:
            self.client = no_cookie_client()
        return self.client

    def cache_status(self) -> dict[str, Any]:
        response = self._http().get(f"{self.api_url.rstrip('/')}/api/cache/status")
        response.raise_for_status()
        body: dict[str, Any] = response.json()
        return body

    def get_page(self, path: str) -> int:
        response = self._http().get(f"{self.base_url.rstrip('/')}{path}")
        return response.status_code

    def wait_ready(self, until: float) -> str | None:
        """None once the API status and the dashboard's Stats page answer; else the reason."""
        reason = "not checked"
        while True:
            try:
                status = self.cache_status()
                if not status.get("enabled"):
                    return "the API read cache is off"
                # Not "/": that is a redirect to /stats, and redirects are not followed.
                code = self.get_page("/stats")
                if code == 200:
                    return None
                reason = f"dashboard answered {code}"
            except (httpx.HTTPError, ValueError) as error:
                reason = f"{type(error).__name__}: {error}"
            if self.clock() >= until:
                return f"not ready after {self.ready_timeout:.0f} s ({reason})"
            self.sleep(5.0)

    def settled(self) -> tuple[dict[str, Any] | None, str | None]:
        """The status of a settled generation, or the reason there is none now."""
        previous = self.cache_status()
        for _ in range(SETTLE_ATTEMPTS):
            if previous.get("running_jobs"):
                return None, f"jobs running: {', '.join(previous['running_jobs'])}"
            self.sleep(self.settle_seconds)
            current = self.cache_status()
            if (
                current.get("generation")
                and current.get("generation") == previous.get("generation")
                and not current.get("running_jobs")
            ):
                return current, None
            previous = current
        return None, "the generation did not settle"

    def run(self) -> dict[str, Any]:
        started_at = self.now()
        began = self.clock()
        deadline = began + self.deadline_seconds
        last = read_health(self.root)
        record: dict[str, Any] = {
            "command": "courtlens warm-site",
            "base_url": self.base_url,
            "api_url": self.api_url,
            "started": _iso(started_at),
        }

        def finish(outcome: str, **extra: Any) -> dict[str, Any]:
            record.update(outcome=outcome, finished=_iso(self.now()), **extra)
            record["seconds"] = round(self.clock() - began, 1)
            if outcome != "skipped":
                write_health(record, self.root)
            self.log(json.dumps({k: v for k, v in record.items() if k != "failures"}))
            return record

        problem = self.wait_ready(min(deadline, began + self.ready_timeout))
        if problem:
            return finish("not-ready", reason=problem, generation=last.get("generation"))
        before, reason = self.settled()
        if before is None:
            # Nothing crawled; the previous record (if any) still says what was warmed.
            return finish("skipped", reason=reason)
        generation = before["generation"]
        if not self.force and not needs_crawl(generation, last):
            return finish("skipped", reason="generation already warmed", generation=generation)

        listing = build_urls(self.roster_loader())
        record.update(
            generation=generation,
            urls=len(listing.urls),
            top_level=listing.top_level,
            teams=listing.teams,
            roster_players=listing.players,
            roster_source=listing.roster_source,
            cache_before=_cache_counts(before),
        )
        self.log(f"warm-site: {len(listing.urls)} pages for generation {generation}")
        crawl_began = self.clock()
        result = crawl(self.get_page, listing.urls, deadline=deadline, clock=self.clock)
        crawl_seconds = self.clock() - crawl_began

        # One stamp recheck later, so a change made during the crawl is seen.
        self.sleep(self.settle_seconds)
        try:
            after = self.cache_status()
        except (httpx.HTTPError, ValueError) as error:
            after = {"error": f"{type(error).__name__}: {error}"}
        record.update(
            pages=result.pages,
            ok=result.ok,
            failed=len(result.failures),
            failures=result.failures[:50],
            median_seconds=(
                round(statistics.median(result.seconds), 3) if result.seconds else None
            ),
            slowest={"path": result.slowest[0], "seconds": round(result.slowest[1], 3)}
            if result.slowest
            else None,
            crawl_seconds=round(crawl_seconds, 1),
            cache_after=_cache_counts(after),
            generation_after=after.get("generation"),
        )
        if result.stopped:
            return finish("stopped", reason=result.stopped)
        if after.get("generation") != generation:
            # The data changed during the crawl: the next loop crawls the new generation.
            return finish("stale", reason="the generation moved during the crawl")
        if result.failures:
            return finish("partial", reason=f"{len(result.failures)} pages did not answer 200")
        return finish("complete")


def warm_site(**options: Any) -> dict[str, Any]:
    """Run once; any unexpected error is recorded, never raised (a crawl never fails a job)."""
    runner = WarmSite(**options)
    try:
        return runner.run()
    except Exception as error:
        logger.exception("warm-site failed")
        record = {
            "command": "courtlens warm-site",
            "outcome": "error",
            "reason": f"{type(error).__name__}: {error}",
            "finished": _iso(datetime.now(UTC)),
            "generation": read_health(runner.root).get("generation"),
        }
        try:
            write_health(record, runner.root)
        except OSError:
            logger.exception("warm-site: health record not written")
        return record
    finally:
        if runner.client is not None:
            runner.client.close()
