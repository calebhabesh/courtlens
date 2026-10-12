"""Archive selection must never borrow the current release's evidence binding."""

from datetime import date

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchiveDataset
from courtlens.evaluation.config import load_config
from courtlens.services.evaluation_public import DEFAULT_CONFIG, resolve_archive_context
from courtlens.warehouse_models import ServingSnapshot, WarehouseBuild
from courtlens.workbench_models import WorkbenchSnapshotEquivalence
from tests.integration.test_analytics_api import seed_analytics_snapshot


def frozen_snapshot(session: Session, *, equivalent: bool = False) -> ServingSnapshot:
    config = load_config(DEFAULT_CONFIG)
    dataset = ArchiveDataset(
        content_sha256=config.dataset.content_sha256,
        observation_sha256=config.dataset.observation_sha256,
        source_namespace="fixture:frozen-evaluation",
        parser_version="test-v1",
        manifest_json={},
        status="accepted",
    )
    session.add(dataset)
    session.flush()
    build = WarehouseBuild(
        dataset_id=dataset.id,
        status="ready",
        candidate_schema="cl_candidate_frozen",
        code_version="test",
        metric_version="test",
        feature_version="test",
        scoring_version=config.target.scoring_sha256,
    )
    session.add(build)
    session.flush()
    snapshot = ServingSnapshot(
        **({} if equivalent else {"id": config.snapshot_id}),
        build_id=build.id,
        dataset_id=dataset.id,
        status="ready",
        mode="historical_reconstruction",
        source=dataset.source_namespace,
        coverage_start=date(2021, 10, 19),
        coverage_end=date(2024, 4, 14),
        default_replay_date=date(2024, 4, 14),
        supported_replay_dates_json=["2024-04-14"],
        code_version="test",
        metric_version="test",
        feature_version="test",
        scoring_version=config.target.scoring_sha256,
        quality_report_json={},
    )
    session.add(snapshot)
    session.flush()
    if equivalent:
        session.add(
            WorkbenchSnapshotEquivalence(
                local_snapshot_id=snapshot.id,
                authoritative_snapshot_id=config.snapshot_id,
                semantic_signature="a" * 64,
                dataset_content_sha256=config.dataset.content_sha256,
                dataset_observation_sha256=config.dataset.observation_sha256,
                scoring_version=config.target.scoring_sha256,
                status="verified",
            )
        )
        session.flush()
    return snapshot


def test_archive_uses_frozen_inputs_independently_of_publication(session: Session) -> None:
    current = seed_analytics_snapshot(session)
    frozen = frozen_snapshot(session)
    context = resolve_archive_context(session)
    assert context.snapshot.id == frozen.id != current.id
    assert context.published_at is None


def test_archive_uses_verified_equivalent_inputs_after_restore(session: Session) -> None:
    seed_analytics_snapshot(session)
    restored = frozen_snapshot(session, equivalent=True)
    assert resolve_archive_context(session).snapshot.id == restored.id


def test_archive_missing_inputs_never_fall_back_to_current(session: Session) -> None:
    seed_analytics_snapshot(session)
    with pytest.raises(HTTPException) as error:
        resolve_archive_context(session)
    assert error.value.status_code == 404
    assert error.value.detail["reason"] == "evaluation_archive_snapshot_unavailable"


def test_archive_flag_preserves_explicit_snapshot_mismatch(
    api_client: TestClient, session: Session
) -> None:
    current = seed_analytics_snapshot(session)
    frozen_snapshot(session)
    response = api_client.get(
        "/api/analytics/evaluations", params={"archive": "true", "snapshotId": current.id}
    )
    assert response.status_code == 404
    assert response.json()["detail"]["reason"] == "evaluation_snapshot_mismatch"
