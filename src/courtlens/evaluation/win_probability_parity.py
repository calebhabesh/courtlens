"""R15b pre-freeze check: do states built from ESPN match states built from the training archive?

For every test-season game with an archived ESPN summary, build states from both sources, compare
them feature by feature at the same times, and score both with the selected model. Pregame inputs
are the same for both, so any difference comes from the play-by-play source.

Materiality was fixed before the first full run. The difference is material if any of these hold:
- the pooled log-loss change has a 95% interval excluding zero and a size of at least 0.002
  (about 15% of the model's +0.0130 gain on the baseline);
- calibration error on ESPN-built states exceeds the registered 0.02 limit;
- the mean absolute probability difference between sources exceeds 0.01.
"""

from __future__ import annotations

import argparse
import dataclasses
import gzip
import json
import tempfile
import time
from collections import Counter
from collections.abc import Callable
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.domain.live import parse_plays, score_running
from courtlens.domain.win_probability_live import AWAY_ID, HOME_ID, replay_rows
from courtlens.domain.win_probability_state import COLUMNS, Replay, replay
from courtlens.evaluation.impact_history_fits import bundle_paths
from courtlens.evaluation.impact_rating_inputs import checked
from courtlens.evaluation.win_probability_data import (
    OUTPUT,
    SEALED_OBSERVATION,
    read_games,
)
from courtlens.evaluation.win_probability_models import (
    MU_FORM,
    MU_FULL,
    bootstrap_interval,
    calibration,
    read_ladder,
    read_prediction,
    read_season,
    state_losses,
)
from courtlens.ingestion.impact_repair_audit import ArchiveGames
from courtlens.services.win_probability_serving import (
    FrozenModel,
    GameInputs,
    StateColumns,
    sampled_states,
)

ESPN_EXTRACTS = OUTPUT / "espn"
ESPN_RAW = Path("data/raw/espn-wp/summary")
TEST_SEASONS = ("2024-25", "2025-26")
LOG_LOSS_LIMIT = 0.002
ECE_LIMIT = 0.02
PROBABILITY_LIMIT = 0.01
COMPARED = (
    "margin",
    "possession",
    "ft_pending_home",
    "ft_pending_away",
    "timeouts_home",
    "timeouts_away",
    "fouls_home",
    "fouls_away",
    "bonus_home",
    "bonus_away",
    "possession_age",
)
NEAR = {"possession_age": 5.0, "fouls_home": 1.0, "fouls_away": 1.0}


def manifest_from_ladder(output: Path = OUTPUT) -> dict[str, Any]:
    ladder = read_ladder(output)
    accepted = ladder["steps"][ladder["accepted"]]
    if accepted["mu"] != MU_FULL or ladder["end_game"]["mu"] != MU_FULL:
        raise ValueError("the selected model does not use the full mu0")
    return {
        "main_features": accepted["features"],
        "end_game_features": ladder["end_game"]["features"],
        "baseline": ladder["baseline"][MU_FULL],
        "overtime_slope": ladder["overtime_slope"][MU_FULL],
        "mean_start_shrink": ladder["registration"]["parameters"]["mean_start_shrink"],
        "models": {
            "mean": accepted["mean_model"],
            "variance": accepted["variance_model"],
            "end_game": ladder["end_game"]["model"],
        },
    }


def game_inputs(entry: dict[str, Any], pre: dict[str, Any]) -> GameInputs:
    neutral = float(entry["neutral"])
    return GameInputs(
        mu=float(pre[MU_FULL]),
        form=float(pre[MU_FORM]),
        strength=float(entry["strength_home"] - entry["strength_away"]),
        rest=float(entry["rest_home"] - entry["rest_away"]),
        b2b_home=float(entry["b2b_home"]),
        b2b_away=float(entry["b2b_away"]),
        games7=float(entry["games7_home"] - entry["games7_away"]),
        travel_home=float(entry["travel_home"]) / 1000,
        travel_away=float(entry["travel_away"]) / 1000,
        neutral=neutral,
        denver=float(not entry["neutral"] and entry["home"] == "1610612743"),
        utah=float(not entry["neutral"] and entry["home"] == "1610612762"),
    )


def espn_game(gid: str) -> tuple[Replay, dict[str, Any], str] | None:
    """Replay of the archived ESPN summary, through the same parser Live uses."""
    path = ESPN_EXTRACTS / f"{gid}.json"
    if not path.exists():
        return None
    extract = json.loads(path.read_text())
    with gzip.open(ESPN_RAW / f"{extract['raw_sha256']}.json.gz") as stream:
        payload = json.loads(stream.read())
    competitors = payload["header"]["competitions"][0]["competitors"]
    sides = {str(c["team"]["id"]): c["homeAway"] for c in competitors}
    plays = parse_plays(payload.get("plays"), sides)
    if not plays:
        return None
    finals: dict[str, int | None] = {c["homeAway"]: int(c["score"]) for c in competitors}
    scores = score_running(plays, finals)
    return replay(replay_rows(plays), HOME_ID, AWAY_ID), extract, scores


