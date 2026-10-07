"""Frozen M6 challenger selection, single final-test opening and model card."""

from __future__ import annotations

import hashlib
import importlib.metadata
import json
import math
import resource
import time
from collections import Counter, defaultdict
from collections.abc import Iterable
from pathlib import Path
from typing import Any, cast

from sklearn.ensemble import HistGradientBoostingRegressor  # type: ignore[import-untyped]
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from courtlens.evaluation.artifacts import json_bytes, jsonl_bytes, write_once
from courtlens.evaluation.baselines import available_history_mean, ewma, last_n_mean
from courtlens.evaluation.config import EvaluationConfig, canonical_json, config_hash
from courtlens.evaluation.features import feature_hash, player_features
from courtlens.evaluation.metrics import (
    moving_block_difference_interval,
    regression_metrics,
    residual_quantile,
)
from courtlens.evaluation.runner import (
    _candidate_id,
    _dataset_from_manifest,
    _environment,
    _git_identity,
    _label,
    _load_contexts,
    _load_player_history,
    _load_team_games,
    _slice_values,
    _snapshot,
    _team_context,
)
from courtlens.evaluation.splits import is_purged, split_for_target
from courtlens.warehouse_models import ServingPlayerProfile

M6_CODE_VERSION = "challenger-final-v1"
VARIANTS = ("player_only", "player_plus_context")
PLAYER_FEATURES = (
    "last_5_reference_mean",
    "last_10_reference_mean",
    "last_10_reference_stddev",
    "valid_history_count_capped_50",
    "last_5_minutes_mean",
    "last_10_minutes_mean",
    "last_10_minutes_stddev",
    "last_10_fga_mean",
    "last_10_fta_mean",
    "last_10_reference_per_minute",
    "lead_days",
)
CONTEXT_FEATURES = (
    "is_home",
    "days_since_last_appearance_capped_30",
    "days_since_last_appearance_missing",
    "team_rest_days_capped_30",
    "team_rest_days_missing",
    "back_to_back",
    "opponent_points_allowed_last_10",
    "opponent_points_allowed_valid_games",
    "opponent_rebounds_allowed_last_10",
    "opponent_rebounds_allowed_valid_games",
    "opponent_assists_allowed_last_10",
    "opponent_assists_allowed_valid_games",
    "opponent_context_valid_games",
    "opponent_context_missing",
)


def feature_names(variant: str) -> tuple[str, ...]:
    if variant == "player_only":
        return PLAYER_FEATURES
    if variant == "player_plus_context":
        return PLAYER_FEATURES + CONTEXT_FEATURES
    raise ValueError(f"unknown challenger variant: {variant}")


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def _verified_baseline_artifacts(run_dir: Path) -> dict[str, Any]:
    manifest = _read_json(run_dir / "run-manifest.json")
    if (
        manifest.get("stage") != "validation_and_calibration"
        or manifest.get("final_test_opened") is not False
    ):
        raise ValueError("M6 requires a sealed M5 validation/calibration run")
    for filename, expected in manifest["artifacts"].items():
        actual = hashlib.sha256((run_dir / filename).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"baseline artifact hash mismatch: {filename}")
    return cast(dict[str, Any], manifest)


def _joined_rows(run_dir: Path) -> list[dict[str, Any]]:
    labels = {row["candidate_id"]: row for row in _read_jsonl(run_dir / "labels.jsonl")}
    predictions = {row["candidate_id"]: row for row in _read_jsonl(run_dir / "predictions.jsonl")}
    rows: list[dict[str, Any]] = []
    for feature in _read_jsonl(run_dir / "features.jsonl"):
        candidate_id = feature["candidate_id"]
        label = labels[candidate_id]
        prediction = predictions[candidate_id]
        row = {
            **feature,
            "actual": label["actual_reference_points"],
            "label_status": label["label_status"],
            "last_10": prediction["last_10"],
            "ewma_20_hl5": prediction["ewma_20_hl5"],
        }
        row.update(_slice_values(row))
        rows.append(row)
    return rows


