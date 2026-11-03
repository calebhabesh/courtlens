"""Team six factors: ratings split into shooting, turnover and rebound points per 100.

Databallr's Teams page splits each side's rating, relative to league, into a shooting (TS),
turnover and rebound term. Its own split reads play-by-play first- and second-chance points,
which CourtLens's admitted team box scores do not carry. This module uses an exact box-score
identity instead. With the conventional possession estimate

    Poss = FGA + 0.44 FTA - OREB + TOV   and   TSA = FGA + 0.44 FTA,

true-shooting attempts are TSA = Poss - TOV + OREB, so

    Rating = 100 * PTS / Poss = 100 * (2 * TS%) * (1 - TOV/Poss + OREB/Poss).

The difference of two products splits exactly at the midpoint, Δ(ab) = Δa·b̄ + ā·Δb, which gives
the shooting term (Δa) and, through Δb = ΔOREB/Poss - ΔTOV/Poss, the rebound and turnover
terms. The three terms add up to the side's rating minus league rating with no residual.

Defense applies the same split to opponents and flips the sign, so every term reads "positive
is better" and Net = OFF + DEF = ORtg - DRtg. NetEff is the two shooting terms; NetPoss is the
four possession terms (turnovers and rebounds on both ends).

3P luck regresses a side's three-point percentage toward league by a chosen share, holding
attempts fixed. Each regressed make is worth 3 * 0.9 points (0.9 discounts misses a team would
partly recover through offensive rebounds, as Databallr does). The adjustment lands on the
shooting term and the rating only. Regression to the pooled league percentage moves the league
total by exactly zero.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any

METHOD_VERSION = "courtlens-team-six-factors-v1"
THREE_LUCK_POINT_VALUE = 3 * 0.9

# Admitted team box scores use snake_case; archive releases carry NBA camelCase.
_STAT_KEYS: dict[str, tuple[str, ...]] = {
    "pts": ("points",),
    "fgm": ("field_goals_made", "fieldGoalsMade"),
    "fga": ("field_goals_attempted", "fieldGoalsAttempted"),
    "fg3m": ("three_pointers_made", "threePointersMade"),
    "fg3a": ("three_pointers_attempted", "threePointersAttempted"),
    "ftm": ("free_throws_made", "freeThrowsMade"),
    "fta": ("free_throws_attempted", "freeThrowsAttempted"),
    "oreb": ("rebounds_offensive", "reboundsOffensive"),
    "dreb": ("rebounds_defensive", "reboundsDefensive"),
    "tov": ("turnovers",),
}


@dataclass(frozen=True)
class BoxTotals:
    """Summed box-score counts for one side over a set of games."""

    pts: float = 0.0
    fgm: float = 0.0
    fga: float = 0.0
    fg3m: float = 0.0
    fg3a: float = 0.0
    ftm: float = 0.0
    fta: float = 0.0
    oreb: float = 0.0
    dreb: float = 0.0
    tov: float = 0.0

    def __add__(self, other: BoxTotals) -> BoxTotals:
        return BoxTotals(*(getattr(self, k) + getattr(other, k) for k in _STAT_KEYS))

    @property
    def tsa(self) -> float:
        return self.fga + 0.44 * self.fta

    @property
    def possessions(self) -> float:
        return self.tsa - self.oreb + self.tov

    @property
    def rating(self) -> float | None:
        poss = self.possessions
        return 100.0 * self.pts / poss if poss > 0 else None

    @property
    def ts_pct(self) -> float | None:
        return self.pts / (2.0 * self.tsa) if self.tsa > 0 else None

    @property
    def fg3_pct(self) -> float | None:
        return self.fg3m / self.fg3a if self.fg3a > 0 else None


def box_totals(stats: Mapping[str, Any], points: float | None = None) -> BoxTotals:
    """Read one game's box score, preferring the row's own points when given.

    A missing field counts as 0 here; callers drop games without a box score first.
    """
    values: dict[str, float] = {}
    for field, keys in _STAT_KEYS.items():
        raw = next((stats[k] for k in keys if stats.get(k) is not None), 0)
        values[field] = float(raw)
    if points is not None:
        values["pts"] = float(points)
    return BoxTotals(**values)


def sum_totals(items: Iterable[BoxTotals]) -> BoxTotals:
    total = BoxTotals()
    for item in items:
        total = total + item
    return total


@dataclass(frozen=True)
class SideSplit:
    """A side's rating relative to league, split into three points-per-100 terms."""

    shooting: float
    turnovers: float
    rebounds: float

    @property
    def total(self) -> float:
        return self.shooting + self.turnovers + self.rebounds


