"""Public Ask limits reset at midnight Pacific, with Gemini's free quota."""

from datetime import UTC, datetime

import pytest
from fastapi import HTTPException

from courtlens.config import Settings
from courtlens.services.assistant.agent.providers.pool import QuotaLedger
from courtlens.services.assistant.public_ask import PublicAskLedger


class Sent(QuotaLedger):
    def __init__(self, count):
        super().__init__()
        self.count = count

    def requests_today(self, name):
        return self.count if name == "gemini" else 999


def settings(**kw):
    return Settings(
        public_ask=True, public_ask_prompts_per_visitor=2, public_ask_daily_requests=480, **kw
    )


def test_visitor_limit_resets_at_midnight_pacific():
    ledger = PublicAskLedger(ledger=Sent(0))
    evening = datetime(2026, 11, 10, 7, 59, tzinfo=UTC)  # 23:59 Pacific
    assert ledger.admit("a", settings(), evening)["remaining"] == 1
    assert ledger.admit("a", settings(), evening)["remaining"] == 0
    with pytest.raises(HTTPException) as refused:
        ledger.admit("a", settings(), evening)
    assert refused.value.status_code == 429
    assert refused.value.detail["code"] == "visitor_limit"
    assert refused.value.detail["resets_at"] == "2026-11-10T08:00:00+00:00"
    after = datetime(2026, 11, 10, 8, 1, tzinfo=UTC)
    assert ledger.admit("a", settings(), after)["remaining"] == 1


def test_site_closes_when_one_more_answer_could_cross_the_budget():
    # Only Gemini counts; Groq's own limits are its own.
    assert PublicAskLedger(ledger=Sent(474)).status("a", settings())["site_open"] is True
    assert PublicAskLedger(ledger=Sent(475)).status("a", settings())["site_open"] is False
    with pytest.raises(HTTPException) as refused:
        PublicAskLedger(ledger=Sent(475)).admit("a", settings())
    assert refused.value.detail["code"] == "site_limit"


def test_a_refused_question_is_not_counted():
    ledger = PublicAskLedger(ledger=Sent(475))
    with pytest.raises(HTTPException):
        ledger.admit("a", settings())
    ledger.ledger = Sent(0)
    assert ledger.status("a", settings())["remaining"] == 2
