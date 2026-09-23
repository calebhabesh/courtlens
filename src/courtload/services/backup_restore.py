"""Backup manifest creation and restored-state verification for CourtLoad."""

from __future__ import annotations

import hashlib
import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from courtload.archive_models import ArchiveDataset
from courtload.services.evaluation_public import REGISTERED_REPORT_SHA256
from courtload.services.player_analytics import (
    metadata as analytics_metadata,
)
from courtload.services.player_analytics import (
    player_profile as analytics_player_profile,
)
from courtload.services.player_analytics import (
    resolve_replay_date,
    resolve_snapshot,
)
from courtload.services.publication import DEFAULT_CHANNEL
from courtload.services.replay_estimates import (
    EXPECTED_CALIBRATION_SHA256 as REGISTERED_CALIBRATION_SHA256,
)
from courtload.services.replay_estimates import (
    EXPECTED_REPLAY_SHA256 as REGISTERED_REPLAY_SHA256,
)
from courtload.services.replay_estimates import (
    RUN_ID as REGISTERED_RUN_ID,
)
from courtload.warehouse_models import PublishedSnapshot, ServingSnapshot


def hash_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def create_backup_manifest(
    session: Session,
    *,
    artifacts_dir: Path,
    raw_dir: Path,
    channel: str = DEFAULT_CHANNEL,
    code_version: str = "working-tree",
) -> dict[str, Any]:
    """Generate a comprehensive manifest describing all state to be backed up."""
    pointer = session.get(PublishedSnapshot, channel)
    if pointer is None:
        raise ValueError(f"No published pointer exists for channel '{channel}'")
    snapshot = session.get(ServingSnapshot, pointer.snapshot_id)
    if snapshot is None:
        raise ValueError(f"Published snapshot '{pointer.snapshot_id}' does not exist")
    dataset = session.get(ArchiveDataset, snapshot.dataset_id)
    if dataset is None:
        raise ValueError(f"Dataset '{snapshot.dataset_id}' does not exist")

    run_dir = artifacts_dir / REGISTERED_RUN_ID
    artifact_hashes: dict[str, str] = {}
    for filename in ("replay-estimates.jsonl", "calibration.json", "evaluation-report.json"):
        target_path = run_dir / filename
        if target_path.exists():
            artifact_hashes[filename] = hash_file(target_path)

    raw_manifest_path = raw_dir / "retrieval-manifest.json"
    raw_manifest = (
        json.loads(raw_manifest_path.read_text(encoding="utf-8"))
        if raw_manifest_path.exists()
        else None
    )

    return {
        "created_at_utc": datetime.now(UTC).isoformat(),
        "code_version": code_version,
        "channel": channel,
        "snapshot_id": snapshot.id,
        "dataset_id": dataset.id,
        "dataset_content_sha256": dataset.content_sha256,
        "dataset_observation_sha256": dataset.observation_sha256,
        "registered_evaluation_run_id": REGISTERED_RUN_ID,
        "artifact_hashes": artifact_hashes,
        "raw_archive": {
            "path": str(raw_dir),
            "manifest": raw_manifest,
        },
    }


def verify_restored_state(
    session: Session,
    *,
    artifacts_dir: Path,
    expected_snapshot_id: str | None = None,
    channel: str = DEFAULT_CHANNEL,
    test_player_a: str = "2544",
    test_player_b: str = "201939",
    test_date: date = date(2023, 11, 15),
) -> dict[str, Any]:
    """Verify that a restored database and artifact directory satisfy all CourtLoad invariants."""
    context = resolve_snapshot(session, expected_snapshot_id, channel=channel)
    snapshot = context.snapshot
    if expected_snapshot_id and snapshot.id != expected_snapshot_id:
        raise ValueError(f"Snapshot mismatch: expected {expected_snapshot_id}, got {snapshot.id}")

    dataset = session.get(ArchiveDataset, snapshot.dataset_id)
    if dataset is None or dataset.status != "accepted":
        raise ValueError(f"Dataset {snapshot.dataset_id} is missing or not accepted")

    # Verify evaluation artifacts
    run_dir = artifacts_dir / REGISTERED_RUN_ID
    if not run_dir.exists():
        raise FileNotFoundError(f"Evaluation artifact directory missing: {run_dir}")

    replay_path = run_dir / "replay-estimates.jsonl"
    calib_path = run_dir / "calibration.json"
    report_path = run_dir / "evaluation-report.json"

    for path, name in (
        (replay_path, "replay-estimates.jsonl"),
        (calib_path, "calibration.json"),
        (report_path, "evaluation-report.json"),
    ):
        if not path.exists():
            raise FileNotFoundError(f"Required artifact {name} missing in {run_dir}")

    replay_sha = hash_file(replay_path)
    calib_sha = hash_file(calib_path)
    report_sha = hash_file(report_path)

    if replay_sha != REGISTERED_REPLAY_SHA256:
        raise ValueError(
            f"Replay estimates SHA mismatch: {replay_sha} != {REGISTERED_REPLAY_SHA256}"
        )
    if calib_sha != REGISTERED_CALIBRATION_SHA256:
        raise ValueError(
            f"Calibration SHA mismatch: {calib_sha} != {REGISTERED_CALIBRATION_SHA256}"
        )
    if report_sha != REGISTERED_REPORT_SHA256:
        raise ValueError(
            f"Evaluation report SHA mismatch: {report_sha} != {REGISTERED_REPORT_SHA256}"
        )

    # Verify real comparison reconstruction
    selected_date = resolve_replay_date(snapshot, test_date)
    profile_a = analytics_player_profile(session, context, test_player_a, selected_date)
    profile_b = analytics_player_profile(session, context, test_player_b, selected_date)

    pt_a = profile_a["estimate"]["point"]
    pt_b = profile_b["estimate"]["point"]
    gap = round(float(pt_a) - float(pt_b), 2) if pt_a is not None and pt_b is not None else None

    meta = analytics_metadata(context, selected_date)

    return {
        "status": "verified",
        "channel": channel,
        "snapshot_id": snapshot.id,
        "dataset_id": dataset.id,
        "default_replay_date": snapshot.default_replay_date.isoformat(),
        "verified_artifacts": {
            "run_id": REGISTERED_RUN_ID,
            "replay_estimates_sha256": replay_sha,
            "calibration_sha256": calib_sha,
            "report_sha256": report_sha,
        },
        "verified_comparison": {
            "date": selected_date.isoformat(),
            "player_a": {
                "id": test_player_a,
                "name": profile_a["player"]["name"],
                "last_5": profile_a["summaries"]["last_5"]["reference_points_per_game"]
                if profile_a["summaries"]["last_5"]
                else None,
                "last_10": profile_a["summaries"]["last_10"]["reference_points_per_game"]
                if profile_a["summaries"]["last_10"]
                else None,
                "point_estimate": pt_a,
                "interval": profile_a["estimate"]["interval"],
            },
            "player_b": {
                "id": test_player_b,
                "name": profile_b["player"]["name"],
                "last_5": profile_b["summaries"]["last_5"]["reference_points_per_game"]
                if profile_b["summaries"]["last_5"]
                else None,
                "last_10": profile_b["summaries"]["last_10"]["reference_points_per_game"]
                if profile_b["summaries"]["last_10"]
                else None,
                "point_estimate": pt_b,
                "interval": profile_b["estimate"]["interval"],
            },
            "estimate_gap": gap,
        },
        "metadata": meta,
    }
