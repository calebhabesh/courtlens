"""Ordered provider pool with a process-wide quota ledger and mid-turn failover.

The pool spends one step on the first member whose quota is known to have room, and moves to
the next member when one is rate-limited, busy or fails. It never calls a member that is
cooling down after a 429, so a spent free tier is not hammered. Members are the configured
providers only; paid providers join only when the owner lists them (see config).
"""

from __future__ import annotations

import json
import logging
import math
import threading
import time
from collections import deque
from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from courtlens.services.assistant.agent.providers.base import (
    AgentMessage,
    AgentProvider,
    AgentStep,
    DeltaCallback,
    ProviderFailure,
    ToolDeclaration,
)

logger = logging.getLogger(__name__)
PACIFIC = ZoneInfo("America/Los_Angeles")
CHARS_PER_TOKEN = 3.5
# Never sleep for quota longer than this inside one step, and leave time to answer.
MAX_WAIT_SECONDS = 30.0
MIN_STEP_SECONDS = 10.0
FAILOVER_KINDS = {"provider_quota", "provider_busy", "provider_error"}


@dataclass(frozen=True)
class Limits:
    requests_per_minute: int | None = None
    tokens_per_minute: int | None = None
    requests_per_day: int | None = None
    # Gemini daily quotas reset at midnight Pacific; others report their own reset.
    daily_reset_pacific: bool = False


@dataclass
class _State:
    limits: Limits = field(default_factory=Limits)
    minute: deque[tuple[float, int]] = field(default_factory=deque)
    day: str = ""
    day_requests: int = 0
    cooldown_until: float = 0.0
    cooldown_wall: datetime | None = None
    too_large_tokens: int | None = None
    last_quota: dict[str, Any] | None = None
    # Header-reported token bucket (Groq): remaining tokens at observation time.
    header_tokens: tuple[float, int, int] | None = None
    header_requests: tuple[int, float] | None = None
    calls: int = 0
    # Learned ratio of reported to estimated tokens (estimates are deliberately coarse).
    calibration: float = 1.0
    failures: int = 0


def _duration(value: str | None) -> float | None:
    """Parse Groq reset durations such as "1m26.4s", "667ms" or "2h3m"."""
    if not value:
        return None
    total, number = 0.0, ""
    text = value.strip()
    index = 0
    while index < len(text):
        char = text[index]
        if char.isdigit() or char == ".":
            number += char
        else:
            unit = "ms" if text.startswith("ms", index) else char
            index += len(unit) - 1
            scale = {"ms": 0.001, "s": 1, "m": 60, "h": 3600}.get(unit)
            if scale is None or not number:
                return None
            total += float(number) * scale
            number = ""
        index += 1
    if number:
        total += float(number)
    return total


def _next_pacific_midnight(now: datetime) -> datetime:
    local = now.astimezone(PACIFIC)
    tomorrow = (local + timedelta(days=1)).date()
    return datetime(tomorrow.year, tomorrow.month, tomorrow.day, tzinfo=PACIFIC).astimezone(UTC)


