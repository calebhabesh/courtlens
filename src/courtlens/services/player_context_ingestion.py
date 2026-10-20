"""Scheduled acquisition and immutable admission of independent player context inputs.

Callers commit acquisition receipts before admission, and own commit/rollback.
No reads, imports or downloads swap the public analytical pointer.
"""

from __future__ import annotations

import hashlib
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from courtlens.domain.rich_sources import compute_payload_hash
from courtlens.domain.source_policy import POLICY_VERSION, USER_AGENT
from courtlens.ingestion.player_context import (
    PARSER_VERSION,
    ParsedContext,
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
from courtlens.services.player_context import aware
from courtlens.services.source_acquisition import (
    KEEP_DAYS,
    MAX_BYTES,
    ScheduledFetcher,
    keep_body,
    prune_receipts,
    retain,
)
from courtlens.workbench_models import (
    WorkbenchAcquisition,
    WorkbenchArtifact,
    WorkbenchIdentityCrosswalk,
)

PLAYER_INDEX_URL = "https://cdn.nba.com/static/json/staticData/playerIndex.json"
ESPN_URL = "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/injuries"
TRANSACTIONS_URL = "https://www.nba.com/players/transactions"
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


class ContextFetcher(ScheduledFetcher):
    def __init__(
        self, session: Session, root: Path, client: httpx.Client, *, retain_bodies: bool = True
    ) -> None:
        super().__init__(
            session,
            root,
            client,
            resource="player_context",
            kinds=SOURCE_KINDS,
            validate_url=source_url,
            retain_bodies=retain_bodies,
        )


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


def row_hashes(parsed: ParsedContext) -> list[tuple[str, str]]:
    return [
        (payload["entity_key"], compute_payload_hash({"parser": PARSER_VERSION, **payload}))
        for _, payload in parsed.rows
    ]


def content_sha256(source: str, kind: str, season: str, parsed: ParsedContext) -> str:
    """A dataset's content address: equal for equal admitted rows whatever the raw bytes."""
    return compute_payload_hash(
        {
            "source": source,
            "kind": kind,
            "season": season,
            "parser": PARSER_VERSION,
            "rows": sorted(row_hashes(parsed)),
            "coverage": parsed.coverage,
        }
    )


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
    content = row_hashes(parsed)
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
        content_sha256=content_sha256(source, kind, season, parsed),
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


HOOPR_REPO = "sportsdataverse/hoopR-nba-stats-raw"


def hoopr_index_url(revision: str, season: str) -> str:
    return (
        f"https://raw.githubusercontent.com/{HOOPR_REPO}/{revision}"
        f"/nba_stats/json/playerindex/{int(season[:4]) + 1}.json"
    )


def latest_hoopr_revision(client: httpx.Client, season: str) -> str:
    """The newest hoopR commit touching the season's player index (it updates daily ~12:10 UTC).

    The fetched URL stays pinned to that commit, so a dataset names exactly the bytes it read.
    """
    path = f"nba_stats/json/playerindex/{int(season[:4]) + 1}.json"
    response = client.get(
        f"https://api.github.com/repos/{HOOPR_REPO}/commits",
        params={"path": path, "per_page": 1},
        headers={"User-Agent": USER_AGENT, "Accept": "application/vnd.github+json"},
        timeout=30,
    )
    response.raise_for_status()
    commits = response.json()
    revision = commits[0]["sha"] if isinstance(commits, list) and commits else None
    if not isinstance(revision, str) or not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("hoopR returned no player index revision")
    return revision


def latest_index(session: Session, season: str) -> PlayerContextDataset | None:
    return session.scalars(
        select(PlayerContextDataset)
        .where(PlayerContextDataset.kind == "player_index", PlayerContextDataset.season == season)
        .order_by(
            PlayerContextDataset.observed_at.desc(), PlayerContextDataset.observation_order.desc()
        )
        .limit(1)
    ).first()


def refresh_player_index(
    session: Session,
    root: Path,
    client: httpx.Client,
    season: str,
    keep_days: int = KEEP_DAYS,
) -> dict[str, Any]:
    """Scheduled run: admit hoopR's newest player index only when its admitted rows changed.

    The same commit as the newest dataset skips the download. A new commit whose rows match
    (hoopR republishes daily; most days no roster field moves) keeps only the receipt, which
    is pruned after the window; player context datasets are sealed and never pruned.
    """
    source = "hoopr_player_index"
    current = latest_index(session, season)
    revision = latest_hoopr_revision(client, season)
    url = hoopr_index_url(revision, season)
    summary: dict[str, Any] = {"season": season, "revision": revision}
    if current is not None:
        acquired = session.get(WorkbenchAcquisition, current.acquisition_id)
        if acquired is not None and acquired.source_url == url:
            return {**summary, "changed": False, "dataset_id": current.id, "fetched": False}
    fetcher = ContextFetcher(session, root, client, retain_bodies=False)
    receipt = fetcher.fetch(source, url, season)
    session.commit()
    body = fetcher.bodies.get(receipt.id)
    if receipt.status != "success" or body is None or receipt.finished_at is None:
        raise ValueError(f"hoopR player index: {receipt.error_summary}; nothing admitted")
    parsed = parse_player_index(body, season)
    pruned = prune_receipts(session, source, keep_days, aware(receipt.finished_at))
    summary |= {"active_players": parsed.coverage["active_players"], "pruned": pruned}
    if current is not None and current.content_sha256 == content_sha256(
        source, SOURCE_KINDS[source], season, parsed
    ):
        return {**summary, "changed": False, "dataset_id": current.id, "fetched": True}
    keep_body(fetcher, receipt, "application/json")
    session.commit()
    dataset = admit_context(session, receipt.id, root)
    session.commit()
    return {**summary, "changed": True, "dataset_id": dataset.id, "fetched": True}
