"""Gemini Generate Content SDK, with grounding and signed tool history."""

from __future__ import annotations

import math
import time
from collections.abc import Sequence
from contextlib import nullcontext
from typing import Any

from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from courtlens.services.assistant.agent.providers.base import (
    AgentMessage,
    AgentStep,
    DeltaCallback,
    ProviderFailure,
    ToolCall,
    ToolDeclaration,
    ToolResult,
    Usage,
    check_budget,
    citation,
    map_failure,
)


class WebSearchArguments(BaseModel):
    model_config = ConfigDict(extra="forbid")
    query: str = Field(min_length=1, max_length=1000)


WEB_SEARCH = ToolDeclaration(
    name="web_search",
    description="Search public NBA sources for a cited answer.",
    parameters=WebSearchArguments.model_json_schema(),
)


class GeminiProvider:
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
        started = time.monotonic()
        combined = self.model.startswith("gemini-3")
        separate_search = bool(tools and remaining_web_searches and not combined)
        if separate_search:
            tools = [*tools, WEB_SEARCH]
        idless_functions = {
            part["function_call"]["name"]
            for message in messages
            for part in message.native_content
            if part.get("function_call") and not part["function_call"].get("id")
        }
        contents: list[types.ContentUnionDict] = []
        for message in messages:
            if message.role == "tool":
                parts = [
                    types.Part(
                        function_response=types.FunctionResponse(
                            id=None if result.name in idless_functions else result.call_id,
                            name=result.name,
                            response=result.payload,
                        )
                    )
                    for result in message.tool_results
                ]
                role = "user"
            else:
                role = "model" if message.role == "assistant" else "user"
                parts = [types.Part.model_validate(part) for part in message.native_content]
                if not parts:
                    parts = ([types.Part(text=message.text)] if message.text else []) + [
                        types.Part(
                            function_call=types.FunctionCall(
                                id=call.id,
                                name=call.name,
                                args=call.arguments,
                            )
                        )
                        for call in message.tool_calls
                    ]
            contents.append(types.Content(role=role, parts=parts))
        declarations: list[types.Tool] = []
        if tools:
            declarations.append(
                types.Tool(
                    function_declarations=[
                        types.FunctionDeclaration(
                            name=tool.name,
                            description=tool.description,
                            parameters_json_schema=tool.parameters,
                        )
                        for tool in tools
                    ]
                )
            )
        if remaining_web_searches and not separate_search:
            declarations.append(types.Tool(google_search=types.GoogleSearch()))
        config = types.GenerateContentConfig(
            system_instruction=system_prompt,
            tools=declarations or None,
            max_output_tokens=max_output_tokens,
            automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
            tool_config=types.ToolConfig(include_server_side_tool_invocations=True)
            if declarations and combined
            else None,
        )
        try:
            manager = (
                nullcontext(self._client)
                if self._client is not None
                else genai.Client(
                    api_key=self._key,
                    http_options=types.HttpOptions(
                        timeout=max(1, math.floor(timeout_seconds * 1000)),
                        retry_options=types.HttpRetryOptions(attempts=1),
                    ),
                )
            )
            with manager as client:
                if on_delta is None:
                    response = client.models.generate_content(
                        model=self.model, contents=contents, config=config
                    )
                    raw = response.model_dump(mode="json", exclude_none=True)
                else:
                    raw = {"candidates": [{"content": {"parts": []}}]}
                    for chunk in client.models.generate_content_stream(
                        model=self.model, contents=contents, config=config
                    ):
                        data = chunk.model_dump(mode="json", exclude_none=True)
                        candidate = (data.get("candidates") or [{}])[0]
                        for part in candidate.get("content", {}).get("parts", []):
                            merged = raw["candidates"][0]["content"]["parts"]
                            if (
                                merged
                                and "text" in part
                                and "text" in merged[-1]
                                and bool(part.get("thought")) == bool(merged[-1].get("thought"))
                            ):
                                text = merged[-1]["text"] + part["text"]
                                merged[-1].update(part)
                                merged[-1]["text"] = text
                            else:
                                merged.append(part)
                            if part.get("text") and not part.get("thought"):
                                on_delta(part["text"])
                        for key in ("grounding_metadata", "finish_reason"):
                            if key in candidate:
                                raw["candidates"][0][key] = candidate[key]
                        for key in ("usage_metadata", "model_version"):
                            if key in data:
                                raw[key] = data[key]
        except Exception as exc:
            raise map_failure(exc) from None
        try:
            result = normalize(raw)
        except (TypeError, ValueError, KeyError):
            raise ProviderFailure("provider_error") from None
        if separate_search:
            external_calls = [call for call in result.tool_calls if call.name == "web_search"]
            result.tool_calls = [call for call in result.tool_calls if call.name != "web_search"]
            for call in external_calls:
                payload: dict[str, Any]
                error = False
                if remaining_web_searches <= 0:
                    result.search_limit_reached = True
                    payload, error = {"error": "search_limit_reached"}, True
                else:
                    try:
                        args = WebSearchArguments.model_validate(call.arguments)
                    except ValidationError:
                        payload, error = {"error": "invalid_search_arguments"}, True
                    else:
                        search = self.step(
                            system_prompt,
                            [AgentMessage(role="user", text=args.query)],
                            [],
                            timeout_seconds=timeout_seconds - (time.monotonic() - started),
                            max_output_tokens=max_output_tokens,
                            remaining_web_searches=remaining_web_searches,
                            on_delta=on_delta,
                        )
                        result.provider_calls += search.provider_calls
                        for name in Usage.model_fields:
                            setattr(
                                result.usage,
                                name,
                                getattr(result.usage, name) + getattr(search.usage, name),
                            )
                        remaining_web_searches -= search.usage.web_searches
                        result.sdk_response.setdefault("search_subcalls", []).append(
                            search.sdk_response
                        )
                        payload = {
                            "answer": search.text,
                            "citations": [ref.model_dump(mode="json") for ref in search.citations],
                        }
                        # Search spans refer to payload prose, not the main response's text.
                        result.citations.extend(
                            ref.model_copy(update={"span": None}) for ref in search.citations
                        )
                result.completed_tool_results.append(
                    ToolResult(
                        call_id=call.id,
                        name=call.name,
                        payload=payload,
                        is_error=error,
                    )
                )
        return result


