"""WOWY combos: a team's stints split into every on/off mix of up to five combo players.

Pure arithmetic over accepted team-side stints (alignment row 5). On and Off players hold for
every row; filters keep whole stints. Contract: docs/design/wowy-combos-v1.md.
"""

from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import date
from itertools import product
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from courtlens.domain.on_off import UncertaintyInterval, linear_ratio_interval, ratio_interval

VERSION = "courtlens-wowy-combos-v1"
MAX_COMBO = 5
MAX_HELD = 10

Clock = Literal["full", "h1", "h2", "q1", "q2", "q3", "q4", "ot", "clutch", "custom"]
Phase = Literal["preseason", "regular_season", "play_in", "playoffs", "cup_final", "summer_league"]
TierMetric = Literal["offense", "defense", "net"]
Tier = Literal["top", "mid", "bottom"]
VsState = Literal["on", "off", "split"]

# Fields summed across the five players on each side; a field is unknown for a stint unless every
# player on that side has it recorded.
TEAM_FIELDS = ("fgm", "fga", "fg3m", "fg3a", "ftm", "fta", "oreb", "dreb", "tov")
PERIOD_SECONDS = 720.0


class WowyCombosRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    team_id: str | None = Field(default=None, min_length=1, max_length=100)
    release_id: str | None = None
    season: str | None = None
    phase: Phase | None = None
    combo: list[str] = Field(default_factory=list, max_length=MAX_COMBO)
    on: list[str] = Field(default_factory=list, max_length=MAX_HELD)
    off: list[str] = Field(default_factory=list, max_length=MAX_HELD)
    # Inclusive calendar dates inside the season.
    start_date: date | None = None
    end_date: date | None = None
    clock: Clock = "full"
    periods: list[int] = Field(default_factory=list, max_length=10)
    # Custom window in minutes remaining in the period: from (larger) down to (smaller).
    clock_from: float = Field(default=12.0, ge=0, le=12)
    clock_to: float = Field(default=0.0, ge=0, le=12)
    exclude_garbage: bool = False
    common_games: bool = False
    opponents: list[str] = Field(default_factory=list, max_length=30)
    tier_metric: TierMetric | None = None
    tier: Tier | None = None
    vs_team: str | None = Field(default=None, min_length=1, max_length=100)
    vs_player: str | None = Field(default=None, min_length=1, max_length=100)
    vs_state: VsState = "on"
    min_possessions: float = Field(default=100.0, ge=1, le=10000, allow_inf_nan=False)
    min_games: int = Field(default=5, ge=1, le=82)

    @model_validator(mode="after")
    def validate_players(self) -> WowyCombosRequest:
        chosen = self.combo + self.on + self.off
        if len(set(chosen)) != len(chosen):
            raise ValueError("A player can hold one role: combo, on or off")
        if any(not p.strip() or len(p) > 100 for p in chosen):
            raise ValueError("Invalid player identity")
        if self.start_date and self.end_date and self.start_date > self.end_date:
            raise ValueError("start_date must not follow end_date")
        if self.clock == "custom" and self.clock_from <= self.clock_to:
            raise ValueError("A custom clock window runs from more to fewer minutes remaining")
        if (self.tier is None) != (self.tier_metric is None):
            raise ValueError("Opponent tiers need both a metric and a tier")
        if self.vs_player and not self.vs_team:
            raise ValueError("Player vs player needs the opponent team")
        if self.vs_player and self.vs_state == "split" and len(self.combo) >= MAX_COMBO:
            raise ValueError("A player vs player split counts toward the five combo slots")
        return self


def clock_window(request: WowyCombosRequest) -> tuple[set[int] | None, float, float]:
    """Periods kept (None = any) and the window in seconds remaining, high to low."""
    full = (None, PERIOD_SECONDS, 0.0)
    if request.clock == "h1":
        return {1, 2}, PERIOD_SECONDS, 0.0
    if request.clock in ("q1", "q2", "q3", "q4"):
        return {int(request.clock[1])}, PERIOD_SECONDS, 0.0
    if request.clock == "custom":
        periods = set(request.periods) or None
        return periods, request.clock_from * 60.0, request.clock_to * 60.0
    return full


