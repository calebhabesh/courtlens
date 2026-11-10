"""Public Ask on the hosted demo: a few questions per visitor and one shared daily budget.

The demo runs on free provider tiers. Gemini allows a fixed number of requests a day for the
whole site, and one answer spends several of them, so two limits apply:

- each visitor (a hashed client address, set by the dashboard's server proxy) may ask
  ``public_ask_prompts_per_visitor`` questions a day;
- the site stops taking questions once this process has sent so many Gemini requests today that
  one more full answer (``assistant_max_steps`` calls) could cross ``public_ask_daily_requests``.

Both reset at midnight Pacific, when Gemini's free quota resets. Counts live in this process
(the API runs one worker); a restart forgets them, and Gemini's own refusal remains the backstop.
The limits are never a cost control: the keys are free-tier keys with no billing attached.
"""

from __future__ import annotations

import hmac
import re
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from fastapi import Header, HTTPException, Request

from courtlens.config import Settings, get_settings
from courtlens.services.assistant.agent.providers.pool import (
    LEDGER,
    PACIFIC,
    QuotaLedger,
    _next_pacific_midnight,
)

_HASH = re.compile(r"^[0-9a-f]{64}$")


@dataclass(frozen=True)
class AskIdentity:
    """Who is asking, as the dashboard proxy reports it: never a raw address or cookie."""

    visitor: str  # the browser, for conversation ownership
    client: str  # the network address, for the question limit


def ask_identity(request: Request) -> AskIdentity | None:
    """None locally; in public mode both hashed identities are required."""
    if not get_settings().public_ask:
        return None
    visitor = request.headers.get("X-CourtLens-Visitor", "")
    client = request.headers.get("X-CourtLens-Client", "")
    if not (_HASH.match(visitor) and _HASH.match(client)):
        raise HTTPException(403, "Ask is only available through the CourtLens site.")
    return AskIdentity(visitor=visitor, client=client)


def public_ask_writer(
    x_ask_token: str | None = Header(None, alias="X-CourtLens-Ask-Token"),
) -> bool:
    """True when the dashboard proxy presents the Ask-only token in public mode."""
    settings = get_settings()
    expected = settings.public_ask_token.get_secret_value() if settings.public_ask_token else ""
    return bool(
        settings.public_ask
        and expected
        and x_ask_token
        and hmac.compare_digest(x_ask_token.encode(), expected.encode())
    )


@dataclass
class PublicAskLedger:
    ledger: QuotaLedger = LEDGER
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _day: str = ""
    _prompts: dict[str, int] = field(default_factory=dict)

    def _roll(self, now: datetime) -> None:
        day = now.astimezone(PACIFIC).date().isoformat()
        if day != self._day:
            self._day, self._prompts = day, {}

    def status(
        self, client: str, settings: Settings | None = None, now: datetime | None = None
    ) -> dict[str, Any]:
        settings = settings or get_settings()
        now = now or datetime.now(UTC)
        with self._lock:
            self._roll(now)
            used = self._prompts.get(client, 0)
        sent = self.ledger.requests_today("gemini")
        return {
            "enabled": True,
            "per_visitor": settings.public_ask_prompts_per_visitor,
            "remaining": max(0, settings.public_ask_prompts_per_visitor - used),
            "site_open": sent + settings.assistant_max_steps <= settings.public_ask_daily_requests,
            "resets_at": _next_pacific_midnight(now).isoformat(),
        }

    def admit(
        self, client: str, settings: Settings | None = None, now: datetime | None = None
    ) -> dict[str, Any]:
        """Count one question or refuse it with a 429 that says which limit and when it resets."""
        settings = settings or get_settings()
        now = now or datetime.now(UTC)
        status = self.status(client, settings, now)
        if not status["site_open"]:
            raise HTTPException(
                429,
                {
                    "code": "site_limit",
                    "message": "Today's shared question limit for the CourtLens demo is used up.",
                    **status,
                },
            )
        with self._lock:
            self._roll(now)
            used = self._prompts.get(client, 0)
            if used >= settings.public_ask_prompts_per_visitor:
                raise HTTPException(
                    429,
                    {
                        "code": "visitor_limit",
                        "message": "You've used today's questions on the CourtLens demo.",
                        **{**status, "remaining": 0},
                    },
                )
            self._prompts[client] = used + 1
            return {**status, "remaining": settings.public_ask_prompts_per_visitor - used - 1}

    def reset(self) -> None:
        with self._lock:
            self._day, self._prompts = "", {}


PUBLIC_ASK = PublicAskLedger()
