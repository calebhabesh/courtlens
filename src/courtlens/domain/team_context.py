"""Team context beyond the six factors: schedule strength, expected wins, standings and trend.

Alignment row 4 adds what Databallr's Teams page does not show, from the same admitted team box
scores (`courtlens-team-context-v1`):

* Schedule-adjusted net rating. Every team's strength is solved jointly as its own net rating
  plus the average strength of the opponents it faced (Basketball-Reference's SRS, on net rating
  per 100 possessions instead of point margin), pinned so the game-weighted league average is
  zero. SOS is the average solved strength of the opponents a team faced in the games shown, and
  Adj Net = Net + SOS exactly.
* Expected wins: the Pythagorean share PF^14 / (PF^14 + PA^14) times games (exponent 14, close
  to Morey's 13.91 for the NBA). Luck is actual minus expected wins. Close games are those whose
  final margin is five points or fewer.
* Standings: wins, losses, last ten and streak over every game in scope, in date order.
* Trend: net rating per 100 pooled over each team's latest ten games, after each game.

All of it is descriptive. Home court is not modelled, and no outcome is forecast.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from datetime import date

import numpy as np

from courtlens.domain.team_six_factors import BoxTotals, sum_totals

METHOD_VERSION = "courtlens-team-context-v1"
PYTHAGOREAN_EXPONENT = 14.0
CLOSE_GAME_MARGIN = 5
TREND_GAMES = 10


@dataclass(frozen=True)
class TeamGame:
    """One team's side of a game with both box scores."""

    game_id: str
    game_date: date
    venue: str
    opponent: str
    own: BoxTotals
    opp: BoxTotals

    @property
    def won(self) -> bool:
        return self.own.pts > self.opp.pts


def net_rating(own: BoxTotals, opp: BoxTotals) -> float | None:
    if own.rating is None or opp.rating is None:
        return None
    return own.rating - opp.rating


def schedule_adjusted(
    nets: Mapping[str, float], opponents: Mapping[str, Sequence[str]]
) -> dict[str, float]:
    """Adjusted net per team: adj_i = net_i + mean(adj of i's opponents), league mean zero.

    `opponents` lists each team's opponent per game (repeats count). Solved by least squares with
    the game-weighted sum of adjusted nets pinned at zero; teams without games are left out.
    """
    teams = [t for t in nets if opponents.get(t)]
    if not teams:
        return {}
    index = {t: i for i, t in enumerate(teams)}
    n = len(teams)
    a = np.zeros((n + 1, n))
    b = np.zeros(n + 1)
    for t in teams:
        i = index[t]
        faced = [index[o] for o in opponents[t] if o in index]
        a[i, i] += 1.0
        for j in faced:
            a[i, j] -= 1.0 / len(faced)
        b[i] = nets[t]
        a[n, i] = len(opponents[t])
    solution, *_ = np.linalg.lstsq(a, b, rcond=None)
    return {t: float(solution[index[t]]) for t in teams}


def expected_wins(points: float, opp_points: float, games: int) -> float | None:
    if games <= 0 or points <= 0 or opp_points <= 0:
        return None
    pf, pa = points**PYTHAGOREAN_EXPONENT, opp_points**PYTHAGOREAN_EXPONENT
    return float(games * pf / (pf + pa))


def close_record(games: Sequence[TeamGame]) -> tuple[int, int]:
    close = [g for g in games if abs(g.own.pts - g.opp.pts) <= CLOSE_GAME_MARGIN]
    wins = sum(1 for g in close if g.won)
    return wins, len(close) - wins


def standings(games: Sequence[TeamGame]) -> dict[str, object]:
    """Record, last ten and current streak (+n wins / -n losses), games in date order."""
    ordered = sorted(games, key=lambda g: (g.game_date, g.game_id))
    wins = sum(1 for g in ordered if g.won)
    last = ordered[-TREND_GAMES:]
    last_wins = sum(1 for g in last if g.won)
    streak = 0
    for g in reversed(ordered):
        if streak == 0:
            streak = 1 if g.won else -1
        elif (streak > 0) == g.won:
            streak += 1 if g.won else -1
        else:
            break
    return {
        "wins": wins,
        "losses": len(ordered) - wins,
        "last10_wins": last_wins,
        "last10_losses": len(last) - last_wins,
        "streak": streak,
    }


def rolling_net(games: Sequence[TeamGame], size: int = TREND_GAMES) -> list[dict[str, object]]:
    """Net rating pooled over the latest `size` games after each game, from the `size`-th on."""
    ordered = sorted(games, key=lambda g: (g.game_date, g.game_id))
    points: list[dict[str, object]] = []
    for end in range(size, len(ordered) + 1):
        window = ordered[end - size : end]
        value = net_rating(sum_totals(g.own for g in window), sum_totals(g.opp for g in window))
        if value is not None:
            points.append({"date": ordered[end - 1].game_date.isoformat(), "net": round(value, 2)})
    return points
