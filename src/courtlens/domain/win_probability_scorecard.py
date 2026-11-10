"""Scorecard arithmetic for the frozen win-probability model (R15b). Pure, no I/O.

Each scored game stores its states as 20 calibration bins (weight, weighted prediction, weighted
outcome), with every game weighing 1 in total, so calibration error over any set of games can be
recomputed exactly without keeping the states.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import numpy as np

ECE_BINS = 20
DRIFT_WINDOW_DAYS = 30
DRIFT_MIN_GAMES = 25
CLIP = 1e-6
BOOTSTRAP_REPLICATES = 2000
BOOTSTRAP_SEED = 2501
BOOTSTRAP_MIN_GAMES = 20
PHASES = ("first_half", "third_quarter", "fourth_early", "last_two", "overtime")


def phase_masks(times: np.ndarray) -> dict[str, np.ndarray]:
    return {
        "first_half": times < 1440,
        "third_quarter": (times >= 1440) & (times < 2160),
        "fourth_early": (times >= 2160) & (times < 2760),
        "last_two": (times >= 2760) & (times < 2880),
        "overtime": times >= 2880,
    }


def losses(p: np.ndarray, win: float) -> tuple[float, float]:
    """Mean (log loss, Brier) over one game's states."""
    q = np.clip(p, CLIP, 1 - CLIP)
    log_loss = -(win * np.log(q) + (1 - win) * np.log(1 - q))
    return float(log_loss.mean()), float(((p - win) ** 2).mean())


def game_bins(p: np.ndarray, win: float) -> list[list[float]]:
    """Calibration bins for one game: [weight, weighted p, weighted outcome], total weight 1."""
    weight = 1.0 / len(p)
    edges = np.linspace(0, 1, ECE_BINS + 1)
    bins = np.clip(np.digitize(p, edges) - 1, 0, ECE_BINS - 1)
    out = np.zeros((ECE_BINS, 3))
    np.add.at(out[:, 0], bins, weight)
    np.add.at(out[:, 1], bins, weight * p)
    out[:, 2] = out[:, 0] * win
    return [[round(float(v), 7) for v in row] for row in out]


def calibration_error(bins: np.ndarray) -> float:
    total = bins[..., 0].sum()
    if total <= 0:
        return float("nan")
    mass = bins[..., 0]
    gap = np.abs(bins[..., 1] - bins[..., 2])
    # `gap` is |weighted p - weighted outcome|, which equals mass x |mean p - mean outcome|.
    return float(gap[mass > 0].sum() / total)


def calibration_curve(bins: np.ndarray) -> list[dict[str, float]]:
    total = bins[:, 0].sum()
    return [
        {
            "predicted": float(b[1] / b[0]),
            "observed": float(b[2] / b[0]),
            "share": float(b[0] / total),
        }
        for b in bins
        if b[0] > 0
    ]


def interval_for(games: int, table: list[dict[str, float]]) -> tuple[float, float] | None:
    """The frozen test-season calibration-error interval for a window of `games`, interpolated."""
    if games < table[0]["games"]:
        return None
    sizes = [row["games"] for row in table]
    low = float(np.interp(games, sizes, [row["low"] for row in table]))
    high = float(np.interp(games, sizes, [row["high"] for row in table]))
    return low, high


def drift_status(error: float | None, games: int, table: list[dict[str, float]]) -> dict[str, Any]:
    """`within`, `above`, `below`, or `insufficient` (too few games to compare fairly)."""
    interval = interval_for(games, table) if games >= DRIFT_MIN_GAMES else None
    if error is None or interval is None:
        return {
            "status": "insufficient",
            "games": games,
            "minimum_games": DRIFT_MIN_GAMES,
            "calibration_error": error,
            "interval": None,
        }
    status = "above" if error > interval[1] else "below" if error < interval[0] else "within"
    return {
        "status": status,
        "games": games,
        "minimum_games": DRIFT_MIN_GAMES,
        "calibration_error": error,
        "interval": {"low": interval[0], "high": interval[1]},
    }


def paired_interval(values: np.ndarray) -> dict[str, float] | None:
    """Game-bootstrap 95% interval of a mean; None under the minimum sample."""
    if len(values) < BOOTSTRAP_MIN_GAMES:
        return None
    rng = np.random.default_rng(BOOTSTRAP_SEED)
    picks = rng.integers(0, len(values), size=(BOOTSTRAP_REPLICATES, len(values)))
    draws = values[picks].mean(axis=1)
    return {
        "mean": float(values.mean()),
        "low": float(np.quantile(draws, 0.025)),
        "high": float(np.quantile(draws, 0.975)),
        "games": len(values),
    }


