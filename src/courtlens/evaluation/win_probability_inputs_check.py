"""R15b pre-freeze check: what if pregame inputs are only what is known before tip-off?

Three runs on the final-test seasons, each scored on the saved archive-built states:
- `reproduce`: the live code with the training rules must rebuild the saved table and predictions;
- `pinned`: one rating snapshot all season (the last before the season) instead of monthly ones;
- `no_injury_news`: pinned, and nobody marked unavailable: each team's players who appeared for it
  in the previous 30 days. Real Live also has ESPN's Out list, so this bounds the worst case;
- `monthly_no_news`: the same availability with the training rule's monthly ratings, which isolates
  the cost of having no injury news.

Materiality uses the limits in `win_probability_parity`.
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path
from typing import Any

import numpy as np

from courtlens.evaluation.win_probability_data import OUTPUT, SNAPSHOTS, days, read_games
from courtlens.evaluation.win_probability_models import (
    bootstrap_interval,
    calibration,
    read_prediction,
    read_season,
    state_losses,
)
from courtlens.evaluation.win_probability_parity import (
    ECE_LIMIT,
    LOG_LOSS_LIMIT,
    manifest_from_ladder,
)
from courtlens.services.win_probability_pregame import (
    Target,
    box_availability,
    build_entries,
    inputs_from_entry,
    load_box_history,
    monthly_ratings,
    pinned_ratings,
)
from courtlens.services.win_probability_serving import FrozenModel, StateColumns

SEASONS = {"2024-25": "2024-10-22", "2025-26": "2025-10-21"}
RECENT_DAYS = 30


def latest_snapshot_before(day: str) -> Path:
    candidates = []
    for path in SNAPSHOTS.glob("*.json"):
        cutoff = json.loads(path.read_bytes())["cutoff"]
        if cutoff < day:
            candidates.append((cutoff, path))
    return max(candidates)[1]


def season_states(season: str) -> tuple[dict[str, np.ndarray], list[str], np.ndarray]:
    columns, ids = read_season(season)
    return columns, ids, columns["game_index"].astype(np.int64)


def score(
    model: FrozenModel,
    season: str,
    entries: dict[str, dict[str, Any]],
    coefficients: dict[str, float],
) -> np.ndarray:
    columns, ids, index = season_states(season)
    out = np.zeros(len(index))
    state_names = [k for k in columns if k not in ("game_index", "time", "period")]
    time_all = columns["time"].astype(np.float64)
    period_all = columns["period"].astype(np.int64)
    for number, gid in enumerate(ids):
        rows = np.flatnonzero(index == number)
        states = StateColumns(
            time_all[rows],
            period_all[rows],
            {name: columns[name][rows].astype(np.float64) for name in state_names},
        )
        out[rows] = model.predict_home(states, inputs_from_entry(entries[gid], coefficients))
    return out


def run() -> dict[str, Any]:
    started = time.monotonic()
    table = read_games(OUTPUT)["games"]
    pregame = json.loads((OUTPUT / "pregame.json").read_text())
    coefficients = pregame["coefficients"]
    half_life = int(pregame["form_half_life_days"])
    model = FrozenModel(manifest_from_ladder(), OUTPUT / "models")
    box_games, box_players = load_box_history(range(2023, 2027))

    def team_players() -> dict[str, list[tuple[int, str]]]:
        out: dict[str, list[tuple[int, str]]] = {}
        for game in box_games:
            for pid, seconds, _, team in box_players.get(game["gid"], []):
                if seconds > 0:
                    out.setdefault(team, []).append((days(game["date"]), pid))
        return out

    recent_by_team = team_players()

    def no_news(target: dict[str, Any], team: str, _: list[Any]) -> list[str]:
        d = days(target["day"])
        return sorted(
            {p for when, p in recent_by_team.get(team, []) if 0 < d - when <= RECENT_DAYS}
        )

    report: dict[str, Any] = {"seasons": {}, "pooled": {}}
    pooled: dict[str, list[np.ndarray]] = {
        "selected": [],
        "pinned": [],
        "no_news": [],
        "monthly_no_news": [],
    }
    pooled_ece: dict[str, list[np.ndarray]] = {
        "selected": [],
        "pinned": [],
        "no_news": [],
        "monthly_no_news": [],
        "w": [],
        "y": [],
    }
    biggest_reproduction = biggest_mu = 0.0
    for season, opener in SEASONS.items():
        ids = [g for g, e in table.items() if e["season"] == season]
        targets = [
            Target(g, table[g]["date"], table[g]["home"], table[g]["away"], table[g]["neutral"])
            for g in ids
        ]
        snapshot = latest_snapshot_before(opener)
        runs = {
            "reproduce": build_entries(
                targets, box_games, box_players, monthly_ratings(), box_availability, half_life
            ),
            "pinned": build_entries(
                targets,
                box_games,
                box_players,
                pinned_ratings(snapshot),
                box_availability,
                half_life,
            ),
            "no_news": build_entries(
                targets, box_games, box_players, pinned_ratings(snapshot), no_news, half_life
            ),
            "monthly_no_news": build_entries(
                targets, box_games, box_players, monthly_ratings(), no_news, half_life
            ),
        }
        for gid in ids:
            saved, rebuilt = table[gid], runs["reproduce"][gid]
            for key in ("strength_home", "strength_away", "pace_home", "pace_away", "travel_home"):
                biggest_reproduction = max(biggest_reproduction, abs(saved[key] - rebuilt[key]))
            biggest_reproduction = max(
                biggest_reproduction,
                abs(saved["form"][str(half_life)] - rebuilt["form"]),
            )
            biggest_mu = max(
                biggest_mu,
                abs(inputs_from_entry(rebuilt, coefficients).mu - pregame["games"][gid]["mu_full"]),
            )
        selected = read_prediction(OUTPUT, "selected", season)
        columns, games, index = season_states(season)
        win = columns["win_home"].astype(np.float64)
        counts = np.bincount(index, minlength=len(games))
        weight = 1.0 / counts[index]

        def by_game(
            p: np.ndarray,
            win: np.ndarray = win,
            index: np.ndarray = index,
            counts: np.ndarray = counts,
        ) -> np.ndarray:
            loss = state_losses(p, win)["log_loss"]
            result: np.ndarray = np.bincount(index, weights=loss, minlength=len(counts)) / counts
            return result

        base = by_game(selected)
        reproduced = score(model, season, runs["reproduce"], coefficients)
        pinned = score(model, season, runs["pinned"], coefficients)
        no_news_p = score(model, season, runs["no_news"], coefficients)
        monthly_no_news_p = score(model, season, runs["monthly_no_news"], coefficients)
        report["seasons"][season] = {
            "snapshot_pinned": snapshot.stem,
            "snapshot_cutoff": runs["pinned"][ids[0]]["snapshot_cutoff"],
            "reproduction_max_abs_probability": float(np.abs(reproduced - selected).max()),
            "selected_log_loss": float(base.mean()),
            "pinned_log_loss": float(by_game(pinned).mean()),
            "no_injury_news_log_loss": float(by_game(no_news_p).mean()),
            "monthly_no_injury_news_log_loss": float(by_game(monthly_no_news_p).mean()),
        }
        pooled["selected"].append(base)
        pooled["pinned"].append(by_game(pinned))
        pooled["no_news"].append(by_game(no_news_p))
        pooled["monthly_no_news"].append(by_game(monthly_no_news_p))
        pooled_ece["selected"].append(selected)
        pooled_ece["pinned"].append(pinned)
        pooled_ece["no_news"].append(no_news_p)
        pooled_ece["monthly_no_news"].append(monthly_no_news_p)
        pooled_ece["w"].append(weight)
        pooled_ece["y"].append(win)

    base = np.concatenate(pooled["selected"])
    weights = np.concatenate(pooled_ece["w"])
    wins = np.concatenate(pooled_ece["y"])
    for name in ("pinned", "no_news", "monthly_no_news"):
        change = bootstrap_interval(np.concatenate(pooled[name]) - base)
        ece = calibration(np.concatenate(pooled_ece[name]), wins, weights)["ece"]
        outside = change["low"] > 0 or change["high"] < 0
        report["pooled"][name] = {
            "log_loss_change": change,
            "calibration_error": ece,
            "material": bool(outside and abs(change["mean"]) >= LOG_LOSS_LIMIT) or ece > ECE_LIMIT,
        }
    report["pooled"]["selected_calibration_error"] = calibration(
        np.concatenate(pooled_ece["selected"]), wins, weights
    )["ece"]
    report["reproduction"] = {
        "max_abs_input": biggest_reproduction,
        "max_abs_mu": biggest_mu,
    }
    report["elapsed_seconds"] = round(time.monotonic() - started, 1)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    result = run()
    text = json.dumps(result, indent=1, sort_keys=True)
    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(text + "\n")
    print(text)


if __name__ == "__main__":
    main()
