"""Staged points-v1 forecasting experiment runner, calibration, and model card generation."""

from __future__ import annotations

import hashlib
import json
import math
import resource
import time
from collections import defaultdict
from datetime import date
from pathlib import Path
from typing import Any

from sklearn.ensemble import HistGradientBoostingRegressor  # type: ignore[import-untyped]
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtload.evaluation.artifacts import json_bytes, jsonl_bytes, write_once
from courtload.evaluation.config import canonical_json
from courtload.evaluation.metrics import (
    moving_block_difference_interval,
    regression_metrics,
    residual_quantile,
)
from courtload.evaluation.points_config import (
    PointsConfig,
    points_config_hash,
)
from courtload.evaluation.points_data import (
    build_points_candidates,
    load_points_dataset,
)
from courtload.evaluation.points_features import (
    POINTS_FEATURE_VARIANTS,
)
from courtload.evaluation.runner import _environment, _git_identity
from courtload.models import utc_now
from courtload.workbench_models import ModelPolicyActivation

POINTS_CODE_VERSION = "points-experiment-v1"
CHALLENGER_VARIANTS = ("player_only", "player_plus_context")


def _read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def _read_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line]


def _feature_matrix(
    rows: list[dict[str, Any]], feature_names: tuple[str, ...]
) -> list[list[float]]:
    matrix: list[list[float]] = []
    for r in rows:
        row_vals: list[float] = []
        for name in feature_names:
            v = r.get(name)
            row_vals.append(math.nan if v is None else float(v))
        matrix.append(row_vals)
    return matrix


def _hgbr_model(config: PointsConfig, *, leaves: int, l2: float) -> HistGradientBoostingRegressor:
    """Create pinned scikit-learn 1.6 HistGradientBoostingRegressor."""
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


def _fit_predict_hgbr(
    config: PointsConfig,
    feature_names: tuple[str, ...],
    train_rows: list[dict[str, Any]],
    predict_rows: list[dict[str, Any]],
    leaves: int,
    l2: float,
) -> tuple[HistGradientBoostingRegressor, list[float]]:
    scored_train = [r for r in train_rows if r.get("actual") is not None]
    x_train = _feature_matrix(scored_train, feature_names)
    y_train = [float(r["actual"]) for r in scored_train]

    model = _hgbr_model(config, leaves=leaves, l2=l2)
    model.fit(x_train, y_train)

    raw_preds = model.predict(_feature_matrix(predict_rows, feature_names))
    # Declared PTS postprocessing rule: clip point predictions at zero
    clipped = [max(0.0, float(v)) for v in raw_preds]
    return model, clipped


def _compute_points_slice_report(
    rows: list[dict[str, Any]],
    estimators: tuple[str, ...],
) -> dict[str, Any]:
    report: dict[str, Any] = {}
    dimensions = (
        "current_appearances_slice",
        "prior_season_eligibility",
        "prior_minutes_slice",
        "team_rest_slice",
        "lead_days_slice",
        "opponent_context_slice",
        "season_slice",
        "team_changed_slice",
    )
    for dim in dimensions:
        groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for r in rows:
            val = str(r.get(dim, "unknown"))
            groups[val].append(r)
        report[dim] = {
            val: {est: regression_metrics(grp, est) for est in estimators}
            for val, grp in sorted(groups.items())
        }
    return report


