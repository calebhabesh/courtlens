"""AG03 durable v3 turns and exact replay against disposable warehouse facts."""

import importlib.util
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from threading import Event
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import inspect, select
from sqlalchemy.orm import Session
from test_agent_tools_postgres import tool_data as _tool_data
from test_conversation_postgres import postgres_conversation as _postgres_fixture
from test_hybrid_assistant_postgres import request as old_request

from courtlens.api.app import create_app
from courtlens.assistant_history_models import (
    AssistantAgentTranscript,
    AssistantTurn,
    AssistantTurnInput,
)
from courtlens.config import Settings, get_settings
from courtlens.database import get_db
from courtlens.domain.assistant_agent import AgentStreamEvent, AgentTurnResponse
from courtlens.domain.conversation import ConversationContext
from courtlens.domain.hybrid_assistant import HybridTurnRequest, HybridTurnResponse
from courtlens.services.assistant import history
from courtlens.services.assistant.agent import loop
from courtlens.services.assistant.agent.providers.base import (
    AgentStep,
    Citation,
    ProviderFailure,
    ToolCall,
    Usage,
)
from courtlens.services.assistant.agent.providers.replay import RecordedStep, ReplayProvider
from courtlens.services.workbench_analytics import canonical_hash

postgres_conversation = _postgres_fixture
tool_data = _tool_data
pytestmark = pytest.mark.postgres
TODAY = date(2026, 10, 7)


class Scripted:
    model = "synthetic-ag03"

    def __init__(self, *steps):
        self.steps = list(steps)
        self.calls = 0
        self.messages = []

    def step(self, prompt, messages, tools, **kwargs):
        self.calls += 1
        self.messages.append(list(messages))
        item = self.steps.pop(0)
        if isinstance(item, Exception):
            raise item
        if callable(item):
            return item(messages)
        return item


@pytest.fixture(autouse=True)
def offline(monkeypatch):
    settings = Settings(_env_file=None, assistant_provider="none")
    monkeypatch.setattr(history, "get_settings", lambda: settings)
    monkeypatch.setattr(loop, "get_settings", lambda: settings)
    monkeypatch.setattr(loop, "civil_today", lambda: TODAY)


def req(context, message, thread=None, **kwargs):
    return HybridTurnRequest(
        request_id=uuid4(),
        thread_id=thread,
        message=message,
        context=ConversationContext(release_id=context.release_id, season="2025-26"),
        **kwargs,
    )


def replay(session, run, request, context):
    provider = ReplayProvider(
        "synthetic-ag03", [RecordedStep.model_validate(s) for s in run.transcript["steps"]]
    )
    repeated = loop.run_turn(
        session, request, provider=provider, today=TODAY, turn_id=run.response.turn_id
    )
    assert provider.exhausted
    assert repeated.response.answer == run.response.answer
    assert repeated.transcript == run.transcript
    # Changed real SQL/tool payloads are rejected by exact replay.
    return repeated


def awards_answer(messages):
    payload = messages[-1].tool_results[0].payload
    source = payload["answer_sources"][0]["source_id"]
    return AgentStep(
        text=payload["fact"]["value"] + " won the MVP award in 2025-26.[^" + source + "]"
    )


def test_owner_mvp_awards_tool_and_exact_replay(tool_data):
    session, context = tool_data
    request = req(context, "Who won MVP last season?", uuid4())
    scripted = Scripted(
        AgentStep(
            tool_calls=[
                ToolCall(
                    id="mvp", name="awards", arguments={"award": "mvp", "season": "last_season"}
                )
            ]
        ),
        awards_answer,
    )
    run = loop.run_turn(session, request, provider=scripted, today=TODAY)
    assert run.response.status == "answered", run.response.model_dump_json()
    assert run.response.sources[0].publisher == "NBA.com"
    assert not run.response.saveable
    assert not run.response.provenance.unsupported_numbers
    replay(session, run, request, context)


