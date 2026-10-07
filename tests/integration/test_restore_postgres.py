import hashlib
import os
from datetime import UTC, date, datetime
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchiveDataset
from courtlens.services.assistant.saved import reproduce_saved, saved_inventory
from courtlens.services.backup_restore import (
    create_backup_archive,
    create_backup_manifest,
    restore_backup_archive,
    verify_restored_state,
)
from courtlens.services.replay_estimates import (
    EXPECTED_CALIBRATION_SHA256,
    EXPECTED_REPLAY_SHA256,
)
from courtlens.services.replay_estimates import (
    RUN_ID as REGISTERED_RUN_ID,
)
from courtlens.warehouse_models import PublishedSnapshot, ServingSnapshot, WarehouseBuild

pytestmark = pytest.mark.postgres


@pytest.fixture
def postgres_session():  # type: ignore[no-untyped-def]
    url = os.getenv("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        if os.getenv("CI") or os.getenv("COURTLENS_REQUIRE_POSTGRES_TESTS"):
            pytest.fail(
                "COURTLENS_TEST_POSTGRES_URL must be configured when CI or "
                "COURTLENS_REQUIRE_POSTGRES_TESTS is set"
            )
        pytest.skip("COURTLENS_TEST_POSTGRES_URL is not configured")
    engine = create_engine(url)
    try:
        with Session(engine) as session:
            yield session
    finally:
        engine.dispose()


def test_db_behavior_backup_manifest_and_restore_verification(
    postgres_session: Session, tmp_path: Path
) -> None:
    """Self-contained test verifying manifest creation and restore verification logic."""
    uniqueness = uuid4().hex
    channel = f"test_{uniqueness[:16]}"
    dataset = ArchiveDataset(
        content_sha256=(uniqueness * 2)[:64],
        observation_sha256=(uniqueness[::-1] * 2)[:64],
        source_namespace="fixture:restore",
        parser_version="test-v1",
        manifest_json={},
        status="accepted",
    )
    postgres_session.add(dataset)
    postgres_session.flush()
    build = WarehouseBuild(
        dataset_id=dataset.id,
        status="ready",
        candidate_schema=f"cl_cand_{dataset.id.replace('-', '')[:16]}",
        code_version="test",
        metric_version="test-v1",
        feature_version="test-v1",
        scoring_version="test-v1",
    )
    postgres_session.add(build)
    postgres_session.flush()
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
        metric_version="test-v1",
        feature_version="test-v1",
        scoring_version="test-v1",
        quality_report_json={"status": "passed"},
    )
    postgres_session.add(snapshot)
    postgres_session.flush()
    postgres_session.add(
        PublishedSnapshot(
            channel=channel,
            snapshot_id=snapshot.id,
            published_at=snapshot.created_at,
        )
    )
    postgres_session.commit()

    run_id = f"test_run_{uniqueness[:12]}"
    run_dir = tmp_path / "artifacts" / run_id
    run_dir.mkdir(parents=True)
    raw_dir = tmp_path / "raw"
    raw_dir.mkdir(parents=True)
    (raw_dir / "retrieval-manifest.json").write_text('{"retrieved": true}', encoding="utf-8")

    replay_bytes = b'{"row": 1}\n'
    calib_bytes = b'{"calib": 1}\n'
    report_bytes = b'{"report": 1}\n'
    (run_dir / "replay-estimates.jsonl").write_bytes(replay_bytes)
    (run_dir / "calibration.json").write_bytes(calib_bytes)
    (run_dir / "evaluation-report.json").write_bytes(report_bytes)

    expected_hashes = {
        "replay-estimates.jsonl": hashlib.sha256(replay_bytes).hexdigest(),
        "calibration.json": hashlib.sha256(calib_bytes).hexdigest(),
        "evaluation-report.json": hashlib.sha256(report_bytes).hexdigest(),
    }

    manifest = create_backup_manifest(
        postgres_session,
        artifacts_dir=tmp_path / "artifacts",
        raw_dir=raw_dir,
        channel=channel,
        code_version="test-commit",
        run_id=run_id,
    )
    assert manifest["channel"] == channel
    assert manifest["registered_evaluation_run_id"] == run_id
    expected_replay_hash = expected_hashes["replay-estimates.jsonl"]
    assert manifest["artifact_hashes"]["replay-estimates.jsonl"] == expected_replay_hash

    report = verify_restored_state(
        postgres_session,
        artifacts_dir=tmp_path / "artifacts",
        channel=channel,
        run_id=run_id,
        expected_artifact_hashes=expected_hashes,
        verify_comparison=False,
        test_date=date(2023, 1, 15),
    )
    assert report["status"] == "verified"
    assert report["snapshot_id"] == manifest["snapshot_id"]


