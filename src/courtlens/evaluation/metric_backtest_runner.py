"""Metric Backtest runner (`courtlens-metric-backtest-v1`, R08).

For every regular-season game in a test season, each candidate predicts the home margin from
ratings knowable before the game, weighted by the minutes players actually played:
`margin = a x H + b x D`, with D the home-minus-away strength (`metric_backtest_data.strength`),
H = 0 at neutral sites, and a, b and the residual SD fitted on the latest *earlier* season in which
the candidate exists. Win probability is Phi(margin / SD). Nothing is chosen from outcomes, so
there is one pass. Every constant is checked against the registration before anything is read.

Subcommands: `test` (the backtest; results hashed, no timings), `freeze` (the 2026-27 rules and
calibration, after `test`), `reproduce` (recompute and compare hashes).
"""

from __future__ import annotations

import argparse
import json
import math
from collections.abc import Mapping, Sequence
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import numpy as np
from scipy.special import ndtr  # type: ignore[import-untyped]

from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.evaluation import metric_backtest_data as data
from courtlens.ingestion.native_reconstruction import content_hash

REGISTRATION = data.REGISTRATION
SEED = 8008
REPLICATES = 2000
LEVEL = 0.95
CALIBRATION_BINS = 10
PROBABILITY_CLIP = 1e-6
MINIMUM_PROSPECTIVE_GAMES = 20
RESULTS_PATH = Path("evaluation/research/frozen/courtlens-metric-backtest-v1.json")
MANIFEST_PATH = Path("evaluation/research/frozen/courtlens-metric-backtest-v1-prospective.json")
METRICS = ("rmse", "accuracy", "brier", "log_loss")


def registered_constants() -> dict[str, Any]:
    return {
        "candidates": list(data.CANDIDATES),
        "baseline": data.BASELINE,
        "test_seasons": list(data.TEST_SEASONS),
        "calibration_first": data.CALIBRATION_FIRST,
        "prospective_season": data.PROSPECTIVE,
        "raw_min_controls": data.RAW_MIN_CONTROLS,
        "replacement_quantile": data.REPLACEMENT_QUANTILE,
        "bubble_neutral_from": data.BUBBLE_NEUTRAL_FROM,
        "projected_impact_test": list(data.PROJECTED_IMPACT_TEST),
        "replicates": REPLICATES,
        "level": LEVEL,
        "calibration_bins": CALIBRATION_BINS,
        "probability_clip": PROBABILITY_CLIP,
        "minimum_prospective_games": MINIMUM_PROSPECTIVE_GAMES,
    }


def check_registration(parameters: Mapping[str, Any], seed: int) -> None:
    """Fail loudly if any module constant differs from the registration."""
    for key, value in registered_constants().items():
        if parameters.get(key) != value:
            raise SystemExit(f"module constant {key} differs from the registration")
    if seed != SEED:
        raise SystemExit("seed differs from the registration")


# ---------------------------------------------------------------------------------------------
# Pure scoring (unit-tested on synthetic data).


def design(table: Mapping[str, Any], name: str) -> dict[str, np.ndarray]:
    games = table["games"]
    candidate = table["candidates"][name]
    rows = [data.strength(g, name, candidate) for g in games]
    return {
        "d": np.array([r["d"] for r in rows]),
        "h": np.array([0.0 if g["neutral"] else 1.0 for g in games]),
        "margin": np.array([float(g["margin"]) for g in games]),
        "replaced": np.array([r["replaced"] for r in rows]),
        "total": np.array([r["total"] for r in rows]),
    }


def calibrate(d: np.ndarray, h: np.ndarray, margin: np.ndarray) -> dict[str, float]:
    """Least squares of margin on [H, D] (no other intercept) and the residual SD (n - 2)."""
    x = np.column_stack([h, d])
    coef, _, rank, _ = np.linalg.lstsq(x, margin, rcond=None)
    if rank != 2 or not np.all(np.isfinite(coef)):
        raise ValueError(f"calibration fit failed (rank {rank})")
    residual = margin - x @ coef
    sigma = float(np.sqrt(residual @ residual / (len(margin) - 2)))
    if not math.isfinite(sigma) or sigma <= 0:
        raise ValueError("calibration residual SD is not positive")
    return {"a": float(coef[0]), "b": float(coef[1]), "sigma": sigma, "games": len(margin)}