def test_owner_best_defender_warehouse_ranking_assumption_and_replay(tool_data):
    session, context = tool_data
    request = req(context, "Who is the best defender in the NBA?", uuid4())
    provider = Scripted(
        AgentStep(
            tool_calls=[
                ToolCall(
                    id="blocks",
                    name="query_stats",
                    arguments={
                        "operation": "query",
                        "arguments": {
                            "metric_selectors": [{"key": "blk_per_game"}],
                            "sort": [{"field": "blk_per_game", "direction": "desc"}],
                            "page": {"limit": 10},
                        },
                        "season": "last_season",
                    },
                )
            ]
        ),
        AgentStep(
            text="Assumption: Best means observed blocks per game.\n"
            "Victor Wembanyama leads the returned sample with 4 blocks per game.[^s1]\n"
            "Follow-up: Compare DRAPM\nFollow-up: Rank by steals"
        ),
    )
    run = loop.run_turn(session, request, provider=provider, today=TODAY)
    assert run.response.status == "answered", run.response.model_dump_json()
    assert run.response.assumption
    assert run.response.results and run.response.saveable
    assert run.response.provenance.bound_numbers == ["4"]
    replay(session, run, request, context)


def web_answer(metric="RAPM"):
    text = "Victor Wembanyama had +8.8 " + metric + " in 2025-26."
    return AgentStep(
        text=text,
        citations=[
            Citation(
                url="https://example.org/synthetic-rapm",
                title="Synthetic test report",
                publisher="example.org",
                retrieved_at=datetime(2026, 10, 7, tzinfo=UTC),
                cited_text=text,
                span=(0, len(text)),
            )
        ],
        usage=Usage(web_searches=1, input_tokens=40, output_tokens=20),
    )


def test_owner_rapm_and_followup_history_survive_restart_and_idempotency(tool_data):
    session, context = tool_data
    first_req = req(context, "What was Victor Wembanyama's RAPM last season?")
    provider = Scripted(web_answer())
    first = history.run_durable_turn(session, first_req, agent_provider=provider)
    assert isinstance(first, AgentTurnResponse), first.model_dump_json()
    assert first.status == "answered"
    assert history.run_durable_turn(session, first_req, agent_provider=Scripted()) == first
    assert provider.calls == 1
    with Session(session.get_bind()) as fresh:
        transcript = fresh.get(AssistantAgentTranscript, str(first.turn_id))
        assert (
            transcript.sha256 == first.transcript.sha256 == canonical_hash(transcript.payload_json)
        )
        assert "api_key" not in str(transcript.payload_json)
        provider = Scripted(web_answer("DRAPM"))
        second = history.run_durable_turn(
            fresh, req(context, "what about his DRAPM?", first.thread_id), agent_provider=provider
        )
        assert second.status == "answered"
        assert "Victor Wembanyama" in provider.messages[0][1].text
        assert len(provider.messages[0]) == 3
        turns = history.list_turns(fresh, first.thread_id).turns
        assert turns[0].response == first and turns[1].response == second
        assert history.history_inventory(fresh)["turns"]


def test_durable_sql_evidence_inputs_and_transcript_publish_together(tool_data):
    session, context = tool_data
    provider = Scripted(
        AgentStep(
            tool_calls=[
                ToolCall(
                    id="stats",
                    name="query_stats",
                    arguments={
                        "operation": "query",
                        "arguments": {
                            "name": "Victor Wembanyama",
                            "metric_selectors": [{"key": "pts_per_game"}],
                        },
                        "season": "2025-26",
                    },
                )
            ]
        ),
        AgentStep(text="Victor Wembanyama averaged 20 points per game.[^s1]"),
    )
    answer = history.run_durable_turn(
        session, req(context, "Show Wembanyama scoring"), agent_provider=provider
    )
    assert isinstance(answer, AgentTurnResponse), answer.model_dump_json()
    assert answer.saveable and answer.actions
    inputs = session.scalars(select(AssistantTurnInput)).all()
    assert len(inputs) == 1
    assert inputs[0].workbench_dataset_id == answer.results[0].context["dataset_id"]
    before = history.history_inventory(session)
    assert before["turns"][0]["sha256"]
    transcript = session.get(AssistantAgentTranscript, str(answer.turn_id))
    transcript.payload_json = {**transcript.payload_json, "model": "tampered"}
    session.commit()
    with pytest.raises(ValueError, match="transcript digest"):
        history.history_inventory(session)


