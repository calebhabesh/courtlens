"""PC06 scheduled acquisitions → one independent immutable finance book per run.

The caller commits acquisition receipts before admission, owns commit/rollback, and
never swaps the analytical publication pointer. Name matching is not identity evidence.
"""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path
from typing import Any

import httpx
from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from courtlens.domain.finance import FinanceManifest, FinanceRow, export_csv
from courtlens.domain.finance_context import RefreshInfo, ThresholdInfo, ThresholdInput
from courtlens.domain.source_policy import POLICY_VERSION
from courtlens.finance_context_models import FinanceRefresh, FinanceRefreshSource, FinanceThreshold
from courtlens.finance_models import FinanceRelease
from courtlens.ingestion.finance_sources import (
    MAX_HTML_BYTES,
    PARSER_VERSION,
    SOURCE_KINDS,
    parse_bref,
    parse_spotrac,
    source_url,
)
from courtlens.models import utc_now
from courtlens.services.finance_import import admit_bundle, bounded_read, digest, verify_release
from courtlens.services.player_context import aware, dataset_rows, resolve_dataset
from courtlens.services.source_acquisition import ScheduledFetcher
from courtlens.workbench_models import (
    WorkbenchAcquisition,
    WorkbenchArtifact,
    WorkbenchIdentity,
    WorkbenchIdentityCrosswalk,
)


class FinanceFetcher(ScheduledFetcher):
    def __init__(self, session: Session, root: Path, client: httpx.Client) -> None:
        super().__init__(
            session, root, client, resource="finance", kinds=SOURCE_KINDS, validate_url=source_url
        )


def import_thresholds(session: Session, path: Path) -> FinanceThreshold:
    raw = bounded_read(path, 10_000)
    payload = ThresholdInput.model_validate_json(raw).model_dump(mode="json")
    content_hash = digest(payload)
    existing = session.scalar(
        select(FinanceThreshold).where(FinanceThreshold.content_sha256 == content_hash)
    )
    if existing:
        return existing
    record = FinanceThreshold(
        season=payload["season"],
        content_sha256=content_hash,
        observed_at=utc_now(),
        source_bytes=raw,
        payload_json=payload,
    )
    session.add(record)
    session.flush()
    return record


def threshold_info(record: FinanceThreshold) -> ThresholdInfo:
    if (
        digest(ThresholdInput.model_validate_json(record.source_bytes).model_dump(mode="json"))
        != record.content_sha256
    ):
        raise ValueError("threshold retained bytes integrity failure")
    if digest(record.payload_json) != record.content_sha256:
        raise ValueError("threshold payload integrity failure")
    return ThresholdInfo(
        **record.payload_json,
        threshold_id=record.id,
        observed_at=aware(record.observed_at),
        content_sha256=record.content_sha256,
    )


def read_source(session: Session, receipt: WorkbenchAcquisition, root: Path) -> bytes:
    artifact = session.get(WorkbenchArtifact, receipt.artifact_id)
    if artifact is None:
        raise ValueError("finance source lacks retained artifact")
    path = (root / artifact.storage_path).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("finance source locator escapes raw store")
    raw = bounded_read(path, MAX_HTML_BYTES)
    if (
        len(raw) != receipt.bytes
        or len(raw) != artifact.bytes
        or hashlib.sha256(raw).hexdigest() != receipt.content_sha256
        or receipt.content_sha256 != artifact.sha256
    ):
        raise ValueError("finance retained source checksum mismatch")
    return raw


# Owner-approved 2026-10-12: verified crosswalks, or the BRef name-and-team rule
# (services/bref_identity.py). Both must already exist when the page was acquired.
IDENTITY_RULES = "verified+name-team-unique-v1"
ACCEPTED_CONFIDENCE = ("verified", "name_team_unique")


