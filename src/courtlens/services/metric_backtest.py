"""Research → Metric Backtest: frozen results and the 2026-27 prospective score (R08).

The API reads hashed files only: the frozen results of `courtlens-metric-backtest-v1` and the
2026-27 freeze manifest, each refused if its recorded hash no longer matches. `weekly` scores
completed 2026-27 games once each with the frozen rules: one row per game, never rewritten. A
game counts as prospective only if its scheduled tip was after the freeze; earlier games are
labelled hindsight and kept apart.
"""

from __future__ import annotations

import json
import math
import os
from collections.abc import Mapping
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from courtlens.config import get_settings
from courtlens.domain.projected_impact import (
    TIP_OFF_LABEL_HINDSIGHT,
    TIP_OFF_LABEL_PROSPECTIVE,
    prospective_label,
)
from courtlens.ingestion.native_reconstruction import content_hash

RESULTS_PATH = Path("evaluation/research/frozen/courtlens-metric-backtest-v1.json")
MANIFEST_PATH = Path("evaluation/research/frozen/courtlens-metric-backtest-v1-prospective.json")
SEASON_END_YEAR = 2027
WEEKLY_DAYS = 7
PROSPECTIVE_SEED_YEAR = 2026
_cache: dict[str, Any] = {}

# What each candidate is, in the page's words. Order is the registration's.
METRICS: dict[str, dict[str, str]] = {
    "team_net": {
        "label": "Team net rating (baseline)",
        "short": "Team net",
        "what": "Each team's net rating last season (points scored minus allowed per 100 "
        "possessions), from the box score with the Teams page's formula. Knows nothing about "
        "who plays.",
        "source": "Previous season's team boxes",
        "credit": "Dean Oliver's possession estimate.",
    },
    "plus_minus": {
        "label": "Plus-minus per 100",
        "short": "Plus-minus",
        "what": "The team's net rating with the player on the floor, last season, pooled across "
        "his teams. Raw: no adjustment for teammates or opponents. Needs 250 possessions on each "
        "side on and off the floor.",
        "source": "Previous season's stints",
        "credit": "Raw on-court net rating.",
    },
    "on_off": {
        "label": "On/off per 100",
        "short": "On/off",
        "what": "The team's net rating with the player on the floor minus with him off, last "
        "season. Raw. Same 250-possession minimum.",
        "source": "Previous season's stints",
        "credit": "Raw on/off net rating.",
    },
    "rapm_1y": {
        "label": "RAPM, one season",
        "short": "RAPM 1Y",
        "what": "Regularized adjusted plus-minus: a ridge regression of every stint's scoring "
        "margin on the ten players on the floor, fitted on last season alone.",
        "source": "Previous season's fit",
        "credit": "Adjusted plus-minus after Dan Rosenbaum (2004); ridge (regularized) form after "
        "Joe Sill (2010).",
    },
    "rapm_3y": {
        "label": "RAPM, three seasons",
        "short": "RAPM 3Y",
        "what": "The same regression on the last three completed seasons together.",
        "source": "Previous three seasons' fit",
        "credit": "Rosenbaum; Sill.",
    },
    "box_prior_rapm": {
        "label": "Box-prior RAPM",
        "short": "Box-prior RAPM",
        "what": "One-season RAPM shrunk toward a box-score estimate instead of toward zero; the "
        "box-score model is fitted on earlier seasons.",
        "source": "Previous season's fit",
        "credit": "Rosenbaum; Sill; the box-score prior idea as in Jeremias Engelmann's "
        "xRAPM and later RPM.",
    },
    "time_decay": {
        "label": "Time-decay RAPM, refreshed monthly",
        "short": "Time decay",
        "what": "RAPM on every earlier game, with older games down-weighted (550-day half-life). "
        "Refitted at each season's opener and on the 1st of every month; a game reads the newest "
        "fit made before it.",
        "source": "Dated snapshots, games before the game date",
        "credit": "Rosenbaum; Sill; time decay as on Databallr.",
    },
    "time_decay_opener": {
        "label": "Time-decay RAPM, opener only",
        "short": "Time decay (opener)",
        "what": "The same time-decay fit, but only the one made before the season's first game, "
        "held all season. It knows what the season-end fits know, so it separates a better method "
        "from fresher data.",
        "source": "The opener snapshot",
        "credit": "Rosenbaum; Sill.",
    },
    "projected_impact": {
        "label": "Projected Impact",
        "short": "Projected Impact",
        "what": "CourtLens' own learned projection of each player's season RAPM, made before the "
        "season from earlier seasons (box score, play types, shot profile, past RAPM, age). Scored "
        "only on 2024-25 and 2025-26: it was trained on 2016-17 to 2022-23 and selected on "
        "2023-24, so earlier seasons would flatter it.",
        "source": "R07's frozen model",
        "credit": "CourtLens' own (R07), in the style of DARKO and EPM.",
    },
}