def evaluate_promotion_gates(
    config: PointsConfig,
    baseline_name: str,
    finalist_name: str,
    validation_results: dict[str, Any],
    final_metrics: dict[str, Any],
    uncertainty: dict[str, Any],
    slices: dict[str, Any],
    intervals: dict[str, Any],
) -> dict[str, Any]:
    """Evaluate the 4 points-v1 promotion gates frozen before Block F opening."""
    b_val = validation_results["baseline_validation"]
    c_val = validation_results["finalist_validation"]

    base_pooled_mae = b_val["pooled"][baseline_name]["mae"]
    chal_pooled_mae = c_val["pooled"]["mae"]
    pooled_improvement = (base_pooled_mae - chal_pooled_mae) / base_pooled_mae
    v1_imp = b_val["folds"]["v1"][baseline_name]["mae"] - c_val["folds"]["v1"]["mae"]
    v2_imp = b_val["folds"]["v2"][baseline_name]["mae"] - c_val["folds"]["v2"]["mae"]
    gate1 = (
        pooled_improvement >= config.promotion.validation_min_relative_mae_improvement
        and v1_imp > 0
        and v2_imp > 0
    )

    f_diff = final_metrics[finalist_name]["mae"] - final_metrics[baseline_name]["mae"]
    gate2 = f_diff < 0 and uncertainty.get("upper") is not None and uncertainty["upper"] < 0

    supported_slices: list[dict[str, Any]] = []
    regressions: list[dict[str, Any]] = []
    for dim, values in slices.items():
        for val, est_metrics in values.items():
            b_m = est_metrics[baseline_name]
            c_m = est_metrics[finalist_name]
            is_supported = (
                b_m["forecast_rows"] >= config.promotion.supported_slice_min_rows
                and b_m["unique_player_games"] >= config.promotion.supported_slice_min_player_games
                and b_m["target_dates"] >= config.promotion.supported_slice_min_target_dates
            )
            rel_reg = (c_m["mae"] - b_m["mae"]) / b_m["mae"] if b_m["mae"] else None
            item = {
                "dimension": dim,
                "value": val,
                "supported": is_supported,
                "relative_mae_regression": rel_reg,
            }
            if is_supported:
                supported_slices.append(item)
                if (
                    rel_reg is None
                    or rel_reg > config.promotion.maximum_supported_slice_relative_mae_regression
                ):
                    regressions.append(item)
    gate3 = len(regressions) == 0

    core_chal = intervals[finalist_name]["core"]
    core_base = intervals[baseline_name]["core"]
    w_ratio = (
        core_chal["mean_width"] / core_base["mean_width"]
        if core_chal.get("mean_width") and core_base.get("mean_width")
        else None
    )
    gate4 = (
        core_chal.get("coverage") is not None
        and core_chal["coverage"] >= config.promotion.final_min_interval_coverage
        and w_ratio is not None
        and w_ratio <= config.promotion.final_max_interval_width_ratio
    )

    all_passed = gate1 and gate2 and gate3 and gate4
    decision = "promote" if all_passed else "do_not_promote"

    return {
        "decision": decision,
        "gates": {
            "validation_improvement": {
                "passed": gate1,
                "pooled_relative_improvement": pooled_improvement,
                "fold_differences": {"v1": v1_imp, "v2": v2_imp},
            },
            "final_paired_superiority": {
                "passed": gate2,
                "mae_difference": f_diff,
                **uncertainty,
            },
            "supported_slices": {
                "passed": gate3,
                "supported_count": len(supported_slices),
                "regressions_over_limit": regressions,
            },
            "interval_guardrails": {
                "passed": gate4,
                "challenger_coverage": core_chal.get("coverage"),
                "width_ratio": w_ratio,
            },
        },
    }


