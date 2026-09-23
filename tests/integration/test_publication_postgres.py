from __future__ import annotations

import os
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from courtload.archive_models import ArchiveDataset
from courtload.database import Base
from courtload.services import publication
from courtload.services.publication import BuildInProgressError
from courtload.warehouse_models import PublishedSnapshot, ServingSnapshot, WarehouseBuild

pytestmark = pytest.mark.postgres


@pytest.fixture
def postgres_engine():  # type: ignore[no-untyped-def]
    url = os.getenv("COURTLOAD_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("COURTLOAD_TEST_POSTGRES_URL is not configured")
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    try:
        yield engine
    finally:
        engine.dispose()


def test_publication_lock_rejects_a_concurrent_builder(postgres_engine) -> None:  # type: ignore[no-untyped-def]
    with (
        Session(postgres_engine) as first,
        Session(postgres_engine) as second,
        publication.publication_lock(first),
        pytest.raises(BuildInProgressError),
        publication.publication_lock(second),
    ):
        pass


def test_failed_install_preserves_pointer_and_rollback_is_atomic(
    postgres_engine, monkeypatch: pytest.MonkeyPatch
) -> None:  # type: ignore[no-untyped-def]
    with Session(postgres_engine, expire_on_commit=False) as session:
        uniqueness = uuid4().hex
        channel = f"test_{uniqueness[:16]}"
        dataset = ArchiveDataset(
            content_sha256=(uniqueness * 2)[:64],
            observation_sha256=(uniqueness[::-1] * 2)[:64],
            source_namespace="fixture:publication",
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
            code_version="test",
            metric_version=publication.METRIC_VERSION,
            feature_version=publication.FEATURE_VERSION,
            scoring_version=publication.SCORING_VERSION,
        )
        session.add(old_build)
        session.flush()
        old = ServingSnapshot(
            build_id=old_build.id,
            dataset_id=dataset.id,
            status="ready",
            mode="historical_reconstruction",
            source=dataset.source_namespace,
            coverage_start=date(2023, 1, 1),
            coverage_end=date(2023, 1, 31),
            default_replay_date=date(2023, 1, 15),
            supported_replay_dates_json=["2023-01-15"],
            code_version="test",
            metric_version=publication.METRIC_VERSION,
            feature_version=publication.FEATURE_VERSION,
            scoring_version=publication.SCORING_VERSION,
            quality_report_json={"status": "passed"},
        )
        session.add(old)
        session.flush()
        session.add(
            PublishedSnapshot(
                channel=channel,
                snapshot_id=old.id,
                published_at=old.created_at,
            )
        )
        session.commit()

        monkeypatch.setattr(
            publication,
            "validate_candidate",
            lambda _session, build: {"status": "passed", "dataset_id": build.dataset_id},
        )
        monkeypatch.setattr(
            publication,
            "_snapshot_metadata",
            lambda _session, _build: {
                "coverage_start": date(2023, 1, 1),
                "coverage_end": date(2023, 1, 31),
                "replay_dates": [date(2023, 1, 15)],
                "default_replay_date": date(2023, 1, 15),
            },
        )

        def crash(*_args: object) -> None:
            raise RuntimeError("crash before pointer commit")

        monkeypatch.setattr(publication, "_install_candidate", crash)
        with pytest.raises(RuntimeError, match="crash before pointer commit"):
            publication.build_and_publish(
                session, dataset.id, channel=channel, runner=lambda _build: None
            )

        session.expire_all()
        assert session.get(PublishedSnapshot, channel).snapshot_id == old.id  # type: ignore[union-attr]
        assert (
            session.scalar(
                select(func.count())
                .select_from(ServingSnapshot)
                .where(ServingSnapshot.dataset_id == dataset.id)
            )
            == 1
        )

        monkeypatch.setattr(publication, "_install_candidate", lambda *_args: None)
        new = publication.build_and_publish(
            session, dataset.id, channel=channel, runner=lambda _build: None
        )
        assert session.get(PublishedSnapshot, channel).snapshot_id == new.id  # type: ignore[union-attr]
        repeated = publication.build_and_publish(
            session,
            dataset.id,
            channel=channel,
            runner=lambda _build: pytest.fail("idempotent publication reran the builder"),
        )
        assert repeated.id == new.id

        publication.rollback_publication(session, old.id, channel=channel)
        assert session.get(PublishedSnapshot, channel).snapshot_id == old.id  # type: ignore[union-attr]
