"""PC08 Contracts views: one pinned refresh, its book, index and thresholds. Read-only."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.domain.finance_context import RefreshInfo
from courtlens.domain.finance_views import (
    ContractSeason,
    DarkoValueContext,
    LeaguePayrollResponse,
    PositionGroup,
    ReferenceImpact,
    RefreshContext,
    TeamContractPlayer,
    TeamContractsResponse,
    TeamPayroll,
)
from courtlens.domain.query_spec import QuerySpec
from courtlens.domain.teams import NBA_TEAMS, get_team_info
from courtlens.finance_context_models import FinanceThreshold
from courtlens.services.darko import ATTRIBUTION, CURRENT, load_darko_store
from courtlens.services.finance_import import release_rows
from courtlens.services.finance_refresh import last_checked, refresh_info, threshold_info
from courtlens.services.impact_serving import impact_for_query
from courtlens.services.player_context import dataset_rows, projected_roster, resolve_dataset

LIMITATIONS = (
    "Reported base salaries from each team's Basketball-Reference page; not cap hits, cash or "
    "complete legal cap accounting.",
    "Effective dates are not on the source page and stay unknown.",
    "Option markers do not establish exercise or guarantee state; a salary without an option "
    "marker is reported, not confirmed guaranteed.",
    "Threshold lines are official markers. Above or below a line is arithmetic on known "
    "salaries (a lower bound while any are unknown); no tax bill or legal apron compliance is "
    "claimed.",
    "DARKO values are DARKO's market value from its latest published board; surplus is that "
    "value minus the reported salary, only for players DARKO lists.",
    "An unknown salary is excluded from known totals and is never zero.",
    "Players on a team's source page but on another roster in the index (for example waived "
    "players) are listed separately.",
)


def _group(position: str | None) -> PositionGroup:
    if not position:
        return "unlisted"
    first = position.split("-")[0]
    return first if first in ("G", "F", "C") else "unlisted"  # type: ignore[return-value]


def _context(session: Session, info: RefreshInfo) -> RefreshContext:
    threshold = session.get(FinanceThreshold, info.threshold_id) if info.threshold_id else None
    return RefreshContext(
        refresh_id=info.refresh_id,
        season=info.season,
        observed_at=info.observed_at,
        checked_at=last_checked(get_settings().contracts_check_dir, info.refresh_id),
        state=info.state,
        book_id=info.book_id,
        roster_dataset_id=info.roster_dataset_id,
        thresholds=threshold_info(threshold) if threshold else None,
        label=f"{info.season} · reported salaries",
    )


def _book(session: Session, info: RefreshInfo) -> dict[tuple[str, str], dict[str, Any]]:
    """Group BRef rows by (player, source-listed team): per-season salary and options."""
    contracts: dict[tuple[str, str], dict[str, Any]] = defaultdict(
        lambda: {"salary": {}, "option": {}, "guaranteed": None, "url": None, "locator": None}
    )
    if info.book_id is None:
        return {}
    for _, row in release_rows(session, info.book_id):
        if row.team_id is None:
            continue
        entry = contracts[(row.nba_player_id, row.team_id)]
        if row.kind == "option" and row.financial_season and row.option in ("player", "team"):
            entry["option"][row.financial_season] = row.option
        elif row.amount_kind == "guaranteed_value":
            entry["guaranteed"] = row.cents
        elif row.amount_kind == "base_salary" and row.financial_season:
            entry["salary"][row.financial_season] = row.cents
            if row.financial_season == info.season:
                entry["locator"] = row.source_locator
    return dict(contracts)


def _seasons(contracts: dict[tuple[str, str], dict[str, Any]], season: str) -> tuple[str, ...]:
    found = {s for c in contracts.values() for s in c["salary"]}
    return tuple(sorted(s for s in found if s >= season)) or (season,)


def _cents(value: int | None) -> str | None:
    return None if value is None else str(value)


def league_payrolls(session: Session, refresh_id: str) -> LeaguePayrollResponse:
    info = refresh_info(session, refresh_id)
    contracts = _book(session, info)
    on_roster = {(c.player_id, c.team_id) for c in info.coverage}
    teams = []
    for team in sorted(NBA_TEAMS.values(), key=lambda t: t.tricode):
        roster = [c for c in info.coverage if c.team_id == team.team_id]
        known = [c for c in roster if c.salary_cents is not None]
        other = [
            v["salary"].get(info.season)
            for (pid, tid), v in contracts.items()
            if tid == team.team_id and (pid, tid) not in on_roster
        ]
        top = max(known, key=lambda c: int(c.salary_cents or 0), default=None)
        teams.append(
            TeamPayroll(
                team_id=team.team_id,
                team_tricode=team.tricode,
                team_name=team.name,
                roster_players=len(roster),
                roster_known_players=len(known),
                source_page_known_cents=str(
                    sum(int(c.salary_cents or 0) for c in known)
                    + sum(v for v in other if v is not None)
                ),
                other_source_rows=len(other),
                top_player_name=top.name if top else None,
                top_salary_cents=top.salary_cents if top else None,
            )
        )
    return LeaguePayrollResponse(
        context=_context(session, info),
        teams=tuple(teams),
        expected_players=info.expected_players,
        salary_observed_players=info.salary_observed_players,
        unresolved_source_rows=info.unresolved_source_rows,
        limitations=LIMITATIONS,
    )


def _impact(reference_season: str) -> tuple[dict[str, float | None], str | None]:
    start = int(reference_season[:4])
    cutoff = date(start + 1, 7, 1)
    query = QuerySpec(season=reference_season, phase="regular_season", before_date=cutoff)
    result = impact_for_query(query, cutoff.isoformat())
    if result["status"] != "available":
        return {}, None
    rapm = {pid: p["metrics"].get("rapm") for pid, p in result["players"].items()}
    return rapm, str(result["version"])


def _darko_current() -> tuple[dict[str, dict[str, Any]], DarkoValueContext | None]:
    """The latest season's `current` DARKO board; absent means values stay unknown."""
    entries = [e for e in (load_darko_store() or {}).get("entries", []) if e["phase"] == CURRENT]
    if not entries:
        return {}, None
    entry = max(entries, key=lambda e: e["season"])
    return entry["players"], DarkoValueContext(
        season=entry["season"],
        as_of=entry["as_of"],
        data_date=entry["data_date"],
        source=ATTRIBUTION,
        raw_sha256=entry["raw_sha256"],
    )