def _group(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Headline numbers for a set of scored games. Positive gaps favour CourtLens."""
    if not rows:
        return {"games": 0}
    bins = np.array([r["bins_courtlens"] for r in rows])
    compared = [r for r in rows if r["espn"] is not None]
    summary: dict[str, Any] = {
        "games": len(rows),
        "first_date": min(r["date"] for r in rows),
        "last_date": max(r["date"] for r in rows),
        "courtlens": {
            "log_loss": float(np.mean([r["courtlens"]["log_loss"] for r in rows])),
            "brier": float(np.mean([r["courtlens"]["brier"] for r in rows])),
            "calibration_error": calibration_error(bins.sum(axis=0)),
        },
        "curve_courtlens": calibration_curve(bins.sum(axis=0)),
        "espn_compared_games": len(compared),
    }
    if compared:
        ours = np.array([r["espn"]["courtlens_log_loss"] for r in compared])
        theirs = np.array([r["espn"]["log_loss"] for r in compared])
        ours_brier = np.array([r["espn"]["courtlens_brier"] for r in compared])
        theirs_brier = np.array([r["espn"]["brier"] for r in compared])
        espn_bins = np.array([r["espn"]["bins"] for r in compared]).sum(axis=0)
        same_bins = np.array([r["espn"]["bins_courtlens"] for r in compared]).sum(axis=0)
        summary["same_events"] = {
            "courtlens_log_loss": float(ours.mean()),
            "espn_log_loss": float(theirs.mean()),
            "courtlens_brier": float(ours_brier.mean()),
            "espn_brier": float(theirs_brier.mean()),
            "courtlens_calibration_error": calibration_error(same_bins),
            "espn_calibration_error": calibration_error(espn_bins),
            "log_loss_gap": paired_interval(theirs - ours),
            "matched_state_share": float(np.mean([r["espn"]["matched_share"] for r in compared])),
        }
        summary["curve_espn"] = calibration_curve(espn_bins)
    return summary


def summarize(rows: list[dict[str, Any]], table: list[dict[str, float]]) -> dict[str, Any]:
    """Everything the page shows, from the append-only per-game rows."""
    rows = sorted(rows, key=lambda r: (r["date"], r["game_id"]))
    prospective = [r for r in rows if r["prospective"]]
    replayed = [r for r in rows if not r["prospective"]]
    # Drift reads prospective games once there are any, and is labelled with which it read.
    basis = "prospective" if prospective else "pre_freeze_replay"
    drift_rows = prospective or replayed
    series = []
    if drift_rows:
        first = date.fromisoformat(drift_rows[0]["date"])
        last = date.fromisoformat(drift_rows[-1]["date"])
        day = first
        while day <= last:
            start = (day - timedelta(days=DRIFT_WINDOW_DAYS - 1)).isoformat()
            window = [r for r in drift_rows if start <= r["date"] <= day.isoformat()]
            if window:
                error = calibration_error(
                    np.array([r["bins_courtlens"] for r in window]).sum(axis=0)
                )
                series.append(
                    {
                        "date": day.isoformat(),
                        "games": len(window),
                        **drift_status(error, len(window), table),
                    }
                )
            day += timedelta(days=1)
    latest = series[-1] if series else None
    nightly = [
        {
            "date": r["date"],
            "game_id": r["game_id"],
            "home": r["home"],
            "away": r["away"],
            "home_score": r["home_score"],
            "away_score": r["away_score"],
            "prospective": r["prospective"],
            "availability": r["availability"],
            "courtlens": r["courtlens"],
            "espn": None
            if r["espn"] is None
            else {
                "log_loss": r["espn"]["log_loss"],
                "brier": r["espn"]["brier"],
                "courtlens_log_loss": r["espn"]["courtlens_log_loss"],
                "courtlens_brier": r["espn"]["courtlens_brier"],
            },
        }
        for r in rows[-60:][::-1]
    ]
    return {
        "prospective": _group(prospective),
        "pre_freeze_replay": _group(replayed),
        "drift": {
            "basis": basis,
            "window_days": DRIFT_WINDOW_DAYS,
            "latest": latest
            if latest
            else {"status": "insufficient", "games": 0, "minimum_games": DRIFT_MIN_GAMES},
            "series": series,
        },
        "recent_games": nightly,
        "games_scored": len(rows),
    }
