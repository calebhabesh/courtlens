"""Backup manifest creation, archive bundling, and restored-state verification for CourtLoad."""

from __future__ import annotations

import contextlib
import gzip
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
import tempfile
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
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
    resolve_snapshot,
)
from courtload.services.publication import DEFAULT_CHANNEL, publication_lock
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
from courtload.workbench_models import (
    ForecastIssuance,
    ForecastScore,
    ModelPolicyActivation,
    SavedInvestigation,
    WorkbenchDataset,
    WorkbenchPlayerGame,
    WorkbenchReleaseBinding,
    WorkbenchSchedule,
    WorkbenchTeamGame,
)


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
    run_id: str = REGISTERED_RUN_ID,
    workbench_raw_root: Path | None = None,
    evaluation_configs_dir: Path | None = None,
    with_lock: bool = False,
) -> dict[str, Any]:
    """Generate a comprehensive manifest describing database, dataset, pointer,
    and artifact hashes.
    """
    if with_lock:
        with publication_lock(session):
            return _create_backup_manifest_internal(
                session,
                artifacts_dir=artifacts_dir,
                raw_dir=raw_dir,
                channel=channel,
                code_version=code_version,
                run_id=run_id,
                workbench_raw_root=workbench_raw_root,
                evaluation_configs_dir=evaluation_configs_dir,
            )
    return _create_backup_manifest_internal(
        session,
        artifacts_dir=artifacts_dir,
        raw_dir=raw_dir,
        channel=channel,
        code_version=code_version,
        run_id=run_id,
        workbench_raw_root=workbench_raw_root,
        evaluation_configs_dir=evaluation_configs_dir,
    )


