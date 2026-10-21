"""Scheduled Basketball-Reference crawl of full NBA history: raw retention only (policy v3).

An operator command, never a visitor request. Phase ``league`` fetches each season's summary
and player tables (1946-47 onward); phase ``gamelogs`` reads the retained totals pages of
1983-84 to 1999-00 for that season's players, then fetches each player's game-log page. Pages
are fetched serially at the source's pace (robots.txt Crawl-delay or 4 s, whichever is longer)
and retained byte-for-byte with their receipts; nothing is parsed into serving tables here.

robots.txt disallows ``*/gamelog/``. Policy v3 records that and does not refuse; the owner chose
to fetch game logs anyway (docs/full-history-plan.md). A refusal (HTTP 403/429) ends the run.
A rerun resumes: a URL with a successful receipt, or a 404 receipt, is never fetched again.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from courtlens.ingestion.bbref_history import (
    FIRST_GAMELOG_SEASON,
    FIRST_SEASON,
    GAMELOG_PATH,
    LEAGUE_PATH,
    gamelog_url,
    league_urls,
    season_label,
    season_players,
    totals_url,
)
from courtlens.ingestion.bbref_players import HOST
from courtlens.services.bbref_bio import INTERVAL_SECONDS, SOURCE
from courtlens.services.source_acquisition import ScheduledFetcher
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchArtifact

RESOURCE = "bbref_history_pages"
LAST_SEASON = 2026
LAST_GAMELOG_SEASON = 2000
PHASES = ("league", "gamelogs")


def validate_history_url(source: str, url: str, season: str) -> float:
    parts = urlsplit(url)
    if (
        source != SOURCE
        or parts.scheme != "https"
        or parts.netloc != HOST
        or parts.query
        or not (LEAGUE_PATH.fullmatch(parts.path) or GAMELOG_PATH.fullmatch(parts.path))
    ):
        raise ValueError("only Basketball-Reference league season and game-log pages are admitted")
    return INTERVAL_SECONDS


class HistoryFetcher(ScheduledFetcher):
    def __init__(self, session: Session, root: Path, client: httpx.Client) -> None:
        super().__init__(
            session,
            root,
            client,
            resource=RESOURCE,
            kinds={SOURCE: "league_history"},
            validate_url=validate_history_url,
            max_bytes=4_000_000,
        )


@dataclass
class CrawlEvent:
    kind: str  # league | gamelog | season | stop
    url: str | None
    status: str
    detail: dict[str, Any]


def settled_urls(session: Session) -> set[str]:
    """URLs never to fetch again: retained successfully, or answered 404 (no such page)."""
    return set(
        session.scalars(
            select(WorkbenchAcquisition.source_url).where(
                WorkbenchAcquisition.resource == RESOURCE,
                or_(
                    WorkbenchAcquisition.status == "success",
                    WorkbenchAcquisition.http_status == 404,
                ),
            )
        )
    )


def retained_page(session: Session, root: Path, url: str) -> bytes | None:
    """The newest successfully retained body for a URL, if any."""
    artifact = session.scalar(
        select(WorkbenchArtifact)
        .join(WorkbenchAcquisition, WorkbenchAcquisition.artifact_id == WorkbenchArtifact.id)
        .where(
            WorkbenchAcquisition.resource == RESOURCE,
            WorkbenchAcquisition.source_url == url,
            WorkbenchAcquisition.status == "success",
        )
        .order_by(WorkbenchAcquisition.finished_at.desc())
        .limit(1)
    )
    return None if artifact is None else (root / artifact.storage_path).read_bytes()


def crawl(
    session: Session,
    fetcher: HistoryFetcher,
    root: Path,
    *,
    phases: tuple[str, ...] = PHASES,
    first_season: int = FIRST_SEASON,
    last_season: int = LAST_SEASON,
    first_gamelog_season: int = FIRST_GAMELOG_SEASON,
    last_gamelog_season: int = LAST_GAMELOG_SEASON,
    limit: int | None = None,
    log: Callable[[CrawlEvent], None] = lambda event: None,
) -> dict[str, Any]:
    """One resumable run over the requested phases, committing after every page."""
    settled = settled_urls(session)
    session.commit()
    summary: dict[str, Any] = {
        "fetched": 0,
        "skipped": 0,
        "failed": 0,
        "missing": 0,
        "unreadable_seasons": [],
        "stopped": False,
    }
    if "league" in phases:
        targets = [
            (url, end_year)
            for end_year in range(first_season, last_season + 1)
            for url in league_urls(end_year)
        ]
        if not _fetch_all(session, fetcher, targets, "league", settled, limit, summary, log):
            return summary
    if "gamelogs" in phases:
        targets = list(
            _gamelog_targets(session, root, first_gamelog_season, last_gamelog_season, summary, log)
        )
        _fetch_all(session, fetcher, targets, "gamelog", settled, limit, summary, log)
    return summary


def _gamelog_targets(
    session: Session,
    root: Path,
    first: int,
    last: int,
    summary: dict[str, Any],
    log: Callable[[CrawlEvent], None],
) -> Iterator[tuple[str, int]]:
    for end_year in range(first, last + 1):
        url = totals_url(end_year)
        raw = retained_page(session, root, url)
        if raw is None:
            summary["unreadable_seasons"].append(end_year)
            log(CrawlEvent("season", url, "missing", {"reason": "totals page not retained yet"}))
            continue
        try:
            players = season_players(raw)
        except ValueError as error:
            summary["unreadable_seasons"].append(end_year)
            log(CrawlEvent("season", url, "rejected", {"reason": str(error)}))
            continue
        log(CrawlEvent("season", url, "success", {"players": len(players)}))
        for bbref_id in players:
            yield gamelog_url(bbref_id, end_year), end_year


def _fetch_all(
    session: Session,
    fetcher: HistoryFetcher,
    targets: list[tuple[str, int]],
    kind: str,
    settled: set[str],
    limit: int | None,
    summary: dict[str, Any],
    log: Callable[[CrawlEvent], None],
) -> bool:
    """Fetch every unsettled target. False when the run must end (refusal or limit)."""
    pending = [(url, end_year) for url, end_year in targets if url not in settled]
    summary["skipped"] += len(targets) - len(pending)
    log(CrawlEvent(kind, None, "plan", {"targets": len(targets), "pending": len(pending)}))
    for url, end_year in pending:
        if limit is not None and summary["fetched"] + summary["failed"] >= limit:
            log(CrawlEvent("stop", None, "limit", {"limit": limit}))
            return False
        receipt = fetcher.fetch(SOURCE, url, season_label(end_year))
        session.commit()
        if receipt.status == "success":
            settled.add(url)
            summary["fetched"] += 1
            log(CrawlEvent(kind, url, "success", {"bytes": receipt.bytes}))
            continue
        if receipt.http_status == 404:
            settled.add(url)
            summary["missing"] += 1
            log(CrawlEvent(kind, url, "missing", {"http_status": 404}))
            continue
        summary["failed"] += 1
        log(CrawlEvent(kind, url, "failed", {"reason": receipt.error_summary}))
        if HOST in fetcher.stopped:
            summary |= {"stopped": True, "reason": receipt.error_summary}
            log(CrawlEvent("stop", url, "refused", {"reason": receipt.error_summary}))
            return False
    return True