class QuotaLedger:
    """Thread-safe per-(provider, model) quota memory for this server process."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._states: dict[tuple[str, str], _State] = {}

    def _state(self, name: str, model: str, limits: Limits | None = None) -> _State:
        state = self._states.setdefault((name, model), _State())
        if limits is not None:
            state.limits = limits
        return state

    def _roll(self, state: _State, now: float, wall: datetime) -> None:
        while state.minute and now - state.minute[0][0] >= 60:
            state.minute.popleft()
        day = (
            wall.astimezone(PACIFIC).date().isoformat()
            if state.limits.daily_reset_pacific
            else wall.date().isoformat()
        )
        if day != state.day:
            state.day, state.day_requests = day, 0

    def wait_seconds(
        self, name: str, model: str, limits: Limits, tokens: int, *, now: float | None = None
    ) -> float | None:
        """Seconds until this request fits; None when it never can on this member."""
        now = time.monotonic() if now is None else now
        wall = datetime.now(UTC)
        with self._lock:
            state = self._state(name, model, limits)
            self._roll(state, now, wall)
            if state.too_large_tokens is not None and tokens >= state.too_large_tokens:
                return None
            waits = [max(0.0, state.cooldown_until - now)]
            if limits.requests_per_minute and len(state.minute) >= limits.requests_per_minute:
                index = len(state.minute) - limits.requests_per_minute
                waits.append(60 - (now - state.minute[index][0]))
            if limits.tokens_per_minute:
                if tokens > limits.tokens_per_minute:
                    return None
                used = sum(spent for _, spent in state.minute)
                excess = used + tokens - limits.tokens_per_minute
                for stamp, spent in state.minute:
                    if excess <= 0:
                        break
                    excess -= spent
                    waits.append(60 - (now - stamp))
            if state.header_tokens is not None:
                observed, remaining, limit = state.header_tokens
                if tokens > limit:
                    return None
                available = min(limit, remaining + (now - observed) * limit / 60)
                if tokens > available:
                    waits.append((tokens - available) * 60 / limit)
            if state.header_requests is not None:
                remaining_requests, reset_at = state.header_requests
                if remaining_requests <= 0 and reset_at > now:
                    waits.append(reset_at - now)
            if limits.requests_per_day and state.day_requests >= limits.requests_per_day:
                reset = (
                    _next_pacific_midnight(wall)
                    if limits.daily_reset_pacific
                    else wall + timedelta(hours=1)
                )
                waits.append((reset - wall).total_seconds())
            return max(waits)

    def record_success(
        self,
        name: str,
        model: str,
        tokens: int,
        headers: dict[str, str] | None = None,
        *,
        requests: int = 1,
        estimated: int | None = None,
        now: float | None = None,
    ) -> None:
        now = time.monotonic() if now is None else now
        with self._lock:
            state = self._state(name, model)
            if estimated and tokens:
                ratio = min(1.5, max(0.15, tokens / estimated))
                state.calibration = (
                    ratio if state.calls == 0 else 0.7 * state.calibration + 0.3 * ratio
                )
            self._roll(state, now, datetime.now(UTC))
            state.minute.append((now, tokens))
            state.minute.extend((now, 0) for _ in range(max(0, requests - 1)))
            state.day_requests += max(1, requests)
            state.calls += 1
            state.cooldown_until, state.cooldown_wall = 0.0, None
            if headers:
                self._observe(state, headers, now)

    def calibrated(self, name: str, model: str, estimate: int) -> int:
        with self._lock:
            return max(1, int(estimate * self._state(name, model).calibration))

    def record_attempt(self, name: str, model: str, *, now: float | None = None) -> None:
        """A failed request still spends a request slot on the provider's side."""
        now = time.monotonic() if now is None else now
        with self._lock:
            state = self._state(name, model)
            self._roll(state, now, datetime.now(UTC))
            state.minute.append((now, 0))
            state.day_requests += 1
            state.failures += 1

    def record_failure(
        self,
        name: str,
        model: str,
        failure: ProviderFailure,
        tokens: int,
        headers: dict[str, str] | None = None,
        *,
        now: float | None = None,
    ) -> None:
        now = time.monotonic() if now is None else now
        wall = datetime.now(UTC)
        with self._lock:
            state = self._state(name, model)
            if headers:
                self._observe(state, headers, now)
            if failure.kind != "provider_quota":
                return
            if failure.quota_scope == "request_too_large":
                state.too_large_tokens = min(tokens, state.too_large_tokens or tokens)
                return
            seconds = float(failure.retry_after or 60)
            if failure.quota_scope == "day" and state.limits.daily_reset_pacific:
                seconds = max(seconds, (_next_pacific_midnight(wall) - wall).total_seconds())
            state.cooldown_until = max(state.cooldown_until, now + seconds)
            state.cooldown_wall = wall + timedelta(seconds=state.cooldown_until - now)
            state.last_quota = {
                "scope": failure.quota_scope,
                "quota_id": failure.quota_id,
                "limit": failure.quota_limit,
                "at": wall.isoformat(),
            }

    def _observe(self, state: _State, headers: dict[str, str], now: float) -> None:
        try:
            limit = int(headers["x-ratelimit-limit-tokens"])
            remaining = int(headers["x-ratelimit-remaining-tokens"])
            state.header_tokens = (now, remaining, limit)
        except (KeyError, ValueError):
            pass
        try:
            remaining_requests = int(headers["x-ratelimit-remaining-requests"])
            reset = _duration(headers.get("x-ratelimit-reset-requests")) or 0.0
            state.header_requests = (remaining_requests, now + reset)
        except (KeyError, ValueError):
            pass

    def snapshot(self, name: str, model: str) -> dict[str, Any]:
        now = time.monotonic()
        with self._lock:
            state = self._state(name, model)
            self._roll(state, now, datetime.now(UTC))
            cooling = state.cooldown_until > now
            snapshot: dict[str, Any] = {
                "provider": name,
                "model": model,
                "state": "cooling_down" if cooling else "ready",
                "available_at": state.cooldown_wall.isoformat()
                if cooling and state.cooldown_wall
                else None,
                "requests_last_minute": len(state.minute),
                "requests_today": state.day_requests,
                "last_quota": state.last_quota,
            }
            if state.header_requests is not None:
                snapshot["provider_requests_remaining"] = state.header_requests[0]
            if state.header_tokens is not None:
                snapshot["provider_tokens_per_minute"] = state.header_tokens[2]
            return snapshot

    def requests_today(self, name: str) -> int:
        """Calls this process sent to a provider today (its own daily reset), across models."""
        now, wall = time.monotonic(), datetime.now(UTC)
        with self._lock:
            total = 0
            for (provider, _model), state in self._states.items():
                if provider == name:
                    self._roll(state, now, wall)
                    total += state.day_requests
            return total

    def reset(self) -> None:
        with self._lock:
            self._states.clear()