def in_clock(row: dict[str, Any], request: WowyCombosRequest) -> bool:
    """A stint counts when its midpoint lies in the window; stints never cross periods."""
    period = int(row["period"])
    if request.clock == "full":
        return True
    if request.clock == "h2":
        return period >= 3
    if request.clock == "ot":
        return period >= 5
    midpoint = (float(row["start_remaining"]) + float(row["end_remaining"])) / 2
    if request.clock == "clutch":
        # Last five minutes of the fourth quarter, and every overtime (five minutes long).
        return period >= 5 or (period == 4 and midpoint <= 300.0)
    periods, high, low = clock_window(request)
    if request.clock == "custom" and periods and 5 in periods:
        periods = periods | set(range(6, 15))  # "OT" covers every overtime period
    if periods is not None and period not in periods:
        return False
    return low <= midpoint <= high


def garbage_time(row: dict[str, Any]) -> bool:
    """Fourth-quarter blowouts by the score margin when the stint starts.

    25+ points with 12:00 to 9:00 left, 20+ with 9:00 to 6:00, 10+ with under 6:00. Overtime is
    never garbage time.
    """
    if int(row["period"]) != 4:
        return False
    remaining = float(row["start_remaining"])
    margin = abs(int(row["start_margin"]))
    if remaining > 540:
        return margin >= 25
    if remaining > 360:
        return margin >= 20
    return margin >= 10


def side_totals(stats: dict[str, dict[str, Any]], lineup: Iterable[str]) -> dict[str, float]:
    """Summed known fields for one side; a field missing for any player is left out (unknown)."""
    players = [stats.get(p, {}) for p in lineup]
    return {
        f: float(sum(p[f] for p in players))
        for f in TEAM_FIELDS
        if players and all(p.get(f) is not None for p in players)
    }


@dataclass
class Rates:
    """Per-game numerator and denominator sums for one ratio, kept as game clusters."""

    clusters: dict[str, tuple[float, float]] = field(default_factory=dict)

    def add(self, game: str, numerator: float, denominator: float) -> None:
        y, d = self.clusters.get(game, (0.0, 0.0))
        self.clusters[game] = (y + numerator, d + denominator)

    def value(self, scale: float = 100.0) -> float | None:
        d = sum(x for _, x in self.clusters.values())
        return scale * sum(y for y, _ in self.clusters.values()) / d if d > 0 else None


# (name, numerator, denominator) over a stint's own totals `t`, opponent totals `o`.
Ratio = tuple[str, Any, Any]
FACTORS: tuple[Ratio, ...] = (
    ("efg_pct", lambda t, o: t["fgm"] + 0.5 * t["fg3m"], lambda t, o: t["fga"]),
    ("tov_pct", lambda t, o: t["tov"], lambda t, o: t["fga"] + 0.44 * t["fta"] + t["tov"]),
    ("oreb_pct", lambda t, o: t["oreb"], lambda t, o: t["oreb"] + o["dreb"]),
    ("ft_rate", lambda t, o: t["fta"], lambda t, o: t["fga"]),
    ("fg3_pct", lambda t, o: t["fg3m"], lambda t, o: t["fg3a"]),
    ("fg3a_rate", lambda t, o: t["fg3a"], lambda t, o: t["fga"]),
    ("opp_efg_pct", lambda t, o: o["fgm"] + 0.5 * o["fg3m"], lambda t, o: o["fga"]),
    ("opp_tov_pct", lambda t, o: o["tov"], lambda t, o: o["fga"] + 0.44 * o["fta"] + o["tov"]),
    ("dreb_pct", lambda t, o: t["dreb"], lambda t, o: t["dreb"] + o["oreb"]),
    ("opp_ft_rate", lambda t, o: o["fta"], lambda t, o: o["fga"]),
    ("opp_fg3_pct", lambda t, o: o["fg3m"], lambda t, o: o["fg3a"]),
    ("opp_fg3a_rate", lambda t, o: o["fg3a"], lambda t, o: o["fga"]),
    # The composition dialog's TS% and turnovers per 100 possessions, as the league baselines.
    ("ts_pct", lambda t, o: t["pts"], lambda t, o: 2.0 * (t["fga"] + 0.44 * t["fta"])),
    ("opp_ts_pct", lambda t, o: o["pts"], lambda t, o: 2.0 * (o["fga"] + 0.44 * o["fta"])),
    ("tov_100", lambda t, o: t["tov"], lambda t, o: t["poss"]),
    ("opp_tov_100", lambda t, o: o["tov"], lambda t, o: o["poss"]),
)


