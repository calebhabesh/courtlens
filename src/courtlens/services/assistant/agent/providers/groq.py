"""Groq's OpenAI-compatible Chat Completions, compacted for free-tier token allowances.

Groq's free plan allows roughly 8,000 tokens per minute per model, so a full CourtLens request
(about 13,000 tokens) cannot run there. This adapter sends the same policy and tools in a compact
form: the glossary and site map move behind list_metrics/site_help, schema prose is dropped (the
server still validates every call against the full schema), and tool payloads are truncated.
Groq has no native web search in this adapter; the model answers from tools and knowledge.
"""

from __future__ import annotations

import json
import time
from collections.abc import Sequence
from contextlib import nullcontext
from typing import Any

from openai import OpenAI

from courtlens.services.assistant.agent.providers.base import (
    AgentMessage,
    AgentStep,
    DeltaCallback,
    ProviderFailure,
    ToolCall,
    ToolDeclaration,
    Usage,
    check_budget,
    map_failure,
)

BASE_URL = "https://api.groq.com/openai/v1"
MAX_OUTPUT_TOKENS = 2048
MAX_TOOL_RESULT_CHARS = 6000
# Rough characters per token for JSON-heavy English prompts; deliberately conservative.
CHARS_PER_TOKEN = 3.2
EXPECTED_OUTPUT_TOKENS = 600
OMITTED_SECTIONS = ("Glossary: ", "Site map: ")
SECTION_HINT = (
    "Glossary and site map are omitted here: call list_metrics for metric definitions and "
    "coverage, and site_help for CourtLens pages. Web search is unavailable in this session; "
    "answer from CourtLens tools, and say when a question needs current web sources."
)
RATE_HEADERS = (
    "x-ratelimit-limit-requests",
    "x-ratelimit-limit-tokens",
    "x-ratelimit-remaining-requests",
    "x-ratelimit-remaining-tokens",
    "x-ratelimit-reset-requests",
    "x-ratelimit-reset-tokens",
)


def compact_prompt(system_prompt: str) -> str:
    lines = [line for line in system_prompt.split("\n") if not line.startswith(OMITTED_SECTIONS)]
    return "\n".join([*lines, SECTION_HINT])


def slim_schema(value: Any) -> Any:
    """Drop schema prose and collapse optional unions; validation stays server-side."""
    if isinstance(value, list):
        return [slim_schema(item) for item in value]
    if not isinstance(value, dict):
        return value
    slim = {
        key: slim_schema(item)
        for key, item in value.items()
        if key not in {"title", "description", "examples", "default", "additionalProperties"}
    }
    options = slim.get("anyOf")
    if isinstance(options, list) and len(options) == 2 and {"type": "null"} in options:
        other = next(option for option in options if option != {"type": "null"})
        slim.pop("anyOf")
        slim = {**other, **slim} if isinstance(other, dict) else slim
    return slim


def _short(schema: dict[str, Any], defs: dict[str, Any]) -> str:
    if "$ref" in schema:
        name = str(schema["$ref"]).rsplit("/", 1)[-1]
        target = defs.get(name, {})
        return "|".join(map(str, target["enum"])) if "enum" in target else name
    if "anyOf" in schema:
        return "|".join(_short(o, defs) for o in schema["anyOf"] if o != {"type": "null"})
    if "enum" in schema:
        return "|".join(map(str, schema["enum"]))
    if schema.get("type") == "array":
        return "[" + _short(schema.get("items") or {}, defs) + "]"
    return str(schema.get("type", "any"))


def _signature(schema: dict[str, Any], defs: dict[str, Any]) -> str:
    required = set(schema.get("required") or [])
    fields = (
        f"{key}{'' if key in required else '?'}: {_short(value, defs)}"
        for key, value in (schema.get("properties") or {}).items()
    )
    return "{" + ", ".join(fields) + "}"


def flatten_union(tool: ToolDeclaration) -> ToolDeclaration:
    """Replace a discriminated oneOf with operation + arguments and a compact argument guide.

    Groq rejects any tool call that fails the declared schema before CourtLens sees it, and
    smaller open models often miss nested union branches. The guide keeps every operation's
    argument names and enums; the server validates the full schema on dispatch.
    """
    params = tool.parameters
    discriminator = params.get("discriminator") or {}
    defs: dict[str, Any] = params.get("$defs") or {}
    mapping: dict[str, str] = discriminator.get("mapping") or {}
    key = discriminator.get("propertyName")
    if not mapping or not key:
        return tool
    variants = {op: defs.get(ref.rsplit("/", 1)[-1], {}) for op, ref in mapping.items()}
    lines: list[str] = []
    for op, variant in variants.items():
        arguments = (variant.get("properties") or {}).get("arguments") or {}
        target = defs.get(str(arguments.get("$ref", "")).rsplit("/", 1)[-1], arguments)
        lines.append(f"{op}: arguments={_signature(target, defs)}")
    shown: set[str] = set()
    pending = True
    while pending:
        pending = False
        text = "\n".join(lines)
        for name, target in defs.items():
            if name in shown or name.startswith("AgentStats") or "properties" not in target:
                continue
            if f"{name}" in text.replace("arguments=", ""):
                lines.append(f"{name}={_signature(target, defs)}")
                shown.add(name)
                pending = True
    first: dict[str, Any] = next(iter(variants.values()), {})
    scope = {
        name: slim_schema(value)
        for name, value in (first.get("properties") or {}).items()
        if name not in {key, "arguments"}
    }
    return ToolDeclaration(
        name=tool.name,
        description=tool.description
        + " Pass operation and an arguments object. Argument fields by operation "
        + "(? = optional):\n"
        + "\n".join(lines),
        parameters={
            "type": "object",
            "properties": {
                key: {"type": "string", "enum": list(mapping)},
                "arguments": {"type": "object"},
                **scope,
            },
            "required": [key, "arguments"],
        },
    )


