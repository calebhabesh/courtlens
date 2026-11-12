"""W3 freeze checks for `courtlens-win-probability-v4` (K1), run before any freeze.

- `parity`: states built from ESPN, against states built from the training archive, on every
  2024-25 and 2025-26 game with an archived ESPN summary (v2's R15b check, reading mu4). Registered
  limit: the change in v4's stage C log loss is no more than 0.002. It is run with stage C's w, so
  the archive states must also reproduce stage C's saved predictions: that proves the serving path
  (`services.win_probability_market`) is the model stage C measured.
- `latency`: p95 seconds to score a whole game with Live's path on one thread (limit 0.1 s).
- `platform-write`: a fixed sample of real states with stage F's mu4, scored here; the reference
  for the arm64 check. `platform-check --reference -` scores the same states wherever it runs (the
  API container on the VPS) and compares, limit 1e-9. It needs only the Original's model files.

Outputs go to `data/derived/win-probability-v4` with copies under the evidence directory. Nothing
here writes a manifest, a model file or the serving directory.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import platform
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain.research_registry import load_registration

REGISTRATION = "courtlens-win-probability-v4"
FREEZE = load_registration(REGISTRATION).parameters["freeze_checks"]
LOG_LOSS_LIMIT = float(FREEZE["espn_state_parity_max_log_loss_change"])
P95_LIMIT_SECONDS = float(FREEZE["p95_ms_per_game_max"]) / 1000
ARM64_LIMIT = float(FREEZE["arm64_max_probability_difference"])
PARITY = "freeze-parity.json"
LATENCY = "freeze-latency.json"
PLATFORM_REFERENCE = "platform-reference.json"


def _paths() -> tuple[Path, Path]:
    from courtlens.evaluation.win_probability_v4 import EVIDENCE, OUTPUT

    return OUTPUT, EVIDENCE


def _write(name: str, body: dict[str, Any], compact: bool = False) -> Path:
    output, evidence = _paths()
    text = (
        json.dumps(body, separators=(",", ":"))
        if compact
        else json.dumps(body, indent=1, sort_keys=True)
    ) + "\n"
    for directory in (output, evidence):
        directory.mkdir(parents=True, exist_ok=True)
        (directory / name).write_text(text)
    return output / name


def mu4_for(w: float) -> Any:
    from courtlens.evaluation.win_probability_v4 import MU4, market_pregame

    games = market_pregame(w)["games"]

    def lookup(gid: str) -> float:
        return float(games[gid][MU4])

    return lookup


def parity() -> dict[str, Any]:
    from courtlens.evaluation import win_probability_models as wpm
    from courtlens.evaluation import win_probability_parity
    from courtlens.evaluation.win_probability_v4 import CHECK_REPORT, read_json

    output, _ = _paths()
    report = read_json(output / CHECK_REPORT)
    w = float(report["weight"]["w"])
    result = win_probability_parity.run(
        mu_for=mu4_for(w),
        reference=lambda season: wpm.read_prediction(output, "v4_check", season),
    )
    changes = {
        "espn_same_times": result["log_loss_change_aligned"],
        "espn_own_sample": result["log_loss_change_own_sample"],
    }
    body = {
        "version": REGISTRATION,
        "check": "espn_state_parity",
        "w": w,
        "w_from": "stage C (the model whose stage C log loss is compared)",
        "limit": LOG_LOSS_LIMIT,
        "rule": "passes when the mean change in log loss is within the limit for both ESPN views",
        "changes": changes,
        "passed": all(abs(c["mean"]) <= LOG_LOSS_LIMIT for c in changes.values()),
        "serving_path_reproduces_stage_c": result["reproduction_max_abs_difference"],
        "r15b_view": {"material": result["material"], "any_material": result["any_material"]},
        "detail": result,
    }
    _write(PARITY, body)
    return {k: body[k] for k in ("w", "changes", "passed", "serving_path_reproduces_stage_c")}


def latency() -> dict[str, Any]:
    from courtlens.evaluation import win_probability_platform_check as platform_check
    from courtlens.evaluation.win_probability_v4 import final_weight

    w = final_weight()
    result = platform_check.latency(mu_for=mu4_for(w))
    body = {
        "version": REGISTRATION,
        "check": "p95_latency",
        "w": w,
        "limit_seconds": P95_LIMIT_SECONDS,
        "passed": result["seconds_p95"] <= P95_LIMIT_SECONDS,
        **result,
    }
    _write(LATENCY, body)
    return body


def platform_write() -> dict[str, Any]:
    from courtlens.evaluation import win_probability_platform_check as platform_check
    from courtlens.evaluation.win_probability_v4 import FINAL_FIT, read_json
    from courtlens.services.win_probability_production import load_manifest

    output, _ = _paths()
    final = read_json(output / FINAL_FIT)
    w = float(final["weight"]["w"])
    reference: dict[str, Any] = {
        "version": REGISTRATION,
        "w": w,
        "final_fit_sha256": hashlib.sha256((output / FINAL_FIT).read_bytes()).hexdigest(),
        "manifest_sha256": load_manifest()["manifest_sha256"],
        "games": platform_check.reference_games(mu_for=mu4_for(w)),
    }
    reference["probabilities"] = [float(v) for v in platform_check.score(reference)]
    reference["written_on"] = {"machine": platform.machine(), "python": platform.python_version()}
    path = _write(PLATFORM_REFERENCE, reference, compact=True)
    return {"states": len(reference["probabilities"]), "bytes": path.stat().st_size, "w": w}


def platform_check(reference: dict[str, Any]) -> dict[str, Any]:
    """Score the reference states here; every probability within the registered 1e-9."""
    from courtlens.evaluation import win_probability_platform_check as platform_check
    from courtlens.services.win_probability_production import load_manifest

    if reference.get("version") != REGISTRATION:
        raise ValueError("not a v4 platform reference")
    if reference["manifest_sha256"] != load_manifest()["manifest_sha256"]:
        raise ValueError("reference was written for another Original model")
    started = time.perf_counter()
    got = platform_check.score(reference)
    expected = np.array(reference["probabilities"])
    largest = float(np.abs(got - expected).max())
    return {
        "version": REGISTRATION,
        "check": "arm64_parity",
        "machine": platform.machine(),
        "python": platform.python_version(),
        "reference": reference["written_on"],
        "w": reference["w"],
        "states": len(expected),
        "max_abs_difference": largest,
        "limit": ARM64_LIMIT,
        "passed": largest <= ARM64_LIMIT,
        "seconds": round(time.perf_counter() - started, 3),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "command", choices=("parity", "latency", "platform-write", "platform-check")
    )
    parser.add_argument(
        "--reference", help="platform-check: the reference file, or - for stdin", default=None
    )
    args = parser.parse_args()
    if args.command == "platform-check":
        if args.reference is None:
            output, _ = _paths()
            text = (output / PLATFORM_REFERENCE).read_text()
        elif args.reference == "-":
            text = sys.stdin.read()
        else:
            text = Path(args.reference).read_text()
        result = platform_check(json.loads(text))
        print(json.dumps(result))
        if not result["passed"]:
            sys.exit(1)
        return
    result = {"parity": parity, "latency": latency, "platform-write": platform_write}[
        args.command
    ]()
    print(json.dumps(result, indent=1), flush=True)


if __name__ == "__main__":
    main()
