"""zTS: relative true shooting adjusted for play-type difficulty (courtlens-zts-validation-v1, R04).

After Databallr's zTS: Expected TS = sum(play-type share x league TS for that play type),
Playtype Difficulty = league TS - Expected TS, zTS = rTS + Difficulty.

Synergy rows carry no FTA, so play-type TS here is CourtLens' own definition,
PTS / (2 x scoring possessions) with scoring possessions = possessions x (1 - turnover share).
It is not Databallr's number. Pure functions only; the runner reads the data.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass
from typing import Any

import numpy as np

REGISTRATION = "courtlens-zts-validation-v1"
PLAY_TYPES = (
    "cut",
    "handoff",
    "isolation",
    "misc",
    "offrebound",
    "offscreen",
    "postup",
    "prballhandler",
    "prrollman",
    "spotup",
    "transition",
)
SOURCE_MIN_POSSESSIONS = 10
MIN_TSA = 200.0
MIN_COVERAGE = 0.9
FREQUENCY_ROUNDING = 0.0005

# Unknown reasons, in the registered order of precedence.
NO_RTS = "no_rts"
SMALL_SAMPLE = "small_sample"
NO_PLAY_TYPES = "no_play_types"
SOURCE_ROWS_MISSING = "source_rows_missing"
LOW_COVERAGE = "low_coverage"
KNOWN = "known"


@dataclass(frozen=True)
class TypeRow:
    """One Synergy offensive row for a player-team-season-play type."""

    play_type: str
    possessions: float
    frequency: float
    points: float
    turnover_frequency: float

    @property
    def scoring_possessions(self) -> float:
        return self.possessions * (1.0 - self.turnover_frequency)


def team_mix(rows: Sequence[TypeRow]) -> dict[str, Any]:
    """Coverage and dropped-row check for one player-team-season's listed rows."""
    if not rows:
        raise ValueError("a team mix needs at least one row")
    if len({r.play_type for r in rows}) != len(rows):
        raise ValueError("duplicate play type in one player-team-season")
    unknown = {r.play_type for r in rows} - set(PLAY_TYPES)
    if unknown:
        raise ValueError(f"unknown play types {sorted(unknown)}")
    listed = sum(r.possessions for r in rows)
    frequency = sum(r.frequency for r in rows)
    if frequency <= 0:
        raise ValueError("listed rows have no frequency")
    total = listed / frequency
    missing = max(total - listed, 0.0)
    missing_types = len(PLAY_TYPES) - len(rows)
    tolerance = FREQUENCY_ROUNDING * len(rows) * total / frequency
    capacity = (SOURCE_MIN_POSSESSIONS - 1) * missing_types
    return {
        "listed_possessions": listed,
        "implied_possessions": total,
        "missing_possessions": missing,
        "missing_types": missing_types,
        "dropped_row": missing > capacity + tolerance,
        "types": {
            r.play_type: {
                "possessions": r.possessions,
                "scoring_possessions": r.scoring_possessions,
                "points": r.points,
            }
            for r in rows
        },
    }


