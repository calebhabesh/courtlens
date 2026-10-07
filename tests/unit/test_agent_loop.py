"""AG03 exact replay, provenance, budgets and answer-first contracts without live keys."""

from datetime import UTC, date, datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from pydantic import ValidationError
from test_narrative_check import result as numeric_result

from courtload.config import Settings
from courtload.domain.assistant_agent import AgentSource, AgentTurnResponse, StoredTurnRecord
from courtload.domain.conversation import ConversationContext
from courtload.domain.hybrid_assistant import (
    AnswerAction,
    HybridTurnRequest,
    HybridTurnResponse,
    TextBlock,
)
from courtload.services.assistant.agent import loop
from courtload.services.assistant.agent.history import MAX_HISTORY_CHARS, compact_history
from courtload.services.assistant.agent.prompt import build_prompt
from courtload.services.assistant.agent.provenance import check_provenance
from courtload.services.assistant.agent.providers.base import (
    AgentStep,
    Citation,
    ProviderFailure,
    ToolCall,
    ToolResult,
    Usage,
)
from courtload.services.assistant.agent.providers.replay import RecordedStep, ReplayProvider
from courtload.services.assistant.agent.tools import DispatchedTool
from courtload.services.workbench_analytics import canonical_hash

TODAY = date(2026, 10, 7)
SCOPE = ConversationContext(release_id="fixture-release", season="2025-26")


class Scripted:
    model = "synthetic-ag03"

    def __init__(self, *steps):
        self.steps = list(steps)
        self.requests = []

    def step(self, prompt, messages, tools, **kwargs):
        self.requests.append((prompt, messages, tools, kwargs))
        value = self.steps.pop(0)
        if isinstance(value, Exception):
            raise value
        return value


@pytest.fixture
def setup_loop(monkeypatch):
    monkeypatch.setattr(loop, "_selections", lambda *args: (SCOPE, {}))
    return Settings(_env_file=None, assistant_provider="none")


def run(provider, settings, message="What was Victor Wembanyama RAPM last season?", **kwargs):
    return loop.run_turn(
        SimpleNamespace(),
        HybridTurnRequest(request_id=uuid4(), message=message),
        provider=provider,
        settings=settings,
        today=TODAY,
        **kwargs,
    )


def assert_replay(original, request, settings, **kwargs):
    replay = ReplayProvider(
        "synthetic-ag03", [RecordedStep.model_validate(r) for r in original.transcript["steps"]]
    )
    replayed = loop.run_turn(
        SimpleNamespace(),
        request,
        provider=replay,
        settings=settings,
        today=TODAY,
        turn_id=original.response.turn_id,
        **kwargs,
    )
    assert replay.exhausted
    assert replayed.response.answer == original.response.answer
    assert replayed.response.provenance == original.response.provenance
    assert replayed.transcript == original.transcript
    return replayed


class LiveScripted(Scripted):
    def step(self, prompt, messages, tools, **kwargs):
        value = super().step(prompt, messages, tools, **kwargs)
        if kwargs.get("on_delta"):
            kwargs["on_delta"](value.text[:5])
            kwargs["on_delta"](value.text[5:])
        return value


def test_live_repair_resets_before_rewritten_deltas_and_records_them(setup_loop):
    events = []
    provider = LiveScripted(
        AgentStep(text="He averaged 99.9 points."),
        AgentStep(text="The available evidence does not establish that average."),
    )
    result = run(
        provider,
        setup_loop,
        on_step=lambda kind, label: events.append((kind, label)),
        on_delta=lambda text: events.append(("delta", text)),
        on_reset=lambda: events.append(("reset", "")),
    )
    reset = events.index(("reset", ""))
    assert events[1][0] == "writing"
    assert (
        "".join(text for kind, text in events[:reset] if kind == "delta")
        == "He averaged 99.9 points."
    )
    assert (
        "".join(text for kind, text in events[reset:] if kind == "delta")
        == result.response.answer.text
    )
    assert result.response.provenance.repaired
    assert result.transcript["steps"][0]["deltas"] == ["He av", "eraged 99.9 points."]


