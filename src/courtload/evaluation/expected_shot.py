"""One registered location/type candidate with chronological selection and calibration."""

from __future__ import annotations

import argparse
import json
import math
import platform
import resource
import time
import warnings
from collections import defaultdict
from collections.abc import Callable
from importlib.metadata import version
from pathlib import Path
from typing import Any

import numpy as np
from scipy.optimize import minimize  # type: ignore[import-untyped]
from scipy.special import expit  # type: ignore[import-untyped]
from sklearn.exceptions import ConvergenceWarning  # type: ignore[import-untyped]
from sklearn.linear_model import LogisticRegression  # type: ignore[import-untyped]
from sklearn.preprocessing import StandardScaler  # type: ignore[import-untyped]
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtload.database import build_engine
from courtload.domain.research_registration import ResearchProtocol, RetrospectiveShotBinding
from courtload.domain.rich_sources import compute_payload_hash
from courtload.evaluation.research_binding import bind_shots
from courtload.evaluation.research_inputs import SeasonBundle, read_json, verified_games
from courtload.evaluation.research_limits import cgroup_usage
from courtload.evaluation.research_registration import load_document
from courtload.ingestion.sportsdataverse import hash_file
from courtload.research_models import ResearchDataset, ResearchShotMember

REGISTERED_PROTOCOL_SHA256 = "ce40518f8eebe240db250b60890df1a9f104e442559ce494a77c57cc0e47e805"


def _write(path: Path, value: Any) -> None:
    with path.open("x") as stream:
        json.dump(value, stream, sort_keys=True, indent=2, allow_nan=False)
        stream.write("\n")


def probability_metrics(y: Any, p: Any, values: Any) -> dict[str, Any]:
    y = np.asarray(y)
    p = np.asarray(p)
    values = np.asarray(values)
    if not len(y):
        raise ValueError("cannot score empty role")
    if not np.isfinite(p).all() or np.any((p < 0) | (p > 1)):
        raise ValueError("invalid model probability")
    bins = []
    ece = 0.0
    for index in range(10):
        mask = (p >= index / 10) & ((p < (index + 1) / 10) if index < 9 else (p <= 1))
        count = int(mask.sum())
        observed = float(y[mask].mean()) if count else None
        predicted = float(p[mask].mean()) if count else None
        if count:
            assert observed is not None and predicted is not None
            ece += count / len(y) * abs(observed - predicted)
        bins.append(
            {
                "lower": index / 10,
                "upper": (index + 1) / 10,
                "rows": count,
                "observed_rate": observed,
                "mean_probability": predicted,
            }
        )
    clipped = np.clip(p, 1e-6, 1 - 1e-6)
    return {
        "rows": len(y),
        "brier": float(np.mean((p - y) ** 2)),
        "log_loss": float(-np.mean(y * np.log(clipped) + (1 - y) * np.log1p(-clipped))),
        "expected_points_mae": float(np.mean(np.abs(values * p - values * y))),
        "ece": ece,
        "calibration_bins": bins,
    }


def train_baseline(rows: list[dict[str, Any]]) -> dict[str, Any]:
    cells: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    types: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for row in rows:
        for groups, key in (
            (cells, f"{row['zone']}:{row['shot_value']}"),
            (types, str(row["shot_value"])),
        ):
            groups[key][0] += int(row["made"])
            groups[key][1] += 1
    league = (sum(int(r["made"]) for r in rows) + 1) / (len(rows) + 2)
    return {
        "cells": {k: (v[0] + 1) / (v[1] + 2) for k, v in cells.items()},
        "types": {k: (v[0] + 1) / (v[1] + 2) for k, v in types.items()},
        "league": league,
    }


def baseline_predictions(rows: list[dict[str, Any]], baseline: dict[str, Any]) -> Any:
    return np.array(
        [
            baseline["cells"].get(
                f"{r['zone']}:{r['shot_value']}",
                baseline["types"].get(str(r["shot_value"]), baseline["league"]),
            )
            for r in rows
        ]
    )


def design(rows: list[dict[str, Any]]) -> Any:
    return np.array(
        [
            [
                r["x_feet"],
                r["y_feet"],
                r["distance_feet"],
                r["distance_feet"] ** 2,
                int(r["shot_value"] == 3),
            ]
            for r in rows
        ],
        dtype=float,
    )