LEDGER = QuotaLedger()


@dataclass(frozen=True)
class PoolMember:
    name: str
    provider: AgentProvider
    limits: Limits = field(default_factory=Limits)


def estimate_tokens(
    member: PoolMember,
    system_prompt: str,
    messages: Sequence[AgentMessage],
    tools: Sequence[ToolDeclaration],
) -> int:
    estimator = getattr(member.provider, "estimate_tokens", None)
    if callable(estimator):
        return int(estimator(system_prompt, messages, tools))
    size = len(system_prompt) + len(json.dumps([t.model_dump(mode="json") for t in tools]))
    size += sum(
        len(m.text) + len(json.dumps([r.payload for r in m.tool_results], default=str))
        for m in messages
    )
    return int(size / CHARS_PER_TOKEN) + 800


def _fingerprint(message: AgentMessage) -> str:
    return json.dumps(message.native_content, sort_keys=True, default=str)


def _flatten(messages: Sequence[AgentMessage], keep: set[int]) -> list[AgentMessage]:
    """Replay another provider's tool exchange as plain text this member can accept.

    Native content (thought signatures, encrypted reasoning) is only valid for the provider
    that produced it, so foreign tool calls and their results become readable notes.
    """
    out: list[AgentMessage] = []
    foreign_calls: set[str] = set()
    for index, message in enumerate(messages):
        if message.role == "assistant" and index not in keep and message.tool_calls:
            foreign_calls.update(call.id for call in message.tool_calls)
            calls = "; ".join(
                f"{call.name}({json.dumps(call.arguments, sort_keys=True)})"
                for call in message.tool_calls
            )
            text = (message.text + "\n" if message.text else "") + f"[Earlier tool calls: {calls}]"
            out.append(AgentMessage(role="assistant", text=text))
        elif message.role == "assistant" and index not in keep:
            out.append(AgentMessage(role="assistant", text=message.text))
        elif message.role == "tool" and any(
            r.call_id in foreign_calls for r in message.tool_results
        ):
            notes = [
                f"{r.name} result: {json.dumps(r.payload, default=str)[:6000]}"
                for r in message.tool_results
            ]
            out.append(AgentMessage(role="user", text="[Tool results]\n" + "\n".join(notes)))
        else:
            out.append(message)
    return out


