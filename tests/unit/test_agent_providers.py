"""Adapter contracts through the official SDKs with recorded offline HTTP response shapes.

Fixtures contain synthetic values, not evidence of any provider's live quality.
"""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

import httpx
import pytest
from anthropic import Anthropic
from fastapi.testclient import TestClient
from google import genai
from google.genai import types
from openai import OpenAI
from pydantic import ValidationError

from courtload.config import Settings
from courtload.services.assistant.agent.pricing import estimate_cost
from courtload.services.assistant.agent.providers import create_provider
from courtload.services.assistant.agent.providers.anthropic import AnthropicProvider
from courtload.services.assistant.agent.providers.base import (
    DEFAULT_MODELS,
    AgentMessage,
    ProviderFailure,
    ToolDeclaration,
    ToolResult,
    Usage,
    map_failure,
)
from courtload.services.assistant.agent.providers.gemini import GeminiProvider
from courtload.services.assistant.agent.providers.openai import OpenAIProvider
from courtload.services.assistant.agent.providers.replay import RecordingProvider, ReplayProvider
from courtload.services.assistant.service import get_assistant_status

FIXTURES = Path(__file__).parents[1] / "fixtures/agent-providers"
TOOL = ToolDeclaration(
    name="warehouse_query",
    description="Read a metric.",
    parameters={
        "type": "object",
        "properties": {"metric": {"type": "string"}},
        "required": ["metric"],
        "additionalProperties": False,
    },
)
MESSAGES = [AgentMessage(role="user", text="Compare Wembanyama's RAPM and blocks.")]
OPTIONS = {"timeout_seconds": 5, "max_output_tokens": 1000, "remaining_web_searches": 2}


@pytest.fixture(autouse=True)
def isolated_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in (
        "COURTLOAD_ASSISTANT_PROVIDER",
        "COURTLOAD_ASSISTANT_MODEL",
        "COURTLOAD_GEMINI_MODEL",
        "GEMINI_MODEL",
        "COURTLOAD_GEMINI_API_KEY",
        "GEMINI_API_KEY",
        "COURTLOAD_ANTHROPIC_API_KEY",
        "ANTHROPIC_API_KEY",
        "COURTLOAD_OPENAI_API_KEY",
        "OPENAI_API_KEY",
    ):
        monkeypatch.delenv(key, raising=False)


def raw_response(name: str) -> dict[str, Any]:
    return json.loads((FIXTURES / f"{name}.json").read_text())


def adapter(name: str, transport: httpx.MockTransport) -> Any:
    client = httpx.Client(transport=transport)
    if name == "gemini":
        sdk = genai.Client(
            api_key="test-secret",
            http_options=types.HttpOptions(
                httpx_client=client, retry_options=types.HttpRetryOptions(attempts=1)
            ),
        )
        return GeminiProvider("test-secret", DEFAULT_MODELS[name], client=sdk)
    if name == "anthropic":
        sdk = Anthropic(api_key="test-secret", http_client=client, max_retries=0)
        return AnthropicProvider("test-secret", DEFAULT_MODELS[name], client=sdk)
    sdk = OpenAI(api_key="test-secret", http_client=client, max_retries=0)
    return OpenAIProvider("test-secret", DEFAULT_MODELS[name], client=sdk)


