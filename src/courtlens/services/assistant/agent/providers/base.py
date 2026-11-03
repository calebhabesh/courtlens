"""Provider-independent tool turns and bounded SDK failure handling."""

from __future__ import annotations

import math
import re
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
# Pool members outside the original three single-provider adapters (kept separate so the
# parametrized native-search adapter contracts above stay exact).
PROVIDER_DEFAULT_MODELS = {**DEFAULT_MODELS, "groq": "openai/gpt-oss-120b"}
DeltaCallback = Callable[[str], None]
QuotaScope = Literal["minute", "day", "request_too_large"]
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
    @property
    def model(self) -> str: ...

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

    def __init__(
        self,
        kind: FailureKind,
        retry_after: int | None = None,
        *,
        quota_scope: QuotaScope | None = None,
        quota_id: str | None = None,
        quota_limit: int | None = None,
    ) -> None:
        super().__init__(kind)
        self.kind = kind
        self.retry_after = retry_after
        # Quota identifiers are provider metric names (never request text or credentials).
        self.quota_scope = quota_scope
        self.quota_id = quota_id
        self.quota_limit = quota_limit


_QUOTA_ID = re.compile(r"[^A-Za-z0-9_.\-/]")


def _seconds(value: Any) -> int | None:
    """Parse a Retry-After header, an HTTP date, or a Google RetryInfo "12.5s" delay."""
    if value is None:
        return None
    text = str(value).strip()
    try:
        return math.ceil(float(text.removesuffix("s")))
    except ValueError:
        pass
    try:
        return math.ceil((parsedate_to_datetime(text) - datetime.now(UTC)).total_seconds())
    except (ValueError, TypeError, OverflowError):
        return None


def _google_quota(exc: Exception) -> tuple[int | None, str | None, int | None]:
    """RetryInfo delay and the first QuotaFailure violation from a google.rpc error body."""
    body = getattr(exc, "details", None)
    if isinstance(body, dict) and isinstance(body.get("error"), dict):
        body = body["error"]
    details = body.get("details") if isinstance(body, dict) else None
    retry = quota_id = limit = None
    for detail in details if isinstance(details, list) else []:
        if not isinstance(detail, dict):
            continue
        kind = str(detail.get("@type", ""))
        if kind.endswith("google.rpc.RetryInfo"):
            retry = _seconds(detail.get("retryDelay"))
        elif kind.endswith("google.rpc.QuotaFailure") and quota_id is None:
            for violation in detail.get("violations") or []:
                if isinstance(violation, dict) and violation.get("quotaId"):
                    quota_id = _QUOTA_ID.sub("", str(violation["quotaId"]))[:120] or None
                    try:
                        limit = int(str(violation.get("quotaValue")))
                    except (TypeError, ValueError):
                        limit = None
                    break
    return retry, quota_id, limit


def _quota_scope(quota_id: str | None, retry: int) -> QuotaScope:
    if quota_id and "perday" in quota_id.lower():
        return "day"
    return "day" if retry > 3600 else "minute"


def map_failure(exc: Exception) -> ProviderFailure:
    if isinstance(exc, ProviderFailure):
        return exc
    status = getattr(exc, "status_code", None) or getattr(exc, "code", None)
    if status == 413 and _rate_limited_body(exc):
        # Groq: one request larger than the per-minute token allowance can never succeed there.
        return ProviderFailure("provider_quota", 60, quota_scope="request_too_large")
    if status == 429:
        headers = getattr(getattr(exc, "response", None), "headers", None) or {}
        header_retry = _seconds(headers.get("retry-after", headers.get("Retry-After")))
        google_retry, quota_id, limit = _google_quota(exc)
        retry = max(1, min(86400, header_retry or google_retry or 60))
        return ProviderFailure(
            "provider_quota",
            retry,
            quota_scope=_quota_scope(quota_id, retry),
            quota_id=quota_id,
            quota_limit=limit,
        )
    if isinstance(exc, TimeoutError) or "timeout" in type(exc).__name__.lower() or status == 504:
        return ProviderFailure("provider_timeout")
    if isinstance(status, int) and status >= 500:
        return ProviderFailure("provider_busy")
    return ProviderFailure("provider_error")


def _rate_limited_body(exc: Exception) -> bool:
    body = getattr(exc, "body", None)
    if isinstance(body, dict) and isinstance(body.get("error"), dict):
        body = body["error"]
    return isinstance(body, dict) and body.get("code") == "rate_limit_exceeded"


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
