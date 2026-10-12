"""Read-only PC10 Roster Shapes: 2026-27 projected rosters sized by sealed value (BPR).

Contract: docs/design/roster-shapes-v1.md. Inputs are the pinned NBA player index (current
team), the published statistics release (2025-26 reference minutes and teams) and the PC09
value/archetype serving manifest. Nothing is fitted here.
"""

from __future__ import annotations

from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchivePlayerGame
from courtlens.domain.teams import NBA_TEAMS
from courtlens.services.player_context import context_catalog, projected_roster
from courtlens.services.value_archetypes import (
    _archetype,
    load_value_store,
)
from courtlens.services.workbench_analytics import resolve_workbench_context
from courtlens.workbench_models import WorkbenchPlayerGame

VERSION = "courtlens-roster-shapes-v1"
SEASON = "2026-27"
# BPM/VORP convention: a freely available replacement player rates about -2.0 per 100.
REPLACEMENT_LEVEL = -2.0
# A full regular season of one player's minutes (82 games x 48 minutes).
FULL_SEASON_MINUTES = 82 * 48
CREDIT = "Roster shape diagrams after Wyman diagrams by @taylormetrics."
LIMITATIONS = [
    "Projected: no 2026-27 minutes played yet. Each player is drawn from 2025-26 numbers.",
    "Size is value over replacement: (BPR + 2.0) x share of a full season's minutes in "
    "2025-26. It is descriptive, not a forecast, a team rating or a verdict.",
    "BPR is a descriptive model estimate under lineup confounding, not causal.",
    "Derived archetypes describe one season's statistical style, not a listed position.",
    "Fit outline shows continuity only: whether the player appeared for this team in "
    "2025-26. It does not measure how well players complement each other.",
    "White space is the gap to the fullest roster in this view, not a target or a need.",
    "Players without a value or 2025-26 minutes are unknown and never sized as zero; "
    "team totals are lower bounds.",
    "Current team comes from the dated NBA player index, not prior-season participation.",
]


def _latest_index(session: Session) -> str:
    catalog = context_catalog(session, SEASON)
    index = next(c for c in catalog["capabilities"] if c["name"] == "player_index")
    if index["dataset"] is None:
        raise HTTPException(503, f"No {SEASON} player index has been admitted.")
    return str(index["dataset"].dataset_id)


def _previous_teams(session: Session, release_id: str | None, season: str) -> dict[str, set[str]]:
    """Team tricodes each player appeared for in the reference regular season."""
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase="regular_season",
        requested_before_date=date(int(season[:4]) + 1, 7, 1),
    )
    model = WorkbenchPlayerGame if context.dataset_type == "workbench" else ArchivePlayerGame
    query = (
        select(model.player_id, model.team_id)
        .where(
            model.dataset_id == context.dataset_id,
            model.season == season,
            model.appearance == "appeared",
        )
        .distinct()
    )
    if context.dataset_type == "workbench":
        query = query.where(WorkbenchPlayerGame.phase == "regular_season")
    teams: dict[str, set[str]] = {}
    for player_id, team_id in session.execute(query).all():
        teams.setdefault(str(player_id), set()).add(str(team_id))
    return teams


def vor(value: float | None, minutes: float | None) -> float | None:
    """Value over replacement; unknown when either input is unknown, never zero."""
    if value is None or minutes is None:
        return None
    share = min(1.0, max(0.0, minutes) / FULL_SEASON_MINUTES)
    return (value - REPLACEMENT_LEVEL) * share


def fit_status(tricode: str, previous: set[str] | None) -> str:
    if not previous:
        return "unknown"
    return "returning" if tricode in previous else "new"


def team_summary(players: list[dict[str, Any]]) -> dict[str, Any]:
    sized = [p["vor"] for p in players if p["vor"] is not None and p["vor"] > 0]
    total = sum(sized)
    returning = sum(
        p["vor"] for p in players if p["fit"] == "returning" and p["vor"] and p["vor"] > 0
    )
    mix: dict[int, float] = {}
    for p in players:
        if p["vor"] and p["vor"] > 0 and p["archetype"] is not None:
            mix[p["archetype"]["primary"]] = mix.get(p["archetype"]["primary"], 0.0) + p["vor"]
    return {
        "players": len(players),
        "sized_players": len(sized),
        "below_replacement_players": sum(p["vor"] is not None and p["vor"] <= 0 for p in players),
        "unknown_players": sum(p["vor"] is None for p in players),
        "total_vor": total,
        # Share of known positive value from players who appeared for this team last season.
        "returning_share": returning / total if total > 0 else None,
        "archetype_mix": [
            {"cluster": k, "vor": v, "share": v / total} for k, v in sorted(mix.items())
        ],
    }


