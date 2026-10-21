from collections.abc import Callable
from pathlib import Path

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.ingestion.bbref_history import (
    gamelog_url,
    league_urls,
    season_label,
    season_players,
    totals_url,
)
from courtlens.services.bbref_history import (
    RESOURCE,
    CrawlEvent,
    HistoryFetcher,
    crawl,
    validate_history_url,
)
from courtlens.workbench_models import WorkbenchAcquisition

BASE = "https://www.basketball-reference.com"


def totals_page(regular: list[str], playoffs: list[str]) -> bytes:
    def table(table_id: str, ids: list[str]) -> str:
        rows = "".join(
            f'<tr><td data-append-csv="{i}" data-stat="name_display">'
            f'<a href="/players/{i[0]}/{i}.html">{i}</a></td><td data-stat="pts">1</td></tr>'
            for i in ids
        )
        average = '<tr><td data-stat="name_display" csk="zzzzz">League Average</td></tr>'
        return f'<table id="{table_id}"><tbody>{rows}{average}</tbody></table>'

    return (
        f"<html><body>{table('totals_stats', regular)}"
        f"<!-- {table('totals_stats_post', playoffs)} --></body></html>"
    ).encode()


def test_season_names_prefixes_and_tables() -> None:
    assert season_label(1985) == "1984-85"
    assert season_label(2000) == "1999-00"
    assert league_urls(1947) == [
        f"{BASE}/leagues/BAA_1947.html",
        f"{BASE}/leagues/BAA_1947_totals.html",
        f"{BASE}/leagues/BAA_1947_per_game.html",
        f"{BASE}/leagues/BAA_1947_advanced.html",
    ]
    assert league_urls(1974)[-1] == f"{BASE}/leagues/NBA_1974_per_poss.html"
    assert gamelog_url("jordami01", 1985) == f"{BASE}/players/j/jordami01/gamelog/1985"


def test_season_players_reads_both_tables_and_skips_the_average_row() -> None:
    raw = totals_page(["jordami01", "birdla01"], ["birdla01", "o'neash01"])
    assert season_players(raw) == ["birdla01", "jordami01", "o'neash01"]


def test_season_players_rejects_a_changed_layout() -> None:
    with pytest.raises(ValueError, match="no totals_stats"):
        season_players(b"<html><table id='other'></table></html>")
    bad = b'<table id="totals_stats"><tr><td data-stat="name_display" data-append-csv="X1">'
    with pytest.raises(ValueError, match="unexpected player ID"):
        season_players(bad)


def test_only_league_and_gamelog_pages_are_admitted() -> None:
    assert validate_history_url("basketball_reference", totals_url(1985), "1984-85") == 4.0
    assert validate_history_url("basketball_reference", gamelog_url("jordami01", 1985), "") == 4.0
    for url in (
        f"{BASE}/players/j/jordami01.html",
        f"{BASE}/leagues/NBA_1985_shooting.html",
        f"{BASE}/teams/CHI/1985/gamelog/",
        "http://www.basketball-reference.com/leagues/NBA_1985.html",
        f"{BASE}/leagues/NBA_1985.html?x=1",
    ):
        with pytest.raises(ValueError):
            validate_history_url("basketball_reference", url, "1984-85")


def run(
    session: Session,
    root: Path,
    respond: Callable[[httpx.Request], httpx.Response],
    monkeypatch: pytest.MonkeyPatch,
    **options: object,
) -> tuple[dict[str, object], list[CrawlEvent]]:
    monkeypatch.setattr("courtlens.services.source_acquisition.time.sleep", lambda _: None)
    events: list[CrawlEvent] = []
    with httpx.Client(transport=httpx.MockTransport(respond)) as client:
        summary = crawl(
            session, HistoryFetcher(session, root, client), root, log=events.append, **options
        )
    return summary, events


def test_crawl_fetches_league_pages_then_gamelogs_and_resumes(
    session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    requested: list[str] = []

    def respond(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: */gamelog/\nCrawl-delay: 3\n")
        requested.append(path)
        if path == "/leagues/NBA_1985_totals.html":
            return httpx.Response(200, content=totals_page(["jordami01"], ["birdla01"]))
        if path == "/leagues/NBA_1985_per_poss.html":
            return httpx.Response(404, text="Not Found")
        return httpx.Response(200, content=f"<html>{path}</html>".encode())

    options = {
        "first_season": 1985,
        "last_season": 1985,
        "first_gamelog_season": 1985,
        "last_gamelog_season": 1985,
    }
    summary, events = run(session, tmp_path, respond, monkeypatch, **options)
    assert summary["fetched"] == 6 and summary["missing"] == 1 and not summary["stopped"]
    assert requested[-2:] == [
        "/players/b/birdla01/gamelog/1985",
        "/players/j/jordami01/gamelog/1985",
    ]
    assert any(e.kind == "season" and e.detail == {"players": 2} for e in events)
    receipts = session.scalars(
        select(WorkbenchAcquisition).where(WorkbenchAcquisition.resource == RESOURCE)
    ).all()
    assert {r.metadata_json["season"] for r in receipts} == {"1984-85"}

    # The 404 and every retained page are settled: a rerun fetches nothing.
    requested.clear()
    summary, _ = run(session, tmp_path, respond, monkeypatch, **options)
    assert requested == [] and summary["fetched"] == 0 and summary["skipped"] == 7


def test_a_refusal_ends_the_run_and_a_rerun_continues(
    session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    refuse = {"on": True}

    def respond(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        if refuse["on"] and request.url.path == "/leagues/NBA_1985_per_game.html":
            return httpx.Response(429)
        return httpx.Response(200, content=b"<html></html>")

    options = {"phases": ("league",), "first_season": 1985, "last_season": 1985}
    summary, events = run(session, tmp_path, respond, monkeypatch, **options)
    assert summary["stopped"] and summary["fetched"] == 2 and summary["failed"] == 1
    assert events[-1].kind == "stop"

    refuse["on"] = False
    summary, _ = run(session, tmp_path, respond, monkeypatch, **options)
    assert summary["fetched"] == 3 and summary["skipped"] == 2 and not summary["stopped"]


def test_gamelogs_wait_for_a_retained_totals_page(
    session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    summary, events = run(
        session,
        tmp_path,
        lambda request: httpx.Response(500),
        monkeypatch,
        phases=("gamelogs",),
        first_gamelog_season=1990,
        last_gamelog_season=1990,
    )
    assert summary["unreadable_seasons"] == [1990] and summary["fetched"] == 0
    assert events[0].status == "missing"


def test_limit_counts_attempts(
    session: Session, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    summary, _ = run(
        session,
        tmp_path,
        lambda request: httpx.Response(200, content=b"<html></html>"),
        monkeypatch,
        phases=("league",),
        first_season=1960,
        last_season=1961,
        limit=3,
    )
    assert summary["fetched"] == 3
