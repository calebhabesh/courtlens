"""Bounded manual preview and atomic append-only finance admission."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from courtload.domain.finance import (
    MAX_BYTES,
    MAX_ROWS,
    PARSER_VERSION,
    FinanceManifest,
    FinanceRow,
    parse_csv,
)
from courtload.domain.teams import NBA_TEAMS
from courtload.finance_models import (
    FinanceMember,
    FinanceObservation,
    FinanceRelease,
    FinanceSource,
)
from courtload.models import new_uuid
from courtload.workbench_models import WorkbenchIdentity


def digest(value: Any) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def bounded_read(path: Path, limit: int = MAX_BYTES) -> bytes:
    with path.open("rb") as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit:
        raise ValueError("input exceeds byte bound")
    return raw


def load_bundle(root: Path) -> tuple[bytes, FinanceManifest, dict[str, bytes]]:
    manifest = FinanceManifest.model_validate_json(bounded_read(root / "manifest.json"))
    evidence = {}
    for source in manifest.sources:
        raw = bounded_read(root / "sources" / source.sha256)
        if hashlib.sha256(raw).hexdigest() != source.sha256:
            raise ValueError("source evidence hash mismatch")
        evidence[source.sha256] = raw
        if sum(map(len, evidence.values())) > 20_000_000:
            raise ValueError("bundle source bytes exceed bound")
    if sum(map(len, evidence.values())) > 20_000_000:
        raise ValueError("bundle source bytes exceed bound")
    return bounded_read(root / "observations.csv"), manifest, evidence


def preview_bundle(session: Session, root: Path) -> dict[str, Any]:
    raw, manifest, evidence = load_bundle(root)
    rows = parse_csv(raw, manifest)
    identities = _identities(session, rows)
    resolved, _ = _resolve(session, rows, manifest)
    return {
        "parser_version": PARSER_VERSION,
        "csv_sha256": manifest.csv_sha256,
        "rows": len(rows),
        "resolved_rows": len(resolved),
        "players": len(identities),
        "source_bytes": sum(map(len, evidence.values())),
        "known_amount_rows": sum(r.kind == "amount" and r.cents is not None for r in resolved),
        "unknown_amount_rows": sum(r.kind == "amount" and r.cents is None for r in resolved),
        "corrections": sum(r.supersedes_id is not None for r in rows),
        "coverage_note": manifest.coverage_note,
        "warnings": [
            "bounded source book; no complete payroll or current free-agent coverage claim"
        ],
    }


def _identities(session: Session, rows: tuple[FinanceRow, ...]) -> dict[str, str]:
    identities = {}
    for row in rows:
        identity = session.scalar(
            select(WorkbenchIdentity).where(
                WorkbenchIdentity.namespace == "nba",
                WorkbenchIdentity.kind == "player",
                WorkbenchIdentity.external_id == row.nba_player_id,
            )
        )
        if identity is None:
            raise ValueError(f"unknown canonical NBA identity {row.nba_player_id}")
        if row.team_id is not None and row.team_id not in NBA_TEAMS:
            raise ValueError("team association must use canonical NBA team ID")
        identities[row.nba_player_id] = identity.id
    return identities


def release_rows(session: Session, release_id: str) -> list[tuple[FinanceObservation, FinanceRow]]:
    if session.get(FinanceRelease, release_id) is None:
        raise ValueError("finance release not found")
    return [
        (observation, FinanceRow.model_validate(observation.payload_json))
        for observation in session.scalars(
            select(FinanceObservation)
            .join(FinanceMember, FinanceMember.observation_id == FinanceObservation.id)
            .where(FinanceMember.release_id == release_id)
            .order_by(FinanceObservation.id)
        )
    ]


def _resolve(
    session: Session, rows: tuple[FinanceRow, ...], manifest: FinanceManifest
) -> tuple[tuple[FinanceRow, ...], dict[tuple[str | None, ...], FinanceObservation]]:
    parent = release_rows(session, manifest.parent_release_id) if manifest.parent_release_id else []
    selected = {row.grain: row for _, row in parent}
    retained = {row.grain: observation for observation, row in parent}
    for row in rows:
        old = retained.get(row.grain)
        if old is not None:
            if row.supersedes_id != old.id:
                raise ValueError(
                    "conflicting source grain requires explicit correction of selected parent"
                )
            old_row = selected[row.grain]
            if row.observed_at < old_row.observed_at:
                raise ValueError("correction cannot precede original observation")
            del retained[row.grain]
        elif row.supersedes_id is not None:
            raise ValueError(
                "correction target is not selected in parent or changes semantic grain"
            )
        selected[row.grain] = row
    if len(selected) > MAX_ROWS:
        raise ValueError("resolved book exceeds row bound")
    return tuple(selected.values()), retained


def admit_bundle(session: Session, root: Path) -> FinanceRelease:
    """Caller owns commit; partial errors must roll back. Raw bytes stay in DB backups."""
    raw, manifest, evidence = load_bundle(root)
    rows = parse_csv(raw, manifest)
    identities = _identities(session, rows)
    resolved, retained = _resolve(session, rows, manifest)
    manifest_json = manifest.model_dump(mode="json")
    content_hash = digest({"parser": PARSER_VERSION, "manifest": manifest_json})
    existing = session.scalar(
        select(FinanceRelease).where(FinanceRelease.content_sha256 == content_hash)
    )
    if existing is not None:
        return existing
    transaction = (
        str(session.scalar(text("SELECT txid_current()")))
        if session.bind is not None and session.bind.dialect.name == "postgresql"
        else "sqlite"
    )
    release = FinanceRelease(
        id=new_uuid(),
        content_sha256=content_hash,
        parent_release_id=manifest.parent_release_id,
        manifest_json=manifest_json,
        csv_bytes=raw,
        admission_transaction=transaction,
    )
    session.add(release)
    session.flush()
    for source in manifest.sources:
        session.add(
            FinanceSource(
                release_id=release.id,
                sha256=source.sha256,
                evidence_bytes=evidence[source.sha256],
                metadata_json=source.model_dump(mode="json"),
            )
        )
    members = dict(retained)
    for row in rows:
        payload = row.model_dump(mode="json")
        observation = FinanceObservation(
            id=new_uuid(),
            release_id=release.id,
            content_sha256=digest(payload),
            player_identity_id=identities[row.nba_player_id],
            kind=row.kind,
            amount_cents=row.cents,
            supersedes_id=row.supersedes_id,
            correction_reason=row.correction_reason,
            payload_json=payload,
        )
        session.add(observation)
        members[row.grain] = observation
    session.flush()
    for row in resolved:
        session.add(
            FinanceMember(
                release_id=release.id,
                observation_id=members[row.grain].id,
                grain_sha256=digest(row.grain),
            )
        )
    session.flush()
    return release


def stage_bundle(root: Path, artifacts_root: Path) -> str:
    """Copy verified bounded bytes to a content-addressed worker path, never arbitrary paths."""
    raw, manifest, evidence = load_bundle(root)
    parse_csv(raw, manifest)
    manifest_bytes = json.dumps(manifest.model_dump(mode="json"), sort_keys=True).encode()
    key = hashlib.sha256(manifest_bytes).hexdigest()
    target = artifacts_root / "finance-import" / key
    target.mkdir(parents=True, exist_ok=True)
    (target / "sources").mkdir(exist_ok=True)
    files = {target / "observations.csv": raw, target / "manifest.json": manifest_bytes}
    files.update({target / "sources" / sha: data for sha, data in evidence.items()})
    for path, data in files.items():
        try:
            with path.open("xb") as stream:
                stream.write(data)
        except FileExistsError:
            if bounded_read(path) != data:
                raise ValueError("staged bundle bytes differ") from None
    return key


def verify_release(session: Session, release_id: str) -> dict[str, Any]:
    """Reconcile database bytes and selected rows for backup/restore or operator checks."""
    release = session.get(FinanceRelease, release_id)
    if release is None:
        raise ValueError("finance release not found")
    manifest = FinanceManifest.model_validate(release.manifest_json)
    if (
        digest({"parser": PARSER_VERSION, "manifest": manifest.model_dump(mode="json")})
        != release.content_sha256
    ):
        raise ValueError("finance manifest integrity failure")
    rows = parse_csv(release.csv_bytes, manifest)
    sources = list(
        session.scalars(select(FinanceSource).where(FinanceSource.release_id == release_id))
    )
    if {s.sha256 for s in sources} != {s.sha256 for s in manifest.sources}:
        raise ValueError("finance source membership integrity failure")
    for source in sources:
        if hashlib.sha256(source.evidence_bytes).hexdigest() != source.sha256:
            raise ValueError("finance source bytes integrity failure")
    resolved, _ = _resolve(session, rows, manifest)
    expected = {row.grain: row.model_dump(mode="json") for row in resolved}
    selected = release_rows(session, release_id)
    if {row.grain: row.model_dump(mode="json") for _, row in selected} != expected:
        raise ValueError("finance resolved membership integrity failure")
    for observation, row in selected:
        if (
            observation.content_sha256 != digest(row.model_dump(mode="json"))
            or observation.amount_cents != row.cents
        ):
            raise ValueError("finance observation integrity failure")
    return {
        "release_id": release_id,
        "content_sha256": release.content_sha256,
        "selected_rows": len(selected),
        "source_bytes_verified": sum(len(s.evidence_bytes) for s in sources),
        "status": "verified",
    }