OMITTED = {
    "darko": "DARKO (Daily Plus-Minus, by Kostya Medvedovsky) is left out of the comparison and "
    "every verdict. CourtLens' stored DARKO history is one rating per season, recomputed later "
    "with DARKO's current model; the ratings as published before each game are not available "
    "free. Scoring those would be hindsight, not a pregame rating."
}


def serving_root() -> Path:
    return get_settings().metric_backtest_serving_dir


def _checked(path: Path, key: str) -> dict[str, Any]:
    body: dict[str, Any] = json.loads(path.read_text())
    if content_hash({k: v for k, v in body.items() if k != key}) != body.get(key):
        raise ValueError(f"{path.name} changed after it was frozen")
    return body


def load_results() -> dict[str, Any]:
    stamp = RESULTS_PATH.stat().st_mtime_ns
    if _cache.get("results_stamp") != stamp:
        _cache.update(results=_checked(RESULTS_PATH, "results_sha256"), results_stamp=stamp)
    return dict(_cache["results"])


def load_manifest() -> dict[str, Any]:
    return _checked(MANIFEST_PATH, "manifest_sha256")


# ---------------------------------------------------------------------------------------------
# Prospective scoring.


def _probability(mu: float, sigma: float) -> float:
    return 0.5 * (1 + math.erf(mu / (sigma * math.sqrt(2))))


def score_game(
    game: Mapping[str, Any],
    table: Mapping[str, Any],
    snapshots: Mapping[str, dict[str, Any]],
    manifest: Mapping[str, Any],
    tip_utc: str | None,
) -> dict[str, Any] | None:
    """One game under the frozen rules, or None if a candidate cannot rate it yet."""
    from courtlens.evaluation import metric_backtest_data as data

    margins: dict[str, float] = {}
    probabilities: dict[str, float] = {}
    replaced: dict[str, float] = {}
    snapshot = None
    total = 0.0
    h = 0.0 if game["neutral"] else 1.0
    for name in data.CANDIDATES:
        candidate = table["candidates"][name]
        if name == "time_decay":
            cutoff = data.snapshot_for(game["date"], snapshots)
            if cutoff is None:
                return None
            candidate = data.snapshot_table(snapshots[cutoff])
            snapshot = {"cutoff": cutoff, "sha256": snapshots[cutoff]["sha256"]}
        s = data.strength(game, name, candidate)
        c = manifest["calibration"][name]
        mu = c["a"] * h + c["b"] * s["d"]
        margins[name] = mu
        probabilities[name] = _probability(mu, c["sigma"])
        replaced[name] = s["replaced"]
        total = max(total, s["total"])
    return {
        "game_id": game["game_id"],
        "date": game["date"],
        "tip_utc": tip_utc,
        "label": prospective_label(tip_utc, manifest["frozen_at"]),
        "home": game["home"],
        "away": game["away"],
        "margin": game["margin"],
        "predicted": margins,
        "probability": probabilities,
        "replaced_seconds": replaced,
        "total_seconds": total,
        "time_decay_snapshot": snapshot,
        "manifest_sha256": manifest["manifest_sha256"],
    }


def _games_path() -> Path:
    return serving_root() / "games.jsonl"


def read_rows() -> list[dict[str, Any]]:
    path = _games_path()
    return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []


def summarize_group(chosen: list[dict[str, Any]], minimum: int) -> dict[str, Any]:
    """Scores per candidate and, from `minimum` games, paired gains with 95% intervals."""
    import numpy as np

    from courtlens.evaluation import metric_backtest_runner as runner

    out: dict[str, Any] = {"games": len(chosen)}
    if not chosen:
        return out
    names = list(chosen[0]["predicted"])
    margin = np.array([r["margin"] for r in chosen], dtype=np.float64)
    losses = {
        n: runner.game_losses(
            margin,
            np.array([r["predicted"][n] for r in chosen]),
            np.array([r["probability"][n] for r in chosen]),
        )
        for n in names
    }
    total = sum(r["total_seconds"] for r in chosen)
    out["candidates"] = {
        n: {
            **runner.scores(losses[n]),
            "replaced_minutes_share": sum(r["replaced_seconds"][n] for r in chosen) / total
            if total
            else 0.0,
        }
        for n in names
    }
    if len(chosen) < minimum:
        return out
    counts = {"g": runner.resample_counts(len(chosen), PROSPECTIVE_SEED_YEAR)}
    reps = {n: runner.metric_replicates(counts, {"g": losses[n]}, ["g"]) for n in names}
    pairs = []
    for i, reference in enumerate(names):
        for name in names[i + 1 :]:
            entry: dict[str, Any] = {"candidate": name, "reference": reference}
            for m in runner.METRICS:
                point = runner.gain(m, out["candidates"][name][m], out["candidates"][reference][m])
                spread = runner.interval(runner.gain(m, reps[name][m], reps[reference][m]))
                entry[m] = {"gain": point, **spread}
            pairs.append(entry)
    out["pairs"] = pairs
    return out