def combine(teams: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    """A player's season mix over their teams: summed types, pooled coverage."""
    types: dict[str, dict[str, float]] = {}
    for team in teams:
        for k, v in team["types"].items():
            slot = types.setdefault(
                k, {"possessions": 0.0, "scoring_possessions": 0.0, "points": 0.0}
            )
            for field in slot:
                slot[field] += v[field]
    listed = sum(t["listed_possessions"] for t in teams)
    implied = sum(t["implied_possessions"] for t in teams)
    return {
        "listed_possessions": listed,
        "implied_possessions": implied,
        "coverage": listed / implied if implied > 0 else 0.0,
        "dropped_row": any(t["dropped_row"] for t in teams),
        "types": dict(sorted(types.items())),
    }


def league_references(rows: Iterable[TypeRow]) -> dict[str, Any]:
    """League play-type TS (pooled, weighted by scoring possessions) and league Synergy TS."""
    sums = {k: [0.0, 0.0] for k in PLAY_TYPES}
    for r in rows:
        sums[r.play_type][0] += r.points
        sums[r.play_type][1] += r.scoring_possessions
    total_points = sum(v[0] for v in sums.values())
    total_sp = sum(v[1] for v in sums.values())
    if total_sp <= 0 or any(v[1] <= 0 for v in sums.values()):
        raise ValueError("every play type needs scoring possessions for a league reference")
    return {
        "ts": total_points / (2.0 * total_sp),
        "scoring_possessions": total_sp,
        "types": {
            k: {
                "ts": v[0] / (2.0 * v[1]),
                "points": v[0],
                "scoring_possessions": v[1],
                "share": v[1] / total_sp,
            }
            for k, v in sums.items()
        },
    }


def shares(types: Mapping[str, Mapping[str, float]]) -> dict[str, float]:
    total = sum(v["scoring_possessions"] for v in types.values())
    if total <= 0:
        raise ValueError("no scoring possessions")
    return {k: v["scoring_possessions"] / total for k, v in types.items()}


def expected_ts(mix_shares: Mapping[str, float], refs: Mapping[str, Any]) -> float:
    return float(sum(s * refs["types"][k]["ts"] for k, s in mix_shares.items()))


def player_value(
    rts: float | None,
    tsa: float | None,
    mix: Mapping[str, Any] | None,
    refs: Mapping[str, Any],
) -> dict[str, Any]:
    """One player-season's served zTS, or one named unknown reason (registered order)."""
    status = KNOWN
    if rts is None or tsa is None:
        status = NO_RTS
    elif tsa < MIN_TSA:
        status = SMALL_SAMPLE
    elif mix is None or not mix["types"]:
        status = NO_PLAY_TYPES
    elif mix["dropped_row"]:
        status = SOURCE_ROWS_MISSING
    elif mix["coverage"] < MIN_COVERAGE:
        status = LOW_COVERAGE
    out: dict[str, Any] = {
        "status": status,
        "rts": rts,
        "tsa": tsa,
        "expected_ts": None,
        "difficulty": None,
        "zts": None,
        "synergy_ts": None,
    }
    if mix is not None and mix["types"]:
        mix_shares = shares(mix["types"])
        sp = sum(v["scoring_possessions"] for v in mix["types"].values())
        points = sum(v["points"] for v in mix["types"].values())
        out["synergy_ts"] = points / (2.0 * sp) if sp > 0 else None
        expected = expected_ts(mix_shares, refs)
        if status == KNOWN:
            assert rts is not None
            difficulty = refs["ts"] - expected
            out["expected_ts"] = expected
            out["difficulty"] = difficulty
            out["zts"] = rts + difficulty
    return out


# ---- Validation metrics ------------------------------------------------------------------------


def weighted_pearson(x: np.ndarray, y: np.ndarray, w: np.ndarray) -> float:
    w = w / w.sum()
    mx, my = float(w @ x), float(w @ y)
    dx, dy = x - mx, y - my
    cov = float(w @ (dx * dy))
    vx, vy = float(w @ (dx * dx)), float(w @ (dy * dy))
    if vx <= 0 or vy <= 0:
        raise ValueError("weighted correlation needs variation in both series")
    return cov / float(np.sqrt(vx * vy))


def weighted_mse(prediction: np.ndarray, target: np.ndarray, w: np.ndarray) -> float:
    return float((w @ (prediction - target) ** 2) / w.sum())


def harmonic_mean(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    return np.asarray(2.0 * a * b / (a + b))


def compare(
    rts: np.ndarray,
    zts: np.ndarray,
    target: np.ndarray,
    w: np.ndarray,
    *,
    with_mse: bool,
) -> dict[str, float]:
    """Both predictors' metrics on one sample and their differences (positive favours zTS)."""
    out = {
        "r_rts": weighted_pearson(rts, target, w),
        "r_zts": weighted_pearson(zts, target, w),
        "r_difficulty": weighted_pearson(zts - rts, target, w),
    }
    out["delta_r"] = out["r_zts"] - out["r_rts"]
    if with_mse:
        out["mse_rts"] = weighted_mse(rts, target, w) * 1e4
        out["mse_zts"] = weighted_mse(zts, target, w) * 1e4
        out["delta_mse"] = out["mse_rts"] - out["mse_zts"]
    for key, value in out.items():
        if not np.isfinite(value):
            raise ValueError(f"non-finite metric {key}")
    return out


def paired_bootstrap(
    players: np.ndarray,
    rts: np.ndarray,
    zts: np.ndarray,
    target: np.ndarray,
    w: np.ndarray,
    *,
    with_mse: bool,
    replicates: int,
    rng: np.random.Generator,
    interval: float = 0.95,
) -> dict[str, dict[str, float]]:
    """Player-cluster bootstrap: resample players with all their rows, recompute every metric."""
    point = compare(rts, zts, target, w, with_mse=with_mse)
    unique, inverse = np.unique(players, return_inverse=True)
    rows_of = [np.flatnonzero(inverse == i) for i in range(len(unique))]
    draws: dict[str, list[float]] = {k: [] for k in point}
    for _ in range(replicates):
        picked = rng.integers(0, len(unique), size=len(unique))
        index = np.concatenate([rows_of[i] for i in picked])
        result = compare(rts[index], zts[index], target[index], w[index], with_mse=with_mse)
        for k, v in result.items():
            draws[k].append(v)
    tail = (1.0 - interval) / 2.0 * 100.0
    return {
        k: {
            "value": point[k],
            "low": float(np.percentile(draws[k], tail)),
            "high": float(np.percentile(draws[k], 100.0 - tail)),
        }
        for k in point
    }


def verdict(delta: Mapping[str, float]) -> str:
    if delta["low"] > 0:
        return "zts_better"
    if delta["high"] < 0:
        return "rts_better"
    return "no_clear_difference"