@pytest.mark.parametrize("name", DEFAULT_MODELS)
def test_tools_citations_usage_and_exact_continuation(name: str) -> None:
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(200, json=raw_response(name))

    provider = adapter(name, httpx.MockTransport(respond))
    try:
        step = provider.step("NBA only.", MESSAGES, [TOOL], **OPTIONS)
        assert step.tool_calls[0].arguments == {"metric": "blk_per_game"}
        assert step.tool_calls[0].id == "tool_1"
        assert step.citations[0].publisher == "nbarapm.com"
        assert step.citations[0].span == (0, len(step.text))
        assert step.usage.input_tokens == 100
        assert step.usage.output_tokens == (25 if name == "gemini" else 20)
        assert step.usage.web_searches == 1
        assert step.native_content
        continuation = [
            *MESSAGES,
            step.as_message(),
            AgentMessage(
                role="tool",
                tool_results=[
                    ToolResult(call_id="tool_1", name=TOOL.name, payload={"value": 3.8}),
                ],
            ),
        ]
        provider.step("NBA only.", continuation, [TOOL], **OPTIONS)
        if name == "gemini":
            assert requests[0]["toolConfig"]["includeServerSideToolInvocations"] is True
            assert requests[0]["generationConfig"]["maxOutputTokens"] == 1000
            parts = requests[1]["contents"][1]["parts"]
            assert parts[-1]["thoughtSignature"] == "c2lnbmF0dXJl"
            assert requests[1]["contents"][-1]["parts"][0]["functionResponse"]["id"] == "tool_1"
        elif name == "anthropic":
            assert requests[0]["tools"][-1]["max_uses"] == 2
            assert requests[0]["tools"][-1]["allowed_callers"] == ["direct"]
            blocks = requests[1]["messages"][1]["content"]
            assert blocks[1]["content"][0]["encrypted_content"] == "encrypted-fixture"
            assert requests[1]["messages"][-1]["content"][0]["tool_use_id"] == "tool_1"
        else:
            assert requests[0]["store"] is False
            assert requests[0]["max_tool_calls"] == 2
            assert requests[1]["input"][1]["encrypted_content"] == "encrypted-reasoning"
            assert requests[1]["input"][-1]["call_id"] == "tool_1"
    finally:
        provider._client.close()


@pytest.mark.parametrize("name", DEFAULT_MODELS)
@pytest.mark.parametrize(
    "failure,status",
    [
        ("provider_quota", 429),
        ("provider_busy", 503),
        ("provider_timeout", 504),
        ("provider_error", 401),
    ],
)
def test_sdk_failures_are_safe_and_not_retried(name: str, failure: str, status: int) -> None:
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(
            status,
            headers={"retry-after": "17"},
            json={
                "error": {
                    "code": status,
                    "status": "RESOURCE_EXHAUSTED",
                    "type": "rate_limit_error",
                    "message": "secret-request-body-do-not-log",
                }
            },
        )

    provider = adapter(name, httpx.MockTransport(respond))
    try:
        with pytest.raises(ProviderFailure) as error:
            provider.step("NBA only.", MESSAGES, [TOOL], **OPTIONS)
        assert error.value.kind == failure
        assert str(error.value) == failure
        assert error.value.retry_after == (17 if status == 429 else None)
        assert len(requests) == 1
    finally:
        provider._client.close()


@pytest.mark.parametrize("name", DEFAULT_MODELS)
def test_sdk_deadline_and_exhausted_search_budget(name: str) -> None:
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        raise httpx.ReadTimeout("sensitive message", request=request)

    provider = adapter(name, httpx.MockTransport(respond))
    try:
        with pytest.raises(ProviderFailure, match="provider_timeout"):
            provider.step("NBA only.", MESSAGES, [TOOL], **{**OPTIONS, "remaining_web_searches": 0})
        body = requests[0]
        serialized = json.dumps(body["tools"])
        assert "googleSearch" not in serialized and "web_search" not in serialized
        with pytest.raises(ProviderFailure, match="provider_timeout"):
            provider.step("NBA only.", MESSAGES, [TOOL], **{**OPTIONS, "timeout_seconds": 0})
        assert len(requests) == 1
    finally:
        provider._client.close()


def sse(event: str | None, data: dict[str, Any]) -> str:
    return (f"event: {event}\n" if event else "") + f"data: {json.dumps(data)}\n\n"


