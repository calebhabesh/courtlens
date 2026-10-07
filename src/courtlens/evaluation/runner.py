"""Dataset-bound M5 export, baseline prediction, calibration and reporting."""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import math
import os
import platform
import resource
import subprocess
import sys
import time
from bisect import bisect_left
from collections import Counter, defaultdict
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchiveDataset, ArchivePlayerGame, ArchiveTeamGame
from courtlens.evaluation.artifacts import json_bytes, jsonl_bytes, write_once
from courtlens.evaluation.baselines import available_history_mean, ewma, last_n_mean
from courtlens.evaluation.config import EvaluationConfig, canonical_json, config_hash
from courtlens.evaluation.features import PlayerGame, feature_hash, player_features
from courtlens.evaluation.metrics import (
    moving_block_difference_interval,
    regression_metrics,
    residual_quantile,
)
from courtlens.evaluation.splits import is_purged, split_for_target
from courtlens.services.publication import SCORING_VERSION
from courtlens.warehouse_models import (
    ServingOpponentContext,
    ServingPlayerProfile,
    ServingSnapshot,
)

EVALUATION_CODE_VERSION = "baseline-export-v1"
_STAGE_SPLITS = ("s1", "v1", "v2", "calibration")


def _reference_points(stats: dict[str, Any]) -> float | None:
    keys = ("points", "reboundsTotal", "assists", "steals", "blocks", "turnovers")
    if any(stats.get(key) is None for key in keys):
        return None
    return (
        float(stats["points"])
        + 1.2 * float(stats["reboundsTotal"])
        + 1.5 * float(stats["assists"])
        + 3.0 * float(stats["steals"])
        + 3.0 * float(stats["blocks"])
        - float(stats["turnovers"])
    )


def _optional_int(value: Any) -> int | None:
    return int(value) if value is not None else None


def _dataset_from_manifest(
    session: Session, manifest_path: Path, config: EvaluationConfig
) -> ArchiveDataset:
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    content_hash = str(manifest.get("content_sha256", ""))
    observation_hash = str(manifest.get("observation_sha256", ""))
    if (
        content_hash != config.dataset.content_sha256
        or observation_hash != config.dataset.observation_sha256
    ):
        raise ValueError("dataset manifest does not match the frozen evaluation config")
    dataset = session.scalar(
        select(ArchiveDataset).where(
            ArchiveDataset.content_sha256 == content_hash,
            ArchiveDataset.observation_sha256 == observation_hash,
            ArchiveDataset.status == "accepted",
        )
    )
    if dataset is None:
        raise ValueError("the frozen accepted dataset is not present in this database")
    if dataset.source_namespace != config.dataset.source_namespace:
        raise ValueError("dataset source namespace differs from the frozen contract")
    return dataset


def _snapshot(
    session: Session, dataset: ArchiveDataset, config: EvaluationConfig
) -> ServingSnapshot:
    snapshot = session.get(ServingSnapshot, config.snapshot_id)
    if snapshot is None or snapshot.dataset_id != dataset.id or snapshot.status != "ready":
        raise ValueError("the frozen ready snapshot is unavailable or bound to another dataset")
    if (
        snapshot.scoring_version != config.target.scoring_sha256
        or config.target.scoring_sha256 != SCORING_VERSION
    ):
        raise ValueError("snapshot, code and frozen target scoring hashes must agree")
    return snapshot