class PooledProvider:
    """AgentProvider over ordered members. One instance serves one turn."""

    def __init__(self, members: Sequence[PoolMember], *, ledger: QuotaLedger = LEDGER) -> None:
        if not members:
            raise ProviderFailure("provider_disabled")
        self.members = list(members)
        self.ledger = ledger
        self.active = self.members[0]
        self._produced: dict[str, str] = {}
        self.attempts: list[dict[str, Any]] = []

    @property
    def model(self) -> str:
        return self.active.provider.model

    @property
    def provider_name(self) -> str:
        return self.active.name

    def _portable(self, member: PoolMember, messages: Sequence[AgentMessage]) -> list[AgentMessage]:
        if len(self.members) == 1:
            return list(messages)
        keep = {
            index
            for index, message in enumerate(messages)
            if message.role == "assistant"
            and (
                (
                    message.native_content
                    and self._produced.get(_fingerprint(message)) == member.name
                )
                or (not message.native_content and not message.tool_calls)
            )
        }
        if all(index in keep for index, m in enumerate(messages) if m.role == "assistant"):
            return list(messages)
        return _flatten(messages, keep)

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
        deadline = time.monotonic() + timeout_seconds
        tried: set[tuple[str, str]] = set()
        quota_waits: set[tuple[str, str]] = set()
        failed_calls = 0
        last: ProviderFailure | None = None
        while True:
            now = time.monotonic()
            options: list[tuple[float, int, PoolMember, list[AgentMessage], int, int]] = []
            for order, member in enumerate(self.members):
                if (member.name, member.provider.model) in tried:
                    continue
                portable = self._portable(member, messages)
                raw_estimate = estimate_tokens(member, system_prompt, portable, tools)
                tokens = self.ledger.calibrated(member.name, member.provider.model, raw_estimate)
                wait = self.ledger.wait_seconds(
                    member.name, member.provider.model, member.limits, tokens, now=now
                )
                if wait is not None:
                    options.append((wait, order, member, portable, tokens, raw_estimate))
            if not options:
                raise last or self._exhausted()
            ready = [option for option in options if option[0] <= 0]
            wait, _, member, portable, tokens, raw_estimate = ready[0] if ready else min(options)
            budget = deadline - now - MIN_STEP_SECONDS
            if wait > 0 and (wait > MAX_WAIT_SECONDS or wait > budget):
                raise ProviderFailure(
                    "provider_quota",
                    max(1, math.ceil(min(option[0] for option in options))),
                    quota_scope="minute" if wait < 3600 else "day",
                )
            if wait > 0:
                time.sleep(wait)
            emitted = False

            def delta(text: str) -> None:
                nonlocal emitted
                emitted = True
                if on_delta is not None:
                    on_delta(text)

            try:
                result = member.provider.step(
                    system_prompt,
                    portable,
                    tools,
                    timeout_seconds=deadline - time.monotonic(),
                    max_output_tokens=max_output_tokens,
                    remaining_web_searches=remaining_web_searches,
                    on_delta=delta if on_delta is not None else None,
                )
            except ProviderFailure as failure:
                headers = getattr(member.provider, "last_rate_limits", None)
                self.ledger.record_attempt(member.name, member.provider.model)
                self.ledger.record_failure(
                    member.name, member.provider.model, failure, tokens, headers
                )
                self.attempts.append(
                    {
                        "provider": member.name,
                        "model": member.provider.model,
                        "failure": failure.kind,
                    }
                )
                if failure.kind == "provider_quota":
                    logger.warning(
                        "assistant provider quota: provider=%s model=%s scope=%s quota_id=%s "
                        "limit=%s retry_after=%s",
                        member.name,
                        member.provider.model,
                        failure.quota_scope,
                        failure.quota_id,
                        failure.quota_limit,
                        failure.retry_after,
                    )
                failed_calls += 1
                last = failure
                key = (member.name, member.provider.model)
                # A short per-minute limit is worth one wait on the same member; the ledger's
                # cooldown makes the next pass prefer any other ready member first.
                if (
                    failure.kind == "provider_quota"
                    and failure.quota_scope == "minute"
                    and (failure.retry_after or 60) <= MAX_WAIT_SECONDS
                    and key not in quota_waits
                    and not emitted
                ):
                    quota_waits.add(key)
                else:
                    tried.add(key)
                # Streamed prose cannot be withdrawn here, and a timeout spent the deadline.
                if emitted or failure.kind not in FAILOVER_KINDS:
                    raise
                if deadline - time.monotonic() < MIN_STEP_SECONDS:
                    raise
                continue
            result.provider_calls += failed_calls
            self.ledger.record_success(
                member.name,
                member.provider.model,
                result.usage.total_tokens or tokens,
                getattr(member.provider, "last_rate_limits", None),
                requests=result.provider_calls - failed_calls,
                estimated=raw_estimate,
            )
            self.active = member
            self._produced[_fingerprint(result.as_message())] = member.name
            self.attempts.append(
                {"provider": member.name, "model": member.provider.model, "failure": None}
            )
            return result

    def _exhausted(self) -> ProviderFailure:
        return ProviderFailure("provider_quota", 60, quota_scope="request_too_large")
