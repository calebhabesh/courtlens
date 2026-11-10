"""The lineup model in R08's game backtest (`courtlens-lineup-backtest-v1`, R14).

A new registration; `courtlens-metric-backtest-v1` and its frozen results are read, never
changed. The game set, scoring, intervals and verdict rule are R08's, with two differences fixed
in the registration:

- **games**: R08's pinned tables for 2022-23 to 2025-26, restricted to games that have R01 stints
  (the lineup model needs who played together; R01 excluded a few games a season);
- **candidates**: R08's nine, plus `lineup_model` and `lineup_ridge`, whose strength is the sum
  over the game's stints of (seconds / 2,880) x the predicted margin per 100 at a neutral site,
  from the fit for that season (trained on the three seasons before it). `lineup_ridge` is the
  same ridge on the same stints, so the pair isolates the interaction term.

Test seasons are the lineup model's held-out seasons, 2023-24 to 2025-26; 2022-23 only supplies
calibration. Every other rule (a, b and SD from the latest earlier season, Phi win probability,
paired game bootstrap with R08's seed, the verdict rule) is R08's code, imported unchanged.
"""

from __future__ import annotations

import argparse
import json
import resource
import time
from collections.abc import Mapping, Sequence
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain.research_registry import load_registration, registration_receipt
from courtlens.evaluation import metric_backtest_data as v1data
from courtlens.evaluation import metric_backtest_runner as v1
from courtlens.evaluation.lineup_model_data import OUTPUT
from courtlens.ingestion.native_reconstruction import content_hash

REGISTRATION = "courtlens-lineup-backtest-v1"
V1 = "courtlens-metric-backtest-v1"
LINEUP_RESULTS = Path("evaluation/research/frozen/courtlens-lineup-model-v1.json")
RESULTS_PATH = Path("evaluation/research/frozen/courtlens-lineup-backtest-v1.json")
SEASONS = ("2022-23", "2023-24", "2024-25", "2025-26")
TEST_SEASONS = SEASONS[1:]
LINEUP_CANDIDATES = ("lineup_model", "lineup_ridge")
CANDIDATES = (*v1data.CANDIDATES, *LINEUP_CANDIDATES)
SEED = v1.SEED


def registered_constants() -> dict[str, Any]:
    return {
        "seasons": list(SEASONS),
        "test_seasons": list(TEST_SEASONS),
        "candidates": list(CANDIDATES),
        "baseline": v1data.BASELINE,
        "replicates": v1.REPLICATES,
        "level": v1.LEVEL,
        "calibration_bins": v1.CALIBRATION_BINS,
        "projected_impact_test": list(v1data.PROJECTED_IMPACT_TEST),
    }


def checked_inputs(
    output: Path, tables_root: Path
) -> tuple[dict[str, dict[str, Any]], dict[str, Any], dict[str, Any]]:
    registration = load_registration(REGISTRATION)
    for key, value in registered_constants().items():
        if registration.parameters.get(key) != value:
            raise SystemExit(f"module constant {key} differs from the registration")
    if registration.seed != SEED:
        raise SystemExit("seed differs from the registration")
    pinned = load_registration(V1).parameters["table_sha256"]
    if {s: pinned[s] for s in SEASONS} != registration.parameters["v1_table_sha256"]:
        raise SystemExit("R08 table hashes differ from this registration")
    tables = {}
    for season in SEASONS:
        body = v1data.read_table(tables_root, pinned[season])
        if body["season"] != season:
            raise SystemExit(f"table for {season} is not R08's")
        tables[season] = body
    results = json.loads(LINEUP_RESULTS.read_text())
    digest = results.pop("results_sha256")
    if content_hash(results) != digest:
        raise SystemExit("lineup model results changed")
    strengths_digest = results["game_strengths_sha256"]
    strengths = json.loads((output / "game-strengths" / f"{strengths_digest}.json").read_text())
    if content_hash(strengths) != strengths_digest:
        raise SystemExit("game strengths changed")
    receipt = {
        **registration_receipt(REGISTRATION),
        "lineup_results_sha256": digest,
        "game_strengths_sha256": strengths_digest,
    }
    return tables, strengths["seasons"], receipt