def test_quota_runs_rule_planner_in_limited_mode_with_exact_results(tool_data):
    session, context = tool_data
    answer = history.run_durable_turn(
        session,
        req(context, "Show scoring leaders"),
        agent_provider=Scripted(ProviderFailure("provider_quota", 60)),
    )
    assert isinstance(answer, AgentTurnResponse), answer.model_dump_json()
    assert answer.status == "answered" and answer.mode == "limited"
    assert answer.failure == "provider_quota" and answer.retry_after == 60
    assert answer.results and answer.saveable
    assert answer.accounting.provider_calls == 1


def test_old_v2_turns_still_load_and_enter_v3_history(tool_data):
    session, context = tool_data
    request = old_request(context)
    first = history.run_durable_turn(session, request)
    assert isinstance(first, HybridTurnResponse) and first.status == "answered"
    before = first.model_dump_json()
    provider = Scripted(AgentStep(text="The earlier observations remain pinned to their scope."))
    next_answer = history.run_durable_turn(
        session,
        req(context, "Explain those observations", first.thread_id),
        agent_provider=provider,
    )
    assert isinstance(next_answer, AgentTurnResponse)
    assert (
        history.list_turns(session, first.thread_id).turns[0].response.model_dump_json() == before
    )
    assert "Prior tool summary" in provider.messages[0][1].text


@pytest.mark.parametrize("mutation", ["duplicate", "cancel", "delete", "expire"])
def test_late_agent_publication_is_fenced_and_transcripts_not_orphaned(tool_data, mutation):
    session, context = tool_data
    request = req(context, "Explain RAPM")
    entered, release = Event(), Event()
    provider = Scripted()

    def delayed(*args, **kwargs):
        entered.set()
        assert release.wait(10)
        return AgentStep(text="RAPM adjusts for teammates and opponents.")

    provider.step = delayed

    def execute():
        with Session(session.get_bind()) as fresh:
            try:
                return history.run_durable_turn(fresh, request, agent_provider=provider)
            except HTTPException as exc:
                return exc.status_code

    with ThreadPoolExecutor() as pool:
        task = pool.submit(execute)
        assert entered.wait(10)
        row = session.scalar(
            select(AssistantTurn).where(AssistantTurn.request_id == str(request.request_id))
        )
        from uuid import UUID

        tid, turn = UUID(row.thread_id), UUID(row.id)
        if mutation == "duplicate":
            with pytest.raises(HTTPException) as exc:
                history.run_durable_turn(session, request, agent_provider=provider)
            assert exc.value.status_code == 409
        elif mutation == "cancel":
            history.cancel_turn(session, tid, turn)
        elif mutation == "delete":
            history.delete_history(session, tid)
        else:
            row.lease_until = datetime.now(UTC) - timedelta(seconds=1)
            session.commit()
            history.recover_interrupted(session)
        release.set()
        answer = task.result(timeout=10)
    session.expire_all()
    transcripts = session.scalars(select(AssistantAgentTranscript)).all()
    if mutation == "duplicate":
        assert isinstance(answer, AgentTurnResponse) and len(transcripts) == 1
    else:
        assert not transcripts
        assert (
            answer == 404
            if mutation == "delete"
            else answer.status == ("cancelled" if mutation == "cancel" else "failed")
        )


