"""AR09 official award/championship answers from the pinned, sourced registry."""

import hashlib
import json
from datetime import date
from unittest.mock import Mock
from uuid import uuid4

import pytest

from courtload.domain.hybrid_assistant import HybridTurnRequest
from courtload.services.assistant import awards
from courtload.services.assistant.hybrid import route_intent, run_hybrid_turn

TODAY = date(2026, 10, 7)


def turn(message):
    return run_hybrid_turn(
        Mock(), HybridTurnRequest(request_id=uuid4(), message=message), clock=lambda: TODAY
    )


def test_registry_is_pinned_and_every_record_cites_nba_com():
    raw = awards.REGISTRY.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == (
        awards.REGISTRY.with_suffix(".sha256").read_text().strip()
    )
    records = json.loads(raw)["records"]
    assert records and all(r["url"].startswith("https://www.nba.com/") for r in records)
    assert len({(r["season"], r["award"]) for r in records}) == len(records)


@pytest.mark.parametrize(
    ("message", "text", "season"),
    [
        (
            "Who won mvp last season",
            "Shai Gilgeous-Alexander (Oklahoma City Thunder) won the 2025-26 Kia MVP.",
            "2025-26",
        ),
        (
            "Who won the 2025 championship?",
            "Oklahoma City Thunder won the 2024-25 NBA championship.",
            "2024-25",
        ),
        (
            "Who won Finals MVP last season?",
            "Jalen Brunson (New York Knicks) won the 2025-26 Bill Russell NBA Finals MVP.",
            "2025-26",
        ),
        (
            "Who was rookie of the year in 2023-24?",
            "Victor Wembanyama (San Antonio Spurs) won the 2023-24 Kia Rookie of the Year.",
            "2023-24",
        ),
    ],
)
def test_award_answers_are_sourced_without_provider_or_database(message, text, season):
    assert route_intent(message) == "external"
    answer = turn(message)
    assert answer.status == "answered", answer.model_dump_json()
    claim = answer.blocks[0]
    assert claim.kind == "external_claim"
    assert claim.text == text
    assert claim.period == f"{season} season"
    assert answer.sources[0].url.startswith("https://www.nba.com/")
    assert answer.sources[0].verification == "verified"
    assert answer.actions[0].kind == "source"
    assert answer.accounting.provider_calls == answer.accounting.analytical_calls == 0
    assert not answer.saveable


def test_season_outside_registry_says_so():
    answer = turn("Who won MVP in 2015?")
    assert answer.status == "unable"
    assert answer.blocks[0].reason == "external_unavailable"
    assert "2014-15" in answer.blocks[0].text


@pytest.mark.parametrize(
    "message",
    [
        "How many MVPs has Nikola Jokić won?",
        "Who has the most championships ever?",
        "Who will win MVP this season?",
        "MVP ladder",
    ],
)
def test_counts_history_and_predictions_are_not_registry_lookups(message):
    assert awards.match_award(message) is None


def test_concept_questions_stay_explanations():
    assert route_intent("What is the MVP award?") != "external"


def test_tampered_registry_is_refused(tmp_path, monkeypatch):
    copy = tmp_path / "nba-awards-v1.json"
    copy.write_text(awards.REGISTRY.read_text().replace("Cooper Flagg", "Someone Else"))
    copy.with_suffix(".sha256").write_text(awards.REGISTRY.with_suffix(".sha256").read_text())
    monkeypatch.setattr(awards, "REGISTRY", copy)
    awards._registry.cache_clear()
    try:
        answer = turn("Who won rookie of the year last season?")
        assert answer.status == "unable"
        assert answer.blocks[0].reason == "external_unavailable"
        assert "Someone Else" not in answer.model_dump_json()
    finally:
        awards._registry.cache_clear()