def run_points_validation(
    *,
    config: PointsConfig,
    dataset_manifest: Path,
    output_root: Path,
    raw_root: Path | None = None,
) -> dict[str, Any]:
    """Execute Stage 1: Validation and Baseline/Challenger Model Selection on T, V1, V2."""
    started = time.perf_counter()
    raw_dir = raw_root or (output_root.parent.parent / "raw")

    # 1. Load data & generate candidates for blocks T, V1, V2
    histories, outcomes, scheds, t_games = load_points_dataset(raw_dir)
    f_rows, l_rows, b_rows, counts = build_points_candidates(
        config, histories, outcomes, scheds, t_games, allowed_splits={"t", "v1", "v2"}
    )

    # Index labels and baselines
    labels_by_id = {r["candidate_id"]: r for r in l_rows}
    baselines_by_id = {r["candidate_id"]: r for r in b_rows}

    # Combined candidate rows for primary evaluation
    eligible_rows: list[dict[str, Any]] = []
    for f in f_rows:
        cid = f["candidate_id"]
        lbl = labels_by_id[cid]
        base = baselines_by_id[cid]
        combined = {
            **f,
            **base,
            "actual": lbl["actual_points"],
            "label_status": lbl["label_status"],
        }
        # Keep candidates in core or early-season cohorts
        if combined["cohort"] in ("core", "early_season"):
            eligible_rows.append(combined)

    # 2. Evaluate transparent baselines on V1, V2, and pooled
    baseline_names = ("rolling_mean", "ewma_20_hl5", "prior_blend")
    v1_rows = [r for r in eligible_rows if r["split"] == "v1"]
    v2_rows = [r for r in eligible_rows if r["split"] == "v2"]
    pooled_val_rows = v1_rows + v2_rows

    baseline_metrics: dict[str, Any] = {"folds": {}, "pooled": {}}
    for name in baseline_names:
        baseline_metrics["folds"]["v1"] = {
            b: regression_metrics(v1_rows, b) for b in baseline_names
        }
        baseline_metrics["folds"]["v2"] = {
            b: regression_metrics(v2_rows, b) for b in baseline_names
        }
        baseline_metrics["pooled"][name] = regression_metrics(pooled_val_rows, name)

    # Select baseline winner by pooled MAE
    selected_baseline = min(
        config.validation_selection.tie_break_order,
        key=lambda b: (
            baseline_metrics["pooled"][b]["mae"]
            if baseline_metrics["pooled"][b]["mae"] is not None
            else math.inf,
            config.validation_selection.tie_break_order.index(b),
        ),
    )

    # 3. Evaluate challenger variants on 4-cell grid
    train_t = [r for r in eligible_rows if r["split"] == "t"]
    train_t_v1 = [r for r in eligible_rows if r["split"] in ("t", "v1")]

    challenger_results: dict[str, Any] = {}
    validation_predictions: list[dict[str, Any]] = []

    for variant in CHALLENGER_VARIANTS:
        feat_names = POINTS_FEATURE_VARIANTS[variant]
        grid_metrics: dict[str, Any] = {}

        for leaves in config.challenger.max_leaf_nodes:
            for l2 in config.challenger.l2_regularization:
                cfg_id = f"leaves_{leaves}__l2_{int(l2)}"

                # Fold V1: fit on T, predict V1
                _, preds_v1 = _fit_predict_hgbr(
                    config, feat_names, train_t, v1_rows, leaves, float(l2)
                )
                # Fold V2: fit on T + V1, predict V2
                _, preds_v2 = _fit_predict_hgbr(
                    config, feat_names, train_t_v1, v2_rows, leaves, float(l2)
                )

                eval_v1: list[dict[str, Any]] = []
                for r, p in zip(v1_rows, preds_v1, strict=True):
                    eval_v1.append({**r, "pred": p})
                    validation_predictions.append(
                        {
                            "candidate_id": r["candidate_id"],
                            "variant": variant,
                            "config_id": cfg_id,
                            "split": "v1",
                            "prediction": p,
                        }
                    )

                eval_v2: list[dict[str, Any]] = []
                for r, p in zip(v2_rows, preds_v2, strict=True):
                    eval_v2.append({**r, "pred": p})
                    validation_predictions.append(
                        {
                            "candidate_id": r["candidate_id"],
                            "variant": variant,
                            "config_id": cfg_id,
                            "split": "v2",
                            "prediction": p,
                        }
                    )

                pooled_eval = eval_v1 + eval_v2
                grid_metrics[cfg_id] = {
                    "parameters": {"max_leaf_nodes": leaves, "l2_regularization": float(l2)},
                    "folds": {
                        "v1": regression_metrics(eval_v1, "pred"),
                        "v2": regression_metrics(eval_v2, "pred"),
                    },
                    "pooled": regression_metrics(pooled_eval, "pred"),
                }

        # Deterministic selection for this variant
        best_cfg = min(
            grid_metrics,
            key=lambda c: (
                grid_metrics[c]["pooled"]["mae"],
                grid_metrics[c]["parameters"]["max_leaf_nodes"],
                -grid_metrics[c]["parameters"]["l2_regularization"],
                c,
            ),
        )
        challenger_results[variant] = {
            "configs": grid_metrics,
            "selected_config": best_cfg,
            "pooled": grid_metrics[best_cfg]["pooled"],
            "folds": grid_metrics[best_cfg]["folds"],
        }

    # Select challenger finalist
    challenger_finalist = min(
        CHALLENGER_VARIANTS,
        key=lambda v: (
            challenger_results[v]["pooled"]["mae"],
            CHALLENGER_VARIANTS.index(v),
        ),
    )

    # 4. Generate stable run ID and store artifacts
    c_hash = points_config_hash(config)
    stable_material = {
        "config_hash": c_hash,
        "dataset_content_sha256": config.dataset.content_sha256,
        "dataset_membership_sha256": config.dataset.membership_sha256,
        "code_version": POINTS_CODE_VERSION,
        "selected_baseline": selected_baseline,
        "challenger_finalist": challenger_finalist,
    }
    run_id = hashlib.sha256(canonical_json(stable_material).encode()).hexdigest()[:20]
    run_dir = output_root / run_id
    run_dir.mkdir(parents=True, exist_ok=True)

    selection_data = {
        "status": "frozen_at_validation",
        "run_id": run_id,
        "selected_baseline": selected_baseline,
        "challenger_finalist": challenger_finalist,
        "selected_configs": {
            v: challenger_results[v]["selected_config"] for v in CHALLENGER_VARIANTS
        },
        "baseline_validation": baseline_metrics,
        "challenger_validation": challenger_results,
    }

    metrics_data = {
        "baselines": baseline_metrics,
        "challenger": challenger_results,
        "counts": counts,
    }

    split_manifest = {
        name: config.splits[name].model_dump(mode="json") for name in ("t", "v1", "v2", "c", "f")
    }

    artifacts: dict[str, str] = {}
    payloads = {
        "config.json": json_bytes(config.model_dump(mode="json")),
        "dataset-manifest.json": dataset_manifest.read_bytes(),
        "features.jsonl": jsonl_bytes(f_rows),
        "labels.jsonl": jsonl_bytes(l_rows),
        "predictions.jsonl": jsonl_bytes(b_rows),
        "validation-predictions.jsonl": jsonl_bytes(validation_predictions),
        "split-manifest.json": json_bytes(split_manifest),
        "selection.json": json_bytes(selection_data),
        "metrics.json": json_bytes(metrics_data),
        "environment.json": json_bytes(_environment()),
    }
    for filename, payload in payloads.items():
        artifacts[filename] = write_once(run_dir / filename, payload)

    elapsed = time.perf_counter() - started
    run_manifest = {
        "run_id": run_id,
        "stage": "validation",
        "config_hash": c_hash,
        "dataset_sha256": config.dataset.content_sha256,
        "final_test_opened": False,
        "selected_baseline": selected_baseline,
        "challenger_finalist": challenger_finalist,
        "git": _git_identity(Path(__file__).resolve().parents[3]),
        "runtime": {
            "elapsed_seconds": elapsed,
            "peak_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            "cpu_threads": config.runtime.cpu_threads,
        },
        "artifacts": artifacts,
    }
    write_once(run_dir / "run-manifest.json", json_bytes(run_manifest))

    return {
        "run_id": run_id,
        "artifact_directory": str(run_dir),
        "selected_baseline": selected_baseline,
        "challenger_finalist": challenger_finalist,
        "selected_configs": selection_data["selected_configs"],
        "baseline_validation_mae": baseline_metrics["pooled"][selected_baseline]["mae"],
        "challenger_validation_mae": challenger_results[challenger_finalist]["pooled"]["mae"],
        "elapsed_seconds": elapsed,
    }


