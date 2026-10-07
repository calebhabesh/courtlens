"""Frozen hybrid corpus through durable HTTP and exact manual computation on PostgreSQL."""

import hashlib
import json
from datetime import date
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from test_conversation_postgres import postgres_conversation as _postgres_fixture
from test_hybrid_assistant_postgres import request as analytical_request

from courtload.api.app import create_app
from courtload.config import get_settings
from courtload.database import get_db
from courtload.domain.conversation import AnalysisPlan
from courtload.domain.hybrid_assistant import HybridTurnResponse
from courtload.services.assistant.evaluation import score_case
from courtload.services.assistant.hybrid import run_hybrid_turn
from courtload.services.assistant.planner import PlanningOutput

postgres_conversation = _postgres_fixture
CORPUS = Path("tests/fixtures/assistant/pf07d-hybrid-v1.json")
SCORING_HOLDOUT = Path("tests/fixtures/assistant/pf07d-scoring-holdout-v1.json")
CASES = json.loads(CORPUS.read_text())["cases"] + json.loads(SCORING_HOLDOUT.read_text())["cases"]
SOURCE_RECORDS = json.loads(Path("docs/evidence/pf07c-retrieval/sources.json").read_text())


def test_corpus_frozen_and_holdout_separate():
    for path in (CORPUS, SCORING_HOLDOUT):
        assert (
            hashlib.sha256(path.read_bytes()).hexdigest()
            == path.with_suffix(".sha256").read_text().split()[0]
        )
    assert len(CASES) >= 45
    assert sum(case.get("held_out", False) for case in CASES) >= 12
    assert len({c["id"] for c in CASES}) == len(CASES)


def ar03_case(case):
    """Explicit revamp expectations over sealed PF07d regression inputs, not a rescoring
    or rewrite of the original evidence. AR02's final holdout is not involved.
    """
    revised = dict(case)
    if case["id"] == "pf07d-03":
        revised["contains"] = "beyond the arc"
    if case["id"] in {"pf07d-15", "pf07d-42"}:
        revised.update(category="knowledge", contains="role")
    if case["id"] == "pf07d-14":
        revised.update(
            category="clarification",
            status="clarification_required",
            fixture_plan={
                "plan_version": "courtload-analysis-plan-v1",
                "status": "clarification_required",
                "clarification": "defense_metric",
            },
        )
    if case["id"] == "pf07d-18":
        revised.update(category="knowledge", contains="General knowledge, not from CourtLens data")
    if case["id"] in {"pf07d-20", "pf07d-43"}:
        revised["fixture_plan"] = {
            "plan_version": "courtload-analysis-plan-v1",
            "steps": [
                {
                    "step_id": "rank",
                    "operation": "query",
                    "arguments": {
                        "metric_selectors": [{"key": "ast_per_game"}],
                        "sort": [{"field": "ast_per_game"}],
                        "page": {"limit": 10},
                    },
                }
            ],
        }
        if case["id"] == "pf07d-20":
            revised.update(category="local", status="answered")
            revised.pop("reason", None)
        else:
            revised["reason"] = "no_observations"
    if case["id"] == "pf07d-23":
        revised["reason"] = "prohibited_action"
    # AR09 answer-first: position rankings are local. "Last season" has no fixture coverage;
    # the undated shooting-guard ranking answers, labelled, without the fixture's positions.
    if case["id"] == "pf07d-19":
        revised["reason"] = "no_observations"
    if case["id"] == "pf07d-44":
        revised.update(
            category="local",
            status="answered",
            fixture_plan={
                "plan_version": "courtload-analysis-plan-v1",
                "steps": [
                    {
                        "step_id": "rank",
                        "operation": "position_query",
                        "arguments": {
                            "position": "guard",
                            "query": {
                                "metric_selectors": [{"key": "pts_per_game"}],
                                "sort": [{"field": "pts_per_game"}],
                                "page": {"limit": 10},
                            },
                        },
                    }
                ],
            },
        )
        revised.pop("reason", None)
    return revised