def roster_shapes(
    session: Session, dataset_id: str | None, statistics_release_id: str | None
) -> dict[str, Any]:
    store = load_value_store()
    if store is None:
        raise HTTPException(503, "No sealed value/archetype serving manifest installed.")
    index_id = dataset_id or _latest_index(session)
    # Default to the published public release, as every other workbench page does.
    release_id = statistics_release_id or resolve_workbench_context(session).release_id
    roster = projected_roster(session, index_id, None, release_id)
    reference_season = roster["reference_season"]
    previous = _previous_teams(session, roster["statistics_release_id"], reference_season)
    values = store["value"]["players"]
    archetypes = store["archetypes"]["players"]
    clusters = store["archetypes"]["names"]["clusters"]

    by_team: dict[str, list[dict[str, Any]]] = {}
    for row in roster["players"]:
        pid = row["player_id"]
        value = values.get(pid)
        reference = row["reference"]
        minutes = reference["metrics"].get("min") if reference else None
        games = reference["metrics"].get("gp") if reference else None
        archetype = _archetype(store, archetypes.get(pid))
        if archetype is not None:
            # Features stay on the player and archetype endpoints; this view needs membership.
            archetype.pop("features")
        player = {
            "player_id": pid,
            "player_name": row["name"],
            "listed_position": row.get("listed_position"),
            "value": value["value"] if value else None,
            "value_qualified": bool(value and value["qualified"]),
            "value_percentile": value.get("value_percentile") if value else None,
            "reference_minutes": minutes,
            "reference_games": games,
            "vor": vor(value["value"] if value else None, minutes),
            "archetype": archetype,
            "fit": fit_status(row["team_tricode"], previous.get(pid)),
            "previous_teams": sorted(previous.get(pid, set())),
            "unknown_reasons": [
                reason
                for reason, missing in (
                    ("No stints in the BPR window; value is unknown.", value is None),
                    (f"No {reference_season} regular-season minutes.", minutes is None),
                    (
                        "No complete regular-season feature sample; archetype is unknown.",
                        archetype is None,
                    ),
                )
                if missing
            ],
        }
        by_team.setdefault(row["team_tricode"], []).append(player)

    teams = []
    for info in sorted(NBA_TEAMS.values(), key=lambda t: t.tricode):
        players = sorted(
            by_team.get(info.tricode, []),
            key=lambda p: (p["vor"] is None, -(p["vor"] or 0.0), p["player_name"]),
        )
        teams.append(
            {
                "team_id": info.team_id,
                "team_tricode": info.tricode,
                "team_name": info.name,
                **team_summary(players),
                "roster": players,
            }
        )
    capacity = max((t["total_vor"] for t in teams), default=0.0)
    value_meta = store["value"]
    return {
        "version": VERSION,
        "season": SEASON,
        "label": roster["label"],
        "projected_note": "Projected: no 2026-27 minutes played yet."
        if not roster["current_season_appearances_in_release"]
        else "Projected from 2025-26 numbers; 2026-27 games exist but are not used here.",
        "reference_season": reference_season,
        "phase": "regular_season",
        "replacement_level": REPLACEMENT_LEVEL,
        "full_season_minutes": FULL_SEASON_MINUTES,
        "capacity": capacity,
        "value": {
            "label": value_meta["label"],
            "scope": value_meta["scope"],
            "unit": value_meta["unit"],
            "artifact_sha256": value_meta["sha256"],
        },
        "archetypes": {
            "artifact_sha256": store["archetypes"]["sha256"],
            "names_status": store["archetypes"]["names"]["status"],
            "clusters": [
                {
                    "cluster": i,
                    "name": c["name"],
                    "short": c["short"],
                    "description": c["description"],
                    "color_token": f"--color-category-{i + 1}" if i < 6 else None,
                }
                for i, c in enumerate(clusters)
            ],
        },
        "roster_context": roster["context"].model_dump(mode="json"),
        "statistics_release_id": roster["statistics_release_id"],
        "credit": CREDIT,
        "limitations": LIMITATIONS,
        "teams": teams,
    }