def run_points_calibration(
    *,
    run_id: str,
    output_root: Path,
    dataset_manifest: Path,
    config: PointsConfig,
    raw_root: Path | None = None,
) -> dict[str, Any]:
    """Execute Stage 2: Interval Calibration on Block C and Preopen Registration."""
    started = time.perf_counter()
    run_dir = output_root / run_id
    if not run_dir.exists():
        raise ValueError(f"run directory not found: {run_dir}")

    # Verify existing validation manifest
    v_manifest = _read_json(run_dir / "run-manifest.json")
    if v_manifest.get("final_test_opened") is not False:
        raise ValueError("final test must remain unopened during calibration")

    selection_data = _read_json(run_dir / "selection.json")
    baseline = selection_data["selected_baseline"]
    finalist = selection_data["challenger_finalist"]
    selected_cfgs = selection_data["selected_configs"]

    raw_dir = raw_root or (output_root.parent.parent / "raw")
    histories, outcomes, scheds, t_games = load_points_dataset(raw_dir)

    # Build candidates for T, V1, V2, and C
    f_rows, l_rows, b_rows, _ = build_points_candidates(
        config, histories, outcomes, scheds, t_games, allowed_splits={"t", "v1", "v2", "c"}
    )
    labels_by_id = {r["candidate_id"]: r for r in l_rows}
    baselines_by_id = {r["candidate_id"]: r for r in b_rows}

    eligible_rows: list[dict[str, Any]] = []
    for f in f_rows:
        cid = f["candidate_id"]
        combined = {
            **f,
            **baselines_by_id[cid],
            "actual": labels_by_id[cid]["actual_points"],
            "label_status": labels_by_id[cid]["label_status"],
        }
        if combined["cohort"] in ("core", "early_season"):
            eligible_rows.append(combined)

    # Frozen final fit: fit on T + V1 + V2
    train_rows = [r for r in eligible_rows if r["split"] in ("t", "v1", "v2")]
    c_rows = [r for r in eligible_rows if r["split"] == "c"]

    # Predict on C for baseline, finalist, and ablation
    estimators = (baseline, finalist, *(v for v in CHALLENGER_VARIANTS if v != finalist))
    calib_predictions: dict[str, list[float]] = {}
    calib_predictions[baseline] = [
        float(r[baseline]) for r in c_rows if r.get(baseline) is not None
    ]

    calibration_artifacts: dict[str, Any] = {}

    for variant in CHALLENGER_VARIANTS:
        feat_names = POINTS_FEATURE_VARIANTS[variant]
        cfg_str = selected_cfgs[variant]
        parts = cfg_str.split("__")
        leaves = int(parts[0].replace("leaves_", ""))
        l2 = float(parts[1].replace("l2_", ""))

        _, preds_c = _fit_predict_hgbr(config, feat_names, train_rows, c_rows, leaves, l2)
        for r, p in zip(c_rows, preds_c, strict=True):
            r[variant] = p

    for est in estimators:
        # Separate core (10+) and early-season (1-9) calibration
        core_c = [r for r in c_rows if r["cohort"] == "core"]
        early_c = [r for r in c_rows if r["cohort"] == "early_season"]

        q_core = residual_quantile(core_c, est, config.intervals.nominal_coverage)
        q_early = residual_quantile(early_c, est, config.intervals.nominal_coverage)

        core_avail = (
            q_core["rows"] >= config.intervals.minimum_rows
            and q_core["target_dates"] >= config.intervals.minimum_target_dates
        )
        early_avail = (
            q_early["rows"] >= config.intervals.minimum_rows
            and q_early["target_dates"] >= config.intervals.minimum_target_dates
        )

        calibration_artifacts[est] = {
            "core": {**q_core, "available": core_avail},
            "early_season": {**q_early, "available": early_avail},
        }

    calib_file = run_dir / "calibration.json"
    reg_file = run_dir / "preopen-registration.json"

    if calib_file.exists() and reg_file.exists():
        calib_hash = hashlib.sha256(calib_file.read_bytes()).hexdigest()
        reg_hash = hashlib.sha256(reg_file.read_bytes()).hexdigest()
        calib_artifacts = _read_json(calib_file)
        elapsed = time.perf_counter() - started
        return {
            "run_id": run_id,
            "calibration_sha256": calib_hash,
            "preopen_registration_sha256": reg_hash,
            "calibration": calib_artifacts,
            "reused_identical_artifacts": True,
            "elapsed_seconds": elapsed,
        }

    # Write calibration.json
    write_once(calib_file, json_bytes(calibration_artifacts))
    calib_hash = hashlib.sha256(calib_file.read_bytes()).hexdigest()

    # Preopen registration: frozen commit of selection, validation metrics, and calibration
    preopen_reg = {
        "status": "registered_before_final_test_open",
        "run_id": run_id,
        "config_hash": points_config_hash(config),
        "selected_baseline": baseline,
        "challenger_finalist": finalist,
        "selected_configs": selected_cfgs,
        "calibration_sha256": calib_hash,
        "calibration": calibration_artifacts,
        "promotion_gates": config.promotion.model_dump(mode="json"),
        "final_split_boundary": config.splits["f"].model_dump(mode="json"),
    }
    write_once(reg_file, json_bytes(preopen_reg))
    reg_hash = hashlib.sha256(reg_file.read_bytes()).hexdigest()

    # Update run manifest
    v_manifest["stage"] = "validation_and_calibration"
    v_manifest["calibration_sha256"] = calib_hash
    v_manifest["preopen_registration_sha256"] = reg_hash
    v_manifest["artifacts"]["calibration.json"] = calib_hash
    v_manifest["artifacts"]["preopen-registration.json"] = reg_hash
    (run_dir / "run-manifest.json").write_bytes(json_bytes(v_manifest))

    elapsed = time.perf_counter() - started
    return {
        "run_id": run_id,
        "calibration_sha256": calib_hash,
        "preopen_registration_sha256": reg_hash,
        "calibration": calibration_artifacts,
        "elapsed_seconds": elapsed,
    }


