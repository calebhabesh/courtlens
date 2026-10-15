"""Scheduled Basketball-Reference crawl of player biographies and honours (source policy v3).

An operator command, never a visitor request. One run fetches the 26 A-Z index pages, matches
CourtLens players to Basketball-Reference IDs by name and birth date, then fetches each matched
player's page serially at the source's pace (its robots.txt Crawl-delay or 4 s, whichever is
longer). Every page is retained byte-for-byte with its receipt; parsed profiles are appended,
never overwritten, and the newest per player serves. A refusal (HTTP 403/429) ends the run, and
a rerun resumes: players with a current profile are skipped.
"""

from __future__ import annotations

import hashlib
import string
from collections.abc import Callable, Iterator
from copy import deepcopy
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import httpx
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from courtlens.ingestion.bbref_players import (
    HOST,
    INDEX_PATH,
    PARSER_VERSION,
    PLAYER_PATH,
    IndexEntry,
    NbaPlayer,
    index_url,
    match_players,
    parse_index,
    parse_player_page,
    player_url,
)
from courtlens.reference_models import BbrefPlayerProfile
from courtlens.services.source_acquisition import ScheduledFetcher
from courtlens.services.stats_feed_views import _mart
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchArtifact

SOURCE = "basketball_reference"
RESOURCE = "bbref_player_pages"
# Above the robots.txt Crawl-delay (3 s) and the source's published 20 requests a minute.
INTERVAL_SECONDS = 4.0
ATTRIBUTION = "Basketball-Reference.com"


def validate_bbref_url(source: str, url: str, season: str) -> float:
    parts = urlsplit(url)
    if (
        source != SOURCE
        or parts.scheme != "https"
        or parts.netloc != HOST
        or parts.query
        or not (INDEX_PATH.fullmatch(parts.path) or PLAYER_PATH.fullmatch(parts.path))
    ):
        raise ValueError("only Basketball-Reference player index and player pages are admitted")
    return INTERVAL_SECONDS


class BbrefFetcher(ScheduledFetcher):
    def __init__(self, session: Session, root: Path, client: httpx.Client) -> None:
        super().__init__(
            session,
            root,
            client,
            resource=RESOURCE,
            kinds={SOURCE: "player_bio"},
            validate_url=validate_bbref_url,
            max_bytes=4_000_000,
        )


def _body(session: Session, receipt: WorkbenchAcquisition, root: Path) -> bytes:
    artifact = session.get(WorkbenchArtifact, receipt.artifact_id)
    if artifact is None:
        raise ValueError("retained page missing")
    return (root / artifact.storage_path).read_bytes()


def candidate_players(session: Session) -> list[tuple[NbaPlayer, bool]]:
    """Players CourtLens has seasons for, active-roster players first, then newest careers."""
    rows = session.execute(
        text(
            f"""SELECT bio.player_id, bio.source_player_name, bio.birth_date, bio.from_year,
                bio.to_year, bio.listed_team_id IS NOT NULL AS active
            FROM {_mart("mart_player_bio")} AS bio
            WHERE bio.player_id IN (
                SELECT DISTINCT player_id FROM {_mart("mart_player_roster_seasons")})
            ORDER BY active DESC, bio.to_year DESC NULLS LAST, bio.player_id"""
        )
    ).all()
    return [
        (
            NbaPlayer(r.player_id, r.source_player_name, r.birth_date, r.from_year, r.to_year),
            r.active,
        )
        for r in rows
    ]


def has_current_profile(session: Session, player_id: str, max_age: timedelta) -> bool:
    newest = session.scalar(
        select(BbrefPlayerProfile.observed_at)
        .where(
            BbrefPlayerProfile.player_id == player_id,
        )
        .order_by(BbrefPlayerProfile.observed_at.desc())
        .limit(1)
    )
    if newest is None:
        return False
    if newest.tzinfo is None:
        newest = newest.replace(tzinfo=UTC)
    return datetime.now(UTC) - newest < max_age


