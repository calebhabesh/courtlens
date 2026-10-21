"""Player Twins (alignment row 17): nearest player-seasons by a standardized eight-number profile.

Each mode reads four groups of two dimensions from pbpstats season totals. Shot mode is
Databallr's Shot Profile Twin: free throws, rim, mid-range and threes, each as attempts per 100
offensive possessions (volume) and make rate (efficiency). Box mode applies the same method to
scoring, playmaking, rebounding and defense per 100 possessions.

A dimension's value is relative to its league-season average (possession-weighted for rates,
attempt-weighted for percentages, over every player in the season), then standardized among
that season's base pool. Distance is the root mean square of the standardized differences over
the dimensions both player-seasons have; a pair needs six of the eight. Match = 100 - 10 x distance.
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any, Literal

Mode = Literal["shot", "box"]
Kind = Literal["rate", "pct"]
Row = dict[str, Any]

# Standardization pool: player-seasons with at least this many offensive possessions. Fixed, so a
# visitor's candidate floor never moves another pair's distance.
BASE_POSSESSIONS = 500
# A percentage needs this many attempts; below it the dimension is unknown, not zero.
MIN_ATTEMPTS = 20
MIN_OVERLAP = 6
MATCH_SCALE = 10.0


@dataclass(frozen=True)
class Dimension:
    key: str
    group: str
    label: str
    kind: Kind
    numerator: Callable[[Row], float]
    denominator: Callable[[Row], float]
    description: str

    def value(self, row: Row) -> float | None:
        den = self.denominator(row)
        floor = MIN_ATTEMPTS if self.kind == "pct" else 1.0
        if den < floor:
            return None
        return self.numerator(row) / den * (100.0 if self.kind == "rate" else 1.0)


def _f(key: str) -> Callable[[Row], float]:
    return lambda row: float(row.get(key) or 0.0)


def _sum(*keys: str) -> Callable[[Row], float]:
    return lambda row: sum(float(row.get(key) or 0.0) for key in keys)


def fga(row: Row) -> float:
    return _sum("rim_fga", "short_mid_fga", "long_mid_fga", "fg3a")(row)


def ts_attempts(row: Row) -> float:
    return 2 * (fga(row) + 0.44 * float(row.get("fta") or 0.0))


OFF, DEF = _f("off_poss"), _f("def_poss")
DIMENSIONS: dict[Mode, tuple[Dimension, ...]] = {
    "shot": (
        Dimension(
            "ft_vol",
            "FT",
            "VOL",
            "rate",
            _f("fta"),
            OFF,
            "Free-throw attempts per 100 offensive possessions",
        ),
        Dimension("ft_eff", "FT", "EFF", "pct", _f("ftm"), _f("fta"), "Free-throw percentage"),
        Dimension(
            "rim_vol",
            "RIM",
            "VOL",
            "rate",
            _f("rim_fga"),
            OFF,
            "Shots at the rim per 100 offensive possessions",
        ),
        Dimension(
            "rim_eff",
            "RIM",
            "EFF",
            "pct",
            _f("rim_fgm"),
            _f("rim_fga"),
            "Field-goal percentage at the rim",
        ),
        Dimension(
            "mid_vol",
            "MID",
            "VOL",
            "rate",
            _sum("short_mid_fga", "long_mid_fga"),
            OFF,
            "Mid-range shots (short and long) per 100 offensive possessions",
        ),
        Dimension(
            "mid_eff",
            "MID",
            "EFF",
            "pct",
            _sum("short_mid_fgm", "long_mid_fgm"),
            _sum("short_mid_fga", "long_mid_fga"),
            "Mid-range field-goal percentage",
        ),
        Dimension(
            "three_vol",
            "3P",
            "VOL",
            "rate",
            _f("fg3a"),
            OFF,
            "Three-point attempts per 100 offensive possessions",
        ),
        Dimension(
            "three_eff", "3P", "EFF", "pct", _f("fg3m"), _f("fg3a"), "Three-point percentage"
        ),
    ),
    "box": (
        Dimension(
            "pts",
            "SCORING",
            "PTS",
            "rate",
            _f("points"),
            OFF,
            "Points per 100 offensive possessions",
        ),
        Dimension(
            "ts", "SCORING", "TS%", "pct", _f("points"), ts_attempts, "True shooting percentage"
        ),
        Dimension(
            "ast",
            "PLAYMAKING",
            "AST",
            "rate",
            _f("assists"),
            OFF,
            "Assists per 100 offensive possessions",
        ),
        Dimension(
            "tov",
            "PLAYMAKING",
            "TOV",
            "rate",
            _f("turnovers"),
            OFF,
            "Turnovers per 100 offensive possessions",
        ),
        Dimension(
            "oreb",
            "REBOUNDING",
            "OREB",
            "rate",
            _f("oreb"),
            OFF,
            "Offensive rebounds per 100 offensive possessions",
        ),
        Dimension(
            "dreb",
            "REBOUNDING",
            "DREB",
            "rate",
            _f("dreb"),
            DEF,
            "Defensive rebounds per 100 defensive possessions",
        ),
        Dimension(
            "stl",
            "DEFENSE",
            "STL",
            "rate",
            _f("steals"),
            DEF,
            "Steals per 100 defensive possessions",
        ),
        Dimension(
            "blk",
            "DEFENSE",
            "BLK",
            "rate",
            _f("blocks"),
            DEF,
            "Blocks per 100 defensive possessions",
        ),
    ),
}


@dataclass
class Profile:
    player_id: str
    name: str
    season: str
    team: str | None
    teams: list[str]
    games: int
    off_poss: float
    pts_per_game: float | None
    ts_pct: float | None
    values: dict[str, float | None]
    relative: dict[str, float | None]
    z: dict[str, float | None]


@dataclass
class SeasonTable:
    season: str
    league: dict[str, float | None]
    profiles: dict[str, Profile]


def league_average(dim: Dimension, rows: Iterable[Row]) -> float | None:
    """Pooled over every player in the season: possession-weighted rates, attempt-weighted pcts."""
    rows = list(rows)
    den = sum(dim.denominator(row) for row in rows)
    if den <= 0:
        return None
    return sum(dim.numerator(row) for row in rows) / den * (100.0 if dim.kind == "rate" else 1.0)


def season_table(mode: Mode, season: str, rows: list[Row]) -> SeasonTable:
    dims = DIMENSIONS[mode]
    league = {dim.key: league_average(dim, rows) for dim in dims}
    base = [row for row in rows if float(row.get("off_poss") or 0) >= BASE_POSSESSIONS]
    moments: dict[str, tuple[float, float] | None] = {}
    for dim in dims:
        observed = [v for row in base if (v := dim.value(row)) is not None]
        if len(observed) < 2:
            moments[dim.key] = None
            continue
        mean = sum(observed) / len(observed)
        sd = math.sqrt(sum((v - mean) ** 2 for v in observed) / len(observed))
        moments[dim.key] = (mean, sd) if sd > 1e-9 else None
    profiles = {}
    for row in rows:
        values = {dim.key: dim.value(row) for dim in dims}
        relative: dict[str, float | None] = {}
        z: dict[str, float | None] = {}
        for dim in dims:
            value, avg, moment = values[dim.key], league[dim.key], moments[dim.key]
            relative[dim.key] = None if value is None or avg is None else value - avg
            z[dim.key] = (
                None if value is None or moment is None else (value - moment[0]) / moment[1]
            )
        games = int(row.get("games") or 0)
        tsa = ts_attempts(row)
        teams = [str(team["tricode"]) for team in row.get("teams", []) if team.get("tricode")]
        profiles[str(row["player_id"])] = Profile(
            player_id=str(row["player_id"]),
            name=str(row.get("name") or row["player_id"]),
            season=season,
            team=teams[0] if teams else None,
            teams=teams,
            games=games,
            off_poss=float(row.get("off_poss") or 0),
            pts_per_game=float(row.get("points") or 0) / games if games else None,
            ts_pct=float(row.get("points") or 0) / tsa if tsa > 0 else None,
            values=values,
            relative=relative,
            z=z,
        )
    return SeasonTable(season, league, profiles)


@dataclass
class Match:
    profile: Profile
    distance: float
    match: float
    overlap: int
    gaps: dict[str, float]


def compare(a: Profile, b: Profile) -> Match | None:
    """RMS standardized difference over shared dimensions; None below the overlap floor."""
    gaps = {
        key: zb - za
        for key, za in a.z.items()
        if za is not None and (zb := b.z.get(key)) is not None
    }
    if len(gaps) < MIN_OVERLAP:
        return None
    distance = math.sqrt(sum(gap * gap for gap in gaps.values()) / len(gaps))
    return Match(b, distance, max(0.0, 100.0 - MATCH_SCALE * distance), len(gaps), gaps)


def nearest(
    target: Profile,
    candidates: Iterable[Profile],
    *,
    min_possessions: float,
    exclude_own: bool,
) -> list[Match]:
    matches = []
    for candidate in candidates:
        if candidate.player_id == target.player_id and (
            exclude_own or candidate.season == target.season
        ):
            continue
        if candidate.off_poss < min_possessions:
            continue
        found = compare(target, candidate)
        if found is not None:
            matches.append(found)
    matches.sort(key=lambda m: (m.distance, m.profile.season, m.profile.player_id))
    return matches