def split_side(side: BoxTotals, league: BoxTotals) -> SideSplit | None:
    """Exact midpoint split of (side rating - league rating), offense orientation."""
    sp, lp = side.possessions, league.possessions
    if sp <= 0 or lp <= 0 or side.tsa <= 0 or league.tsa <= 0:
        return None
    a_side, a_lg = side.pts / side.tsa, league.pts / league.tsa  # 2 * TS%
    t_side, t_lg = side.tov / sp, league.tov / lp
    o_side, o_lg = side.oreb / sp, league.oreb / lp
    b_side, b_lg = 1 - t_side + o_side, 1 - t_lg + o_lg
    a_mid, b_mid = (a_side + a_lg) / 2, (b_side + b_lg) / 2
    return SideSplit(
        shooting=100.0 * (a_side - a_lg) * b_mid,
        turnovers=-100.0 * a_mid * (t_side - t_lg),
        rebounds=100.0 * a_mid * (o_side - o_lg),
    )


def three_point_luck(side: BoxTotals, league_fg3_pct: float | None, share: float) -> float:
    """Points per 100 added by regressing a side's 3P% toward league by `share` (0-1)."""
    poss = side.possessions
    if share <= 0 or league_fg3_pct is None or side.fg3a <= 0 or poss <= 0:
        return 0.0
    expected_makes = league_fg3_pct * side.fg3a
    delta_makes = share * (expected_makes - side.fg3m)
    return 100.0 * THREE_LUCK_POINT_VALUE * delta_makes / poss


def _ratio(num: float, den: float) -> float | None:
    return num / den if den > 0 else None


def team_six_factors(
    team: BoxTotals,
    opponents: BoxTotals,
    league: BoxTotals,
    *,
    offense_luck: float = 0.0,
    defense_luck: float = 0.0,
) -> dict[str, Any]:
    """Ratings, six factors and their underlying rates for one team.

    `league` is the pooled total of every team's own box score in the same games; it is
    both the league offense and the league defense. Luck shares are fractions in [0, 1].
    """
    off = split_side(team, league)
    opp = split_side(opponents, league)
    lg_rating = league.rating
    lg_fg3 = league.fg3_pct
    off_luck = three_point_luck(team, lg_fg3, offense_luck)
    def_luck = three_point_luck(opponents, lg_fg3, defense_luck)

    ortg = team.rating + off_luck if team.rating is not None else None
    drtg = opponents.rating + def_luck if opponents.rating is not None else None
    o_ts = off.shooting + off_luck if off else None
    d_ts = -(opp.shooting + def_luck) if opp else None
    o_tov = off.turnovers if off else None
    o_orb = off.rebounds if off else None
    d_tov = -opp.turnovers if opp else None
    d_drb = -opp.rebounds if opp else None
    off_total = o_ts + off.turnovers + off.rebounds if off and o_ts is not None else None
    def_total = d_ts - opp.turnovers - opp.rebounds if opp and d_ts is not None else None

    def _sum(*values: float | None) -> float | None:
        return None if any(v is None for v in values) else sum(v for v in values if v is not None)

    return {
        "possessions": team.possessions,
        "opp_possessions": opponents.possessions,
        "points": team.pts,
        "opp_points": opponents.pts,
        "ortg": ortg,
        "drtg": drtg,
        "net": ortg - drtg if ortg is not None and drtg is not None else None,
        "off": off_total,
        "o_ts": o_ts,
        "o_tov": o_tov,
        "o_orb": o_orb,
        "def": def_total,
        "d_ts": d_ts,
        "d_tov": d_tov,
        "d_drb": d_drb,
        "net_eff": _sum(o_ts, d_ts),
        "net_poss": _sum(o_tov, o_orb, d_tov, d_drb),
        "off_luck": off_luck,
        "def_luck": def_luck,
        "league_rating": lg_rating,
        "rates": {
            "ts_pct": team.ts_pct,
            "tov_per_100": _ratio(100.0 * team.tov, team.possessions),
            "orb_pct": _ratio(team.oreb, team.oreb + opponents.dreb),
            "ftr": _ratio(team.fta, team.fga),
            "fg3a_per_100": _ratio(100.0 * team.fg3a, team.possessions),
            "fg3_pct": team.fg3_pct,
            "opp_ts_pct": opponents.ts_pct,
            "opp_tov_per_100": _ratio(100.0 * opponents.tov, opponents.possessions),
            "drb_pct": _ratio(team.dreb, team.dreb + opponents.oreb),
            "opp_ftr": _ratio(opponents.fta, opponents.fga),
            "opp_fg3a_per_100": _ratio(100.0 * opponents.fg3a, opponents.possessions),
            "opp_fg3_pct": opponents.fg3_pct,
        },
    }


def league_rates(league: BoxTotals) -> dict[str, float | None]:
    """League reference values for the rate columns (pooled, so offense equals defense)."""
    return {
        "rating": league.rating,
        "ts_pct": league.ts_pct,
        "tov_per_100": _ratio(100.0 * league.tov, league.possessions),
        "orb_pct": _ratio(league.oreb, league.oreb + league.dreb),
        "ftr": _ratio(league.fta, league.fga),
        "fg3a_per_100": _ratio(100.0 * league.fg3a, league.possessions),
        "fg3_pct": league.fg3_pct,
    }
