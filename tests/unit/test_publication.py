from datetime import UTC, date, datetime

import pytest
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchiveDataset
from courtlens.services.publication import (
    FEATURE_VERSION,
    METRIC_VERSION,
    SCORING_VERSION,
    _candidate_schema,
    _relation,
    build_and_publish,
    published_snapshot_query,
)
from courtlens.warehouse_models import PublishedSnapshot, ServingSnapshot, WarehouseBuild


def _dataset(session: Session) -> ArchiveDataset:
    dataset = ArchiveDataset(
        content_sha256="a" * 64,
        observation_sha256="b" * 64,
        source_namespace="fixture:archive",
        parser_version="test-v1",
        manifest_json={},
        status="accepted",
    )
    session.add(dataset)
    session.flush()
    return dataset


def _snapshot(session: Session, dataset: ArchiveDataset, suffix: str) -> ServingSnapshot:
    build = WarehouseBuild(
        dataset_id=dataset.id,
        status="ready",
        candidate_schema=f"cl_candidate_{suffix}",
        code_version="test",
        metric_version=METRIC_VERSION,
        feature_version=FEATURE_VERSION,
        scoring_version=SCORING_VERSION,
    )
    session.add(build)
    session.flush()
    snapshot = ServingSnapshot(
        build_id=build.id,
        dataset_id=dataset.id,
        status="ready",
        mode="historical_reconstruction",
        source=dataset.source_namespace,
        coverage_start=date(2023, 1, 1),
        coverage_end=date(2023, 1, 31),
        default_replay_date=date(2023, 1, 15),
        supported_replay_dates_json=["2023-01-15"],
        code_version="test",
        metric_version=METRIC_VERSION,
        feature_version=FEATURE_VERSION,
        scoring_version=SCORING_VERSION,
        quality_report_json={"status": "passed"},
    )
    session.add(snapshot)
    session.flush()
    return snapshot


def test_candidate_relations_are_derived_from_safe_build_ids() -> None:
    schema = _candidate_schema("5fb79e74-c40c-4b76-ac96-b507fe07accc")

    assert schema == "cl_candidate_5fb79e74c40c4b76"
    assert (
        _relation(schema, "marts", "mart_archive_player_profile")
        == '"cl_candidate_5fb79e74c40c4b76_marts"."mart_archive_player_profile"'
    )
    with pytest.raises(ValueError, match="unsafe"):
        _relation("candidate; drop schema public", "marts", "profiles")


def test_publication_requires_postgres_locking(session: Session) -> None:
    dataset = _dataset(session)
    session.commit()

    with pytest.raises(RuntimeError, match="requires PostgreSQL"):
        build_and_publish(session, dataset.id, runner=lambda _: None)

    assert session.query(WarehouseBuild).count() == 0


def test_publication_rejects_unsafe_channel_before_database_work(session: Session) -> None:
    dataset = _dataset(session)
    session.commit()

    with pytest.raises(ValueError, match="safe lowercase identifier"):
        build_and_publish(session, dataset.id, channel="public;drop")

    assert session.query(WarehouseBuild).count() == 0


def test_published_snapshot_query_pins_pointer_once(session: Session) -> None:
    dataset = _dataset(session)
    old = _snapshot(session, dataset, "old")
    current = _snapshot(session, dataset, "current")
    session.add(
        PublishedSnapshot(channel="public", snapshot_id=current.id, published_at=datetime.now(UTC))
    )
    session.commit()

    resolved = session.scalar(published_snapshot_query())

    assert resolved is not None
    assert resolved.id == current.id
    assert resolved.id != old.id