def resolve_identity(
    session: Session,
    row: dict[str, Any],
    observed: datetime,
    roster_ids: frozenset[str] = frozenset(),
) -> tuple[str | None, list[dict[str, Any]]]:
    """An NBA id needs a registry identity or membership in the pinned NBA roster index."""
    if row["nba_id"] is not None:
        nba_id = row["nba_id"]
        evidence = [{"method": "provider_explicit_nba_id", "nba_player_id": nba_id}]
    else:
        mappings = list(
            session.scalars(
                select(WorkbenchIdentityCrosswalk).where(
                    WorkbenchIdentityCrosswalk.source_namespace == row["namespace"],
                    WorkbenchIdentityCrosswalk.source_id == row["entity_id"],
                    WorkbenchIdentityCrosswalk.target_namespace == "nba",
                    WorkbenchIdentityCrosswalk.kind == "player",
                    WorkbenchIdentityCrosswalk.confidence.in_(ACCEPTED_CONFIDENCE),
                    WorkbenchIdentityCrosswalk.updated_at <= observed,
                )
            ).all()
        )
        ids = {m.target_id for m in mappings}
        if len(ids) != 1:
            return None, []
        nba_id = ids.pop()
        evidence = [
            {
                "id": m.id,
                "method": m.mapping_method,
                "confidence": m.confidence,
                "evidence": m.evidence_json,
            }
            for m in sorted(mappings, key=lambda m: m.id)
        ]
    if nba_id in roster_ids:
        return nba_id, evidence
    identity = session.scalar(
        select(WorkbenchIdentity).where(
            WorkbenchIdentity.namespace == "nba",
            WorkbenchIdentity.kind == "player",
            WorkbenchIdentity.external_id == nba_id,
        )
    )
    return (nba_id, evidence) if identity else (None, [])


def cents(value: str | None) -> str | None:
    return str(int(Decimal(value) * 100)) if value is not None else None


