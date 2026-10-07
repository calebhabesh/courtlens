"""Identity crosswalk and dated metadata service for multi-provider entity resolution."""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from courtlens.models import new_uuid
from courtlens.workbench_models import (
    WorkbenchDatedMetadata,
    WorkbenchIdentityCrosswalk,
    allow_admin_mutation,
)

logger = logging.getLogger(__name__)

# Canonical seed mappings for verified flagship entities
FLAGSHIP_PLAYER_CROSSWALKS = [
    # Bam Adebayo
    {
        "target_id": "1628389",
        "source_namespace": "espn",
        "source_id": "4066261",
        "name": "Bam Adebayo",
    },
    {
        "target_id": "1628389",
        "source_namespace": "bref",
        "source_id": "adebaba01",
        "name": "Bam Adebayo",
    },
    {
        "target_id": "1628389",
        "source_namespace": "spotrac",
        "source_id": "23610",
        "name": "Bam Adebayo",
    },
    # Scottie Barnes
    {
        "target_id": "1630567",
        "source_namespace": "espn",
        "source_id": "4433134",
        "name": "Scottie Barnes",
    },
    {
        "target_id": "1630567",
        "source_namespace": "bref",
        "source_id": "barnesc01",
        "name": "Scottie Barnes",
    },
    {
        "target_id": "1630567",
        "source_namespace": "spotrac",
        "source_id": "74187",
        "name": "Scottie Barnes",
    },
    # Pascal Siakam
    {
        "target_id": "1627783",
        "source_namespace": "espn",
        "source_id": "3149673",
        "name": "Pascal Siakam",
    },
    {
        "target_id": "1627783",
        "source_namespace": "bref",
        "source_id": "siakapa01",
        "name": "Pascal Siakam",
    },
    {
        "target_id": "1627783",
        "source_namespace": "spotrac",
        "source_id": "20233",
        "name": "Pascal Siakam",
    },
    # Kobi Simmons
    {
        "target_id": "1628424",
        "source_namespace": "espn",
        "source_id": "4065660",
        "name": "Kobi Simmons",
    },
    {
        "target_id": "1628424",
        "source_namespace": "bref",
        "source_id": "simmoko01",
        "name": "Kobi Simmons",
    },
    {
        "target_id": "1628424",
        "source_namespace": "spotrac",
        "source_id": "23963",
        "name": "Kobi Simmons",
    },
]

FLAGSHIP_TEAM_CROSSWALKS = [
    {"target_id": "TOR", "source_namespace": "espn", "source_id": "28", "name": "Toronto Raptors"},
    {"target_id": "MIA", "source_namespace": "espn", "source_id": "14", "name": "Miami Heat"},
    {"target_id": "IND", "source_namespace": "espn", "source_id": "11", "name": "Indiana Pacers"},
    {"target_id": "BOS", "source_namespace": "espn", "source_id": "2", "name": "Boston Celtics"},
    {"target_id": "NYK", "source_namespace": "espn", "source_id": "18", "name": "New York Knicks"},
    {
        "target_id": "LAL",
        "source_namespace": "espn",
        "source_id": "13",
        "name": "Los Angeles Lakers",
    },
    {
        "target_id": "GSW",
        "source_namespace": "espn",
        "source_id": "9",
        "name": "Golden State Warriors",
    },
]


