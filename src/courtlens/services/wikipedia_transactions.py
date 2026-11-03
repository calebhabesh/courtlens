"""Scheduled, sealed Wikipedia transactions: dated signings, waivers and cuts. Visitors never fetch.

`courtlens refresh-wikipedia-transactions` (a step of `refresh-daily`) fetches the season's
"List of <season> NBA season transactions" article once. When its parsed moves differ from the
newest sealed bundle it retains the page and seals one content-addressed
`courtlens-wikipedia-transactions-v1` bundle; an unchanged run (the page is edited for other
sections too) keeps only its receipt and rewrites the `.checked` heartbeat. Bundles and their raw
pages older than the retention window are pruned, never the newest. Free Agency applies these
moves after NBA.com's tracker (services/free_agency.py); the bundle feeds no sealed statistic.
"""

from __future__ import annotations

import hashlib
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.ingestion.wikipedia_transactions import URL_PATTERN, page_url, parse_transactions
from courtlens.services.player_context import aware
from courtlens.services.source_acquisition import (
    KEEP_DAYS,
    ScheduledFetcher,
    keep_body,
    prune_receipts,
    read_heartbeat,
    write_heartbeat,
)

VERSION = "courtlens-wikipedia-transactions-v1"
SOURCE = "wikipedia_transactions"
RESOURCE = "wikipedia_transactions"
ATTRIBUTION = "Wikipedia, NBA season transactions (CC BY-SA 4.0)"
INTERVAL_SECONDS = 5.0


def validate_page_url(source: str, url: str, season: str) -> float:
    match = URL_PATTERN.fullmatch(url)
    if source != SOURCE or match is None or url != page_url(season):
        raise ValueError("not this season's Wikipedia transactions article")
    return INTERVAL_SECONDS


class PageFetcher(ScheduledFetcher):
    def __init__(self, session: Session, root: Path, client: httpx.Client) -> None:
        super().__init__(
            session,
            root,
            client,
            resource=RESOURCE,
            kinds={SOURCE: "transactions"},
            validate_url=validate_page_url,
            max_bytes=8_000_000,
            retain_bodies=False,
        )


def events_digest(events: list[dict[str, Any]]) -> str:
    rows = sorted(json.dumps(e, sort_keys=True) for e in events)
    return hashlib.sha256("\n".join(rows).encode()).hexdigest()


def refresh(
    session: Session,
    root: Path,
    client: httpx.Client,
    output: Path,
    season: str,
    keep_days: int = KEEP_DAYS,
) -> tuple[Path, dict[str, Any]]:
    fetcher = PageFetcher(session, root, client)
    url = page_url(season)
    receipt = fetcher.fetch(SOURCE, url, season)
    session.commit()
    body = fetcher.bodies.get(receipt.id)
    if receipt.status != "success" or body is None or receipt.finished_at is None:
        raise ValueError(f"Wikipedia transactions: {receipt.error_summary}; no bundle sealed")
    checked = aware(receipt.finished_at)
    parsed = parse_transactions(body, season, checked.date())
    digest = events_digest(parsed["events"])
    summary: dict[str, Any] = {
        "season": season,
        "revision_id": parsed["revision_id"],
        "events": len(parsed["events"]),
        "pruned": {"receipts": prune_receipts(session, SOURCE, keep_days, checked)},
    }
    output.mkdir(parents=True, exist_ok=True)
    latest = _newest(output)
    beat = {"checked_at": checked.isoformat(), "revision_id": parsed["revision_id"]}
    if latest is not None and latest[1]["entry"]["events_sha256"] == digest:
        write_heartbeat(output, beat | {"manifest_sha256": latest[0].stem})
        return latest[0], {**summary, "changed": False}
    keep_body(fetcher, receipt, "text/html")
    session.commit()
    entry = {
        "season": season,
        "url": url,
        "revision_id": parsed["revision_id"],
        "observed_at": checked.isoformat(),
        "acquisition_id": str(receipt.id),
        "raw_sha256": receipt.content_sha256,
        "events_sha256": digest,
        "events": parsed["events"],
    }
    path, _ = write_artifact(
        output,
        {
            "version": VERSION,
            "source": {"name": ATTRIBUTION, "host": "en.wikipedia.org", "url": url},
            "entry": entry,
        },
    )
    write_heartbeat(output, beat | {"manifest_sha256": path.stem})
    summary["pruned"] |= prune(output, root, keep_days, checked)
    return path, {**summary, "changed": True}


def prune(output: Path, root: Path, keep_days: int, now: datetime) -> dict[str, int]:
    """Delete bundles observed before the window and their raw pages; never the newest."""
    bundles = _bundles(output)
    if not bundles:
        return {"bundles": 0, "raw": 0}
    newest = max(bundles, key=lambda b: b[1]["entry"]["observed_at"])[0]
    cutoff = now - timedelta(days=keep_days)
    drop = [
        (path, body)
        for path, body in bundles
        if path != newest and datetime.fromisoformat(body["entry"]["observed_at"]) < cutoff
    ]
    kept = {b["entry"]["raw_sha256"] for p, b in bundles if (p, b) not in drop}
    raw = 0
    for path, body in drop:
        sha = body["entry"]["raw_sha256"]
        file = root / sha[:2] / sha
        if sha not in kept and file.exists():
            file.unlink()
            raw += 1
        path.unlink()
    return {"bundles": len(drop), "raw": raw}


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


def _newest(directory: Path) -> tuple[Path, dict[str, Any]] | None:
    bundles = _bundles(directory)
    return max(bundles, key=lambda b: b[1]["entry"]["observed_at"]) if bundles else None


_cache: dict[Path, tuple[frozenset[str], tuple[Path, dict[str, Any]] | None]] = {}


def load_latest() -> tuple[Path, dict[str, Any]] | None:
    """The newest intact bundle in the configured directory; a damaged file is skipped."""
    directory = get_settings().wikipedia_transactions_dir
    if directory is None or not directory.is_dir():
        return None
    signature = frozenset(path.name for path in directory.glob("*.json"))
    cached = _cache.get(directory)
    if cached and cached[0] == signature:
        return cached[1]
    latest = _newest(directory)
    _cache[directory] = (signature, latest)
    return latest


def last_checked(path: Path, body: dict[str, Any]) -> str:
    """When this bundle's moves were last confirmed: the heartbeat if it names this bundle."""
    beat = read_heartbeat(path.parent)
    observed = str(body["entry"]["observed_at"])
    if beat is None or beat.get("manifest_sha256") != path.stem:
        return observed
    return max(str(beat["checked_at"]), observed)