def designs(
    tables: Mapping[str, Mapping[str, Any]], strengths: Mapping[str, Mapping[str, Any]]
) -> tuple[dict[tuple[str, str], dict[str, np.ndarray]], dict[str, int]]:
    out: dict[tuple[str, str], dict[str, np.ndarray]] = {}
    games_per_season = {}
    for season in SEASONS:
        table = tables[season]
        games = [g for g in table["games"] if g["game_id"] in strengths[season]]
        games_per_season[season] = len(games)
        restricted = {**table, "games": games}
        for name in v1data.CANDIDATES:
            if "unavailable" not in table["candidates"][name]:
                out[(name, season)] = v1.design(restricted, name)
        for name in LINEUP_CANDIDATES:
            out[(name, season)] = {
                "d": np.array([strengths[season][g["game_id"]][name] for g in games]),
                "h": np.array([0.0 if g["neutral"] else 1.0 for g in games]),
                "margin": np.array([float(g["margin"]) for g in games]),
                "replaced": np.zeros(len(games)),
                "total": np.zeros(len(games)),
            }
    return out, games_per_season


def test_seasons_for(name: str, seasons_with: Sequence[str]) -> list[str]:
    allowed = set(v1data.PROJECTED_IMPACT_TEST) if name == "projected_impact" else set(TEST_SEASONS)
    return [s for s in seasons_with if s in allowed and any(e < s for e in seasons_with)]


def run(
    tables: Mapping[str, Mapping[str, Any]],
    strengths: Mapping[str, Mapping[str, Any]],
    receipt: Mapping[str, Any],
) -> dict[str, Any]:
    design, games_per_season = designs(tables, strengths)
    seasons_with = {n: [s for s in SEASONS if (n, s) in design] for n in CANDIDATES}
    tested = {n: test_seasons_for(n, seasons_with[n]) for n in CANDIDATES}
    losses: dict[str, dict[str, dict[str, np.ndarray]]] = {}
    candidates: dict[str, Any] = {}
    for name in CANDIDATES:
        losses[name] = {}
        per_season: dict[str, Any] = {}
        curve: list[tuple[np.ndarray, np.ndarray]] = []
        for s in tested[name]:
            k = [e for e in seasons_with[name] if e < s][-1]
            cal = design[(name, k)]
            c: dict[str, Any] = {**v1.calibrate(cal["d"], cal["h"], cal["margin"]), "fitted_on": k}
            x = design[(name, s)]
            mu, p = v1.predict(c, x["d"], x["h"])
            losses[name][s] = v1.game_losses(x["margin"], mu, p)
            curve.append((x["margin"], p))
            total = x["total"].sum()
            per_season[s] = {
                **v1.scores(losses[name][s]),
                "games": len(x["margin"]),
                "calibration": c,
                "replaced_minutes_share": float(x["replaced"].sum() / total) if total else 0.0,
                "mean_error": float(np.mean(x["margin"] - mu)),
            }
        margin = np.concatenate([m for m, _ in curve])
        probability = np.concatenate([p for _, p in curve])
        candidates[name] = {
            "test_seasons": tested[name],
            "seasons": per_season,
            "pooled": {
                **v1.pooled_scores(losses[name], tested[name]),
                "games": int(sum(per_season[s]["games"] for s in tested[name])),
            },
            "calibration_curve": v1.calibration_curve(margin, probability),
        }
    counts = {s: v1.resample_counts(games_per_season[s], int(s[:4])) for s in TEST_SEASONS}
    for name in CANDIDATES:
        for s in tested[name]:
            reps = v1.metric_replicates(counts, losses[name], [s])
            candidates[name]["seasons"][s]["intervals"] = {
                m: v1.interval(reps[m]) for m in v1.METRICS
            }
        reps = v1.metric_replicates(counts, losses[name], tested[name])
        candidates[name]["pooled"]["intervals"] = {m: v1.interval(reps[m]) for m in v1.METRICS}
    pairs = []
    for i, reference in enumerate(CANDIDATES):
        for name in CANDIDATES[i + 1 :]:
            common = [s for s in tested[name] if s in tested[reference]]
            if not common:
                continue
            entry: dict[str, Any] = {
                "candidate": name,
                "reference": reference,
                "seasons": common,
                "games": int(sum(games_per_season[s] for s in common)),
                "per_season": {},
            }
            for s in common:
                a = v1.metric_replicates(counts, losses[name], [s])
                b = v1.metric_replicates(counts, losses[reference], [s])
                entry["per_season"][s] = {
                    m: {
                        "gain": v1.gain(
                            m,
                            candidates[name]["seasons"][s][m],
                            candidates[reference]["seasons"][s][m],
                        ),
                        **v1.interval(v1.gain(m, a[m], b[m])),
                    }
                    for m in v1.METRICS
                }
            a = v1.metric_replicates(counts, losses[name], common)
            b = v1.metric_replicates(counts, losses[reference], common)
            pa, pb = (
                v1.pooled_scores(losses[name], common),
                v1.pooled_scores(losses[reference], common),
            )
            entry["pooled"] = {
                m: {"gain": v1.gain(m, pa[m], pb[m]), **v1.interval(v1.gain(m, a[m], b[m]))}
                for m in v1.METRICS
            }
            season_gains = [entry["per_season"][s]["rmse"]["gain"] for s in common]
            entry["seasons_candidate_lower_rmse"] = sum(g > 0 for g in season_gains)
            entry["verdict"] = v1.pair_verdict(entry["pooled"]["rmse"], season_gains)
            pairs.append(entry)
    results = {
        "version": REGISTRATION,
        "registration": dict(receipt),
        "games_per_season": games_per_season,
        "games_without_stints": {s: len(tables[s]["games"]) - games_per_season[s] for s in SEASONS},
        "candidates": candidates,
        "pairs": pairs,
        "verdict": verdict(pairs, tested),
    }
    results["results_sha256"] = content_hash(results)
    return results