def register_crosswalk(
    session: Session,
    source_namespace: str,
    source_id: str,
    target_id: str,
    target_namespace: str = "nba",
    kind: str = "player",
    confidence: str = "verified",
    mapping_method: str = "exact_match",
    evidence: dict[str, Any] | None = None,
) -> WorkbenchIdentityCrosswalk:
    """Register or update an entity crosswalk mapping between namespaces."""
    now = datetime.now(UTC)
    stmt = (
        pg_insert(WorkbenchIdentityCrosswalk)
        .values(
            id=new_uuid(),
            source_namespace=source_namespace,
            source_id=str(source_id),
            target_namespace=target_namespace,
            target_id=str(target_id),
            kind=kind,
            confidence=confidence,
            mapping_method=mapping_method,
            evidence_json=evidence or {},
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_update(
            constraint="uq_wb_crosswalk_src_tgt",
            set_={
                "confidence": confidence,
                "mapping_method": mapping_method,
                "evidence_json": evidence or {},
                "updated_at": now,
            },
        )
        .returning(WorkbenchIdentityCrosswalk)
    )
    with allow_admin_mutation(session):
        res = session.execute(stmt).scalar_one()
        session.commit()
    return res


def ensure_crosswalks_seeded(session: Session) -> None:
    """Ensure flagship crosswalk records are seeded if table is empty."""
    try:
        from sqlalchemy import func

        count = session.scalar(select(func.count()).select_from(WorkbenchIdentityCrosswalk)) or 0
        if count == 0:
            seed_flagship_crosswalks(session)
    except Exception as exc:
        logger.debug("Skipping crosswalks auto-seed check: %s", exc)


def resolve_crosswalk(
    session: Session,
    source_namespace: str,
    source_id: str,
    target_namespace: str = "nba",
    kind: str = "player",
) -> WorkbenchIdentityCrosswalk | None:
    """Resolve an external identity to its canonical target identity."""
    ensure_crosswalks_seeded(session)
    return session.scalar(
        select(WorkbenchIdentityCrosswalk).where(
            WorkbenchIdentityCrosswalk.source_namespace == source_namespace,
            WorkbenchIdentityCrosswalk.source_id == str(source_id),
            WorkbenchIdentityCrosswalk.target_namespace == target_namespace,
            WorkbenchIdentityCrosswalk.kind == kind,
        )
    )


def list_crosswalks_service(
    session: Session,
    source_namespace: str | None = None,
    target_id: str | None = None,
    kind: str | None = None,
    limit: int = 50,
) -> list[WorkbenchIdentityCrosswalk]:
    """List crosswalk mappings with optional namespace/target filters."""
    ensure_crosswalks_seeded(session)
    query = select(WorkbenchIdentityCrosswalk).order_by(
        WorkbenchIdentityCrosswalk.target_id.asc(),
        WorkbenchIdentityCrosswalk.source_namespace.asc(),
    )
    if source_namespace:
        query = query.where(WorkbenchIdentityCrosswalk.source_namespace == source_namespace)
    if target_id:
        query = query.where(WorkbenchIdentityCrosswalk.target_id == target_id)
    if kind:
        query = query.where(WorkbenchIdentityCrosswalk.kind == kind)
    return list(session.scalars(query.limit(limit)).all())


def record_dated_metadata(
    session: Session,
    identity_id: str,
    category: str,
    data: dict[str, Any],
    namespace: str = "nba",
    kind: str = "player",
    effective_season: str | None = None,
    effective_date: date | None = None,
    source_name: str = "sportsdataverse",
    observed_at: datetime | None = None,
) -> WorkbenchDatedMetadata:
    """Record a dated metadata observation with strict temporal evidence boundaries."""
    now = observed_at or datetime.now(UTC)
    entry = WorkbenchDatedMetadata(
        id=new_uuid(),
        identity_id=identity_id,
        namespace=namespace,
        kind=kind,
        category=category,
        effective_season=effective_season,
        effective_date=effective_date,
        observed_at=now,
        source_name=source_name,
        data_json=data,
        created_at=now,
    )
    with allow_admin_mutation(session):
        session.add(entry)
        session.commit()
    return entry


def get_dated_metadata(
    session: Session,
    identity_id: str,
    category: str | None = None,
    as_of_date: date | None = None,
) -> list[WorkbenchDatedMetadata]:
    """Retrieve dated metadata observations prior to or at as_of_date."""
    query = select(WorkbenchDatedMetadata).where(WorkbenchDatedMetadata.identity_id == identity_id)
    if category:
        query = query.where(WorkbenchDatedMetadata.category == category)
    if as_of_date:
        query = query.where(
            (WorkbenchDatedMetadata.effective_date.is_(None))
            | (WorkbenchDatedMetadata.effective_date <= as_of_date)
        )
    query = query.order_by(
        WorkbenchDatedMetadata.effective_date.asc().nulls_first(),
        WorkbenchDatedMetadata.observed_at.asc(),
    )
    return list(session.scalars(query).all())


def seed_flagship_crosswalks(session: Session) -> dict[str, int]:
    """Seed known flagship crosswalks between NBA and ESPN, BRef, Spotrac."""
    player_count = 0
    team_count = 0

    for item in FLAGSHIP_PLAYER_CROSSWALKS:
        register_crosswalk(
            session,
            source_namespace=item["source_namespace"],
            source_id=item["source_id"],
            target_id=item["target_id"],
            kind="player",
            confidence="verified",
            mapping_method="verified_manual_crosswalk",
            evidence={"display_name": item["name"], "verified_date": "2026-10-02"},
        )
        player_count += 1

    for item in FLAGSHIP_TEAM_CROSSWALKS:
        register_crosswalk(
            session,
            source_namespace=item["source_namespace"],
            source_id=item["source_id"],
            target_id=item["target_id"],
            kind="team",
            confidence="verified",
            mapping_method="verified_manual_crosswalk",
            evidence={"display_name": item["name"], "verified_date": "2026-10-02"},
        )
        team_count += 1

    return {"players_seeded": player_count, "teams_seeded": team_count}
