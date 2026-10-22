"""Player Twins (alignment row 17): nearest player-seasons by a standardized eight-number profile.

Each mode reads four groups of two dimensions from pbpstats season totals. Shot mode is
Databallr's Shot Profile Twin: free throws, rim, mid-range and threes, each as attempts per 100
offensive possessions (volume) and make rate (efficiency). Box mode applies the same method to
scoring, playmaking, rebounding and defense per 100 possessions; combined mode uses all sixteen.

A dimension's value is relative to its league-season average (possession-weighted for rates,
attempt-weighted for percentages, over every player in the season), then standardized among
that season's base pool. Distance is the weighted root mean square of the standardized
differences over the dimensions both player-seasons have (every weight 1 unless the visitor
changes it); a pair needs three quarters of the weighted dimensions, six of eight by default.
Match = 100 - 10 x distance.
"""

from __future__ import annotations

import math
from bisect import bisect_left, bisect_right
from collections.abc import Callable, Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any, Literal

import numpy as np

Mode = Literal["shot", "box", "all"]
Kind = Literal["rate", "pct"]
Row = dict[str, Any]

# Standardization pool: player-seasons with at least this many offensive possessions. Fixed, so a
# visitor's candidate floor never moves another pair's distance.
BASE_POSSESSIONS = 500
# A percentage needs this many attempts; below it the dimension is unknown, not zero.
MIN_ATTEMPTS = 20
MIN_OVERLAP = 6
# The overlap floor as a share of the weighted dimensions: 6 of 8, 12 of 16, 3 of 4.
OVERLAP_SHARE = 0.75
MATCH_SCALE = 10.0
Weights = Mapping[str, float]


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
DIMENSIONS["all"] = DIMENSIONS["shot"] + DIMENSIONS["box"]


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
    # CourtLens' estimated position (PG…C) for the season, else NBA.com's listed one (G, F-C…).
    position: str | None = None
    position_basis: Literal["estimated", "listed"] | None = None
    # Where the value ranks in the season's base pool, 0-100 (ties share the midpoint).
    percentile: dict[str, float | None] = field(default_factory=dict)


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
    ranked: dict[str, list[float]] = {}
    for dim in dims:
        observed = [v for row in base if (v := dim.value(row)) is not None]
        ranked[dim.key] = sorted(observed)
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
            percentile={key: percentile(ranked[key], value) for key, value in values.items()},
        )
    return SeasonTable(season, league, profiles)


def percentile(ranked: list[float], value: float | None) -> float | None:
    """Share of the base pool below the value, ties counted half: 0 lowest, 100 highest."""
    if value is None or not ranked:
        return None
    low, high = bisect_left(ranked, value), bisect_right(ranked, value)
    return (low + (high - low) / 2) / len(ranked) * 100


@dataclass
class Match:
    profile: Profile
    distance: float
    match: float
    overlap: int
    gaps: dict[str, float]


def weight_of(weights: Weights | None, key: str) -> float:
    return 1.0 if weights is None else float(weights.get(key, 1.0))


def min_overlap(keys: Iterable[str], weights: Weights | None = None) -> int:
    """Shared dimensions a pair needs: three quarters of the weighted ones, at least one."""
    active = sum(1 for key in keys if weight_of(weights, key) > 0)
    return max(1, math.ceil(active * OVERLAP_SHARE))


def match_score(distance: float) -> float:
    return max(0.0, 100.0 - MATCH_SCALE * distance)


def compare(a: Profile, b: Profile, weights: Weights | None = None) -> Match | None:
    """Weighted RMS standardized difference over shared dimensions; None below the overlap floor."""
    gaps = {
        key: zb - za
        for key, za in a.z.items()
        if za is not None and (zb := b.z.get(key)) is not None and weight_of(weights, key) > 0
    }
    if not gaps or len(gaps) < min_overlap(a.z, weights):
        return None
    total = sum(weight_of(weights, key) for key in gaps)
    distance = math.sqrt(sum(weight_of(weights, k) * g * g for k, g in gaps.items()) / total)
    return Match(b, distance, match_score(distance), len(gaps), gaps)


POSITION_GROUP = {"PG": "G", "SG": "G", "SF": "F", "PF": "F", "C": "C"}


def position_group(profile: Profile) -> str | None:
    """G, F or C: an estimate's group, or a listing's first part (G-F reads as a guard)."""
    if profile.position is None:
        return None
    if profile.position_basis == "estimated":
        return POSITION_GROUP.get(profile.position)
    return profile.position[:1] or None


def same_position(a: Profile, b: Profile) -> bool:
    """An estimated target needs the identical estimate; a listed one (careers listed before
    2000-01, no estimate) matches any player-season of its G/F/C group."""
    if a.position_basis == "estimated":
        return b.position_basis == "estimated" and a.position == b.position
    group = position_group(a)
    return group is not None and group == position_group(b)


