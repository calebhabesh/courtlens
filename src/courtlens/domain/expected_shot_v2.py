"""Shot Quality v2 (Research R05, `courtlens-expected-shot-v2`): pure logic.

Pre-shot context from one game's NBA PlayByPlayV3 events, the shot-chart join check, and the
metrics, calibration and bootstrap the runner uses. Every context value describes the moment
before the shot: nothing here reads the shot's own result or any later event. A value that
cannot be established is unknown (NaN or -1), never zero.
"""

from __future__ import annotations

import contextlib
import math
import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass

import numpy as np

from courtlens.domain.win_probability_state import parse_clock, period_length, period_start

FREE_THROW = re.compile(r"^Free Throw (\d) of (\d)$")
ASSIST = re.compile(r"\(\w[^()]*\d+ AST\)")
UNKNOWN = float("nan")


@dataclass(frozen=True)
class ShotContext:
    """Pre-shot context of one field-goal attempt in the play-by-play."""

    action_number: int
    person_id: str
    team_id: str
    made: bool
    period: int
    remaining_seconds: float  # game clock left in the period
    margin: float  # shooting team minus opponent, before the shot
    possession_seconds: float  # since the shooting team gained possession; NaN when unknown
    after_offensive_rebound: int  # 1 / 0, or -1 when the possession is unknown
    since_offensive_rebound: float  # seconds since the last own offensive rebound, else NaN
    possession_unknown_reason: str  # "" when known
    assisted_in_description: bool  # descriptive only: recorded on makes, so never a feature


@dataclass
class GameContextResult:
    shots: dict[int, ShotContext]
    duplicate_actions: set[int]
    events: int


def _elapsed(period: int, clock: str) -> float | None:
    remaining = parse_clock(clock)
    if remaining is None:
        return None
    return period_start(period) + period_length(period) - remaining


def game_context(rows: Iterable[Mapping[str, str]]) -> GameContextResult:
    """Replay one game's events in source order and return the context of every FG attempt.

    Possession rules (registered in courtlens-expected-shot-v2): a team gains possession at a
    period start (owner open until its first action), an opponent's made field goal, an
    opponent's made last regular free throw, its own defensive rebound of an opponent's missed
    shot or missed last free throw, or an opponent's turnover. An own offensive rebound keeps the
    possession and its start (after a missed and-one free throw, the possession starts at the
    rebound). A mid-period jump ball makes the possession unknown until the next
    gain. Technical, flagrant and clear-path free throws change nothing. A shot by a team that
    the replay does not hold possession for is unknown, never a guess.
    """
    events = list(rows)
    teams = sorted(
        {
            r["teamId"]
            for r in events
            if r.get("location", "").strip() in {"h", "v"} and r.get("teamId", "0") != "0"
        }
    )

    def other(team: str) -> str | None:
        rest = [t for t in teams if t != team]
        return rest[0] if len(teams) == 2 and len(rest) == 1 else None

    owner: str | None = None  # None = open (period start), "?" = unknown
    start = 0.0
    oreb_time: float | None = None
    last_miss: str | None = None
    score = {"h": 0.0, "v": 0.0}
    shots: dict[int, ShotContext] = {}
    duplicates: set[int] = set()

    def gain(team: str | None, at: float) -> None:
        nonlocal owner, start, oreb_time, last_miss
        owner = team if team is not None else "?"
        start = at
        oreb_time = None
        last_miss = None

    for row in events:
        kind = row.get("actionType", "").strip()
        sub = row.get("subType", "").strip()
        team = row.get("teamId", "0")
        if team == "0" and row.get("personId", "") in teams:
            team = row["personId"]  # team rebounds and team turnovers carry the team here
        try:
            period = int(row.get("period", ""))
        except ValueError:
            continue
        elapsed = _elapsed(period, row.get("clock", ""))
        if kind == "period" and sub == "start":
            owner, start, oreb_time, last_miss = None, period_start(period), None, None
        elif elapsed is None:
            if row.get("isFieldGoal") == "1":
                owner = "?"
        elif row.get("isFieldGoal") == "1" and kind in {"Made Shot", "Missed Shot"}:
            number = int(row["actionNumber"])
            made = kind == "Made Shot"
            location = row.get("location", "").strip()
            opponent = "v" if location == "h" else "h"
            margin = score[location] - score[opponent] if location in {"h", "v"} else UNKNOWN
            if owner is None:
                owner = team
            reason = ""
            if owner == "?":
                reason = "jump_ball_or_clock"
            elif owner != team:
                reason = "possession_conflict"
            seconds = elapsed - start if not reason else UNKNOWN
            if not reason and seconds < 0:
                reason, seconds = "clock_order", UNKNOWN
            context = ShotContext(
                action_number=number,
                person_id=row.get("personId", ""),
                team_id=team,
                made=made,
                period=period,
                remaining_seconds=period_start(period) + period_length(period) - elapsed,
                margin=margin,
                possession_seconds=seconds,
                after_offensive_rebound=-1 if reason else int(oreb_time is not None),
                since_offensive_rebound=(
                    elapsed - oreb_time if not reason and oreb_time is not None else UNKNOWN
                ),
                possession_unknown_reason=reason,
                assisted_in_description=bool(ASSIST.search(row.get("description", ""))),
            )
            if number in shots:
                duplicates.add(number)
            shots[number] = context
            if made:
                gain(other(team), elapsed)
            else:
                last_miss = team
                if reason:
                    owner = "?"  # stays unknown until the next possession gain
        elif kind == "Rebound" and last_miss is not None and team in teams:
            if team == last_miss:
                if owner is None:
                    owner = team
                elif owner not in ("?", team):
                    # a missed and-one free throw rebounded by the shooters: their ball again
                    owner, start = team, elapsed
                oreb_time = elapsed
                last_miss = None
            else:
                gain(team, elapsed)
        elif kind == "Free Throw":
            match = FREE_THROW.match(sub)
            if match and match[1] == match[2] and team in teams:
                if row.get("shotResult", "") == "Made" or "PTS)" in row.get("description", ""):
                    gain(other(team), elapsed)
                else:
                    last_miss = team
        elif kind == "Turnover" and team in teams:
            gain(other(team), elapsed)
        elif kind == "Jump Ball" and elapsed > period_start(period) + 0.5:
            owner, oreb_time, last_miss = "?", None, None
        for key, location in (("scoreHome", "h"), ("scoreAway", "v")):
            value = row.get(key, "")
            if value not in ("", None):
                with contextlib.suppress(ValueError):
                    score[location] = float(value)
    return GameContextResult(shots=shots, duplicate_actions=duplicates, events=len(events))