def _matrix(rows: Iterable[dict[str, Any]], variant: str) -> list[list[float]]:
    names = feature_names(variant)
    return [
        [math.nan if row.get(name) is None else float(row[name]) for name in names] for row in rows
    ]


def _model(config: EvaluationConfig, *, leaves: int, l2: float) -> HistGradientBoostingRegressor:
    """Serialize every sklearn 1.6 parameter rather than relying on changing defaults."""
    return HistGradientBoostingRegressor(
        loss="squared_error",
        quantile=None,
        learning_rate=config.challenger.learning_rate,
        max_iter=config.challenger.max_iter,
        max_leaf_nodes=leaves,
        max_depth=None,
        min_samples_leaf=20,
        l2_regularization=l2,
        max_features=1.0,
        max_bins=255,
        categorical_features="from_dtype",
        monotonic_cst=None,
        interaction_cst=None,
        warm_start=False,
        early_stopping=config.challenger.early_stopping,
        scoring="loss",
        validation_fraction=0.1,
        n_iter_no_change=10,
        tol=1e-7,
        verbose=0,
        random_state=config.challenger.random_seed,
    )


def _config_id(leaves: int, l2: float) -> str:
    return f"leaf_{leaves}__l2_{int(l2)}"


def _fit_predict(
    config: EvaluationConfig,
    variant: str,
    train_rows: list[dict[str, Any]],
    predict_rows: list[dict[str, Any]],
    leaves: int,
    l2: float,
) -> tuple[HistGradientBoostingRegressor, list[float]]:
    scored = [row for row in train_rows if row.get("actual") is not None]
    model = _model(config, leaves=leaves, l2=l2)
    model.fit(_matrix(scored, variant), [float(row["actual"]) for row in scored])
    return model, [float(value) for value in model.predict(_matrix(predict_rows, variant))]