def _interval_metrics_for_eval(
    rows: list[dict[str, Any]],
    prediction_key: str,
    calib_entry: dict[str, Any],
) -> dict[str, Any]:
    paired = [r for r in rows if r.get("actual") is not None and r.get(prediction_key) is not None]
    if not paired:
        return {"rows": 0, "coverage": None, "mean_width": None}

    # Evaluate by cohort
    core_rows = [r for r in paired if r["cohort"] == "core"]
    early_rows = [r for r in paired if r["cohort"] == "early_season"]

    q_core = (
        calib_entry["core"].get("absolute_residual_quantile")
        if calib_entry["core"].get("available")
        else None
    )
    q_early = (
        calib_entry["early_season"].get("absolute_residual_quantile")
        if calib_entry["early_season"].get("available")
        else None
    )

    core_cov = None
    core_w = None
    if q_core is not None and core_rows:
        cov_count = sum(
            abs(float(r[prediction_key]) - float(r["actual"])) <= float(q_core) for r in core_rows
        )
        core_cov = cov_count / len(core_rows)
        core_w = 2.0 * float(q_core)

    early_cov = None
    early_w = None
    if q_early is not None and early_rows:
        cov_count = sum(
            abs(float(r[prediction_key]) - float(r["actual"])) <= float(q_early) for r in early_rows
        )
        early_cov = cov_count / len(early_rows)
        early_w = 2.0 * float(q_early)

    return {
        "core": {"rows": len(core_rows), "coverage": core_cov, "mean_width": core_w},
        "early_season": {"rows": len(early_rows), "coverage": early_cov, "mean_width": early_w},
    }


