"""Expose only the registered, hash-verified M6 report for its frozen snapshot."""

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchiveDataset
from courtlens.evaluation.config import load_config
from courtlens.services.player_analytics import SnapshotContext, metadata, resolve_snapshot
from courtlens.warehouse_models import ServingSnapshot, WarehouseBuild
from courtlens.workbench_models import WorkbenchSnapshotEquivalence

DEFAULT_RUN_ID = "6f7af9e63f27aada910d"
PROJECT_ROOT = Path(os.environ.get("COURTLENS_PROJECT_ROOT", Path.cwd())).resolve()
DEFAULT_ARTIFACT_ROOT = PROJECT_ROOT / "data/artifacts/evaluation"
DEFAULT_CONFIG = PROJECT_ROOT / "evaluation/config/baseline-v1.yaml"
REGISTERED_REPORT_SHA256 = "84d5443326c03bfdffdfac2c01ca72b17943ff1f3b0a733f6023e5924aa5de4b"


def resolve_archive_context(
    session: Session, *, config_path: Path = DEFAULT_CONFIG
) -> SnapshotContext:
    """Read the frozen experiment's retained snapshot, independent of publication.

    Restores may use a verified equivalent local snapshot. The report reader still
    checks dataset/scoring identities and the registered report hash afterward.
    """
    try:
        config = load_config(config_path)
    except (OSError, ValueError) as error:
        raise HTTPException(
            status_code=503, detail={"reason": "evaluation_artifact_unavailable"}
        ) from error
    snapshot = session.get(ServingSnapshot, config.snapshot_id)
    if snapshot is not None:
        return resolve_snapshot(session, snapshot.id)
    local_id = session.scalar(
        select(ServingSnapshot.id)
        .join(
            WorkbenchSnapshotEquivalence,
            WorkbenchSnapshotEquivalence.local_snapshot_id == ServingSnapshot.id,
        )
        .where(
            ServingSnapshot.status == "ready",
            WorkbenchSnapshotEquivalence.authoritative_snapshot_id == config.snapshot_id,
            WorkbenchSnapshotEquivalence.status == "verified",
            WorkbenchSnapshotEquivalence.dataset_content_sha256 == config.dataset.content_sha256,
            WorkbenchSnapshotEquivalence.dataset_observation_sha256
            == config.dataset.observation_sha256,
            WorkbenchSnapshotEquivalence.scoring_version == config.target.scoring_sha256,
        )
        .order_by(ServingSnapshot.created_at, ServingSnapshot.id)
        .limit(1)
    )
    if local_id is None:
        raise HTTPException(
            status_code=404, detail={"reason": "evaluation_archive_snapshot_unavailable"}
        )
    return resolve_snapshot(session, local_id)


def public_evaluation(
    session: Session,
    context: SnapshotContext,
    run_id: str | None,
    *,
    artifact_root: Path = DEFAULT_ARTIFACT_ROOT,
    config_path: Path = DEFAULT_CONFIG,
) -> dict[str, Any]:
    selected_run = run_id or DEFAULT_RUN_ID
    if selected_run != DEFAULT_RUN_ID:
        raise HTTPException(status_code=404, detail={"reason": "evaluation_run_not_found"})
    try:
        config = load_config(config_path)
    except (OSError, ValueError) as error:
        raise HTTPException(
            status_code=503,
            detail={"reason": "evaluation_artifact_unavailable"},
        ) from error
    dataset = session.get(ArchiveDataset, context.snapshot.dataset_id)
    from courtlens.services.workbench_registry import check_snapshot_equivalence

    is_equiv = check_snapshot_equivalence(
        session,
        local_snapshot_id=context.snapshot.id,
        authoritative_snapshot_id=config.snapshot_id,
        content_sha256=config.dataset.content_sha256,
        observation_sha256=config.dataset.observation_sha256,
        scoring_version=config.target.scoring_sha256,
    )
    if (
        not is_equiv
        or dataset is None
        or dataset.content_sha256 != config.dataset.content_sha256
        or dataset.observation_sha256 != config.dataset.observation_sha256
        or context.snapshot.scoring_version != config.target.scoring_sha256
    ):
        raise HTTPException(status_code=404, detail={"reason": "evaluation_snapshot_mismatch"})
    run_dir = artifact_root / selected_run
    try:
        manifest = json.loads((run_dir / "run-manifest.json").read_text())
        if manifest["run_id"] != selected_run or manifest["final_test_opened"] is not True:
            raise ValueError("incomplete evaluation run")
        report_bytes = (run_dir / "evaluation-report.json").read_bytes()
        expected_hash = manifest["artifacts"]["evaluation-report.json"]
        if (
            expected_hash != REGISTERED_REPORT_SHA256
            or hashlib.sha256(report_bytes).hexdigest() != REGISTERED_REPORT_SHA256
        ):
            raise ValueError("evaluation report hash mismatch")
        report: dict[str, Any] = json.loads(report_bytes)
        if report["run_id"] != selected_run:
            raise ValueError("report run mismatch")
    except (OSError, KeyError, ValueError, json.JSONDecodeError) as error:
        raise HTTPException(
            status_code=503,
            detail={"reason": "evaluation_artifact_unavailable"},
        ) from error
    result = metadata(context, context.snapshot.default_replay_date)
    result.update(
        {
            "run_id": selected_run,
            "report_sha256": expected_hash,
            "validation": report["validation"],
            "final_test": report["final_test"],
            "promotion": report["promotion"],
            "serving_policy": report["serving_policy"],
            "limitations": report["limitations"],
            "coverage_start": context.snapshot.coverage_start.isoformat(),
            "published_at": context.published_at,
            "record_counts": context.snapshot.quality_report_json.get("checks", {}),
            "latest_build": _latest_build(session, context),
        }
    )
    return result


def _latest_build(session: Session, context: SnapshotContext) -> dict[str, str | None] | None:
    from sqlalchemy import select

    row = session.scalar(
        select(WarehouseBuild)
        .where(WarehouseBuild.dataset_id == context.snapshot.dataset_id)
        .order_by(WarehouseBuild.created_at.desc())
        .limit(1)
    )
    return (
        {
            "status": row.status,
            "created_at": row.created_at.isoformat(),
            "finished_at": row.finished_at.isoformat() if row.finished_at else None,
        }
        if row is not None
        else None
    )