class Teammate(BaseModel):
    """A non-combo teammate's share of a cell's minutes, with their DARKO rating when known."""

    player_id: str
    minutes: float
    share: float
    dpm: float | None = None
    o_dpm: float | None = None
    d_dpm: float | None = None


class TeammateHelp(BaseModel):
    """Minutes-weighted average DARKO of the other teammates on the floor (Databallr's help)."""

    players: int
    net: float | None
    offense: float | None
    defense: float | None
    # Share of teammate minutes that carry a DARKO rating.
    coverage: float


class ComboCell(BaseModel):
    key: str
    present: list[str]
    absent: list[str]
    games: int
    stints: int
    minutes: float
    offensive_possessions: float
    defensive_possessions: float
    points: float
    points_allowed: float
    sample_status: Literal["available", "insufficient_sample", "empty"]
    offensive_rating: float | None
    defensive_rating: float | None
    net_rating: float | None
    net_interval: UncertaintyInterval
    # Four factors and shooting; None where a field was unrecorded for every stint in the cell.
    factors: dict[str, float | None]
    factor_stints: dict[str, int]
    teammates: list[Teammate] = Field(default_factory=list)
    teammate_help: TeammateHelp | None = None


def _try(fn: Any, t: dict[str, float], o: dict[str, float]) -> float | None:
    try:
        return float(fn(t, o))
    except KeyError:
        return None


def summarize(
    key: str,
    rows: list[dict[str, Any]],
    request: WowyCombosRequest,
    present: list[str],
    absent: list[str],
) -> tuple[ComboCell, Rates, Rates]:
    off, defense = Rates(), Rates()
    factor_rates = {name: Rates() for name, _, _ in FACTORS}
    factor_stints = dict.fromkeys(factor_rates, 0)
    for r in rows:
        if r["off"] > 0:
            off.add(r["game_id"], float(r["points"]), float(r["off"]))
        if r["def"] > 0:
            defense.add(r["game_id"], float(r["allowed"]), float(r["def"]))
        t = {**r["totals"], "pts": float(r["points"]), "poss": float(r["off"])}
        o = {**r["opp_totals"], "pts": float(r["allowed"]), "poss": float(r["def"])}
        for name, numerator, denominator in FACTORS:
            y = _try(numerator, t, o)
            d = _try(denominator, t, o)
            if y is None or d is None or d <= 0:
                continue
            factor_rates[name].add(r["game_id"], y, d)
            factor_stints[name] += 1
    games = len({r["game_id"] for r in rows})
    off_poss = sum(float(r["off"]) for r in rows)
    def_poss = sum(float(r["def"]) for r in rows)
    status: Literal["available", "insufficient_sample", "empty"] = (
        "empty"
        if not rows
        else "available"
        if games >= request.min_games and min(off_poss, def_poss) >= request.min_possessions
        else "insufficient_sample"
    )
    ortg, drtg = off.value(), defense.value()
    return (
        ComboCell(
            key=key,
            present=present,
            absent=absent,
            games=games,
            stints=len(rows),
            minutes=sum(float(r["seconds"]) for r in rows) / 60.0,
            offensive_possessions=off_poss,
            defensive_possessions=def_poss,
            points=sum(float(r["points"]) for r in rows),
            points_allowed=sum(float(r["allowed"]) for r in rows),
            sample_status=status,
            offensive_rating=ortg,
            defensive_rating=drtg,
            net_rating=ortg - drtg if ortg is not None and drtg is not None else None,
            net_interval=linear_ratio_interval([(off.clusters, 1.0), (defense.clusters, -1.0)])
            if off.clusters and defense.clusters
            else ratio_interval({}),
            factors={name: rates.value() for name, rates in factor_rates.items()},
            factor_stints=factor_stints,
        ),
        off,
        defense,
    )