@pytest.mark.parametrize("name", DEFAULT_MODELS)
def test_native_streaming_callbacks_and_final_response(name: str) -> None:
    raw = raw_response(name)
    text = "Wembanyama had +8.8 RAPM."
    if name == "gemini":
        parts = raw["candidates"][0]["content"]["parts"]
        raw["candidates"][0]["content"]["parts"] = [parts[0]]
        stream_data = sse(None, raw)
    elif name == "anthropic":
        message = {
            **raw,
            "content": [],
            "stop_reason": None,
            "usage": {"input_tokens": 100, "output_tokens": 0},
        }
        events = [
            {"type": "message_start", "message": message},
            {
                "type": "content_block_start",
                "index": 0,
                "content_block": {"type": "text", "text": ""},
            },
            {
                "type": "content_block_delta",
                "index": 0,
                "delta": {"type": "text_delta", "text": text},
            },
            {"type": "content_block_stop", "index": 0},
            {
                "type": "message_delta",
                "delta": {"stop_reason": "end_turn", "stop_sequence": None},
                "usage": {"output_tokens": 20},
            },
            {"type": "message_stop"},
        ]
        stream_data = "".join(sse(event["type"], event) for event in events)
    else:
        message = raw["output"][2]
        raw["output"] = [message]
        events = [
            {
                "type": "response.created",
                "sequence_number": 0,
                "response": {**raw, "output": [], "status": "in_progress"},
            },
            {
                "type": "response.output_item.added",
                "sequence_number": 1,
                "output_index": 0,
                "item": {**message, "content": []},
            },
            {
                "type": "response.content_part.added",
                "sequence_number": 2,
                "output_index": 0,
                "content_index": 0,
                "item_id": message["id"],
                "part": {"type": "output_text", "text": "", "annotations": []},
            },
            {
                "type": "response.output_text.delta",
                "sequence_number": 3,
                "item_id": "msg_fixture",
                "output_index": 0,
                "content_index": 0,
                "delta": text,
                "logprobs": [],
            },
            {
                "type": "response.output_item.done",
                "sequence_number": 4,
                "output_index": 0,
                "item": message,
            },
            {"type": "response.completed", "sequence_number": 5, "response": raw},
        ]
        stream_data = "".join(sse(event["type"], event) for event in events)
    provider = adapter(
        name,
        httpx.MockTransport(
            lambda request: httpx.Response(
                200, headers={"content-type": "text/event-stream"}, content=stream_data
            )
        ),
    )
    try:
        deltas = []
        step = provider.step("NBA only.", MESSAGES, [TOOL], on_delta=deltas.append, **OPTIONS)
        assert "".join(deltas) == text
        assert step.text == text
        assert step.usage.output_tokens > 0
    finally:
        provider._client.close()


@pytest.mark.parametrize("name", DEFAULT_MODELS)
def test_record_replay_and_tool_payload_drift(name: str, tmp_path: Path) -> None:
    provider = adapter(
        name, httpx.MockTransport(lambda request: httpx.Response(200, json=raw_response(name)))
    )
    try:
        recording = RecordingProvider(provider)
        original = recording.step("NBA only.", MESSAGES, [TOOL], **OPTIONS)
        path = tmp_path / "transcript.json"
        recording.save(path)
        assert "test-secret" not in path.read_text()
        replay = ReplayProvider.load(path)
        replayed = replay.step("NBA only.", MESSAGES, [TOOL], **OPTIONS)
        assert replayed == original and replay.exhausted
        replay = ReplayProvider.load(path)
        with pytest.raises(ValueError, match="drift"):
            replay.step(
                "NBA only.",
                [
                    AgentMessage(
                        role="tool",
                        tool_results=[
                            ToolResult(call_id="tool_1", name=TOOL.name, payload={"value": 99})
                        ],
                    )
                ],
                [TOOL],
                **OPTIONS,
            )
        with pytest.raises(FileExistsError):
            recording.save(path)
    finally:
        provider._client.close()


def test_gemini_old_model_native_search_subcall() -> None:
    requests = []

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        raw = raw_response("gemini")
        if len(requests) == 1:
            raw["candidates"][0] = {
                "content": {
                    "role": "model",
                    "parts": [
                        {
                            "functionCall": {
                                "id": "search_1",
                                "name": "web_search",
                                "args": {"query": "Wembanyama RAPM"},
                            }
                        }
                    ],
                }
            }
        else:
            raw["candidates"][0]["content"]["parts"] = [{"text": "Wembanyama had +8.8 RAPM."}]
        return httpx.Response(200, json=raw)

    provider = adapter("gemini", httpx.MockTransport(respond))
    provider.model = "gemini-2.5-flash"
    try:
        step = provider.step("NBA only.", MESSAGES, [TOOL], **OPTIONS)
        assert not step.tool_calls
        assert step.completed_tool_results[0].name == "web_search"
        assert step.completed_tool_results[0].payload["citations"]
        assert step.provider_calls == 2 and step.usage.input_tokens == 200
        assert "googleSearch" not in json.dumps(requests[0]["tools"])
        assert "googleSearch" in json.dumps(requests[1]["tools"])
        assert "functionDeclarations" not in json.dumps(requests[1]["tools"])
        assert len(step.as_messages()) == 2
    finally:
        provider._client.close()


