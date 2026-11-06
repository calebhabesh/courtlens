"""Training data for the lineup model (`courtlens-lineup-model-v1`, R14).

Two content-hashed tables, both exported as Parquet so a notebook (D12: Colab is optional, only an
accelerator) and the CPU runner read the same bytes:

- **stints**: every admitted R01 regular-season stint 2014-15 to 2025-26 (the sealed IM03 and
  history-v2 bundles, read through `impact_history_fits.Cohorts`, which checks every hash): date,
  game, the ten players, seconds, each side's points and possessions, and the neutral-site flag.
- **boxes**: each player's regular-season box totals per season (SportsDataverse boxes, R07's
  `load_boxes`), the only input to the cold-start fallback.

The dataset hash is computed from the arrays themselves (`array_hash`), not the Parquet bytes, so
it does not depend on the Parquet writer version. `data-check` writes counts only: no stint margin
is summarised by player, lineup or model before the registration.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import resource
import time
from collections import defaultdict
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np

REGISTRATION = "courtlens-lineup-model-v1"
OUTPUT = Path("data/derived/lineup-model-v1")
FIRST_YEAR = 2014
LAST_YEAR = 2025  # 2025-26
WINDOW = 3  # training seasons before each target season
SELECTION = ("2021-22", "2022-23")
TEST = ("2023-24", "2024-25", "2025-26")
SERVING = "2026-27"
MIN_POSSESSIONS = 1000.0  # own embedding at or above this many on-court possessions in the window
BUBBLE_NEUTRAL = ("2020-07-30", "2020-10-15")
BOX_STATS = (
    "points",
    "field_goals_attempted",
    "three_pointers_attempted",
    "free_throws_attempted",
    "rebounds_offensive",
    "rebounds_defensive",
    "assists",
    "steals",
    "blocks",
    "turnovers",
    "fouls_personal",
)
BOX_FEATURES = (*(f"{s}_per36" for s in BOX_STATS), "log_minutes")


def season_label(year: int) -> str:
    return f"{year}-{str(year + 1)[-2:]}"


def season_year(season: str) -> int:
    return int(season[:4])


def window_seasons(target: str) -> tuple[str, ...]:
    """The WINDOW seasons immediately before the target season (the training games)."""
    year = season_year(target)
    return tuple(season_label(y) for y in range(year - WINDOW, year))


@dataclass
class Stints:
    players: list[str]  # global player ids, sorted
    games: list[str]  # game ids, sorted
    season: np.ndarray  # [n] starting year
    day: np.ndarray  # [n] date ordinal
    game: np.ndarray  # [n] index into games
    lineups: np.ndarray  # [n, 2, 5] index into players, side 0 home
    seconds: np.ndarray  # [n]
    points: np.ndarray  # [n, 2] home, away
    possessions: np.ndarray  # [n, 2] home offense, away offense
    neutral: np.ndarray  # [n] bool

    def take(self, idx: np.ndarray) -> Stints:
        return Stints(
            self.players,
            self.games,
            self.season[idx],
            self.day[idx],
            self.game[idx],
            self.lineups[idx],
            self.seconds[idx],
            self.points[idx],
            self.possessions[idx],
            self.neutral[idx],
        )

    def usable(self) -> np.ndarray:
        """R01's diagnostic rule: both sides had at least one possession."""
        return np.asarray((self.possessions[:, 0] > 0) & (self.possessions[:, 1] > 0))

    def target(self) -> tuple[np.ndarray, np.ndarray]:
        """Home margin per 100 possessions and its weight (mean possessions), as R01 measures it."""
        mean = self.possessions.mean(axis=1)
        margin = np.divide(
            100 * (self.points[:, 0] - self.points[:, 1]),
            mean,
            out=np.zeros(len(mean)),
            where=mean > 0,
        )
        return margin, mean


@dataclass
class Boxes:
    """Per player-season box totals: seconds, games and BOX_STATS sums."""

    rows: dict[tuple[str, str], dict[str, float]]  # (season, player) -> totals


def neutral_day(day: str) -> bool:
    return BUBBLE_NEUTRAL[0] <= day < BUBBLE_NEUTRAL[1]