def bootstrap_games(
    rows: list[dict[str, Any]], y: Any, candidate: Any, baseline: Any, seed: int
) -> dict[str, Any]:
    groups: dict[str, list[float]] = defaultdict(lambda: [0.0, 0.0])
    for row, actual, left, right in zip(rows, y, candidate, baseline, strict=True):
        g = groups[row["game_id"]]
        g[0] += (left - actual) ** 2 - (right - actual) ** 2
        g[1] += 1
    aggregates = np.array([groups[k] for k in sorted(groups)])
    random = np.random.default_rng(seed)
    differences = []
    for _ in range(200):
        sample = aggregates[random.integers(0, len(aggregates), len(aggregates))]
        differences.append(float(sample[:, 0].sum() / sample[:, 1].sum()))
    lower, upper = np.percentile(differences, [2.5, 97.5])
    return {
        "replicates": 200,
        "unit": "game_cluster",
        "seed": seed,
        "brier_difference_lower": float(lower),
        "brier_difference_upper": float(upper),
    }


def run_experiment(protocol_path: Path, binding_path: Path, output: Path) -> dict[str, Any]:
    started = time.monotonic()
    output.mkdir(parents=True, exist_ok=False)
    protocol = load_document(protocol_path)
    if (
        not isinstance(protocol, ResearchProtocol)
        or protocol.content_hash() != REGISTERED_PROTOCOL_SHA256
    ):
        raise ValueError("runner accepts only its exact preregistered retrospective recipe")
    binding = RetrospectiveShotBinding.model_validate(
        read_json(binding_path, maximum=8 * 1024 * 1024)
    )
    binding.validate_protocol(protocol)
    limits = cgroup_usage()
    quota, period = limits["cpu_max"].split()
    if (
        limits["memory_limit_bytes"] > protocol.budget.max_peak_rss_mib * 1024 * 1024
        or len(limits["cpu_affinity"]) > protocol.budget.cpu_threads
        or quota == "max"
        or int(quota) > protocol.budget.cpu_threads * int(period)
    ):
        raise ValueError("preregistered process-tree resource caps are not enforced")
    if version("scikit-learn") != "1.6.1":
        raise ValueError("registered scikit-learn version mismatch")
    for name, path in [("protocol.json", protocol_path), ("binding.json", binding_path)]:
        with (output / name).open("xb") as binary_stream:
            binary_stream.write(path.read_bytes())
    engine = build_engine()
    by_role: dict[str, list[dict[str, Any]]] = defaultdict(list)
    with Session(engine) as session:
        verified = bind_shots(session, binding.dataset_id, protocol)
        if verified.content_hash() != binding.content_hash():
            raise ValueError("binding differs from sealed admitted memberships")
        dataset = session.get(ResearchDataset, binding.dataset_id)
        assert dataset is not None
        for spec in dataset.manifest_json["bundles"]:
            if hash_file(Path(spec["root"]) / "manifest.json")[0] != spec["manifest_sha256"]:
                raise ValueError("admitted evidence changed")
            bundle = SeasonBundle(
                Path(spec["root"]),
                Path(spec["shot_root"]),
                Path(spec["box_root"]),
                spec["starting_year"],
                Path(spec["ledger"]) if spec["ledger"] else None,
            )
            for _ in verified_games(bundle):
                pass
        roles = {g.game_id: g.role for g in binding.games}
        selection = set(binding.selection_games)
        sql_rows = session.execute(
            select(ResearchShotMember.game_id, ResearchShotMember.payload_json)
            .where(
                ResearchShotMember.dataset_id == binding.dataset_id,
                ResearchShotMember.eligible.is_(True),
            )
            .order_by(ResearchShotMember.game_id, ResearchShotMember.event_id)
        ).yield_per(1000)
        game_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for gid, row in sql_rows:
            bound_role = roles[gid]
            role: str = (
                ("selection" if gid in selection else "calibration")
                if bound_role == "validation"
                else bound_role
            )
            by_role[role].append(row)
            game_rows[gid].append(row)
        for game in binding.games:
            if (
                len(game_rows[game.game_id]) != game.rows
                or compute_payload_hash(game_rows[game.game_id]) != game.row_membership_sha256
            ):
                raise ValueError("database eligible rows do not match exact binding")
    if sum(len(r) for r in by_role.values()) > protocol.budget.max_rows:
        raise ValueError("row cap exceeded")
    if protocol.budget.max_features < 5:
        raise ValueError("feature cap exceeded")
    for role, minimum in [
        ("training", 10000),
        ("selection", 1000),
        ("calibration", 1000),
        ("final_test", 1000),
    ]:
        rows = by_role[role]
        if (
            len(rows) < minimum
            or len({r["game_id"] for r in rows}) < 30
            or len({r["made"] for r in rows}) != 2
        ):
            raise ValueError(f"sample gate failed: {role}")
    baseline = train_baseline(by_role["training"])
    scaler = StandardScaler()
    x = scaler.fit_transform(design(by_role["training"]))
    y = np.array([int(r["made"]) for r in by_role["training"]])
    model = LogisticRegression(C=1, solver="lbfgs", max_iter=200, random_state=protocol.seed)
    _write(output / "fit-started.json", {"candidate_fit_started": True})
    with warnings.catch_warnings():
        warnings.simplefilter("error", ConvergenceWarning)
        model.fit(x, y)
    del x, y
    fits = 1
    delta = 0.0
    selection_rows = by_role["selection"]
    y_selection = np.array([int(r["made"]) for r in selection_rows])
    values = np.array([r["shot_value"] for r in selection_rows])
    left = model.predict_proba(scaler.transform(design(selection_rows)))[:, 1]
    right = baseline_predictions(selection_rows, baseline)
    selection_metrics = {
        "candidate": probability_metrics(y_selection, left, values),
        "baseline": probability_metrics(y_selection, right, values),
    }
    selected = (
        selection_metrics["candidate"]["brier"] <= 0.99 * selection_metrics["baseline"]["brier"]
    )
    evaluation: dict[str, Any] = {
        "classification": "retrospective_research",
        "final_previously_exposed": True,
        "selection": selection_metrics,
        "selection_passed": selected,
        "final_report_opened": False,
        "status": "selection_failed_negative_result",
        "prospective_promotion_authorized": False,
    }
    predictions = [("selection", selection_rows, left, right)]
    if selected:
        calibration = by_role["calibration"]
        target = np.array([int(r["made"]) for r in calibration])
        offset = model.decision_function(scaler.transform(design(calibration)))
        result = minimize(
            lambda d: float(np.mean(np.logaddexp(0, offset + d[0]) - target * (offset + d[0]))),
            np.array([0.0]),
            jac=lambda d: np.array([np.mean(expit(offset + d[0]) - target)]),
            method="BFGS",
            options={"maxiter": 200, "gtol": 1e-8},
        )
        if not result.success or not math.isfinite(float(result.x[0])):
            raise ValueError("intercept calibration did not converge")
        delta = float(result.x[0])
        predictions.append(
            (
                "calibration",
                calibration,
                expit(offset + delta),
                baseline_predictions(calibration, baseline),
            )
        )
        fits += 1
        if fits > protocol.budget.max_candidate_fits:
            raise ValueError("candidate/calibration fit cap exceeded")
        tail = by_role["final_test"]
        actual = np.array([int(r["made"]) for r in tail])
        values = np.array([r["shot_value"] for r in tail])
        candidate = expit(model.decision_function(scaler.transform(design(tail))) + delta)
        reference = baseline_predictions(tail, baseline)
        metrics = {
            "candidate": probability_metrics(actual, candidate, values),
            "baseline": probability_metrics(actual, reference, values),
        }
        uncertainty = bootstrap_games(tail, actual, candidate, reference, protocol.seed)
        slices = []

        def band(row: dict[str, Any]) -> str:
            distance = row["distance_feet"]
            return (
                "[0,8)"
                if distance < 8
                else "[8,16)"
                if distance < 16
                else "[16,24)"
                if distance < 24
                else "[24,infinity)"
            )

        slice_keys: dict[str, Callable[[dict[str, Any]], str]] = {
            "zone": lambda r: r["zone"],
            "type": lambda r: str(r["shot_value"]),
            "distance_band": band,
            "month": lambda r: r["game_date"][:7],
        }
        # Home/away comes from independently admitted schedule, never player names.
        home_by_game = {}
        with Session(engine) as session:
            for spec in dataset.manifest_json["bundles"]:
                from courtload.evaluation.shotchart_admission import independent_sources

                _, raw = independent_sources(
                    Path(spec["box_root"]), starting_year=spec["starting_year"]
                )
                home_by_game.update({r["game_id"]: r["home_team_id"] for r in raw["schedule"]})
        slice_keys["home_away"] = lambda r: (
            "home" if r["team_id"] == home_by_game[r["game_id"]] else "away"
        )
        supported_zone_type_pass = True
        for dimension, key in slice_keys.items():
            labels = np.array([key(r) for r in tail])
            for label in sorted(set(labels)):
                mask = labels == label
                count = int(mask.sum())
                supported = count >= 200
                summary: dict[str, Any] = {
                    "dimension": dimension,
                    "label": str(label),
                    "rows": count,
                    "supported": supported,
                }
                if supported:
                    summary.update(
                        candidate=probability_metrics(actual[mask], candidate[mask], values[mask]),
                        baseline=probability_metrics(actual[mask], reference[mask], values[mask]),
                    )
                    if (
                        dimension in ("zone", "type")
                        and summary["candidate"]["brier"] > 1.05 * summary["baseline"]["brier"]
                    ):
                        supported_zone_type_pass = False
                slices.append(summary)
        accepted = (
            metrics["candidate"]["brier"] <= 0.99 * metrics["baseline"]["brier"]
            and uncertainty["brier_difference_upper"] < 0
            and metrics["candidate"]["log_loss"] <= 1.01 * metrics["baseline"]["log_loss"]
            and metrics["candidate"]["ece"] <= 0.05
            and supported_zone_type_pass
        )
        evaluation.update(
            final=metrics,
            uncertainty=uncertainty,
            slices=slices,
            final_report_opened=True,
            retrospective_acceptance_passed=accepted,
            status="retrospective_acceptance_passed"
            if accepted
            else "retrospective_negative_result",
        )
        predictions.append(("final_test", tail, candidate, reference))
    with (output / "predictions.jsonl").open("x") as stream:
        for role, rows, candidate, reference in predictions:
            for row, left, right in zip(rows, candidate, reference, strict=True):
                stream.write(
                    json.dumps(
                        {
                            "game_id": row["game_id"],
                            "event_id": row["event_id"],
                            "role": role,
                            "actual": int(row["made"]),
                            "candidate": float(left),
                            "baseline": float(right),
                        },
                        sort_keys=True,
                    )
                    + "\n"
                )
    _write(
        output / "model.json",
        {
            "features": [
                "x_feet",
                "y_feet",
                "distance_feet",
                "distance_squared",
                "three_point_indicator",
            ],
            "mean": scaler.mean_.tolist(),
            "scale": scaler.scale_.tolist(),
            "coefficients": model.coef_[0].tolist(),
            "intercept": float(model.intercept_[0]),
            "calibration_intercept": delta,
            "baseline": baseline,
        },
    )
    _write(output / "evaluation.json", evaluation)
    _write(
        output / "attempts.json",
        {
            "candidate_fits": fits,
            "seed": protocol.seed,
            "role_rows": {k: len(v) for k, v in by_role.items()},
            "features": 5,
            "wall_seconds": time.monotonic() - started,
            "process_peak_rss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
            "process_tree": cgroup_usage(),
            "versions": {
                "python": platform.python_version(),
                "scikit-learn": version("scikit-learn"),
                "numpy": version("numpy"),
                "scipy": version("scipy"),
            },
        },
    )
    with (output / "model-card.md").open("x") as stream:
        stream.write(
            "# CourtLoad expected shots: retrospective research\n\n"
            f"Status: {evaluation['status']}.\n\n"
            "Location/type logistic model versus a training-only zone/type Beta(1,1) baseline. "
            "Three complete reconciled regular seasons; two official supplemental attempts "
            "have no admitted geometry and are excluded. "
            "2023-24 trains, 2024-25 selects/calibrates by frozen game-date halves, "
            "and 2025-26 is a previously exposed retrospective report. "
            "No prospective validation or vendor-equivalent claim. Free throws, foul value, "
            "tracking, defender proximity and player identity are absent.\n\n"
            f"Candidate fits: {fits}. Final report opened: {evaluation['final_report_opened']}. "
            "A failed selection stops before calibration/final errors. Exact memberships, "
            "predictions, metrics and kernel resource accounting accompany this report. "
            "No active points policy or historical profile changes.\n"
        )
    return evaluation


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--protocol", type=Path, required=True)
    parser.add_argument("--binding", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = run_experiment(args.protocol, args.binding, args.output)
    print(json.dumps({"status": result["status"]}))


if __name__ == "__main__":
    main()
