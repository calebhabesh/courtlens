"""Scheduled acquisition and immutable admission of independent player context inputs.

Callers commit acquisition receipts before admission, and own commit/rollback.
No reads, imports or downloads swap the public analytical pointer.
"""

from __future__ import annotations

import hashlib
import re
import time
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import urlsplit
from urllib.robotparser import RobotFileParser

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from courtlens.domain.rich_sources import compute_payload_hash
from courtlens.domain.source_policy import POLICY_VERSION, USER_AGENT
from courtlens.ingestion.player_context import (
    PARSER_VERSION,
    parse_espn_injuries,
    parse_injury_text,
    parse_player_index,
    parse_transactions,
    pdf_text,
    valid_season,
)
from courtlens.models import utc_now
from courtlens.player_context_models import (
    PlayerContextDataset,
    PlayerContextMember,
    PlayerContextVersion,
)
from courtlens.workbench_models import (
    WorkbenchAcquisition,
    WorkbenchArtifact,
    WorkbenchIdentityCrosswalk,
)

PLAYER_INDEX_URL = "https://cdn.nba.com/static/json/staticData/playerIndex.json"
ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
TRANSACTIONS_URL = "https://www.nba.com/players/transactions"
MAX_BYTES = 16_000_000
SOURCE_KINDS = {
    "nba_player_index": "player_index",
    "hoopr_player_index": "player_index",
    "nba_injury_report": "injuries",
    "espn_injuries": "injuries",
    "nba_transactions": "transactions",
}


def source_url(source: str, url: str, season: str) -> float:
    """Exact allowlist; mirror revision/season cannot drift via redirects or URLs."""
    valid_season(season)
    if source == "nba_player_index" and url == PLAYER_INDEX_URL:
        return 3
    if source == "espn_injuries" and url == ESPN_URL:
        return 5
    if source == "nba_transactions" and url == TRANSACTIONS_URL:
        return 0  # Local operator import only.
    if source == "nba_injury_report" and re.fullmatch(
        r"https://ak-static\.cms\.nba\.com/referee/injury/Injury-Report_"
        r"\d{4}-\d{2}-\d{2}_\d{2}_\d{2}[AP]M\.pdf",
        url,
    ):
        return 3
    if source == "hoopr_player_index" and re.fullmatch(
        r"https://raw\.githubusercontent\.com/sportsdataverse/hoopR-nba-stats-raw/"
        rf"[0-9a-f]{{40}}/nba_stats/json/playerindex/{int(season[:4]) + 1}\.json",
        url,
    ):
        return 1
    raise ValueError("source URL is not admitted for this kind/season")


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


