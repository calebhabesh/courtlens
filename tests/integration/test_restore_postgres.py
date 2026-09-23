from __future__ import annotations

import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from courtload.services.backup_restore import create_backup_manifest, verify_restored_state
from courtload.services.replay_estimates import (
    EXPECTED_CALIBRATION_SHA256,
    EXPECTED_REPLAY_SHA256,
)
from courtload.services.replay_estimates import (
    RUN_ID as REGISTERED_RUN_ID,
)

pytestmark = pytest.mark.postgres


@pytest.fixture
def postgres_session():  # type: ignore[no-untyped-def]
    url = os.getenv("COURTLOAD_TEST_POSTGRES_URL")
    if not url:
        pytest.skip("COURTLOAD_TEST_POSTGRES_URL is not configured")
    engine = create_engine(url)
    try:
        with Session(engine) as session:
            yield session
    finally:
        engine.dispose()


def test_backup_manifest_and_restore_verification(postgres_session: Session) -> None:
    artifacts_dir = Path("data/artifacts/evaluation")
    raw_dir = Path("data/raw/nocturnebear-a5f108b5")
    if not (artifacts_dir / REGISTERED_RUN_ID).exists():
        pytest.skip("Local evaluation artifacts not present")

    # 1. Test backup manifest generation
    manifest = create_backup_manifest(
        postgres_session,
        artifacts_dir=artifacts_dir,
        raw_dir=raw_dir,
        channel="public",
        code_version="test-commit",
    )
    assert manifest["channel"] == "public"
    assert manifest["registered_evaluation_run_id"] == REGISTERED_RUN_ID
    assert manifest["artifact_hashes"]["replay-estimates.jsonl"] == EXPECTED_REPLAY_SHA256
    assert manifest["artifact_hashes"]["calibration.json"] == EXPECTED_CALIBRATION_SHA256

    # 2. Test restore verification on current database and artifacts
    report = verify_restored_state(
        postgres_session,
        artifacts_dir=artifacts_dir,
        channel="public",
    )
    assert report["status"] == "verified"
    assert report["snapshot_id"] == manifest["snapshot_id"]
    assert report["verified_artifacts"]["replay_estimates_sha256"] == EXPECTED_REPLAY_SHA256
    assert report["verified_comparison"]["player_a"]["name"] == "LeBron James"
    assert report["verified_comparison"]["player_b"]["name"] == "Stephen Curry"
    assert report["verified_comparison"]["estimate_gap"] == 2.56


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
