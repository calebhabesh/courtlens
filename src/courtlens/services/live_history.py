"""Bounded finalized research reads, independent of Live acquisition and publication."""

from datetime import date
from typing import Any, cast

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchivePlayerGame, ArchiveTeamGame
from courtlens.domain.teams import resolve_team_label
from courtlens.services.workbench_analytics import ResolvedContext
from courtlens.workbench_models import WorkbenchIdentity, WorkbenchPlayerGame, WorkbenchTeamGame


def historical_slate(
    session: Session, context: ResolvedContext, slate: date, game_id: str | None = None
) -> dict[str, Any]:
    team_model = WorkbenchTeamGame if context.dataset_type == "workbench" else ArchiveTeamGame
    player_model = WorkbenchPlayerGame if context.dataset_type == "workbench" else ArchivePlayerGame
    query = select(team_model).where(
        team_model.dataset_id == context.dataset_id,
        team_model.season == context.season,
        team_model.game_date == slate,
        team_model.game_date < context.before_date,
    )
    if context.dataset_type == "workbench":
        query = query.where(
            WorkbenchTeamGame.phase == context.phase, WorkbenchTeamGame.is_final.is_(True)
        )
    elif context.phase != "regular_season":
        raise HTTPException(422, "Archive finalized boxes support regular season only")
    if game_id:
        query = query.where(team_model.game_id == game_id)
    teams = cast(
        list[WorkbenchTeamGame | ArchiveTeamGame],
        list(session.scalars(query.order_by(team_model.game_id, team_model.side).limit(61))),
    )
    if len(teams) > 60:
        raise HTTPException(422, "Historical slate exceeds 30-game bound")
    grouped: dict[str, list[Any]] = {}
    for team in teams:
        grouped.setdefault(team.game_id, []).append(team)
    games = []
    for identifier, sides in grouped.items():
        if (
            len(sides) != 2
            or {t.side for t in sides} != {"home", "away"}
            or sides[0].team_id != sides[1].opponent_id
            or sides[1].team_id != sides[0].opponent_id
            or any(t.points < 0 for t in sides)
            or (
                context.dataset_type == "workbench"
                and any(t.opponent_points != sides[1 - i].points for i, t in enumerate(sides))
            )
        ):
            continue
        games.append(
            {
                "source_id": identifier,
                "canonical_id": identifier,
                "identity_status": "admitted_research",
                "namespace": "nba",
                "slate_date": slate.isoformat(),
                "event_time": sides[0].tipoff_utc,
                "status": "final",
                "period": None,
                "clock": None,
                "provisional": False,
                "teams": [
                    {
                        "source_id": t.team_id,
                        "canonical_id": t.team_id,
                        "identity_status": "admitted_research",
                        "name": resolve_team_label(t.team_id),
                        "side": t.side,
                        "score": t.points,
                        "statistics": t.stats_json,
                    }
                    for t in sides
                ],
            }
        )
    players = []
    if game_id and games:
        player_query = select(player_model).where(
            player_model.dataset_id == context.dataset_id,
            player_model.season == context.season,
            player_model.game_date == slate,
            player_model.game_date < context.before_date,
            player_model.game_id == game_id,
            player_model.team_id.in_([t.team_id for t in teams]),
        )
        if context.dataset_type == "workbench":
            player_query = player_query.where(WorkbenchPlayerGame.phase == context.phase)
        rows = cast(
            list[WorkbenchPlayerGame | ArchivePlayerGame],
            list(session.scalars(player_query.order_by(player_model.player_id).limit(81))),
        )
        if len(rows) > 80:
            raise HTTPException(422, "Historical player box exceeds 80-row bound")
        labels = {
            identifier: name
            for identifier, name in session.execute(
                select(WorkbenchIdentity.external_id, WorkbenchIdentity.display_name).where(
                    WorkbenchIdentity.kind == "player",
                    WorkbenchIdentity.namespace == "nba",
                    WorkbenchIdentity.external_id.in_([r.player_id for r in rows]),
                )
            )
        }
        for row in rows:
            stats = {"minutes_seconds": row.minutes_seconds, **row.stats_json}
            if isinstance(row, WorkbenchPlayerGame):
                stats["points"] = row.points if row.points is not None else stats.get("points")
            nonappearance = row.appearance in {"did_not_play", "dnp", "reported_nonappearance"}
            players.append(
                {
                    "source_id": row.player_id,
                    "canonical_id": row.player_id,
                    "identity_status": "admitted_research",
                    "team_source_id": row.team_id,
                    "name": labels.get(row.player_id, row.player_id),
                    "appearance_label": row.appearance,
                    "reported_nonappearance": True if nonappearance else None,
                    "statistics": {
                        key: None if nonappearance or value is None else str(value)
                        for key, value in stats.items()
                    },
                }
            )
    return {
        "context": context.to_dict(),
        "games": games,
        "players": players or None,
        "status": "admitted_finals" if games else "no_admitted_finals",
        "warnings": [
            *context.warnings,
            "Retained finalized research; missing games or player rows remain unknown. "
            "Identity names are display labels. No Live acquisition or final "
            "reconciliation implied.",
        ],
    }