def _tool_content(payload: dict[str, Any]) -> str:
    text = json.dumps(payload, separators=(",", ":"), default=str)
    if len(text) <= MAX_TOOL_RESULT_CHARS:
        return text
    return text[:MAX_TOOL_RESULT_CHARS] + "...(truncated for size; narrow the query if needed)"


def _messages(system_prompt: str, messages: Sequence[AgentMessage]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = [{"role": "system", "content": compact_prompt(system_prompt)}]
    for message in messages:
        if message.role == "tool":
            out.extend(
                {
                    "role": "tool",
                    "tool_call_id": result.call_id,
                    "content": _tool_content(result.payload),
                }
                for result in message.tool_results
            )
        elif message.role == "assistant":
            own = [
                item["groq_message"]
                for item in message.native_content
                if isinstance(item.get("groq_message"), dict)
            ]
            if own:
                out.append(own[0])
                continue
            entry: dict[str, Any] = {"role": "assistant", "content": message.text or None}
            if message.tool_calls:
                entry["tool_calls"] = [
                    {
                        "id": call.id,
                        "type": "function",
                        "function": {"name": call.name, "arguments": json.dumps(call.arguments)},
                    }
                    for call in message.tool_calls
                ]
            out.append(entry)
        else:
            out.append({"role": "user", "content": message.text})
    return out


def _tools(tools: Sequence[ToolDeclaration]) -> list[dict[str, Any]]:
    return [
        {
            "type": "function",
            "function": {
                "name": flat.name,
                "description": flat.description,
                "parameters": slim_schema(flat.parameters),
            },
        }
        for flat in map(flatten_union, tools)
    ]


class GroqProvider:
    provider_name = "groq"

    def __init__(self, api_key: str, model: str, *, client: Any = None) -> None:
        self._key = api_key
        self.model = model
        self._client = client
        # Rate-limit headers from the latest response; read by the pool's quota ledger.
        self.last_rate_limits: dict[str, str] = {}

    def request(
        self,
        system_prompt: str,
        messages: Sequence[AgentMessage],
        tools: Sequence[ToolDeclaration],
        max_output_tokens: int,
    ) -> dict[str, Any]:
        request: dict[str, Any] = {
            "model": self.model,
            "messages": _messages(system_prompt, messages),
            "max_completion_tokens": max(1, min(max_output_tokens, MAX_OUTPUT_TOKENS)),
        }
        if tools:
            request["tools"] = _tools(tools)
            request["tool_choice"] = "auto"
        if self.model.startswith("openai/gpt-oss"):
            # Reasoning tokens count against the per-minute allowance; keep them small.
            request["reasoning_effort"] = "low"
        return request

    def estimate_tokens(
        self,
        system_prompt: str,
        messages: Sequence[AgentMessage],
        tools: Sequence[ToolDeclaration],
    ) -> int:
        body = self.request(system_prompt, messages, tools, 1)
        size = len(json.dumps(body["messages"])) + len(json.dumps(body.get("tools", [])))
        return int(size / CHARS_PER_TOKEN) + EXPECTED_OUTPUT_TOKENS

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
        check_budget(timeout_seconds, max_output_tokens, remaining_web_searches)
        request = self.request(system_prompt, messages, tools, max_output_tokens)
        started = time.monotonic()
        try:
            data = self._call(request, timeout_seconds, started, on_delta)
            calls = 1
        except Exception as exc:
            feedback = _tool_use_failure(exc)
            remaining = timeout_seconds - (time.monotonic() - started)
            if feedback is None or remaining < 5:
                raise map_failure(exc) from None
            # Groq validates tool calls server-side and rejects a malformed one with a 400.
            # Return the validation message to the model once; never loop.
            retry = {
                **request,
                "messages": [*request["messages"], {"role": "user", "content": feedback}],
            }
            try:
                data = self._call(retry, remaining, time.monotonic(), on_delta)
            except Exception as again:
                raise map_failure(again) from None
            calls = 2
        try:
            step = normalize(data)
        except (TypeError, ValueError, KeyError):
            raise ProviderFailure("provider_error") from None
        step.provider_calls = calls
        return step

    def _call(
        self,
        request: dict[str, Any],
        timeout_seconds: float,
        started: float,
        on_delta: DeltaCallback | None,
    ) -> dict[str, Any]:
        manager = (
            nullcontext(self._client)
            if self._client is not None
            else OpenAI(
                api_key=self._key,
                base_url=BASE_URL,
                timeout=timeout_seconds,
                max_retries=0,
            )
        )
        with manager as sdk_client:
            client: Any = sdk_client
            if on_delta is None:
                raw = client.chat.completions.with_raw_response.create(**request)
                self._observe(raw.headers)
                parsed: dict[str, Any] = raw.parse().model_dump(mode="json", exclude_none=True)
                return parsed
            raw = client.chat.completions.with_raw_response.create(
                **request, stream=True, stream_options={"include_usage": True}
            )
            self._observe(raw.headers)
            return _collect(raw.parse(), on_delta, timeout_seconds, started)

    def _observe(self, headers: Any) -> None:
        self.last_rate_limits = {
            name: str(headers.get(name)) for name in RATE_HEADERS if headers.get(name) is not None
        }


def _tool_use_failure(exc: Exception) -> str | None:
    """Feedback for a Groq tool-call schema rejection, or None for any other failure."""
    if getattr(exc, "status_code", None) != 400:
        return None
    body = getattr(exc, "body", None)
    if isinstance(body, dict) and isinstance(body.get("error"), dict):
        body = body["error"]
    if not isinstance(body, dict) or body.get("code") != "tool_use_failed":
        return None
    detail = str(body.get("message") or "")[:600]
    return (
        "Your previous tool call was rejected by schema validation and did not run: "
        f"{detail}\nCall the tool again with arguments that match its schema "
        "(query_stats needs operation and an arguments object), or answer without it."
    )


def _collect(
    stream: Any, on_delta: DeltaCallback, timeout_seconds: float, started: float
) -> dict[str, Any]:
    """Merge streamed chunks into one Chat Completions response shape."""
    message: dict[str, Any] = {"role": "assistant", "content": ""}
    calls: dict[int, dict[str, Any]] = {}
    data: dict[str, Any] = {"choices": [{"message": message}]}
    for chunk in stream:
        if time.monotonic() - started > timeout_seconds:
            raise TimeoutError("groq stream deadline")
        raw = chunk.model_dump(mode="json", exclude_none=True)
        data["model"] = raw.get("model", data.get("model"))
        usage = raw.get("usage") or (raw.get("x_groq") or {}).get("usage")
        if usage:
            data["usage"] = usage
        for choice in raw.get("choices") or []:
            delta = choice.get("delta") or {}
            if delta.get("content"):
                message["content"] += delta["content"]
                on_delta(delta["content"])
            for call in delta.get("tool_calls") or []:
                slot = calls.setdefault(
                    call.get("index", len(calls)),
                    {"type": "function", "function": {"name": "", "arguments": ""}},
                )
                if call.get("id"):
                    slot["id"] = call["id"]
                function = call.get("function") or {}
                slot["function"]["name"] += function.get("name") or ""
                slot["function"]["arguments"] += function.get("arguments") or ""
            if choice.get("finish_reason"):
                data["choices"][0]["finish_reason"] = choice["finish_reason"]
    if calls:
        message["tool_calls"] = [calls[index] for index in sorted(calls)]
    return data


def normalize(raw: dict[str, Any]) -> AgentStep:
    choice = (raw.get("choices") or [{}])[0]
    message = choice.get("message") or {}
    if choice.get("finish_reason") == "content_filter":
        raise ProviderFailure("provider_error")
    # Resend only role/content/tool_calls; Groq reasoning text is never stored as history.
    native = {"role": "assistant", "content": message.get("content") or None}
    step = AgentStep(model=raw.get("model"), sdk_response=raw)
    step.text = message.get("content") or ""
    for index, call in enumerate(message.get("tool_calls") or []):
        function = call.get("function") or {}
        args = json.loads(function.get("arguments") or "{}")
        if not isinstance(args, dict):
            raise ValueError("arguments must be an object")
        call_id = call.get("id") or f"groq_{index}"
        step.tool_calls.append(ToolCall(id=call_id, name=function["name"], arguments=args))
    if step.tool_calls:
        native["tool_calls"] = [
            {
                "id": call.id,
                "type": "function",
                "function": {"name": call.name, "arguments": json.dumps(call.arguments)},
            }
            for call in step.tool_calls
        ]
    if not step.text and not step.tool_calls:
        raise ProviderFailure("provider_error")
    step.native_content = [{"groq_message": native}]
    usage = raw.get("usage") or {}
    step.usage = Usage(
        input_tokens=usage.get("prompt_tokens", 0),
        output_tokens=usage.get("completion_tokens", 0),
        cached_input_tokens=(usage.get("prompt_tokens_details") or {}).get("cached_tokens", 0),
    )
    return step
