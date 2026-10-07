"""Workbench registry, semantic signatures, and portable experiment equivalence checks."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.evaluation.config import load_config
from courtlens.models import utc_now
from courtlens.workbench_models import WorkbenchSnapshotEquivalence

M6_RUN_ID = "6f7af9e63f27aada910d"
PROJECT_ROOT = Path(os.environ.get("COURTLENS_PROJECT_ROOT", Path.cwd())).resolve()
DEFAULT_ARTIFACT_ROOT = PROJECT_ROOT / "data/artifacts/evaluation"
DEFAULT_M6_CONFIG = PROJECT_ROOT / "evaluation/config/baseline-v1.yaml"
EXPECTED_M6_REPLAY_SHA256 = "7c635f46abfd8df5e4045dfd2fa24ef993a8fa6e992475f45ef5603ce65bcb2f"
EXPECTED_M6_CALIBRATION_SHA256 = "510e50fd351c7f3f3d3fe21e277294acb35bd19296acaeafe0df00d315f239b6"
EXPECTED_M6_REPORT_SHA256 = "84d5443326c03bfdffdfac2c01ca72b17943ff1f3b0a733f6023e5924aa5de4b"


class SnapshotEquivalenceError(ValueError):
    """Raised when a candidate snapshot fails semantic equivalence verification."""


def compute_semantic_signature(
    *,
    content_sha256: str,
    membership_sha256: str,
    metric_version: str,
    feature_version: str,
    scoring_version: str,
    coverage: dict[str, Any],
    exclusions: dict[str, Any] | None = None,
) -> str:
    """Compute a deterministic portable semantic signature excluding local UUIDs and paths."""
    canonical_payload = {
        "content_sha256": content_sha256,
        "coverage": coverage,
        "exclusions": exclusions or {},
        "feature_version": feature_version,
        "membership_sha256": membership_sha256,
        "metric_version": metric_version,
        "scoring_version": scoring_version,
    }
    encoded = json.dumps(canonical_payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def register_retained_m6_experiment(
    session: Session,
    *,
    artifact_root: Path = DEFAULT_ARTIFACT_ROOT,
    config_path: Path = DEFAULT_M6_CONFIG,
) -> dict[str, Any]:
    """Verify and register legacy M6 as retained experiment without modifying files."""
    run_dir = artifact_root / M6_RUN_ID
    if not run_dir.exists():
        raise FileNotFoundError(f"Retained M6 artifact directory not found: {run_dir}")

    manifest_path = run_dir / "run-manifest.json"
    if not manifest_path.exists():
        raise FileNotFoundError(f"Retained M6 manifest not found: {manifest_path}")

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest["run_id"] != M6_RUN_ID or manifest.get("final_test_opened") is not True:
        raise ValueError(f"Incomplete or invalid M6 run manifest: {M6_RUN_ID}")

    config = load_config(config_path)

    # Verify byte-for-byte artifact hashes
    for filename, expected_hash in (
        ("run-manifest.json", manifest["artifacts"].get("run-manifest.json")),
        ("evaluation-report.json", EXPECTED_M6_REPORT_SHA256),
        ("replay-estimates.jsonl", EXPECTED_M6_REPLAY_SHA256),
        ("calibration.json", EXPECTED_M6_CALIBRATION_SHA256),
    ):
        file_path = run_dir / filename
        if not file_path.exists():
            raise FileNotFoundError(f"Missing M6 artifact file: {filename}")
        actual_hash = hashlib.sha256(file_path.read_bytes()).hexdigest()
        if expected_hash and actual_hash != expected_hash:
            raise ValueError(
                f"M6 artifact hash mismatch for {filename}: {actual_hash} != {expected_hash}"
            )

    semantic_sig = compute_semantic_signature(
        content_sha256=config.dataset.content_sha256,
        membership_sha256=config.dataset.observation_sha256,
        metric_version="basketball-v1",
        feature_version="feature-v1",
        scoring_version=config.target.scoring_sha256,
        coverage={"seasons": config.dataset.seasons},
    )

    return {
        "run_id": M6_RUN_ID,
        "authoritative_snapshot_id": config.snapshot_id,
        "status": "retained_verified",
        "semantic_signature": semantic_sig,
        "artifacts": {
            "evaluation-report.json": EXPECTED_M6_REPORT_SHA256,
            "replay-estimates.jsonl": EXPECTED_M6_REPLAY_SHA256,
            "calibration.json": EXPECTED_M6_CALIBRATION_SHA256,
        },
    }


def verify_and_bind_snapshot_equivalence(
    session: Session,
    *,
    local_snapshot_id: str,
    authoritative_snapshot_id: str,
    expected_content_sha256: str,
    expected_observation_sha256: str,
    expected_scoring_version: str,
    actual_content_sha256: str,
    actual_observation_sha256: str,
    actual_scoring_version: str,
    semantic_signature: str,
    facts_match: bool = True,
    transforms_match: bool = True,
    features_match: bool = True,
    calibration_match: bool = True,
) -> WorkbenchSnapshotEquivalence:
    """Verify semantic equivalence of a rebuilt local snapshot and bind it if verified."""
    rejection_reasons: list[str] = []

    if not facts_match or actual_content_sha256 != expected_content_sha256:
        rejection_reasons.append("dataset_facts_mismatch")
    if actual_observation_sha256 != expected_observation_sha256:
        rejection_reasons.append("dataset_observation_mismatch")
    if actual_scoring_version != expected_scoring_version:
        rejection_reasons.append("scoring_version_mismatch")
    if not transforms_match:
        rejection_reasons.append("transforms_mismatch")
    if not features_match:
        rejection_reasons.append("features_mismatch")
    if not calibration_match:
        rejection_reasons.append("calibration_mismatch")

    stmt = select(WorkbenchSnapshotEquivalence).where(
        WorkbenchSnapshotEquivalence.local_snapshot_id == local_snapshot_id,
        WorkbenchSnapshotEquivalence.authoritative_snapshot_id == authoritative_snapshot_id,
    )
    existing = session.execute(stmt).scalar_one_or_none()

    if rejection_reasons:
        if existing:
            existing.status = "rejected"
            existing.verification_report_json = {"reasons": rejection_reasons}
            session.flush()
        else:
            rejected_record = WorkbenchSnapshotEquivalence(
                local_snapshot_id=local_snapshot_id,
                authoritative_snapshot_id=authoritative_snapshot_id,
                semantic_signature=semantic_signature,
                dataset_content_sha256=actual_content_sha256,
                dataset_observation_sha256=actual_observation_sha256,
                scoring_version=actual_scoring_version,
                status="rejected",
                verification_report_json={"reasons": rejection_reasons},
            )
            session.add(rejected_record)
            session.flush()
        reasons_str = ", ".join(rejection_reasons)
        raise SnapshotEquivalenceError(f"Snapshot equivalence rejected: {reasons_str}")

    if existing:
        existing.status = "verified"
        existing.semantic_signature = semantic_signature
        existing.dataset_content_sha256 = actual_content_sha256
        existing.dataset_observation_sha256 = actual_observation_sha256
        existing.scoring_version = actual_scoring_version
        existing.verified_at = utc_now()
        existing.verification_report_json = {"status": "verified", "reasons": []}
        session.flush()
        return existing

    record = WorkbenchSnapshotEquivalence(
        local_snapshot_id=local_snapshot_id,
        authoritative_snapshot_id=authoritative_snapshot_id,
        semantic_signature=semantic_signature,
        dataset_content_sha256=actual_content_sha256,
        dataset_observation_sha256=actual_observation_sha256,
        scoring_version=actual_scoring_version,
        status="verified",
        verification_report_json={"status": "verified", "reasons": []},
    )
    session.add(record)
    session.flush()
    return record


def check_snapshot_equivalence(
    session: Session,
    *,
    local_snapshot_id: str,
    authoritative_snapshot_id: str,
    content_sha256: str,
    observation_sha256: str,
    scoring_version: str,
) -> bool:
    """Return True if local snapshot equals authoritative snapshot or has verified binding."""
    if local_snapshot_id == authoritative_snapshot_id:
        return True

    stmt = select(WorkbenchSnapshotEquivalence).where(
        WorkbenchSnapshotEquivalence.local_snapshot_id == local_snapshot_id,
        WorkbenchSnapshotEquivalence.authoritative_snapshot_id == authoritative_snapshot_id,
        WorkbenchSnapshotEquivalence.status == "verified",
        WorkbenchSnapshotEquivalence.dataset_content_sha256 == content_sha256,
        WorkbenchSnapshotEquivalence.dataset_observation_sha256 == observation_sha256,
        WorkbenchSnapshotEquivalence.scoring_version == scoring_version,
    )
    result = session.execute(stmt).scalar_one_or_none()
    return result is not None