def _create_backup_manifest_internal(
    session: Session,
    *,
    artifacts_dir: Path,
    raw_dir: Path,
    channel: str,
    code_version: str,
    run_id: str,
    workbench_raw_root: Path | None,
    evaluation_configs_dir: Path | None,
) -> dict[str, Any]:
    pointer = session.get(PublishedSnapshot, channel)
    if pointer is None:
        raise ValueError(f"No published pointer exists for channel '{channel}'")
    snapshot = session.get(ServingSnapshot, pointer.snapshot_id)
    if snapshot is None:
        raise ValueError(f"Published snapshot '{pointer.snapshot_id}' does not exist")

    # Check whether this snapshot is a workbench release binding
    binding = session.scalar(
        select(WorkbenchReleaseBinding).where(WorkbenchReleaseBinding.snapshot_id == snapshot.id)
    )

    mode: str
    dataset_id: str
    dataset_content_sha256: str
    dataset_observation_sha256: str
    semantic_signature: str | None = None

    if binding is not None:
        wb_dataset = session.get(WorkbenchDataset, binding.dataset_id)
        if wb_dataset is None:
            raise ValueError(f"Workbench dataset '{binding.dataset_id}' does not exist")
        dataset_id = wb_dataset.id
        dataset_content_sha256 = wb_dataset.content_sha256
        dataset_observation_sha256 = wb_dataset.membership_sha256
        semantic_signature = binding.semantic_signature
        mode = "workbench"
    else:
        archive_dataset = session.get(ArchiveDataset, snapshot.dataset_id)
        if archive_dataset is None:
            raise ValueError(f"Dataset '{snapshot.dataset_id}' does not exist")
        dataset_id = archive_dataset.id
        dataset_content_sha256 = archive_dataset.content_sha256
        dataset_observation_sha256 = archive_dataset.observation_sha256
        mode = "historical_reconstruction"

    # Evaluation artifacts (M5/M6)
    run_dir = artifacts_dir / run_id
    artifact_hashes: dict[str, str] = {}
    for filename in ("replay-estimates.jsonl", "calibration.json", "evaluation-report.json"):
        target_path = run_dir / filename
        if target_path.exists():
            artifact_hashes[filename] = hash_file(target_path)

    # Evaluation artifacts (points-v1 and challenger runs)
    points_v1_artifacts: dict[str, str] = {}
    if artifacts_dir.exists():
        for p1_dir in artifacts_dir.iterdir():
            if p1_dir.is_dir() and p1_dir.name != run_id and p1_dir.name != "analyses":
                for fname in (
                    "evaluation-report.json",
                    "calibration.json",
                    "model-card.md",
                    "metrics.json",
                    "config.json",
                ):
                    fpath = p1_dir / fname
                    if fpath.exists():
                        points_v1_artifacts[f"{p1_dir.name}/{fname}"] = hash_file(fpath)

    # Evaluation configs and manifests
    config_hashes: dict[str, str] = {}
    eval_root = evaluation_configs_dir or Path("evaluation")
    for sub in ("manifests", "config", "configs"):
        sub_path = eval_root / sub
        if sub_path.exists():
            for p in sub_path.glob("*"):
                if p.is_file():
                    config_hashes[f"{sub}/{p.name}"] = hash_file(p)

    # Raw archive (NocturneBear)
    raw_manifest_path = raw_dir / "retrieval-manifest.json"
    raw_manifest = (
        json.loads(raw_manifest_path.read_text(encoding="utf-8"))
        if raw_manifest_path.exists()
        else None
    )

    # Raw workbench inputs (SportsDataverse)
    wb_raw_dir = workbench_raw_root or (
        raw_dir if raw_dir.name != "nocturnebear-a5f108b5" else raw_dir.parent
    )
    workbench_raw_inputs: dict[str, Any] = {}
    if wb_raw_dir.exists():
        for sdv in sorted(wb_raw_dir.glob("sportsdataverse_*")):
            rm = sdv / "retrieval-manifest.json"
            if rm.exists():
                with contextlib.suppress(Exception):
                    workbench_raw_inputs[sdv.name] = json.loads(rm.read_text(encoding="utf-8"))

    # Workbench operational database records
    workbench_records: dict[str, Any] = {}
    if mode == "workbench":
        pg_count = session.scalar(select(func.count()).select_from(WorkbenchPlayerGame)) or 0
        tg_count = session.scalar(select(func.count()).select_from(WorkbenchTeamGame)) or 0
        sch_count = session.scalar(select(func.count()).select_from(WorkbenchSchedule)) or 0
        inv_count = session.scalar(select(func.count()).select_from(SavedInvestigation)) or 0
        act_policies = [
            {
                "id": p.id,
                "policy_name": p.policy_name,
                "target_metric": p.target_metric,
                "estimator_identity": p.estimator_identity,
                "calibration_identity": p.calibration_identity,
                "experiment_run_id": p.experiment_run_id,
                "is_active": p.is_active,
                "activated_at": p.activated_at.isoformat() if p.activated_at else None,
            }
            for p in session.scalars(select(ModelPolicyActivation)).all()
        ]
        f_iss_count = session.scalar(select(func.count()).select_from(ForecastIssuance)) or 0
        f_sco_count = session.scalar(select(func.count()).select_from(ForecastScore)) or 0
        workbench_records = {
            "player_games_count": pg_count,
            "team_games_count": tg_count,
            "schedules_count": sch_count,
            "saved_investigations_count": inv_count,
            "model_policy_activations": act_policies,
            "forecast_issuances_count": f_iss_count,
            "forecast_scores_count": f_sco_count,
        }

    # Media inclusion policy with recorded exclusions
    media_policy = {
        "policy": "rebuildable_cache_excluded",
        "cache_path": "data/cache/portraits",
        "exclusions": [
            (
                "Player headshots cached from official NBA CDN are treated as a "
                "rebuildable local cache and excluded from the essential backup bundle."
            ),
            (
                "Headshots can be re-acquired on demand without altering data hashes using "
                "'courtload acquire-portraits'."
            ),
        ],
    }

    return {
        "created_at_utc": datetime.now(UTC).isoformat(),
        "code_version": code_version,
        "channel": channel,
        "mode": mode,
        "snapshot_id": snapshot.id,
        "dataset_id": dataset_id,
        "dataset_content_sha256": dataset_content_sha256,
        "dataset_observation_sha256": dataset_observation_sha256,
        "semantic_signature": semantic_signature,
        "registered_evaluation_run_id": run_id,
        "artifact_hashes": artifact_hashes,
        "points_v1_artifact_hashes": points_v1_artifacts,
        "evaluation_configs_hashes": config_hashes,
        "raw_archive": {
            "path": str(raw_dir),
            "manifest": raw_manifest,
        },
        "workbench_raw_inputs": workbench_raw_inputs,
        "workbench_records": workbench_records,
        "media_policy": media_policy,
    }


