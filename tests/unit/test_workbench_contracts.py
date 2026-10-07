"""Unit tests for workbench data contracts, immutability, and portable equivalence."""

from __future__ import annotations

import datetime
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from courtlens.services.workbench_registry import (
    SnapshotEquivalenceError,
    check_snapshot_equivalence,
    compute_semantic_signature,
    register_retained_m6_experiment,
    verify_and_bind_snapshot_equivalence,
)
from courtlens.workbench_models import (
    WorkbenchAcquisition,
    WorkbenchArtifact,
    WorkbenchDataset,
    WorkbenchDatasetMember,
    WorkbenchIdentity,
    WorkbenchObservation,
    WorkbenchSchedule,
    WorkbenchTeamGame,
    WorkbenchVersion,
    allow_admin_mutation,
)


def _setup_base_entities(
    session: Session,
) -> tuple[WorkbenchAcquisition, WorkbenchArtifact, WorkbenchIdentity]:
    artifact = WorkbenchArtifact(
        sha256="a" * 64,
        resource="player_box_2025",
        bytes=1024,
        storage_path="workbench/raw/test.json",
        mime_type="application/json",
        source_attribution="sportsdataverse",
    )
    session.add(artifact)
    session.flush()

    acquisition = WorkbenchAcquisition(
        source_name="sportsdataverse_nba",
        resource="player_box_2025",
        source_url="https://example.com/data.json",
        status="success",
        http_status=200,
        artifact_id=artifact.id,
    )
    session.add(acquisition)

    identity = WorkbenchIdentity(
        namespace="nba",
        kind="player",
        external_id="203999",
        display_name="Nikola Jokic",
    )
    session.add(identity)
    session.flush()
    return acquisition, artifact, identity


def test_a_b_a_corrections_preserve_observation_order_and_reuse_versions(session: Session) -> None:
    """A->B->A updates preserve all observations and order while reusing version content."""
    acquisition, artifact, identity = _setup_base_entities(session)

    # Observation 1: Version A
    version_a = WorkbenchVersion(
        identity_id=identity.id,
        content_sha256="1" * 64,
        parser_version="wb-v1",
        payload_json={"pts": 25, "reb": 12, "ast": 10},
    )
    session.add(version_a)
    session.flush()

    obs_1 = WorkbenchObservation(
        acquisition_id=acquisition.id,
        artifact_id=artifact.id,
        row_identifier="row_1",
        identity_id=identity.id,
        version_id=version_a.id,
        observation_order=1,
    )
    session.add(obs_1)
    session.flush()

    # Observation 2: Upstream correction -> Version B
    version_b = WorkbenchVersion(
        identity_id=identity.id,
        content_sha256="2" * 64,
        parser_version="wb-v1",
        payload_json={"pts": 27, "reb": 12, "ast": 10},
    )
    session.add(version_b)
    session.flush()

    obs_2 = WorkbenchObservation(
        acquisition_id=acquisition.id,
        artifact_id=artifact.id,
        row_identifier="row_2",
        identity_id=identity.id,
        version_id=version_b.id,
        observation_order=2,
    )
    session.add(obs_2)
    session.flush()

    # Observation 3: Upstream reverts back to Version A
    obs_3 = WorkbenchObservation(
        acquisition_id=acquisition.id,
        artifact_id=artifact.id,
        row_identifier="row_3",
        identity_id=identity.id,
        version_id=version_a.id,  # Reusing version A!
        observation_order=3,
    )
    session.add(obs_3)
    session.flush()

    # Assert: exactly 2 versions in database
    versions = session.scalars(
        select(WorkbenchVersion).where(WorkbenchVersion.identity_id == identity.id)
    ).all()
    assert len(versions) == 2

    # Assert: exactly 3 observations in order
    observations = session.scalars(
        select(WorkbenchObservation)
        .where(WorkbenchObservation.identity_id == identity.id)
        .order_by(WorkbenchObservation.observation_order.asc())
    ).all()
    assert len(observations) == 3
    assert [o.observation_order for o in observations] == [1, 2, 3]
    assert [o.version_id for o in observations] == [version_a.id, version_b.id, version_a.id]

    # Deterministic resolution: latest observation is obs_3 with version A
    latest_obs = session.scalars(
        select(WorkbenchObservation)
        .where(WorkbenchObservation.identity_id == identity.id)
        .order_by(WorkbenchObservation.observation_order.desc())
        .limit(1)
    ).one()
    assert latest_obs.id == obs_3.id
    assert latest_obs.version_id == version_a.id