class OnOffShift(BaseModel):
    player_id: str
    on_minutes: float
    off_minutes: float
    on_net: float | None
    off_net: float | None
    # On minus off; None unless both sides pass the sample gates.
    net_difference: float | None
    offense_difference: float | None
    defense_difference: float | None
    interval: UncertaintyInterval


def holds(row: dict[str, Any], request: WowyCombosRequest) -> bool:
    lineup = set(row["lineup"])
    return set(request.on) <= lineup and not set(request.off) & lineup


def filter_rows(
    rows: list[dict[str, Any]], request: WowyCombosRequest, opponents: set[str] | None
) -> list[dict[str, Any]]:
    """Every filter except the combo split, applied to whole stints."""
    kept = [
        r
        for r in rows
        if (request.start_date is None or r["game_date"] >= request.start_date.isoformat())
        and (request.end_date is None or r["game_date"] <= request.end_date.isoformat())
        and in_clock(r, request)
        and not (request.exclude_garbage and garbage_time(r))
        and (opponents is None or r["opponent_team_id"] in opponents)
        and holds(r, request)
    ]
    if request.vs_player and request.vs_state != "split":
        want = request.vs_state == "on"
        kept = [r for r in kept if (request.vs_player in r["opponent_lineup"]) == want]
    if request.common_games:
        everyone = set(request.combo + request.on + request.off)
        appeared: dict[str, set[str]] = {}
        for r in rows:
            for p in r["lineup"]:
                appeared.setdefault(r["game_id"], set()).add(p)
        kept = [r for r in kept if everyone <= appeared.get(r["game_id"], set())]
    return kept


def teammates(
    rows: list[dict[str, Any]], skip: set[str], ratings: dict[str, dict[str, Any]]
) -> tuple[list[Teammate], TeammateHelp | None]:
    """Teammates other than `skip` by minutes in these stints, and their weighted DARKO."""
    total = sum(float(r["seconds"]) for r in rows)
    seconds: dict[str, float] = {}
    for r in rows:
        for p in r["lineup"]:
            if p not in skip:
                seconds[p] = seconds.get(p, 0.0) + float(r["seconds"])
    if not total or not seconds:
        return [], None

    def rating(p: str, key: str) -> float | None:
        value = ratings.get(p, {}).get(key)
        return float(value) if value is not None else None

    mates = sorted(
        (
            Teammate(
                player_id=p,
                minutes=s / 60.0,
                share=100.0 * s / total,
                dpm=rating(p, "dpm"),
                o_dpm=rating(p, "o_dpm"),
                d_dpm=rating(p, "d_dpm"),
            )
            for p, s in seconds.items()
        ),
        key=lambda m: (-m.minutes, m.player_id),
    )

    def weighted(key: str) -> float | None:
        pairs = [(m.minutes, getattr(m, key)) for m in mates if getattr(m, key) is not None]
        weight = sum(w for w, _ in pairs)
        return sum(w * v for w, v in pairs) / weight if weight else None

    rated = sum(m.minutes for m in mates if m.dpm is not None)
    help_ = TeammateHelp(
        players=len(mates),
        net=weighted("dpm"),
        offense=weighted("o_dpm"),
        defense=weighted("d_dpm"),
        coverage=100.0 * rated / sum(m.minutes for m in mates),
    )
    return mates, help_