def admit_refresh(
    session: Session,
    acquisition_ids: list[str],
    roster_dataset_id: str,
    threshold_id: str | None,
    raw_root: Path,
    staging_root: Path,
) -> FinanceRefresh:
    if not 1 <= len(acquisition_ids) <= 64 or len(set(acquisition_ids)) != len(acquisition_ids):
        raise ValueError("refresh requires 1-64 unique explicit acquisition IDs")
    if session.bind is not None and session.bind.dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(1129074772)"))
    roster = resolve_dataset(session, roster_dataset_id, kind="player_index")
    threshold = session.get(FinanceThreshold, threshold_id) if threshold_id else None
    if threshold_id and (threshold is None or threshold.season != roster.season):
        raise ValueError("threshold season must match the pinned roster")
    input_hash = digest(
        {
            "parser": PARSER_VERSION,
            "identity_rules": IDENTITY_RULES,
            "acquisitions": sorted(acquisition_ids),
            "roster": roster.id,
            "threshold": threshold_id,
        }
    )
    existing = session.scalar(
        select(FinanceRefresh).where(FinanceRefresh.input_sha256 == input_hash)
    )
    if existing:
        return existing
    now = datetime.now(UTC)
    if aware(roster.observed_at) > now:
        raise ValueError("roster observation is in the future")
    if threshold and aware(threshold.observed_at) > now:
        raise ValueError("threshold observation is in the future")
    attempts = []
    normalized: list[dict[str, Any]] = []
    source_bytes: dict[str, bytes] = {}
    sources: dict[str, dict[str, Any]] = {}
    identities: dict[tuple[str, str], dict[str, Any]] = {}
    identity_cache: dict[
        tuple[str, str, str | None, datetime], tuple[str | None, list[dict[str, Any]]]
    ] = {}
    receipts = []
    roster_ids = frozenset(
        p["player_id"] for p in dataset_rows(session, roster) if p.get("player_id")
    )
    for acquisition_id in sorted(acquisition_ids):
        receipt = session.get(WorkbenchAcquisition, acquisition_id)
        if (
            receipt is None
            or receipt.resource != "finance"
            or receipt.finished_at is None
            or receipt.metadata_json.get("season") != roster.season
            or receipt.source_name not in SOURCE_KINDS
            or receipt.status not in {"success", "failed"}
        ):
            raise ValueError("acquisition does not belong to this completed finance scope")
        source_url(receipt.source_name, receipt.source_url, roster.season)
        observed = aware(receipt.finished_at)
        if observed > now:
            raise ValueError("future finance acquisition time")
        receipts.append(receipt)
        attempts.append(
            {
                "acquisition_id": receipt.id,
                "source": receipt.source_name,
                "source_url": receipt.source_url,
                "status": receipt.status,
                "http_status": receipt.http_status,
                "reason": receipt.error_summary,
                "observed_at": observed.isoformat(),
            }
        )
        if receipt.status != "success":
            continue
        raw = read_source(session, receipt, raw_root)
        parsed = (
            parse_bref(raw, roster.season, receipt.source_url)
            if receipt.source_name == "bref_contracts"
            else parse_spotrac(
                raw,
                roster.season,
                receipt.source_url,
                free_agents=receipt.source_name == "spotrac_free_agents",
            )
        )
        sha = hashlib.sha256(raw).hexdigest()
        source_bytes[sha] = raw
        sources[sha] = {
            "sha256": sha,
            "url": receipt.source_url,
            "observed_at": observed,
            "attribution": "Basketball-Reference.com"
            if receipt.source_name == "bref_contracts"
            else "Spotrac",
            "use_basis": f"{POLICY_VERSION}; non-commercial; derived views only",
        }
        for row in parsed:
            identity_key = (row["namespace"], row["entity_id"], row["nba_id"], observed)
            if identity_key not in identity_cache:
                identity_cache[identity_key] = resolve_identity(session, row, observed, roster_ids)
            nba_id, evidence = identity_cache[identity_key]
            if nba_id:
                identities[(row["namespace"], row["entity_id"])] = {
                    "nba_player_id": nba_id,
                    "evidence": evidence,
                }
            normalized.append(
                {
                    **row,
                    "nba_id": nba_id,
                    "source": receipt.source_name,
                    "source_url": receipt.source_url,
                    "source_sha256": sha,
                }
            )
    if len(normalized) > 10_000:
        raise ValueError("finance normalized rows exceed bound")
    fa = []
    for row in normalized:
        if row["kind"] == "free_agent":
            fa.append(
                {
                    "player_id": row["nba_id"],
                    "identity_reason": None
                    if row["nba_id"]
                    else "No unambiguous accepted NBA crosswalk at acquisition.",
                    "provider_id": row["entity_id"],
                    "name": row["name"],
                    "class_year": int(roster.season[:4]),
                    "free_agent_type": row["free_agent_type"],
                    "previous_team_id": row["previous_team_id"],
                    "new_team_id": row["new_team_id"],
                    "status": row["status"],
                    "status_label": row["status_label"],
                    "average_value_cents": cents(row["average_value"]),
                    "total_value_cents": cents(row["total_value"]),
                    "observed_at": now.isoformat(),
                    "source_url": row["source_url"],
                    "source_sha256": row["source_sha256"],
                    "source_locator": row["locator"],
                }
            )
    # BRef owns base salary when both providers report it. Cap hit, cash, hold and
    # dead money remain independent. Reject same-provider overlapping grains.
    selected: dict[tuple[Any, ...], dict[str, Any]] = {}
    for row in sorted(
        normalized, key=lambda r: (r["source"] != "bref_contracts", r["source_url"], r["locator"])
    ):
        if row["nba_id"] is None or row["kind"] == "free_agent":
            continue
        key = (row["nba_id"], row["team_id"], row["season"], row["kind"], row.get("amount_kind"))
        old = selected.get(key)
        if old:
            if (
                old["source"] == "bref_contracts"
                and row["source"] == "spotrac_cap"
                and row.get("amount_kind") == "base_salary"
            ):
                continue
            raise ValueError("unreviewed overlapping financial grain")
        selected[key] = row
    book = None
    if selected:
        mapping_bytes = json.dumps(
            {
                "method": (
                    "frozen crosswalks known at acquisition: verified, or exact normalized "
                    "name plus same current team, unique on both sides (name_team_unique)"
                ),
                "mappings": [
                    dict(namespace=ns, entity_id=entity, **data)
                    for (ns, entity), data in sorted(identities.items())
                ],
            },
            sort_keys=True,
        ).encode()
        mapping_sha = hashlib.sha256(mapping_bytes).hexdigest()
        source_bytes[mapping_sha] = mapping_bytes
        sources[mapping_sha] = {
            "sha256": mapping_sha,
            "url": "https://github.com/calebhabesh/courtlens",
            "observed_at": now,
            "attribution": "CourtLens verified identity registry",
            "use_basis": "Internal mapping note, not a publisher page capture",
        }
        rows = tuple(
            FinanceRow(
                row_id=f"pc06-{index}",
                kind=row["kind"],
                source_namespace=row["namespace"],
                source_entity_id=row["entity_id"],
                nba_player_id=row["nba_id"],
                contract_id=f"reported:{row['nba_id']}:{row['team_id']}",
                financial_season=row["season"],
                team_id=row["team_id"],
                observed_at=now,
                source_sha256=row["source_sha256"],
                source_locator=row["locator"],
                original_label=row["label"],
                **(
                    {"amount_kind": row["amount_kind"], "currency": "USD", "value": row["value"]}
                    if row["kind"] == "amount"
                    else {"option": row["option"], "option_state": row["option_state"]}
                ),
            )
            for index, row in enumerate(selected.values())
        )
        csv = export_csv(rows)
        manifest = FinanceManifest(
            csv_sha256=hashlib.sha256(csv).hexdigest(),
            sources=tuple(sources.values()),
            mappings=tuple(
                {
                    "source_namespace": ns,
                    "source_entity_id": entity,
                    "nba_player_id": data["nba_player_id"],
                    "evidence_sha256": mapping_sha,
                    "method": "name_team_crosswalk"
                    if any(e.get("confidence") == "name_team_unique" for e in data["evidence"])
                    else "reviewed_crosswalk",
                }
                for (ns, entity), data in sorted(identities.items())
            ),
            coverage_note=(
                "PC06 dated provider reports; effective dates unknown; contract IDs are "
                "report scopes. Roster coverage is pinned separately, not inferred from this book."
            ),
        )
        target = staging_root / "finance-refresh" / input_hash
        (target / "sources").mkdir(parents=True, exist_ok=True)
        files = {
            target / "observations.csv": csv,
            target / "manifest.json": manifest.model_dump_json().encode(),
            **{target / "sources" / sha: raw for sha, raw in source_bytes.items()},
        }
        for path, raw in files.items():
            try:
                with path.open("xb") as stream:
                    stream.write(raw)
            except FileExistsError:
                # A rejected candidate can be retried only from unchanged bytes.
                if path.read_bytes() != raw:
                    raise ValueError(
                        "staged finance candidate differs; use a fresh acquisition"
                    ) from None
        book = admit_bundle(session, target)
    coverage = []
    salaries = [
        r
        for r in selected.values()
        if r["kind"] == "amount"
        and r["amount_kind"] == "base_salary"
        and r["season"] == roster.season
    ]
    for player in dataset_rows(session, roster):
        if player["roster_status"] != "active":
            continue
        matching = [
            r
            for r in salaries
            if r["nba_id"] == player["player_id"] and r["team_id"] == player["team_id"]
        ]
        salary_row = matching[0] if len(matching) == 1 else None
        value = cents(salary_row["value"]) if salary_row else None
        team_ok = any(
            a["status"] == "success"
            and a["source"] in {"bref_contracts", "spotrac_cap"}
            and any(
                r["team_id"] == player["team_id"] and r["source_url"] == a["source_url"]
                for r in normalized
            )
            for a in attempts
        )
        reason = (
            None
            if value is not None
            else (
                "salary_blank_in_source"
                if salary_row
                else "salary_missing_in_source"
                if any(
                    r["nba_id"] == player["player_id"] and r["team_id"] == player["team_id"]
                    for r in normalized
                )
                else "salary_missing_or_identity_unresolved"
                if team_ok
                else "team_salary_source_unavailable"
            )
        )
        option = next(
            (
                r["option"]
                for r in selected.values()
                if r["nba_id"] == player["player_id"]
                and r["team_id"] == player["team_id"]
                and r["kind"] == "option"
                and r["season"] == roster.season
            ),
            None,
        )
        coverage.append(
            {
                "player_id": player["player_id"],
                "name": player["name"],
                "team_id": player["team_id"],
                "salary_cents": value,
                "unknown_reason": reason,
                "source": salary_row["source"] if salary_row else None,
                "source_url": salary_row["source_url"] if salary_row else None,
                "source_sha256": salary_row["source_sha256"] if salary_row else None,
                "source_locator": salary_row["locator"] if salary_row else None,
                "option": option,
            }
        )
    known = sum(c["salary_cents"] is not None for c in coverage)
    payload = {
        "expected_players": len(coverage),
        "salary_observed_players": known,
        "unknown_players": len(coverage) - known,
        "coverage": sorted(coverage, key=lambda c: c["player_id"]),
        "free_agents": sorted(fa, key=lambda r: r["provider_id"]),
        "attempts": attempts,
        "unresolved_source_rows": sum(r["nba_id"] is None for r in normalized),
        # Free Agency was cut (owner decision 2026-10-12: no admitted free FA source), so
        # free-agent observations no longer gate this state; refreshes before keep theirs.
        "state": "partial" if known and threshold else "verification_blocked",
        "limitations": [
            "Dated salary reports; no realized cash or complete legal cap accounting claim.",
            "Unknown effective dates remain null and excluded from finance-query-v1 subtotals.",
            "Option markers do not establish exercise or guarantee state.",
            "Roster membership is independent of the provider contract association.",
            "Provider identities without an accepted crosswalk (verified, or unique exact "
            "name plus current team) remain unresolved; names alone never resolve identity.",
            "Missing free-agent observations do not imply signed or unsigned status.",
        ],
    }
    content_hash = digest(
        {
            "parser": PARSER_VERSION,
            "roster": roster.content_sha256,
            "threshold": threshold.content_sha256 if threshold else None,
            "book": book.content_sha256 if book else None,
            "payload": payload,
        }
    )
    transaction = (
        str(session.scalar(text("SELECT txid_current()")))
        if session.bind is not None and session.bind.dialect.name == "postgresql"
        else "sqlite"
    )
    refresh = FinanceRefresh(
        input_sha256=input_hash,
        content_sha256=content_hash,
        season=roster.season,
        roster_dataset_id=roster.id,
        threshold_id=threshold_id,
        book_id=book.id if book else None,
        observed_at=now,
        parser_version=PARSER_VERSION,
        admission_transaction=transaction,
        payload_json=payload,
    )
    session.add(refresh)
    session.flush()
    session.add_all(
        FinanceRefreshSource(refresh_id=refresh.id, acquisition_id=r.id) for r in receipts
    )
    session.flush()
    return refresh


