"""AR09 position rankings from release-bound starting positions, over disposable PostgreSQL."""

import csv
import json
from datetime import date
from uuid import uuid4

import pytest
from test_conversation_postgres import postgres_conversation as _postgres_fixture

from courtload.config import get_settings
from courtload.domain.conversation import AnalysisPlan, ConversationContext, OperationStep
from courtload.domain.hybrid_assistant import HybridTurnRequest
from courtload.services.assistant.hybrid import run_hybrid_turn
from courtload.services.assistant.operations import canonical_step
from courtload.services.assistant.planner import PlanningOutput
from courtload.services.workbench_ingestion import workbench_content_sha256
from courtload.workbench_models import WorkbenchDataset

postgres_conversation = _postgres_fixture


def position_request(context, position="center", message="Top centers in scoring"):
    return HybridTurnRequest(
        request_id=uuid4(),
        message=message,
        context=ConversationContext(release_id=context.release_id, season="2024-25"),
        plan=AnalysisPlan(
            steps=[
                OperationStep(
                    step_id="positions",
                    operation="position_query",
                    arguments={
                        "position": position,
                        "query": {
                            "metric_selectors": [{"key": "pts_per_game"}],
                            "sort": [{"field": "pts_per_game"}],
                            "page": {"limit": 10},
                        },
                    },
                )
            ]
        ),
    )


@pytest.fixture
def admitted_positions(postgres_conversation, tmp_path, monkeypatch):
    """Raw box scores whose aggregate hash is the release dataset's content hash."""
    session, context = postgres_conversation
    season_dir = tmp_path / "sportsdataverse_2025"
    season_dir.mkdir()
    with (season_dir / "player_boxscores_2025.csv").open("w", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["game_id", "person_id", "position"])
        for day in range(1, 31):
            game = f"002240{day:04}"
            # Barnes starts at C in 20 of 30 games; "1" always starts at G; Dončić starts
            # three games (C once, F twice) and is a forward by majority.
            writer.writerow([game, "1630567", "C" if day <= 20 else "F"])
            writer.writerow([game, "1", "G"])
            writer.writerow([game, "2", {1: "C", 2: "F", 3: "F"}.get(day, "")])
    (season_dir / "team_boxscores_2025.csv").write_text("game_id\n")
    dataset = session.get(WorkbenchDataset, context.dataset_id)
    dataset.content_sha256 = workbench_content_sha256([2025], tmp_path)[0]
    dataset.manifest_json = {"admitted_years": [2025], "file_count": 2}
    session.commit()
    # Spawned analytical workers read settings from the environment.
    monkeypatch.setenv("COURTLOAD_RAW_STORE_PATH", str(tmp_path))
    get_settings.cache_clear()
    yield session, context, season_dir
    get_settings.cache_clear()


def result_of(answer):
    return next(block.result for block in answer.blocks if block.kind == "result")


def test_center_ranking_uses_majority_starting_position(admitted_positions):
    session, context, _ = admitted_positions
    answer = run_hybrid_turn(session, position_request(context), clock=lambda: date(2026, 10, 5))
    assert answer.status == "answered", answer.model_dump_json()
    result = result_of(answer)
    assert result.operation == "position_query"
    assert [row["player_id"] for row in result.rows] == ["1630567"]
    assert result.rows[0]["starting_position"] == "C"
    assert result.rows[0]["starts"] == 30
    assert result.eligible_count == 1
    assert "starting position (G/F/C)" in result.limitations[0]
    assert result.open_url is None
    forwards = result_of(
        run_hybrid_turn(
            session,
            position_request(context, "forward", "Top forwards in scoring"),
            clock=lambda: date(2026, 10, 5),
        )
    )
    assert [row["player_id"] for row in forwards.rows] == ["2"]


def test_narrower_position_is_labelled_as_its_group(admitted_positions):
    session, context, _ = admitted_positions
    answer = run_hybrid_turn(
        session,
        position_request(context, "guard", "Which point guard scores the most?"),
        clock=lambda: date(2026, 10, 5),
    )
    result = result_of(answer)
    assert [row["player_id"] for row in result.rows] == ["1"]
    assert result.limitations[0].startswith("Box scores record only G, F or C")
    assert result.limitations[0] in answer.scope.assumptions


def test_position_step_is_canonical_and_rejects_unknown_fields(admitted_positions):
    session, context, _ = admitted_positions
    step = position_request(context).plan.steps[0]
    once = canonical_step(session, context, step)
    assert canonical_step(session, context, once) == once
    with pytest.raises(ValueError):
        canonical_step(
            session,
            context,
            step.model_copy(update={"arguments": {**step.arguments, "role": "rim protector"}}),
        )
    with pytest.raises(ValueError):
        canonical_step(
            session,
            context,
            step.model_copy(update={"arguments": {**step.arguments, "position": "point_guard"}}),
        )


@pytest.mark.parametrize("tamper", ["changed_bytes", "no_manifest"])
def test_unverifiable_positions_answer_unfiltered_with_label(admitted_positions, tamper):
    session, context, season_dir = admitted_positions
    if tamper == "changed_bytes":
        with (season_dir / "player_boxscores_2025.csv").open("a") as stream:
            stream.write("0022400001,1,C\n")
    else:
        dataset = session.get(WorkbenchDataset, context.dataset_id)
        dataset.manifest_json = {}
        session.commit()
    answer = run_hybrid_turn(session, position_request(context), clock=lambda: date(2026, 10, 5))
    assert answer.status == "answered", answer.model_dump_json()
    result = result_of(answer)
    # Every player is ranked, and the answer says the filter was not applied.
    assert result.operation == "query"
    assert len(result.rows) == 3
    assert result.limitations[0].startswith("Position filter (centers) not applied")
    assert result.limitations[0] in answer.scope.assumptions
    assert answer.plan.steps[0].operation == "query"
    assert answer.accounting.analytical_calls == 2


@pytest.mark.parametrize("general_status", ["answered", "unavailable"])
def test_unsupported_plan_gets_labelled_general_answer(postgres_conversation, general_status):
    session, context = postgres_conversation
    purposes = []

    class Provider:
        def plan(self, payload, *, timeout_seconds):
            body = json.loads(payload)
            purposes.append(body.get("purpose", "plan"))
            if body.get("purpose") == "general_knowledge":
                return PlanningOutput(
                    {
                        "status": general_status,
                        "text": "A rookie is a player in their debut NBA season.",
                    }
                )
            return PlanningOutput(
                {
                    "plan_version": "courtload-analysis-plan-v1",
                    "status": "unsupported",
                    "clarification": "capability",
                    "steps": [],
                    "output_kind": "table",
                }
            )

    answer = run_hybrid_turn(
        session,
        HybridTurnRequest(
            request_id=uuid4(),
            message="Which rookie scored the most?",
            context=ConversationContext(release_id=context.release_id, season="2024-25"),
        ),
        provider=Provider(),
        clock=lambda: date(2026, 10, 5),
    )
    assert purposes == ["plan", "general_knowledge"]
    assert answer.accounting.analytical_calls == 0
    if general_status == "answered":
        assert answer.status == "answered"
        assert [b.kind for b in answer.blocks] == ["text", "inability"]
        assert answer.blocks[0].origin == "general_knowledge"
        assert "general knowledge" in answer.blocks[1].text
        assert not answer.saveable
    else:
        assert answer.status == "unable"
        assert answer.blocks[0].reason == "unsupported_operation"
