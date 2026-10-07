"""Exact transcript replay: changed tool payloads are drift, never a fixture lookup miss."""

from __future__ import annotations

import json
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from pydantic import Field

from courtlens.services.assistant.agent.providers.base import (
    AgentMessage,
    AgentProvider,
    AgentStep,
    DeltaCallback,
    FailureKind,
    ProviderFailure,
    ProviderModel,
    ToolDeclaration,
)


class RecordedStep(ProviderModel):
    request: dict[str, Any]
    response: AgentStep | None = None
    failure: FailureKind | None = None
    retry_after: int | None = None
    deltas: list[str] = Field(default_factory=list)


def request_record(
    system_prompt: str,
    messages: Sequence[AgentMessage],
    tools: Sequence[ToolDeclaration],
    max_output_tokens: int,
    remaining_web_searches: int,
) -> dict[str, Any]:
    return {
        "system_prompt": system_prompt,
        "messages": [message.model_dump(mode="json") for message in messages],
        "tools": [tool.model_dump(mode="json") for tool in tools],
        "max_output_tokens": max_output_tokens,
        "remaining_web_searches": remaining_web_searches,
    }


class RecordingProvider:
    def __init__(self, provider: AgentProvider) -> None:
        self.provider = provider
        self.model = provider.model
        self.records: list[RecordedStep] = []

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
        record = RecordedStep(
            request=request_record(
                system_prompt,
                messages,
                tools,
                max_output_tokens,
                remaining_web_searches,
            )
        )
        self.records.append(record)

        def delta(text: str) -> None:
            record.deltas.append(text)
            if on_delta is not None:
                on_delta(text)

        try:
            response = self.provider.step(
                system_prompt,
                messages,
                tools,
                timeout_seconds=timeout_seconds,
                max_output_tokens=max_output_tokens,
                remaining_web_searches=remaining_web_searches,
                on_delta=delta if on_delta is not None else None,
            )
        except ProviderFailure as exc:
            record.failure, record.retry_after = exc.kind, exc.retry_after
            raise
        record.response = response
        return response

    def save(self, path: Path) -> None:
        # SDK construction/headers and exception bodies are never recorded.
        # The caller owns the artifact location; never overwrite sealed evidence.
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("x", encoding="utf-8") as handle:
            json.dump(
                {
                    "format": "courtlens-provider-transcript-v1",
                    "model": self.model,
                    "steps": [record.model_dump(mode="json") for record in self.records],
                },
                handle,
                indent=2,
                ensure_ascii=False,
            )
            handle.write("\n")


class ReplayProvider:
    def __init__(
        self,
        model: str,
        records: Sequence[RecordedStep],
        expected_tools: Sequence[dict[str, Any]] | None = None,
    ) -> None:
        self.model = model
        self._records = list(records)
        self._index = 0
        self.expected_tools = list(expected_tools) if expected_tools is not None else None

    @classmethod
    def load(cls, path: Path) -> ReplayProvider:
        raw = json.loads(path.read_text())
        if raw.get("format") not in {
            "courtlens-provider-transcript-v1",
            "courtlens-agent-transcript-v1",
        }:
            raise ValueError("unsupported provider transcript")
        return cls(
            raw["model"],
            [RecordedStep.model_validate(step) for step in raw["steps"]],
            expected_tools=raw.get("tools"),
        )

    def verify_tools(self, actual: Sequence[dict[str, Any]]) -> None:
        if self.expected_tools is not None and list(actual) != self.expected_tools:
            raise ValueError("agent transcript retained tool/audit payload drift")

    @property
    def exhausted(self) -> bool:
        return self._index == len(self._records)

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
        if self.exhausted:
            raise ValueError("provider transcript exhausted")
        record = self._records[self._index]
        actual = request_record(
            system_prompt, messages, tools, max_output_tokens, remaining_web_searches
        )
        if actual != record.request:
            raise ValueError("provider transcript request/tool payload drift")
        self._index += 1
        if on_delta:
            for text in record.deltas:
                on_delta(text)
        if record.failure:
            raise ProviderFailure(record.failure, record.retry_after)
        if record.response is None:
            raise ValueError("provider transcript missing response")
        return record.response.model_copy(deep=True)