def test_tool_commentary_is_replaced_before_answer_and_search_is_reported(setup_loop, monkeypatch):
    monkeypatch.setattr(
        loop,
        "dispatch",
        lambda *args, **kwargs: DispatchedTool(
            ToolResult(call_id="help", name="site_help", payload={}), {}
        ),
    )
    events = []
    result = run(
        LiveScripted(
            AgentStep(
                text="I will look up the glossary.",
                tool_calls=[ToolCall(id="help", name="site_help", arguments={})],
            ),
            AgentStep(text="Spacing opens driving lanes.", usage=Usage(web_searches=1)),
        ),
        setup_loop,
        on_step=lambda kind, label: events.append((kind, label)),
        on_delta=lambda text: events.append(("delta", text)),
        on_reset=lambda: events.append(("reset", "")),
    )
    assert ("tool", "Querying CourtLens: site_help") in events
    assert ("search", "Web search completed") in events
    reset = events.index(("reset", ""))
    assert (
        "".join(text for kind, text in events[reset:] if kind == "delta")
        == result.response.answer.text
    )


def test_busy_retry_replaces_failed_live_draft_once(setup_loop):
    class Busy(LiveScripted):
        def step(self, *args, **kwargs):
            if len(self.steps) == 1:
                self.steps.append(self.steps[0])
                kwargs["on_delta"]("Failed draft")
                raise ProviderFailure("provider_busy")
            return super().step(*args, **kwargs)

    events = []
    result = run(
        Busy(AgentStep(text="Spacing opens driving lanes.")),
        setup_loop,
        on_delta=lambda text: events.append(("delta", text)),
        on_reset=lambda: events.append(("reset", "")),
    )
    assert events[:2] == [("delta", "Failed draft"), ("reset", "")]
    assert result.response.accounting.provider_calls == 2
    assert (
        "".join(text for kind, text in events[2:] if kind == "delta") == result.response.answer.text
    )


def test_owner_rapm_native_span_answer_and_exact_replay(setup_loop):
    text = "Victor Wembanyama had +8.8 RAPM in 2025-26."
    provider = Scripted(
        AgentStep(
            text=text,
            citations=[
                Citation(
                    url="https://example.org/rapm",
                    title="Synthetic RAPM report",
                    publisher="example.org",
                    retrieved_at=datetime(2026, 10, 7, tzinfo=UTC),
                    span=(0, len(text)),
                )
            ],
            usage=Usage(input_tokens=100, output_tokens=20, web_searches=1),
        )
    )
    req = HybridTurnRequest(
        request_id=uuid4(),
        thread_id=uuid4(),
        message="What was Victor Wembanyama RAPM last season?",
    )
    original = loop.run_turn(
        SimpleNamespace(), req, provider=provider, settings=setup_loop, today=TODAY
    )
    assert original.response.status == "answered"
    assert "[^s1]" in original.response.answer.text
    assert original.response.provenance.cited_numbers == ["8.8"]
    assert not original.response.provenance.unsupported_numbers
    assert original.response.accounting.web_searches == 1
    assert original.response.accounting.est_cost_usd is None
    assert_replay(original, req, setup_loop)


def test_owner_best_defender_assumption_with_chips(setup_loop):
    provider = Scripted(
        AgentStep(
            text="Assumption: Best means defensive impact.\n"
            "Wembanyama is a strong candidate based on rim protection.\n"
            "Follow-up: Rank by blocks per game\nFollow-up: Compare DRAPM"
        )
    )
    answer = run(provider, setup_loop, "Who is the best defender in the NBA?").response
    assert answer.status == "answered"
    assert answer.assumption == "Best means defensive impact."
    assert answer.follow_ups == ["Rank by blocks per game", "Compare DRAPM"]
    assert "Follow-up:" not in answer.answer.text


def test_tool_error_recovers_then_warehouse_answer_is_bound_and_saveable(setup_loop, monkeypatch):
    result = numeric_result(context={"season": "2025-26"})
    calls = [
        ToolCall(id="bad", name="query_stats", arguments={"season": "1900-01"}),
        ToolCall(id="good", name="query_stats", arguments={"operation": "query"}),
    ]
    error = DispatchedTool(
        ToolResult(
            call_id="bad",
            name="query_stats",
            payload={"error": {"code": "unsupported_scope", "recoverable": True}},
            is_error=True,
        ),
        {},
    )
    good = DispatchedTool(
        ToolResult(call_id="good", name="query_stats", payload={"rows": result.rows}), {}, result
    )
    dispatched = iter([error, good])
    monkeypatch.setattr(loop, "dispatch", lambda *args, **kwargs: next(dispatched))
    provider = Scripted(
        AgentStep(tool_calls=[calls[0]]),
        AgentStep(tool_calls=[calls[1]]),
        AgentStep(text="Jokić averaged 10.74 assists per game.[^s1]"),
    )
    req = HybridTurnRequest(request_id=uuid4(), thread_id=uuid4(), message="Show assists leaders")
    original = loop.run_turn(
        SimpleNamespace(), req, provider=provider, settings=setup_loop, today=TODAY
    )
    answer = original.response
    assert answer.status == "answered" and answer.saveable
    assert answer.provenance.bound_numbers == ["10.74"]
    assert [t.status for t in answer.trace] == ["error", "ok"]
    assert len(answer.results) == 1
    assert original.transcript["tools"][0]["result"]["is_error"]
    dispatched = iter([error, good])
    assert_replay(original, req, setup_loop)