def run_points_final_test(
    *,
    run_id: str,
    output_root: Path,
    dataset_manifest: Path,
    config: PointsConfig,
    open_final_test: bool = False,
    raw_root: Path | None = None,
) -> dict[str, Any]:
    """Execute Stage 3: Single Final-Test Opening on Block F (2025-26 Season)."""
    if not open_final_test:
        raise ValueError("refusing to open Block F without explicit --open-final-test flag")

    started = time.perf_counter()
    run_dir = output_root / run_id
    if not run_dir.exists():
        raise ValueError(f"run directory not found: {run_dir}")

    # Check if already completed and immutable
    completed_report_path = run_dir / "evaluation-report.json"
    if completed_report_path.exists():
        report_data = _read_json(completed_report_path)
        return {
            "run_id": run_id,
            "artifact_directory": str(run_dir),
            "reused_identical_artifacts": True,
            "selected_baseline": report_data["validation"]["baseline"],
            "challenger_finalist": report_data["validation"]["challenger_finalist"],
            "final_metrics": report_data["final_test"]["metrics"],
            "promotion": report_data["promotion"],
            "final_test_opened": True,
        }

    # Verify preopen registration exists
    reg_path = run_dir / "preopen-registration.json"
    if not reg_path.exists():
        raise ValueError("preopen-registration.json missing; run stage calibrate first")
    reg_data = _read_json(reg_path)

    baseline = reg_data["selected_baseline"]
    finalist = reg_data["challenger_finalist"]
    selected_cfgs = reg_data["selected_configs"]
    calib_artifacts = reg_data["calibration"]

    # Load data for all seasons through Block F
    raw_dir = raw_root or (output_root.parent.parent / "raw")
    histories, outcomes, scheds, t_games = load_points_dataset(raw_dir)

    # DELIBERATE STEP: Cross the Block F boundary
    f_features, f_labels, f_baselines, f_counts = build_points_candidates(
        config, histories, outcomes, scheds, t_games, allowed_splits={"f"}
    )

    # Also load training set T + V1 + V2 for fixed final fit
    t_features, t_labels, t_baselines, _ = build_points_candidates(
        config, histories, outcomes, scheds, t_games, allowed_splits={"t", "v1", "v2"}
    )

    t_lbl_map = {r["candidate_id"]: r for r in t_labels}
    t_base_map = {r["candidate_id"]: r for r in t_baselines}
    train_rows: list[dict[str, Any]] = []
    for f in t_features:
        cid = f["candidate_id"]
        c = {
            **f,
            **t_base_map[cid],
            "actual": t_lbl_map[cid]["actual_points"],
            "label_status": t_lbl_map[cid]["label_status"],
        }
        if c["cohort"] in ("core", "early_season") and c["label_status"] == "scored":
            train_rows.append(c)

    f_lbl_map = {r["candidate_id"]: r for r in f_labels}
    f_base_map = {r["candidate_id"]: r for r in f_baselines}
    f_rows: list[dict[str, Any]] = []
    for f in f_features:
        cid = f["candidate_id"]
        c = {
            **f,
            **f_base_map[cid],
            "actual": f_lbl_map[cid]["actual_points"],
            "label_status": f_lbl_map[cid]["label_status"],
        }
        if c["cohort"] in ("core", "early_season"):
            f_rows.append(c)

    # Predict on F with fixed models
    final_predictions: list[dict[str, Any]] = []
    for variant in CHALLENGER_VARIANTS:
        feat_names = POINTS_FEATURE_VARIANTS[variant]
        cfg_str = selected_cfgs[variant]
        parts = cfg_str.split("__")
        leaves = int(parts[0].replace("leaves_", ""))
        l2 = float(parts[1].replace("l2_", ""))

        _, preds_f = _fit_predict_hgbr(config, feat_names, train_rows, f_rows, leaves, l2)
        for r, p in zip(f_rows, preds_f, strict=True):
            r[variant] = p
            final_predictions.append(
                {
                    "candidate_id": r["candidate_id"],
                    "variant": variant,
                    "config_id": cfg_str,
                    "prediction": p,
                }
            )

    estimators = (baseline, finalist, *(v for v in CHALLENGER_VARIANTS if v != finalist))
    final_metrics = {name: regression_metrics(f_rows, name) for name in estimators}
    interval_results = {
        name: _interval_metrics_for_eval(f_rows, name, calib_artifacts[name]) for name in estimators
    }
    slices = _compute_points_slice_report(f_rows, estimators)

    # Paired moving block bootstrap uncertainty
    uncertainty = moving_block_difference_interval(
        {"f": f_rows},
        left_key=finalist,
        right_key=baseline,
        ranges={"f": (config.splits["f"].start, config.splits["f"].end)},
        replicates=config.uncertainty.bootstrap_replicates,
        block_days=config.uncertainty.moving_block_calendar_days,
        seed=config.uncertainty.seed,
    )

    # Evaluate promotion gates
    val_selection = _read_json(run_dir / "selection.json")
    val_summary = {
        "baseline_validation": val_selection["baseline_validation"],
        "finalist_validation": val_selection["challenger_validation"][finalist],
    }
    promotion = evaluate_promotion_gates(
        config,
        baseline_name=baseline,
        finalist_name=finalist,
        validation_results=val_summary,
        final_metrics=final_metrics,
        uncertainty=uncertainty,
        slices=slices,
        intervals=interval_results,
    )

    # Create model card & evaluation report
    report = {
        "run_id": run_id,
        "task": "conditional next-team-game basketball points estimation",
        "validation": {
            "baseline": baseline,
            "challenger_finalist": finalist,
            "selected_configs": selected_cfgs,
            "validation_results": val_selection,
        },
        "final_test": {
            "split": config.splits["f"].model_dump(mode="json"),
            "metrics": final_metrics,
            "paired_uncertainty": uncertainty,
            "intervals": interval_results,
            "prespecified_slices": slices,
            "counts": f_counts,
        },
        "calibration": calib_artifacts,
        "promotion": promotion,
        "serving_policy": {
            "active_estimator": finalist if promotion["decision"] == "promote" else baseline,
            "promoted": (promotion["decision"] == "promote"),
            "promotion_means_future_eligibility_only": True,
        },
        "limitations": [
            (
                "Revised historical NBA Stats mirror data; original real-time publication "
                "timestamps unavailable."
            ),
            (
                "Schedule and opponent context are reconstructed from prior regular season "
                "outcomes strictly."
            ),
            (
                "Conditional on confirmed recorded appearance; does not estimate availability, "
                "injuries, or team placement."
            ),
        ],
    }

    replay_estimates = [
        {
            "candidate_id": r["candidate_id"],
            "target_game_id": r["target_game_id"],
            "player_id": r["player_id"],
            "season": r["season"],
            "target_game_date": r["target_game_date"].isoformat()
            if isinstance(r["target_game_date"], date)
            else str(r["target_game_date"]),
            "primary_estimator": baseline,
            "primary_prediction": r.get(baseline),
            "challenger_finalist": finalist,
            "challenger_prediction": r.get(finalist),
            "promotion_decision": promotion["decision"],
        }
        for r in f_rows
    ]

    model_card = _generate_points_model_card(report, config)

    # Persist all final artifacts
    payloads = {
        "final-predictions.jsonl": jsonl_bytes(final_predictions),
        "evaluation-report.json": json_bytes(report),
        "replay-estimates.jsonl": jsonl_bytes(replay_estimates),
        "model-card.md": model_card.encode("utf-8"),
    }
    written_arts = {name: write_once(run_dir / name, payload) for name, payload in payloads.items()}

    elapsed = time.perf_counter() - started
    run_manifest = _read_json(run_dir / "run-manifest.json")
    run_manifest["stage"] = "challenger_and_final_test"
    run_manifest["final_test_opened"] = True
    run_manifest["promotion"] = promotion
    run_manifest["runtime"]["final_test_elapsed_seconds"] = elapsed
    run_manifest["artifacts"].update(written_arts)
    (run_dir / "run-manifest.json").write_bytes(json_bytes(run_manifest))

    return {
        "run_id": run_id,
        "artifact_directory": str(run_dir),
        "selected_baseline": baseline,
        "challenger_finalist": finalist,
        "final_metrics": final_metrics,
        "promotion": promotion,
        "final_test_opened": True,
        "elapsed_seconds": elapsed,
    }