class Index:
    """Many player-seasons' standardized profiles as one matrix, so a ranking is a vector pass.
    Unknown dimensions are NaN and never count as shared."""

    def __init__(self, profiles: Sequence[Profile], keys: Sequence[str]) -> None:
        self.profiles = list(profiles)
        self.keys = list(keys)
        self.z = np.array(
            [
                [np.nan if (v := p.z.get(k)) is None else v for k in self.keys]
                for p in self.profiles
            ],
            dtype=float,
        ).reshape(len(self.profiles), len(self.keys))
        self.off_poss = np.array([p.off_poss for p in self.profiles], dtype=float)
        self.seasons = np.array([p.season for p in self.profiles], dtype=str)
        self.players = np.array([p.player_id for p in self.profiles], dtype=str)

    def weights(self, weights: Weights | None) -> np.ndarray:
        return np.array([weight_of(weights, key) for key in self.keys], dtype=float)

    def rank(
        self,
        target: Profile,
        *,
        min_possessions: float,
        exclude_own: bool,
        by_position: bool = False,
        weights: Weights | None = None,
        seasons: Iterable[str] | None = None,
    ) -> Ranking:
        w = self.weights(weights)
        t = np.array([np.nan if (v := target.z.get(k)) is None else v for k in self.keys])
        shared = ~np.isnan(self.z) & ~np.isnan(t) & (w > 0)
        overlap = shared.sum(axis=1)
        diff = np.where(shared, self.z - t, 0.0)
        total = (shared * w).sum(axis=1)
        with np.errstate(invalid="ignore", divide="ignore"):
            distance = np.sqrt((w * diff * diff).sum(axis=1) / total)
        own = self.players == target.player_id
        keep = (
            (overlap >= min_overlap(self.keys, weights))
            & (total > 0)
            & (self.off_poss >= min_possessions)
            & ~(own & (exclude_own or (self.seasons == target.season)))
        )
        if seasons is not None:
            keep &= np.isin(self.seasons, list(seasons))
        if by_position:
            keep &= np.array([same_position(target, p) for p in self.profiles], dtype=bool)
        rows = np.nonzero(keep)[0]
        order = rows[np.lexsort((self.players[rows], self.seasons[rows], distance[rows]))]
        return Ranking(self, target, w, order, distance, overlap)


@dataclass
class Ranking:
    index: Index
    target: Profile
    weights: np.ndarray
    order: np.ndarray
    distance: np.ndarray
    overlap: np.ndarray

    def __len__(self) -> int:
        return len(self.order)

    def match(self, position: int) -> Match:
        """The match at this 0-based position, nearest first."""
        row = int(self.order[position])
        profile = self.index.profiles[row]
        gaps = {
            key: zb - za
            for key, w in zip(self.index.keys, self.weights, strict=True)
            if w > 0
            and (za := self.target.z.get(key)) is not None
            and (zb := profile.z.get(key)) is not None
        }
        distance = float(self.distance[row])
        return Match(profile, distance, match_score(distance), int(self.overlap[row]), gaps)

    def top(self, count: int) -> list[Match]:
        return [self.match(i) for i in range(min(count, len(self)))]

    def rank_of(self, player_id: str, season: str) -> int | None:
        """1-based rank of a player-season in this ranking, None when it doesn't qualify."""
        hits = np.nonzero(
            (self.index.players[self.order] == player_id)
            & (self.index.seasons[self.order] == season)
        )[0]
        return int(hits[0]) + 1 if len(hits) else None


def nearest(
    target: Profile,
    candidates: Iterable[Profile],
    *,
    min_possessions: float,
    exclude_own: bool,
    by_position: bool = False,
    weights: Weights | None = None,
) -> list[Match]:
    ranking = Index(list(candidates), list(target.z)).rank(
        target,
        min_possessions=min_possessions,
        exclude_own=exclude_own,
        by_position=by_position,
        weights=weights,
    )
    return ranking.top(len(ranking))


def next_season(season: str) -> str:
    """'2012-13' -> '2013-14'."""
    year = int(season[:4]) + 1
    return f"{year}-{(year + 1) % 100:02d}"


@dataclass
class Projection:
    """A season's profiles flattened to two axes (principal components of the weighted z-scores).
    Unknown dimensions sit at the season mean, so a 2-D distance is a summary, not the match."""

    keys: list[str]
    scale: np.ndarray
    centre: np.ndarray
    axes: np.ndarray
    explained: list[float]

    def at(self, profile: Profile) -> tuple[float, float]:
        row = np.array([0.0 if (v := profile.z.get(k)) is None else v for k in self.keys])
        x, y = (row * self.scale - self.centre) @ self.axes.T
        return float(x), float(y)


def projection(
    base: Sequence[Profile], keys: Sequence[str], weights: Weights | None = None
) -> Projection | None:
    w = np.array([weight_of(weights, key) for key in keys], dtype=float)
    if len(base) < 3 or (w > 0).sum() < 2:
        return None
    scale = np.sqrt(w)
    matrix = (
        np.array(
            [[0.0 if (v := p.z.get(k)) is None else v for k in keys] for p in base], dtype=float
        )
        * scale
    )
    centre = matrix.mean(axis=0)
    _, singular, vt = np.linalg.svd(matrix - centre, full_matrices=False)
    axes = vt[:2].copy()
    for axis in axes:
        # A stable sign: the axis's largest loading reads positive.
        if axis[np.argmax(np.abs(axis))] < 0:
            axis *= -1
    variance = singular**2
    explained = [float(v / variance.sum()) for v in variance[:2]] if variance.sum() else [0.0, 0.0]
    return Projection(list(keys), scale, centre, axes, explained)
