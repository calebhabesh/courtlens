"""Explicit final Live versus independently admitted batch reconciliation; never publication."""

from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtload.domain.teams import get_team_info
from courtload.live_models import LiveContent, LiveObservation, LiveReconciliation
from courtload.workbench_models import WorkbenchDataset, WorkbenchSchedule, WorkbenchTeamGame


def reconcile_final(session: Session, observation_id: str, dataset_id: str) -> dict[str, Any]:
    observation = session.get(LiveObservation, observation_id)
    if not observation or not session.get(WorkbenchDataset, dataset_id):
        raise HTTPException(404, "Observation or admitted dataset missing")
    content = session.get(LiveContent, observation.content_sha256)
    assert content
    game = content.normalized_json.get("game")
    if not game or game["status"] != "final":
        raise HTTPException(422, "Reconciliation requires a retained final game summary")
    game_id = game.get("canonical_id")
    result: dict[str, Any] = {
        "status": "awaiting_crosswalk",
        "source_game_id": game["source_id"],
        "canonical_game_id": game_id,
        "scope": "team_scores_only",
        "player_boxes": "not_reconciled",
        "publication": "none",
    }
    if game_id:
        schedule = session.scalar(
            select(WorkbenchSchedule).where(
                WorkbenchSchedule.dataset_id == dataset_id, WorkbenchSchedule.game_id == game_id
            )
        )
        teams = {
            t["side"]: get_team_info(t["canonical_id"]) if t.get("canonical_id") else None
            for t in game["teams"]
        }
        if not schedule or schedule.game_status != 3:
            result["status"] = "awaiting_batch_admission"
        elif not all(teams.values()):
            result["status"] = "awaiting_crosswalk"
        else:
            home, away = teams["home"], teams["away"]
            assert home and away
            schedule_home, schedule_away = (
                get_team_info(schedule.home_team_id),
                get_team_info(schedule.away_team_id),
            )
            if (
                schedule.game_date.isoformat() != game["slate_date"]
                or schedule_home != home
                or schedule_away != away
            ):
                result["status"] = "identity_mismatch"
            else:
                rows = list(
                    session.scalars(
                        select(WorkbenchTeamGame).where(
                            WorkbenchTeamGame.dataset_id == dataset_id,
                            WorkbenchTeamGame.game_id == game_id,
                            WorkbenchTeamGame.is_final.is_(True),
                        )
                    )
                )
                scores = {get_team_info(row.team_id): row for row in rows}
                source = {teams[t["side"]]: t["score"] for t in game["teams"]}
                if (
                    len(rows) != 2
                    or set(scores) != set(source)
                    or any(value is None for value in source.values())
                ):
                    result["status"] = "awaiting_batch_admission"
                else:
                    result["status"] = (
                        "matched"
                        if all(
                            scores[team].points == points
                            and scores[team].opponent_points
                            == source[away if team == home else home]
                            for team, points in source.items()
                        )
                        else "score_mismatch"
                    )
                    result["scores"] = [
                        {
                            "team_id": team.team_id if team else None,
                            "live": points,
                            "batch": scores[team].points,
                        }
                        for team, points in source.items()
                    ]
    session.add(
        LiveReconciliation(observation_id=observation_id, dataset_id=dataset_id, result_json=result)
    )
    session.commit()
    return result