@dataclass
class CrawlEvent:
    kind: str  # index | player | skip | stop
    url: str | None
    status: str
    detail: dict[str, Any]


def crawl(
    session: Session,
    fetcher: BbrefFetcher,
    root: Path,
    *,
    limit: int | None = None,
    active_only: bool = False,
    max_age: timedelta = timedelta(days=300),
    letters: str = string.ascii_lowercase,
    log: Callable[[CrawlEvent], None] = lambda event: None,
) -> dict[str, Any]:
    """One resumable run. The caller owns the transaction boundary only through this function."""
    entries: list[IndexEntry] = []
    for letter in letters:
        receipt = fetcher.fetch(SOURCE, index_url(letter), "all")
        session.commit()
        if receipt.status != "success":
            log(
                CrawlEvent("index", receipt.source_url, "failed", {"reason": receipt.error_summary})
            )
            if urlsplit(receipt.source_url).netloc in fetcher.stopped:
                return {"stopped": True, "reason": receipt.error_summary, "profiles": 0}
            continue
        found = parse_index(_body(session, receipt, root))
        entries.extend(found)
        log(CrawlEvent("index", receipt.source_url, "success", {"players": len(found)}))

    players = candidate_players(session)
    matched = match_players(entries, [player for player, _ in players])
    plan = [(p, active) for p, active in players if p.player_id in matched]
    if active_only:
        plan = [(p, active) for p, active in plan if active]
    summary: dict[str, Any] = {
        "index_players": len(entries),
        "candidates": len(players),
        "matched": len(matched),
        "unmatched": [p.player_id for p, _ in players if p.player_id not in matched][:50],
        "unmatched_count": len(players) - len(matched),
        "profiles": 0,
        "skipped": 0,
        "failed": 0,
        "stopped": False,
    }
    for player, _ in _limited(plan, limit, session, max_age, summary):
        bbref_id = matched[player.player_id]
        receipt = fetcher.fetch(SOURCE, player_url(bbref_id), "all")
        if receipt.status != "success":
            session.commit()
            summary["failed"] += 1
            log(
                CrawlEvent(
                    "player", receipt.source_url, "failed", {"reason": receipt.error_summary}
                )
            )
            if HOST in fetcher.stopped:
                summary |= {"stopped": True, "reason": receipt.error_summary}
                break
            continue
        try:
            profile = parse_player_page(_body(session, receipt, root), bbref_id)
        except ValueError as error:
            session.commit()
            summary["failed"] += 1
            log(CrawlEvent("player", receipt.source_url, "rejected", {"reason": str(error)}))
            continue
        session.add(
            BbrefPlayerProfile(
                player_id=player.player_id,
                bbref_id=bbref_id,
                match_basis="name+birth_date" if player.birth_date else "name+seasons",
                acquisition_id=receipt.id,
                content_sha256=receipt.content_sha256 or "",
                parser_version=PARSER_VERSION,
                profile=profile,
                observed_at=receipt.finished_at or datetime.now(UTC),
            )
        )
        session.commit()
        summary["profiles"] += 1
        log(CrawlEvent("player", receipt.source_url, "success", {"player_id": player.player_id}))
    return summary


def _limited(
    plan: list[tuple[NbaPlayer, bool]],
    limit: int | None,
    session: Session,
    max_age: timedelta,
    summary: dict[str, Any],
) -> Iterator[tuple[NbaPlayer, bool]]:
    fetched = 0
    for item in plan:
        if has_current_profile(session, item[0].player_id, max_age):
            summary["skipped"] += 1
            continue
        if limit is not None and fetched >= limit:
            return
        fetched += 1
        yield item