def summarize(rows: list[dict[str, Any]], manifest: Mapping[str, Any]) -> dict[str, Any]:
    minimum = int(manifest["minimum_games_for_interval"])
    prospective = [r for r in rows if r["label"] == TIP_OFF_LABEL_PROSPECTIVE]
    hindsight = [r for r in rows if r["label"] == TIP_OFF_LABEL_HINDSIGHT]
    return {
        "version": manifest["version"],
        "manifest_sha256": manifest["manifest_sha256"],
        "frozen_at": manifest["frozen_at"],
        "scored_through": max((r["date"] for r in rows), default=None),
        "written_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "prospective": summarize_group(prospective, minimum),
        "hindsight": summarize_group(hindsight, minimum),
    }


def write_summary(rows: list[dict[str, Any]], manifest: Mapping[str, Any]) -> dict[str, Any]:
    summary = summarize(rows, manifest)
    path = serving_root() / "summary.json"
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(summary, indent=1, sort_keys=True))
    os.replace(temporary, path)
    return summary


def read_summary() -> dict[str, Any] | None:
    path = serving_root() / "summary.json"
    if not path.exists():
        return None
    body: dict[str, Any] = json.loads(path.read_text())
    return body


def live_snapshots(opener: str) -> dict[str, dict[str, Any]]:
    """2026-27 time-decay snapshots (cutoff on or after the opener), checked by hash."""
    from courtlens.evaluation import metric_backtest_data as data

    return {c: s for c, s in data.load_snapshots().items() if c >= opener}


def weekly(force: bool = False, now: datetime | None = None) -> dict[str, Any]:
    """Score new 2026-27 games. Once a week unless forced."""
    from courtlens.evaluation import metric_backtest_data as data
    from courtlens.evaluation.projected_impact_data import tip_times

    now = now or datetime.now(UTC)
    previous = read_summary()
    if previous and not force:
        written = datetime.fromisoformat(previous["written_at"])
        if now - written < timedelta(days=WEEKLY_DAYS):
            return {"skipped": True, "last_written": previous["written_at"]}
    manifest = load_manifest()
    table = data.read_table(data.OUTPUT, manifest["prospective_table_sha256"])
    snapshots = live_snapshots(table["candidates"]["time_decay"]["opener"])
    rows = read_rows()
    done = {r["game_id"] for r in rows}
    tips = tip_times(SEASON_END_YEAR)
    serving_root().mkdir(parents=True, exist_ok=True)
    added = waiting = 0
    with _games_path().open("a") as stream:
        for game in data.games_for(manifest["season"]):
            if game["game_id"] in done:
                continue
            row = score_game(game, table, snapshots, manifest, tips.get(game["game_id"]))
            if row is None:
                waiting += 1
                continue
            stream.write(json.dumps(row, sort_keys=True) + "\n")
            rows.append(row)
            added += 1
    summary = write_summary(rows, manifest)
    return {
        "skipped": False,
        "added": added,
        "waiting_for_snapshot": waiting,
        "prospective_games": summary["prospective"]["games"],
        "hindsight_games": summary["hindsight"]["games"],
        "scored_through": summary["scored_through"],
    }


def page() -> dict[str, Any]:
    """Everything the page shows: frozen results, metric notes and the 2026-27 score."""
    results = load_results()
    manifest = load_manifest()
    return {
        "results": results,
        "metrics": METRICS,
        "omitted": OMITTED,
        "prospective": {
            "manifest": {
                k: manifest[k]
                for k in (
                    "version",
                    "frozen_at",
                    "manifest_sha256",
                    "prospective_table_sha256",
                    "calibration",
                    "minimum_games_for_interval",
                    "first_prospective_rule",
                )
            },
            "summary": read_summary(),
        },
    }