# ---------------------------------------------------------------------------------------------
# Building (reads the sealed bundles and retained boxes; research runs only).


def build_stints() -> Stints:
    from courtlens.evaluation.impact_history_fits import Cohorts

    cohorts = Cohorts(keep=1)
    rows: list[tuple[Any, ...]] = []
    for key in cohorts:
        cohort = cohorts[key]
        year = season_year(cohort["season"])
        for s in cohort["stints"]:
            rows.append(
                (
                    year,
                    s.day,
                    s.game,
                    s.home,
                    s.away,
                    float(s.seconds),
                    float(s.hp),
                    float(s.ap),
                    float(s.hx),
                    float(s.ax),
                )
            )
        print("stints", cohort["season"], len(cohort["stints"]), flush=True)
    rows.sort(key=lambda r: (r[1], r[2]))  # stable within a game: the bundle's stint order
    players = sorted({p for r in rows for side in (r[3], r[4]) for p in side})
    games = sorted({r[2] for r in rows})
    pindex = {p: i for i, p in enumerate(players)}
    gindex = {g: i for i, g in enumerate(games)}
    return Stints(
        players,
        games,
        np.array([r[0] for r in rows], dtype=np.int16),
        np.array([date.fromisoformat(r[1]).toordinal() for r in rows], dtype=np.int32),
        np.array([gindex[r[2]] for r in rows], dtype=np.int32),
        np.array([[[pindex[p] for p in r[3]], [pindex[p] for p in r[4]]] for r in rows], np.int32),
        np.array([r[5] for r in rows], dtype=np.float64),
        np.array([[r[6], r[7]] for r in rows], dtype=np.float64),
        np.array([[r[8], r[9]] for r in rows], dtype=np.float64),
        np.array([neutral_day(r[1]) for r in rows], dtype=bool),
    )


def build_boxes() -> Boxes:
    from courtlens.evaluation.projected_impact_data import load_boxes

    boxes, _ = load_boxes(LAST_YEAR + 1)
    out: dict[tuple[str, str], dict[str, float]] = {}
    for season, box_rows in boxes.items():
        totals: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
        for r in box_rows:
            if r.seconds <= 0:
                continue
            t = totals[r.player_id]
            t["seconds"] += r.seconds
            t["games"] += 1
            for stat in BOX_STATS:
                t[stat] += r.stats[stat]
        for pid, t in totals.items():
            out[(season, pid)] = dict(t)
    return Boxes(out)


# ---------------------------------------------------------------------------------------------
# Hashing and Parquet export.


def array_hash(arrays: Mapping[str, np.ndarray], lists: Mapping[str, list[str]]) -> str:
    """SHA-256 over names, dtypes, shapes and raw bytes in a fixed order (writer-independent)."""
    digest = hashlib.sha256()
    for name in sorted(arrays):
        a = np.ascontiguousarray(arrays[name])
        digest.update(f"{name}|{a.dtype.str}|{a.shape}".encode())
        digest.update(a.tobytes())
    for name in sorted(lists):
        digest.update(f"{name}|list".encode())
        digest.update(json.dumps(lists[name], separators=(",", ":")).encode())
    return digest.hexdigest()


def stints_hash(s: Stints) -> str:
    return array_hash(
        {
            "season": s.season,
            "day": s.day,
            "game": s.game,
            "lineups": s.lineups,
            "seconds": s.seconds,
            "points": s.points,
            "possessions": s.possessions,
            "neutral": s.neutral,
        },
        {"players": s.players, "games": s.games},
    )


def boxes_hash(b: Boxes) -> str:
    keys = sorted(b.rows)
    return array_hash(
        {
            "values": np.array(
                [[b.rows[k].get(c, 0.0) for c in ("seconds", "games", *BOX_STATS)] for k in keys],
                dtype=np.float64,
            )
        },
        {"keys": [f"{s}|{p}" for s, p in keys]},
    )


