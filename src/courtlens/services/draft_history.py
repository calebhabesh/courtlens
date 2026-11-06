"""Operator-run acquisition of draft lists before 2000 (R09). Visitors never fetch.

`courtlens acquire-draft-history` fetches the four official 1996-99 files from the pinned hoopR
mirror (1 s) and the thirty Wikipedia "<year> NBA draft" articles for 1966-95 (5 s), retains
every body as a content-addressed artifact with its receipt, then seals one
`courtlens-draft-history-v1` bundle of parsed picks. Reruns skip URLs already held, so a rerun
only re-parses; the bundle is content-addressed and identical for identical inputs.
"""

from __future__ import annotations

import hashlib
from collections.abc import Callable
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.ingestion.draft_history import (
    HOOPR_SOURCE,
    OFFICIAL_YEARS,
    WIKI_SOURCE,
    WIKI_YEARS,
    hoopr_url,
    parse_official,
    parse_wikipedia,
    revision_id,
    wiki_url,
    year_for_url,
)
from courtlens.services.source_acquisition import ScheduledFetcher
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchArtifact

VERSION = "courtlens-draft-history-v1"
RESOURCE = "draft_history"
INTERVALS = {HOOPR_SOURCE: 1.0, WIKI_SOURCE: 5.0}
ATTRIBUTION = {
    HOOPR_SOURCE: "NBA Stats draft history via the sportsdataverse hoopR mirror",
    WIKI_SOURCE: "Wikipedia, '<year> NBA draft' articles (CC BY-SA 4.0)",
}


def validate_url(source: str, url: str, season: str) -> float:
    kind, year = year_for_url(url)
    if kind != source or str(year) != season:
        raise ValueError("draft-history URL, source and year disagree")
    return INTERVALS[source]


def plan() -> list[tuple[str, str, int]]:
    rows = [(HOOPR_SOURCE, hoopr_url(y), y) for y in OFFICIAL_YEARS]
    return rows + [(WIKI_SOURCE, wiki_url(y), y) for y in WIKI_YEARS]


def _held(session: Session, url: str) -> WorkbenchAcquisition | None:
    return session.scalar(
        select(WorkbenchAcquisition)
        .where(
            WorkbenchAcquisition.resource == RESOURCE,
            WorkbenchAcquisition.source_url == url,
            WorkbenchAcquisition.status == "success",
            WorkbenchAcquisition.artifact_id.is_not(None),
        )
        .order_by(WorkbenchAcquisition.finished_at.desc())
        .limit(1)
    )


def _body(session: Session, root: Path, receipt: WorkbenchAcquisition) -> bytes:
    artifact = session.get(WorkbenchArtifact, receipt.artifact_id)
    if artifact is None:
        raise ValueError("draft-history receipt lost its retained artifact")
    raw = (root / artifact.storage_path).read_bytes()
    if hashlib.sha256(raw).hexdigest() != artifact.sha256:
        raise ValueError("retained draft-history bytes changed")
    return raw


def acquire(
    session: Session,
    root: Path,
    client: httpx.Client,
    output: Path,
    log: Callable[[str], Any] = print,
) -> tuple[Path, dict[str, Any]]:
    fetcher = ScheduledFetcher(
        session,
        root,
        client,
        resource=RESOURCE,
        kinds={HOOPR_SOURCE: "draft_history", WIKI_SOURCE: "draft_history"},
        validate_url=validate_url,
        max_bytes=8_000_000,
    )
    targets = plan()
    for index, (source, url, year) in enumerate(targets, 1):
        if _held(session, url) is not None:
            continue
        receipt = fetcher.fetch(source, url, str(year))
        session.commit()
        log(f"{index}/{len(targets)} {year} {source} {receipt.status}")
        if receipt.status != "success":
            raise ValueError(f"{url}: {receipt.error_summary}; not sealed")
    return seal(session, root, output)


def seal(session: Session, root: Path, output: Path) -> tuple[Path, dict[str, Any]]:
    drafts: dict[str, Any] = {}
    for source, url, year in plan():
        held = _held(session, url)
        if held is None:
            raise ValueError(f"{url} not held; run acquire first")
        raw = _body(session, root, held)
        picks = parse_official(raw, year) if source == HOOPR_SOURCE else parse_wikipedia(raw, year)
        drafts[str(year)] = {
            "source": source,
            "url": url,
            "raw_sha256": hashlib.sha256(raw).hexdigest(),
            "acquisition_id": str(held.id),
            "observed_at": held.finished_at.isoformat() if held.finished_at else None,
            "revision_id": revision_id(raw) if source == WIKI_SOURCE else None,
            "picks": picks,
        }
    body = {"version": VERSION, "attribution": ATTRIBUTION, "drafts": drafts}
    path, digest = write_artifact(output, body)
    counts = {year: len(entry["picks"]) for year, entry in drafts.items()}
    return path, {"manifest_sha256": digest, "picks": counts}
