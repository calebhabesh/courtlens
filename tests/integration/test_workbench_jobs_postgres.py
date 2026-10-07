"""Integration tests for CourtLens background worker, allowlisted jobs, locking, and recovery."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.api.app import create_app
from courtlens.archive_models import ArchiveDataset
from courtlens.database import get_db
from courtlens.models import utc_now
from courtlens.services.publication import (
    DEFAULT_CHANNEL,
    BuildInProgressError,
    publication_lock,
)
from courtlens.services.workbench_ingestion import (
    CandidateValidationError,
    publish_workbench_release,
)
from courtlens.services.workbench_jobs import (
    enqueue_job,
    recover_interrupted_jobs,
    sanitize_error,
)
from courtlens.warehouse_models import PublishedSnapshot, ServingSnapshot, WarehouseBuild
from courtlens.workbench_models import (
    WorkbenchDataset,
    WorkbenchJob,
    allow_admin_mutation,
)

pytestmark = pytest.mark.postgres


@pytest.fixture
def postgres_engine(workbench_db):  # type: ignore[no-untyped-def]
    yield workbench_db.get_bind()


@pytest.fixture
def api_client(workbench_db):  # type: ignore[no-untyped-def]
    app = create_app()
    app.dependency_overrides[get_db] = lambda: workbench_db
    with TestClient(app) as client:
        yield client


def test_publication_lock_exclusivity(postgres_engine) -> None:  # type: ignore[no-untyped-def]
    """Coordinated PostgreSQL publication lock cannot be acquired concurrently."""
    with (
        Session(postgres_engine) as first,
        Session(postgres_engine) as second,
        publication_lock(first),
        pytest.raises(BuildInProgressError),
        publication_lock(second),
    ):
        pass


def test_build_and_publish_unlocked_succeeds_when_caller_holds_lock(postgres_engine) -> None:  # type: ignore[no-untyped-def]
    """Worker holding the publication lock can publish via internal primitive without deadlock."""
    with Session(postgres_engine) as session:
        # Create an accepted dataset and build for testing
        uniqueness = uuid4().hex
        dataset = ArchiveDataset(
            content_sha256=(uniqueness * 2)[:64],
            observation_sha256=(uniqueness[::-1] * 2)[:64],
            source_namespace="fixture:worker",
            parser_version="test-v1",
            manifest_json={},
            status="accepted",
        )
        session.add(dataset)
        session.flush()

        old_build = WarehouseBuild(
            dataset_id=dataset.id,
            status="ready",
            candidate_schema=f"cl_candidate_{dataset.id.replace('-', '')[:16]}",
            code_version="test-worker",
            metric_version="basketball-v1",
            feature_version="historical-prior-day-v1",
            scoring_version="b569d6c70beaf6bc53fd6a634e405a2d6990d0b7d79b29cbca8ce7c65ef49a40",
        )
        from courtlens.services.publication import SCORING_VERSION

        old_build.scoring_version = SCORING_VERSION
        session.add(old_build)
        session.flush()

        snap = ServingSnapshot(
            build_id=old_build.id,
            dataset_id=dataset.id,
            status="ready",
            mode="historical_reconstruction",
            source="fixture:worker",
            coverage_start=datetime.now(UTC).date(),
            coverage_end=datetime.now(UTC).date(),
            default_replay_date=datetime.now(UTC).date(),
            supported_replay_dates_json=[datetime.now(UTC).date().isoformat()],
            code_version="test-worker",
            metric_version="basketball-v1",
            feature_version="historical-prior-day-v1",
            scoring_version=SCORING_VERSION,
            quality_report_json={},
        )
        session.add(snap)
        session.commit()

        # When caller already holds publication_lock, acquire_lock=False succeeds
        channel = f"test_{uniqueness[:16]}"
        with publication_lock(session):
            from courtlens.services.publication import build_and_publish

            published = build_and_publish(
                session,
                dataset.id,
                channel=channel,
                code_version="test-worker",
                acquire_lock=False,
            )
            assert published.id == snap.id

        pointer = session.get(PublishedSnapshot, channel)
        assert pointer is not None
        assert pointer.snapshot_id == snap.id


def test_job_allowlist_and_validation(postgres_engine) -> None:  # type: ignore[no-untyped-def]
    """Only allowlisted jobs can be enqueued; unallowlisted jobs are rejected."""
    with Session(postgres_engine) as session:
        # Invalid job type rejected
        with pytest.raises(ValueError, match="not allowlisted"):
            enqueue_job(session, "unallowlisted_mutation")

        # Allowlisted jobs accepted
        job1 = enqueue_job(session, "bootstrap")
        assert job1.job_type == "bootstrap"
        assert job1.status == "queued"

        job2 = enqueue_job(session, "refresh")
        assert job2.job_type == "refresh"
        assert job2.status == "queued"

        job3 = enqueue_job(session, "portraits")
        assert job3.job_type == "portraits"
        assert job3.status == "queued"


def test_overlapping_refreshes_produce_one_owner(postgres_engine) -> None:  # type: ignore[no-untyped-def]
    """Enqueuing a refresh while one is queued or running coalesces to the existing job."""
    with Session(postgres_engine) as session:
        unique_type = "refresh"
        job1 = enqueue_job(session, unique_type)
        job2 = enqueue_job(session, unique_type)

        assert job1.id == job2.id
        assert job1.job_type == "refresh"


def test_interrupted_job_recovery(postgres_engine) -> None:  # type: ignore[no-untyped-def]
    """Expired running jobs are recovered to interrupted, or succeeded if already published."""
    with Session(postgres_engine) as session:
        # 1. Running job without publication -> recovered to interrupted
        old_time = utc_now() - timedelta(minutes=5)
        stale_job = WorkbenchJob(
            id=str(uuid4()),
            job_type="refresh",
            status="running",
            heartbeat_at=old_time,
            started_at=old_time,
            owner="dead-worker-1",
        )
        session.add(stale_job)

        # 2. Running job whose snapshot actually published before dying -> recovered to succeeded
        current_pub = session.get(PublishedSnapshot, DEFAULT_CHANNEL)
        assert current_pub is not None
        snap_id = current_pub.snapshot_id
        published_job = WorkbenchJob(
            id=str(uuid4()),
            job_type="bootstrap",
            status="running",
            heartbeat_at=old_time,
            started_at=old_time,
            owner="dead-worker-2",
            output_refs_json={"snapshot_id": snap_id},
        )
        session.add(published_job)
        session.commit()

        # Run recovery
        recovered = recover_interrupted_jobs(session, lease_timeout_seconds=60)
        assert len(recovered) >= 2

        recovered_ids = {j.id for j in recovered}
        assert stale_job.id in recovered_ids
        assert published_job.id in recovered_ids

        refreshed_stale = session.get(WorkbenchJob, stale_job.id)
        assert refreshed_stale is not None
        assert refreshed_stale.status == "interrupted"
        assert refreshed_stale.error_summary is not None

        refreshed_published = session.get(WorkbenchJob, published_job.id)
        assert refreshed_published is not None
        assert refreshed_published.status == "succeeded"


def test_failed_candidate_leaves_publication_pointer_unchanged(postgres_engine) -> None:  # type: ignore[no-untyped-def]
    """A failed candidate validation leaves the prior published pointer intact."""
    with Session(postgres_engine) as session:
        channel = f"test_{uuid4().hex[:16]}"
        prior_snap = session.scalars(select(ServingSnapshot).limit(1)).first()
        assert prior_snap is not None
        prior_snapshot_id = prior_snap.id

        session.add(
            PublishedSnapshot(
                channel=channel,
                snapshot_id=prior_snapshot_id,
                published_at=utc_now(),
            )
        )
        session.commit()

        # Create a candidate dataset
        dataset = WorkbenchDataset(
            id=str(uuid4()),
            content_sha256=uuid4().hex * 2,
            membership_sha256=uuid4().hex * 2,
            semantic_signature=uuid4().hex * 2,
            source_namespace="sportsdataverse",
            parser_version="test-v1",
            quality_version="test-v1",
            seasons_json=["2025-26"],
            phases_json=["regular_season"],
            manifest_json={},
            coverage_json={},
            exclusions_json={},
            status="candidate",
        )
        with allow_admin_mutation(session):
            session.add(dataset)
            session.commit()

        def failing_runner(dataset_id: str) -> None:
            raise CandidateValidationError("Simulated bad team pairs failure")

        with pytest.raises(CandidateValidationError):
            publish_workbench_release(
                session,
                dataset.id,
                channel=channel,
                acquire_lock=False,
                runner=failing_runner,
            )

        # Pointer must remain completely unchanged
        current_pointer = session.get(PublishedSnapshot, channel)
        assert current_pointer is not None
        assert current_pointer.snapshot_id == prior_snapshot_id


def test_operator_token_authorization(api_client: TestClient) -> None:
    """POST /api/workbench/jobs enforces operator token verification for mutations."""
    # 1. Invalid operator token -> 403 Forbidden
    resp = api_client.post(
        "/api/workbench/jobs",
        json={"jobType": "refresh"},
        headers={"X-Operator-Token": "completely-invalid-operator-token"},
    )
    assert resp.status_code == 403
    assert "Invalid operator token" in resp.text

    # 2. Valid operator token -> 202 Accepted with job ID
    valid_resp = api_client.post(
        "/api/workbench/jobs",
        json={"jobType": "portraits"},
        headers={"X-Operator-Token": "local-operator-secret-change-before-deploy"},
    )
    assert valid_resp.status_code == 202
    data = valid_resp.json()
    assert "job_id" in data
    assert data["job_type"] == "portraits"
    assert data["status"] in ("queued", "running")


def test_prompt_job_id_response(api_client: TestClient) -> None:
    """Job creation returns job ID promptly with 202 Accepted status."""
    resp = api_client.post(
        "/api/workbench/jobs",
        json={"jobType": "refresh"},
        headers={"X-Operator-Token": "local-operator-secret-change-before-deploy"},
    )
    assert resp.status_code == 202
    data = resp.json()
    assert "job_id" in data
    assert data["job_type"] == "refresh"


def test_unsupported_job_type_rejected_with_422(api_client: TestClient) -> None:
    """Requesting an unallowlisted job returns HTTP 422."""
    resp = api_client.post(
        "/api/workbench/jobs",
        json={"jobType": "destroy_all_data"},
        headers={"X-Operator-Token": "local-operator-secret-change-before-deploy"},
    )
    assert resp.status_code == 422
    assert "not allowlisted" in resp.text


def test_sanitize_error_redaction() -> None:
    """sanitize_error strips secrets, passwords, and tokens and bounds length."""
    raw = "Failed with password=SuperSecretPassword123 and token=BearerTokenABC456"
    sanitized = sanitize_error(raw)
    assert "SuperSecretPassword123" not in sanitized
    assert "BearerTokenABC456" not in sanitized
    assert "password=***" in sanitized
    assert "token=***" in sanitized

    long_msg = "Error: " + ("x" * 2000)
    bounded = sanitize_error(long_msg)
    assert len(bounded) <= 1000
    assert bounded.endswith("...")


def test_workbench_status_endpoint(api_client: TestClient) -> None:
    """GET /api/workbench/status returns valid release, source, and worker metadata."""
    resp = api_client.get("/api/workbench/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "status" in data
    assert "release" in data
    assert "source" in data
    assert "worker" in data
    assert data["capabilities"]["forecasting"] in (
        "no_policy_registered",
        "points-v1-prior_blend",
    )

    assert data["worker"]["scheduled_refresh_utc"] == "09:00"


def test_bootstrap_execution_and_idempotence(postgres_engine, monkeypatch) -> None:  # type: ignore[no-untyped-def]
    """Bootstrap job populates workbench release and repeated execution is idempotent."""
    from courtlens.services.workbench_jobs import execute_job
    from courtlens.workbench_models import WorkbenchReleaseBinding

    with Session(postgres_engine) as session:
        seeded_dataset = session.scalar(select(WorkbenchDataset))
        assert seeded_dataset is not None
        dataset_id = seeded_dataset.id
        pointer = session.get(PublishedSnapshot, DEFAULT_CHANNEL)
        assert pointer is not None
        session.delete(pointer)
        session.commit()

    # Isolate acquisition at its external boundary. The worker's locks, stages,
    # validation/publication, pointer and idempotence still execute against PostgreSQL.
    monkeypatch.setattr(
        "courtlens.services.workbench_jobs.acquire_workbench_data",
        lambda **kwargs: ["fixture-manifest"],
    )
    monkeypatch.setattr(
        "courtlens.services.workbench_jobs.import_workbench_data",
        lambda session, **kwargs: session.get(WorkbenchDataset, dataset_id),
    )
    with Session(postgres_engine) as session:
        initial_pub = session.get(PublishedSnapshot, DEFAULT_CHANNEL)
        initial_pub_snapshot_id = initial_pub.snapshot_id if initial_pub else None

    try:
        with Session(postgres_engine) as session:
            job = enqueue_job(session, "bootstrap")
            job_id = job.id

        # 1. First execution
        finished_job = execute_job(postgres_engine, job_id, worker_id="test-bootstrap-worker")
        assert finished_job.status == "succeeded"
        assert finished_job.stage == "completed"
        assert "snapshot_id" in finished_job.output_refs_json
        assert finished_job.input_refs_json["manifests_count"] == 1
        assert set(finished_job.timings_json) >= {"acquiring", "importing", "publishing"}

        snapshot_id = finished_job.output_refs_json["snapshot_id"]

        with Session(postgres_engine) as session:
            # Verify publication pointer on public channel
            pub = session.get(PublishedSnapshot, DEFAULT_CHANNEL)
            assert pub is not None
            assert pub.snapshot_id == snapshot_id

            # Verify release binding exists
            binding = session.scalar(
                select(WorkbenchReleaseBinding).where(
                    WorkbenchReleaseBinding.snapshot_id == snapshot_id
                )
            )
            assert binding is not None
            assert binding.capability_bindings_json.get("player_facts") is True

        # 2. Second execution (idempotent)
        with Session(postgres_engine) as session:
            job2 = enqueue_job(session, "bootstrap")
            job2_id = job2.id

        finished_job2 = execute_job(postgres_engine, job2_id, worker_id="test-bootstrap-worker")
        assert finished_job2.status == "succeeded"
        assert finished_job2.stage == "completed"
        assert finished_job2.output_refs_json.get("action") == "already_bootstrapped"
    finally:
        if initial_pub_snapshot_id:
            with Session(postgres_engine) as session:
                pub = session.get(PublishedSnapshot, DEFAULT_CHANNEL)
                if pub:
                    pub.snapshot_id = initial_pub_snapshot_id
                    session.commit()
