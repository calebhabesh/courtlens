"""OpenAI Responses API, with native search and stateless tool continuation."""

from __future__ import annotations

import json
from collections.abc import Sequence
from contextlib import nullcontext
from typing import Any

from openai import OpenAI

from courtload.services.assistant.agent.providers.base import (
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


class OpenAIProvider:
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
            if message.role == "tool":
                inputs.extend(
                    {
                        "type": "function_call_output",
                        "call_id": result.call_id,
                        "output": json.dumps(result.payload),
                    }
                    for result in message.tool_results
                )
            elif message.native_content:
                inputs.extend(message.native_content)
            else:
                inputs.append({"role": message.role, "content": message.text})
                inputs.extend(
                    {
                        "type": "function_call",
                        "call_id": call.id,
                        "name": call.name,
                        "arguments": json.dumps(call.arguments),
                    }
                    for call in message.tool_calls
                )
        declarations: list[dict[str, Any]] = [
            {
                "type": "function",
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.parameters,
                "strict": False,
            }
            for tool in tools
        ]
        if remaining_web_searches:
            declarations.append(
                {
                    "type": "web_search",
                    "filters": {
                        "blocked_domains": ["databallr.com", "api.databallr.com"],
                    },
                }
            )
        request: dict[str, Any] = {
            "model": self.model,
            "instructions": system_prompt,
            "input": inputs,
            "tools": declarations,
            "max_output_tokens": max_output_tokens,
            "store": False,
            "include": ["reasoning.encrypted_content"],
        }
        if remaining_web_searches:
            request["max_tool_calls"] = remaining_web_searches
        try:
            manager = (
                nullcontext(self._client)
                if self._client is not None
                else OpenAI(
                    api_key=self._key,
                    timeout=timeout_seconds,
                    max_retries=0,
                )
            )
            with manager as sdk_client:
                client: Any = sdk_client
                if on_delta is None:
                    response = client.responses.create(**request)
                else:
                    with client.responses.stream(**request) as stream:
                        for event in stream:
                            if event.type == "response.output_text.delta":
                                on_delta(event.delta)
                        response = stream.get_final_response()
        except Exception as exc:
            raise map_failure(exc) from None
        try:
            return normalize(response.model_dump(mode="json", exclude_none=True))
        except (TypeError, ValueError, KeyError):
            from courtload.services.assistant.agent.providers.base import ProviderFailure

            raise ProviderFailure("provider_error") from None


def normalize(raw: dict[str, Any]) -> AgentStep:
    step = AgentStep(model=raw.get("model"), native_content=raw.get("output", []), sdk_response=raw)
    for item in raw.get("output", []):
        kind = item.get("type")
        if kind == "function_call":
            try:
                args = json.loads(item["arguments"])
                if not isinstance(args, dict):
                    raise ValueError("arguments must be an object")
                step.tool_calls.append(
                    ToolCall(id=item["call_id"], name=item["name"], arguments=args)
                )
            except (KeyError, TypeError, ValueError):
                from courtload.services.assistant.agent.providers.base import ProviderFailure

                raise ProviderFailure("provider_error") from None
        elif kind == "web_search_call":
            if item.get("action", {}).get("type") == "search":
                step.usage.web_searches += 1
        elif kind == "message":
            for block in item.get("content", []):
                if block.get("type") != "output_text":
                    continue
                text = block.get("text", "")
                offset = len(step.text)
                step.text += text
                for annotation in block.get("annotations", []):
                    if annotation.get("type") != "url_citation":
                        continue
                    start, end = annotation.get("start_index"), annotation.get("end_index")
                    span = (
                        (offset + start, offset + end)
                        if isinstance(start, int) and isinstance(end, int)
                        else None
                    )
                    ref = citation(annotation["url"], annotation.get("title", ""), span=span)
                    if ref:
                        step.citations.append(ref)
    usage = raw.get("usage") or {}
    step.usage = Usage(
        input_tokens=usage.get("input_tokens", 0),
        output_tokens=usage.get("output_tokens", 0),
        cached_input_tokens=(usage.get("input_tokens_details") or {}).get("cached_tokens", 0),
        web_searches=step.usage.web_searches,
    )
    if raw.get("status") == "failed":
        from courtload.services.assistant.agent.providers.base import ProviderFailure

        raise ProviderFailure("provider_error")
    return step
