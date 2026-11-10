"""Replay play-by-play rows into in-game state for win probability (R15a).

Pure and causal: each row's state depends only on that row and earlier ones, so the same code
can score a game in progress. Rows use the nbastatsv3 fields. Possession is inferred from the
events (unknown after a missed shot, a jump ball or a period start, until an event settles it).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

import numpy as np

REGULATION_SECONDS = 2880.0
PERIOD_SECONDS = 720.0
OVERTIME_SECONDS = 300.0
END_GAME_SECONDS = 120.0
GRID_SECONDS = 15.0

CLOCK = re.compile(r"^PT(\d+)M(\d+(?:\.\d+)?)S$")
PERSONAL = re.compile(r"\(P(\d+)(?:\.(T\d+|PN))?\)")
FREE_THROW = re.compile(r"(\d) of (\d)")
KEEPS_BALL = ("Flagrant", "Clear Path")
COLUMNS = (
    "elapsed",
    "period",
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
    "three_made_home",
    "three_made_away",
    "three_att_home",
    "three_att_away",
    "ft_made_home",
    "ft_made_away",
    "ft_att_home",
    "ft_att_away",
)
_INDEX = {name: i for i, name in enumerate(COLUMNS)}


def period_start(period: int) -> float:
    if period <= 4:
        return (period - 1) * PERIOD_SECONDS
    return REGULATION_SECONDS + (period - 5) * OVERTIME_SECONDS


def period_length(period: int) -> float:
    return PERIOD_SECONDS if period <= 4 else OVERTIME_SECONDS


def segment_end(period: int) -> float:
    """Game time when the current segment ends: regulation, or the current overtime."""
    return REGULATION_SECONDS if period <= 4 else period_start(period) + OVERTIME_SECONDS


def parse_clock(value: str) -> float | None:
    match = CLOCK.match(value or "")
    return 60 * int(match[1]) + float(match[2]) if match else None


@dataclass
class Replay:
    """One row per kept event, in game order; `events` are the player-level exits and fouls."""

    state: np.ndarray
    fouls: list[tuple[float, str, str, int]] = field(default_factory=list)
    ejections: list[tuple[float, str, str]] = field(default_factory=list)

    def column(self, name: str) -> np.ndarray:
        result: np.ndarray = self.state[:, _INDEX[name]]
        return result


def _side(row: dict[str, Any], home: str, away: str) -> str | None:
    for key in ("teamId", "personId"):
        value = str(row.get(key) or "")
        if value == home:
            return "home"
        if value == away:
            return "away"
    return None


def _other(side: str) -> str:
    return "away" if side == "home" else "home"


def replay(rows: list[dict[str, Any]], home: str, away: str) -> Replay:
    """Game state after each row. `home` and `away` are NBA team ids."""
    timed = []
    for index, row in enumerate(rows):
        seconds = parse_clock(row.get("clock", ""))
        period = int(row["period"]) if str(row.get("period", "")).isdigit() else 0
        if seconds is not None and period >= 1 and row.get("actionType"):
            timed.append((period, -seconds, index, row))
    timed.sort(key=lambda item: item[:3])

    score = {"home": 0, "away": 0}
    ball: str | None = None
    ball_start = 0.0
    pending = {"home": 0, "away": 0}
    timeouts = {"home": 0, "away": 0}
    team_fouls = {"home": 0, "away": 0}
    late_fouls = {"home": 0, "away": 0}
    threes = {"home": [0, 0], "away": [0, 0]}
    throws = {"home": [0, 0], "away": [0, 0]}
    current = 0
    last_made: tuple[str, float] | None = None
    output: list[list[float]] = []
    fouls: list[tuple[float, str, str, int]] = []
    ejections: list[tuple[float, str, str]] = []

    def set_ball(side: str | None, elapsed: float) -> None:
        nonlocal ball, ball_start
        if side != ball:
            ball, ball_start = side, elapsed

    for period, negative, _, row in timed:
        left = -negative
        elapsed = period_start(period) + period_length(period) - left
        if period != current:
            current = period
            team_fouls = {"home": 0, "away": 0}
            late_fouls = {"home": 0, "away": 0}
            pending = {"home": 0, "away": 0}
            set_ball(None, elapsed)
        kind = row.get("actionType", "")
        text = row.get("description", "") or ""
        side = _side(row, home, away)
        person = str(row.get("personId") or "")

        # Older archives write 0-0 on non-scoring rows, so a row can never lower the total.
        new_home = (
            int(row["scoreHome"]) if row.get("scoreHome") not in (None, "") else score["home"]
        )
        new_away = (
            int(row["scoreAway"]) if row.get("scoreAway") not in (None, "") else score["away"]
        )
        if new_home + new_away >= score["home"] + score["away"]:
            score["home"], score["away"] = new_home, new_away

        if kind == "Made Shot" and side:
            if "3PT" in text:
                threes[side][0] += 1
                threes[side][1] += 1
            set_ball(_other(side), elapsed)
            last_made = (side, elapsed)
        elif kind == "Missed Shot" and side:
            if "3PT" in text:
                threes[side][1] += 1
            set_ball(None, elapsed)
        elif kind == "Rebound" and side:
            set_ball(side, elapsed)
        elif kind == "Turnover" and side:
            set_ball(_other(side), elapsed)
        elif kind == "Jump Ball":
            set_ball(None, elapsed)
        elif kind == "Timeout" and side and row.get("subType") != "Official":
            timeouts[side] += 1
        elif kind == "Ejection" and side:
            ejections.append((elapsed, side, person))
        elif kind == "Foul" and side:
            marker = PERSONAL.search(text)
            if marker:
                fouls.append((elapsed, side, person, int(marker[1])))
                if marker[2]:
                    team_fouls[side] = (
                        max(team_fouls[side] + 1, 5)
                        if marker[2] == "PN"
                        else int(marker[2].removeprefix("T"))
                    )
                    if left <= END_GAME_SECONDS:
                        late_fouls[side] += 1
                    shooter = _other(side)
                    set_ball(shooter, elapsed)
                    if str(row.get("subType", "")).startswith("Shooting"):
                        and_one = last_made == (shooter, elapsed)
                        pending[shooter] = 1 if and_one else 2
        elif kind == "Free Throw" and side:
            made = not text.startswith("MISS")
            throws[side][1] += 1
            throws[side][0] += made
            count = FREE_THROW.search(str(row.get("subType", "")) or text)
            if count:
                pending[side] = max(int(count[2]) - int(count[1]), 0)
                last = count[1] == count[2]
                if last and made and not any(k in text for k in KEEPS_BALL):
                    set_ball(_other(side), elapsed)
                elif last and not made:
                    set_ball(None, elapsed)

        limit = 4 if period > 4 else 5
        output.append(
            [
                elapsed,
                period,
                score["home"],
                score["away"],
                1 if ball == "home" else -1 if ball == "away" else 0,
                ball_start,
                pending["home"],
                pending["away"],
                timeouts["home"],
                timeouts["away"],
                team_fouls["home"],
                team_fouls["away"],
                team_fouls["away"] >= limit or late_fouls["away"] >= 2,
                team_fouls["home"] >= limit or late_fouls["home"] >= 2,
                threes["home"][0],
                threes["away"][0],
                threes["home"][1],
                threes["away"][1],
                throws["home"][0],
                throws["away"][0],
                throws["home"][1],
                throws["away"][1],
            ]
        )
    state = np.array(output, dtype=np.float64).reshape(-1, len(COLUMNS))
    return Replay(state, fouls, ejections)


def state_rows(game: Replay) -> tuple[np.ndarray, np.ndarray]:
    """Registered sampling: (state time, row index) on the grid plus late events.

    A grid state is the game after all events at or before its time. Events at zero seconds in
    the fourth period or later are not states: the result, or the next overtime's tip, follows.
    """
    elapsed, period = game.column("elapsed"), game.column("period").astype(int)
    last_period = int(period[-1])
    end = period_start(last_period) + period_length(last_period)
    grid = np.arange(0.0, end, GRID_SECONDS)
    indices = np.searchsorted(elapsed, grid, side="right") - 1
    keep = indices >= 0
    times, rows = grid[keep], indices[keep]

    ends = np.array([segment_end(int(p)) for p in period])
    late = (period >= 4) & (ends - elapsed <= END_GAME_SECONDS) & (ends > elapsed)
    late_rows = np.flatnonzero(late)
    merged_times = np.concatenate([times, elapsed[late_rows]])
    merged_rows = np.concatenate([rows, late_rows])
    order = np.lexsort((merged_rows, merged_times))
    return merged_times[order], merged_rows[order]


def _period_at(time: float) -> int:
    if time < REGULATION_SECONDS:
        return int(time // PERIOD_SECONDS) + 1
    return 5 + int((time - REGULATION_SECONDS) // OVERTIME_SECONDS)


def period_at(times: np.ndarray) -> np.ndarray:
    return np.array([_period_at(float(t)) for t in times], dtype=np.int64)


def segment_end_margins(game: Replay, times: np.ndarray) -> np.ndarray:
    """Home margin at the end of each state's segment, read from the completed game."""
    elapsed = game.column("elapsed")
    margin = game.column("home_score") - game.column("away_score")
    ends = np.array([segment_end(_period_at(float(t))) for t in times])
    rows = np.searchsorted(elapsed, ends, side="right") - 1
    result: np.ndarray = margin[rows]
    return result