@pytest.mark.parametrize("kind", ["steps", "searches", "tokens"])
def test_limit_stops_with_one_extra_tool_free_step(setup_loop, monkeypatch, kind):
    settings = setup_loop.model_copy(
        update={
            "assistant_max_steps": 1 if kind == "steps" else 6,
            "assistant_max_web_searches": 1 if kind == "searches" else 3,
            "assistant_max_tokens": 1024,
        }
    )
    usage = Usage(
        input_tokens=1024 if kind == "tokens" else 20, web_searches=2 if kind == "searches" else 0
    )
    tool = ToolCall(id="help", name="site_help", arguments={})
    monkeypatch.setattr(
        loop,
        "dispatch",
        lambda *a, **k: DispatchedTool(
            ToolResult(call_id="help", name="site_help", payload={}), {}
        ),
    )
    provider = Scripted(
        AgentStep(tool_calls=[tool], usage=usage), AgentStep(text="Available evidence is limited.")
    )
    answer = run(provider, settings).response
    assert answer.status == "answered"
    assert answer.accounting.stopped_by_limit == kind
    assert "Stopped at the " + kind + " limit." in answer.answer.text
    assert len(provider.requests) == 2
    assert provider.requests[-1][2] == []
    assert provider.requests[-1][3]["remaining_web_searches"] == 0
    if kind == "searches":
        assert answer.accounting.web_search_overshoot == 1


@pytest.mark.parametrize("repaired", [True, False])
def test_unsupported_number_gets_one_repair_then_visible_markers(setup_loop, repaired):
    provider = Scripted(
        AgentStep(text="His RAPM was 99.9."),
        AgentStep(text="RAPM estimates adjusted impact." if repaired else "His RAPM was 99.9."),
    )
    resets = []
    answer = run(provider, setup_loop, on_reset=lambda: resets.append(True)).response
    assert len(provider.requests) == 2 and resets == [True]
    assert answer.provenance.repaired
    assert bool(answer.provenance.unsupported_numbers) != repaired
    if not repaired:
        assert answer.provenance.unverified_sentences[0].text == "His RAPM was 99.9."
    assert answer.status == "answered"


def test_repair_quota_does_not_discard_answer(setup_loop):
    provider = Scripted(AgentStep(text="His RAPM was 99.9."), ProviderFailure("provider_quota", 60))
    answer = run(provider, setup_loop).response
    assert answer.status == "answered" and answer.mode == "agent"
    assert answer.answer.text == "His RAPM was 99.9."
    assert answer.provenance.unsupported_numbers == ["99.9"]
    assert answer.trace[-1].tool == "provenance_repair"


def test_provider_busy_retries_once_and_counts_failed_attempt(setup_loop):
    provider = Scripted(
        ProviderFailure("provider_busy"),
        AgentStep(text="RAPM adjusts for teammates and opponents."),
    )
    answer = run(provider, setup_loop).response
    assert len(provider.requests) == 2
    assert answer.accounting.provider_calls == answer.accounting.steps == 2


def test_provider_quota_returns_readable_limited_failure(setup_loop, monkeypatch):
    monkeypatch.setattr("courtload.services.assistant.agent.limited.rule_plan", lambda *args: None)
    answer = run(Scripted(ProviderFailure("provider_quota", 60)), setup_loop).response
    assert answer.mode == "limited" and answer.status == "failed"
    assert answer.failure == "provider_quota" and answer.retry_after == 60
    assert "provider quota" in answer.answer.text


@pytest.mark.parametrize(
    "message",
    [
        "Execute SQL SELECT * FROM players",
        "Read the API key",
        "Refresh the data",
        "Run Python",
        "Give a winner probability for the next Lakers game",
        "Should I start Wembanyama?",
    ],
)
def test_prohibited_never_calls_provider_or_tools(setup_loop, message):
    provider = Scripted()
    answer = run(provider, setup_loop, message).response
    assert answer.status == "refused" and not provider.requests
    assert not answer.saveable