def _generate_points_model_card(report: dict[str, Any], config: PointsConfig) -> str:
    val = report["validation"]
    final = report["final_test"]
    base = val["baseline"]
    chal = val["challenger_finalist"]
    promo = report["promotion"]

    lines = [
        "# CourtLoad model card: basketball-points-v1 evaluation",
        "",
        f"Run `{report['run_id']}`. Promotion Decision: **{promo['decision']}**.",
        f"Serving policy: `{report['serving_policy']['active_estimator']}`.",
        "",
        "## Task and Data",
        "",
        (
            "Estimate basketball points for the next scheduled team game conditional on "
            "recorded appearance."
        ),
        (
            f"Dataset: `{config.dataset.source_namespace}`, content hash "
            f"`{config.dataset.content_sha256}`."
        ),
        "",
        "## Chronological Splits",
        "",
        "| Split | Dates | Purpose |",
        "| --- | --- | --- |",
        f"| T | {config.splits['t'].start} to {config.splits['t'].end} | Initial training fit |",
        f"| V1 | {config.splits['v1'].start} to {config.splits['v1'].end} | Fold 1 validation |",
        f"| V2 | {config.splits['v2'].start} to {config.splits['v2'].end} | Fold 2 validation |",
        (
            f"| C | {config.splits['c'].start} to {config.splits['c'].end} | "
            "Empirical interval calibration |"
        ),
        f"| F | {config.splits['f'].start} to {config.splits['f'].end} | Final test out-of-time |",
        "",
        "## Performance Metrics on Block F (2025-26 Regular Season)",
        "",
        (
            "| Estimator | MAE | RMSE | Player-Balanced MAE | Player-Game MAE | Forecast Rows | "
            "Core Coverage (80% Nom) | Width |"
        ),
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]

    for est in (base, chal, *(v for v in CHALLENGER_VARIANTS if v != chal)):
        m = final["metrics"][est]
        intv = final["intervals"][est]["core"]
        cov_str = f"{intv['coverage'] * 100:.1f}%" if intv.get("coverage") is not None else "N/A"
        w_str = f"{intv['mean_width']:.2f}" if intv.get("mean_width") is not None else "N/A"
        lines.append(
            f"| `{est}` | {m['mae']:.3f} | {m['rmse']:.3f} | {m['player_balanced_mae']:.3f} | "
            f"{m['player_game_balanced_mae']:.3f} | {m['forecast_rows']:,} | {cov_str} | {w_str} |"
        )

    g1 = promo["gates"]["validation_improvement"]
    g2 = promo["gates"]["final_paired_superiority"]
    g3 = promo["gates"]["supported_slices"]
    g4 = promo["gates"]["interval_guardrails"]
    g2_low = g2.get("lower", 0)
    g2_up = g2.get("upper", 0)

    lines.extend(
        [
            "",
            "## Promotion Gates",
            "",
            (
                f"1. Validation MAE improvement >= 5% in both folds: **{g1['passed']}** "
                f"(Pooled relative: {g1['pooled_relative_improvement'] * 100:.2f}%)"
            ),
            (
                f"2. Final test paired difference upper bound < 0: **{g2['passed']}** "
                f"(MAE diff: {g2['mae_difference']:.3f}, 95% CI: [{g2_low:.3f}, {g2_up:.3f}])"
            ),
            (
                f"3. No supported slice regression > 5%: **{g3['passed']}** "
                f"(Supported slices: {g3['supported_count']})"
            ),
            (f"4. Core interval coverage >= 75% and width <= 110%: **{g4['passed']}**"),
            "",
            "## Reproducibility Command",
            "",
            (
                "```bash\n"
                "courtload evaluate-points --config evaluation/config/points-v1.yaml "
                "--dataset evaluation/manifests/accepted-points-v1.json --stage validate\n"
                "courtload evaluate-points --config evaluation/config/points-v1.yaml "
                "--dataset evaluation/manifests/accepted-points-v1.json --stage calibrate\n"
                f"courtload evaluate-points --registered-run {report['run_id']} "
                "--stage final --open-final-test\n"
                "```\n"
            ),
        ]
    )
    return "\n".join(lines)


def activate_points_policy_record(
    session: Session,
    run_id: str,
    output_root: Path,
) -> ModelPolicyActivation:
    """Read run artifacts and register active model policy in database."""
    run_dir = output_root / run_id
    report_file = run_dir / "evaluation-report.json"
    if not report_file.exists():
        raise ValueError(f"evaluation report not found for run {run_id}")

    report = _read_json(report_file)
    active_estimator = report["serving_policy"]["active_estimator"]

    # Deactivate existing active policies for basketball_points
    existing = session.scalars(
        select(ModelPolicyActivation).where(
            ModelPolicyActivation.target_metric == "basketball_points",
            ModelPolicyActivation.is_active == True,  # noqa: E712
        )
    ).all()
    for p in existing:
        p.is_active = False

    config_data = _read_json(run_dir / "config.json")

    policy = ModelPolicyActivation(
        policy_name=f"points-v1-{active_estimator}",
        target_metric="basketball_points",
        estimator_identity=active_estimator,
        calibration_identity=f"calibration-80pct-{run_id}",
        eligibility_criteria_json=config_data.get("eligibility", {}),
        experiment_run_id=run_id,
        is_active=True,
        activated_at=utc_now(),
    )
    session.add(policy)
    session.commit()
    return policy