def _validation_selection(
    rows: list[dict[str, Any]], config: EvaluationConfig
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    prediction_rows: list[dict[str, Any]] = []
    metrics: dict[str, Any] = {}
    for variant in VARIANTS:
        variant_metrics: dict[str, Any] = {}
        for leaves in config.challenger.max_leaf_nodes:
            for l2 in config.challenger.l2_regularization:
                candidate = _config_id(leaves, l2)
                fold_rows: dict[str, list[dict[str, Any]]] = {}
                for fold, train_splits in (("v1", {"s1"}), ("v2", {"s1", "v1"})):
                    training = [row for row in rows if row["split"] in train_splits]
                    predicted = [row for row in rows if row["split"] == fold]
                    _, values = _fit_predict(
                        config, variant, training, predicted, leaves, float(l2)
                    )
                    evaluated: list[dict[str, Any]] = []
                    for source, value in zip(predicted, values, strict=True):
                        output = {
                            "candidate_id": source["candidate_id"],
                            "variant": variant,
                            "config_id": candidate,
                            "split": fold,
                            "prediction": value,
                        }
                        prediction_rows.append(output)
                        evaluated.append({**source, "challenger": value})
                    fold_rows[fold] = evaluated
                pooled = fold_rows["v1"] + fold_rows["v2"]
                variant_metrics[candidate] = {
                    "parameters": {"max_leaf_nodes": leaves, "l2_regularization": float(l2)},
                    "folds": {
                        fold: regression_metrics(items, "challenger")
                        for fold, items in fold_rows.items()
                    },
                    "pooled": regression_metrics(pooled, "challenger"),
                }
        selected_id = min(
            variant_metrics,
            key=lambda item: (
                variant_metrics[item]["pooled"]["mae"],
                variant_metrics[item]["parameters"]["max_leaf_nodes"],
                -variant_metrics[item]["parameters"]["l2_regularization"],
                item,
            ),
        )
        metrics[variant] = {"configs": variant_metrics, "selected_config": selected_id}
    finalist = min(
        VARIANTS,
        key=lambda variant: (
            metrics[variant]["configs"][metrics[variant]["selected_config"]]["pooled"]["mae"],
            VARIANTS.index(variant),
        ),
    )
    return {"variants": metrics, "challenger_finalist": finalist}, prediction_rows


def _export_s3(
    session: Session,
    config: EvaluationConfig,
    dataset_manifest: Path,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], dict[str, int]]:
    """This is the only M6 database boundary that reads S3 player outcomes."""
    dataset = _dataset_from_manifest(session, dataset_manifest, config)
    snapshot = _snapshot(session, dataset, config)
    maximum_date = config.splits["s3"].end
    histories, outcomes = _load_player_history(session, dataset.id, maximum_date)
    schedules, team_games = _load_team_games(session, dataset.id, maximum_date)
    contexts = _load_contexts(session, snapshot.id, maximum_date)
    s3 = config.splits["s3"]
    statement: Select[Any] = (
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
            ServingPlayerProfile.target_game_date >= s3.start,
            ServingPlayerProfile.target_game_date <= s3.end,
        )
        .order_by(
            ServingPlayerProfile.target_game_date,
            ServingPlayerProfile.target_game_id,
            ServingPlayerProfile.player_id,
            ServingPlayerProfile.replay_date,
        )
    )
    features: list[dict[str, Any]] = []
    labels: list[dict[str, Any]] = []
    baselines: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()
    for result in session.execute(statement).mappings().yield_per(5000):
        profile = dict(result)
        split = split_for_target(config, str(profile["season"]), profile["target_game_date"])
        if split != "s3":
            continue
        counts["candidate_rows"] += 1
        if is_purged(config, split, profile["replay_date"]):
            counts["purged_s3"] += 1
            continue
        player_id = str(profile["player_id"])
        history = histories.get((str(profile["season"]), player_id), [])
        player_input, prior_points = player_features(history, profile["replay_date"])
        history_count = len(prior_points)
        cohort = (
            "insufficient_history"
            if history_count < config.eligibility.fallback_min_history
            else "limited_history_baseline"
            if history_count < config.eligibility.core_min_history
            else "core"
        )
        counts[f"{cohort}_rows"] += 1
        candidate_id = _candidate_id(
            dataset.content_sha256,
            player_id,
            profile["replay_date"],
            str(profile["target_game_id"]),
        )
        membership = {
            "candidate_id": candidate_id,
            "split": "s3",
            "player_id": player_id,
            "season": str(profile["season"]),
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
                **_team_context(profile, schedules, team_games, contexts),
            }
            hashed = {key: value for key, value in inputs.items() if key != "candidate_id"}
            features.append({**inputs, "feature_hash": feature_hash(hashed)})
        last_10_prediction = last_n_mean(prior_points, window=config.baselines["last_10"].window)
        ewma_contract = config.baselines["ewma_20_hl5"]
        ewma_prediction = (
            ewma(
                prior_points,
                window=ewma_contract.window,
                half_life=float(ewma_contract.half_life_appearances or 0),
            )
            if cohort == "core"
            else None
        )
        fallback = available_history_mean(
            prior_points,
            minimum=config.eligibility.fallback_min_history,
            maximum=config.eligibility.core_min_history - 1,
        )
        baselines.append(
            {
                **membership,
                "last_10": last_10_prediction,
                "ewma_20_hl5": ewma_prediction,
                "limited_history_baseline": fallback,
            }
        )
        outcome = outcomes.get((str(profile["target_game_id"]), player_id))
        label_status, actual = _label(outcome, str(profile["inferred_team_id"]))
        counts[f"label_{label_status}"] += 1
        labels.append(
            {
                "candidate_id": candidate_id,
                "label_status": label_status,
                "actual_reference_points": actual,
            }
        )
    for rows in (features, labels, baselines):
        rows.sort(key=lambda row: row["candidate_id"])
    return features, labels, baselines, dict(sorted(counts.items()))