def _load_player_history(
    session: Session, dataset_id: str, maximum_date: date
) -> tuple[dict[tuple[str, str], list[PlayerGame]], dict[tuple[str, str], PlayerGame]]:
    statement = (
        select(
            ArchivePlayerGame.game_id,
            ArchivePlayerGame.player_id,
            ArchivePlayerGame.team_id,
            ArchivePlayerGame.opponent_id,
            ArchivePlayerGame.game_date,
            ArchivePlayerGame.season,
            ArchivePlayerGame.appearance,
            ArchivePlayerGame.minutes_seconds,
            ArchivePlayerGame.stats_json,
        )
        .where(
            ArchivePlayerGame.dataset_id == dataset_id,
            ArchivePlayerGame.game_date <= maximum_date,
        )
        .order_by(
            ArchivePlayerGame.season,
            ArchivePlayerGame.player_id,
            ArchivePlayerGame.game_date,
            ArchivePlayerGame.game_id,
        )
    )
    histories: dict[tuple[str, str], list[PlayerGame]] = defaultdict(list)
    outcomes: dict[tuple[str, str], PlayerGame] = {}
    for row in session.execute(statement).mappings():
        stats = dict(row["stats_json"])
        game = PlayerGame(
            game_id=str(row["game_id"]),
            player_id=str(row["player_id"]),
            team_id=str(row["team_id"]),
            opponent_id=str(row["opponent_id"]),
            game_date=row["game_date"],
            season=str(row["season"]),
            appearance=str(row["appearance"]),
            minutes_seconds=row["minutes_seconds"],
            reference_points=_reference_points(stats),
            field_goal_attempts=_optional_int(stats.get("fieldGoalsAttempted")),
            free_throw_attempts=_optional_int(stats.get("freeThrowsAttempted")),
        )
        histories[(game.season, game.player_id)].append(game)
        outcomes[(game.game_id, game.player_id)] = game
    return dict(histories), outcomes


def _load_team_games(
    session: Session, dataset_id: str, maximum_date: date
) -> tuple[dict[tuple[str, str], list[dict[str, Any]]], dict[tuple[str, str], dict[str, Any]]]:
    statement = (
        select(
            ArchiveTeamGame.game_id,
            ArchiveTeamGame.team_id,
            ArchiveTeamGame.opponent_id,
            ArchiveTeamGame.game_date,
            ArchiveTeamGame.season,
            ArchiveTeamGame.side,
        )
        .where(
            ArchiveTeamGame.dataset_id == dataset_id,
            ArchiveTeamGame.game_date <= maximum_date,
        )
        .order_by(ArchiveTeamGame.season, ArchiveTeamGame.team_id, ArchiveTeamGame.game_date)
    )
    schedules: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    by_game_team: dict[tuple[str, str], dict[str, Any]] = {}
    for row in session.execute(statement).mappings():
        game = dict(row)
        schedules[(str(row["season"]), str(row["team_id"]))].append(game)
        by_game_team[(str(row["game_id"]), str(row["team_id"]))] = game
    return dict(schedules), by_game_team


def _load_contexts(
    session: Session, snapshot_id: str, maximum_date: date
) -> dict[tuple[str, date], dict[str, Any]]:
    rows = session.execute(
        select(
            ServingOpponentContext.team_id,
            ServingOpponentContext.replay_date,
            ServingOpponentContext.eligible_games,
            ServingOpponentContext.context_json,
        ).where(
            ServingOpponentContext.snapshot_id == snapshot_id,
            ServingOpponentContext.replay_date <= maximum_date,
        )
    ).mappings()
    return {
        (str(row["team_id"]), row["replay_date"]): {
            **dict(row["context_json"]),
            "eligible_games": row["eligible_games"],
        }
        for row in rows
    }


def _candidate_id(dataset_hash: str, player_id: str, replay_date: date, target_game_id: str) -> str:
    value = f"{dataset_hash}:{player_id}:{replay_date.isoformat()}:{target_game_id}"
    return hashlib.sha256(value.encode()).hexdigest()