def verdict(pairs: Sequence[Mapping[str, Any]], tested: Mapping[str, list[str]]) -> dict[str, Any]:
    better: dict[str, set[str]] = {n: set() for n in CANDIDATES}
    shares: dict[str, set[str]] = {n: set() for n in CANDIDATES}
    for p in pairs:
        a, b = p["candidate"], p["reference"]
        shares[a].add(b)
        shares[b].add(a)
        if p["verdict"] == "candidate_better":
            better[a].add(b)
        elif p["verdict"] == "reference_better":
            better[b].add(a)
    lineup = {}
    for p in pairs:
        if "lineup_model" in (p["candidate"], p["reference"]):
            other = p["reference"] if p["candidate"] == "lineup_model" else p["candidate"]
            flipped = {
                "candidate_better": "reference_better",
                "reference_better": "candidate_better",
            }
            v = (
                p["verdict"]
                if p["candidate"] == "lineup_model"
                else flipped.get(p["verdict"], p["verdict"])
            )
            lineup[other] = {
                "candidate_better": "lineup_better",
                "reference_better": "other_better",
            }.get(v, "no_ranking")
    return {
        "rule": "R08's: pooled 95% interval of the RMSE gain excludes zero, and the same metric "
        "has the lower RMSE in more than half of the common seasons; otherwise no ranking",
        "lineup_model_against": lineup,
        "best": [n for n in CANDIDATES if tested[n] and shares[n] and better[n] == shares[n]],
        "unranked_pairs": sum(p["verdict"] == "no_ranking" for p in pairs),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("test", "reproduce"))
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--tables", type=Path, default=v1data.OUTPUT)
    args = parser.parse_args()
    started = time.monotonic()
    tables, strengths, receipt = checked_inputs(args.output, args.tables)
    if args.command == "test":
        if RESULTS_PATH.exists():
            raise SystemExit("the backtest has been read; `reproduce` recomputes it")
        results = run(tables, strengths, receipt)
        v1.write_json(RESULTS_PATH, results)
        out: dict[str, Any] = {
            "results_sha256": results["results_sha256"],
            "verdict": results["verdict"],
        }
    else:
        again = run(tables, strengths, receipt)["results_sha256"]
        frozen = json.loads(RESULTS_PATH.read_text())["results_sha256"]
        out = {"frozen": frozen, "recomputed": again, "identical": frozen == again}
    out["elapsed_seconds"] = round(time.monotonic() - started, 1)
    out["peak_rss_mib"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