def test_gemini_byte_spans_respect_parts_and_unicode() -> None:
    from courtload.services.assistant.agent.providers.gemini import normalize

    raw = raw_response("gemini")
    raw["candidates"][0]["content"]["parts"] = [{"text": "Intro. "}, {"text": "Jokić: +9.9."}]
    segment = raw["candidates"][0]["groundingMetadata"]["groundingSupports"][0]["segment"]
    segment.update(
        partIndex=1, startIndex=0, endIndex=len("Jokić: +9.9.".encode()), text="Jokić: +9.9."
    )
    parsed = types.GenerateContentResponse.model_validate(raw).model_dump(
        mode="json", exclude_none=True
    )
    step = normalize(parsed)
    assert step.citations[0].span == (7, len(step.text))


def test_anthropic_search_error_remains_readable_not_success() -> None:
    from courtload.services.assistant.agent.providers.anthropic import normalize

    raw = raw_response("anthropic")
    raw["content"][1]["content"] = {
        "type": "web_search_tool_result_error",
        "error_code": "max_uses_exceeded",
    }
    step = normalize(raw)
    assert step.search_limit_reached
    assert step.search_errors == ["max_uses_exceeded"]


def test_prices_unknown_expired_cache_and_search_cost() -> None:
    path = Path("config/assistant-prices.yaml")
    usage = Usage(input_tokens=1000, output_tokens=100, web_searches=2)
    assert estimate_cost(path, "unknown", usage, today=date(2026, 10, 7)) is None
    assert estimate_cost(path, "gemini-3.8-flash", usage, today=date(2027, 1, 1)) is None
    assert estimate_cost(path, "gpt-6.1-sol", usage, today=date(2026, 10, 7)) == pytest.approx(
        0.023
    )
    cached = Usage(input_tokens=1000, cached_input_tokens=1000)
    assert estimate_cost(path, "gpt-6.1-sol", cached, today=date(2026, 10, 7)) == pytest.approx(
        0.0001
    )


def test_config_precedence_aliases_secrets_and_disabled_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    empty = Settings(_env_file=None)
    assert empty.resolved_assistant_provider == "none" and not empty.assistant_configured
    with pytest.raises(ProviderFailure, match="provider_disabled"):
        create_provider(empty)
    monkeypatch.setenv("OPENAI_API_KEY", "openai-secret")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "anthropic-secret")
    settings = Settings(_env_file=None)
    assert settings.resolved_assistant_provider == "anthropic"
    assert settings.resolved_assistant_model == DEFAULT_MODELS["anthropic"]
    monkeypatch.setenv("COURTLOAD_GEMINI_API_KEY", "gemini-secret")
    settings = Settings(_env_file=None)
    assert settings.resolved_assistant_model == DEFAULT_MODELS["gemini"]
    assert "gemini-secret" not in repr(settings)
    monkeypatch.setenv("COURTLOAD_GEMINI_MODEL", "explicit-legacy-model")
    assert Settings(_env_file=None).resolved_assistant_model == "explicit-legacy-model"
    monkeypatch.setenv("COURTLOAD_ASSISTANT_MODEL", "explicit-agent-model")
    assert Settings(_env_file=None).resolved_assistant_model == "explicit-agent-model"
    monkeypatch.setenv("COURTLOAD_ASSISTANT_PROVIDER", "none")
    assert not Settings(_env_file=None).assistant_configured