def team_contracts(
    session: Session, refresh_id: str, team: str, statistics_release_id: str | None
) -> TeamContractsResponse:
    team_info = get_team_info(team)
    if team_info is None:
        raise HTTPException(422, "unknown NBA team")
    info = refresh_info(session, refresh_id)
    contracts = _book(session, info)
    seasons = _seasons(contracts, info.season)
    dataset = resolve_dataset(session, info.roster_dataset_id, kind="player_index")
    positions = {r["player_id"]: r.get("listed_position") for r in dataset_rows(session, dataset)}
    start = int(info.season[:4]) - 1
    reference_season = f"{start}-{(start + 1) % 100:02d}"
    references: dict[str, Any] = {}
    release_id = None
    if statistics_release_id is not None:
        roster = projected_roster(session, dataset.id, team_info.team_id, statistics_release_id)
        references = {p["player_id"]: p["reference"] for p in roster["players"]}
        release_id = roster["statistics_release_id"]
    rapm, impact_version = _impact(reference_season)
    darko_players, darko = _darko_current()

    def value(player_id: str) -> int | None:
        dollars = darko_players.get(player_id, {}).get("sal_market_fixed")
        return round(dollars) if dollars is not None else None

    def reference(player_id: str) -> ReferenceImpact | None:
        stats = references.get(player_id)
        value = rapm.get(player_id)
        if stats is None and value is None:
            return None
        metrics = stats["metrics"] if stats else {}
        games, minutes = metrics.get("gp"), metrics.get("min")
        return ReferenceImpact(
            season=reference_season,
            games=games,
            minutes_per_game=round(minutes / games, 1) if games and minutes is not None else None,
            points_per_game=metrics.get("pts_per_game"),
            rebounds_per_game=metrics.get("reb_per_game"),
            assists_per_game=metrics.get("ast_per_game"),
            rapm=value,
        )

    def contract_seasons(entry: dict[str, Any] | None) -> tuple[ContractSeason, ...]:
        if entry is None:
            return ()
        return tuple(
            ContractSeason(
                season=s, salary_cents=_cents(entry["salary"].get(s)), option=entry["option"].get(s)
            )
            for s in seasons
        )

    players = []
    for c in (c for c in info.coverage if c.team_id == team_info.team_id):
        entry = contracts.get((c.player_id, c.team_id))
        players.append(
            TeamContractPlayer(
                player_id=c.player_id,
                name=c.name,
                on_index_roster=True,
                listed_position=positions.get(c.player_id),
                position_group=_group(positions.get(c.player_id)),
                current_salary_cents=c.salary_cents,
                unknown_reason=c.unknown_reason,
                remaining_guaranteed_cents=_cents(entry["guaranteed"]) if entry else None,
                seasons=contract_seasons(entry),
                source_url=c.source_url,
                source_locator=c.source_locator,
                reference=reference(c.player_id),
                darko_value_dollars=value(c.player_id),
                darko_dpm=darko_players.get(c.player_id, {}).get("dpm"),
            )
        )
    on_roster = {p.player_id for p in players}
    names = {c.player_id: c.name for c in info.coverage}
    other = []
    for (pid, tid), entry in contracts.items():
        if tid != team_info.team_id or pid in on_roster:
            continue
        salary = entry["salary"].get(info.season)
        other.append(
            TeamContractPlayer(
                player_id=pid,
                name=names.get(pid, f"NBA player {pid}"),
                on_index_roster=False,
                listed_position=positions.get(pid),
                position_group=_group(positions.get(pid)),
                current_salary_cents=_cents(salary),
                unknown_reason=None if salary is not None else "salary_blank_in_source",
                remaining_guaranteed_cents=_cents(entry["guaranteed"]),
                seasons=contract_seasons(entry),
                source_url=f"https://www.basketball-reference.com/contracts/{team_info.tricode}.html",
                source_locator=entry["locator"],
                reference=None,
            )
        )

    def order(p: TeamContractPlayer) -> tuple[bool, int, str]:
        known = p.current_salary_cents is not None
        return (not known, -int(p.current_salary_cents or 0), p.name)

    roster_known = sum(int(p.current_salary_cents or 0) for p in players)
    other_known = sum(int(p.current_salary_cents or 0) for p in other)
    return TeamContractsResponse(
        context=_context(session, info),
        team_id=team_info.team_id,
        team_tricode=team_info.tricode,
        team_name=team_info.name,
        seasons=seasons,
        roster_players=len(players),
        roster_known_players=sum(p.current_salary_cents is not None for p in players),
        roster_known_cents=str(roster_known),
        other_source_rows=len(other),
        other_source_known_cents=str(other_known),
        source_page_known_cents=str(roster_known + other_known),
        players=tuple(sorted(players, key=order)) + tuple(sorted(other, key=order)),
        reference_season=reference_season,
        statistics_release_id=release_id,
        impact_version=impact_version,
        darko=darko,
        limitations=LIMITATIONS,
    )