def test_no_key_api_and_final_sse_replay_are_v3_without_execution(tool_data):
    session, context = tool_data
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    token = {"X-Operator-Token": get_settings().operator_token.get_secret_value()}
    request = req(context, "Show scoring leaders")
    with TestClient(app) as client:
        base = "/api/workbench/assistant/v2"
        answer = client.post(base + "/turn", headers=token, json=request.model_dump(mode="json"))
        assert answer.status_code == 200
        assert answer.json()["schema_version"] == "courtlens-assistant-v3"
        assert answer.json()["mode"] == "limited"
        replay = client.post(
            base + "/turn/stream", headers=token, json=request.model_dump(mode="json")
        )
        assert "event: final" in replay.text
        assert "courtlens-assistant-v3" in replay.text
        assert (
            client.get(base + "/threads/" + answer.json()["thread_id"] + "/turns").json()["turns"][
                0
            ]["response"]
            == answer.json()
        )
        assert client.delete(base + "/threads", headers=token).status_code == 200
        assert not session.scalars(select(AssistantAgentTranscript)).all()


@pytest.mark.parametrize("outcome", ["answer", "repair", "quota"])
def test_live_agent_sse_matches_durable_fallback_history_and_transcript(
    tool_data, monkeypatch, outcome
):
    import json

    session, context = tool_data
    settings = Settings(_env_file=None, assistant_provider="gemini", gemini_api_key="synthetic")
    monkeypatch.setattr(loop, "get_settings", lambda: settings)

    class LiveProvider(Scripted):
        def step(self, prompt, messages, tools, **kwargs):
            if isinstance(self.steps[0], ProviderFailure):
                kwargs["on_delta"]("Interrupted draft")
            result = super().step(prompt, messages, tools, **kwargs)
            if kwargs.get("on_delta") and result.text:
                kwargs["on_delta"](result.text[:5])
                kwargs["on_delta"](result.text[5:])
            return result

    steps = [
        AgentStep(
            text="Looking up the award.",
            tool_calls=[
                ToolCall(
                    id="mvp", name="awards", arguments={"award": "mvp", "season": "last_season"}
                )
            ],
        )
    ]
    if outcome == "repair":
        steps.extend(
            [
                AgentStep(text="The winner averaged 99.9 points."),
                lambda messages: awards_answer([m for m in messages if m.tool_results][-1:]),
            ]
        )
    elif outcome == "quota":
        steps.append(ProviderFailure("provider_quota", 60))
    else:
        steps.append(awards_answer)
    provider = LiveProvider(*steps)
    monkeypatch.setattr(loop, "create_provider", lambda settings: provider)
    app = create_app()
    app.dependency_overrides[get_db] = lambda: session
    token = {"X-Operator-Token": get_settings().operator_token.get_secret_value()}
    request = req(context, "Who won MVP last season?")
    with TestClient(app) as client:
        base = "/api/workbench/assistant/v2"
        response = client.post(
            base + "/turn/stream", headers=token, json=request.model_dump(mode="json")
        )
        assert response.status_code == 200
        events = [
            json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")
        ]
        for event in events:
            AgentStreamEvent.model_validate(event)
        assert events[0]["event"] == "accepted"
        assert events[-1]["event"] == "final"
        assert {"step", "delta", "reset"} <= {e["event"] for e in events}
        assert not any(e["event"] in {"phase", "narrative"} for e in events)
        final = events[-1]["response"]
        assert final["schema_version"] == "courtlens-assistant-v3"
        assert final["provenance"]["repaired"] == (outcome == "repair")
        if outcome == "repair":
            assert "99.9" not in final["answer"]["text"]
            assert not final["provenance"]["unsupported_numbers"]
            assert "won the MVP award" in final["answer"]["text"]
            assert final["accounting"]["steps"] == 3
        if outcome == "quota":
            assert final["mode"] == "limited" and final["failure"] == "provider_quota"
        fallback = client.post(base + "/turn", headers=token, json=request.model_dump(mode="json"))
        assert fallback.json() == final
        retained = client.get(base + "/threads/" + final["thread_id"] + "/turns").json()["turns"][0]
        assert retained["response"] == final
        transcript = session.scalar(select(AssistantAgentTranscript))
        assert transcript is not None
        assert (
            transcript.sha256
            == final["transcript"]["sha256"]
            == canonical_hash(transcript.payload_json)
        )
        assert transcript.payload_json["steps"][0]["deltas"] == ["Looki", "ng up the award."]
        calls = provider.calls
        replay = client.post(
            base + "/turn/stream", headers=token, json=request.model_dump(mode="json")
        )
        names = [line for line in replay.text.splitlines() if line.startswith("event:")]
        assert names == ["event: accepted", "event: final"]
        assert provider.calls == calls


