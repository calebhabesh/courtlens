"""Shared scheduled source acquisition (source policy v3); no visitor-triggered downloads.

Policy v3 removes CourtLens' own source gates: robots.txt is read for pacing (Crawl-delay) and
recorded on every receipt, but a disallow or a changed file is noted, not a refusal. A source that
itself refuses (HTTP 403/429) still stops the run; nothing here evades a refusal.
"""

from __future__ import annotations

import hashlib
import time
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from courtlens.domain.source_policy import POLICY_VERSION, USER_AGENT
from courtlens.models import utc_now
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchArtifact

MAX_BYTES = 16_000_000


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
    ) -> None:
        self.session, self.root, self.client = session, root, client
        self.max_bytes = max_bytes
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
                self.stopped.add(host)
                raise ValueError(f"robots.txt unavailable: HTTP {robots.status_code}")
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
