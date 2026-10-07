"""Provider-independent tool turns and bounded SDK failure handling."""

from __future__ import annotations

import math
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any, Literal, Protocol
from urllib.parse import urlsplit

from pydantic import BaseModel, ConfigDict, Field

DEFAULT_MODELS = {
    "gemini": "gemini-3.8-flash",
    "anthropic": "claude-sonnet-5-5",
    "openai": "gpt-6.1-sol",
}
DeltaCallback = Callable[[str], None]
FailureKind = Literal[
    "provider_quota", "provider_busy", "provider_timeout", "provider_error", "provider_disabled"
]


class ProviderModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ToolCall(ProviderModel):
    id: str
    name: str
    arguments: dict[str, Any]


class ToolResult(ProviderModel):
    call_id: str
    name: str
    payload: dict[str, Any]
    is_error: bool = False


class ToolDeclaration(ProviderModel):
    name: str
    description: str
    parameters: dict[str, Any]


class Citation(ProviderModel):
    url: str
    title: str
    publisher: str
    retrieved_at: datetime
    cited_text: str | None = None
    span: tuple[int, int] | None = None


class Usage(ProviderModel):
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    cached_input_tokens: int = Field(default=0, ge=0)
    cache_write_tokens: int = Field(default=0, ge=0)
    web_searches: int = Field(default=0, ge=0)

    @property
    def total_tokens(self) -> int:
        # Cache tokens are included in input_tokens, not added twice.
        return self.input_tokens + self.output_tokens


class AgentMessage(ProviderModel):
    role: Literal["user", "assistant", "tool"]
    text: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    tool_results: list[ToolResult] = Field(default_factory=list)
    # Exact provider content (thought signatures, encrypted search results, reasoning items).
    # Server-owned, never accepted from chat input or rendered as answer prose.
    native_content: list[dict[str, Any]] = Field(default_factory=list)


class AgentStep(ProviderModel):
    text: str = ""
    tool_calls: list[ToolCall] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    usage: Usage = Field(default_factory=Usage)
    native_content: list[dict[str, Any]] = Field(default_factory=list)
    model: str | None = None
    search_limit_reached: bool = False
    search_errors: list[str] = Field(default_factory=list)
    sdk_response: dict[str, Any] = Field(default_factory=dict)
    completed_tool_results: list[ToolResult] = Field(default_factory=list)
    provider_calls: int = Field(default=1, ge=1)

    def as_message(self) -> AgentMessage:
        return AgentMessage(
            role="assistant",
            text=self.text,
            tool_calls=self.tool_calls,
            native_content=self.native_content,
        )

    def as_messages(self) -> list[AgentMessage]:
        messages = [self.as_message()]
        if self.completed_tool_results:
            messages.append(AgentMessage(role="tool", tool_results=self.completed_tool_results))
        return messages


class AgentProvider(Protocol):
    model: str

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
    ) -> AgentStep: ...


class ProviderFailure(RuntimeError):
    """Safe reason only: SDK exception bodies may contain credentials or user text."""

    def __init__(self, kind: FailureKind, retry_after: int | None = None) -> None:
        super().__init__(kind)
        self.kind = kind
        self.retry_after = retry_after


def map_failure(exc: Exception) -> ProviderFailure:
    if isinstance(exc, ProviderFailure):
        return exc
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status == 429:
        headers = getattr(getattr(exc, "response", None), "headers", {})
        value = headers.get("retry-after", headers.get("Retry-After", "60"))
        try:
            retry = math.ceil(float(value))
        except (ValueError, TypeError):
            try:
                retry = math.ceil(
                    (parsedate_to_datetime(value) - datetime.now(UTC)).total_seconds()
                )
            except (ValueError, TypeError, OverflowError):
                retry = 60
        return ProviderFailure("provider_quota", max(1, min(86400, retry)))
    if isinstance(exc, TimeoutError) or "timeout" in type(exc).__name__.lower() or status == 504:
        return ProviderFailure("provider_timeout")
    if isinstance(status, int) and status >= 500:
        return ProviderFailure("provider_busy")
    return ProviderFailure("provider_error")


def citation(
    url: str,
    title: str,
    *,
    cited_text: str | None = None,
    span: tuple[int, int] | None = None,
) -> Citation | None:
    parsed = urlsplit(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username:
        return None
    return Citation(
        url=url,
        title=title,
        publisher=parsed.hostname,
        retrieved_at=datetime.now(UTC),
        cited_text=cited_text,
        span=span,
    )


def check_budget(
    timeout_seconds: float, max_output_tokens: int, remaining_web_searches: int
) -> None:
    if timeout_seconds <= 0:
        raise ProviderFailure("provider_timeout")
    if max_output_tokens < 1 or remaining_web_searches < 0:
        raise ValueError("invalid provider budget")
