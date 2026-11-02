"""Groq adapter, provider pool failover and quota ledger, all offline.

Groq responses go through the official OpenAI SDK with a mock HTTP transport. Fixture values
are synthetic, not evidence of any provider's live behavior or quota.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from openai import OpenAI

from courtlens.config import Settings
from courtlens.services.assistant.agent.providers import create_provider
from courtlens.services.assistant.agent.providers.base import (
    AgentMessage,
    AgentStep,
    DeltaCallback,
    ProviderFailure,
    ToolCall,
    ToolDeclaration,
    ToolResult,
    Usage,
    map_failure,
)
from courtlens.services.assistant.agent.providers.groq import (
    GroqProvider,
    compact_prompt,
    slim_schema,
)
from courtlens.services.assistant.agent.providers.pool import (
    Limits,
    PooledProvider,
    PoolMember,
    QuotaLedger,
    _duration,
    _next_pacific_midnight,
)
from courtlens.services.assistant.status import get_assistant_status

TOOL = ToolDeclaration(
    name="warehouse_query",
    description="Read a metric.",
    parameters={
        "type": "object",
        "title": "WarehouseQuery",
        "properties": {
            "metric": {"type": "string", "description": "Metric key."},
            "season": {"anyOf": [{"type": "string"}, {"type": "null"}], "default": None},
        },
        "required": ["metric"],
        "additionalProperties": False,
    },
)
MESSAGES = [AgentMessage(role="user", text="Compare Wembanyama's RAPM and blocks.")]
OPTIONS = {"timeout_seconds": 30, "max_output_tokens": 4096, "remaining_web_searches": 2}
PROMPT = "courtlens-agent-prompt-v2\nPolicy line.\nGlossary: [1]\nSite map: [2]"
HEADERS = {
    "x-ratelimit-limit-requests": "1000",
    "x-ratelimit-limit-tokens": "8000",
    "x-ratelimit-remaining-requests": "998",
    "x-ratelimit-remaining-tokens": "6000",
    "x-ratelimit-reset-requests": "1m26.4s",
    "x-ratelimit-reset-tokens": "15s",
}


@pytest.fixture(autouse=True)
def isolated_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "COURTLENS_ASSISTANT_PROVIDER",
        "COURTLENS_ASSISTANT_PROVIDERS",
        "COURTLENS_ASSISTANT_MODEL",
        "COURTLENS_GEMINI_MODEL",
        "COURTLENS_GROQ_MODEL",
        "GEMINI_MODEL",
        "GROQ_MODEL",
        "COURTLENS_GEMINI_API_KEY",
        "GEMINI_API_KEY",
        "COURTLENS_GROQ_API_KEY",
        "GROQ_API_KEY",
        "COURTLENS_ANTHROPIC_API_KEY",
        "ANTHROPIC_API_KEY",
        "COURTLENS_OPENAI_API_KEY",
        "OPENAI_API_KEY",
    ):
        monkeypatch.delenv(key, raising=False)


def groq(transport: httpx.MockTransport, model: str = "openai/gpt-oss-120b") -> GroqProvider:
    sdk = OpenAI(
        api_key="test-secret",
        base_url="https://api.groq.com/openai/v1",
        http_client=httpx.Client(transport=transport),
        max_retries=0,
    )
    return GroqProvider("test-secret", model, client=sdk)


def completion(message: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": "chatcmpl-1",
        "object": "chat.completion",
        "created": 1,
        "model": "openai/gpt-oss-120b",
        "choices": [{"index": 0, "finish_reason": "tool_calls", "message": message}],
        "usage": {"prompt_tokens": 900, "completion_tokens": 40, "total_tokens": 940},
    }


TOOL_MESSAGE = {
    "role": "assistant",
    "content": None,
    "reasoning": "private chain of thought",
    "tool_calls": [
        {
            "id": "call_1",
            "type": "function",
            "function": {"name": "warehouse_query", "arguments": '{"metric": "blk_per_game"}'},
        }
    ],
}


def test_groq_compacts_request_parses_tools_and_reads_rate_headers() -> None:
    requests: list[dict[str, Any]] = []

    def respond(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "api.groq.com"
        requests.append(json.loads(request.content))
        return httpx.Response(200, json=completion(TOOL_MESSAGE), headers=HEADERS)

    provider = groq(httpx.MockTransport(respond))
    step = provider.step(PROMPT, MESSAGES, [TOOL], **OPTIONS)
    body = requests[0]
    system = body["messages"][0]["content"]
    assert "Glossary:" not in system and "Site map:" not in system
    assert "list_metrics" in system and system.startswith("courtlens-agent-prompt-v2")
    assert body["max_completion_tokens"] == 2048 and body["reasoning_effort"] == "low"
    params = body["tools"][0]["function"]["parameters"]
    assert "title" not in params and "additionalProperties" not in params
    assert params["properties"]["season"] == {"type": "string"}
    assert "web_search" not in json.dumps(body)
    assert step.tool_calls == [
        ToolCall(id="call_1", name="warehouse_query", arguments={"metric": "blk_per_game"})
    ]
    assert step.usage == Usage(input_tokens=900, output_tokens=40)
    assert provider.last_rate_limits["x-ratelimit-remaining-tokens"] == "6000"
    # Reasoning text is never resent as history.
    assert "reasoning" not in json.dumps(step.native_content)

    continuation = [
        *MESSAGES,
        step.as_message(),
        AgentMessage(
            role="tool",
            tool_results=[ToolResult(call_id="call_1", name=TOOL.name, payload={"value": 3.8})],
        ),
    ]
    provider.step(PROMPT, continuation, [], **OPTIONS)
    sent = requests[1]["messages"]
    assert sent[2]["tool_calls"][0]["id"] == "call_1"
    assert sent[3] == {"role": "tool", "tool_call_id": "call_1", "content": '{"value":3.8}'}
    assert "tools" not in requests[1]


def test_groq_truncates_large_tool_payloads_and_estimates_tokens() -> None:
    provider = groq(httpx.MockTransport(lambda request: httpx.Response(500)))
    big = AgentMessage(
        role="tool",
        tool_results=[ToolResult(call_id="c", name="t", payload={"rows": ["x" * 50] * 1000})],
    )
    body = provider.request(PROMPT, [*MESSAGES, big], [TOOL], 100)
    assert len(body["messages"][-1]["content"]) < 6100
    assert body["messages"][-1]["content"].endswith("narrow the query if needed)")
    assert 600 < provider.estimate_tokens(PROMPT, MESSAGES, [TOOL]) < 1000


def test_groq_streams_text_and_tool_call_fragments() -> None:
    chunks = [
        {"choices": [{"index": 0, "delta": {"role": "assistant", "content": "Wemby "}}]},
        {"choices": [{"index": 0, "delta": {"content": "leads."}}]},
        {
            "choices": [
                {
                    "index": 0,
                    "delta": {
                        "tool_calls": [
                            {
                                "index": 0,
                                "id": "call_9",
                                "type": "function",
                                "function": {"name": "warehouse_", "arguments": '{"met'},
                            }
                        ]
                    },
                }
            ]
        },
        {
            "choices": [
                {
                    "index": 0,
                    "delta": {
                        "tool_calls": [
                            {"index": 0, "function": {"name": "query", "arguments": 'ric": "bpm"}'}}
                        ]
                    },
                    "finish_reason": "tool_calls",
                }
            ]
        },
        {"choices": [], "usage": {"prompt_tokens": 50, "completion_tokens": 7}},
    ]
    sse = "".join(
        "data: "
        + json.dumps(
            {"id": "c", "object": "chat.completion.chunk", "created": 1, "model": "m", **c}
        )
        + "\n\n"
        for c in chunks
    )
    seen: list[dict[str, Any]] = []

    def respond(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(
            200,
            content=(sse + "data: [DONE]\n\n").encode(),
            headers={"content-type": "text/event-stream", **HEADERS},
        )

    deltas: list[str] = []
    step = groq(httpx.MockTransport(respond)).step(
        PROMPT, MESSAGES, [TOOL], **OPTIONS, on_delta=deltas.append
    )
    assert seen[0]["stream"] is True and seen[0]["stream_options"] == {"include_usage": True}
    assert deltas == ["Wemby ", "leads."] and step.text == "Wemby leads."
    assert step.tool_calls[0] == ToolCall(
        id="call_9", name="warehouse_query", arguments={"metric": "bpm"}
    )
    assert step.usage.input_tokens == 50 and step.usage.output_tokens == 7


@pytest.mark.parametrize(
    ("status", "body", "headers", "kind", "scope"),
    [
        (
            429,
            {"error": {"message": "slow down", "type": "requests", "code": "rate_limit_exceeded"}},
            {"retry-after": "7"},
            "provider_quota",
            "minute",
        ),
        (
            413,
            {
                "error": {
                    "message": "Request too large",
                    "type": "tokens",
                    "code": "rate_limit_exceeded",
                }
            },
            {},
            "provider_quota",
            "request_too_large",
        ),
        (413, {"error": {"message": "payload", "code": "other"}}, {}, "provider_error", None),
        (503, {"error": {"message": "over capacity"}}, {}, "provider_busy", None),
    ],
)
def test_groq_failures_map_without_bodies(
    status: int, body: dict[str, Any], headers: dict[str, str], kind: str, scope: str | None
) -> None:
    provider = groq(
        httpx.MockTransport(lambda request: httpx.Response(status, json=body, headers=headers))
    )
    with pytest.raises(ProviderFailure) as raised:
        provider.step(PROMPT, MESSAGES, [TOOL], **OPTIONS)
    assert raised.value.kind == kind and raised.value.quota_scope == scope
    assert "slow down" not in str(raised.value) and "test-secret" not in str(raised.value)
    if status == 429:
        assert raised.value.retry_after == 7


class GoogleQuotaError(Exception):
    def __init__(self, details: dict[str, Any]) -> None:
        super().__init__("429 RESOURCE_EXHAUSTED secret request text")
        self.code = 429
        self.details = details
        self.response = None


def google_body(quota_id: str, value: str, delay: str) -> dict[str, Any]:
    return {
        "error": {
            "code": 429,
            "status": "RESOURCE_EXHAUSTED",
            "details": [
                {
                    "@type": "type.googleapis.com/google.rpc.QuotaFailure",
                    "violations": [
                        {
                            "quotaMetric": "generativelanguage.googleapis.com/generate_requests",
                            "quotaId": quota_id,
                            "quotaValue": value,
                        }
                    ],
                },
                {"@type": "type.googleapis.com/google.rpc.RetryInfo", "retryDelay": delay},
            ],
        }
    }


def test_google_quota_details_set_retry_scope_and_metric() -> None:
    minute = map_failure(
        GoogleQuotaError(
            google_body("GenerateRequestsPerMinutePerProjectPerModel-FreeTier", "15", "12.4s")
        )
    )
    assert minute.kind == "provider_quota" and minute.retry_after == 13
    assert minute.quota_scope == "minute" and minute.quota_limit == 15
    assert minute.quota_id == "GenerateRequestsPerMinutePerProjectPerModel-FreeTier"
    day = map_failure(
        GoogleQuotaError(
            google_body("GenerateRequestsPerDayPerProjectPerModel-FreeTier", "1000", "30s")
        )
    )
    assert day.quota_scope == "day" and day.quota_limit == 1000
    bare = map_failure(GoogleQuotaError({"error": {"code": 429}}))
    assert bare.retry_after == 60 and bare.quota_id is None


class FakeProvider:
    def __init__(
        self,
        model: str,
        outcomes: Sequence[AgentStep | ProviderFailure],
        deltas: Sequence[str] = (),
    ) -> None:
        self.model = model
        self.outcomes = list(outcomes)
        self.deltas = list(deltas)
        self.calls: list[list[AgentMessage]] = []

    def step(
        self,
        system_prompt: str,
        messages: Sequence[AgentMessage],
        tools: Sequence[ToolDeclaration],
        *,
        timeout_seconds: float,
        max_output_tokens: int,
        remaining_web_searches: int,
        on_delta: DeltaCallback | None = None,
    ) -> AgentStep:
        self.calls.append(list(messages))
        for text in self.deltas:
            if on_delta:
                on_delta(text)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, ProviderFailure):
            raise outcome
        return outcome


def answer(text: str, native: list[dict[str, Any]] | None = None, **extra: Any) -> AgentStep:
    return AgentStep(
        text=text,
        native_content=native or [],
        usage=Usage(input_tokens=100, output_tokens=10),
        **extra,
    )


def pool(*members: tuple[str, FakeProvider], ledger: QuotaLedger | None = None) -> PooledProvider:
    return PooledProvider(
        [PoolMember(name, provider, Limits()) for name, provider in members],
        ledger=ledger or QuotaLedger(),
    )


def test_pool_fails_over_on_quota_and_remembers_cooldown() -> None:
    ledger = QuotaLedger()
    gemini = FakeProvider(
        "gemini-x",
        [
            ProviderFailure(
                "provider_quota", 30, quota_scope="minute", quota_id="RPM", quota_limit=15
            )
        ],
    )
    groq_fake = FakeProvider("groq-x", [answer("from groq"), answer("again groq")])
    first = pool(("gemini", gemini), ("groq", groq_fake), ledger=ledger)
    step = first.step("p", MESSAGES, [TOOL], **OPTIONS)
    assert step.text == "from groq"
    assert first.provider_name == "groq" and first.model == "groq-x"
    assert [a["failure"] for a in first.attempts] == ["provider_quota", None]
    # The next turn skips the cooling member without spending a request.
    second = pool(("gemini", gemini), ("groq", groq_fake), ledger=ledger)
    assert second.step("p", MESSAGES, [TOOL], **OPTIONS).text == "again groq"
    assert len(gemini.calls) == 1
    snapshot = ledger.snapshot("gemini", "gemini-x")
    assert snapshot["state"] == "cooling_down" and snapshot["available_at"]
    assert snapshot["last_quota"]["quota_id"] == "RPM" and snapshot["last_quota"]["limit"] == 15


def test_pool_raises_retry_when_every_member_is_cooling() -> None:
    ledger = QuotaLedger()
    a = FakeProvider("a", [ProviderFailure("provider_quota", 120)])
    b = FakeProvider("b", [ProviderFailure("provider_quota", 300)])
    with pytest.raises(ProviderFailure) as raised:
        pool(("gemini", a), ("groq", b), ledger=ledger).step("p", MESSAGES, [], **OPTIONS)
    assert raised.value.kind == "provider_quota"
    with pytest.raises(ProviderFailure) as again:
        pool(("gemini", a), ("groq", b), ledger=ledger).step("p", MESSAGES, [], **OPTIONS)
    # No member was called; the soonest member's remaining cooldown is reported.
    assert again.value.kind == "provider_quota" and 100 <= (again.value.retry_after or 0) <= 120
    assert len(a.calls) == len(b.calls) == 1


def test_pool_never_fails_over_after_streamed_text_or_on_timeout() -> None:
    a = FakeProvider("a", [ProviderFailure("provider_busy")], deltas=["partial"])
    b = FakeProvider("b", [answer("never")])
    with pytest.raises(ProviderFailure, match="provider_busy"):
        pool(("gemini", a), ("groq", b)).step("p", MESSAGES, [], **OPTIONS, on_delta=lambda _: None)
    c = FakeProvider("c", [ProviderFailure("provider_timeout")])
    with pytest.raises(ProviderFailure, match="provider_timeout"):
        pool(("gemini", c), ("groq", b)).step("p", MESSAGES, [], **OPTIONS)
    assert not b.calls


def test_pool_flattens_foreign_tool_history_after_failover() -> None:
    signed = [{"function_call": {"name": "warehouse_query"}, "thought_signature": "c2ln"}]
    first = answer(
        "",
        signed,
        tool_calls=[ToolCall(id="g1", name="warehouse_query", arguments={"metric": "bpm"})],
    )
    gemini = FakeProvider("gemini-x", [first, ProviderFailure("provider_quota", 60)])
    groq_fake = FakeProvider("groq-x", [answer("final", [{"groq_message": {"role": "assistant"}}])])
    turn = pool(("gemini", gemini), ("groq", groq_fake))
    messages = [*MESSAGES]
    step = turn.step("p", messages, [TOOL], **OPTIONS)
    messages.extend(
        [
            *step.as_messages(),
            AgentMessage(
                role="tool",
                tool_results=[ToolResult(call_id="g1", name="warehouse_query", payload={"v": 2})],
            ),
        ]
    )
    # Gemini is rate-limited on the second step, so Groq takes it over.
    assert turn.step("p", messages, [TOOL], **OPTIONS).text == "final"
    assert gemini.calls[1][1].native_content == signed
    sent = groq_fake.calls[0]
    assert [m.role for m in sent] == ["user", "assistant", "user"]
    assert not sent[1].native_content and not sent[1].tool_calls
    assert 'warehouse_query({"metric": "bpm"})' in sent[1].text
    assert '"v": 2' in sent[2].text


def test_single_member_pool_passes_history_unchanged() -> None:
    message = AgentMessage(role="assistant", tool_calls=[ToolCall(id="x", name="t", arguments={})])
    only = FakeProvider("a", [answer("ok")])
    pool(("openai", only)).step("p", [*MESSAGES, message], [], **OPTIONS)
    assert only.calls[0][1] is message or only.calls[0][1] == message


def test_ledger_header_bucket_too_large_and_local_limits() -> None:
    ledger = QuotaLedger()
    ledger.record_success("groq", "m", 2000, HEADERS, now=100.0)
    # 6000 tokens remain and refill at 8000/minute.
    assert ledger.wait_seconds("groq", "m", Limits(), 5000, now=100.0) == 0
    assert ledger.wait_seconds("groq", "m", Limits(), 7000, now=100.0) == pytest.approx(7.5)
    assert ledger.wait_seconds("groq", "m", Limits(), 9000, now=100.0) is None
    ledger.record_failure(
        "groq", "m", ProviderFailure("provider_quota", 60, quota_scope="request_too_large"), 6500
    )
    assert ledger.wait_seconds("groq", "m", Limits(), 6600, now=200.0) is None
    assert ledger.wait_seconds("groq", "m", Limits(), 5000, now=200.0) == 0

    limits = Limits(requests_per_minute=2, tokens_per_minute=1000)
    ledger.record_success("gemini", "g", 300, now=10.0)
    ledger.record_success("gemini", "g", 300, now=20.0)
    assert ledger.wait_seconds("gemini", "g", limits, 100, now=30.0) == pytest.approx(40.0)
    assert ledger.wait_seconds("gemini", "g", limits, 5000, now=30.0) is None
    assert ledger.wait_seconds("gemini", "g", limits, 100, now=81.0) == 0


def test_daily_gemini_quota_cools_until_pacific_midnight() -> None:
    ledger = QuotaLedger()
    ledger.wait_seconds("gemini", "g", Limits(daily_reset_pacific=True), 10)
    ledger.record_failure(
        "gemini", "g", ProviderFailure("provider_quota", 30, quota_scope="day"), 10
    )
    snapshot = ledger.snapshot("gemini", "g")
    midnight = _next_pacific_midnight(datetime.now(UTC))
    available = datetime.fromisoformat(snapshot["available_at"])
    assert abs((available - midnight).total_seconds()) < 5


def test_duration_parser() -> None:
    assert _duration("1m26.4s") == pytest.approx(86.4)
    assert _duration("667ms") == pytest.approx(0.667)
    assert _duration("2h3m") == pytest.approx(7380)
    assert _duration("bad") is None and _duration(None) is None


def test_slim_schema_and_compact_prompt_keep_policy() -> None:
    assert slim_schema({"anyOf": [{"type": "integer"}, {"type": "null"}], "title": "x"}) == {
        "type": "integer"
    }
    assert compact_prompt(PROMPT).splitlines()[:2] == ["courtlens-agent-prompt-v2", "Policy line."]


def test_config_pools_free_providers_and_never_adds_paid_ones(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings = Settings(_env_file=None, gemini_api_key="g", groq_api_key="q", openai_api_key="o")
    assert settings.resolved_assistant_providers == ["gemini", "groq"]
    assert settings.resolved_assistant_provider == "gemini"
    assert settings.assistant_model_for("groq") == "openai/gpt-oss-120b"
    provider = create_provider(settings)
    assert isinstance(provider, PooledProvider)
    assert [(m.name, m.provider.model) for m in provider.members] == [
        ("gemini", "gemini-3.8-flash"),
        ("groq", "openai/gpt-oss-120b"),
        ("groq", "qwen/qwen3.8-27b"),
    ]
    assert provider.members[0].limits.daily_reset_pacific

    groq_only = Settings(_env_file=None, groq_api_key="q", openai_api_key="o")
    assert groq_only.resolved_assistant_providers == ["groq"]
    ordered = Settings(
        _env_file=None,
        gemini_api_key="g",
        groq_api_key="q",
        openai_api_key="o",
        assistant_providers=" Groq, openai ,gemini",
    )
    assert ordered.resolved_assistant_providers == ["groq", "openai", "gemini"]
    assert ordered.resolved_assistant_provider == "groq"
    pinned = Settings(
        _env_file=None, gemini_api_key="g", groq_api_key="q", assistant_provider="groq"
    )
    assert pinned.resolved_assistant_providers == ["groq"]
    off = Settings(_env_file=None, gemini_api_key="g", assistant_provider="none")
    assert off.resolved_assistant_providers == [] and not off.assistant_configured
    with pytest.raises(ValueError, match="unknown assistant providers: mistral"):
        Settings(_env_file=None, assistant_providers="gemini,mistral")
    monkeypatch.setenv("GROQ_API_KEY", "alias-secret")
    monkeypatch.setenv("COURTLENS_GROQ_MODEL", " qwen/qwen3.8-27b , openai/gpt-oss-20b,")
    alias = Settings(_env_file=None)
    assert alias.resolved_assistant_providers == ["groq"]
    assert alias.resolved_assistant_model == "qwen/qwen3.8-27b"
    assert alias.assistant_models_for("groq") == ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"]


def test_status_lists_pool_without_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(_env_file=None, gemini_api_key="gemini-secret", groq_api_key="groq-secret")
    monkeypatch.setattr("courtlens.services.assistant.status.get_settings", lambda: settings)
    status = get_assistant_status()
    assert [p["provider"] for p in status.providers] == ["gemini", "groq", "groq"]
    assert [p["model"] for p in status.providers[1:]] == ["openai/gpt-oss-120b", "qwen/qwen3.8-27b"]
    dumped = status.model_dump_json()
    assert "gemini-secret" not in dumped and "groq-secret" not in dumped
    assert "COURTLENS_GROQ_API_KEY" in status.setup_instructions


def test_recording_reports_the_member_that_answered() -> None:
    from courtlens.services.assistant.agent.providers.replay import RecordingProvider

    gemini = FakeProvider("gemini-x", [ProviderFailure("provider_busy")])
    recording = RecordingProvider(
        pool(("gemini", gemini), ("groq", FakeProvider("groq-x", [answer("ok")])))
    )
    assert recording.model == "gemini-x" and recording.provider_name == "gemini"
    recording.step("p", MESSAGES, [], **OPTIONS)
    assert recording.model == "groq-x" and recording.provider_name == "groq"
    assert len(recording.records) == 1 and recording.records[0].failure is None


def test_ledger_learns_estimate_calibration_from_reported_usage() -> None:
    ledger = QuotaLedger()
    assert ledger.calibrated("groq", "m", 7000) == 7000
    ledger.record_success("groq", "m", 1800, estimated=7200, now=1.0)
    assert ledger.calibrated("groq", "m", 7200) == 1800
    ledger.record_success("groq", "m", 100_000, estimated=1000, now=2.0)
    # Ratios are clamped and smoothed, so one odd response cannot swing pacing.
    assert ledger.calibrated("groq", "m", 1000) == int(1000 * (0.7 * 0.25 + 0.3 * 1.5))