def combo_cells(
    rows: list[dict[str, Any]],
    request: WowyCombosRequest,
    ratings: dict[str, dict[str, Any]] | None = None,
) -> tuple[list[ComboCell], list[OnOffShift], ComboCell]:
    """Every on/off mix of the combo players (and a split opponent), the on - off shifts, total."""
    dims = list(request.combo)
    split = bool(request.vs_player and request.vs_state == "split")

    def present(r: dict[str, Any], p: str) -> bool:
        return p in (r["opponent_lineup"] if split and p == request.vs_player else r["lineup"])

    if split and request.vs_player:
        dims.append(request.vs_player)
    groups: dict[tuple[bool, ...], list[dict[str, Any]]] = {
        mask: [] for mask in product((True, False), repeat=len(dims))
    }
    for r in rows:
        groups[tuple(present(r, p) for p in dims)].append(r)
    cells: list[ComboCell] = []
    for mask, group in groups.items() if dims else ():
        cell = summarize(
            "".join("1" if v else "0" for v in mask),
            group,
            request,
            [p for p, v in zip(dims, mask, strict=True) if v],
            [p for p, v in zip(dims, mask, strict=True) if not v],
        )[0]
        cell.teammates, cell.teammate_help = teammates(group, set(dims), ratings or {})
        cells.append(cell)
    # Truth-table order (follow-up 10): all on first, the last combo player toggling fastest,
    # so the same players always give the same row order.
    shifts: list[OnOffShift] = []
    for p in request.combo:
        on_cell, on_o, on_d = summarize(
            "on", [r for r in rows if p in r["lineup"]], request, [p], []
        )
        off_cell, off_o, off_d = summarize(
            "off", [r for r in rows if p not in r["lineup"]], request, [], [p]
        )
        gated = on_cell.sample_status == off_cell.sample_status == "available"

        def diff(a: float | None, b: float | None, ok: bool = gated) -> float | None:
            return a - b if ok and a is not None and b is not None else None

        shifts.append(
            OnOffShift(
                player_id=p,
                on_minutes=on_cell.minutes,
                off_minutes=off_cell.minutes,
                on_net=on_cell.net_rating,
                off_net=off_cell.net_rating,
                net_difference=diff(on_cell.net_rating, off_cell.net_rating),
                offense_difference=diff(on_cell.offensive_rating, off_cell.offensive_rating),
                defense_difference=diff(on_cell.defensive_rating, off_cell.defensive_rating),
                interval=linear_ratio_interval(
                    [
                        (on_o.clusters, 1.0),
                        (on_d.clusters, -1.0),
                        (off_o.clusters, -1.0),
                        (off_d.clusters, 1.0),
                    ]
                )
                if gated
                else UncertaintyInterval(
                    games=len({r["game_id"] for r in rows}),
                    reason="One side is under the sample gates",
                ),
            )
        )
    total = summarize("all", rows, request, [], [])[0]
    return cells, shifts, total


def tier_teams(teams: list[dict[str, Any]], metric: TierMetric, tier: Tier) -> list[dict[str, Any]]:
    """Teams ranked 1-10, 11-20 or 21+ on offense (ORtg), defense (DRtg, low best) or net."""
    key = {"offense": "ortg", "defense": "drtg", "net": "net"}[metric]
    rated = [t for t in teams if t.get(key) is not None]
    rated.sort(key=lambda t: (t[key] if metric == "defense" else -t[key], t["team_id"]))
    ranked = [{**t, "rank": i + 1} for i, t in enumerate(rated)]
    bounds = {"top": (0, 10), "mid": (10, 20), "bottom": (20, len(ranked))}[tier]
    return ranked[bounds[0] : bounds[1]]