def _interval_metrics(
    rows: list[dict[str, Any]], prediction_key: str, calibration: dict[str, Any]
) -> dict[str, Any]:
    quantile = (
        calibration.get("absolute_residual_quantile") if calibration.get("available") else None
    )
    paired = [
        row for row in rows if row.get("actual") is not None and row.get(prediction_key) is not None
    ]
    if quantile is None or not paired:
        return {"available": False, "rows": len(paired), "coverage": None, "mean_width": None}
    covered = sum(
        abs(float(row[prediction_key]) - float(row["actual"])) <= float(quantile) for row in paired
    )
    return {
        "available": True,
        "rows": len(paired),
        "coverage": covered / len(paired),
        "mean_width": 2 * float(quantile),
    }


def _slice_report(
    rows: list[dict[str, Any]], estimators: tuple[str, ...], calibrations: dict[str, Any]
) -> dict[str, Any]:
    report: dict[str, Any] = {}
    for dimension in (
        "prior_minutes",
        "prior_history",
        "days_since_appearance",
        "lead_days_slice",
        "opponent_context",
    ):
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            groups[str(row[dimension])].append(row)
        report[dimension] = {
            value: {
                estimator: {
                    **regression_metrics(group, estimator),
                    "interval": _interval_metrics(group, estimator, calibrations[estimator]),
                }
                for estimator in estimators
            }
            for value, group in sorted(groups.items())
        }
    return report


def _promotion(
    config: EvaluationConfig,
    baseline: str,
    finalist: str,
    validation: dict[str, Any],
    final_metrics: dict[str, Any],
    uncertainty: dict[str, Any],
    slices: dict[str, Any],
    intervals: dict[str, Any],
) -> dict[str, Any]:
    selected = validation["variants"][finalist]
    challenger_validation = selected["configs"][selected["selected_config"]]
    baseline_validation = validation["baseline_validation"]
    pooled_improvement = (
        baseline_validation["pooled"]["mae"] - challenger_validation["pooled"]["mae"]
    ) / baseline_validation["pooled"]["mae"]
    fold_improvements = {
        fold: baseline_validation["folds"][fold]["mae"]
        - challenger_validation["folds"][fold]["mae"]
        for fold in ("v1", "v2")
    }
    gate1 = pooled_improvement >= config.promotion.validation_min_relative_mae_improvement and all(
        value > 0 for value in fold_improvements.values()
    )
    delta = final_metrics[finalist]["mae"] - final_metrics[baseline]["mae"]
    gate2 = delta < 0 and uncertainty["upper"] is not None and uncertainty["upper"] < 0
    supported: list[dict[str, Any]] = []
    regressions: list[dict[str, Any]] = []
    for dimension, values in slices.items():
        for value, estimator_metrics in values.items():
            base = estimator_metrics[baseline]
            challenge = estimator_metrics[finalist]
            is_supported = (
                base["forecast_rows"] >= config.promotion.supported_slice_min_rows
                and base["unique_player_games"] >= config.promotion.supported_slice_min_player_games
                and base["target_dates"] >= config.promotion.supported_slice_min_target_dates
            )
            relative = (challenge["mae"] - base["mae"]) / base["mae"] if base["mae"] else None
            item = {
                "dimension": dimension,
                "value": value,
                "supported": is_supported,
                "relative_mae_regression": relative,
            }
            if is_supported:
                supported.append(item)
                if (
                    relative is None
                    or relative > config.promotion.maximum_supported_slice_relative_mae_regression
                ):
                    regressions.append(item)
    gate3 = not regressions
    challenger_interval = intervals[finalist]
    baseline_interval = intervals[baseline]
    width_ratio = (
        challenger_interval["mean_width"] / baseline_interval["mean_width"]
        if challenger_interval["mean_width"] is not None
        and baseline_interval["mean_width"] not in (None, 0)
        else None
    )
    gate4 = (
        challenger_interval["coverage"] is not None
        and challenger_interval["coverage"] >= config.promotion.final_min_interval_coverage
        and width_ratio is not None
        and width_ratio <= config.promotion.final_max_interval_width_ratio
    )
    gates = {
        "validation_improvement": {
            "passed": gate1,
            "pooled_relative_improvement": pooled_improvement,
            "fold_absolute_improvements": fold_improvements,
        },
        "final_paired_superiority": {"passed": gate2, "mae_difference": delta, **uncertainty},
        "supported_slices": {
            "passed": gate3,
            "supported": supported,
            "regressions_over_limit": regressions,
        },
        "interval_guardrails": {
            "passed": gate4,
            "challenger_coverage": challenger_interval["coverage"],
            "width_ratio": width_ratio,
        },
    }
    return {
        "decision": "promote"
        if all(item["passed"] for item in gates.values())
        else "do_not_promote",
        "gates": gates,
    }