def _team_context(
    profile: dict[str, Any],
    schedules: dict[tuple[str, str], list[dict[str, Any]]],
    team_games: dict[tuple[str, str], dict[str, Any]],
    opponent_contexts: dict[tuple[str, date], dict[str, Any]],
) -> dict[str, Any]:
    target = team_games[(str(profile["target_game_id"]), str(profile["inferred_team_id"]))]
    schedule = schedules[(str(profile["season"]), str(profile["inferred_team_id"]))]
    target_index = next(
        index for index, game in enumerate(schedule) if game["game_id"] == profile["target_game_id"]
    )
    prior_team_game = schedule[target_index - 1] if target_index else None
    team_rest = (
        max(0, (target["game_date"] - prior_team_game["game_date"]).days - 1)
        if prior_team_game is not None
        else None
    )
    opponent = opponent_contexts.get(
        (str(profile["target_opponent_id"]), profile["replay_date"]), {}
    )
    side = str(target["side"]).lower()
    context_complete = all(
        opponent.get(key) is not None
        for key in (
            "points_allowed_per_game",
            "rebounds_allowed_per_game",
            "assists_allowed_per_game",
        )
    )
    raw_player_rest = (profile["replay_date"] - profile["last_observed_date"]).days
    return {
        "is_home": 1 if side in {"home", "h"} else 0,
        "days_since_last_appearance_capped_30": min(raw_player_rest, 30),
        "days_since_last_appearance_missing": 0,
        "team_rest_days_capped_30": min(team_rest, 30) if team_rest is not None else None,
        "team_rest_days_missing": int(team_rest is None),
        "back_to_back": int(team_rest == 0) if team_rest is not None else None,
        "opponent_points_allowed_last_10": opponent.get("points_allowed_per_game"),
        "opponent_points_allowed_valid_games": opponent.get("points_n", 0),
        "opponent_rebounds_allowed_last_10": opponent.get("rebounds_allowed_per_game"),
        "opponent_rebounds_allowed_valid_games": opponent.get("rebounds_n", 0),
        "opponent_assists_allowed_last_10": opponent.get("assists_allowed_per_game"),
        "opponent_assists_allowed_valid_games": opponent.get("assists_n", 0),
        "opponent_context_valid_games": opponent.get("eligible_games", 0),
        "opponent_context_missing": int(not context_complete),
    }


def _label(outcome: PlayerGame | None, predicted_team: str) -> tuple[str, float | None]:
    if outcome is None:
        return "unmatched_or_unknown", None
    if outcome.team_id != predicted_team:
        return "team_mismatch", None
    if outcome.appearance == "reported_nonappearance":
        return "explicit_nonappearance", None
    if outcome.appearance != "appeared":
        return "unknown_appearance", None
    if not outcome.minutes_seconds:
        return "unconfirmed_zero_minutes", None
    if outcome.reference_points is None:
        return "excluded_incomplete_label", None
    return "scored", outcome.reference_points


def _git_identity(root: Path) -> dict[str, Any]:
    def run(*arguments: str) -> bytes:
        return subprocess.run(["git", *arguments], cwd=root, check=True, capture_output=True).stdout

    try:
        revision = run("rev-parse", "HEAD").decode().strip()
        status = run("status", "--porcelain=v1", "-z")
        diff = run("diff", "--binary", "HEAD")
        untracked_paths = [
            Path(item.decode())
            for item in run("ls-files", "--others", "--exclude-standard", "-z").split(b"\0")
            if item
        ]
        untracked = bytearray()
        for relative_path in sorted(untracked_paths):
            absolute_path = root / relative_path
            if absolute_path.is_file():
                untracked.extend(str(relative_path).encode())
                untracked.extend(b"\0")
                untracked.extend(absolute_path.read_bytes())
                untracked.extend(b"\0")
        return {
            "revision": revision,
            "dirty": bool(status),
            "dirty_code_sha256": hashlib.sha256(
                status + b"\0" + diff + b"\0" + bytes(untracked)
            ).hexdigest(),
        }
    except (FileNotFoundError, subprocess.CalledProcessError):
        return {"revision": None, "dirty": None, "dirty_code_sha256": None}