def write_dataset(output: Path, s: Stints, b: Boxes) -> dict[str, str]:
    import pyarrow as pa  # type: ignore[import-untyped]
    import pyarrow.parquet as pq  # type: ignore[import-untyped]

    stint_digest, box_digest = stints_hash(s), boxes_hash(b)
    root = output / "dataset"
    root.mkdir(parents=True, exist_ok=True)
    stint_path = root / f"stints-{stint_digest}.parquet"
    if not stint_path.exists():
        table = pa.table(
            {
                "season": s.season,
                "date": [date.fromordinal(int(d)).isoformat() for d in s.day],
                "game_id": [s.games[g] for g in s.game],
                **{
                    f"{side}{i + 1}": [s.players[p] for p in s.lineups[:, k, i]]
                    for k, side in enumerate(("home", "away"))
                    for i in range(5)
                },
                "seconds": s.seconds,
                "home_points": s.points[:, 0],
                "away_points": s.points[:, 1],
                "home_possessions": s.possessions[:, 0],
                "away_possessions": s.possessions[:, 1],
                "neutral": s.neutral,
            }
        )
        pq.write_table(table, stint_path, compression="zstd")
    box_path = root / f"boxes-{box_digest}.parquet"
    if not box_path.exists():
        keys = sorted(b.rows)
        cols = ("seconds", "games", *BOX_STATS)
        pq.write_table(
            pa.table(
                {
                    "season": [k[0] for k in keys],
                    "player_id": [k[1] for k in keys],
                    **{c: [b.rows[k].get(c, 0.0) for k in keys] for c in cols},
                }
            ),
            box_path,
            compression="zstd",
        )
    return {"stints_sha256": stint_digest, "boxes_sha256": box_digest}


def read_dataset(output: Path, pinned: Mapping[str, str]) -> tuple[Stints, Boxes]:
    """Both tables, refused unless their array hashes equal the pinned ones."""
    import pyarrow.parquet as pq

    root = output / "dataset"
    t = pq.read_table(root / f"stints-{pinned['stints_sha256']}.parquet").to_pydict()
    ids = sorted({p for side in ("home", "away") for i in range(5) for p in t[f"{side}{i + 1}"]})
    games = sorted(set(t["game_id"]))
    pindex = {p: i for i, p in enumerate(ids)}
    gindex = {g: i for i, g in enumerate(games)}
    lineups = np.stack(
        [
            np.stack([np.array([pindex[p] for p in t[f"{side}{i + 1}"]]) for i in range(5)], 1)
            for side in ("home", "away")
        ],
        1,
    ).astype(np.int32)
    s = Stints(
        ids,
        games,
        np.asarray(t["season"], dtype=np.int16),
        np.array([date.fromisoformat(d).toordinal() for d in t["date"]], dtype=np.int32),
        np.array([gindex[g] for g in t["game_id"]], dtype=np.int32),
        lineups,
        np.asarray(t["seconds"], dtype=np.float64),
        np.stack([np.asarray(t["home_points"]), np.asarray(t["away_points"])], 1).astype(float),
        np.stack([np.asarray(t["home_possessions"]), np.asarray(t["away_possessions"])], 1).astype(
            float
        ),
        np.asarray(t["neutral"], dtype=bool),
    )
    if stints_hash(s) != pinned["stints_sha256"]:
        raise ValueError("stint table differs from its pinned hash")
    bt = pq.read_table(root / f"boxes-{pinned['boxes_sha256']}.parquet").to_pydict()
    cols = ("seconds", "games", *BOX_STATS)
    rows = {
        (season, pid): {c: float(bt[c][i]) for c in cols}
        for i, (season, pid) in enumerate(zip(bt["season"], bt["player_id"], strict=True))
    }
    b = Boxes(rows)
    if boxes_hash(b) != pinned["boxes_sha256"]:
        raise ValueError("box table differs from its pinned hash")
    return s, b


# ---------------------------------------------------------------------------------------------
# Windows, cold start and the box fallback (pure; used by every model and the API).


def window_mask(s: Stints, target: str) -> np.ndarray:
    """Training stints for a target season: the WINDOW seasons before it, usable stints only."""
    years = {season_year(w) for w in window_seasons(target)}
    return np.asarray(np.isin(s.season, list(years)) & s.usable())


def target_mask(s: Stints, target: str) -> np.ndarray:
    return np.asarray((s.season == season_year(target)) & s.usable())


