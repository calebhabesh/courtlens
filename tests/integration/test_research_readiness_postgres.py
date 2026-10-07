"""B26 PostgreSQL inventory scopes evidence; fixture writes roll back after each check."""

from datetime import date
from pathlib import Path

import pytest
import test_b23_api
from sqlalchemy import select

from courtlens.domain.research_registration import ResearchProtocol
from courtlens.evaluation.research_readiness import input_inventory
from courtlens.evaluation.research_registration import load_document
from courtlens.models import new_uuid
from courtlens.workbench_models import WorkbenchSchedule, WorkbenchTeamGame, allow_admin_mutation

fixture_api = test_b23_api.fixture_api
shooting_api = test_b23_api.shooting_api
pytestmark = pytest.mark.postgres


def protocol() -> ResearchProtocol:
    document = load_document(Path("evaluation/research/protocols/courtload-expected-shot-v1.json"))
    assert isinstance(document, ResearchProtocol)
    return document


def test_scope_and_row_counts_cannot_authorize_fitting(shooting_api: tuple) -> None:
    _, session, request, _ = shooting_api
    result = input_inventory(
        session,
        dataset_id=request["release_id"],
        before_date=date(2024, 1, 15),
        protocols=[protocol()],
    )
    assert result["schedule_inventory"] == [
        {
            "season": "2023-24",
            "finalized_schedule_games": 3,
            "first_date": "2024-01-10",
            "last_date": "2024-01-12",
        }
    ]
    shots = result["family_inventory"]["shots"]
    assert shots["retained_rows"] == shots["valid_rows"] == 28
    assert shots["valid_rows_outside_scope"] == 16
    assert shots["by_season"] == [{"season": "2023-24", "rows": 12, "games_with_rows": 3}]
    assert result["family_inventory"]["stints"]["by_season"] == [
        {"season": "2023-24", "rows": 4, "games_with_rows": 2}
    ]
    assert result["status"] == "source_blocked"
    assert result["fit_authorized"] is False
    assert result["experiments"][0]["fit_authorized"] is False


def test_missing_dataset_is_rejected(fixture_api: tuple) -> None:
    _, session, _, _ = fixture_api
    with pytest.raises(ValueError, match="unknown dataset"):
        input_inventory(
            session, dataset_id=new_uuid(), before_date=date(2024, 1, 15), protocols=[protocol()]
        )


def test_team_boxes_require_matching_dates_phases_and_reciprocal_scores(fixture_api: tuple) -> None:
    _, session, request, _ = fixture_api
    schedule = session.scalar(
        select(WorkbenchSchedule)
        .where(WorkbenchSchedule.dataset_id == request["release_id"])
        .order_by(WorkbenchSchedule.game_id)
    )
    assert schedule is not None
    boxes = []
    with allow_admin_mutation(session):
        for side, team, opponent, points, opponent_points in [
            ("home", "TOR", "O", 100, 90),
            ("away", "O", "TOR", 90, 100),
        ]:
            box = WorkbenchTeamGame(
                id=new_uuid(),
                dataset_id=schedule.dataset_id,
                game_id=schedule.game_id,
                team_id=team,
                opponent_id=opponent,
                game_date=schedule.game_date,
                season=schedule.season,
                phase=schedule.phase,
                side=side,
                points=points,
                opponent_points=opponent_points,
                is_final=True,
                stats_json={},
                source_version_id=schedule.source_version_id,
                source_observation_id=schedule.source_observation_id,
            )
            session.add(box)
            boxes.append(box)
        session.flush()

    def counts() -> list[dict]:
        return input_inventory(
            session,
            dataset_id=schedule.dataset_id,
            before_date=date(2024, 1, 15),
            protocols=[protocol()],
        )["team_box_inventory"]

    assert counts() == [{"season": "2023-24", "games_with_reciprocal_final_team_boxes": 1}]
    with allow_admin_mutation(session):
        boxes[0].opponent_points = 91
        session.flush()
        assert counts() == []
        boxes[0].opponent_points = 90
        boxes[0].game_date = date(2024, 1, 11)
        session.flush()
        assert counts() == []
        boxes[0].game_date = schedule.game_date
        boxes[0].phase = "playoffs"
        session.flush()
        assert counts() == []