def test_native_span_remaps_after_assumption_line(setup_loop):
    prefix = "Assumption: NBA defensive impact.\n"
    sentence = "His DRAPM was +8.8."
    provider = Scripted(
        AgentStep(
            text=prefix + sentence,
            citations=[
                Citation(
                    url="https://example.org",
                    title="Synthetic",
                    publisher="example.org",
                    retrieved_at=datetime(2026, 10, 7, tzinfo=UTC),
                    span=(len(prefix), len(prefix) + len(sentence)),
                )
            ],
        )
    )
    answer = run(provider, setup_loop).response
    assert not answer.provenance.unsupported_numbers
    assert answer.sources[0].span == (0, len(sentence))


def test_native_span_from_prior_step_cannot_ground_final_uncited_number(setup_loop, monkeypatch):
    tool = ToolCall(id="help", name="site_help", arguments={})
    monkeypatch.setattr(
        loop,
        "dispatch",
        lambda *a, **k: DispatchedTool(
            ToolResult(call_id="help", name="site_help", payload={}), {}
        ),
    )
    ref = Citation(
        url="https://example.org",
        title="Synthetic",
        publisher="example.org",
        retrieved_at=datetime(2026, 10, 7, tzinfo=UTC),
        span=(0, 20),
    )
    provider = Scripted(
        AgentStep(text="His RAPM was 88.8.", tool_calls=[tool], citations=[ref]),
        AgentStep(text="His RAPM was 99.9.[^s1]"),
        AgentStep(text="His RAPM was 99.9.[^s1]"),
    )
    answer = run(provider, setup_loop).response
    assert answer.provenance.unsupported_numbers == ["99.9"]


@pytest.mark.parametrize(
    "text,unsupported",
    [
        ("Jokić averaged 10.7 assists and shot 58.3%.", False),
        ("The difference was 0.6 assists.", False),
        ("He averaged -10.74 assists.", True),
        ("He averaged 99.9 assists.", True),
        ("In 2025-26 on 2026-10-07 he ranked 2nd.", False),
        ("He had ninety assists.", True),
        ("He had 9.2 billion dollars.", True),
    ],
)
def test_numeric_binding_rounding_arithmetic_and_metadata(text, unsupported):
    report = check_provenance(text, [numeric_result()], [])
    assert bool(report.unsupported_numbers) == unsupported


def test_snippet_citation_is_required_in_the_numeric_sentence():
    source = AgentSource(
        source_id="s1",
        origin="web",
        title="Synthetic",
        publisher="example.org",
        url="https://example.org",
        excerpt="RAPM +8.8",
    )
    assert not check_provenance("His RAPM was +8.8.[^s1]", [], [source]).unsupported_numbers
    assert check_provenance(
        "His RAPM was +8.8. Another sentence.[^s1]", [], [source]
    ).unsupported_numbers
    assert check_provenance("His RAPM was +9.9.[^s1]", [], [source]).unsupported_numbers


def test_contract_rejects_unbound_markers_actions_and_saveable(setup_loop):
    answer = run(Scripted(AgentStep(text="RAPM adjusts for lineup context.")), setup_loop).response
    changes = [
        {"answer": {"text": "Claim.[^s99]"}},
        {"saveable": True},
        {
            "actions": [
                AnswerAction(
                    kind="executed_operation", label="Open", url="/stats", operation_hash="a" * 64
                ).model_dump()
            ]
        },
    ]
    for change in changes:
        with pytest.raises(ValidationError):
            AgentTurnResponse.model_validate({**answer.model_dump(), **change})


@pytest.mark.parametrize(
    "url",
    [
        "http://example.org",
        "https://user:pass@example.org",
        "//example.org",
        "https://example.org/\nsecret",
    ],
)
def test_source_urls_reject_unsafe_links(url):
    with pytest.raises(ValidationError):
        AgentSource(source_id="s1", origin="web", title="Test", publisher="example.org", url=url)


def stored(request, response):
    return StoredTurnRecord(
        thread_id=response.thread_id,
        turn_id=response.turn_id,
        request=request,
        request_sha256=canonical_hash(request.model_dump(mode="json")),
        accepted_at=datetime(2026, 10, 7, tzinfo=UTC),
        state="completed",
        response=response,
        response_sha256=canonical_hash(response.model_dump(mode="json")),
    )