def on_court_possessions(s: Stints, idx: np.ndarray) -> np.ndarray:
    """Per global player: possessions on court (mean of both sides per stint) over the rows."""
    totals = np.zeros(len(s.players))
    mean = s.possessions[idx].mean(axis=1)
    np.add.at(totals, s.lineups[idx].reshape(len(idx), 10), mean[:, None])
    return totals


def box_features(boxes: Boxes, seasons: Iterable[str], player: str) -> np.ndarray | None:
    """Raw fallback features over the given seasons: per-36 rates and log minutes. None if the
    player has no regular-season box minutes in those seasons."""
    total: dict[str, float] = defaultdict(float)
    for season in seasons:
        row = boxes.rows.get((season, player))
        if row:
            for k, v in row.items():
                total[k] += v
    if total.get("seconds", 0.0) <= 0:
        return None
    per36 = 36 * 60 / total["seconds"]
    return np.array(
        [total[stat] * per36 for stat in BOX_STATS] + [float(np.log1p(total["seconds"] / 60))]
    )


@dataclass
class Window:
    """Everything a fit for one target season sees, all from games before that season."""

    target: str
    seasons: tuple[str, ...]
    train: np.ndarray  # stint indexes
    own: np.ndarray  # global player indexes with their own parameters (sorted)
    fallback: np.ndarray  # global player indexes on the box fallback (sorted)
    features: np.ndarray  # [len(players), F] standardized box features (zeros = newcomer)
    has_box: np.ndarray  # [len(players)] bool
    mean: np.ndarray  # standardization (fallback players in the window, possession-weighted)
    scale: np.ndarray


def make_window(s: Stints, boxes: Boxes, target: str) -> Window:
    """Own parameters for players with >= MIN_POSSESSIONS in the window; everyone else (including
    players first seen in the target season) reads the box fallback from the window's boxes."""
    seasons = window_seasons(target)
    train = np.flatnonzero(window_mask(s, target))
    poss = on_court_possessions(s, train)
    own = np.flatnonzero(poss >= MIN_POSSESSIONS)
    is_own = np.zeros(len(s.players), dtype=bool)
    is_own[own] = True
    raw = np.zeros((len(s.players), len(BOX_FEATURES)))
    has_box = np.zeros(len(s.players), dtype=bool)
    for p, pid in enumerate(s.players):
        f = box_features(boxes, seasons, pid)
        if f is not None:
            raw[p], has_box[p] = f, True
    seen = (poss > 0) & ~is_own & has_box
    if not seen.any():
        raise ValueError(f"no fallback players in the {target} window")
    weights = poss[seen]
    mean = np.average(raw[seen], axis=0, weights=weights)
    scale = np.sqrt(np.average((raw[seen] - mean) ** 2, axis=0, weights=weights))
    scale[scale <= 0] = 1.0
    features = np.where(has_box[:, None], (raw - mean) / scale, 0.0)
    features[is_own] = 0.0  # never read for own players
    return Window(
        target, seasons, train, own, np.flatnonzero(~is_own), features, has_box, mean, scale
    )


# ---------------------------------------------------------------------------------------------
# Data check (counts only).