class ContextFetcher:
    """One bounded scheduled run: serial per host, robots checked, blocked hosts stopped."""

    def __init__(self, session: Session, root: Path, client: httpx.Client) -> None:
        self.session, self.root, self.client = session, root, client
        self.last_start: dict[str, float] = {}
        self.stopped: set[str] = set()

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
                if size > MAX_BYTES or time.monotonic() - self.last_start[host] > 60:
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
        interval = source_url(source, url, season)
        if source == "nba_transactions":
            raise ValueError("transactions require a versioned official-evidence local import")
        host = urlsplit(url).netloc
        receipt = WorkbenchAcquisition(
            source_name=source,
            resource="player_context",
            source_url=url,
            status="failed",
            started_at=utc_now(),
            metadata_json={
                "policy": POLICY_VERSION,
                "user_agent": USER_AGENT,
                "season": season,
                "kind": SOURCE_KINDS[source],
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
                    WorkbenchAcquisition.resource == "player_context",
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
            robots_url = f"https://{host}/robots.txt"
            robots = self._get(robots_url, interval)
            robot_artifact = retain(
                robots.content, self.root, "context_robots", host, self.session, "text/plain"
            )
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
                    WorkbenchAcquisition.source_name == source,
                    WorkbenchAcquisition.status == "success",
                    WorkbenchAcquisition.source_url.like(f"https://{host}/%"),
                )
                .order_by(WorkbenchAcquisition.finished_at.desc())
                .limit(1)
            )
            if previous and previous.metadata_json.get("robots_sha256") != robot_artifact.sha256:
                self.stopped.add(host)
                raise ValueError("robots.txt changed; host stopped for review")
            parser = RobotFileParser()
            parser.parse(robots.text.splitlines() if robots.status_code == 200 else [])
            if not parser.can_fetch(USER_AGENT, url):
                self.stopped.add(host)
                raise ValueError("robots.txt disallows source path")
            interval = max(interval, float(parser.crawl_delay(USER_AGENT) or 0))
            response = self._get(url, interval)
            receipt.http_status = response.status_code
            artifact = retain(
                response.content,
                self.root,
                "player_context",
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


def capture_local(
    session: Session, root: Path, path: Path, source: str, url: str, season: str
) -> WorkbenchAcquisition:
    """Actual local import time, never a user-supplied historical observation time."""
    source_url(source, url, season)
    if path.stat().st_size > MAX_BYTES:
        raise ValueError("local input exceeds byte bound")
    artifact = retain(
        path.read_bytes(),
        root,
        "player_context",
        source,
        session,
        "application/pdf" if source == "nba_injury_report" else "application/json",
    )
    receipt = WorkbenchAcquisition(
        source_name=source,
        resource="player_context",
        source_url=url,
        status="success",
        artifact_id=artifact.id,
        bytes=artifact.bytes,
        content_sha256=artifact.sha256,
        started_at=utc_now(),
        finished_at=utc_now(),
        metadata_json={
            "policy": POLICY_VERSION,
            "season": season,
            "kind": SOURCE_KINDS[source],
            "mode": "local_import",
            "upstream_observed_at": None,
        },
    )
    session.add(receipt)
    session.flush()
    return receipt


def admit_context(session: Session, acquisition_id: str, root: Path) -> PlayerContextDataset:
    receipt = session.get(WorkbenchAcquisition, acquisition_id)
    if (
        receipt is None
        or receipt.status != "success"
        or not receipt.artifact_id
        or receipt.finished_at is None
    ):
        raise ValueError("a successful retained acquisition is required")
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(1129074771)"))
    existing = session.scalar(
        select(PlayerContextDataset).where(PlayerContextDataset.acquisition_id == acquisition_id)
    )
    if existing is not None:
        return existing
    source = receipt.source_name
    season = valid_season(receipt.metadata_json["season"])
    source_url(source, receipt.source_url, season)
    artifact = session.get(WorkbenchArtifact, receipt.artifact_id)
    if artifact is None:
        raise ValueError("missing retained artifact")
    path = (root / artifact.storage_path).resolve()
    if not path.is_relative_to(root.resolve()) or path.stat().st_size > MAX_BYTES:
        raise ValueError("invalid retained locator/byte size")
    body = path.read_bytes()
    if len(body) != artifact.bytes or hashlib.sha256(body).hexdigest() != artifact.sha256:
        raise ValueError("retained artifact checksum mismatch")
    if source in ("nba_player_index", "hoopr_player_index"):
        parsed = parse_player_index(body, season)
    elif source == "nba_injury_report":
        parsed = parse_injury_text(pdf_text(body), season)
    elif source == "espn_injuries":
        parsed = parse_espn_injuries(body, season)
    else:
        parsed = parse_transactions(body, season)
    kind = SOURCE_KINDS[source]
    # Freeze only explicitly verified mappings into this admission. A later crosswalk
    # edit cannot relabel an old report. No lazy seeding or name matching occurs.
    if kind == "injuries":
        for _, payload in parsed.rows:
            mappings = list(
                session.scalars(
                    select(WorkbenchIdentityCrosswalk).where(
                        WorkbenchIdentityCrosswalk.source_namespace == payload["namespace"],
                        WorkbenchIdentityCrosswalk.source_id == payload.get("source_player_id"),
                        WorkbenchIdentityCrosswalk.target_namespace == "nba",
                        WorkbenchIdentityCrosswalk.kind == "player",
                        WorkbenchIdentityCrosswalk.confidence == "verified",
                        WorkbenchIdentityCrosswalk.updated_at <= receipt.finished_at,
                    )
                ).all()
            )
            targets = {m.target_id for m in mappings}
            if len(targets) == 1:
                payload["player_id"] = targets.pop()
                payload["identity_reason"] = None
                payload["crosswalk_evidence"] = [
                    {"id": m.id, "method": m.mapping_method, "evidence": m.evidence_json}
                    for m in sorted(mappings, key=lambda m: m.id)
                ]
        parsed.coverage["unresolved_players"] = sum(
            p.get("player_id") is None and p.get("name") is not None for _, p in parsed.rows
        )
    content = [
        (payload["entity_key"], compute_payload_hash({"parser": PARSER_VERSION, **payload}))
        for _, payload in parsed.rows
    ]
    member_hash = compute_payload_hash(
        {
            "artifact_sha256": artifact.sha256,
            "members": sorted(
                (locator, h) for (locator, _), (_, h) in zip(parsed.rows, content, strict=True)
            ),
        }
    )
    order = (session.scalar(select(func.max(PlayerContextDataset.observation_order))) or 0) + 1
    transaction = (
        str(session.scalar(text("SELECT txid_current()")))
        if session.bind is not None and session.bind.dialect.name == "postgresql"
        else "sqlite"
    )
    observed = receipt.finished_at
    if observed is None:
        raise ValueError("missing acquisition completion time")
    # SQLite loses tzinfo on reload; its UTC column convention is explicit.
    if observed.tzinfo is None:
        observed = observed.replace(tzinfo=UTC)
    if observed > datetime.now(UTC):
        raise ValueError("future acquisition time")
    dataset = PlayerContextDataset(
        acquisition_id=receipt.id,
        source_name=source,
        kind=kind,
        season=season,
        content_sha256=compute_payload_hash(
            {
                "source": source,
                "kind": kind,
                "season": season,
                "parser": PARSER_VERSION,
                "rows": sorted(content),
                "coverage": parsed.coverage,
            }
        ),
        membership_sha256=member_hash,
        parser_version=PARSER_VERSION,
        observed_at=observed,
        observation_order=order,
        admission_transaction=transaction,
        coverage_json=parsed.coverage,
    )
    session.add(dataset)
    session.flush()
    for (locator, payload), (key, digest) in zip(parsed.rows, content, strict=True):
        version = session.scalar(
            select(PlayerContextVersion).where(
                PlayerContextVersion.source_name == source,
                PlayerContextVersion.kind == kind,
                PlayerContextVersion.season == season,
                PlayerContextVersion.entity_key == key,
                PlayerContextVersion.content_sha256 == digest,
            )
        )
        if version is None:
            version = PlayerContextVersion(
                source_name=source,
                kind=kind,
                season=season,
                entity_key=key,
                content_sha256=digest,
                payload_json=payload,
            )
            session.add(version)
            session.flush()
        session.add(
            PlayerContextMember(
                dataset_id=dataset.id,
                entity_key=key,
                source_name=source,
                kind=kind,
                season=season,
                version_id=version.id,
                row_locator=locator,
            )
        )
    session.flush()
    return dataset