def run_final_evaluation(
    session: Session,
    *,
    config: EvaluationConfig,
    config_path: Path,
    dataset_manifest: Path,
    output_root: Path,
    baseline_run_id: str,
    open_final_test: bool,
) -> dict[str, Any]:
    """Select on M5 artifacts, register, then cross the S3 query boundary exactly once."""
    if not open_final_test:
        raise ValueError("refusing to open S3 without --open-final-test")
    started = time.perf_counter()
    baseline_dir = output_root / baseline_run_id
    baseline_manifest = _verified_baseline_artifacts(baseline_dir)
    if baseline_manifest["stable_identity"]["config_hash"] != config_hash(config):
        raise ValueError("baseline run uses a different frozen configuration")
    historical_rows = _joined_rows(baseline_dir)
    validation, validation_predictions = _validation_selection(historical_rows, config)
    baseline = _read_json(baseline_dir / "selection.json")["selected_baseline"]
    baseline_metrics = _read_json(baseline_dir / "metrics.json")
    validation["baseline"] = baseline
    validation["baseline_validation"] = {
        "folds": {fold: baseline_metrics["folds"][fold][baseline] for fold in ("v1", "v2")},
        "pooled": baseline_metrics["pooled_validation"][baseline],
    }
    validation_hash = hashlib.sha256(jsonl_bytes(validation_predictions)).hexdigest()
    registration = {
        "status": "registered_before_s3_open",
        "baseline_run_id": baseline_run_id,
        "selected_baseline": baseline,
        "challenger_finalist": validation["challenger_finalist"],
        "selected_configs": {
            variant: validation["variants"][variant]["selected_config"] for variant in VARIANTS
        },
        "all_validation_results": validation,
        "validation_prediction_sha256": validation_hash,
        "promotion_gates": config.promotion.model_dump(mode="json"),
        "calibration_policy": config.intervals.model_dump(mode="json"),
        "s3_boundary": config.splits["s3"].model_dump(mode="json"),
    }
    run_id = hashlib.sha256(
        canonical_json(
            {
                "code_version": M6_CODE_VERSION,
                "config_hash": config_hash(config),
                "baseline_run_id": baseline_run_id,
                "registration": registration,
                "sklearn": importlib.metadata.version("scikit-learn"),
            }
        ).encode()
    ).hexdigest()[:20]
    run_dir = output_root / run_id
    completed_path = run_dir / "run-manifest.json"
    if completed_path.exists():
        completed = _read_json(completed_path)
        if completed.get("run_id") != run_id or not completed.get("final_test_opened"):
            raise ValueError("existing final run manifest is invalid")
        for filename, expected in completed["artifacts"].items():
            if hashlib.sha256((run_dir / filename).read_bytes()).hexdigest() != expected:
                raise ValueError(f"final artifact hash mismatch: {filename}")
        existing = _read_json(run_dir / "evaluation-report.json")
        return {
            "run_id": run_id,
            "artifact_directory": str(run_dir),
            "selected_baseline": baseline,
            "challenger_finalist": validation["challenger_finalist"],
            "selected_configs": registration["selected_configs"],
            "final_metrics": existing["final_test"]["metrics"],
            "promotion": existing["promotion"],
            "final_test_opened": True,
            "reused_identical_artifacts": True,
        }
    registration_path = run_dir / "preopen-registration.json"
    write_once(registration_path, json_bytes(registration))

    # Nothing above this line queries S3. The following call is the deliberate one-time opening.
    s3_features, s3_labels, s3_baselines, s3_counts = _export_s3(session, config, dataset_manifest)
    labels = {row["candidate_id"]: row for row in s3_labels}
    baselines = {row["candidate_id"]: row for row in s3_baselines}
    s3_rows: list[dict[str, Any]] = []
    for feature in s3_features:
        label = labels[feature["candidate_id"]]
        row = {
            **feature,
            "actual": label["actual_reference_points"],
            "label_status": label["label_status"],
            "last_10": baselines[feature["candidate_id"]]["last_10"],
            "ewma_20_hl5": baselines[feature["candidate_id"]]["ewma_20_hl5"],
        }
        row.update(_slice_values(row))
        s3_rows.append(row)

    training = [row for row in historical_rows if row["split"] in {"s1", "v1", "v2"}]
    calibration_rows = [row for row in historical_rows if row["split"] == "calibration"]
    final_predictions: list[dict[str, Any]] = []
    for variant in VARIANTS:
        selected_id = validation["variants"][variant]["selected_config"]
        params = validation["variants"][variant]["configs"][selected_id]["parameters"]
        model, calibration_values = _fit_predict(
            config,
            variant,
            training,
            calibration_rows,
            int(params["max_leaf_nodes"]),
            float(params["l2_regularization"]),
        )
        s3_values = [float(value) for value in model.predict(_matrix(s3_rows, variant))]
        for row, value in zip(calibration_rows, calibration_values, strict=True):
            row[variant] = value
        for row, value in zip(s3_rows, s3_values, strict=True):
            row[variant] = value
            final_predictions.append(
                {
                    "candidate_id": row["candidate_id"],
                    "variant": variant,
                    "config_id": selected_id,
                    "prediction": value,
                }
            )

    calibration = _read_json(baseline_dir / "calibration.json")
    for variant in VARIANTS:
        artifact = residual_quantile(calibration_rows, variant, config.intervals.nominal_coverage)
        artifact["available"] = (
            artifact["rows"] >= config.intervals.minimum_rows
            and artifact["target_dates"] >= config.intervals.minimum_target_dates
        )
        calibration[variant] = artifact
    estimators = (baseline, *VARIANTS)
    final_metrics = {name: regression_metrics(s3_rows, name) for name in estimators}
    intervals = {name: _interval_metrics(s3_rows, name, calibration[name]) for name in estimators}
    slices = _slice_report(s3_rows, estimators, calibration)
    finalist = validation["challenger_finalist"]
    uncertainty = moving_block_difference_interval(
        {"s3": s3_rows},
        left_key=finalist,
        right_key=baseline,
        ranges={"s3": (config.splits["s3"].start, config.splits["s3"].end)},
        replicates=config.uncertainty.bootstrap_replicates,
        block_days=config.uncertainty.moving_block_calendar_days,
        seed=config.uncertainty.seed,
    )
    promotion = _promotion(
        config, baseline, finalist, validation, final_metrics, uncertainty, slices, intervals
    )
    report = {
        "run_id": run_id,
        "baseline_run_id": baseline_run_id,
        "task": "conditional next-team-game reference-points estimation",
        "validation": validation,
        "final_test": {
            "split": config.splits["s3"].model_dump(mode="json"),
            "metrics": final_metrics,
            "paired_uncertainty": uncertainty,
            "intervals": intervals,
            "prespecified_slices": slices,
            "counts": s3_counts,
        },
        "calibration": calibration,
        "promotion": promotion,
        "serving_policy": {
            "historical_s3_primary": baseline,
            "challenger_is_serving": False,
            "promotion_means_future_eligibility_only": True,
        },
        "limitations": [
            "Revised historical archive; original observation-time fidelity is unavailable.",
            "Teams and target games are reconstructed from recent observed appearances.",
            "The target is conditional on confirmed appearance and does not predict availability.",
        ],
    }
    replay = [
        {
            "candidate_id": row["candidate_id"],
            "cutoff_utc": row["cutoff_utc"],
            "target_game_id": row["target_game_id"],
            "player_id": row["player_id"],
            "primary_estimator": baseline,
            "primary_prediction": row[baseline],
            "challenger_finalist": finalist,
            "challenger_prediction": row[finalist],
            "fit_end": config.splits["v2"].end,
            "calibration_end": config.splits["calibration"].end,
            "selection_cutoff": config.splits["s3"].start,
            "prediction_mode": "out_of_time_historical_reconstruction",
            "promotion_decision": promotion["decision"],
        }
        for row in s3_rows
    ]
    model_card = _model_card(report, config, s3_rows)
    payloads = {
        "validation-predictions.jsonl": jsonl_bytes(validation_predictions),
        "s3-features.jsonl": jsonl_bytes(s3_features),
        "s3-labels.jsonl": jsonl_bytes(s3_labels),
        "s3-baselines.jsonl": jsonl_bytes(s3_baselines),
        "final-predictions.jsonl": jsonl_bytes(final_predictions),
        "calibration.json": json_bytes(calibration),
        "evaluation-report.json": json_bytes(report),
        "replay-estimates.jsonl": jsonl_bytes(replay),
        "model-card.md": model_card.encode(),
    }
    artifacts = {name: write_once(run_dir / name, payload) for name, payload in payloads.items()}
    artifacts["preopen-registration.json"] = hashlib.sha256(
        registration_path.read_bytes()
    ).hexdigest()
    elapsed = time.perf_counter() - started
    run_manifest = {
        "run_id": run_id,
        "stage": "challenger_and_final_test",
        "baseline_run_id": baseline_run_id,
        "final_test_opened": True,
        "s3_opened_after_registration_sha256": artifacts["preopen-registration.json"],
        "code_version": M6_CODE_VERSION,
        "git": _git_identity(Path(__file__).resolve().parents[3]),
        "environment": _environment(),
        "runtime": {
            "elapsed_seconds": elapsed,
            "peak_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            "cpu_threads": config.runtime.cpu_threads,
        },
        "artifacts": dict(sorted(artifacts.items())),
    }
    write_once(run_dir / "run-manifest.json", json_bytes(run_manifest))
    return {
        "run_id": run_id,
        "artifact_directory": str(run_dir),
        "selected_baseline": baseline,
        "challenger_finalist": finalist,
        "selected_configs": registration["selected_configs"],
        "final_metrics": final_metrics,
        "promotion": promotion,
        "final_test_opened": True,
        "elapsed_seconds": elapsed,
    }