def test_dataset_membership_uniqueness_and_conflict_rejection(session: Session) -> None:
    """A dataset cannot contain conflicting active versions for the same entity."""
    acquisition, artifact, identity = _setup_base_entities(session)

    version = WorkbenchVersion(
        identity_id=identity.id,
        content_sha256="3" * 64,
        parser_version="wb-v1",
        payload_json={"pts": 30},
    )
    session.add(version)
    session.flush()

    obs = WorkbenchObservation(
        acquisition_id=acquisition.id,
        artifact_id=artifact.id,
        row_identifier="row_1",
        identity_id=identity.id,
        version_id=version.id,
        observation_order=1,
    )
    session.add(obs)

    dataset = WorkbenchDataset(
        content_sha256="c" * 64,
        membership_sha256="m" * 64,
        semantic_signature="s" * 64,
        source_namespace="sportsdataverse_nba",
        parser_version="wb-v1",
        quality_version="qual-v1",
        seasons_json=["2025-26"],
        phases_json=["regular_season"],
        manifest_json={},
        coverage_json={},
        exclusions_json={},
        status="ready",
    )
    session.add(dataset)
    session.flush()

    member_1 = WorkbenchDatasetMember(
        dataset_id=dataset.id,
        identity_id=identity.id,
        version_id=version.id,
        observation_id=obs.id,
    )
    session.add(member_1)
    session.flush()

    # Attempting to add a duplicate member for same entity in dataset violates unique constraint
    member_2 = WorkbenchDatasetMember(
        dataset_id=dataset.id,
        identity_id=identity.id,
        version_id=version.id,
        observation_id=obs.id,
    )
    session.add(member_2)
    with pytest.raises(IntegrityError):
        session.flush()
    session.rollback()