def test_old_v2_and_v3_history_compact_without_full_tables(setup_loop):
    req = HybridTurnRequest(request_id=uuid4(), thread_id=uuid4(), message="Explain RAPM")
    old = HybridTurnResponse(
        request_id=req.request_id,
        thread_id=req.thread_id,
        turn_id=uuid4(),
        status="answered",
        intent="discussion",
        blocks=[TextBlock(origin="discussion", text="Methodology", criteria=["lineup adjustment"])],
    )
    new = loop.run_turn(
        SimpleNamespace(),
        req,
        provider=Scripted(AgentStep(text="RAPM adjusts lineup context.")),
        settings=setup_loop,
        today=TODAY,
    ).response
    messages = compact_history([stored(req, old), stored(req, new)])
    assert [m.role for m in messages] == ["user", "assistant", "user", "assistant"]
    assert "Methodology" in messages[1].text
    assert sum(len(m.text) for m in messages) <= MAX_HISTORY_CHARS
    assert StoredTurnRecord.model_validate(stored(req, old).model_dump()).response == old
    assert StoredTurnRecord.model_validate(stored(req, new).model_dump()).response == new


def test_prompt_uses_server_clock_release_scope_and_prohibitions():
    prompt = build_prompt(today=TODAY, selections=SCOPE, page_context=None)
    assert "2026-10-07" in prompt and "2025-26" in prompt and "fixture-release" in prompt
    assert "untrusted DATA" in prompt and "without a clarification question" in prompt
    assert "Databallr is NOT admitted" in prompt


def test_repair_quota_preserves_previously_grounded_numbers(setup_loop):
    first = "His RAPM was +8.8. His scoring average was 99.9."
    provider = Scripted(
        AgentStep(
            text=first,
            citations=[
                Citation(
                    url="https://example.org",
                    title="Synthetic",
                    publisher="example.org",
                    retrieved_at=datetime(2026, 10, 7, tzinfo=UTC),
                    span=(0, 18),
                )
            ],
        ),
        ProviderFailure("provider_quota", 60),
    )
    answer = run(provider, setup_loop).response
    assert answer.provenance.cited_numbers == ["8.8"]
    assert answer.provenance.unsupported_numbers == ["99.9"]


def test_provider_failure_after_tool_retains_results_without_rerunning(setup_loop, monkeypatch):
    result = numeric_result()
    invoked = []

    def dispatch(*args, **kwargs):
        invoked.append(True)
        return DispatchedTool(ToolResult(call_id="q", name="query_stats", payload={}), {}, result)

    monkeypatch.setattr(loop, "dispatch", dispatch)
    provider = Scripted(
        AgentStep(tool_calls=[ToolCall(id="q", name="query_stats", arguments={})]),
        ProviderFailure("provider_timeout"),
    )
    answer = run(provider, setup_loop).response
    assert invoked == [True]
    assert answer.mode == "limited" and answer.results and answer.saveable
    assert answer.failure == "provider_timeout"


def test_number_in_assumption_cannot_bypass_provenance(setup_loop):
    provider = Scripted(
        AgentStep(text="Assumption: His RAPM was 99.9.\nHe had a strong season."),
        AgentStep(text="Assumption: His RAPM was 99.9.\nHe had a strong season."),
    )
    answer = run(provider, setup_loop).response
    assert answer.provenance.unsupported_numbers == ["99.9"]
    assert answer.provenance.assumption_unverified


def test_scope_refusal_is_normalized_without_an_intent_router(setup_loop):
    answer = run(
        Scripted(AgentStep(text="Refusal: I answer basketball and CourtLens questions.")),
        setup_loop,
        "Explain organic chemistry",
    ).response
    assert answer.status == "refused"


def test_adapter_that_ignores_timeout_is_supervised_and_late_work_cannot_stream(
    setup_loop, monkeypatch
):
    from threading import Event
    from time import monotonic

    release, finished = Event(), Event()
    deltas = []

    class Stuck:
        model = "synthetic-stuck"

        def step(self, *args, on_delta=None, **kwargs):
            try:
                assert release.wait(3)
                if on_delta:
                    on_delta("late text")
                return AgentStep(text="Late answer")
            finally:
                finished.set()

    monkeypatch.setattr("courtload.services.assistant.agent.limited.rule_plan", lambda *args: None)
    start = monotonic()
    try:
        outcome = run(
            Stuck(),
            setup_loop.model_copy(update={"assistant_turn_timeout_seconds": 1}),
            on_delta=deltas.append,
        )
        assert monotonic() - start < 2
        assert outcome.response.failure == "provider_timeout"
        assert outcome.transcript["steps"][0]["failure"] == "provider_timeout"
    finally:
        release.set()
        assert finished.wait(2)
    assert deltas == []


