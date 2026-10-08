"""Explicit offline IM04 fitting; no serving or publication side effects."""

from __future__ import annotations

import argparse
import json
import platform
import time
from datetime import UTC, datetime
from itertools import pairwise
from pathlib import Path
from typing import Any

import numpy as np
import scipy  # type: ignore[import-untyped]
import sklearn  # type: ignore[import-untyped]
from sklearn.linear_model import Ridge  # type: ignore[import-untyped]
from sklearn.preprocessing import StandardScaler  # type: ignore[import-untyped]
from sqlalchemy import create_engine
from threadpoolctl import threadpool_limits  # type: ignore[import-untyped]

from courtlens.evaluation.impact_rating_inputs import (
    BOX_FIELDS,
    box_profiles,
    read_accepted_inputs,
    select_window,
    write_artifact,
)
from courtlens.evaluation.impact_ratings import (
    choose_alpha,
    fit_target,
    margin_diagnostic,
    on_off,
)
from courtlens.ingestion.native_reconstruction import content_hash
from courtlens.ingestion.sportsdataverse import hash_file

VERSION = "courtlens-impact-ratings-v1"


def build_prior(
    cohorts: dict[str, Any],
    fitted: list[dict[str, Any]],
    phase: str,
    before_season: str,
    raw_root: Path,
) -> tuple[Any, dict[str, Any]]:
    historical = [
        a
        for a in fitted
        if a["input"]["phase"] == phase
        and a["input"]["seasons"][-1] < before_season
        and a["input"]["cutoff"] <= f"{before_season[:4]}-07-01"
    ]
    if not historical:
        return None, {"status": "unavailable", "reason": "no admitted prior-season rating targets"}
    # One longest-window target per historical ending season; no duplicate labels.
    chosen: dict[str, dict[str, Any]] = {}
    for a in historical:
        season = a["input"]["seasons"][-1]
        if season not in chosen or len(a["input"]["seasons"]) > len(
            chosen[season]["input"]["seasons"]
        ):
            chosen[season] = a
    x, y, weights, sample_ids = [], [], [], []
    latest = {}
    sources = {}
    target_hashes = []
    for season, a in sorted(chosen.items()):
        profile, source = box_profiles(cohorts[f"{season}:{phase}"], raw_root)
        sources[season] = source
        latest.update(profile)
        target_hashes.append(content_hash(a))
        for p, r in sorted(a["rapm"]["players"].items()):
            if r["qualified"] and p in profile:
                x.append(profile[p])
                y.append([r["offense"], -r["defense"]])
                weights.append(r["seconds"])
                sample_ids.append(f"{season}:{p}")
    if len(x) < 20:
        return None, {
            "status": "unavailable",
            "reason": "fewer than 20 complete historical targets",
        }
    scaler = StandardScaler()
    z = scaler.fit_transform(np.array(x))
    model = Ridge(alpha=100, solver="cholesky")
    model.fit(z, np.array(y), sample_weight=np.array(weights) / np.mean(weights))
    ids = sorted(latest)
    prediction = model.predict(scaler.transform(np.array([latest[p] for p in ids])))
    prior = {p: (float(prediction[i, 0]), float(prediction[i, 1])) for i, p in enumerate(ids)}
    metadata = {
        "status": "available",
        "target_artifacts": target_hashes,
        "box_sources": sources,
        "samples": sample_ids,
        "features": list(BOX_FIELDS),
        "box_alpha": 100,
        "standardizer_mean": scaler.mean_.tolist(),
        "standardizer_scale": scaler.scale_.tolist(),
        "coefficients": model.coef_.tolist(),
        "intercept": model.intercept_.tolist(),
        "player_priors": prior,
    }
    return prior, metadata


