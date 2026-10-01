"""PostgreSQL integration tests for workbench immutability triggers and portable equivalence."""

from __future__ import annotations

import os
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from courtload.database import Base
from courtload.services.workbench_registry import (
    check_snapshot_equivalence,
    compute_semantic_signature,
    verify_and_bind_snapshot_equivalence,
)
from courtload.workbench_models import (
    WorkbenchAcquisition,
    WorkbenchArtifact,
    WorkbenchDataset,
    WorkbenchDatasetMember,
    WorkbenchIdentity,
    WorkbenchObservation,
    WorkbenchVersion,
)

pytestmark = pytest.mark.postgres


@pytest.fixture
def postgres_engine():  # type: ignore[no-untyped-def]
    url = os.getenv("COURTLOAD_TEST_POSTGRES_URL")
    if not url:
        if os.getenv("CI") or os.getenv("COURTLOAD_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("COURTLOAD_TEST_POSTGRES_URL must be configured")
        pytest.skip("COURTLOAD_TEST_POSTGRES_URL is not configured")
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    try:
        yield engine
    finally:
        engine.dispose()


def test_postgres_sealed_trigger_rejects_raw_sql_mutation(postgres_engine) -> None:  # type: ignore[no-untyped-def]
    """PostgreSQL database triggers reject ordinary SQL UPDATE or DELETE on sealed tables."""
    with Session(postgres_engine) as session:
        uid = uuid4().hex[:12]
        artifact = WorkbenchArtifact(
            sha256="pg_art_" + uid + "0" * 40,
            resource="test_resource",
            bytes=100,
            storage_path="test/path",
            mime_type="application/json",
            source_attribution="test",
        )
        session.add(artifact)
        session.flush()

        acq = WorkbenchAcquisition(
            source_name="test_src",
            resource="test_resource",
            source_url="https://test",
            status="success",
            artifact_id=artifact.id,
        )
        session.add(acq)
        session.flush()

        identity = WorkbenchIdentity(
            namespace="nba",
            kind="player",
            external_id=f"test_player_{uid}",
            display_name="Test Player",
        )
        session.add(identity)
        session.flush()

        version = WorkbenchVersion(
            identity_id=identity.id,
            content_sha256="pg_ver_" + uid + "0" * 40,
            parser_version="v1",
            payload_json={"test": True},
        )
        session.add(version)
        session.flush()

        obs = WorkbenchObservation(
            acquisition_id=acq.id,
            artifact_id=artifact.id,
            row_identifier=f"row_{uid}",
            identity_id=identity.id,
            version_id=version.id,
            observation_order=1,
        )
        session.add(obs)
        session.flush()

        dataset = WorkbenchDataset(
            content_sha256="pg_ds_c_" + uid + "0" * 40,
            membership_sha256="pg_ds_m_" + uid + "0" * 40,
            semantic_signature="pg_ds_s_" + uid + "0" * 40,
            source_namespace="test_ns",
            parser_version="v1",
            quality_version="q1",
            seasons_json=["2025-26"],
            phases_json=["regular_season"],
            manifest_json={},
            coverage_json={},
            exclusions_json={},
            status="ready",
        )
        session.add(dataset)
        session.flush()

        member = WorkbenchDatasetMember(
            dataset_id=dataset.id,
            identity_id=identity.id,
            version_id=version.id,
            observation_id=obs.id,
        )
        session.add(member)
        session.commit()

        member_id = member.id
        version_id = version.id

        # 1. Raw SQL UPDATE must fail from trigger
        with pytest.raises(DBAPIError, match="sealed and immutable"):
            session.execute(
                text("UPDATE workbench_dataset_members SET version_id = :vid WHERE id = :mid"),
                {"vid": version_id, "mid": member_id},
            )
        session.rollback()

        # 2. Raw SQL DELETE must fail from trigger
        with pytest.raises(DBAPIError, match="sealed and immutable"):
            session.execute(
                text("DELETE FROM workbench_dataset_members WHERE id = :mid"),
                {"mid": member_id},
            )
        session.rollback()

        # 3. With admin mutation enabled, DELETE succeeds
        session.execute(text("SET LOCAL courtload.allow_admin_mutation = 'true'"))
        session.execute(
            text("DELETE FROM workbench_dataset_members WHERE id = :mid"),
            {"mid": member_id},
        )
        session.commit()

        # Verify deletion succeeded
        remaining = session.scalar(
            select(WorkbenchDatasetMember).where(WorkbenchDatasetMember.id == member_id)
        )
        assert remaining is None


def test_rebuilt_snapshot_equivalence_on_postgres(postgres_engine) -> None:  # type: ignore[no-untyped-def]
    """Verify snapshot equivalence binding on real PostgreSQL database."""
    with Session(postgres_engine) as session:
        local_id = str(uuid4())
        auth_id = str(uuid4())
        content_hash = "be2dae2706f9c90d37fef4c70e523e5925c247a2f091d6b885a65255d0b92c4a"
        obs_hash = "8e9528b5a8fb153934e6b4c7b4ed6034e60ed8bd329b5c9294d422670272e2ee"
        scoring_ver = "99ae314454a067a93fe16c4c06076adaeb9a36673b46e160455e4e9b14fc1805"
        sig = compute_semantic_signature(
            content_sha256=content_hash,
            membership_sha256=obs_hash,
            metric_version="basketball-v1",
            feature_version="feature-v1",
            scoring_version=scoring_ver,
            coverage={"seasons": ["2021-22"]},
        )

        record = verify_and_bind_snapshot_equivalence(
            session,
            local_snapshot_id=local_id,
            authoritative_snapshot_id=auth_id,
            expected_content_sha256=content_hash,
            expected_observation_sha256=obs_hash,
            expected_scoring_version=scoring_ver,
            actual_content_sha256=content_hash,
            actual_observation_sha256=obs_hash,
            actual_scoring_version=scoring_ver,
            semantic_signature=sig,
            facts_match=True,
            transforms_match=True,
            features_match=True,
            calibration_match=True,
        )
        session.commit()
        assert record.status == "verified"

        assert (
            check_snapshot_equivalence(
                session,
                local_snapshot_id=local_id,
                authoritative_snapshot_id=auth_id,
                content_sha256=content_hash,
                observation_sha256=obs_hash,
                scoring_version=scoring_ver,
            )
            is True
        )