def predict(c: Mapping[str, float], d: np.ndarray, h: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    mu = c["a"] * h + c["b"] * d
    return mu, np.asarray(ndtr(mu / c["sigma"]), dtype=np.float64)


def game_losses(margin: np.ndarray, mu: np.ndarray, p: np.ndarray) -> dict[str, np.ndarray]:
    """Per-game values whose means are the scores (RMSE is the root of the first)."""
    won = (margin > 0).astype(np.float64)
    q = np.clip(p, PROBABILITY_CLIP, 1 - PROBABILITY_CLIP)
    return {
        "sq": (margin - mu) ** 2,
        "correct": (np.sign(mu) == np.sign(margin)).astype(np.float64),
        "brier": (p - won) ** 2,
        "log_loss": -(won * np.log(q) + (1 - won) * np.log(1 - q)),
    }


def calibration_curve(margin: np.ndarray, p: np.ndarray) -> dict[str, Any]:
    won = (margin > 0).astype(np.float64)
    edges = np.linspace(0, 1, CALIBRATION_BINS + 1)
    index = np.clip(np.digitize(p, edges[1:-1]), 0, CALIBRATION_BINS - 1)
    bins = []
    ece = 0.0
    for b in range(CALIBRATION_BINS):
        chosen = index == b
        n = int(chosen.sum())
        if n == 0:
            bins.append({"low": float(edges[b]), "high": float(edges[b + 1]), "games": 0})
            continue
        predicted, observed = float(p[chosen].mean()), float(won[chosen].mean())
        ece += n / len(p) * abs(predicted - observed)
        bins.append(
            {
                "low": float(edges[b]),
                "high": float(edges[b + 1]),
                "games": n,
                "predicted": predicted,
                "observed": observed,
            }
        )
    return {"bins": bins, "ece": float(ece)}


def scores(losses: Mapping[str, np.ndarray]) -> dict[str, float]:
    return {
        "rmse": float(np.sqrt(losses["sq"].mean())),
        "accuracy": float(losses["correct"].mean()),
        "brier": float(losses["brier"].mean()),
        "log_loss": float(losses["log_loss"].mean()),
    }


def resample_counts(n: int, year: int, replicates: int = REPLICATES) -> np.ndarray:
    """Game multiplicities per replicate for one season; every candidate uses the same draws."""
    rng = np.random.default_rng(np.random.SeedSequence([SEED, year]))
    picks = rng.integers(0, n, size=(replicates, n))
    counts = np.zeros((replicates, n), dtype=np.float64)
    np.add.at(counts, (np.repeat(np.arange(replicates), n), picks.reshape(-1)), 1.0)
    return counts


def replicate_means(
    counts: Mapping[str, np.ndarray], values: Mapping[str, np.ndarray], seasons: Sequence[str]
) -> np.ndarray:
    """Pooled mean per replicate over seasons (each season resampled within itself)."""
    total = sum(counts[s] @ values[s] for s in seasons)
    n = sum(len(values[s]) for s in seasons)
    return np.asarray(total, dtype=np.float64) / n


def metric_replicates(
    counts: Mapping[str, np.ndarray],
    losses: Mapping[str, Mapping[str, np.ndarray]],
    seasons: Sequence[str],
) -> dict[str, np.ndarray]:
    def mean(key: str) -> np.ndarray:
        return replicate_means(counts, {s: losses[s][key] for s in seasons}, seasons)

    return {
        "rmse": np.sqrt(mean("sq")),
        "accuracy": mean("correct"),
        "brier": mean("brier"),
        "log_loss": mean("log_loss"),
    }


def pooled_scores(
    losses: Mapping[str, Mapping[str, np.ndarray]], seasons: Sequence[str]
) -> dict[str, float]:
    keys = ("sq", "correct", "brier", "log_loss")
    return scores({k: np.concatenate([losses[s][k] for s in seasons]) for k in keys})


def interval(values: np.ndarray) -> dict[str, float]:
    tail = (1 - LEVEL) / 2
    return {"low": float(np.quantile(values, tail)), "high": float(np.quantile(values, 1 - tail))}


def gain(metric: str, candidate: Any, reference: Any) -> Any:
    """Positive favours the candidate: lower error, or higher accuracy."""
    return candidate - reference if metric == "accuracy" else reference - candidate


def pair_verdict(pooled: Mapping[str, float], season_gains: Sequence[float]) -> str:
    """Registered rule: the pooled 95% interval of the RMSE gain excludes zero on one side AND
    the same candidate has the lower RMSE in more than half of the common seasons."""
    wins = sum(g > 0 for g in season_gains)
    losses = sum(g < 0 for g in season_gains)
    half = len(season_gains) / 2
    if pooled["low"] > 0 and wins > half:
        return "candidate_better"
    if pooled["high"] < 0 and losses > half:
        return "reference_better"
    return "no_ranking"


# ---------------------------------------------------------------------------------------------
# The backtest.


def available(tables: Mapping[str, Mapping[str, Any]]) -> dict[str, list[str]]:
    return {
        name: [s for s in sorted(tables) if "unavailable" not in tables[s]["candidates"][name]]
        for name in data.CANDIDATES
    }


def calibration_season(name: str, season: str, seasons_with: Mapping[str, list[str]]) -> str | None:
    earlier = [s for s in seasons_with[name] if s < season]
    return earlier[-1] if earlier else None


def test_seasons_for(name: str, seasons_with: Mapping[str, list[str]]) -> list[str]:
    allowed = set(data.TEST_SEASONS)
    if name == "projected_impact":
        allowed = set(data.PROJECTED_IMPACT_TEST)
    return [
        s
        for s in seasons_with[name]
        if s in allowed and calibration_season(name, s, seasons_with) is not None
    ]


def run(tables: Mapping[str, Mapping[str, Any]], receipt: Mapping[str, Any]) -> dict[str, Any]:
    seasons_with = available(tables)
    designs = {
        (name, s): design(tables[s], name) for name in data.CANDIDATES for s in seasons_with[name]
    }
    tested = {name: test_seasons_for(name, seasons_with) for name in data.CANDIDATES}
    calibrations: dict[str, dict[str, Any]] = {}
    losses: dict[str, dict[str, dict[str, np.ndarray]]] = {}
    candidates: dict[str, Any] = {}
    curves_input: dict[str, list[tuple[np.ndarray, np.ndarray]]] = {}
    for name in data.CANDIDATES:
        calibrations[name] = {}
        losses[name] = {}
        per_season: dict[str, Any] = {}
        for s in tested[name]:
            k = calibration_season(name, s, seasons_with)
            assert k is not None
            cal = designs[(name, k)]
            c: dict[str, Any] = {**calibrate(cal["d"], cal["h"], cal["margin"]), "fitted_on": k}
            calibrations[name][s] = c
            x = designs[(name, s)]
            mu, p = predict(c, x["d"], x["h"])
            losses[name][s] = game_losses(x["margin"], mu, p)
            curves_input.setdefault(name, []).append((x["margin"], p))
            replaced = float(x["replaced"].sum() / x["total"].sum()) if x["total"].sum() else 0.0
            per_season[s] = {
                **scores(losses[name][s]),
                "games": len(x["margin"]),
                "calibration": c,
                "replaced_minutes_share": replaced,
                "mean_error": float(np.mean(x["margin"] - mu)),
            }
        margin = np.concatenate([m for m, _ in curves_input.get(name, [])] or [np.zeros(0)])
        probability = np.concatenate([p for _, p in curves_input.get(name, [])] or [np.zeros(0)])
        candidates[name] = {
            "test_seasons": tested[name],
            "seasons": per_season,
            "pooled": {
                **pooled_scores(losses[name], tested[name]),
                "games": int(sum(per_season[s]["games"] for s in tested[name])),
            },
            "calibration_curve": calibration_curve(margin, probability),
        }

    # Same game draws for every candidate within a season.
    games_per_season = {s: len(tables[s]["games"]) for s in data.TEST_SEASONS}
    counts = {s: resample_counts(n, int(s[:4])) for s, n in games_per_season.items()}
    for name in data.CANDIDATES:
        for s in tested[name]:
            reps = metric_replicates(counts, losses[name], [s])
            candidates[name]["seasons"][s]["intervals"] = {m: interval(reps[m]) for m in METRICS}
        reps = metric_replicates(counts, losses[name], tested[name])
        candidates[name]["pooled"]["intervals"] = {m: interval(reps[m]) for m in METRICS}

    pairs = []
    order = list(data.CANDIDATES)
    for i, reference in enumerate(order):
        for name in order[i + 1 :]:
            common = [s for s in tested[name] if s in tested[reference]]
            if not common:
                continue
            entry: dict[str, Any] = {
                "candidate": name,
                "reference": reference,
                "seasons": common,
                "games": int(sum(games_per_season[s] for s in common)),
                "per_season": {},
                "pooled": {},
            }
            for s in common:
                a = metric_replicates(counts, losses[name], [s])
                b = metric_replicates(counts, losses[reference], [s])
                entry["per_season"][s] = {
                    m: {
                        "gain": gain(
                            m,
                            candidates[name]["seasons"][s][m],
                            candidates[reference]["seasons"][s][m],
                        ),
                        **interval(gain(m, a[m], b[m])),
                    }
                    for m in METRICS
                }
            a = metric_replicates(counts, losses[name], common)
            b = metric_replicates(counts, losses[reference], common)
            point_a = pooled_scores(losses[name], common)
            point_b = pooled_scores(losses[reference], common)
            entry["pooled"] = {
                m: {
                    "gain": gain(m, point_a[m], point_b[m]),
                    **interval(gain(m, a[m], b[m])),
                }
                for m in METRICS
            }
            entry["seasons_candidate_lower_rmse"] = sum(
                entry["per_season"][s]["rmse"]["gain"] > 0 for s in common
            )
            entry["verdict"] = pair_verdict(
                entry["pooled"]["rmse"], [entry["per_season"][s]["rmse"]["gain"] for s in common]
            )
            pairs.append(entry)

    results = {
        "version": REGISTRATION,
        "registration": dict(receipt),
        "tables": {s: tables[s]["_sha256"] for s in sorted(tables)},
        "candidates": candidates,
        "pairs": pairs,
        "verdict": verdict(pairs, tested),
        "leakage": {s: data.leakage_audit(tables[s]) for s in sorted(tables)},
    }
    results["results_sha256"] = content_hash(results)
    return results


def verdict(pairs: Sequence[Mapping[str, Any]], tested: Mapping[str, list[str]]) -> dict[str, Any]:
    """The registered rule, applied mechanically: orderings, the baseline result, any best."""
    better: dict[str, set[str]] = {n: set() for n in data.CANDIDATES}
    shares: dict[str, set[str]] = {n: set() for n in data.CANDIDATES}
    orderings = []
    for p in pairs:
        a, b = p["candidate"], p["reference"]
        shares[a].add(b)
        shares[b].add(a)
        if p["verdict"] == "candidate_better":
            better[a].add(b)
            orderings.append({"better": a, "worse": b, "seasons": p["seasons"]})
        elif p["verdict"] == "reference_better":
            better[b].add(a)
            orderings.append({"better": b, "worse": a, "seasons": p["seasons"]})
    tested_names = [n for n in data.CANDIDATES if tested[n]]
    best = [n for n in tested_names if shares[n] and better[n] == shares[n]]
    baseline = {}
    for p in pairs:
        if p["reference"] == data.BASELINE:
            baseline[p["candidate"]] = p["verdict"]
    return {
        "rule": "pooled 95% interval of the RMSE gain excludes zero, and the same metric has "
        "the lower RMSE in more than half of the common seasons; otherwise no ranking",
        "orderings": orderings,
        "against_baseline": baseline,
        "best": best,
        "unranked_pairs": sum(p["verdict"] == "no_ranking" for p in pairs),
    }


# ---------------------------------------------------------------------------------------------
# Commands.


def load_tables(output: Path, pinned: Mapping[str, str]) -> dict[str, dict[str, Any]]:
    tables = {}
    for season in data.TABLE_SEASONS:
        body = data.read_table(output, pinned[season])
        if body["season"] != season or body["version"] != REGISTRATION:
            raise SystemExit(f"table for {season} is not this registration's")
        tables[season] = {**body, "_sha256": pinned[season]}
    return tables


def checked_inputs(output: Path) -> tuple[dict[str, dict[str, Any]], dict[str, Any]]:
    registration = load_registration(REGISTRATION)
    check_registration(registration.parameters, registration.seed)
    pinned = registration.parameters["table_sha256"]
    return load_tables(output, pinned), registration_receipt(REGISTRATION)


def write_json(path: Path, body: Mapping[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")


def command_test(output: Path, results_path: Path) -> dict[str, Any]:
    if results_path.exists():
        raise SystemExit("the backtest has been read; `reproduce` recomputes it, a change is v2")
    tables, receipt = checked_inputs(output)
    results = run(tables, receipt)
    write_json(results_path, results)
    return {"results_sha256": results["results_sha256"], "verdict": results["verdict"]}


def command_reproduce(output: Path, results_path: Path) -> dict[str, Any]:
    tables, receipt = checked_inputs(output)
    again = run(tables, receipt)
    frozen = json.loads(results_path.read_text())
    return {
        "frozen": frozen["results_sha256"],
        "recomputed": again["results_sha256"],
        "identical": frozen["results_sha256"] == again["results_sha256"],
    }


def prospective_calibration(tables: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    """2026-27 a, b and SD per candidate, from 2025-26 under the same rule."""
    seasons_with = available(tables)
    out = {}
    for name in data.CANDIDATES:
        k = [s for s in seasons_with[name] if s < data.PROSPECTIVE][-1]
        x = design(tables[k], name)
        out[name] = {**calibrate(x["d"], x["h"], x["margin"]), "fitted_on": k}
    return out


def command_freeze(output: Path, results_path: Path, manifest_path: Path) -> dict[str, Any]:
    if manifest_path.exists():
        raise SystemExit("already frozen")
    if not results_path.exists():
        raise SystemExit("run the backtest first")
    tables, receipt = checked_inputs(output)
    pinned = receipt["parameters"]["table_sha256"]["prospective"]
    prospective = data.read_table(output, pinned)
    manifest: dict[str, Any] = {
        "version": f"{REGISTRATION}-prospective-2026-27",
        "registration_sha256": receipt["content_sha256"],
        "results_sha256": json.loads(results_path.read_text())["results_sha256"],
        "frozen_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "prospective_table_sha256": pinned,
        "season": prospective["season"],
        "calibration": prospective_calibration(tables),
        "first_prospective_rule": "scheduled tip after frozen_at",
        "minimum_games_for_interval": MINIMUM_PROSPECTIVE_GAMES,
        "seed": SEED,
        "replicates": REPLICATES,
    }
    manifest["manifest_sha256"] = content_hash(manifest)
    write_json(manifest_path, manifest)
    return {"frozen_at": manifest["frozen_at"], "manifest_sha256": manifest["manifest_sha256"]}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("test", "reproduce", "freeze"))
    parser.add_argument("--output", type=Path, default=data.OUTPUT)
    parser.add_argument("--results", type=Path, default=RESULTS_PATH)
    parser.add_argument("--manifest", type=Path, default=MANIFEST_PATH)
    args = parser.parse_args()
    if args.command == "test":
        out = command_test(args.output, args.results)
    elif args.command == "reproduce":
        out = command_reproduce(args.output, args.results)
    else:
        out = command_freeze(args.output, args.results, args.manifest)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