def refresh_info(
    session: Session, refresh_id: str, known_at: datetime | None = None
) -> RefreshInfo:
    if known_at is not None and (known_at.tzinfo is None or known_at.utcoffset() is None):
        raise HTTPException(422, "knownAt must include a timezone")
    record = session.get(FinanceRefresh, refresh_id)
    if record is None:
        raise HTTPException(404, "finance refresh not found")
    if known_at is not None and aware(record.observed_at) > known_at:
        raise HTTPException(422, "finance refresh was observed after knownAt")
    return RefreshInfo(
        refresh_id=record.id,
        season=record.season,
        roster_dataset_id=record.roster_dataset_id,
        threshold_id=record.threshold_id,
        book_id=record.book_id,
        observed_at=aware(record.observed_at),
        content_sha256=record.content_sha256,
        parser_version=record.parser_version,
        **record.payload_json,
    )


def verify_refresh(session: Session, refresh_id: str, root: Path) -> dict[str, Any]:
    info = refresh_info(session, refresh_id)
    record = session.get(FinanceRefresh, refresh_id)
    assert record is not None
    roster = resolve_dataset(session, record.roster_dataset_id, kind="player_index")
    threshold = session.get(FinanceThreshold, record.threshold_id) if record.threshold_id else None
    if threshold:
        threshold_info(threshold)
    book = session.get(FinanceRelease, record.book_id) if record.book_id else None
    if (
        digest(
            {
                "parser": record.parser_version,
                "roster": roster.content_sha256,
                "threshold": threshold.content_sha256 if threshold else None,
                "book": book.content_sha256 if book else None,
                "payload": record.payload_json,
            }
        )
        != record.content_sha256
    ):
        raise ValueError("finance refresh content integrity failure")
    acquisitions = list(
        session.scalars(
            select(WorkbenchAcquisition)
            .join(
                FinanceRefreshSource, FinanceRefreshSource.acquisition_id == WorkbenchAcquisition.id
            )
            .where(FinanceRefreshSource.refresh_id == refresh_id)
        ).all()
    )
    if {a.id for a in acquisitions} != {a.acquisition_id for a in info.attempts}:
        raise ValueError("finance acquisition membership integrity failure")
    for receipt in acquisitions:
        if receipt.status == "success":
            read_source(session, receipt, root)
        robots_sha = receipt.metadata_json.get("robots_sha256")
        if robots_sha:
            artifact = session.scalar(
                select(WorkbenchArtifact).where(
                    WorkbenchArtifact.sha256 == robots_sha,
                    WorkbenchArtifact.resource == "finance_robots",
                )
            )
            if artifact is None:
                raise ValueError("missing retained finance robots evidence")
            path = (root / artifact.storage_path).resolve()
            if not path.is_relative_to(root.resolve()):
                raise ValueError("robots evidence locator escapes raw store")
            raw = bounded_read(path)
            if len(raw) != artifact.bytes or hashlib.sha256(raw).hexdigest() != robots_sha:
                raise ValueError("finance robots evidence checksum mismatch")
    if (
        info.expected_players != info.salary_observed_players + info.unknown_players
        or len(info.coverage) != info.expected_players
    ):
        raise ValueError("finance coverage reconciliation failure")
    if any((r.salary_cents is None) != (r.unknown_reason is not None) for r in info.coverage):
        raise ValueError("salary unknown reason integrity failure")
    return {
        "refresh_id": info.refresh_id,
        "status": "verified",
        "state": info.state,
        "book": verify_release(session, info.book_id) if info.book_id else None,
        "acquisitions": len(acquisitions),
        "expected_players": info.expected_players,
        "salary_observed_players": info.salary_observed_players,
    }
