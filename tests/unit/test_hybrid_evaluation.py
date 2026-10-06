"""Acceptance scorer must reject pleasant inability and wrong external evidence."""

import json
from pathlib import Path
from uuid import uuid4

from courtload.domain.hybrid_assistant import (
    AnswerSource,
    ExternalClaimBlock,
    HybridTurnResponse,
    InabilityBlock,
    external_claim_text,
)
from courtload.services.assistant.evaluation import score_case


def external_answer():
    record = json.loads(Path("docs/evidence/pf07c-retrieval/sources.json").read_text())[0]
    source = AnswerSource.model_validate(record["source"])
    fact = source.facts[0]
    block = ExternalClaimBlock(
        source_id=source.source_id, text=external_claim_text(fact), **fact.model_dump()
    )
    return HybridTurnResponse(
        request_id=uuid4(),
        thread_id=uuid4(),
        turn_id=uuid4(),
        status="answered",
        intent="external",
        blocks=[block],
        sources=[source],
    )


CASE = {
    "id": "answer-required",
    "category": "external_fact",
    "status": "answered",
    "fact_value": "2023-10-24",
}


def test_answer_required_inability_is_complete_but_not_correct_fact():
    answer = external_answer().model_copy(
        update={
            "status": "unable",
            "blocks": [
                InabilityBlock(
                    reason="external_unavailable",
                    text="I cannot verify this date.",
                    next_action="Open the NBA source.",
                )
            ],
            "sources": [],
        }
    )
    score = score_case(CASE, answer)
    assert score["response_complete"] and not score["correct"]
    assert score["factual_answer_correct"] is False


def test_source_link_alone_cannot_support_a_fact():
    answer = external_answer()
    answer = answer.model_copy(
        update={"sources": [answer.sources[0].model_copy(update={"facts": []})]}
    )
    assert not score_case(CASE, answer)["safety_pass"]


def test_equal_value_wrong_period_is_rejected():
    answer = external_answer()
    source = answer.sources[0]
    source = source.model_copy(
        update={"facts": [source.facts[0].model_copy(update={"period": "2026-27"})]}
    )
    assert not score_case(CASE, answer.model_copy(update={"sources": [source]}))["safety_pass"]


def test_verified_exact_tuple_is_correct():
    score = score_case(CASE, external_answer())
    assert score["correct"] and score["factual_answer_correct"] and score["safety_pass"]