def test_changed_tool_payload_is_replay_drift_not_a_fallback(setup_loop, monkeypatch):
    tool = ToolCall(id="help", name="site_help", arguments={})

    def dispatch(*args, **kwargs):
        return DispatchedTool(
            ToolResult(call_id="help", name="site_help", payload={"version": "original"}), {}
        )

    monkeypatch.setattr(loop, "dispatch", dispatch)
    request = HybridTurnRequest(request_id=uuid4(), thread_id=uuid4(), message="Explain CourtLens")
    outcome = loop.run_turn(
        SimpleNamespace(),
        request,
        provider=Scripted(
            AgentStep(tool_calls=[tool]), AgentStep(text="CourtLens shows retained NBA evidence.")
        ),
        settings=setup_loop,
        today=TODAY,
    )
    monkeypatch.setattr(
        loop,
        "dispatch",
        lambda *args, **kwargs: DispatchedTool(
            ToolResult(call_id="help", name="site_help", payload={"version": "changed"}), {}
        ),
    )
    with pytest.raises(ValueError, match="drift"):
        assert_replay(outcome, request, setup_loop)


def test_signed_same_metric_difference_and_extreme_number_handling():
    assert not check_provenance(
        "The difference was -0.6 assists.", [numeric_result()], []
    ).unsupported_numbers
    assert check_provenance("His RAPM was " + "9" * 80 + ".", [], []).unsupported_numbers


def test_web_source_for_covered_value_is_flagged_even_when_it_matches_a_cell():
    source = AgentSource(
        source_id="s1",
        origin="web",
        title="Synthetic",
        publisher="example.org",
        url="https://example.org",
    )
    text = "Nikola Jokić averaged 10.74 assists per game in 2025-26.[^s1]"
    report = check_provenance(text, [numeric_result(context={"season": "2025-26"})], [source])
    assert report.bound_numbers == ["10.74"]
    assert report.warehouse_override_missed == 1
    report = check_provenance(text, [numeric_result(context={"season": "2024-25"})], [source])
    assert report.warehouse_override_missed == 0
    playoff_text = text.replace("in 2025-26", "in the 2025-26 playoffs")
    report = check_provenance(
        playoff_text,
        [numeric_result(context={"season": "2025-26", "phase": "regular_season"})],
        [source],
    )
    assert report.warehouse_override_missed == 0


def test_loaded_agent_transcript_detects_audit_drift_after_last_model_step(
    setup_loop, monkeypatch, tmp_path
):
    import json

    text = "Victor Wembanyama averaged 9.9 blocks per game in 2025-26."
    provider = Scripted(
        AgentStep(
            text=text,
            citations=[
                Citation(
                    url="https://example.org",
                    title="Synthetic",
                    publisher="example.org",
                    retrieved_at=datetime(2026, 10, 7, tzinfo=UTC),
                    span=(0, len(text)),
                )
            ],
        )
    )
    audit = DispatchedTool(
        ToolResult(call_id="coverage", name="query_stats", payload={"value": 4}), {"value": 4}
    )
    monkeypatch.setattr(loop, "audit_warehouse_coverage", lambda *a, **k: (1, [audit]))
    request = HybridTurnRequest(request_id=uuid4(), thread_id=uuid4(), message="Show blocks")
    original = loop.run_turn(
        SimpleNamespace(), request, provider=provider, settings=setup_loop, today=TODAY
    )
    path = tmp_path / "transcript.json"
    path.write_text(json.dumps(original.transcript))
    replay = ReplayProvider.load(path)
    repeated = loop.run_turn(
        SimpleNamespace(), request, provider=replay, settings=setup_loop, today=TODAY
    )
    assert replay.exhausted and repeated.transcript == original.transcript
    drift = DispatchedTool(
        ToolResult(call_id="coverage", name="query_stats", payload={"value": 5}), {"value": 5}
    )
    monkeypatch.setattr(loop, "audit_warehouse_coverage", lambda *a, **k: (1, [drift]))
    with pytest.raises(ValueError, match="audit payload drift"):
        loop.run_turn(
            SimpleNamespace(),
            request,
            provider=ReplayProvider.load(path),
            settings=setup_loop,
            today=TODAY,
        )
