"""ESPN → NBA identities for Live reads.

Teams map through the fixed ESPN team table. Players map, in order, through a verified
crosswalk, the newest sealed ESPN roster bundle (current rosters, matched when it was sealed), or
a normalized name that is unique in the NBA player index (or unique on the same team). Anything
else stays unmapped and keeps its ESPN name; nothing is guessed.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.domain.teams import TRICODE_TO_TEAM
from courtlens.ingestion.espn_rosters import ESPN_TEAMS
from courtlens.services.bref_identity import normalize_name
from courtlens.workbench_models import WorkbenchIdentityCrosswalk

_index_cache: dict[str, dict[str, list[dict[str, Any]]]] = {}


def _name_index(session: Session) -> dict[str, list[dict[str, Any]]]:
    from courtlens.services.espn_rosters import _index_players

    rows, dataset = _index_players(session)
    key = dataset.id if dataset else ""
    if key not in _index_cache:
        by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in rows:
            by_name[normalize_name(str(row["name"]))].append(row)
        _index_cache.clear()
        _index_cache[key] = dict(by_name)
    return _index_cache[key]


def _roster_ids() -> dict[str, str]:
    from courtlens.services.espn_rosters import load_latest

    latest = load_latest()
    if latest is None:
        return {}
    return {
        str(p["espn_id"]): str(p["player_id"])
        for p in latest[1]["entry"].get("players", [])
        if p.get("player_id")
    }


def _players(normalized: dict[str, Any]) -> list[tuple[dict[str, Any], str | None]]:
    """Every player-shaped entity with the ESPN team it appears for."""
    out: list[tuple[dict[str, Any], str | None]] = []
    for player in normalized.get("players") or []:
        out.append((player, player.get("team_source_id")))
    for leader in normalized.get("leaders") or []:
        out.append((leader, leader.get("team_source_id")))
    for team in normalized.get("injuries") or []:
        out.extend((player, team.get("team_source_id")) for player in team["players"])
    return out


def _verified(session: Session, kind: str, ids: set[str]) -> dict[str, set[str]]:
    found: dict[str, set[str]] = defaultdict(set)
    if not ids:
        return found
    for row in session.scalars(
        select(WorkbenchIdentityCrosswalk).where(
            WorkbenchIdentityCrosswalk.source_namespace == "espn",
            WorkbenchIdentityCrosswalk.kind == kind,
            WorkbenchIdentityCrosswalk.source_id.in_(ids),
            WorkbenchIdentityCrosswalk.target_namespace == "nba",
            WorkbenchIdentityCrosswalk.confidence == "verified",
        )
    ):
        found[row.source_id].add(row.target_id)
    return found


def bind_identities(session: Session, normalized: dict[str, Any]) -> dict[str, Any]:
    games = [g for g in normalized.get("games") or [normalized.get("game")] if g]
    game_map = _verified(session, "game", {g["source_id"] for g in games})
    team_map = _verified(session, "team", {t["source_id"] for g in games for t in g["teams"]})
    tricodes: dict[str, str] = {}
    for game in games:
        choices = game_map.get(game["source_id"], set())
        game["canonical_id"] = next(iter(choices)) if len(choices) == 1 else None
        game["identity_status"] = (
            "verified" if len(choices) == 1 else "ambiguous" if choices else "unmapped"
        )
        for team in game["teams"]:
            tricode = ESPN_TEAMS.get(team["source_id"], (None, None))[1]
            info = TRICODE_TO_TEAM.get(tricode) if tricode else None
            crossed = team_map.get(team["source_id"], set())
            team["tricode"] = tricode
            if len(crossed) > 1:
                team["canonical_id"], team["identity_status"] = None, "ambiguous"
            elif crossed:
                team["canonical_id"], team["identity_status"] = next(iter(crossed)), "verified"
            elif info:
                team["canonical_id"], team["identity_status"] = info.team_id, "verified"
            else:
                team["canonical_id"], team["identity_status"] = None, "unmapped"
            if tricode:
                tricodes[team["source_id"]] = tricode
    entities = _players(normalized)
    if not entities:
        return normalized
    crosswalk = _verified(session, "player", {str(entity["source_id"]) for entity, _ in entities})
    roster = _roster_ids()
    names = _name_index(session)
    for entity, team_source in entities:
        source_id = str(entity["source_id"])
        team_id = (
            TRICODE_TO_TEAM[tricodes[team_source]].team_id if team_source in tricodes else None
        )
        candidates = names.get(normalize_name(str(entity.get("name", ""))), [])
        same_team = [r for r in candidates if str(r.get("team_id")) == team_id]
        if len(crosswalk.get(source_id, set())) == 1:
            player_id, status = next(iter(crosswalk[source_id])), "verified"
        elif crosswalk.get(source_id):
            player_id, status = None, "ambiguous"
        elif source_id in roster:
            player_id, status = roster[source_id], "roster_bundle"
        elif len(candidates) == 1:
            player_id, status = str(candidates[0]["player_id"]), "name_unique"
        elif len(same_team) == 1:
            player_id, status = str(same_team[0]["player_id"]), "name_team_unique"
        else:
            player_id, status = None, "ambiguous" if candidates else "unmapped"
        entity["canonical_id"] = player_id
        entity["identity_status"] = status
    return normalized
