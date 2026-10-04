"""Unit tests for identity crosswalk and dated metadata service."""

from datetime import date

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from courtload.database import Base
from courtload.services.identity_crosswalk import (
    get_dated_metadata,
    list_crosswalks_service,
    record_dated_metadata,
    register_crosswalk,
    resolve_crosswalk,
    seed_flagship_crosswalks,
)


@pytest.fixture
def memory_session() -> Session:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as session:
            yield session
    finally:
        engine.dispose()


def test_crosswalk_registration_and_resolution(memory_session: Session) -> None:
    # 1. Register ESPN mapping for Scottie Barnes
    cw = register_crosswalk(
        memory_session,
        source_namespace="espn",
        source_id="4433134",
        target_id="1630567",
        kind="player",
        confidence="verified",
        evidence={"note": "official draft record"},
    )
    assert cw.source_id == "4433134"
    assert cw.target_id == "1630567"
    assert cw.source_namespace == "espn"

    # 2. Resolve crosswalk
    resolved = resolve_crosswalk(
        memory_session,
        source_namespace="espn",
        source_id="4433134",
    )
    assert resolved is not None
    assert resolved.target_id == "1630567"
    assert resolved.target_namespace == "nba"

    # 3. Nonexistent resolution returns None
    assert resolve_crosswalk(memory_session, source_namespace="espn", source_id="99999999") is None


def test_crosswalk_listing_and_filtering(memory_session: Session) -> None:
    seed_flagship_crosswalks(memory_session)

    # List all
    all_cw = list_crosswalks_service(memory_session, limit=100)
    assert len(all_cw) >= 12  # 4 players x 3 sources + teams

    # Filter by source namespace
    espn_cw = list_crosswalks_service(memory_session, source_namespace="espn")
    assert all(c.source_namespace == "espn" for c in espn_cw)

    # Filter by target ID (Bam Adebayo 1628389)
    bam_cw = list_crosswalks_service(memory_session, target_id="1628389")
    assert len(bam_cw) == 3
    sources = {c.source_namespace for c in bam_cw}
    assert sources == {"espn", "bref", "spotrac"}


def test_dated_metadata_temporal_discipline(memory_session: Session) -> None:
    # Record position changes across dates
    p_id = "1628389"  # Bam Adebayo

    record_dated_metadata(
        memory_session,
        identity_id=p_id,
        category="position",
        data={"position": "C"},
        effective_date=date(2023, 10, 1),
    )
    record_dated_metadata(
        memory_session,
        identity_id=p_id,
        category="position",
        data={"position": "C-F"},
        effective_date=date(2024, 10, 1),
    )
    record_dated_metadata(
        memory_session,
        identity_id=p_id,
        category="position",
        data={"position": "PF"},
        effective_date=date(2025, 10, 1),
    )

    # Query as of 2024-01-01: only 2023-10-01 should be returned
    meta_early = get_dated_metadata(
        memory_session, identity_id=p_id, category="position", as_of_date=date(2024, 1, 1)
    )
    assert len(meta_early) == 1
    assert meta_early[0].data_json["position"] == "C"

    # Query as of 2024-12-01: 2023 and 2024 records returned
    meta_mid = get_dated_metadata(
        memory_session, identity_id=p_id, category="position", as_of_date=date(2024, 12, 1)
    )
    assert len(meta_mid) == 2
    assert [m.data_json["position"] for m in meta_mid] == ["C", "C-F"]

    # Query as of 2026-01-01: all 3 records returned
    meta_all = get_dated_metadata(
        memory_session, identity_id=p_id, category="position", as_of_date=date(2026, 1, 1)
    )
    assert len(meta_all) == 3