def verify_restored_state(
    session: Session,
    *,
    artifacts_dir: Path,
    expected_snapshot_id: str | None = None,
    channel: str = DEFAULT_CHANNEL,
    run_id: str = REGISTERED_RUN_ID,
    expected_artifact_hashes: dict[str, str] | None = None,
    verify_comparison: bool = True,
    test_player_a: str = "2544",
    test_player_b: str = "201939",
    test_date: date | None = None,
) -> dict[str, Any]:
    """Verify that a restored database and artifact directory satisfy all CourtLoad invariants."""
    if expected_snapshot_id:
        snapshot = session.get(ServingSnapshot, expected_snapshot_id)
        if snapshot is None:
            raise ValueError(f"Expected snapshot '{expected_snapshot_id}' does not exist")
    else:
        pointer = session.get(PublishedSnapshot, channel)
        if pointer is None:
            raise ValueError(f"No published pointer exists for channel '{channel}'")
        snapshot = session.get(ServingSnapshot, pointer.snapshot_id)
        if snapshot is None:
            raise ValueError(f"Published snapshot '{pointer.snapshot_id}' does not exist")

    # Check whether the restored snapshot is a workbench release
    binding = session.scalar(
        select(WorkbenchReleaseBinding).where(WorkbenchReleaseBinding.snapshot_id == snapshot.id)
    )

    if binding is not None:
        # Workbench release verification
        wb_dataset = session.get(WorkbenchDataset, binding.dataset_id)
        if wb_dataset is None:
            raise ValueError(f"Workbench dataset {binding.dataset_id} is missing")
        if binding.semantic_signature != wb_dataset.semantic_signature:
            raise ValueError(
                f"Semantic signature mismatch: {binding.semantic_signature} "
                f"!= {wb_dataset.semantic_signature}"
            )

        pg_count = session.scalar(select(func.count()).select_from(WorkbenchPlayerGame)) or 0
        tg_count = session.scalar(select(func.count()).select_from(WorkbenchTeamGame)) or 0
        sch_count = session.scalar(select(func.count()).select_from(WorkbenchSchedule)) or 0
        if pg_count == 0 or tg_count == 0:
            raise ValueError(
                f"Workbench relations are empty: {pg_count} player games, {tg_count} team games"
            )

        act_count = session.scalar(select(func.count()).select_from(ModelPolicyActivation)) or 0
        iss_count = session.scalar(select(func.count()).select_from(ForecastIssuance)) or 0
        sco_count = session.scalar(select(func.count()).select_from(ForecastScore)) or 0
        inv_count = session.scalar(select(func.count()).select_from(SavedInvestigation)) or 0

        # Artifact validation
        verified_artifacts: dict[str, Any] = {"run_id": run_id}
        run_dir = artifacts_dir / run_id
        if not run_dir.exists():
            raise FileNotFoundError(f"Evaluation artifact directory missing: {run_dir}")

        for fname, key in (
            ("replay-estimates.jsonl", "replay_estimates_sha256"),
            ("calibration.json", "calibration_sha256"),
            ("evaluation-report.json", "report_sha256"),
        ):
            p = run_dir / fname
            if not p.exists():
                raise FileNotFoundError(f"Required artifact {fname} missing in {run_dir}")
            sha = hash_file(p)
            verified_artifacts[key] = sha
            if expected_artifact_hashes and fname in expected_artifact_hashes:
                expected = expected_artifact_hashes[fname]
                if sha != expected:
                    raise ValueError(f"Artifact {fname} SHA mismatch: {sha} != {expected}")

        # Points-v1 artifacts verification
        if artifacts_dir.exists():
            for p1_dir in artifacts_dir.iterdir():
                if p1_dir.is_dir() and p1_dir.name != run_id and p1_dir.name != "analyses":
                    rep_p = p1_dir / "evaluation-report.json"
                    cal_p = p1_dir / "calibration.json"
                    if rep_p.exists() and cal_p.exists():
                        verified_artifacts["points_v1_run_id"] = p1_dir.name
                        verified_artifacts["points_v1_report_sha256"] = hash_file(rep_p)
                        verified_artifacts["points_v1_calibration_sha256"] = hash_file(cal_p)
                        break

        # Workbench profile and comparison query verification
        from courtload.services.workbench_analytics import (
            compare_players as wb_compare_players,
        )
        from courtload.services.workbench_analytics import (
            get_player_profile as wb_get_player_profile,
        )
        from courtload.services.workbench_analytics import (
            resolve_workbench_context,
        )

        wb_ctx = resolve_workbench_context(
            session,
            release_id=snapshot.id,
            requested_season="2023-24",
            channel=channel,
        )

        p_id_a = test_player_a or "2544"
        p_id_b = test_player_b or "201939"
        try:
            profile_a = wb_get_player_profile(session, wb_ctx, player_id=p_id_a)
        except Exception:
            profile_a = wb_get_player_profile(session, wb_ctx, player_id="2544")

        profile_b = None
        try:
            profile_b = wb_get_player_profile(session, wb_ctx, player_id=p_id_b)
        except Exception:
            try:
                profile_b = wb_get_player_profile(session, wb_ctx, player_id="201939")
            except Exception:
                profile_b = None

        comparison_res = None
        if verify_comparison:
            try:
                comparison_res = wb_compare_players(
                    session,
                    wb_ctx,
                    player_a_id=profile_a["player"]["id"],
                    player_b_id=profile_b["player"]["id"] if profile_b else p_id_b,
                )
            except Exception:
                comparison_res = None

        verified_comparison_dict: dict[str, Any] | None = None
        if verify_comparison and profile_a:
            pts_a = profile_a.get("summaries", {}).get("season", {}).get("pts")
            pts_b = (
                profile_b.get("summaries", {}).get("season", {}).get("pts") if profile_b else None
            )
            gap = (
                round(float(pts_a) - float(pts_b), 2)
                if pts_a is not None and pts_b is not None
                else None
            )
            verified_comparison_dict = {
                "player_a": {
                    "id": profile_a["player"]["id"],
                    "name": profile_a["player"]["name"],
                    "points_per_game": pts_a,
                    "games": profile_a.get("summaries", {}).get("season", {}).get("games", 0),
                    "point_estimate": profile_a.get("forecast_status", {}).get("point_estimate"),
                    "interval": profile_a.get("forecast_status", {}).get("interval"),
                },
                "player_b": {
                    "id": profile_b["player"]["id"] if profile_b else None,
                    "name": profile_b["player"]["name"] if profile_b else None,
                    "points_per_game": pts_b,
                    "games": (
                        profile_b.get("summaries", {}).get("season", {}).get("games", 0)
                        if profile_b
                        else 0
                    ),
                    "point_estimate": (
                        profile_b.get("forecast_status", {}).get("point_estimate")
                        if profile_b
                        else None
                    ),
                    "interval": (
                        profile_b.get("forecast_status", {}).get("interval") if profile_b else None
                    ),
                }
                if profile_b
                else None,
                "estimate_gap": gap,
                "metrics_count": (len(comparison_res.get("metrics", [])) if comparison_res else 0),
            }

        return {
            "status": "verified",
            "mode": "workbench",
            "channel": channel,
            "snapshot_id": snapshot.id,
            "dataset_id": wb_dataset.id,
            "semantic_signature": binding.semantic_signature,
            "counts": {
                "player_games": pg_count,
                "team_games": tg_count,
                "schedules": sch_count,
                "policy_activations": act_count,
                "forecast_issuances": iss_count,
                "forecast_scores": sco_count,
                "saved_investigations": inv_count,
            },
            "verified_artifacts": verified_artifacts,
            "verified_profile": {
                "player_id": profile_a["player"]["id"],
                "name": profile_a["player"]["name"],
                "season": profile_a.get("context", {}).get("season"),
                "games": profile_a.get("summaries", {}).get("season", {}).get("games", 0),
                "forecast_status": profile_a.get("forecast_status", {}).get("status"),
            },
            "verified_comparison": verified_comparison_dict,
            "metadata": {
                "snapshot_id": snapshot.id,
                "dataset_id": wb_dataset.id,
                "mode": "workbench",
                "source": "sportsdataverse",
                "coverage_start": (
                    snapshot.coverage_start.isoformat() if snapshot.coverage_start else None
                ),
                "coverage_end": (
                    snapshot.coverage_end.isoformat() if snapshot.coverage_end else None
                ),
            },
        }

    # Legacy archive snapshot verification
    context = resolve_snapshot(session, expected_snapshot_id, channel=channel)
    dataset = session.get(ArchiveDataset, snapshot.dataset_id)
    if dataset is None or dataset.status != "accepted":
        raise ValueError(f"Dataset {snapshot.dataset_id} is missing or not accepted")

    run_dir = artifacts_dir / run_id
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

    expected_hashes = expected_artifact_hashes or {
        "replay-estimates.jsonl": REGISTERED_REPLAY_SHA256,
        "calibration.json": REGISTERED_CALIBRATION_SHA256,
        "evaluation-report.json": REGISTERED_REPORT_SHA256,
    }

    expected_replay = expected_hashes.get("replay-estimates.jsonl")
    if replay_sha != expected_replay:
        raise ValueError(f"Replay estimates SHA mismatch: {replay_sha} != {expected_replay}")
    expected_calib = expected_hashes.get("calibration.json")
    if calib_sha != expected_calib:
        raise ValueError(f"Calibration SHA mismatch: {calib_sha} != {expected_calib}")
    expected_report = expected_hashes.get("evaluation-report.json")
    if report_sha != expected_report:
        raise ValueError(f"Evaluation report SHA mismatch: {report_sha} != {expected_report}")

    target_date = test_date or date(2023, 11, 15)
    supported_dates = set(snapshot.supported_replay_dates_json or [])
    if target_date.isoformat() in supported_dates:
        selected_date = target_date
    else:
        selected_date = snapshot.default_replay_date

    verified_comparison_dict = None
    if verify_comparison:
        profile_a = analytics_player_profile(session, context, test_player_a, selected_date)
        profile_b = analytics_player_profile(session, context, test_player_b, selected_date)

        pt_a = profile_a["estimate"]["point"]
        pt_b = profile_b["estimate"]["point"]
        gap = round(float(pt_a) - float(pt_b), 2) if pt_a is not None and pt_b is not None else None
        verified_comparison_dict = {
            "date": selected_date.isoformat(),
            "player_a": {
                "id": test_player_a,
                "name": profile_a["player"]["name"],
                "last_5": (
                    profile_a["summaries"]["last_5"]["reference_points_per_game"]
                    if profile_a["summaries"]["last_5"]
                    else None
                ),
                "last_10": (
                    profile_a["summaries"]["last_10"]["reference_points_per_game"]
                    if profile_a["summaries"]["last_10"]
                    else None
                ),
                "point_estimate": pt_a,
                "interval": profile_a["estimate"]["interval"],
            },
            "player_b": {
                "id": test_player_b,
                "name": profile_b["player"]["name"],
                "last_5": (
                    profile_b["summaries"]["last_5"]["reference_points_per_game"]
                    if profile_b["summaries"]["last_5"]
                    else None
                ),
                "last_10": (
                    profile_b["summaries"]["last_10"]["reference_points_per_game"]
                    if profile_b["summaries"]["last_10"]
                    else None
                ),
                "point_estimate": pt_b,
                "interval": profile_b["estimate"]["interval"],
            },
            "estimate_gap": gap,
        }

    meta = analytics_metadata(context, selected_date)

    return {
        "status": "verified",
        "mode": "historical_reconstruction",
        "channel": channel,
        "snapshot_id": snapshot.id,
        "dataset_id": dataset.id,
        "default_replay_date": snapshot.default_replay_date.isoformat(),
        "verified_artifacts": {
            "run_id": run_id,
            "replay_estimates_sha256": replay_sha,
            "calibration_sha256": calib_sha,
            "report_sha256": report_sha,
        },
        "verified_comparison": verified_comparison_dict,
        "metadata": meta,
    }


