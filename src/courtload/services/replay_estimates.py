"""Read immutable M6 S3 replay estimates without fitting at request time."""

from __future__ import annotations

import hashlib
import json
import os
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtload.archive_models import ArchiveDataset
from courtload.evaluation.baselines import available_history_mean
from courtload.evaluation.config import load_config
from courtload.warehouse_models import ServingPlayerGame, ServingPlayerProfile, ServingSnapshot

RUN_ID = "6f7af9e63f27aada910d"
PROJECT_ROOT = Path(os.environ.get("COURTLOAD_PROJECT_ROOT", Path.cwd())).resolve()
RUN_DIR = PROJECT_ROOT / "data/artifacts/evaluation" / RUN_ID
CONFIG_PATH = PROJECT_ROOT / "evaluation/config/baseline-v1.yaml"
EXPECTED_REPLAY_SHA256 = "7c635f46abfd8df5e4045dfd2fa24ef993a8fa6e992475f45ef5603ce65bcb2f"
EXPECTED_CALIBRATION_SHA256 = "510e50fd351c7f3f3d3fe21e277294acb35bd19296acaeafe0df00d315f239b6"


@lru_cache(maxsize=1)
def _registered_replay() -> tuple[dict[tuple[str, str, str], dict[str, Any]], float]:
    manifest = json.loads((RUN_DIR / "run-manifest.json").read_text())
    if manifest["run_id"] != RUN_ID or manifest["final_test_opened"] is not True:
        raise ValueError("incomplete M6 run")
    replay_bytes = (RUN_DIR / "replay-estimates.jsonl").read_bytes()
    calibration_bytes = (RUN_DIR / "calibration.json").read_bytes()
    for name, payload, registered_hash in (
        ("replay-estimates.jsonl", replay_bytes, EXPECTED_REPLAY_SHA256),
        ("calibration.json", calibration_bytes, EXPECTED_CALIBRATION_SHA256),
    ):
        actual = hashlib.sha256(payload).hexdigest()
        if actual != registered_hash or manifest["artifacts"][name] != registered_hash:
            raise ValueError(f"M6 artifact hash mismatch: {name}")
    calibration = json.loads(calibration_bytes)["ewma_20_hl5"]
    if calibration["available"] is not True:
        raise ValueError("EWMA calibration is unavailable")
    rows = (json.loads(line) for line in replay_bytes.splitlines() if line)
    by_key = {
        (
            row["player_id"],
            row["target_game_id"],
            datetime.fromisoformat(row["cutoff_utc"]).date().isoformat(),
        ): row
        for row in rows
    }
    return by_key, float(calibration["absolute_residual_quantile"])


def profile_estimate(
    session: Session, row: ServingPlayerProfile, snapshot: ServingSnapshot
) -> dict[str, Any]:
    """Return a bounded historical estimate or an explicit cutoff reason."""
    history = list(
        session.scalars(
            select(ServingPlayerGame)
            .where(
                ServingPlayerGame.snapshot_id == snapshot.id,
                ServingPlayerGame.player_id == row.player_id,
                ServingPlayerGame.season == row.season,
                ServingPlayerGame.game_date < row.replay_date,
                ServingPlayerGame.appearance == "appeared",
                ServingPlayerGame.reference_points.is_not(None),
                ServingPlayerGame.minutes_seconds > 0,
            )
            .order_by(ServingPlayerGame.game_date.desc(), ServingPlayerGame.game_id.desc())
            .limit(20)
        )
    )
    count = int(
        session.scalar(
            select(func.count())
            .select_from(ServingPlayerGame)
            .where(
                ServingPlayerGame.snapshot_id == snapshot.id,
                ServingPlayerGame.player_id == row.player_id,
                ServingPlayerGame.season == row.season,
                ServingPlayerGame.game_date < row.replay_date,
                ServingPlayerGame.appearance == "appeared",
                ServingPlayerGame.reference_points.is_not(None),
                ServingPlayerGame.minutes_seconds > 0,
            )
        )
        or 0
    )
    base: dict[str, Any] = {
        "history_n": count,
        "point": None,
        "interval": None,
        "target_game_id": row.target_game_id,
        "target_date": row.target_game_date.isoformat(),
        "lead_days": row.lead_days,
        "evaluation_url": "/evaluation",
    }
    if count < 5:
        return {**base, "status": "insufficient_history"}
    if count < 10:
        values = [
            float(game.reference_points)
            for game in reversed(history)
            if game.reference_points is not None
        ]
        return {
            **base,
            "status": "limited_history_baseline",
            "point": available_history_mean(values, minimum=5, maximum=9),
            "estimator": "available_history_mean",
            "prediction_mode": "historical_reconstruction",
        }
    try:
        config = load_config(CONFIG_PATH)
    except (OSError, ValueError):
        return {**base, "status": "artifact_not_available_for_cutoff"}
    dataset = session.get(ArchiveDataset, snapshot.dataset_id)
    from courtload.services.workbench_registry import check_snapshot_equivalence

    is_equiv = check_snapshot_equivalence(
        session,
        local_snapshot_id=snapshot.id,
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
        or snapshot.scoring_version != config.target.scoring_sha256
        or row.replay_date < config.splits["s3"].start
    ):
        return {**base, "status": "artifact_not_available_for_cutoff"}
    try:
        rows, half_width = _registered_replay()
    except (OSError, KeyError, ValueError, json.JSONDecodeError):
        return {**base, "status": "artifact_not_available_for_cutoff"}
    candidate = rows.get((row.player_id, row.target_game_id, row.replay_date.isoformat()))
    if candidate is None or candidate["primary_estimator"] != "ewma_20_hl5":
        return {**base, "status": "artifact_not_available_for_cutoff"}
    if not (
        date.fromisoformat(candidate["fit_end"]) < row.replay_date
        and date.fromisoformat(candidate["calibration_end"]) < row.replay_date
        and date.fromisoformat(candidate["selection_cutoff"]) <= row.replay_date
    ):
        return {**base, "status": "artifact_not_available_for_cutoff"}
    point = float(candidate["primary_prediction"])
    return {
        **base,
        "status": "available",
        "point": point,
        "interval": {
            "lower": point - half_width,
            "upper": point + half_width,
            "nominal_coverage": 0.8,
        },
        "estimator": "ewma_20_hl5",
        "prediction_mode": candidate["prediction_mode"],
        "fit_end": candidate["fit_end"],
        "calibration_end": candidate["calibration_end"],
        "run_id": RUN_ID,
    }