def test_sealed_table_immutability_guard_rejects_mutation(session: Session) -> None:
    """Ordinary application writes cannot update or delete rows in sealed tables."""
    acquisition, artifact, identity = _setup_base_entities(session)
    version = WorkbenchVersion(
        identity_id=identity.id,
        content_sha256="4" * 64,
        parser_version="wb-v1",
        payload_json={},
    )
    session.add(version)
    session.flush()

    obs = WorkbenchObservation(
        acquisition_id=acquisition.id,
        artifact_id=artifact.id,
        row_identifier="row_sealed",
        identity_id=identity.id,
        version_id=version.id,
        observation_order=1,
    )
    session.add(obs)

    dataset = WorkbenchDataset(
        content_sha256="c2" * 32,
        membership_sha256="m2" * 32,
        semantic_signature="s2" * 32,
        source_namespace="sportsdataverse_nba",
        parser_version="wb-v1",
        quality_version="qual-v1",
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

    # Attempting to delete member raises mutation error
    session.delete(member)
    with pytest.raises(RuntimeError, match="sealed and immutable"):
        session.flush()
    session.rollback()

    # With allow_admin_mutation, deletion succeeds
    member_reloaded = session.get(WorkbenchDatasetMember, member_id)
    assert member_reloaded is not None
    with allow_admin_mutation(session):
        session.delete(member_reloaded)
        session.commit()
    assert session.get(WorkbenchDatasetMember, member_id) is None


def test_schedule_version_stored_separately_from_outcomes(session: Session) -> None:
    """Schedule records are stored independently and scheduled status does not imply outcomes."""
    acquisition, artifact, identity = _setup_base_entities(session)
    version = WorkbenchVersion(
        identity_id=identity.id,
        content_sha256="5" * 64,
        parser_version="wb-v1",
        payload_json={"status": 1},
    )
    session.add(version)
    session.flush()

    obs = WorkbenchObservation(
        acquisition_id=acquisition.id,
        artifact_id=artifact.id,
        row_identifier="row_sched",
        identity_id=identity.id,
        version_id=version.id,
        observation_order=1,
    )
    session.add(obs)

    dataset = WorkbenchDataset(
        content_sha256="c3" * 32,
        membership_sha256="m3" * 32,
        semantic_signature="s3" * 32,
        source_namespace="sportsdataverse_nba",
        parser_version="wb-v1",
        quality_version="qual-v1",
        seasons_json=["2026-27"],
        phases_json=["regular_season"],
        manifest_json={},
        coverage_json={},
        exclusions_json={},
        status="ready",
    )
    session.add(dataset)
    session.flush()

    schedule = WorkbenchSchedule(
        dataset_id=dataset.id,
        game_id="0022600001",
        season="2026-27",
        phase="regular_season",
        game_date=datetime.date(2026, 10, 22),
        date_precision="date",
        home_team_id="1610612738",
        away_team_id="1610612752",
        game_status=1,  # Scheduled
        annotations_json={},
        source_version_id=version.id,
        source_observation_id=obs.id,
    )
    session.add(schedule)
    session.flush()

    assert schedule.id is not None
    assert schedule.game_status == 1

    # Team games and player games for this scheduled game are empty
    team_games = session.scalars(
        select(WorkbenchTeamGame).where(WorkbenchTeamGame.game_id == "0022600001")
    ).all()
    assert len(team_games) == 0


def test_semantic_signature_determinism_and_portability() -> None:
    """Semantic signature is stable and invariant to non-semantic identifiers."""
    sig1 = compute_semantic_signature(
        content_sha256="abc" * 21 + "a",
        membership_sha256="def" * 21 + "d",
        metric_version="basketball-v1",
        feature_version="feature-v1",
        scoring_version="reference-v1",
        coverage={"seasons": ["2021-22", "2022-23"]},
        exclusions={"games": []},
    )
    sig2 = compute_semantic_signature(
        content_sha256="abc" * 21 + "a",
        membership_sha256="def" * 21 + "d",
        metric_version="basketball-v1",
        feature_version="feature-v1",
        scoring_version="reference-v1",
        coverage={"seasons": ["2021-22", "2022-23"]},
        exclusions={"games": []},
    )
    assert sig1 == sig2
    assert len(sig1) == 64

    # Changing any semantic field produces a different signature
    sig3 = compute_semantic_signature(
        content_sha256="abc" * 21 + "b",
        membership_sha256="def" * 21 + "d",
        metric_version="basketball-v1",
        feature_version="feature-v1",
        scoring_version="reference-v1",
        coverage={"seasons": ["2021-22", "2022-23"]},
    )
    assert sig3 != sig1


def test_snapshot_equivalence_verification_and_check(session: Session) -> None:
    """Rebuilt snapshot equivalence succeeds with identical facts and rejects deviations."""
    local_id = str(uuid4())
    authoritative_id = "5b14b7ed-353b-499d-a37a-6887b5f6c715"
    content_hash = "be2dae2706f9c90d37fef4c70e523e5925c247a2f091d6b885a65255d0b92c4a"
    obs_hash = "8e9528b5a8fb153934e6b4c7b4ed6034e60ed8bd329b5c9294d422670272e2ee"
    scoring_version = "99ae314454a067a93fe16c4c06076adaeb9a36673b46e160455e4e9b14fc1805"
    semantic_sig = compute_semantic_signature(
        content_sha256=content_hash,
        membership_sha256=obs_hash,
        metric_version="basketball-v1",
        feature_version="feature-v1",
        scoring_version=scoring_version,
        coverage={"seasons": ["2021-22", "2022-23", "2023-24"]},
    )

    # 1. Authoritative snapshot self-equivalence is always True
    assert (
        check_snapshot_equivalence(
            session,
            local_snapshot_id=authoritative_id,
            authoritative_snapshot_id=authoritative_id,
            content_sha256=content_hash,
            observation_sha256=obs_hash,
            scoring_version=scoring_version,
        )
        is True
    )

    # 2. Unregistered rebuilt snapshot is not equivalent
    assert (
        check_snapshot_equivalence(
            session,
            local_snapshot_id=local_id,
            authoritative_snapshot_id=authoritative_id,
            content_sha256=content_hash,
            observation_sha256=obs_hash,
            scoring_version=scoring_version,
        )
        is False
    )

    # 3. Equivalence verification with matching properties binds successfully
    record = verify_and_bind_snapshot_equivalence(
        session,
        local_snapshot_id=local_id,
        authoritative_snapshot_id=authoritative_id,
        expected_content_sha256=content_hash,
        expected_observation_sha256=obs_hash,
        expected_scoring_version=scoring_version,
        actual_content_sha256=content_hash,
        actual_observation_sha256=obs_hash,
        actual_scoring_version=scoring_version,
        semantic_signature=semantic_sig,
        facts_match=True,
        transforms_match=True,
        features_match=True,
        calibration_match=True,
    )
    assert record.status == "verified"

    # Now check_snapshot_equivalence returns True
    assert (
        check_snapshot_equivalence(
            session,
            local_snapshot_id=local_id,
            authoritative_snapshot_id=authoritative_id,
            content_sha256=content_hash,
            observation_sha256=obs_hash,
            scoring_version=scoring_version,
        )
        is True
    )

    # 4. Equivalence with changed facts or transforms fails and is rejected
    invalid_local_id = str(uuid4())
    with pytest.raises(SnapshotEquivalenceError, match="dataset_facts_mismatch"):
        verify_and_bind_snapshot_equivalence(
            session,
            local_snapshot_id=invalid_local_id,
            authoritative_snapshot_id=authoritative_id,
            expected_content_sha256=content_hash,
            expected_observation_sha256=obs_hash,
            expected_scoring_version=scoring_version,
            actual_content_sha256="modified_content" + "0" * 48,
            actual_observation_sha256=obs_hash,
            actual_scoring_version=scoring_version,
            semantic_signature=semantic_sig,
            facts_match=False,
        )

    # Check returns False for rejected invalid snapshot
    assert (
        check_snapshot_equivalence(
            session,
            local_snapshot_id=invalid_local_id,
            authoritative_snapshot_id=authoritative_id,
            content_sha256=content_hash,
            observation_sha256=obs_hash,
            scoring_version=scoring_version,
        )
        is False
    )


@pytest.mark.requires_published_data
def test_retained_m6_experiment_registration(session: Session) -> None:
    """Retained legacy M6 experiment registers and verifies artifacts byte-for-byte."""
    reg = register_retained_m6_experiment(session)
    assert reg["run_id"] == "6f7af9e63f27aada910d"
    assert reg["status"] == "retained_verified"
    assert len(reg["semantic_signature"]) == 64
    expected_replay_hash = "7c635f46abfd8df5e4045dfd2fa24ef993a8fa6e992475f45ef5603ce65bcb2f"
    assert reg["artifacts"]["replay-estimates.jsonl"] == expected_replay_hash
