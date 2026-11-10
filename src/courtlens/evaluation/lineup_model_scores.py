"""Per-model test scores of `courtlens-lineup-model-v1`, restored from the saved test weights.

Disclosed defect: the pinned runner's `run_test` builds its results with `**block` (whose key
`models` holds each model's WRMSE and interval per season and pooled) and then sets `models` to
the map of saved weight hashes, so the frozen results file keeps the weight hashes and loses the
score block. The verdict, gains, subsets, diagnostics and game strengths were computed before
that line and are intact. The runner is hash-pinned by the registration and is not edited.

This module reloads the weights the frozen results name (hash-checked), predicts the same test
stints with the same functions, and recomputes `bootstrap_block`. It writes the score block only
if every recomputed gain (per season and pooled, point and interval) equals the frozen one
exactly, which proves it is the same computation. No choice depends on it.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from courtlens.domain.research_registry import load_registration
from courtlens.evaluation import lineup_model_core as core
from courtlens.evaluation import lineup_model_data as data
from courtlens.evaluation import lineup_model_runner as runner
from courtlens.ingestion.native_reconstruction import content_hash

SCORES_PATH = Path("evaluation/research/frozen/courtlens-lineup-model-v1-scores.json")


def restore(output: Path) -> dict[str, Any]:
    frozen = json.loads(runner.RESULTS_PATH.read_text())
    digest = frozen.pop("results_sha256")
    if content_hash(frozen) != digest:
        raise SystemExit("frozen results changed")
    pinned = load_registration(runner.REGISTRATION).parameters["dataset_sha256"]
    s, b = data.read_dataset(output, pinned)
    parts: dict[str, dict[str, Any]] = {"ridge": {}, "lineup": {}, "home_only": {}}
    for target in data.TEST:
        fit = runner.Fit(s, b, target)
        names = frozen["models"][target]
        seeds = runner.unflatten(runner.load_weights(output, names["lineup"]))
        w = runner.load_weights(output, names["ridge"])
        ridge = core.Ridge(0.0, w["b_own"], w["gamma"], float(w["gamma0"]), float(w["home"]))
        parts["lineup"][target] = runner.season_scores(fit, core.predict_ensemble(seeds, fit.test))
        parts["ridge"][target] = runner.season_scores(fit, core.predict_ridge(ridge, fit.test))
        parts["home_only"][target] = runner.season_scores(fit, runner.home_only(fit))
    block = runner.bootstrap_block(parts, data.TEST)
    if block["gains"] != frozen["gains"]:
        raise SystemExit("recomputed gains differ from the frozen results; nothing written")
    body = {
        "version": runner.REGISTRATION,
        "results_sha256": digest,
        "weights": frozen["models"],
        "models": block["models"],
        "gains_equal_frozen": True,
        "defect": "run_test overwrote the score block's key `models` with the weight-hash map; "
        "scores restored from the saved weights with the same functions, gains identical",
    }
    body["scores_sha256"] = content_hash(body)
    return body


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=data.OUTPUT)
    parser.add_argument("--check", action="store_true", help="recompute and compare to the file")
    args = parser.parse_args()
    body = restore(args.output)
    if args.check:
        frozen = json.loads(SCORES_PATH.read_text())["scores_sha256"]
        print(
            json.dumps(
                {
                    "frozen": frozen,
                    "recomputed": body["scores_sha256"],
                    "identical": frozen == body["scores_sha256"],
                }
            )
        )
        return
    SCORES_PATH.write_text(json.dumps(body, indent=1, sort_keys=True) + "\n")
    print(
        json.dumps(
            {
                "scores_sha256": body["scores_sha256"],
                "pooled": {m: v["pooled"] for m, v in body["models"].items()},
            },
            indent=1,
        )
    )


if __name__ == "__main__":
    main()