def reparse(
    session: Session,
    root: Path,
    *,
    player_ids: list[str] | None = None,
    limit: int | None = None,
) -> dict[str, Any]:
    """Append this parser's output for retained, previously matched pages. Never fetch.

    Snapshot the input list so a concurrent crawl can keep appending v1 profiles. Rerun to
    include pages it retains after this run begins. The acquisition time never changes.
    """
    query = select(BbrefPlayerProfile).order_by(
        BbrefPlayerProfile.observed_at.desc(), BbrefPlayerProfile.created_at.desc()
    )
    if player_ids:
        query = query.where(BbrefPlayerProfile.player_id.in_(player_ids))
    retained = list(session.scalars(query))
    existing = {
        (row.player_id, row.content_sha256)
        for row in retained
        if row.parser_version == PARSER_VERSION
    }
    seen: set[tuple[str, str]] = set()
    summary: dict[str, Any] = {
        "parser": PARSER_VERSION,
        "profiles": 0,
        "skipped": 0,
        "failed": [],
    }
    session.commit()
    attempted = 0
    for previous in retained:
        key = (previous.player_id, previous.content_sha256)
        if key in seen:
            continue
        seen.add(key)
        if key in existing:
            summary["skipped"] += 1
            continue
        if limit is not None and attempted >= limit:
            break
        attempted += 1
        try:
            receipt = session.get(WorkbenchAcquisition, previous.acquisition_id)
            artifact = session.get(WorkbenchArtifact, receipt.artifact_id) if receipt else None
            if (
                receipt is None
                or artifact is None
                or receipt.status != "success"
                or receipt.resource != RESOURCE
                or artifact.resource != RESOURCE
                or receipt.source_url != player_url(previous.bbref_id)
                or receipt.content_sha256 != previous.content_sha256
                or artifact.sha256 != previous.content_sha256
            ):
                raise ValueError("retained page lineage mismatch")
            path = (root / artifact.storage_path).resolve()
            if not path.is_relative_to(root.resolve()):
                raise ValueError("retained page escapes raw store")
            raw = path.read_bytes()
            if (
                len(raw) != artifact.bytes
                or hashlib.sha256(raw).hexdigest() != previous.content_sha256
            ):
                raise ValueError("retained page integrity failure")
            profile = parse_player_page(raw, previous.bbref_id)
            session.add(
                BbrefPlayerProfile(
                    player_id=previous.player_id,
                    bbref_id=previous.bbref_id,
                    match_basis=previous.match_basis,
                    acquisition_id=previous.acquisition_id,
                    content_sha256=previous.content_sha256,
                    parser_version=PARSER_VERSION,
                    profile=profile,
                    observed_at=previous.observed_at,
                )
            )
            session.commit()
            summary["profiles"] += 1
        except (ValueError, OSError) as error:
            session.rollback()
            summary["failed"].append(
                {
                    "player_id": previous.player_id,
                    "content_sha256": previous.content_sha256,
                    "reason": str(error)[:300],
                }
            )
    return summary


def player_reference(session: Session, player_id: str) -> dict[str, Any] | None:
    """The newest parsed profile for a player, with its source and as-of time."""
    row = session.scalar(
        select(BbrefPlayerProfile)
        .where(BbrefPlayerProfile.player_id == player_id)
        .order_by(
            BbrefPlayerProfile.observed_at.desc(),
            BbrefPlayerProfile.created_at.desc(),
            BbrefPlayerProfile.parser_version.desc(),
            BbrefPlayerProfile.id.desc(),
        )
        .limit(1)
    )
    if row is None:
        return None
    profile = deepcopy(row.profile)
    return {
        "profile_id": row.id,
        "salary_history": profile.get("salary_history") or [],
        "career_earnings": profile.get("career_earnings"),
        "current_contract": profile.get("current_contract") or [],
        "contract_events": profile.get("contract_events") or [],
        "transactions": profile.get("transactions") or [],
        "game_highs": profile.get("game_highs") or [],
        "source": ATTRIBUTION,
        "url": player_url(row.bbref_id),
        "as_of": row.observed_at,
        "birthplace": profile.get("birthplace"),
        "high_school": profile.get("high_school"),
        "shoots": profile.get("shoots"),
        "debut_date": profile.get("debut_date"),
        "honours": profile.get("honours") or [],
        "awards": profile.get("awards") or {},
        "all_star_seasons": profile.get("all_star_seasons") or [],
    }