@pytest.mark.parametrize("case", CASES, ids=lambda c: c["id"])
def test_hybrid_corpus_durable_http_manual_equivalence(postgres_conversation, case):
    case = ar03_case(case)
    session, context = postgres_conversation
    req = analytical_request(context, case["message"], plan=False)
    manual = None
    clock = lambda: date(2026, 10, 6)  # noqa: E731

    class Planner:
        def plan(self, payload, *, timeout_seconds):
            assert case.get("fixture_plan"), "unexpected provider routing"
            return PlanningOutput(case["fixture_plan"])

    def source(spec, budget):
        # Supporting records are acquired PF07c evidence, used here as fixtures;
        # this test does not claim a fresh network read.
        from courtload.domain.hybrid_assistant import AnswerSource

        return AnswerSource.model_validate(
            next(
                record["source"]
                for record in SOURCE_RECORDS
                if record["registry"]["key"] == spec.key
            )
        )

    with patch("courtload.services.assistant.hybrid.retrieve_source", side_effect=source):
        if case.get("fixture_plan"):
            manual = run_hybrid_turn(
                session,
                req.model_copy(update={"plan": AnalysisPlan.model_validate(case["fixture_plan"])}),
                clock=clock,
            )
        app = create_app()
        app.dependency_overrides[get_db] = lambda: session

        def execute(db, request, **kwargs):
            kwargs.pop("provider", None)
            return run_hybrid_turn(db, request, provider=Planner(), clock=clock, **kwargs)

        with (
            patch("courtload.services.assistant.history.run_hybrid_turn", side_effect=execute),
            TestClient(app) as client,
        ):
            headers = {"X-Operator-Token": get_settings().operator_token.get_secret_value()}
            body = req.model_dump(mode="json")
            response = client.post("/api/workbench/assistant/v2/turn", json=body, headers=headers)
            assert response.status_code == 200, response.text
            answer = HybridTurnResponse.model_validate(response.json())
            score = score_case(case, answer, manual)
            assert score["correct"], score
            assert (
                client.post("/api/workbench/assistant/v2/turn", json=body, headers=headers).json()
                == response.json()
            )
            history = client.get(
                f"/api/workbench/assistant/v2/threads/{answer.thread_id}/turns"
            ).json()
            assert history["turns"][0]["request"]["message"] == case["message"]
            assert history["turns"][0]["response"] == response.json()


@pytest.mark.parametrize("case_id", ["pf07d-30", "pf07d-37", "pf07d-38"])
def test_captured_unrequested_minutes_remain_inequivalent(postgres_conversation, case_id):
    """Prompt repairs must not hide old mistakes by trimming columns or weakening scoring."""
    session, context = postgres_conversation
    case = next(c for c in CASES if c["id"] == case_id)
    req = analytical_request(context, case["message"], plan=False)
    observed = json.loads(Path("docs/evidence/pf07d-quota-policy/real-provider.json").read_text())
    captured_plan = next(c for c in observed["cases"] if c["id"] == case_id)["response"]["plan"]
    # Use this disposable fixture's pinned context, retaining the actual faulty selectors.
    for step in captured_plan["steps"]:
        for key in ("release_id", "season", "phase", "before_date"):
            step["arguments"].pop(key, None)
    captured_plan["context_changes"] = None

    def execute(plan):
        return run_hybrid_turn(
            session,
            req.model_copy(update={"plan": AnalysisPlan.model_validate(plan)}),
            clock=lambda: date(2026, 10, 6),
        )

    answer = execute(captured_plan)
    manual = execute(case["fixture_plan"])
    score = score_case(case, answer, manual)
    assert answer.status == manual.status == "answered"
    assert score["safety_pass"] and score["response_complete"]
    assert not score["manual_equivalent"] and not score["correct"]
    assert score["failures"] == ["canonical manual equivalence failed"]