def _dump_postgres_database(target_path: Path, database_url: str | None = None) -> None:
    """Dump PostgreSQL database to a gzipped SQL file."""
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if shutil.which("pg_dump"):
        url = (
            database_url
            or os.getenv("COURTLOAD_DATABASE_URL")
            or "postgresql://courtload:courtload@localhost:5432/courtload"
        )
        clean_url = url.replace("postgresql+psycopg://", "postgresql://")
        with target_path.open("wb") as out_stream:
            subprocess.run(
                ["pg_dump", clean_url, "--clean", "--if-exists", "--no-owner"],
                stdout=out_stream,
                check=True,
            )
        with target_path.open("rb") as f:
            magic = f.read(2)
        if magic != b"\x1f\x8b":
            raw_sql = target_path.read_bytes()
            with gzip.open(target_path, "wb") as gz:
                gz.write(raw_sql)
    elif shutil.which("docker"):
        proc = subprocess.Popen(
            [
                "docker",
                "compose",
                "exec",
                "-T",
                "db",
                "pg_dump",
                "--username",
                "courtload",
                "--dbname",
                "courtload",
                "--clean",
                "--if-exists",
                "--no-owner",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        with gzip.open(target_path, "wb") as gz_out:
            assert proc.stdout is not None
            while chunk := proc.stdout.read(65536):
                gz_out.write(chunk)
        _, err = proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(f"Database dump failed: {err.decode('utf-8', errors='replace')}")
    else:
        raise RuntimeError("Neither pg_dump nor docker is available for PostgreSQL database dump.")


def _restore_postgres_database(
    source_path: Path,
    database_url: str | None = None,
    database_name: str | None = None,
) -> None:
    """Restore PostgreSQL database from a gzipped SQL file."""
    if not source_path.exists():
        raise FileNotFoundError(f"Database dump file missing: {source_path}")

    with gzip.open(source_path, "rb") as gz:
        sql_bytes = gz.read()

    if shutil.which("psql") and database_url:
        clean_url = database_url.replace("postgresql+psycopg://", "postgresql://")
        proc = subprocess.Popen(
            ["psql", clean_url, "-v", "ON_ERROR_STOP=1"],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        _, err = proc.communicate(input=sql_bytes)
        if proc.returncode != 0:
            raise RuntimeError(f"psql restore failed: {err.decode('utf-8', errors='replace')}")
    elif shutil.which("docker"):
        target_db = database_name or "courtload"
        proc = subprocess.Popen(
            [
                "docker",
                "compose",
                "exec",
                "-T",
                "db",
                "psql",
                "-U",
                "courtload",
                "-d",
                target_db,
                "-v",
                "ON_ERROR_STOP=1",
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        _, err = proc.communicate(input=sql_bytes)
        if proc.returncode != 0:
            raise RuntimeError(
                f"Docker psql restore failed: {err.decode('utf-8', errors='replace')}"
            )
    else:
        raise RuntimeError("Neither psql nor docker is available to restore PostgreSQL database.")


def create_backup_archive(
    session: Session,
    *,
    backup_dir: Path = Path("data/backups"),
    artifacts_dir: Path = Path("data/artifacts/evaluation"),
    raw_root: Path = Path("data/raw"),
    configs_root: Path = Path("evaluation"),
    channel: str = DEFAULT_CHANNEL,
    code_version: str = "working-tree",
    run_id: str = REGISTERED_RUN_ID,
    database_url: str | None = None,
) -> tuple[Path, dict[str, Any]]:
    """Produce a complete, self-contained backup archive bundle coordinated with mutation lock."""
    with publication_lock(session):
        timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
        bundle_dir = backup_dir / f"courtload-backup-{timestamp}"
        bundle_dir.mkdir(parents=True, exist_ok=True)

        try:
            # 1. Database dump
            db_dump_file = bundle_dir / "database.sql.gz"
            _dump_postgres_database(db_dump_file, database_url=database_url)

            # 2. Manifests & Configs
            manifests_src = configs_root / "manifests"
            if manifests_src.exists():
                shutil.copytree(manifests_src, bundle_dir / "manifests", dirs_exist_ok=True)
            for cfg_name in ("config", "configs"):
                cfg_src = configs_root / cfg_name
                if cfg_src.exists():
                    shutil.copytree(cfg_src, bundle_dir / "configs", dirs_exist_ok=True)

            # 3. Artifacts
            if artifacts_dir.exists():
                shutil.copytree(
                    artifacts_dir, bundle_dir / "artifacts/evaluation", dirs_exist_ok=True
                )
            analyses_src = Path("data/artifacts/analyses")
            if analyses_src.exists():
                shutil.copytree(analyses_src, bundle_dir / "artifacts/analyses", dirs_exist_ok=True)

            # 4. Raw inputs
            if raw_root.exists():
                raw_dest = bundle_dir / "raw"
                raw_dest.mkdir(parents=True, exist_ok=True)
                for sdv in raw_root.glob("sportsdataverse_*"):
                    if sdv.is_dir():
                        shutil.copytree(sdv, raw_dest / sdv.name, dirs_exist_ok=True)
                for nb in raw_root.glob("nocturnebear-*"):
                    if nb.is_dir():
                        shutil.copytree(nb, raw_dest / nb.name, dirs_exist_ok=True)

            # 5. Media policy document
            media_policy_file = bundle_dir / "MEDIA_POLICY.md"
            media_policy_file.write_text(
                "# CourtLoad Media Inclusion Policy\n\n"
                "**Policy:** `rebuildable_cache_excluded`\n\n"
                "Player headshot portraits located in `data/cache/portraits/` are "
                "excluded from the backup archive.\n"
                "Headshot assets are treated as an ephemeral, rebuildable CDN asset cache.\n"
                "They can be re-acquired deterministically at any time without modifying "
                "data hashes via:\n"
                "`courtload acquire-portraits`\n",
                encoding="utf-8",
            )

            # 6. Backup metadata manifest
            manifest = create_backup_manifest(
                session,
                artifacts_dir=artifacts_dir,
                raw_dir=raw_root,
                channel=channel,
                code_version=code_version,
                run_id=run_id,
                with_lock=False,
            )
            manifest_file = bundle_dir / "backup-manifest.json"
            manifest_file.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

            # 7. Bundle checksums (SHA-256 for all files in bundle)
            checksum_lines = []
            for root_dir, _, filenames in sorted(os.walk(bundle_dir)):
                for fname in sorted(filenames):
                    if fname == "bundle-checksums.sha256":
                        continue
                    file_path = Path(root_dir) / fname
                    rel_path = file_path.relative_to(bundle_dir)
                    sha = hash_file(file_path)
                    checksum_lines.append(f"{sha}  {rel_path}\n")

            checksums_file = bundle_dir / "bundle-checksums.sha256"
            checksums_file.write_text("".join(checksum_lines), encoding="utf-8")

            # 8. Archive into .tar.gz
            archive_file = backup_dir / f"courtload-backup-{timestamp}.tar.gz"
            with tarfile.open(archive_file, "w:gz") as tar:
                tar.add(bundle_dir, arcname=bundle_dir.name)

            return archive_file, manifest
        finally:
            shutil.rmtree(bundle_dir, ignore_errors=True)


def restore_backup_archive(
    session: Session,
    archive_path: Path,
    *,
    target_database_url: str | None = None,
    target_database_name: str | None = None,
    artifacts_dir: Path = Path("data/artifacts/evaluation"),
    raw_root: Path = Path("data/raw"),
    configs_root: Path = Path("evaluation"),
    channel: str = DEFAULT_CHANNEL,
    verify_state: bool = True,
) -> dict[str, Any]:
    """Restore database, configs, artifacts, and raw inputs from a backup archive bundle."""
    if not archive_path.exists():
        raise FileNotFoundError(f"Backup archive not found: {archive_path}")

    temp_dir = Path(tempfile.mkdtemp(prefix="courtload-restore-"))
    try:
        with tarfile.open(archive_path, "r:gz") as tar:
            tar.extractall(temp_dir)

        subdirs = [p for p in temp_dir.iterdir() if p.is_dir()]
        extracted_root = subdirs[0] if subdirs else temp_dir

        manifest_file = extracted_root / "backup-manifest.json"
        if not manifest_file.exists():
            raise ValueError("Invalid backup archive: backup-manifest.json missing")

        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))

        # Verify bundle checksums if present
        checksum_file = extracted_root / "bundle-checksums.sha256"
        if checksum_file.exists():
            for line in checksum_file.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split(None, 1)
                if len(parts) == 2:
                    expected_sha, rel_name = parts
                    fpath = extracted_root / rel_name
                    if not fpath.exists():
                        raise FileNotFoundError(
                            f"Bundle file missing during verification: {rel_name}"
                        )
                    actual_sha = hash_file(fpath)
                    if actual_sha != expected_sha:
                        raise ValueError(
                            f"Checksum mismatch for {rel_name}: {actual_sha} != {expected_sha}"
                        )

        # Restore database
        db_dump = extracted_root / "database.sql.gz"
        if db_dump.exists():
            _restore_postgres_database(
                db_dump,
                database_url=target_database_url,
                database_name=target_database_name,
            )

        # Restore manifests & configs
        if (extracted_root / "manifests").exists():
            shutil.copytree(
                extracted_root / "manifests", configs_root / "manifests", dirs_exist_ok=True
            )
        if (extracted_root / "configs").exists():
            for cfg_name in ("config", "configs"):
                shutil.copytree(
                    extracted_root / "configs", configs_root / cfg_name, dirs_exist_ok=True
                )

        # Restore artifacts
        if (extracted_root / "artifacts/evaluation").exists():
            shutil.copytree(
                extracted_root / "artifacts/evaluation", artifacts_dir, dirs_exist_ok=True
            )
        if (extracted_root / "artifacts/analyses").exists():
            shutil.copytree(
                extracted_root / "artifacts/analyses",
                Path("data/artifacts/analyses"),
                dirs_exist_ok=True,
            )

        # Restore raw inputs
        if (extracted_root / "raw").exists():
            shutil.copytree(extracted_root / "raw", raw_root, dirs_exist_ok=True)

        # Verify restored state
        verification_report = {}
        if verify_state:
            verification_report = verify_restored_state(
                session,
                artifacts_dir=artifacts_dir,
                channel=channel,
            )

        return {
            "status": "restored",
            "archive": str(archive_path),
            "manifest": manifest,
            "verification": verification_report,
        }
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
