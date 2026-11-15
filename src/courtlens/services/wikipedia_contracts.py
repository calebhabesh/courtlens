"""Sealed contract statements from players' Wikipedia articles. Visitors never fetch.

`courtlens acquire-wikipedia-contracts` maps Basketball-Reference IDs to English Wikipedia
articles with one Wikidata query (property P2685, so a player is tied to his article by ID, never
by searching his name), then reads each target player's rendered article serially at the
registry interval. ingestion/wikipedia_contracts.py turns the prose into dated contract
statements. A page is retained only when its revision is new to the bundle (a rendered page's
bytes change on every render, its revision does not). Each run, and every 100 players of a long
one, seals one content-addressed `courtlens-wikipedia-contracts-v1` bundle holding every player
read so far (the newest bundle's entries carried forward), so an interrupted run loses at most
the players since its last seal. The newest three bundles are kept.

Targets: `gaps` (players whose contract table shows a signing it cannot bracket), `active` (a
current contract) or `all` (every player with a reported salary). A player read within
`max_age` is skipped, so a rerun resumes. `--reparse` applies the current parser to the retained
pages with no network access.

The player page's Contracts table uses these statements to fill lengths Basketball-Reference does
not state and to add signings it does not list (services/contract_spans.py). They feed no sealed
statistic.
"""

from __future__ import annotations

import hashlib
import json
import re
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote, unquote

import httpx
from sqlalchemy import text
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.ingestion.wikipedia_contracts import PARSER_VERSION, parse_article
from courtlens.services.contract_spans import contract_spans, unplaced_signings
from courtlens.services.player_context import aware
from courtlens.services.source_acquisition import ScheduledFetcher, keep_body

VERSION = "courtlens-wikipedia-contracts-v1"
ARTICLE_SOURCE = "wikipedia_contracts"
INDEX_SOURCE = "wikidata_bbref_articles"
RESOURCE = "wikipedia_player_articles"
ATTRIBUTION = "Wikipedia player articles (CC BY-SA 4.0)"
INTERVAL_SECONDS = 5.0
SEAL_EVERY = 100
KEEP_BUNDLES = 3
INDEX_QUERY = (
    "SELECT ?bref ?article WHERE { ?person wdt:P2685 ?bref . ?article schema:about ?person ; "
    "schema:isPartOf <https://en.wikipedia.org/> . }"
)
INDEX_URL = "https://query.wikidata.org/sparql?format=json&query=" + quote(INDEX_QUERY, safe="")
ARTICLE_URL = re.compile(r"^https://en\.wikipedia\.org/wiki/[^/?#]+$")
SCOPES = ("gaps", "active", "all")


def validate_url(source: str, url: str, season: str) -> float:
    if source == INDEX_SOURCE and url == INDEX_URL:
        return INTERVAL_SECONDS
    if source == ARTICLE_SOURCE and ARTICLE_URL.fullmatch(url):
        return INTERVAL_SECONDS
    raise ValueError("not a Wikidata article index or English Wikipedia article URL")


class ArticleFetcher(ScheduledFetcher):
    def __init__(self, session: Session, root: Path, client: httpx.Client) -> None:
        super().__init__(
            session,
            root,
            client,
            resource=RESOURCE,
            kinds={INDEX_SOURCE: "article_index", ARTICLE_SOURCE: "contracts"},
            validate_url=validate_url,
            max_bytes=8_000_000,
            retain_bodies=False,
        )


def parse_index(body: bytes) -> dict[str, str]:
    """Basketball-Reference ID ("duranke01") -> article URL; an ID with two articles is dropped."""
    rows = json.loads(body)["results"]["bindings"]
    found: dict[str, set[str]] = {}
    for row in rows:
        bbref_id = row["bref"]["value"].rsplit("/", 1)[-1]
        found.setdefault(bbref_id, set()).add(row["article"]["value"])
    return {
        bbref_id: next(iter(urls))
        for bbref_id, urls in found.items()
        if len(urls) == 1 and ARTICLE_URL.fullmatch(next(iter(urls)))
    }