def _model_card(
    report: dict[str, Any], config: EvaluationConfig, rows: list[dict[str, Any]]
) -> str:
    validation = report["validation"]
    final = report["final_test"]
    baseline = validation["baseline"]
    finalist = validation["challenger_finalist"]
    lines = [
        "# CourtLens model card: frozen next-game evaluation",
        "",
        f"Run `{report['run_id']}`. Decision: **{report['promotion']['decision']}**. "
        "The historical "
        f"application remains `{baseline}`-led; the challenger is not currently serving.",
        "",
        "## Task and data",
        "",
        "Estimate reference fantasy points for the next reconstructed team game, conditional on a "
        "confirmed appearance. Nonappearances, incomplete labels, unknown outcomes and "
        "inferred-team "
        "mismatches are unscored rather than assigned zero.",
        "",
        f"Source: `{config.dataset.source_namespace}`; content SHA-256 "
        f"`{config.dataset.content_sha256}`. This is revised historical reconstruction "
        "with inferred "
        "rosters, not evidence of what was known in real time.",
        "",
        "## Splits and methods",
        "",
        "| Split | Dates | Purpose |",
        "| --- | --- | --- |",
    ]
    for name in ("s1", "v1", "v2", "calibration", "s3"):
        split = config.splits[name]
        lines.append(f"| {name.upper()} | {split.start} to {split.end} | {split.role} |")
    lines.extend(
        [
            "",
            "Baselines are last-10 mean and EWMA-20 with five-appearance half-life. "
            "Both challenger variants use HistGradientBoostingRegressor with the frozen "
            "four-cell leaf/L2 grid; the player-plus-context variant adds home, rest and "
            "prior opponent-allowance inputs. Models "
            "never include player ID, target minutes, target outcomes or future team totals.",
            "",
            "## Selection and final test",
            "",
            "| Estimator | V1/V2 MAE | S3 MAE | S3 RMSE | Rows | Interval coverage | Width |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ]
    )
    for estimator in (baseline, *VARIANTS):
        if estimator == baseline:
            validation_metric = validation["baseline_validation"]["pooled"]
        else:
            item = validation["variants"][estimator]
            validation_metric = item["configs"][item["selected_config"]]["pooled"]
        metric = final["metrics"][estimator]
        interval = final["intervals"][estimator]
        lines.append(
            f"| {estimator} | {validation_metric['mae']:.4f} | {metric['mae']:.4f} | "
            f"{metric['rmse']:.4f} | {metric['forecast_rows']} | "
            f"{interval['coverage']:.3f} | {interval['mean_width']:.4f} |"
        )
    lines.extend(
        [
            "",
            f"The validation-selected challenger finalist was `{finalist}`. Paired seven-day "
            f"calendar-block uncertainty for challenger MAE minus baseline MAE was "
            f"`[{final['paired_uncertainty']['lower']:.4f}, "
            f"{final['paired_uncertainty']['upper']:.4f}]`.",
            "",
            "## Promotion gates",
            "",
        ]
    )
    for name, gate in report["promotion"]["gates"].items():
        lines.append(f"- {name}: {'PASS' if gate['passed'] else 'FAIL'}")
    lines.extend(
        [
            "",
            "All prespecified slice metrics and counts are in `evaluation-report.json`; undersized "
            "slices are marked inconclusive for promotion. S3 predictions were generated "
            "only after "
            "the validation winner, configurations, calibration policy and gates were written to "
            "`preopen-registration.json`.",
            "",
            "## Serving, limitations and future work",
            "",
            f"S3 replay estimates continue to use `{baseline}` as primary. Promotion, if "
            "earned, only permits a later prospective policy; it does not rewrite history. "
            "Intervals are empirical and do not guarantee nominal coverage. The experiment "
            "does not model availability, and "
            "archive revisions and inferred teams limit claims about real forward performance.",
            "",
            f"Unscored/candidate accounting: `{canonical_json(final['counts'])}`.",
            "",
            "Future work should be driven by the emitted error slices, then evaluated on "
            "genuinely new "
            "prospective data without retuning S3.",
            "",
            "Reproduce (identical frozen artifacts are reused):",
            "",
            "```text",
            "OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 MKL_NUM_THREADS=1 \\",
            "courtlens evaluate-final \\",
            f"  --baseline-run {report['baseline_run_id']} --open-final-test",
            "```",
            "",
        ]
    )
    return "\n".join(lines)