def test_blank_env_template_and_generic_key_alias(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    path = tmp_path / ".env"
    path.write_text(Path(".env.example").read_text())
    monkeypatch.setenv("OPENAI_API_KEY", "secret-openai")
    settings = Settings(_env_file=path)
    assert settings.resolved_assistant_provider == "openai"
    assert settings.resolved_assistant_model == DEFAULT_MODELS["openai"]


def test_status_never_returns_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = Settings(_env_file=None, openai_api_key="secret-openai", assistant_max_steps=4)
    monkeypatch.setattr("courtload.services.assistant.service.get_settings", lambda: settings)
    status = get_assistant_status()
    assert status.configured and not status.limited_mode
    assert status.provider == "openai" and status.model == DEFAULT_MODELS["openai"]
    assert status.limits["max_steps"] == 4
    assert status.limits["max_tokens"] == 60000
    assert "secret-openai" not in status.model_dump_json()
    assert status.prompt_version == "courtlens-agent-prompt-v1"


def test_retry_after_http_date_and_safe_errors() -> None:
    error = RuntimeError("secret")
    error.status_code = 429
    error.response = httpx.Response(429, headers={"retry-after": "not-a-date"})
    assert map_failure(error).retry_after == 60


def test_status_api_reports_explicit_missing_key_without_falling_back(
    monkeypatch: pytest.MonkeyPatch,
    api_client: TestClient,
) -> None:
    settings = Settings(_env_file=None, assistant_provider="openai", gemini_api_key="secret")
    monkeypatch.setattr("courtload.services.assistant.service.get_settings", lambda: settings)
    response = api_client.get("/api/workbench/assistant/status")
    assert response.status_code == 200
    body = response.json()
    assert body["provider"] == "openai" and body["limited_mode"] is True
    assert body["configured"] is False
    assert "secret" not in response.text


@pytest.mark.parametrize(
    "field,value",
    [
        ("assistant_max_steps", 0),
        ("assistant_max_web_searches", -1),
        ("assistant_max_tokens", 0),
        ("assistant_turn_timeout_seconds", 0),
        ("assistant_provider", "invalid"),
    ],
)
def test_invalid_provider_config_is_rejected(field: str, value: object) -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, **{field: value})


def test_gemini_stream_merges_text_before_applying_grounding_spans() -> None:
    first = raw_response("gemini")
    first["candidates"][0] = {"content": {"role": "model", "parts": [{"text": "Wembanyama "}]}}
    last = raw_response("gemini")
    last["candidates"][0]["content"]["parts"] = [{"text": "had +8.8 RAPM."}]
    provider = adapter(
        "gemini",
        httpx.MockTransport(
            lambda request: httpx.Response(
                200,
                headers={"content-type": "text/event-stream"},
                content=sse(None, first) + sse(None, last),
            )
        ),
    )
    try:
        step = provider.step("NBA only.", MESSAGES, [TOOL], on_delta=lambda text: None, **OPTIONS)
        assert step.text == "Wembanyama had +8.8 RAPM."
        assert step.citations[0].span == (0, len(step.text))
    finally:
        provider._client.close()


def test_gemini_idless_calls_keep_local_ids_out_of_signed_sdk_history() -> None:
    requests = []
    raw = raw_response("gemini")
    raw["candidates"][0]["content"]["parts"][1]["functionCall"].pop("id")

    def respond(request: httpx.Request) -> httpx.Response:
        requests.append(json.loads(request.content))
        return httpx.Response(200, json=raw)

    provider = adapter("gemini", httpx.MockTransport(respond))
    try:
        step = provider.step("NBA only.", MESSAGES, [TOOL], **OPTIONS)
        call = step.tool_calls[0]
        assert call.id == "gemini_0"
        provider.step(
            "NBA only.",
            [
                *MESSAGES,
                step.as_message(),
                AgentMessage(
                    role="tool",
                    tool_results=[
                        ToolResult(call_id=call.id, name=call.name, payload={"value": 3.8})
                    ],
                ),
            ],
            [TOOL],
            **OPTIONS,
        )
        assert "id" not in requests[1]["contents"][1]["parts"][1]["functionCall"]
        assert "id" not in requests[1]["contents"][2]["parts"][0]["functionResponse"]
    finally:
        provider._client.close()
