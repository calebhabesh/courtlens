"""Research → Shooting → Shot Aftermath (courtlens-shot-aftermath-v1, R17): read-only results.

GET only, typed responses. Every value comes from the frozen, hash-verified results file.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from courtlens.services import shot_aftermath as service

router = APIRouter(prefix="/shot-aftermath", tags=["shot-aftermath"])

Zone = Literal["rim", "short_mid", "long_mid", "three", "all"]
Position = Literal["all", "guards", "forwards", "bigs"]
Status = Literal["ok", "thin", "unknown"]
Tone = Literal["benefit", "cost"]
SeasonQuery = Query(service.LATEST_SEASON, pattern=r"^\d{4}-\d{2}$")


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Interval(Strict):
    value: float
    low: float
    high: float


class Estimate(Interval):
    undefined_replicates: int


class Values(Strict):
    fg_pct: Estimate | None
    made: Estimate | None
    second_per_miss: Estimate | None
    second: Estimate | None
    own: Estimate | None
    dreb_share: Estimate | None
    ppp_make: Estimate | None
    ppp_dreb: Estimate | None
    cost: Estimate | None
    net: Estimate | None
    miss_cost: Estimate | None
    miss_net: Estimate | None
    dreb_cost: Estimate | None


class Tones(Strict):
    cost: Tone | None
    miss_cost: Tone | None
    dreb_cost: Tone | None


class Counts(Strict):
    attempts: int
    makes: int
    oreb: int
    dreb: int
    miss_unknown: int
    make_possessions: int
    dreb_possessions: int
    blocks: int
    and_ones: int
    make_censored: int
    make_same_team: int
    make_followed: int
    dreb_censored: int
    dreb_same_team: int


class Cell(Strict):
    team: str
    team_code: str | None
    position: Position
    zone: Zone
    status: Status
    counts: Counts
    values: Values
    tones: Tones


class League(Strict):
    possessions: int
    points: float
    ppp: Interval


class ZoneComparison(Strict):
    courtlens: int
    databallr: int
    difference: int


class Team(Strict):
    team_id: str
    code: str


class SeasonSummary(Strict):
    season: str
    league: League
    first_chance_by_zone: dict[Zone, int]
    databallr_comparison: dict[Zone, ZoneComparison] | None
    data_check: dict[str, Any]
    teams: list[Team]
    statuses: dict[Status, int]


class Registration(Strict):
    identity: str
    registered_on: str
    content_sha256: str


class PositionAccuracy(Strict):
    group_correct: int
    samples: int
    centres: int
    centres_estimated_c: int
    centres_estimated_pf: int


class Thresholds(Strict):
    attempts: int
    possessions: int
    replicates: int
    interval: float


class Summary(Strict):
    registration: Registration
    results_sha256: str
    latest_season: str
    seasons: list[SeasonSummary]
    zones: list[Zone]
    positions: list[Position]
    position_accuracy: PositionAccuracy
    thresholds: Thresholds
    definitions: dict[str, str]
    limitations: list[str]
    credit: str


class Scope(Strict):
    season: str
    team: str
    team_code: str | None
    position: Position
    league: League
    rows: list[Cell]


class TeamBoard(Strict):
    season: str
    position: Position
    zone: Zone
    league: League
    all_teams: Cell
    rows: list[Cell]


def _or_503(value: dict[str, Any] | None) -> dict[str, Any]:
    if value is None:
        raise HTTPException(503, "Shot Aftermath results unavailable")
    return value


def _served_season(season: str) -> None:
    results = service.load_results()
    if results is None:
        raise HTTPException(503, "Shot Aftermath results unavailable")
    if season not in results["seasons"]:
        raise HTTPException(404, f"Shot Aftermath serves {', '.join(sorted(results['seasons']))}")


@router.get("", response_model=Summary)
def summary() -> dict[str, Any]:
    return _or_503(service.summary())


@router.get("/scope", response_model=Scope)
def scope(
    season: str = SeasonQuery,
    team: str = Query("all", min_length=1, max_length=16),
    position: Position = "all",
) -> dict[str, Any]:
    _served_season(season)
    found = service.scope(season, team, position)
    if found is None:
        raise HTTPException(404, f"No shooting team {team} in {season}")
    return found


@router.get("/teams", response_model=TeamBoard)
def teams(
    season: str = SeasonQuery, position: Position = "all", zone: Zone = "all"
) -> dict[str, Any]:
    _served_season(season)
    return _or_503(service.teams(season, position, zone))