def _profiles(session: Session) -> list[tuple[str, dict[str, Any]]]:
    rows = session.execute(
        text(
            "SELECT DISTINCT ON (bbref_id) bbref_id, profile FROM bbref_player_profiles "
            "ORDER BY bbref_id, observed_at DESC, created_at DESC"
        )
    )
    return [(str(bbref_id), dict(profile)) for bbref_id, profile in rows]


def targets(session: Session, scope: str) -> list[str]:
    """Basketball-Reference IDs to read, newest-contract players first within the scope."""
    if scope not in SCOPES:
        raise ValueError(f"scope must be one of {', '.join(SCOPES)}")
    chosen: list[tuple[str, str]] = []
    for bbref_id, profile in _profiles(session):
        rows = [
            row
            for kind in ("salary_history", "current_contract")
            for row in profile.get(kind) or []
            if row.get("season")
        ]
        if not rows:
            continue
        seasons = {str(row["season"]) for row in rows}
        if scope == "active" and not profile.get("current_contract"):
            continue
        if scope == "gaps":
            unplaced = unplaced_signings(profile, contract_spans(profile))
            if not any(u["season"] in seasons for u in unplaced):
                continue
        chosen.append((max(seasons), bbref_id))
    return [bbref_id for _, bbref_id in sorted(chosen, reverse=True)]


def acquire(
    session: Session,
    root: Path,
    client: httpx.Client,
    output: Path,
    *,
    scope: str = "gaps",
    max_age: timedelta = timedelta(days=300),
    limit: int | None = None,
    log: Callable[[str], None] = lambda message: None,
) -> tuple[Path | None, dict[str, Any]]:
    """One resumable run: the article index, then each due player's article."""
    fetcher = ArticleFetcher(session, root, client)
    latest = newest(output)
    entries: dict[str, dict[str, Any]] = (
        {entry["bbref_id"]: entry for entry in latest[1]["entries"]} if latest else {}
    )
    receipt = fetcher.fetch(INDEX_SOURCE, INDEX_URL, "all")
    session.commit()
    body = fetcher.bodies.get(receipt.id)
    if receipt.status != "success" or body is None:
        raise ValueError(f"Wikidata article index: {receipt.error_summary}; nothing read")
    articles = parse_index(body)
    now = datetime.now(UTC)
    wanted = targets(session, scope)
    due = [
        bbref_id
        for bbref_id in wanted
        if bbref_id in articles
        and not (
            bbref_id in entries
            and entries[bbref_id].get("parser") == PARSER_VERSION
            and now - datetime.fromisoformat(entries[bbref_id]["observed_at"]) < max_age
        )
    ]
    if limit is not None:
        due = due[:limit]
    summary: dict[str, Any] = {
        "scope": scope,
        "index_articles": len(articles),
        "targets": len(wanted),
        "no_article": sum(1 for b in wanted if b not in articles),
        "due": len(due),
        "read": 0,
        "retained": 0,
        "with_statements": 0,
        "statements": 0,
        "failed": 0,
        "stopped": False,
    }
    path: Path | None = latest[0] if latest else None
    for i, bbref_id in enumerate(due, start=1):
        url = articles[bbref_id]
        receipt = fetcher.fetch(ARTICLE_SOURCE, url, "all")
        page = fetcher.bodies.get(receipt.id)
        if receipt.status != "success" or page is None or receipt.finished_at is None:
            session.commit()
            summary["failed"] += 1
            log(f"failed {bbref_id} {url}: {receipt.error_summary}")
            if "en.wikipedia.org" in fetcher.stopped:
                summary |= {"stopped": True, "reason": receipt.error_summary}
                break
            continue
        parsed = parse_article(page)
        previous = entries.get(bbref_id)
        if previous is None or previous.get("revision_id") != parsed["revision_id"]:
            keep_body(fetcher, receipt, "text/html")
            summary["retained"] += 1
            raw_sha256 = receipt.content_sha256
        else:
            raw_sha256 = previous["raw_sha256"]
        session.commit()
        entries[bbref_id] = {
            "bbref_id": bbref_id,
            "article_url": url,
            "title": parsed["title"] or unquote(url.rsplit("/", 1)[-1]).replace("_", " "),
            "revision_id": parsed["revision_id"],
            "observed_at": aware(receipt.finished_at).isoformat(),
            "acquisition_id": str(receipt.id),
            "raw_sha256": raw_sha256,
            "parser": PARSER_VERSION,
            "statements": parsed["statements"],
        }
        summary["read"] += 1
        summary["statements"] += len(parsed["statements"])
        summary["with_statements"] += bool(parsed["statements"])
        log(f"{i}/{len(due)} {bbref_id}: {len(parsed['statements'])} statements")
        if i % SEAL_EVERY == 0:
            path = seal(output, entries)
    if summary["read"] or latest is None:
        path = seal(output, entries)
    summary["players"] = len(entries)
    return path, summary