# ---- Metrics ------------------------------------------------------------------------------------

EPS = 1e-6


def clip(p: np.ndarray) -> np.ndarray:
    result: np.ndarray = np.clip(p, EPS, 1 - EPS)
    return result


def brier_terms(p: np.ndarray, y: np.ndarray) -> np.ndarray:
    result: np.ndarray = (p - y) ** 2
    return result


def log_loss_terms(p: np.ndarray, y: np.ndarray) -> np.ndarray:
    q = clip(p)
    result: np.ndarray = -(y * np.log(q) + (1 - y) * np.log(1 - q))
    return result


def ece(p: np.ndarray, y: np.ndarray, bins: int = 10) -> float:
    """Expected calibration error over fixed equal-width bins, weighted by count."""
    index = np.minimum((p * bins).astype(np.int64), bins - 1)
    total = 0.0
    for b in range(bins):
        mask = index == b
        if mask.any():
            total += mask.sum() * abs(float(p[mask].mean()) - float(y[mask].mean()))
    return total / len(p)


def calibration_curve(p: np.ndarray, y: np.ndarray, bins: int) -> list[dict[str, float | int]]:
    """Equal-count bins by predicted probability: count, mean prediction, observed rate."""
    order = np.argsort(p, kind="stable")
    edges = np.linspace(0, len(p), bins + 1).round().astype(np.int64)
    out: list[dict[str, float | int]] = []
    for b in range(bins):
        idx = order[edges[b] : edges[b + 1]]
        if len(idx) == 0:
            continue
        out.append(
            {
                "bin": b + 1,
                "count": len(idx),
                "low": float(p[idx[0]]),
                "high": float(p[idx[-1]]),
                "mean_predicted": float(p[idx].mean()),
                "observed": float(y[idx].mean()),
            }
        )
    return out


def game_sums(game_index: np.ndarray, values: np.ndarray, games: int) -> np.ndarray:
    result: np.ndarray = np.bincount(game_index, weights=values, minlength=games)
    return result


def game_bootstrap_weights(games: int, replicates: int, seed: int) -> np.ndarray:
    """Multinomial game counts (replicates x games): resampling whole games with replacement."""
    rng = np.random.default_rng(seed)
    result: np.ndarray = rng.multinomial(games, np.full(games, 1.0 / games), size=replicates)
    return result


def interval(values: np.ndarray, level: float = 0.95) -> tuple[float, float]:
    tail = (1 - level) / 2
    low, high = np.quantile(values, [tail, 1 - tail])
    return float(low), float(high)


def logit(p: np.ndarray) -> np.ndarray:
    q = clip(p)
    result: np.ndarray = np.log(q / (1 - q))
    return result


def platt(p: np.ndarray, a: float, b: float) -> np.ndarray:
    result: np.ndarray = 1.0 / (1.0 + np.exp(-(a + b * logit(p))))
    return result


def finite(value: float, name: str) -> float:
    if not math.isfinite(value):
        raise ValueError(f"non-finite {name}")
    return value