def test_real_archive_backup_manifest_and_restore_verification(
    postgres_session: Session,
) -> None:
    """Documented integration check against the full populated M6 archive and artifacts."""
    artifacts_dir = Path("data/artifacts/evaluation")
    raw_dir = Path("data/raw/nocturnebear-a5f108b5")
    if not (artifacts_dir / REGISTERED_RUN_ID).exists():
        pytest.skip("Local evaluation artifacts not present for real archive check")

    # Point test channel to authoritative legacy M6 snapshot
    legacy_channel = "legacy_test_m6"
    postgres_session.merge(
        PublishedSnapshot(
            channel=legacy_channel,
            snapshot_id="5b14b7ed-353b-499d-a37a-6887b5f6c715",
            published_at=datetime.now(UTC),
        )
    )
    postgres_session.commit()

    # 1. Test backup manifest generation
    manifest = create_backup_manifest(
        postgres_session,
        artifacts_dir=artifacts_dir,
        raw_dir=raw_dir,
        channel=legacy_channel,
        code_version="test-commit",
    )
    assert manifest["channel"] == legacy_channel
    assert manifest["registered_evaluation_run_id"] == REGISTERED_RUN_ID
    assert manifest["artifact_hashes"]["replay-estimates.jsonl"] == EXPECTED_REPLAY_SHA256
    assert manifest["artifact_hashes"]["calibration.json"] == EXPECTED_CALIBRATION_SHA256

    # 2. Test restore verification on current database and artifacts
    report = verify_restored_state(
        postgres_session,
        artifacts_dir=artifacts_dir,
        channel=legacy_channel,
    )
    assert report["status"] == "verified"
    assert report["mode"] == "historical_reconstruction"
    assert report["snapshot_id"] == manifest["snapshot_id"]
    assert report["verified_artifacts"]["replay_estimates_sha256"] == EXPECTED_REPLAY_SHA256
    assert report["verified_comparison"]["player_a"]["name"] == "LeBron James"
    assert report["verified_comparison"]["player_b"]["name"] == "Stephen Curry"
    assert report["verified_comparison"]["estimate_gap"] == 2.56


def test_workbench_backup_manifest_and_restore_verification(
    postgres_session: Session,
) -> None:
    """Integration check verifying workbench manifest creation and restore verification."""
    artifacts_dir = Path("data/artifacts/evaluation")
    raw_dir = Path("data/raw")

    manifest = create_backup_manifest(
        postgres_session,
        artifacts_dir=artifacts_dir,
        raw_dir=raw_dir,
        channel="public",
        code_version="test-commit",
    )
    assert manifest["channel"] == "public"
    assert manifest["mode"] == "workbench"
    assert manifest["workbench_records"]["player_games_count"] > 100000
    assert manifest["workbench_records"]["team_games_count"] > 7000
    assert manifest["workbench_records"]["forecast_issuances_count"] > 0
    assert manifest["media_policy"]["policy"] == "rebuildable_cache_excluded"

    report = verify_restored_state(
        postgres_session,
        artifacts_dir=artifacts_dir,
        channel="public",
        test_player_a="1630567",
        test_player_b="1629628",
    )
    assert report["status"] == "verified"
    assert report["mode"] == "workbench"
    assert report["counts"]["player_games"] > 100000
    assert report["counts"]["forecast_issuances"] > 0
    assert report["verified_profile"]["name"] == "Scottie Barnes"


