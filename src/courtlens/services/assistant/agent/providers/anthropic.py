"""Claude Messages API; preserve encrypted search blocks across tool turns."""

from __future__ import annotations

import json
from collections.abc import Sequence
from contextlib import nullcontext
from typing import Any

from anthropic import Anthropic

from courtlens.services.assistant.agent.providers.base import (
    AgentMessage,
    AgentStep,
    DeltaCallback,
    ToolCall,
    ToolDeclaration,
    Usage,
    check_budget,
    citation,
    map_failure,
)

WEB_SEARCH_TYPE = "web_search_20260318"


class AnthropicProvider:
    def __init__(self, api_key: str, model: str, *, client: Any = None) -> None:
        self._key = api_key
        self.model = model
        self._client = client

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
        inputs: list[dict[str, Any]] = []
        for message in messages:
            content: list[dict[str, Any]]
            if message.role == "tool":
                content = [
                    {
                        "type": "tool_result",
                        "tool_use_id": result.call_id,
                        "content": json.dumps(result.payload),
                        "is_error": result.is_error,
                    }
                    for result in message.tool_results
                ]
                role = "user"
            else:
                role = message.role
                content = message.native_content or (
                    ([{"type": "text", "text": message.text}] if message.text else [])
                    + [
                        {
                            "type": "tool_use",
                            "id": call.id,
                            "name": call.name,
                            "input": call.arguments,
                        }
                        for call in message.tool_calls
                    ]
                )
            # A tool result and the following user input must be a single user message.
            if inputs and inputs[-1]["role"] == role:
                inputs[-1]["content"].extend(content)
            else:
                inputs.append({"role": role, "content": content})
        declarations: list[dict[str, Any]] = [
            {
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.parameters,
            }
            for tool in tools
        ]
        if remaining_web_searches:
            declarations.append(
                {
                    "type": WEB_SEARCH_TYPE,
                    "name": "web_search",
                    "max_uses": remaining_web_searches,
                    "allowed_callers": ["direct"],
                    "blocked_domains": ["databallr.com", "api.databallr.com"],
                }
            )
        request: dict[str, Any] = {
            "model": self.model,
            "system": system_prompt,
            "messages": inputs,
            "tools": declarations,
            "max_tokens": max_output_tokens,
        }
        try:
            manager = (
                nullcontext(self._client)
                if self._client is not None
                else Anthropic(
                    api_key=self._key,
                    timeout=timeout_seconds,
                    max_retries=0,
                )
            )
            with manager as sdk_client:
                client: Any = sdk_client
                if on_delta is None:
                    response = client.messages.create(**request)
                else:
                    with client.messages.stream(**request) as stream:
                        for delta in stream.text_stream:
                            on_delta(delta)
                        response = stream.get_final_message()
        except Exception as exc:
            raise map_failure(exc) from None
        try:
            return normalize(response.model_dump(mode="json", exclude_none=True))
        except (TypeError, ValueError, KeyError):
            from courtlens.services.assistant.agent.providers.base import ProviderFailure

            raise ProviderFailure("provider_error") from None


def normalize(raw: dict[str, Any]) -> AgentStep:
    step = AgentStep(
        model=raw.get("model"), native_content=raw.get("content", []), sdk_response=raw
    )
    searches = 0
    for block in raw.get("content", []):
        kind = block.get("type")
        if kind == "text":
            text = block.get("text", "")
            offset = len(step.text)
            step.text += text
            for annotation in block.get("citations") or []:
                if annotation.get("type") != "web_search_result_location":
                    continue
                ref = citation(
                    annotation["url"],
                    annotation.get("title", ""),
                    cited_text=annotation.get("cited_text"),
                    span=(offset, offset + len(text)),
                )
                if ref:
                    step.citations.append(ref)
        elif kind == "tool_use":
            step.tool_calls.append(
                ToolCall(id=block["id"], name=block["name"], arguments=block["input"])
            )
        elif kind == "server_tool_use" and block.get("name") == "web_search":
            searches += 1
        elif kind == "web_search_tool_result" and isinstance(block.get("content"), dict):
            code = block["content"].get("error_code", "unknown")
            step.search_errors.append(code)
            step.search_limit_reached = code == "max_uses_exceeded" or step.search_limit_reached
    usage = raw.get("usage") or {}
    cache_read = usage.get("cache_read_input_tokens") or 0
    cache_write = usage.get("cache_creation_input_tokens") or 0
    step.usage = Usage(
        input_tokens=usage.get("input_tokens", 0) + cache_read + cache_write,
        output_tokens=usage.get("output_tokens", 0),
        cached_input_tokens=cache_read,
        cache_write_tokens=cache_write,
        web_searches=(usage.get("server_tool_use") or {}).get("web_search_requests", searches),
    )
    return step