def _environment() -> dict[str, Any]:
    packages: dict[str, str | None] = {}
    for name in ("courtlens", "SQLAlchemy", "pydantic", "PyYAML", "psycopg"):
        try:
            packages[name] = importlib.metadata.version(name)
        except importlib.metadata.PackageNotFoundError:
            packages[name] = None
    return {
        "python": sys.version,
        "platform": platform.platform(),
        "packages": packages,
        "thread_environment": {
            name: os.environ.get(name)
            for name in ("OMP_NUM_THREADS", "OPENBLAS_NUM_THREADS", "MKL_NUM_THREADS")
        },
    }


def _coverage_accounting(
    histories: dict[tuple[str, str], list[PlayerGame]],
    schedules: dict[tuple[str, str], list[dict[str, Any]]],
    profile_keys: set[tuple[str, str, date]],
    config: EvaluationConfig,
) -> dict[str, int]:
    counts: Counter[str] = Counter()
    for season in config.dataset.seasons[:2]:
        season_end = (
            config.splits["s1"].end
            if season == config.dataset.seasons[0]
            else config.splits["calibration"].end
        )
        replay_dates = sorted(
            {
                game["game_date"]
                for (game_season, _), games in schedules.items()
                if game_season == season
                for game in games
                if game["game_date"] <= season_end
            }
        )
        for (history_season, player_id), games in histories.items():
            if history_season != season:
                continue
            appeared = [game for game in games if game.appearance == "appeared"]
            appearance_dates = [game.game_date for game in appeared]
            for replay_date in replay_dates:
                counts["potential_player_cutoffs"] += 1
                prior_index = bisect_left(appearance_dates, replay_date) - 1
                if prior_index < 0:
                    counts["no_prior_team"] += 1
                    continue
                prior = appeared[prior_index]
                if (replay_date - prior.game_date).days > config.eligibility.team_association_days:
                    counts["stale_team_association"] += 1
                    continue
                schedule = schedules.get((season, prior.team_id), [])
                dates = [game["game_date"] for game in schedule]
                target_index = bisect_left(dates, replay_date)
                if target_index >= len(schedule) or dates[target_index] > replay_date + timedelta(
                    days=config.eligibility.target_horizon_days
                ):
                    counts["no_target_in_horizon"] += 1
                    continue
                counts["generated_candidates"] += 1
                if (season, player_id, replay_date) not in profile_keys:
                    counts["candidate_mart_mismatch"] += 1
    return dict(sorted(counts.items()))


def _slice_values(row: dict[str, Any]) -> dict[str, str]:
    minutes = row["last_10_minutes_mean"]
    if minutes is None:
        minutes_slice = "unknown"
    elif minutes < 15:
        minutes_slice = "under_15"
    elif minutes < 28:
        minutes_slice = "15_to_under_28"
    else:
        minutes_slice = "28_plus"

    history_count = int(row["history_count"])
    history_slice = (
        "10_to_19" if history_count < 20 else "20_to_39" if history_count < 40 else "40_plus"
    )
    days_since = row["days_since_last_appearance_capped_30"]
    if days_since is None:
        rest_slice = "unknown"
    elif days_since <= 1:
        rest_slice = "0_to_1"
    elif days_since <= 3:
        rest_slice = "2_to_3"
    else:
        rest_slice = "4_plus"

    lead_days = int(row["lead_days"])
    lead_slice = "0" if lead_days == 0 else "1_to_3" if lead_days <= 3 else "4_to_6"
    return {
        "prior_minutes": minutes_slice,
        "prior_history": history_slice,
        "days_since_appearance": rest_slice,
        "lead_days_slice": lead_slice,
        "opponent_context": "missing" if row["opponent_context_missing"] else "complete",
    }


def _slice_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for dimension in (
        "prior_minutes",
        "prior_history",
        "days_since_appearance",
        "lead_days_slice",
        "opponent_context",
        "split",
    ):
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            groups[str(row[dimension])].append(row)
        result[dimension] = {
            value: {
                estimator: regression_metrics(group, estimator)
                for estimator in ("last_10", "ewma_20_hl5")
            }
            for value, group in sorted(groups.items())
        }
    return result