def test_restore_verification_fails_on_missing_or_tampered_artifact(
    postgres_session: Session, tmp_path: Path
) -> None:
    # Empty artifacts dir should fail with FileNotFoundError
    with pytest.raises(FileNotFoundError):
        verify_restored_state(
            postgres_session,
            artifacts_dir=tmp_path,
            channel="public",
        )


def test_disposable_fresh_database_restore(postgres_session: Session, tmp_path: Path) -> None:
    """Full-cycle test: create backup archive bundle, restore into a fresh
    disposable PostgreSQL DB, and verify.
    """
    backup_dir = tmp_path / "backups"
    backup_dir.mkdir(parents=True)

    archive_file, manifest = create_backup_archive(
        postgres_session,
        backup_dir=backup_dir,
        artifacts_dir=Path("data/artifacts/evaluation"),
        raw_root=Path("data/raw"),
        configs_root=Path("evaluation"),
        channel="public",
        code_version="disposable-test",
    )
    assert archive_file.exists()
    assert archive_file.stat().st_size > 1024 * 1024  # > 1MB

    disposable_db_name = f"test_disposable_{uuid4().hex[:12]}"
    url = os.getenv(
        "COURTLENS_TEST_POSTGRES_URL",
        "postgresql://courtlens:courtlens@localhost:5432/courtlens",
    )
    # Base connection engine to create/drop disposable database
    base_engine = create_engine(url, isolation_level="AUTOCOMMIT")

    with base_engine.connect() as conn:
        conn.execute(text(f'CREATE DATABASE "{disposable_db_name}";'))

    disposable_url = url.rsplit("/", 1)[0] + f"/{disposable_db_name}"

    try:
        # Restore into fresh disposable database
        disposable_artifacts_dir = tmp_path / "restored_artifacts"
        disposable_raw_dir = tmp_path / "restored_raw"
        disposable_configs_dir = tmp_path / "restored_eval"

        restore_result = restore_backup_archive(
            postgres_session,
            archive_file,
            target_database_name=disposable_db_name,
            artifacts_dir=disposable_artifacts_dir,
            raw_root=disposable_raw_dir,
            configs_root=disposable_configs_dir,
            channel="public",
            verify_state=False,  # We verify against the disposable session below
        )
        assert restore_result["status"] == "restored"

        # Connect session directly to the fresh restored database and verify
        disposable_engine = create_engine(disposable_url)
        try:
            with Session(disposable_engine) as disp_session:
                report = verify_restored_state(
                    disp_session,
                    artifacts_dir=disposable_artifacts_dir,
                    channel="public",
                    expected_saved_conversations=manifest["saved_conversation_analyses"],
                )
                assert report["status"] == "verified"
                assert report["mode"] == "workbench"
                wb_recs = manifest["workbench_records"]
                assert report["counts"]["player_games"] == wb_recs["player_games_count"]
                assert report["counts"]["team_games"] == wb_recs["team_games_count"]
                assert report["counts"]["forecast_issuances"] == wb_recs["forecast_issuances_count"]
                assert saved_inventory(disp_session) == manifest["saved_conversation_analyses"]
                for retained in manifest["saved_conversation_analyses"]:
                    reproduction = reproduce_saved(disp_session, retained["id"])
                    assert reproduction["match"], reproduction
        finally:
            disposable_engine.dispose()
    finally:
        with base_engine.connect() as conn:
            conn.execute(text(f'DROP DATABASE IF EXISTS "{disposable_db_name}";'))
        base_engine.dispose()
