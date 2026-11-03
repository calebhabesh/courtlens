"""Shared scheduled source acquisition (source policy v3); no visitor-triggered downloads.

Policy v3 removes CourtLens' own source gates: robots.txt is read for pacing (Crawl-delay) and
recorded on every receipt, but a disallow or a changed file is noted, not a refusal. A source that
itself refuses (HTTP 403/429) still stops the run; nothing here evades a refusal.
"""

from __future__ import annotations

import hashlib
import json
import os
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx
from sqlalchemy import delete, select, text
from sqlalchemy.orm import Session

from courtlens.domain.source_policy import POLICY_VERSION, USER_AGENT
from courtlens.models import utc_now
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchArtifact

MAX_BYTES = 16_000_000
# Scheduled refreshes keep bytes only when the data changed, then prune bounded history after
# this many days (hosted on a shared VPS within its block-storage budget: docs/deployment.md).
KEEP_DAYS = 30
HEARTBEAT = ".checked"


def retain(
    body: bytes, root: Path, resource: str, attribution: str, session: Session, mime: str
) -> WorkbenchArtifact:
    digest = hashlib.sha256(body).hexdigest()
    path = root / digest[:2] / digest
    path.parent.mkdir(parents=True, exist_ok=True)
    try:
        with path.open("xb") as stream:
            stream.write(body)
    except FileExistsError:
        if path.read_bytes() != body:
            raise ValueError("retained raw bytes differ from their address") from None
    existing = session.scalar(
        select(WorkbenchArtifact).where(
            WorkbenchArtifact.sha256 == digest, WorkbenchArtifact.resource == resource
        )
    )
    if existing is not None:
        return existing
    artifact = WorkbenchArtifact(
        sha256=digest,
        resource=resource,
        bytes=len(body),
        storage_path=str(path.relative_to(root)),
        mime_type=mime,
        source_attribution=attribution,
    )
    session.add(artifact)
    session.flush()
    return artifact