def run_baseline_evaluation(
    session: Session,
    *,
    config: EvaluationConfig,
    config_path: Path,
    dataset_manifest: Path,
    output_root: Path,
) -> dict[str, Any]:
    """Run M5 through calibration while deliberately leaving S3 unopened."""
    started = time.perf_counter()
    dataset = _dataset_from_manifest(session, dataset_manifest, config)
    snapshot = _snapshot(session, dataset, config)
    maximum_date = config.splits["calibration"].end
    histories, outcomes = _load_player_history(session, dataset.id, maximum_date)
    schedules, team_games = _load_team_games(session, dataset.id, maximum_date)
    opponent_contexts = _load_contexts(session, snapshot.id, maximum_date)

    profile_statement: Select[Any] = (
        select(
            ServingPlayerProfile.player_id,
            ServingPlayerProfile.season,
            ServingPlayerProfile.replay_date,
            ServingPlayerProfile.cutoff_utc,
            ServingPlayerProfile.inferred_team_id,
            ServingPlayerProfile.last_observed_date,
            ServingPlayerProfile.target_game_id,
            ServingPlayerProfile.target_game_date,
            ServingPlayerProfile.target_opponent_id,
            ServingPlayerProfile.lead_days,
        )
        .where(
            ServingPlayerProfile.snapshot_id == snapshot.id,
            ServingPlayerProfile.target_game_date <= maximum_date,
        )
        .order_by(
            ServingPlayerProfile.target_game_date,
            ServingPlayerProfile.target_game_id,
            ServingPlayerProfile.player_id,
            ServingPlayerProfile.replay_date,
        )
    )

    feature_rows: list[dict[str, Any]] = []
    label_rows: list[dict[str, Any]] = []
    prediction_rows: list[dict[str, Any]] = []
    metric_rows: list[dict[str, Any]] = []
    profile_keys: set[tuple[str, str, date]] = set()
    predicted_player_games: set[tuple[str, str]] = set()
    counts: Counter[str] = Counter()

    for result in session.execute(profile_statement).mappings().yield_per(5000):
        profile = dict(result)
        season = str(profile["season"])
        player_id = str(profile["player_id"])
        split_name = split_for_target(config, season, profile["target_game_date"])
        if split_name not in _STAGE_SPLITS:
            continue
        profile_keys.add((season, player_id, profile["replay_date"]))
        counts["candidate_rows"] += 1
        if is_purged(config, split_name, profile["replay_date"]):
            counts[f"purged_{split_name}"] += 1
            continue
        history = histories.get((season, player_id), [])
        player_input, prior_points = player_features(history, profile["replay_date"])
        history_count = len(prior_points)
        if history_count < config.eligibility.fallback_min_history:
            cohort = "insufficient_history"
            counts["insufficient_history"] += 1
        elif history_count < config.eligibility.core_min_history:
            cohort = "limited_history_baseline"
            counts["fallback_rows"] += 1
        else:
            cohort = "core"
            counts["core_eligible_rows"] += 1

        candidate_id = _candidate_id(
            dataset.content_sha256,
            player_id,
            profile["replay_date"],
            str(profile["target_game_id"]),
        )
        last_10_prediction = last_n_mean(prior_points, window=config.baselines["last_10"].window)
        ewma_contract = config.baselines["ewma_20_hl5"]
        if ewma_contract.half_life_appearances is None:
            raise ValueError("EWMA half-life is required by the frozen config")
        ewma_prediction = (
            ewma(
                prior_points,
                window=ewma_contract.window,
                half_life=float(ewma_contract.half_life_appearances),
            )
            if history_count >= config.eligibility.core_min_history
            else None
        )
        fallback_prediction = available_history_mean(
            prior_points,
            minimum=config.eligibility.fallback_min_history,
            maximum=config.eligibility.core_min_history - 1,
        )
        if cohort != "limited_history_baseline":
            fallback_prediction = None

        membership = {
            "candidate_id": candidate_id,
            "split": split_name,
            "player_id": player_id,
            "season": season,
            "replay_date": profile["replay_date"],
            "cutoff_utc": profile["cutoff_utc"],
            "target_game_id": str(profile["target_game_id"]),
            "target_game_date": profile["target_game_date"],
            "predicted_team_id": str(profile["inferred_team_id"]),
            "target_opponent_id": str(profile["target_opponent_id"]),
            "lead_days": int(profile["lead_days"]),
            "history_count": history_count,
            "cohort": cohort,
        }
        if cohort == "core":
            inputs = {
                **membership,
                **player_input,
                **_team_context(profile, schedules, team_games, opponent_contexts),
            }
            hashed_inputs = {key: value for key, value in inputs.items() if key != "candidate_id"}
            feature_rows.append({**inputs, "feature_hash": feature_hash(hashed_inputs)})

        outcome = outcomes.get((str(profile["target_game_id"]), player_id))
        label_status, actual = _label(outcome, str(profile["inferred_team_id"]))
        counts[f"label_{label_status}"] += 1
        label_rows.append(
            {
                "candidate_id": candidate_id,
                "label_status": label_status,
                "actual_reference_points": actual,
            }
        )
        predictions = {
            **membership,
            "last_10": last_10_prediction,
            "ewma_20_hl5": ewma_prediction,
            "limited_history_baseline": fallback_prediction,
        }
        prediction_rows.append(predictions)
        if label_status == "scored":
            predicted_player_games.add((player_id, str(profile["target_game_id"])))
        if cohort == "core":
            metric_input = {**predictions, "actual": actual, "label_status": label_status}
            metric_input.update(_slice_values(inputs))
            metric_rows.append(metric_input)

    coverage = _coverage_accounting(histories, schedules, profile_keys, config)
    valid_outcomes = {
        (game.player_id, game.game_id)
        for game in outcomes.values()
        if game.is_valid_history
        and split_for_target(config, game.season, game.game_date) in _STAGE_SPLITS
    }
    counts["observed_appearances_without_candidate"] = len(valid_outcomes - predicted_player_games)
    counts["unique_target_games"] = len({row["target_game_id"] for row in prediction_rows})
    counts["unique_player_games"] = len(
        {(row["player_id"], row["target_game_id"]) for row in prediction_rows}
    )
    counts["players"] = len({row["player_id"] for row in prediction_rows})
    for required_count in (
        "label_scored",
        "label_explicit_nonappearance",
        "label_unmatched_or_unknown",
        "label_team_mismatch",
        "label_excluded_incomplete_label",
        "label_unknown_appearance",
        "label_unconfirmed_zero_minutes",
        "purged_s1",
        "purged_v1",
        "purged_v2",
        "purged_calibration",
    ):
        counts.setdefault(required_count, 0)
    for required_coverage in (
        "potential_player_cutoffs",
        "no_prior_team",
        "stale_team_association",
        "no_target_in_horizon",
        "generated_candidates",
        "candidate_mart_mismatch",
    ):
        coverage.setdefault(required_coverage, 0)

    metrics: dict[str, Any] = {"folds": {}, "pooled_validation": {}}
    validation_by_fold: dict[str, list[dict[str, Any]]] = {}
    for split_name in ("v1", "v2", "calibration"):
        split_rows = [row for row in metric_rows if row["split"] == split_name]
        metrics["folds"][split_name] = {
            estimator: regression_metrics(split_rows, estimator)
            for estimator in ("last_10", "ewma_20_hl5")
        }
        if split_name in {"v1", "v2"}:
            validation_by_fold[split_name] = split_rows
    pooled_validation = [row for rows in validation_by_fold.values() for row in rows]
    for estimator in ("last_10", "ewma_20_hl5"):
        metrics["pooled_validation"][estimator] = regression_metrics(pooled_validation, estimator)
    metrics["prespecified_slices"] = _slice_metrics(pooled_validation)
    winner = min(
        config.validation_selection.tie_break_order,
        key=lambda name: (
            metrics["pooled_validation"][name]["mae"]
            if metrics["pooled_validation"][name]["mae"] is not None
            else math.inf,
            config.validation_selection.tie_break_order.index(name),
        ),
    )
    ranges = {name: (config.splits[name].start, config.splits[name].end) for name in ("v1", "v2")}
    metrics["paired_uncertainty"] = moving_block_difference_interval(
        validation_by_fold,
        left_key="ewma_20_hl5",
        right_key="last_10",
        ranges=ranges,
        replicates=config.uncertainty.bootstrap_replicates,
        block_days=config.uncertainty.moving_block_calendar_days,
        seed=config.uncertainty.seed,
    )
    calibration_rows = [row for row in metric_rows if row["split"] == "calibration"]
    calibration = {
        estimator: residual_quantile(calibration_rows, estimator, config.intervals.nominal_coverage)
        for estimator in ("last_10", "ewma_20_hl5")
    }
    for artifact in calibration.values():
        artifact["available"] = (
            artifact["rows"] >= config.intervals.minimum_rows
            and artifact["target_dates"] >= config.intervals.minimum_target_dates
        )

    feature_rows.sort(key=lambda row: row["candidate_id"])
    label_rows.sort(key=lambda row: row["candidate_id"])
    prediction_rows.sort(key=lambda row: row["candidate_id"])
    membership_hash = hashlib.sha256(
        canonical_json([row["candidate_id"] for row in prediction_rows]).encode()
    ).hexdigest()
    feature_set_hash = hashlib.sha256(
        canonical_json([row["feature_hash"] for row in feature_rows]).encode()
    ).hexdigest()
    prediction_hash = hashlib.sha256(jsonl_bytes(prediction_rows)).hexdigest()
    label_hash = hashlib.sha256(jsonl_bytes(label_rows)).hexdigest()
    evaluation_hash = hashlib.sha256(
        canonical_json(
            {
                "metrics": metrics,
                "calibration": calibration,
                "counts": dict(sorted(counts.items())),
                "coverage": coverage,
            }
        ).encode()
    ).hexdigest()
    git_identity = _git_identity(Path(__file__).resolve().parents[3])
    stable_run_material = {
        "config_hash": config_hash(config),
        "dataset_content_sha256": dataset.content_sha256,
        "snapshot_id": snapshot.id,
        "membership_hash": membership_hash,
        "feature_set_hash": feature_set_hash,
        "prediction_hash": prediction_hash,
        "label_hash": label_hash,
        "evaluation_hash": evaluation_hash,
        "code_version": EVALUATION_CODE_VERSION,
    }
    run_id = hashlib.sha256(canonical_json(stable_run_material).encode()).hexdigest()[:20]
    run_dir = output_root / run_id

    selection = {
        "status": "frozen_before_final_test",
        "selected_baseline": winner,
        "selection_metric": "pooled V1/V2 MAE",
        "validation_metrics": metrics["pooled_validation"],
        "challenger_grid": config.challenger.model_dump(mode="json"),
        "calibration_policy": config.intervals.model_dump(mode="json"),
        "promotion_gates": config.promotion.model_dump(mode="json"),
        "s3": {
            "start": config.splits["s3"].start,
            "end": config.splits["s3"].end,
            "status": "sealed_not_read_by_m5",
        },
    }
    split_manifest: dict[str, Any] = {
        name: config.splits[name].model_dump(mode="json")
        for name in ("s1", "v1", "v2", "calibration", "s3")
    }
    split_manifest["membership_sha256"] = membership_hash
    split_manifest["purging_rule"] = "cutoff_date >= target block start"
    exclusions = {"candidate_and_label_counts": dict(sorted(counts.items())), "coverage": coverage}
    report = _markdown_report(
        run_id, dataset, snapshot, metrics, calibration, selection, exclusions
    )

    artifacts: dict[str, str] = {}
    artifact_payloads = {
        "config.json": json_bytes(config.model_dump(mode="json")),
        "dataset-manifest.json": json_bytes(
            json.loads(dataset_manifest.read_text(encoding="utf-8"))
        ),
        "features.jsonl": jsonl_bytes(feature_rows),
        "labels.jsonl": jsonl_bytes(label_rows),
        "predictions.jsonl": jsonl_bytes(prediction_rows),
        "split-manifest.json": json_bytes(split_manifest),
        "exclusions.json": json_bytes(exclusions),
        "metrics.json": json_bytes(metrics),
        "calibration.json": json_bytes(calibration),
        "selection.json": json_bytes(selection),
        "environment.json": json_bytes(_environment()),
        "baseline-report.md": report.encode(),
    }
    for filename, payload in artifact_payloads.items():
        artifacts[filename] = write_once(run_dir / filename, payload)

    elapsed = time.perf_counter() - started
    runtime = {
        "elapsed_seconds": elapsed,
        "peak_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
        "cpu_threads": config.runtime.cpu_threads,
    }
    run_manifest = {
        "run_id": run_id,
        "stage": "validation_and_calibration",
        "dataset_id": dataset.id,
        "snapshot_id": snapshot.id,
        "stable_identity": stable_run_material,
        "git": git_identity,
        "runtime": runtime,
        "artifacts": artifacts,
        "final_test_opened": False,
    }
    run_manifest_path = run_dir / "run-manifest.json"
    reused_identical_artifacts = run_manifest_path.exists()
    if not reused_identical_artifacts:
        write_once(run_manifest_path, json_bytes(run_manifest))
    return {
        "run_id": run_id,
        "artifact_directory": str(run_dir),
        "selected_baseline": winner,
        "pooled_validation": metrics["pooled_validation"],
        "counts": dict(sorted(counts.items())),
        "membership_sha256": membership_hash,
        "feature_set_sha256": feature_set_hash,
        "prediction_sha256": prediction_hash,
        "label_sha256": label_hash,
        "evaluation_sha256": evaluation_hash,
        "final_test_opened": False,
        "elapsed_seconds": elapsed,
        "reused_identical_artifacts": reused_identical_artifacts,
    }