def correlations(artifacts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    one_year = [a for a in artifacts if len(a["input"]["seasons"]) == 1]
    result = []
    for phase in sorted({a["input"]["phase"] for a in one_year}):
        rows = sorted(
            (a for a in one_year if a["input"]["phase"] == phase),
            key=lambda a: a["input"]["seasons"],
        )
        for left, right in pairwise(rows):
            a, b = left["rapm"]["players"], right["rapm"]["players"]
            ids = sorted(p for p in a.keys() & b.keys() if a[p]["qualified"] and b[p]["qualified"])
            values = {}
            for metric in ("offense", "defense", "total"):
                x, y = [a[p][metric] for p in ids], [b[p][metric] for p in ids]
                values[metric] = (
                    float(np.corrcoef(x, y)[0, 1])
                    if len(ids) >= 3 and np.std(x) > 0 and np.std(y) > 0
                    else None
                )
            result.append(
                {
                    "phase": phase,
                    "seasons": [left["input"]["seasons"][0], right["input"]["seasons"][0]],
                    "shared_qualified_players": ids,
                    "pearson": values,
                }
            )
    return result


def run(
    *,
    acceptance: Path,
    bundles: Path,
    output: Path,
    raw_root: Path,
    cutoff: str,
    database_url: str | None = None,
) -> dict[str, Any]:
    started = time.monotonic()
    if sklearn.__version__ != "1.6.1":
        raise ValueError("ratings require pinned scikit-learn 1.6.1")
    engine = create_engine(database_url) if database_url else None
    try:
        cohorts, provenance = read_accepted_inputs(acceptance, bundles, engine)
    finally:
        if engine:
            engine.dispose()
    implementation = {
        name: hash_file(Path(name))[0]
        for name in (
            "src/courtlens/evaluation/impact_ratings.py",
            "src/courtlens/evaluation/impact_rating_inputs.py",
            "src/courtlens/evaluation/impact_rating_runner.py",
            "docs/design/impact-ratings-v1.md",
        )
    }
    dependencies = {
        "python": platform.python_version(),
        "numpy": np.__version__,
        "scipy": scipy.__version__,
        "sklearn": sklearn.__version__,
    }
    artifacts: list[dict[str, Any]] = []
    receipts = []
    with threadpool_limits(limits=1):
        for phase in sorted({c["phase"] for c in cohorts.values()}):
            seasons = sorted(c["season"] for c in cohorts.values() if c["phase"] == phase)
            for end in range(len(seasons)):
                for years in range(1, min(end + 1, 3) + 1):
                    window = seasons[end + 1 - years : end + 1]
                    selected = [cohorts[f"{s}:{phase}"] for s in window]
                    # Before-start windows have no meaningful fit; never consume future records.
                    if not any(g["day"] < cutoff for g in selected[-1]["games"].values()):
                        continue
                    window_cutoff = min(cutoff, f"{int(window[-1][:4]) + 1}-07-01")
                    stints, inputs = select_window(selected, window_cutoff)
                    print(f"fitting {phase} {window} {len(stints)} stints", flush=True)
                    rapm_alpha, rapm_cv = choose_alpha(stints, ("rapm",))
                    factor_alpha, factor_cv = choose_alpha(stints, ("ts", "tov", "reb"))
                    prior, prior_metadata = build_prior(
                        cohorts, artifacts, phase, window[0], raw_root
                    )
                    obj = {
                        "version": VERSION,
                        "claim": "descriptive model estimate under lineup confounding",
                        "input": inputs,
                        "implementation": implementation,
                        "dependencies": dependencies,
                        "rapm_cv": rapm_cv,
                        "six_factor_cv": factor_cv,
                        "rapm": fit_target(stints, "rapm", rapm_alpha),
                        "six_factor": {
                            t: fit_target(stints, t, factor_alpha) for t in ("ts", "tov", "reb")
                        },
                        "on_off": on_off(stints),
                        "bpr_prior": prior_metadata,
                        "bpr": fit_target(stints, "rapm", rapm_alpha, prior)
                        if prior is not None
                        else None,
                        "margin_diagnostic": margin_diagnostic(stints),
                    }
                    path, digest = write_artifact(output / "ratings", obj)
                    artifacts.append(obj)
                    receipts.append(
                        {"seasons": window, "phase": phase, "sha256": digest, "path": str(path)}
                    )
                    print(f"saved {digest} alpha={rapm_alpha}/{factor_alpha}", flush=True)
    summary = {
        "version": VERSION,
        "artifacts": receipts,
        "correlations": correlations(artifacts),
        "provenance": provenance,
        "database_readback": engine is not None,
        "elapsed_seconds": round(time.monotonic() - started, 3),
        "observed_at": datetime.now(UTC).isoformat(),
    }
    path, digest = write_artifact(output / "runs", summary)
    print(
        json.dumps(
            {"receipt": str(path), "sha256": digest, "elapsed_seconds": summary["elapsed_seconds"]}
        ),
        flush=True,
    )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--acceptance",
        type=Path,
        default=Path("docs/evidence/im03-event-gate/acceptance-v2.json.gz"),
    )
    parser.add_argument(
        "--bundles", type=Path, default=Path("data/derived/impact-event-gate/bundles")
    )
    parser.add_argument("--output", type=Path, default=Path("data/derived/impact-ratings-v1"))
    parser.add_argument("--raw-root", type=Path, default=Path("data/raw"))
    parser.add_argument("--cutoff", required=True)
    parser.add_argument("--database-url", help="Optional accepted proof PostgreSQL URL; read-only")
    args = parser.parse_args()
    run(
        acceptance=args.acceptance,
        bundles=args.bundles,
        output=args.output,
        raw_root=args.raw_root,
        cutoff=args.cutoff,
        database_url=args.database_url,
    )


if __name__ == "__main__":
    main()
