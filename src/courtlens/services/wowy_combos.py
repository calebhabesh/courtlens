"""WOWY combos over accepted stints (alignment row 5; docs/design/wowy-combos-v1.md)."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from courtlens.domain.on_off import RosterPlayer, StatShiftRosterRequest
from courtlens.domain.teams import get_team_info
from courtlens.domain.wowy_combos import (
    VERSION,
    ComboCell,
    OnOffShift,
    WowyCombosRequest,
    combo_cells,
    filter_rows,
    tier_teams,
)
from courtlens.services.darko import ATTRIBUTION as DARKO_ATTRIBUTION
from courtlens.services.darko import CURRENT as DARKO_CURRENT
from courtlens.services.darko import load_darko_store
from courtlens.services.on_off import (
    DISCLOSURES,
    load_floor_rows,
    player_names,
    stint_scopes,
)
from courtlens.services.season_impact import NAMESPACE as PROVISIONAL_NAMESPACE
from courtlens.services.team_analytics import get_teams_six_factors
from courtlens.services.workbench_analytics import canonical_hash, resolve_workbench_context
from courtlens.workbench_models import WorkbenchDataset

LIMITATIONS = [
    *DISCLOSURES[:3],
    "Filters keep or drop whole stints. A clock window keeps a stint when its midpoint falls "
    "inside it; quarters, halves and overtime are exact because stints never cross periods.",
    "Garbage time: a fourth-quarter stint that starts with a margin of 25+ points with 12:00 to "
    "9:00 left, 20+ with 9:00 to 6:00, or 10+ with under 6:00. Overtime never counts.",
    "Common games keeps games in which every selected player (combo, On and Off) played.",
    "Turnover rates use player turnovers from the stint box; team turnovers are not attributed "
    "to stints. A box field unrecorded for a game is left out of that rate, never counted as 0.",
    f"Teammate help is the minutes-weighted average of the other teammates' {DARKO_ATTRIBUTION} "
    "ratings, from DARKO's retrospective rating at the phase's last admitted game date. It is "
    "context for the lineup, not an adjustment of its ratings; unrated teammates are left out.",
]


class OpponentTeam(BaseModel):
    team_id: str
    tricode: str
    rank: int | None = None
    value: float | None = None


class WowyCombosResponse(BaseModel):
    operation_version: str = VERSION
    context: dict[str, Any]
    request: WowyCombosRequest
    team_id: str | None
    available_scopes: list[dict[str, str]]
    coverage_status: Literal["available", "partial", "source_blocked"]
    expected_games: int
    observed_games: int
    excluded_stints: int
    first_game: str | None
    last_game: str | None
    roster: list[RosterPlayer]
    names: dict[str, str]
    opponents: list[OpponentTeam]
    # Pooled league ORtg (= DRtg) for the scope; the page reads cell ratings against it.
    league_rating: float | None = None
    # Pooled league TS%, turnovers per 100 possessions, ORB% and 3P% (offense equals defense).
    league_factors: dict[str, float | None] = Field(default_factory=dict)
    darko_as_of: str | None = None
    # The season is under way: its stints are the newest daily provisional build.
    provisional: bool = False
    cells: list[ComboCell]
    shifts: list[OnOffShift]
    total: ComboCell | None
    input_hash: str
    evidence_hash: str
    limitations: list[str]


def _aliases(team: str) -> set[str]:
    info = get_team_info(team)
    return {team, info.team_id, info.tricode} if info else {team}


def wowy_combos(session: Session, request: WowyCombosRequest) -> WowyCombosResponse:
    scopes = stint_scopes(session)
    # The phase defaults to the regular season even when a season is named.
    phase = request.phase or "regular_season"
    season = request.season or next((s["season"] for s in scopes if s["phase"] == phase), None)
    request = request.model_copy(update={"season": season, "phase": phase})
    empty: dict[str, Any] = {
        "available_scopes": scopes,
        "expected_games": 0,
        "observed_games": 0,
        "excluded_stints": 0,
        "first_game": None,
        "last_game": None,
        "roster": [],
        "names": {},
        "opponents": [],
        "cells": [],
        "shifts": [],
        "total": None,
        "input_hash": "",
        "evidence_hash": "",
        "limitations": LIMITATIONS,
    }
    covered = any(s["season"] == request.season and s["phase"] == request.phase for s in scopes)
    if request.team_id is None or not covered:
        context = resolve_workbench_context(
            session,
            release_id=request.release_id,
            requested_season=request.season,
            requested_phase=request.phase,
            requested_before_date=None,
            requested_window="season",
        )
        return WowyCombosResponse(
            context={**context.to_dict(), "stint_dataset_id": None},
            request=request,
            team_id=request.team_id,
            coverage_status="source_blocked",
            **empty,
        )
    team = get_team_info(request.team_id)
    if team is not None:
        request = request.model_copy(update={"team_id": team.team_id})
    assert request.team_id is not None
    # The whole season is read once: the roster and common games need every stint.
    scope = StatShiftRosterRequest(
        team_id=request.team_id,
        release_id=request.release_id,
        season=request.season,
        phase=request.phase,
    )
    rows, context, expected, excluded, stints_from = load_floor_rows(session, scope, detail=True)
    seconds: dict[str, float] = {}
    games: dict[str, set[str]] = {}
    for r in rows:
        for p in r["lineup"]:
            seconds[p] = seconds.get(p, 0.0) + float(r["seconds"])
            games.setdefault(p, set()).add(r["game_id"])
    opponents: list[OpponentTeam] = []
    allowed: set[str] | None = None
    league = get_teams_six_factors(session, context)
    if request.tier_metric and request.tier:
        teams = league["teams"]
        key = {"offense": "ortg", "defense": "drtg", "net": "net"}[request.tier_metric]
        picked = tier_teams(teams, request.tier_metric, request.tier)
        opponents = [
            OpponentTeam(team_id=t["team_id"], tricode=t["tricode"], rank=t["rank"], value=t[key])
            for t in picked
            # Ranks are league-wide; a team never plays itself.
            if t["team_id"] != request.team_id
        ]
    elif request.opponents:
        opponents = [
            OpponentTeam(team_id=info.team_id, tricode=info.tricode)
            for info in (get_team_info(t) for t in request.opponents)
            if info is not None
        ]
    if request.tier_metric or request.opponents:
        allowed = set().union(*(_aliases(t.team_id) for t in opponents)) if opponents else set()
    if request.vs_team:
        vs = _aliases(request.vs_team)
        allowed = vs if allowed is None else allowed & vs
    kept = filter_rows(rows, request, allowed)
    darko = _darko(context.season, context.phase)
    cells, shifts, total = combo_cells(kept, request, darko["players"] if darko else None)
    chosen = set(request.combo + request.on + request.off)
    if request.vs_player:
        chosen.add(request.vs_player)
    names = player_names(session, set(seconds) | chosen)
    roster = sorted(
        (
            RosterPlayer(
                player_id=p, name=names.get(p), games=len(games[p]), minutes=seconds[p] / 60.0
            )
            for p in seconds
        ),
        key=lambda x: (-x.minutes, x.player_id),
    )
    observed = len({r["game_id"] for r in rows})
    dates = sorted({r["game_date"] for r in rows})
    input_hash = canonical_hash(
        {
            "scope": {"season": context.season, "phase": context.phase},
            "stint_dataset": stints_from,
            "facts": kept,
        }
    )
    response = WowyCombosResponse(
        context={**context.to_dict(), "stint_dataset_id": stints_from},
        request=request,
        team_id=request.team_id,
        available_scopes=scopes,
        coverage_status="source_blocked"
        if not observed
        else "available"
        if observed == expected and not excluded
        else "partial",
        expected_games=expected,
        observed_games=observed,
        excluded_stints=excluded,
        first_game=dates[0] if dates else None,
        last_game=dates[-1] if dates else None,
        roster=roster,
        names={p: n for p, n in names.items() if p in chosen or p in seconds},
        opponents=opponents,
        league_rating=league["league"].get("rating"),
        league_factors=_league_factors(league["league"]),
        darko_as_of=darko["as_of"] if darko else None,
        provisional=_provisional(session, stints_from),
        cells=cells,
        shifts=shifts,
        total=total if kept else None,
        input_hash=input_hash,
        evidence_hash="",
        limitations=LIMITATIONS,
    )
    response.evidence_hash = canonical_hash(
        {
            "version": VERSION,
            "request": request.model_dump(mode="json", exclude={"release_id"}),
            "input_hash": input_hash,
            "cells": [c.model_dump() for c in cells],
            "shifts": [s.model_dump() for s in shifts],
        }
    )
    return response


def _darko(season: str | None, phase: str | None) -> dict[str, Any] | None:
    """DARKO's sealed rating for the scope's phase; for a season under way, which has no phase
    entry yet, its latest `current` board. None when neither is loaded."""
    entries = [e for e in (load_darko_store() or {}).get("entries", []) if e["season"] == season]
    return next((e for e in entries if e["phase"] == phase), None) or next(
        (e for e in entries if e["phase"] == DARKO_CURRENT), None
    )


def _league_factors(league: dict[str, Any]) -> dict[str, float | None]:
    def pct(key: str) -> float | None:
        value = league.get(key)
        return 100.0 * value if value is not None else None

    return {
        "ts_pct": pct("ts_pct"),
        "tov_100": league.get("tov_per_100"),
        "oreb_pct": pct("orb_pct"),
        "fg3_pct": pct("fg3_pct"),
    }


def _provisional(session: Session, dataset_id: str | None) -> bool:
    dataset = session.get(WorkbenchDataset, dataset_id) if dataset_id else None
    return dataset is not None and dataset.source_namespace == PROVISIONAL_NAMESPACE