def test_transcript_migration_schema_parity_and_reversible_fixture(tool_data):
    session, _ = tool_data
    session.rollback()
    spec = importlib.util.spec_from_file_location(
        "agent_migration", Path("migrations/versions/08b810a4f006_assistant_agent_transcripts.py")
    )
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with session.get_bind().begin() as connection:
        AssistantAgentTranscript.__table__.drop(connection)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
            assert {
                c["name"] for c in inspect(connection).get_columns("assistant_agent_transcripts")
            } == set(AssistantAgentTranscript.__table__.columns.keys())
            migration.downgrade()
            migration.upgrade()


def test_web_stat_claim_checks_real_warehouse_coverage_when_model_skips_sql(tool_data):
    session, context = tool_data
    text = "Victor Wembanyama averaged 9.9 blocks per game in 2025-26."
    provider = Scripted(
        AgentStep(
            text=text,
            citations=[
                Citation(
                    url="https://example.org/synthetic",
                    title="Synthetic conflicting report",
                    publisher="example.org",
                    retrieved_at=datetime(2026, 10, 7, tzinfo=UTC),
                    span=(0, len(text)),
                )
            ],
            usage=Usage(web_searches=1),
        )
    )
    answer = loop.run_turn(
        session, req(context, "Show Wembanyama blocks"), provider=provider, today=TODAY
    )
    assert answer.response.provenance.warehouse_override_missed == 1
    assert not answer.response.provenance.unsupported_numbers
    assert not answer.response.saveable  # Audit evidence does not become a saved analytical answer.
    audit = answer.transcript["tools"][0]["provenance_coverage_audit"]
    assert audit["data"]["items"][0]["metrics"]["blk_per_game"] == 4
    assert answer.response.trace[-1].tool == "warehouse_coverage_audit"


def test_page_pronoun_lookup_defaults_to_server_identity(tool_data):
    from courtlens.domain.hybrid_assistant import AssistantPageContext

    session, context = tool_data
    selections = ConversationContext(release_id=context.release_id, season="2025-26")
    request = req(
        context,
        "Explain his blocks",
        page_context=AssistantPageContext(
            route="/players/1641705", player_ids=["1641705"], selections=selections
        ),
    )
    provider = Scripted(
        AgentStep(
            tool_calls=[ToolCall(id="lookup", name="lookup_entity", arguments={"query": "his"})]
        ),
        AgentStep(text="Wembanyama protects the rim."),
    )
    outcome = loop.run_turn(session, request, provider=provider, today=TODAY)
    assert (
        outcome.transcript["tools"][0]["result"]["payload"]["candidates"][0]["player_id"]
        == "1641705"
    )
    assert "server_page_referents" in outcome.transcript["steps"][0]["request"]["system_prompt"]


def test_real_tool_payload_mutation_breaks_replay(tool_data):
    from sqlalchemy import select

    from courtlens.workbench_models import WorkbenchPlayerGame

    session, context = tool_data
    request = req(context, "Show Wembanyama points", uuid4())
    call = ToolCall(
        id="stats",
        name="query_stats",
        arguments={
            "operation": "query",
            "arguments": {
                "name": "Victor Wembanyama",
                "metric_selectors": [{"key": "pts_per_game"}],
            },
        },
    )
    first = loop.run_turn(
        session,
        request,
        provider=Scripted(
            AgentStep(tool_calls=[call]),
            AgentStep(text="The returned observations show Wembanyama scoring."),
        ),
        today=TODAY,
    )
    assert first.response.results
    session.rollback()
    with Session(session.get_bind()) as mutate:
        # Test-only temporal mutation control; ordinary warehouse rows remain append-only.
        mutate.info["allow_admin_mutation"] = True
        row = mutate.scalar(
            select(WorkbenchPlayerGame).where(WorkbenchPlayerGame.player_id == "1641705")
        )
        row.points = 999
        row.stats_json = {**row.stats_json, "points": 999}
        mutate.commit()
    with pytest.raises(ValueError, match="drift"):
        replay(session, first, request, context)


