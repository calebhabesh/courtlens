"""Scheduled acquisition and immutable admission of season-level stats feeds (PC07).

Callers commit acquisition receipts before admission, and own commit/rollback.
No reads, imports or downloads swap the public analytical pointer.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from courtlens.domain.context import CapabilityEntry, CapabilityStatus
from courtlens.domain.rich_sources import compute_payload_hash
from courtlens.domain.teams import NBA_TEAMS
from courtlens.ingestion.stats_feeds import (
    CAPABILITIES,
    DEFENSE,
    HOOPR_SOURCE,
    LINEUP_MEASURES,
    PARSER_VERSION,
    PBPSTATS_SOURCE,
    PHASES,
    PLAY_TYPES,
    SPECS,
    TRACKING,
    FeedScope,
    hoopr_url,
    parse_feed,
    pbpstats_url,
    scope_for_url,
    valid_season,
)
from courtlens.services.source_acquisition import ScheduledFetcher
from courtlens.stats_feed_models import StatsFeedDataset, StatsFeedMember, StatsFeedVersion
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchArtifact

RESOURCE = "stats_feeds"
# The 2025-26 regular-season matchup file is 21.3 MB; bound mirror files at 48 MB.
FEED_MAX_BYTES = 48_000_000
INTERVALS = {HOOPR_SOURCE: 1.0, PBPSTATS_SOURCE: 5.0}
ADVISORY_LOCK = 1129074773


def validate_feed_url(source: str, url: str, season: str) -> float:
    scope_for_url(source, url, season)
    return INTERVALS[source]


class FeedFetcher(ScheduledFetcher):
    def __init__(self, session: Session, root: Path, client: httpx.Client) -> None:
        super().__init__(
            session,
            root,
            client,
            resource=RESOURCE,
            kinds={HOOPR_SOURCE: "stats_feed", PBPSTATS_SOURCE: "stats_feed"},
            validate_url=validate_feed_url,
            max_bytes=FEED_MAX_BYTES,
        )


def run_plan(
    revision: str,
    season: str,
    draft_years: list[int],
    *,
    pbpstats: bool = True,
    pbpstats_lineups: bool = True,
) -> list[tuple[str, str, str]]:
    """Totals files only; per-game and per-possession rates are derived downstream."""
    valid_season(season)
    label = int(season[:4]) + 1
    plan: list[tuple[str, str, str]] = []
    for phase in PHASES:
        for play in PLAY_TYPES:
            for side in ("offensive", "defensive"):
                file = f"{phase}_{play}_{side}_totals"
                plan.append(
                    (HOOPR_SOURCE, hoopr_url(revision, "synergyplaytypes", label, file), season)
                )
        for endpoint, variants in (
            ("leaguedashptstats", TRACKING),
            ("leaguedashptdefend", DEFENSE),
            ("leaguedashlineups", LINEUP_MEASURES),
        ):
            for variant in variants:
                file = f"{phase}_{variant}_totals"
                plan.append((HOOPR_SOURCE, hoopr_url(revision, endpoint, label, file), season))
        for endpoint in ("leaguehustlestatsplayer", "leagueseasonmatchups"):
            file = f"{phase}_totals"
            plan.append((HOOPR_SOURCE, hoopr_url(revision, endpoint, label, file), season))
    for year in draft_years:
        for endpoint in ("draftcombineplayeranthro", "draftcombinestats", "drafthistory"):
            plan.append((HOOPR_SOURCE, hoopr_url(revision, endpoint, year + 1, None), str(year)))
    if pbpstats:
        for phase in ("regular_season", "playoffs"):
            for kind in ("Player", "Team"):
                plan.append((PBPSTATS_SOURCE, pbpstats_url(season, phase, kind), season))
        if pbpstats_lineups:
            for team_id in sorted(NBA_TEAMS):
                url = pbpstats_url(season, "regular_season", "Lineup", team_id)
                plan.append((PBPSTATS_SOURCE, url, season))
    return plan


def _retained_body(session: Session, receipt: WorkbenchAcquisition, root: Path) -> bytes:
    artifact = session.get(WorkbenchArtifact, receipt.artifact_id)
    if artifact is None:
        raise ValueError("missing retained artifact")
    path = (root / artifact.storage_path).resolve()
    if not path.is_relative_to(root.resolve()) or path.stat().st_size > FEED_MAX_BYTES:
        raise ValueError("invalid retained locator/byte size")
    body = path.read_bytes()
    if len(body) != artifact.bytes or hashlib.sha256(body).hexdigest() != artifact.sha256:
        raise ValueError("retained artifact checksum mismatch")
    return body


def _scope(receipt: WorkbenchAcquisition) -> FeedScope:
    return scope_for_url(receipt.source_name, receipt.source_url, receipt.metadata_json["season"])


def admit_feed(session: Session, acquisition_id: str, root: Path) -> StatsFeedDataset:
    receipt = session.get(WorkbenchAcquisition, acquisition_id)
    if (
        receipt is None
        or receipt.resource != RESOURCE
        or receipt.status != "success"
        or not receipt.artifact_id
        or receipt.finished_at is None
    ):
        raise ValueError("a successful retained stats feed acquisition is required")
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": ADVISORY_LOCK})
    existing = session.scalar(
        select(StatsFeedDataset).where(StatsFeedDataset.acquisition_id == acquisition_id)
    )
    if existing is not None:
        return existing
    scope = _scope(receipt)
    body = _retained_body(session, receipt, root)
    parsed = parse_feed(body, scope)
    artifact_sha = hashlib.sha256(body).hexdigest()
    content = [
        (payload["entity_key"], compute_payload_hash({"parser": PARSER_VERSION, **payload}))
        for _, payload in parsed.rows
    ]
    member_hash = compute_payload_hash(
        {
            "artifact_sha256": artifact_sha,
            "members": sorted(
                (locator, h) for (locator, _), (_, h) in zip(parsed.rows, content, strict=True)
            ),
        }
    )
    order = (session.scalar(select(func.max(StatsFeedDataset.observation_order))) or 0) + 1
    transaction = (
        str(session.scalar(text("SELECT txid_current()")))
        if session.bind is not None and session.bind.dialect.name == "postgresql"
        else "sqlite"
    )
    observed = receipt.finished_at
    # SQLite loses tzinfo on reload; its UTC column convention is explicit.
    if observed.tzinfo is None:
        observed = observed.replace(tzinfo=UTC)
    if observed > datetime.now(UTC):
        raise ValueError("future acquisition time")
    dataset = StatsFeedDataset(
        acquisition_id=receipt.id,
        source_name=scope.source,
        feed=scope.feed,
        capability=scope.capability,
        season=scope.season,
        season_type=scope.season_type,
        variant=scope.variant,
        upstream_revision=scope.revision,
        content_sha256=compute_payload_hash(
            {
                "source": scope.source,
                "feed": scope.feed,
                "season": scope.season,
                "season_type": scope.season_type,
                "variant": scope.variant,
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
    # Chunked: the 2025-26 matchup file alone has 147k keys, beyond the bind-parameter limit.
    keys = [k for k, _ in content]
    existing_versions: dict[tuple[str, str], str] = {}
    for start in range(0, len(keys), 5000):
        for version_id, key, digest in session.execute(
            select(
                StatsFeedVersion.id, StatsFeedVersion.entity_key, StatsFeedVersion.content_sha256
            ).where(
                StatsFeedVersion.source_name == scope.source,
                StatsFeedVersion.feed == scope.feed,
                StatsFeedVersion.season == scope.season,
                StatsFeedVersion.entity_key.in_(keys[start : start + 5000]),
            )
        ):
            existing_versions[(key, digest)] = version_id
    for (locator, payload), (key, digest) in zip(parsed.rows, content, strict=True):
        version_id = existing_versions.get((key, digest))
        if version_id is None:
            version = StatsFeedVersion(
                source_name=scope.source,
                feed=scope.feed,
                season=scope.season,
                entity_key=key,
                content_sha256=digest,
                payload_json=payload,
            )
            session.add(version)
            session.flush()
            version_id = version.id
        session.add(
            StatsFeedMember(
                dataset_id=dataset.id,
                entity_key=key,
                source_name=scope.source,
                feed=scope.feed,
                season=scope.season,
                version_id=version_id,
                row_locator=locator,
            )
        )
    session.flush()
    return dataset


def verify_feed(session: Session, dataset_id: str, root: Path) -> dict[str, Any]:
    """Re-parse retained bytes and recompute both hashes; never rewrites anything."""
    dataset = session.get(StatsFeedDataset, dataset_id)
    if dataset is None:
        raise ValueError("unknown stats feed dataset")
    receipt = session.get(WorkbenchAcquisition, dataset.acquisition_id)
    if receipt is None:
        raise ValueError("missing acquisition receipt")
    body = _retained_body(session, receipt, root)
    parsed = parse_feed(body, _scope(receipt))
    content = [
        (payload["entity_key"], compute_payload_hash({"parser": PARSER_VERSION, **payload}))
        for _, payload in parsed.rows
    ]
    # A join, not an IN list: matchup datasets exceed the bind-parameter limit.
    stored = {
        key: digest
        for key, digest in session.execute(
            select(StatsFeedMember.entity_key, StatsFeedVersion.content_sha256)
            .join(StatsFeedVersion, StatsFeedVersion.id == StatsFeedMember.version_id)
            .where(StatsFeedMember.dataset_id == dataset.id)
        )
    }
    member_hash = compute_payload_hash(
        {
            "artifact_sha256": hashlib.sha256(body).hexdigest(),
            "members": sorted(
                (locator, h) for (locator, _), (_, h) in zip(parsed.rows, content, strict=True)
            ),
        }
    )
    checks = {
        "membership_sha256": member_hash == dataset.membership_sha256,
        "member_count": len(stored) == len(content),
        "row_hashes": dict(content) == stored,
        "coverage": parsed.coverage == dataset.coverage_json,
    }
    return {"dataset_id": dataset.id, "verified": all(checks.values()), "checks": checks}


def latest_datasets(session: Session, known_at: datetime | None = None) -> list[StatsFeedDataset]:
    """Latest admitted observation per scope, optionally as known at an aware instant."""
    query = select(StatsFeedDataset)
    if known_at is not None:
        if known_at.tzinfo is None:
            raise ValueError("knownAt must include a timezone")
        query = query.where(StatsFeedDataset.observed_at <= known_at)
    latest: dict[tuple[str, ...], StatsFeedDataset] = {}
    for dataset in session.scalars(query.order_by(StatsFeedDataset.observation_order)):
        key = (
            dataset.source_name,
            dataset.feed,
            dataset.season,
            dataset.season_type,
            dataset.variant,
        )
        latest[key] = dataset
    return list(latest.values())


def _scope_label(season: str, season_type: str) -> str:
    return f"{season} draft" if season_type == "draft" else f"{season} {season_type}"


def feed_capabilities(
    session: Session, known_at: datetime | None = None
) -> dict[str, CapabilityEntry]:
    """Declared from measured coverage. Truncated or empty observations make it partial."""
    by_capability: dict[str, list[StatsFeedDataset]] = {}
    for dataset in latest_datasets(session, known_at):
        by_capability.setdefault(dataset.capability, []).append(dataset)
    entries = {}
    for capability in CAPABILITIES:
        datasets = by_capability.get(capability)
        if not datasets:
            continue
        sources = sorted({d.source_name for d in datasets})
        scopes = sorted({_scope_label(d.season, d.season_type) for d in datasets})
        limitations = [f"Observed: {', '.join(scopes)} ({', '.join(sources)})."]
        empty = sorted(
            f"{d.feed} {d.variant or 'all'} {_scope_label(d.season, d.season_type)}"
            for d in datasets
            if d.coverage_json.get("empty")
        )
        truncated = sorted(
            f"{d.feed} {d.variant or 'all'} {_scope_label(d.season, d.season_type)}"
            for d in datasets
            if d.coverage_json.get("truncated")
        )
        if empty:
            limitations.append(
                f"Source returned zero rows (unknown, not zero): {'; '.join(empty)}."
            )
        if truncated:
            limitations.append(f"Truncated at the source row cap: {'; '.join(truncated)}.")
        if capability == "on_off":
            limitations.append(
                "pbpstats season totals (possessions, plus-minus) are a secondary cross-check; "
                "they are not on/off splits."
            )
        limitations.append("Season totals only; unlisted seasons are not observed.")
        entries[capability] = CapabilityEntry(
            name=capability,
            status=CapabilityStatus.PARTIAL,
            seasons=sorted({d.season for d in datasets}),
            phases=sorted({d.season_type for d in datasets}),
            limitations=limitations,
        )
    return entries


def coverage_summary(session: Session) -> list[dict[str, Any]]:
    return [
        {
            "dataset_id": d.id,
            "source": d.source_name,
            "feed": d.feed,
            "capability": d.capability,
            "season": d.season,
            "season_type": d.season_type,
            "variant": d.variant,
            "upstream_revision": d.upstream_revision,
            "observed_at": d.observed_at.isoformat(),
            "rows": d.coverage_json.get("rows"),
            "empty": d.coverage_json.get("empty"),
            "truncated": d.coverage_json.get("truncated"),
            "content_sha256": d.content_sha256,
        }
        for d in sorted(
            latest_datasets(session),
            key=lambda d: (d.capability, d.feed, d.season, d.season_type, d.variant),
        )
    ]


__all__ = [
    "SPECS",
    "FeedFetcher",
    "admit_feed",
    "coverage_summary",
    "feed_capabilities",
    "latest_datasets",
    "run_plan",
    "verify_feed",
]