def _markdown_report(
    run_id: str,
    dataset: ArchiveDataset,
    snapshot: ServingSnapshot,
    metrics: dict[str, Any],
    calibration: dict[str, Any],
    selection: dict[str, Any],
    exclusions: dict[str, Any],
) -> str:
    lines = [
        "# Frozen rolling-baseline evaluation",
        "",
        f"Run `{run_id}` binds dataset `{dataset.content_sha256}` to snapshot `{snapshot.id}`.",
        "This M5 run used S1/S2 only; S3 outcomes remained sealed.",
        "",
        "| Fold | Estimator | MAE | RMSE | Rows | Player-games |",
        "| --- | --- | ---: | ---: | ---: | ---: |",
    ]
    for fold in ("v1", "v2"):
        for estimator in ("last_10", "ewma_20_hl5"):
            item = metrics["folds"][fold][estimator]
            lines.append(
                f"| {fold.upper()} | {estimator} | {item['mae']:.4f} | {item['rmse']:.4f} | "
                f"{item['forecast_rows']} | {item['unique_player_games']} |"
            )
    lines.extend(
        [
            "",
            f"Validation selected `{selection['selected_baseline']}` by pooled V1/V2 MAE. "
            "This selection is frozen before final testing.",
            "",
            "Calibration artifacts: " + canonical_json(calibration),
            "",
            "Candidate/exclusion accounting: "
            + canonical_json(exclusions["candidate_and_label_counts"]),
            "",
            "The archive is revised historical reconstruction; this run does not establish "
            "real-time source availability or player appearance probability.",
        ]
    )
    return "\n".join(lines) + "\n"