class ScheduledFetcher:
    """One bounded scheduled run: serial per host, robots checked, blocked hosts stopped."""

    def __init__(
        self,
        session: Session,
        root: Path,
        client: httpx.Client,
        *,
        resource: str,
        kinds: dict[str, str],
        validate_url: Callable[[str, str, str], float],
        max_bytes: int = MAX_BYTES,
        robots_optional_hosts: frozenset[str] = frozenset(),
        retain_bodies: bool = True,
    ) -> None:
        self.session, self.root, self.client = session, root, client
        self.max_bytes = max_bytes
        # Hosts that serve no robots.txt to any client (an edge 403 on that one path). Policy v3
        # records robots but never refuses on it, so these continue; a 403/429 on the resource
        # itself still stops the host.
        self.robots_optional_hosts = robots_optional_hosts
        # False: the receipt records each body's SHA-256 and size, and the caller retains only
        # the bodies it keeps (`bodies` holds this run's bytes by receipt id).
        self.retain_bodies = retain_bodies
        self.bodies: dict[str, bytes] = {}
        self.resource, self.kinds, self.validate_url = resource, kinds, validate_url
        self.last_start: dict[str, float] = {}
        self.stopped: set[str] = set()
        # robots.txt is read once per host per run and recorded on every receipt: re-reading it
        # before each page doubled the requests a long crawl makes to the source.
        self.robots: dict[str, tuple[httpx.Response, WorkbenchArtifact]] = {}

    def _get(self, url: str, interval: float) -> httpx.Response:
        host = urlsplit(url).netloc
        delay = self.last_start.get(host, 0) + interval - time.monotonic()
        if delay > 0:
            time.sleep(delay)
        self.last_start[host] = time.monotonic()
        chunks: list[bytes] = []
        size = 0
        with self.client.stream(
            "GET", url, headers={"User-Agent": USER_AGENT}, follow_redirects=False, timeout=30
        ) as response:
            if response.status_code in (403, 429):
                self.stopped.add(host)
            for chunk in response.iter_bytes():
                size += len(chunk)
                if size > self.max_bytes or time.monotonic() - self.last_start[host] > 60:
                    raise ValueError("source response exceeds byte/time bound")
                chunks.append(chunk)
            return httpx.Response(
                response.status_code,
                # iter_bytes has already decoded the transport. Do not decode it twice.
                headers={
                    key: value
                    for key, value in response.headers.items()
                    if key not in ("content-encoding", "content-length", "transfer-encoding")
                },
                content=b"".join(chunks),
                request=response.request,
            )

    def fetch(self, source: str, url: str, season: str) -> WorkbenchAcquisition:
        interval = self.validate_url(source, url, season)
        if interval == 0:
            raise ValueError("this source requires a versioned local import")
        host = urlsplit(url).netloc
        receipt = WorkbenchAcquisition(
            source_name=source,
            resource=self.resource,
            source_url=url,
            status="failed",
            started_at=utc_now(),
            metadata_json={
                "policy": POLICY_VERSION,
                "user_agent": USER_AGENT,
                "season": season,
                "kind": self.kinds[source],
                "mode": "scheduled_fetch",
            },
        )
        self.session.add(receipt)
        try:
            if self.session.bind is not None and self.session.bind.dialect.name == "postgresql":
                lock_id = int.from_bytes(
                    hashlib.sha256(host.encode()).digest()[:8], "big", signed=True
                )
                owns_host = self.session.scalar(
                    text("SELECT pg_try_advisory_xact_lock(:key)"), {"key": lock_id}
                )
                if not owns_host:
                    raise ValueError("another scheduled run owns this host")
            if host in self.stopped:
                raise ValueError("host already stopped for this run")
            previous_attempt = self.session.scalar(
                select(WorkbenchAcquisition)
                .where(
                    WorkbenchAcquisition.source_url.like(f"https://{host}/%"),
                    WorkbenchAcquisition.finished_at.is_not(None),
                )
                .order_by(WorkbenchAcquisition.finished_at.desc())
                .limit(1)
            )
            if previous_attempt is not None and previous_attempt.finished_at is not None:
                finished = previous_attempt.finished_at
                if finished.tzinfo is None:
                    finished = finished.replace(tzinfo=UTC)
                interval = max(
                    interval,
                    float(previous_attempt.metadata_json.get("interval_seconds", interval)),
                )
                remaining = interval - (datetime.now(UTC) - finished).total_seconds()
                if remaining > 0:
                    time.sleep(remaining)
            if host in self.robots:
                robots, robot_artifact = self.robots[host]
            else:
                robots = self._get(f"https://{host}/robots.txt", interval)
                robot_artifact = retain(
                    robots.content,
                    self.root,
                    f"{self.resource}_robots",
                    host,
                    self.session,
                    "text/plain",
                )
                self.robots[host] = (robots, robot_artifact)
            meta = {
                **receipt.metadata_json,
                "robots_status": robots.status_code,
                "robots_sha256": robot_artifact.sha256,
            }
            receipt.metadata_json = meta
            if robots.status_code not in (200, 404, 410):
                if host not in self.robots_optional_hosts:
                    self.stopped.add(host)
                    raise ValueError(f"robots.txt unavailable: HTTP {robots.status_code}")
                self.stopped.discard(host)
                meta = {**meta, "robots_unavailable": True}
            previous = self.session.scalar(
                select(WorkbenchAcquisition)
                .where(
                    WorkbenchAcquisition.status == "success",
                    WorkbenchAcquisition.source_url.like(f"https://{host}/%"),
                    WorkbenchAcquisition.metadata_json["robots_sha256"].as_string().is_not(None),
                )
                .order_by(WorkbenchAcquisition.finished_at.desc())
                .limit(1)
            )
            parser = RobotFileParser()
            parser.parse(robots.text.splitlines() if robots.status_code == 200 else [])
            meta = {
                **meta,
                "robots_changed": bool(
                    previous
                    and previous.metadata_json.get("robots_sha256") != robot_artifact.sha256
                ),
                "robots_disallowed": not parser.can_fetch(USER_AGENT, url),
            }
            receipt.metadata_json = meta
            interval = max(interval, float(parser.crawl_delay(USER_AGENT) or 0))
            response = self._get(url, interval)
            receipt.http_status = response.status_code
            if self.retain_bodies:
                artifact = retain(
                    response.content,
                    self.root,
                    self.resource,
                    source,
                    self.session,
                    response.headers.get("content-type", "application/octet-stream"),
                )
                receipt.artifact_id, receipt.bytes = artifact.id, artifact.bytes
                receipt.content_sha256 = artifact.sha256
            else:
                receipt.bytes = len(response.content)
                receipt.content_sha256 = hashlib.sha256(response.content).hexdigest()
                self.session.flush()
                self.bodies[receipt.id] = response.content
            if response.status_code != 200:
                raise ValueError(f"source HTTP {response.status_code}; no retry")
            receipt.metadata_json = {
                **meta,
                "interval_seconds": interval,
                "last_modified": response.headers.get("last-modified"),
            }
            receipt.status = "success"
        except (ValueError, httpx.HTTPError) as error:
            receipt.error_summary = str(error)[:500]
        receipt.finished_at = utc_now()
        self.session.flush()
        return receipt


def keep_body(fetcher: ScheduledFetcher, receipt: WorkbenchAcquisition, mime: str) -> None:
    """Retain a store-on-change run's body and point its receipt at it (caller commits)."""
    artifact = retain(
        fetcher.bodies[receipt.id],
        fetcher.root,
        fetcher.resource,
        receipt.source_name,
        fetcher.session,
        mime,
    )
    receipt.artifact_id = artifact.id


def write_heartbeat(directory: Path, payload: dict[str, Any]) -> None:
    """Overwrite a few hundred bytes each run: when the served data was last confirmed."""
    directory.mkdir(parents=True, exist_ok=True)
    tmp = directory / f"{HEARTBEAT}.tmp"
    tmp.write_text(json.dumps(payload, sort_keys=True))
    os.replace(tmp, directory / HEARTBEAT)


def read_heartbeat(directory: Path) -> dict[str, Any] | None:
    try:
        beat = json.loads((directory / HEARTBEAT).read_text())
    except (OSError, ValueError):
        return None
    return beat if isinstance(beat, dict) else None


def prune_receipts(session: Session, source: str, keep_days: int, now: datetime) -> int:
    """Drop one source's receipts of unchanged runs (no retained bytes) older than the window.

    Receipts of changed runs keep pointing at what was sealed from them; an unchanged run's
    receipts only said "still the same", which the newer heartbeat already says.
    """
    result = session.execute(
        delete(WorkbenchAcquisition)
        .where(
            WorkbenchAcquisition.source_name == source,
            WorkbenchAcquisition.artifact_id.is_(None),
            WorkbenchAcquisition.finished_at < now - timedelta(days=keep_days),
        )
        # SQL decides; the in-memory evaluator cannot compare SQLite's naive timestamps.
        .execution_options(synchronize_session=False)
    )
    session.commit()
    return int(getattr(result, "rowcount", 0) or 0)
