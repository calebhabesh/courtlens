"""PC11 WOWY (with or without you) splits derived from sealed IM03 stints (owner decision D4).

Pure arithmetic over accepted five-player stints; no fitting. Contract:
docs/design/gated-pages-v1.md#wowy.
"""

from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from itertools import combinations
from typing import Any

VERSION = "courtlens-wowy-v1"
# Players per team-season whose pairs are kept: enough for a rotation, small enough to serve.
TOP_PLAYERS = 10
# A split with fewer possessions on either side is shown as a small sample, not ranked.
MIN_POSSESSIONS = 200
CELLS = ("both", "a_only", "b_only", "neither")
CELL_BY_PRESENCE = {
    (True, True): "both",
    (True, False): "a_only",
    (False, True): "b_only",
    (False, False): "neither",
}


@dataclass(frozen=True)
class TeamStint:
    """One team's side of a stint: who was on the floor and what happened at each end."""

    team: str
    lineup: frozenset[str]
    seconds: float
    points_for: float
    points_against: float
    possessions_for: float
    possessions_against: float


@dataclass
class Split:
    seconds: float = 0.0
    points_for: float = 0.0
    points_against: float = 0.0
    possessions_for: float = 0.0
    possessions_against: float = 0.0
    stints: int = 0

    def add(self, stint: TeamStint) -> None:
        self.seconds += stint.seconds
        self.points_for += stint.points_for
        self.points_against += stint.points_against
        self.possessions_for += stint.possessions_for
        self.possessions_against += stint.possessions_against
        self.stints += 1

    def as_dict(self) -> dict[str, float | int]:
        return {
            "seconds": round(self.seconds, 3),
            "points_for": self.points_for,
            "points_against": self.points_against,
            "possessions_for": round(self.possessions_for, 3),
            "possessions_against": round(self.possessions_against, 3),
            "stints": self.stints,
        }


@dataclass
class _Team:
    seconds: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    stints: list[TeamStint] = field(default_factory=list)


def team_stints(stints: Iterable[Any]) -> list[TeamStint]:
    """Both sides of each IM04 `Stint` (home/away lineups, points `hp/ap`, possessions `hx/ax`)."""
    sides: list[TeamStint] = []
    for s in stints:
        sides.append(TeamStint(s.home_team, frozenset(s.home), s.seconds, s.hp, s.ap, s.hx, s.ax))
        sides.append(TeamStint(s.away_team, frozenset(s.away), s.seconds, s.ap, s.hp, s.ax, s.hx))
    return sides


def cohort_splits(sides: Iterable[TeamStint], top: int = TOP_PLAYERS) -> dict[str, Any]:
    """Per team: its top players by on-court seconds and the four splits of every pair."""
    teams: dict[str, _Team] = defaultdict(_Team)
    for side in sides:
        team = teams[side.team]
        team.stints.append(side)
        for player in side.lineup:
            team.seconds[player] += side.seconds
    result: dict[str, Any] = {}
    for team_id in sorted(teams):
        team = teams[team_id]
        ranked = sorted(team.seconds, key=lambda p: (-team.seconds[p], p))[:top]
        pairs = {
            pair: {cell: Split() for cell in CELLS} for pair in combinations(sorted(ranked), 2)
        }
        total = Split()
        for side in team.stints:
            total.add(side)
            for (a, b), cells in pairs.items():
                on_a, on_b = a in side.lineup, b in side.lineup
                cell = (
                    "both"
                    if on_a and on_b
                    else "a_only"
                    if on_a
                    else "b_only"
                    if on_b
                    else "neither"
                )
                cells[cell].add(side)
        result[team_id] = {
            "players": [{"player_id": p, "seconds": round(team.seconds[p], 3)} for p in ranked],
            "total": total.as_dict(),
            "pairs": [
                {"a": a, "b": b, "cells": {name: split.as_dict() for name, split in cells.items()}}
                for (a, b), cells in pairs.items()
            ],
        }
    return result


def ratings(cell: dict[str, float | int]) -> dict[str, float | bool | None]:
    """Per-100 ratings for one split; None when that end has no possessions."""
    off = float(cell["possessions_for"])
    deff = float(cell["possessions_against"])
    ortg = 100 * float(cell["points_for"]) / off if off else None
    drtg = 100 * float(cell["points_against"]) / deff if deff else None
    return {
        "minutes": float(cell["seconds"]) / 60,
        "offensive_rating": ortg,
        "defensive_rating": drtg,
        "net_rating": None if ortg is None or drtg is None else ortg - drtg,
        "small_sample": min(off, deff) < MIN_POSSESSIONS,
    }
