"""R15b platform check: this machine's predictions against the frozen reference.

`write` scores a fixed sample of real test-season states and commits the result. `check` scores
the same states wherever it runs (the x86 or arm64 image) and compares. Tolerance 1e-6 in
probability: far below anything shown, and above floating-point noise between builds.
"""

from __future__ import annotations

import argparse
import json
import platform
import resource
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.services.win_probability_production import get_model, load_manifest
from courtlens.services.win_probability_serving import GameInputs, StateColumns

REFERENCE = Path("evaluation/research/frozen/courtlens-win-probability-v2-platform.json")
TOLERANCE = 1e-6


def score(reference: dict[str, Any]) -> np.ndarray:
    model = get_model()
    results = []
    for game in reference["games"]:
        states = StateColumns(
            np.array(game["time"]),
            np.array(game["period"], dtype=np.int64),
            {k: np.array(v) for k, v in game["columns"].items()},
        )
        results.append(model.predict_home(states, GameInputs(**game["inputs"])))
    return np.concatenate(results)


def write(season: str = "2025-26", count: int = 8) -> dict[str, Any]:
    from courtlens.evaluation.win_probability_data import OUTPUT, read_games
    from courtlens.evaluation.win_probability_models import read_season
    from courtlens.evaluation.win_probability_parity import game_inputs

    table = read_games(OUTPUT)["games"]
    pregame = json.loads((OUTPUT / "pregame.json").read_text())["games"]
    columns, ids = read_season(season)
    index = columns["game_index"].astype(np.int64)
    skip = {"game_index", "time", "period", "target_home", "win_home"}
    games = []
    for number in np.linspace(0, len(ids) - 1, count, dtype=np.int64):
        rows = np.flatnonzero(index == number)
        gid = ids[int(number)]
        games.append(
            {
                "game": gid,
                "time": [float(v) for v in columns["time"][rows]],
                "period": [int(v) for v in columns["period"][rows]],
                "columns": {
                    k: [float(v) for v in values[rows]]
                    for k, values in columns.items()
                    if k not in skip and k in _MODEL_COLUMNS
                },
                "inputs": vars(game_inputs(table[gid], pregame[gid])),
            }
        )
    reference: dict[str, Any] = {
        "manifest_sha256": load_manifest()["manifest_sha256"],
        "games": games,
    }
    reference["probabilities"] = [float(v) for v in score(reference)]
    reference["written_on"] = {"machine": platform.machine(), "python": platform.python_version()}
    REFERENCE.write_text(json.dumps(reference, separators=(",", ":")) + "\n")
    return {"states": len(reference["probabilities"]), "bytes": REFERENCE.stat().st_size}


_MODEL_COLUMNS = {
    "home_score",
    "away_score",
    "possession",
    "possession_start",
    "ft_pending_home",
    "ft_pending_away",
    "timeouts_home",
    "timeouts_away",
    "fouls_home",
    "fouls_away",
    "bonus_home",
    "bonus_away",
}


def check() -> dict[str, Any]:
    reference = json.loads(REFERENCE.read_text())
    if reference["manifest_sha256"] != load_manifest()["manifest_sha256"]:
        raise ValueError("reference was written for another frozen model")
    got = score(reference)
    expected = np.array(reference["probabilities"])
    largest = float(np.abs(got - expected).max())
    return {
        "machine": platform.machine(),
        "python": platform.python_version(),
        "reference": reference["written_on"],
        "states": len(expected),
        "max_abs_difference": largest,
        "tolerance": TOLERANCE,
        "passed": largest <= TOLERANCE,
    }


def latency(count: int = 200) -> dict[str, Any]:
    """Time scoring whole games with Live's path, single-threaded, on archived test games."""
    from courtlens.evaluation.win_probability_data import OUTPUT, read_games
    from courtlens.evaluation.win_probability_parity import game_inputs
    from courtlens.services.win_probability_production import (
        event_series,
        raw_plays,
        read_raw_summary,
    )

    started = time.perf_counter()
    model = get_model()
    load_seconds = time.perf_counter() - started
    table = read_games(OUTPUT)["games"]
    pregame = json.loads((OUTPUT / "pregame.json").read_text())["games"]
    ids = [g for g in sorted(table) if (OUTPUT / "espn" / f"{g}.json").exists()]
    chosen = [ids[int(i)] for i in np.linspace(0, len(ids) - 1, count)]
    times, sizes = [], []
    for gid in chosen:
        extract = json.loads((OUTPUT / "espn" / f"{gid}.json").read_text())
        plays = raw_plays(read_raw_summary(extract["raw_sha256"]))
        record = {"inputs": vars(game_inputs(table[gid], pregame[gid]))}
        begin = time.perf_counter()
        series = event_series(model, plays, record)
        times.append(time.perf_counter() - begin)
        sizes.append(len(series))
    return {
        "machine": platform.machine(),
        "games": count,
        "threads": 1,
        "model_load_seconds": round(load_seconds, 3),
        "events_per_game_mean": round(float(np.mean(sizes)), 1),
        "seconds_p50": round(float(np.quantile(times, 0.5)), 4),
        "seconds_p95": round(float(np.quantile(times, 0.95)), 4),
        "seconds_max": round(float(np.max(times)), 4),
        "peak_rss_mib": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("write", "check", "latency"))
    args = parser.parse_args()
    result = {"write": write, "check": check, "latency": latency}[args.command]()
    print(json.dumps(result))
    if args.command == "check" and not result["passed"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