def data_check(s: Stints, b: Boxes, hashes: Mapping[str, str]) -> dict[str, Any]:
    seasons: dict[str, Any] = {}
    for year in range(FIRST_YEAR, LAST_YEAR + 1):
        label = season_label(year)
        idx = np.flatnonzero(s.season == year)
        usable = idx[s.usable()[idx]]
        poss = s.possessions[idx].mean(axis=1)
        seasons[label] = {
            "games": len(np.unique(s.game[idx])),
            "stints": len(idx),
            "usable_stints": len(usable),
            "dropped_stints_one_side_no_possession": len(idx) - len(usable),
            "possessions": round(float(poss.sum()), 1),
            "usable_possessions": round(float(s.possessions[usable].mean(axis=1).sum()), 1),
            "players": len(np.unique(s.lineups[idx])),
            "neutral_stints": int(s.neutral[idx].sum()),
            "first_date": date.fromordinal(int(s.day[idx].min())).isoformat(),
            "last_date": date.fromordinal(int(s.day[idx].max())).isoformat(),
        }
    cold: dict[str, Any] = {}
    for target in (*SELECTION, *TEST, SERVING):
        w = make_window(s, b, target)
        poss = on_court_possessions(s, w.train)
        in_window = poss > 0
        entry: dict[str, Any] = {
            "window": list(w.seasons),
            "training_stints": len(w.train),
            "players_in_window": int(in_window.sum()),
            "own_embedding": len(w.own),
            "fallback_in_window": int((in_window & ~np.isin(np.arange(len(poss)), w.own)).sum()),
            "fallback_in_window_without_box": int(
                (in_window & ~w.has_box & ~np.isin(np.arange(len(poss)), w.own)).sum()
            ),
            "threshold_sensitivity_players_at_or_above": {
                str(int(t)): int((poss >= t).sum()) for t in (250, 500, 1000, 2000, 4000)
            },
            "window_possession_share_own": round(float(poss[w.own].sum() / poss.sum()), 4),
        }
        if target != SERVING:
            t_idx = np.flatnonzero(target_mask(s, target))
            t_poss = on_court_possessions(s, t_idx)
            present = np.flatnonzero(t_poss > 0)
            own = np.isin(present, w.own)
            box = ~own & w.has_box[present]
            new = ~own & ~w.has_box[present]
            total = t_poss[present].sum()
            entry["target"] = {
                "stints": len(t_idx),
                "players": len(present),
                "own_embedding": int(own.sum()),
                "box_fallback": int(box.sum()),
                "newcomer_no_box_in_window": int(new.sum()),
                "possession_share_own": round(float(t_poss[present][own].sum() / total), 4),
                "possession_share_box_fallback": round(
                    float(t_poss[present][box].sum() / total), 4
                ),
                "possession_share_newcomer": round(float(t_poss[present][new].sum() / total), 4),
                "stints_with_any_fallback_player": int(
                    (~np.isin(s.lineups[t_idx].reshape(len(t_idx), 10), w.own)).any(axis=1).sum()
                ),
            }
        entry["fallback_reads"] = {
            "features": list(BOX_FEATURES),
            "seasons": list(w.seasons),
            "standardized_on": "fallback players in the window, weighted by on-court possessions",
            "feature_means": dict(
                zip(BOX_FEATURES, (round(float(m), 4) for m in w.mean), strict=True)
            ),
            "newcomer": "no box minutes in the window: all features at the mean (zeros)",
        }
        cold[target] = entry
    return {
        "version": REGISTRATION,
        "dataset": dict(hashes),
        "seasons": seasons,
        "totals": {
            "games": len(s.games),
            "stints": len(s.day),
            "usable_stints": int(s.usable().sum()),
            "players": len(s.players),
            "box_player_seasons": len(b.rows),
        },
        "excluded_games": "R01's admission (IM02 + event gate) excluded 3 to 26 games a season; "
        "their stints are not in the sealed bundles. Counts and reasons: "
        "docs/evidence/research/r01/coverage.json.",
        "leakage_plan": [
            "Rolling origin: a fit for target season t reads stints and boxes from seasons "
            "t-3..t-1 only, so every input is dated before t's opener.",
            "Selection seasons 2021-22 and 2022-23, test seasons 2023-24 to 2025-26, fixed here.",
            "Cold-start status and box features for a target season come from the window only; "
            "a player first seen in t reads the newcomer value.",
            "The 2026-27 serving fit reads 2023-24 to 2025-26.",
        ],
        "cold_start": cold,
        "threshold": MIN_POSSESSIONS,
        "note": "Counts only; no stint margin summarised by player, lineup or model.",
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "check"))
    parser.add_argument("--output", type=Path, default=OUTPUT)
    parser.add_argument("--stints")
    parser.add_argument("--boxes")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    started = time.monotonic()
    if args.command == "build":
        s, b = build_stints(), build_boxes()
        out: dict[str, Any] = write_dataset(args.output, s, b)
    else:
        pinned = {"stints_sha256": args.stints, "boxes_sha256": args.boxes}
        s, b = read_dataset(args.output, pinned)
        out = data_check(s, b, pinned)
        if args.report:
            args.report.write_text(json.dumps(out, indent=1, sort_keys=True) + "\n")
            out = {"written": str(args.report)}
    out["elapsed_seconds"] = round(time.monotonic() - started, 1)
    out["peak_rss_mib"] = round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024, 1)
    print(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