def test_limited_followup_keeps_server_rule_plan_across_restart(tool_data):
    session, context = tool_data
    first = history.run_durable_turn(session, req(context, "Show scoring leaders"))
    assert first.mode == "limited" and first.saveable
    with Session(session.get_bind()) as fresh:
        second = history.run_durable_turn(fresh, req(context, "Top 5 instead", first.thread_id))
        assert second.status == "answered" and second.mode == "limited"
        assert second.results[0].result.arguments["page"]["limit"] == 5
        assert second.trace[0].tool == "query_stats"


def test_followup_provider_transcript_replays_with_durable_history(tool_data):
    session, context = tool_data
    first = history.run_durable_turn(
        session,
        req(context, "What was Victor Wembanyama's RAPM last season?"),
        agent_provider=Scripted(web_answer()),
    )
    request = req(context, "what about his DRAPM?", first.thread_id)
    second = history.run_durable_turn(
        session, request, agent_provider=Scripted(web_answer("DRAPM"))
    )
    turns = history.list_turns(session, first.thread_id).turns
    transcript = session.get(AssistantAgentTranscript, str(second.turn_id)).payload_json
    provider = ReplayProvider(
        "synthetic-ag03", [RecordedStep.model_validate(s) for s in transcript["steps"]]
    )
    repeated = loop.run_turn(
        session,
        request,
        provider=provider,
        today=TODAY,
        turn_id=second.turn_id,
        inherited=first.selections,
        history=[turns[0]],
    )
    assert provider.exhausted
    assert repeated.response.answer == second.answer
    assert repeated.transcript == transcript


@pytest.fixture(autouse=True)
def capture_measured_owner_fixtures(request, monkeypatch):
    """Optional AG03 evidence export; never writes sealed paths or contacts a provider."""
    import json
    import os

    root = os.environ.get("COURTLENS_AG03_EVIDENCE_DIR")
    selected = {
        "test_owner_mvp_awards_tool_and_exact_replay": "owner-mvp",
        "test_owner_best_defender_warehouse_ranking_assumption_and_replay": "owner-best-defender",
        "test_owner_rapm_and_followup_history_survive_restart_and_idempotency": "owner-rapm",
        "test_followup_provider_transcript_replays_with_durable_history": "follow-up-drapm",
    }
    if not root or request.node.name not in selected:
        return
    name = selected[request.node.name]
    original = loop.run_turn
    captured = False

    def capture(session, turn_request, **kwargs):
        nonlocal captured
        outcome = original(session, turn_request, **kwargs)
        if not captured and (name != "follow-up-drapm" or "his DRAPM" in turn_request.message):
            directory = Path(root)
            directory.mkdir(parents=True, exist_ok=True)
            payload = {
                "format": "courtlens-ag03-synthetic-fixture-v1",
                "request": turn_request.model_dump(mode="json"),
                "response": outcome.response.model_dump(mode="json"),
                "transcript": outcome.transcript,
                "history": [r.model_dump(mode="json") for r in kwargs.get("history", [])],
            }
            with (directory / (name + ".json")).open("x") as handle:
                json.dump(payload, handle, indent=2, ensure_ascii=False)
                handle.write("\n")
            captured = True
        return outcome

    monkeypatch.setattr(loop, "run_turn", capture)
    monkeypatch.setattr(history, "run_turn", capture)