def normalize(raw: dict[str, Any]) -> AgentStep:
    candidate = (raw.get("candidates") or [{}])[0]
    parts = candidate.get("content", {}).get("parts", [])
    step = AgentStep(model=raw.get("model_version"), native_content=parts, sdk_response=raw)
    for part in parts:
        if not part.get("thought"):
            step.text += part.get("text", "")
        call = part.get("function_call")
        if call:
            # Gemini may omit IDs in older responses. Assign stable local IDs for the response.
            step.tool_calls.append(
                ToolCall(
                    id=call.get("id") or f"gemini_{len(step.tool_calls)}",
                    name=call["name"],
                    arguments=call.get("args") or {},
                )
            )
    grounding = candidate.get("grounding_metadata") or {}
    chunks = grounding.get("grounding_chunks") or []
    # Grounding segment offsets are UTF-8 bytes, whereas normalized spans are character offsets.
    for support in grounding.get("grounding_supports") or []:
        segment = support.get("segment") or {}
        start, end = segment.get("start_index", 0), segment.get("end_index")
        span = None
        if isinstance(start, int) and isinstance(end, int):
            part_index = segment.get("part_index", 0)
            visible_parts = [p.get("text", "") if not p.get("thought") else "" for p in parts]
            if isinstance(part_index, int) and 0 <= part_index < len(visible_parts):
                encoded = visible_parts[part_index].encode("utf-8")
                offset = sum(len(text) for text in visible_parts[:part_index])
                span = (
                    offset + len(encoded[:start].decode("utf-8", errors="ignore")),
                    offset + len(encoded[:end].decode("utf-8", errors="ignore")),
                )
        for index in support.get("grounding_chunk_indices") or []:
            if not isinstance(index, int) or not 0 <= index < len(chunks):
                continue
            web = chunks[index].get("web") or {}
            ref = citation(
                web.get("uri", ""), web.get("title", ""), cited_text=segment.get("text"), span=span
            )
            if ref:
                step.citations.append(ref)
    usage = raw.get("usage_metadata") or {}
    step.usage = Usage(
        input_tokens=usage.get("prompt_token_count", 0),
        output_tokens=usage.get("candidates_token_count", 0) + usage.get("thoughts_token_count", 0),
        cached_input_tokens=usage.get("cached_content_token_count", 0),
        web_searches=len(
            set(query for query in grounding.get("web_search_queries", []) if query.strip())
        ),
    )
    if candidate.get("finish_reason") in {"SAFETY", "BLOCKLIST", "PROHIBITED_CONTENT"} or not parts:
        raise ProviderFailure("provider_error")
    return step