def reparse(root: Path, output: Path) -> tuple[Path, dict[str, Any]]:
    """The current parser over every retained page in the newest bundle; no network."""
    latest = newest(output)
    if latest is None:
        raise ValueError("no Wikipedia contracts bundle to reparse")
    entries: dict[str, dict[str, Any]] = {}
    missing = 0
    for entry in latest[1]["entries"]:
        sha = entry["raw_sha256"]
        file = root / sha[:2] / sha
        if not file.exists() or hashlib.sha256(file.read_bytes()).hexdigest() != sha:
            missing += 1
            entries[entry["bbref_id"]] = entry
            continue
        parsed = parse_article(file.read_bytes())
        entries[entry["bbref_id"]] = entry | {
            "parser": PARSER_VERSION,
            "statements": parsed["statements"],
        }
    path = seal(output, entries)
    return path, {
        "players": len(entries),
        "missing_raw": missing,
        "statements": sum(len(e["statements"]) for e in entries.values()),
    }


def seal(output: Path, entries: dict[str, dict[str, Any]]) -> Path:
    path, _ = write_artifact(
        output,
        {
            "version": VERSION,
            "parser": PARSER_VERSION,
            "sealed_at": datetime.now(UTC).isoformat(),
            "source": {
                "name": ATTRIBUTION,
                "host": "en.wikipedia.org",
                "index": "Wikidata P2685 (Basketball-Reference.com NBA player ID)",
            },
            "entries": [entries[key] for key in sorted(entries)],
        },
    )
    prune(output)
    return path


def prune(output: Path, keep: int = KEEP_BUNDLES) -> int:
    """Keep the newest `keep` intact bundles; raw pages stay (later bundles cite them)."""
    bundles = sorted(_bundles(output), key=lambda b: b[1]["sealed_at"], reverse=True)
    for path, _ in bundles[keep:]:
        path.unlink()
    return max(0, len(bundles) - keep)


def _verified(path: Path) -> dict[str, Any] | None:
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != path.stem:
        return None
    body: dict[str, Any] = json.loads(raw)
    return body if body.get("version") == VERSION else None


def _bundles(directory: Path) -> list[tuple[Path, dict[str, Any]]]:
    bundles: list[tuple[Path, dict[str, Any]]] = []
    for path in directory.glob("*.json"):
        try:
            body = _verified(path)
        except (OSError, ValueError):
            continue
        if body is not None:
            bundles.append((path, body))
    return bundles


def newest(directory: Path) -> tuple[Path, dict[str, Any]] | None:
    if not directory.is_dir():
        return None
    bundles = _bundles(directory)
    return max(bundles, key=lambda b: b[1]["sealed_at"]) if bundles else None


_cache: dict[Path, tuple[frozenset[str], dict[str, dict[str, Any]]]] = {}


def player_entry(bbref_id: str | None) -> dict[str, Any] | None:
    """The newest sealed article reading for one player, or None (no bundle, not read yet)."""
    directory = get_settings().wikipedia_contracts_dir
    if bbref_id is None or directory is None or not directory.is_dir():
        return None
    signature = frozenset(path.name for path in directory.glob("*.json"))
    cached = _cache.get(directory)
    if cached is None or cached[0] != signature:
        latest = newest(directory)
        by_id = {e["bbref_id"]: e for e in latest[1]["entries"]} if latest else {}
        cached = (signature, by_id)
        _cache[directory] = cached
    return cached[1].get(bbref_id)