def at_times(game: Replay, times: np.ndarray) -> np.ndarray:
    rows = np.searchsorted(game.column("elapsed"), times, side="right") - 1
    result: np.ndarray = game.state[np.maximum(rows, 0)].astype(np.float32).astype(np.float64)
    return result


def _values(state: np.ndarray, times: np.ndarray) -> dict[str, np.ndarray]:
    column = {name: state[:, i] for i, name in enumerate(COLUMNS)}
    return {
        **{k: column[k] for k in COMPARED if k in column},
        "margin": column["home_score"] - column["away_score"],
        "possession_age": times - column["possession_start"],
    }


def run(
    limit: int | None = None,
    mu_for: Callable[[str], float] | None = None,
    reference: Callable[[str], np.ndarray] | None = None,
) -> dict[str, Any]:
    """v2's check as frozen. `mu_for` replaces each game's pregame mu (Win Probability v4 reads the
    same boosters with mu4) and `reference` gives the saved predictions the archive states must
    reproduce; both default to v2's."""
    started = time.monotonic()
    table = read_games(OUTPUT)["games"]
    pregame = json.loads((OUTPUT / "pregame.json").read_text())["games"]
    manifest = manifest_from_ladder()
    model = FrozenModel(manifest, OUTPUT / "models")
    assets = {a["name"]: a for a in json.loads(SEALED_OBSERVATION.read_text())["assets"]}

    agree: Counter[str] = Counter()
    near: Counter[str] = Counter()
    compared = 0
    games: dict[str, list[Any]] = {"archive": [], "aligned": [], "own": [], "reproduced": []}
    states_for_cal: dict[str, list[np.ndarray]] = {"own_p": [], "own_w": [], "own_win": []}
    aligned_p: list[np.ndarray] = []
    archive_p: list[np.ndarray] = []
    aligned_weight: list[np.ndarray] = []
    aligned_win: list[np.ndarray] = []
    reproduction = 0.0
    no_espn: list[str] = []
    score_source: Counter[str] = Counter()
    final_score_differs = 0
    worst: list[dict[str, Any]] = []

    for season in TEST_SEASONS:
        year = int(season[:4])
        saved, ids = read_season(season)
        selected = reference(season) if reference else read_prediction(OUTPUT, "selected", season)
        path, _ = bundle_paths()[season]
        bundle = checked(path, path.name.removesuffix(".json.gz"))
        asset = assets[f"datasets/nbastatsv3_{year}.tar.xz"]
        archive = Path("data/raw/impact-archive") / asset["object"]
        index = saved["game_index"].astype(np.int64)
        with tempfile.TemporaryDirectory(prefix="courtlens-r15b-") as temporary:
            store = ArchiveGames(Path(temporary) / "events.sqlite")
            try:
                store.load("v3", archive, f"nbastatsv3_{year}")
                chosen = ids[:limit] if limit else ids
                for number, gid in enumerate(chosen):
                    if gid not in bundle["members"]:
                        continue
                    found = espn_game(gid)
                    if found is None:
                        no_espn.append(gid)
                        continue
                    espn, _, scores = found
                    score_source[scores] += 1
                    entry = table[gid]
                    inputs = game_inputs(entry, pregame[gid])
                    if mu_for is not None:
                        inputs = dataclasses.replace(inputs, mu=mu_for(gid))
                    win = 1.0 if entry["home_pts"] > entry["away_pts"] else 0.0
                    source = replay(store.get("v3", gid), entry["home"], entry["away"])
                    states = sampled_states(source)
                    espn_final = (
                        espn.column("home_score")[-1],
                        espn.column("away_score")[-1],
                    )
                    if espn_final != (entry["home_pts"], entry["away_pts"]):
                        final_score_differs += 1
                    saved_p = selected[index == number]
                    archive_probability = model.predict_home(states, inputs)
                    if len(saved_p) != len(archive_probability):
                        raise ValueError(f"state count differs for {gid}")
                    reproduction = max(
                        reproduction, float(np.abs(saved_p - archive_probability).max())
                    )
                    # Same times, ESPN's state at each.
                    state = at_times(espn, states.time)
                    aligned = StateColumns(
                        states.time,
                        states.period,
                        {name: state[:, i] for i, name in enumerate(COLUMNS)},
                    )
                    aligned_probability = model.predict_home(aligned, inputs)
                    # ESPN's own sample: what Live would actually score.
                    own = sampled_states(espn)
                    own_probability = model.predict_home(own, inputs)

                    left = _values(at_times(source, states.time), states.time)
                    right = _values(state, states.time)
                    compared += len(states)
                    for name in COMPARED:
                        agree[name] += int((left[name] == right[name]).sum())
                        tolerance = NEAR.get(name, 0.0)
                        near[name] += int((np.abs(left[name] - right[name]) <= tolerance).sum())

                    def loss(p: np.ndarray, truth: float = win) -> float:
                        return float(state_losses(p, np.full(len(p), truth))["log_loss"].mean())

                    games["archive"].append(loss(archive_probability))
                    games["aligned"].append(loss(aligned_probability))
                    games["own"].append(loss(own_probability))
                    weight = np.full(len(states), 1.0 / len(states))
                    archive_p.append(archive_probability)
                    aligned_p.append(aligned_probability)
                    aligned_weight.append(weight)
                    aligned_win.append(np.full(len(states), win))
                    states_for_cal["own_p"].append(own_probability)
                    states_for_cal["own_w"].append(np.full(len(own), 1.0 / len(own)))
                    states_for_cal["own_win"].append(np.full(len(own), win))
                    gap = float(np.abs(archive_probability - aligned_probability).mean())
                    worst.append({"game": gid, "mean_abs_probability_gap": round(gap, 4)})
            finally:
                store.close()

    archive_all = np.concatenate(archive_p)
    aligned_all = np.concatenate(aligned_p)
    weights = np.concatenate(aligned_weight)
    wins = np.concatenate(aligned_win)
    own_all = np.concatenate(states_for_cal["own_p"])
    own_weight = np.concatenate(states_for_cal["own_w"])
    own_win = np.concatenate(states_for_cal["own_win"])
    arrays = {k: np.array(v) for k, v in games.items() if v}
    difference = np.abs(archive_all - aligned_all)
    mean_gap = float(np.average(difference, weights=weights))
    change_aligned = bootstrap_interval(arrays["aligned"] - arrays["archive"])
    change_own = bootstrap_interval(arrays["own"] - arrays["archive"])
    ece_archive = calibration(archive_all, wins, weights)["ece"]
    ece_aligned = calibration(aligned_all, wins, weights)["ece"]
    ece_own = calibration(own_all, own_win, own_weight)["ece"]

    def material(change: dict[str, float]) -> bool:
        outside = change["low"] > 0 or change["high"] < 0
        return bool(outside and abs(change["mean"]) >= LOG_LOSS_LIMIT)

    verdict = {
        "log_loss_aligned": material(change_aligned),
        "log_loss_own_sample": material(change_own),
        "ece_own_sample": ece_own > ECE_LIMIT,
        "ece_aligned": ece_aligned > ECE_LIMIT,
        "probability_gap": mean_gap > PROBABILITY_LIMIT,
    }
    worst.sort(key=lambda g: -g["mean_abs_probability_gap"])
    return {
        "limits": {
            "log_loss_change": LOG_LOSS_LIMIT,
            "ece": ECE_LIMIT,
            "mean_abs_probability_gap": PROBABILITY_LIMIT,
        },
        "games": len(arrays["archive"]),
        "games_without_espn": no_espn,
        "espn_replay_final_score_differs": final_score_differs,
        "score_source": dict(score_source),
        "states_compared": compared,
        "reproduction_max_abs_difference": reproduction,
        "feature_exact_agreement": {k: round(agree[k] / compared, 5) for k in COMPARED},
        "feature_near_agreement": {
            k: {"tolerance": NEAR[k], "share": round(near[k] / compared, 5)} for k in NEAR
        },
        "log_loss": {k: float(v.mean()) for k, v in arrays.items()},
        "log_loss_change_aligned": change_aligned,
        "log_loss_change_own_sample": change_own,
        "calibration_error": {
            "archive": ece_archive,
            "espn_same_times": ece_aligned,
            "espn_own_sample": ece_own,
        },
        "probability_gap": {
            "mean_abs": mean_gap,
            "p50": float(np.quantile(difference, 0.5)),
            "p95": float(np.quantile(difference, 0.95)),
            "p99": float(np.quantile(difference, 0.99)),
            "max": float(difference.max()),
        },
        "worst_games": worst[:10],
        "material": verdict,
        "any_material": any(verdict.values()),
        "elapsed_seconds": round(time.monotonic() - started, 1),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    result = run(args.limit)
    text = json.dumps(result, indent=1, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
