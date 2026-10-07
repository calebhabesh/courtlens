"""AG06 scoring rules, incomplete denominators and sealed holdout enforcement."""

import json
from pathlib import Path
from uuid import UUID

import pytest

from courtlens.domain.assistant_agent import (
    AgentAccounting,
    AgentSource,
    AgentTurnResponse,
    ProseBlock,
    ProvenanceReport,
)
from courtlens.services.assistant.agent.evaluation import (
    _equal,
    load_corpus,
    score_answer,
    summarize,
)

ROOT = Path(__file__).resolve().parents[2]


def answer(**updates):
    return AgentTurnResponse(
        request_id=UUID(int=1),
        thread_id=UUID(int=2),
        turn_id=UUID(int=3),
        status="answered",
        answer=ProseBlock(text="A screen helps the ball handler."),
        accounting=AgentAccounting(provider="fixture", model="fixture", prompt_version="fixture"),
        **updates,
    )


def test_frozen_corpus_retains_v2_and_has_fresh_holdout():
    corpus, _ = load_corpus(ROOT / "evaluation/assistant/ag-v3.json")
    old = json.loads((ROOT / "evaluation/assistant/ar02-v2.json").read_text())
    by_id = {c["id"]: c for c in corpus["cases"]}
    for c in old["cases"]:
        assert by_id[c["id"]]["v2_expected_status"] == c["expected_status"]
        assert by_id[c["id"]]["split"] == "dev"
    assert sum(c["category"] == "web" and c["split"] == "dev" for c in corpus["cases"]) >= 20
    assert sum(c["category"] == "web" and c["split"] == "holdout" for c in corpus["cases"]) >= 6
    assert sum(c["category"] == "conflict" and c["split"] == "dev" for c in corpus["cases"]) >= 10


def test_frozen_checksum_rejects_corpus_edits(tmp_path):
    path = tmp_path / "ag-v3.json"
    path.write_text("{}")
    path.with_suffix(".sha256").write_text("0" * 64)
    with pytest.raises(ValueError, match="checksum mismatch"):
        load_corpus(path)


def test_display_tolerance_excludes_identity_order_and_sample_counts():
    assert _equal(
        [{"player_id": "a", "value": 20.04, "n": 30}], [{"player_id": "a", "value": 20.0, "n": 30}]
    )
    assert not _equal(
        [{"player_id": "b", "value": 20.04, "n": 30}], [{"player_id": "a", "value": 20.0, "n": 30}]
    )
    assert not _equal({"value": 20.06}, {"value": 20.0})
    assert not _equal({"n": 30.04}, {"n": 30})
    assert not _equal([1, 2], [2, 1])


def test_general_keywords_and_unsupported_numbers_are_independent_gates():
    case = {
        "id": "concept",
        "category": "general",
        "expected_status": "answered",
        "oracle": {"kind": "general", "terms": ["screen", "ball"]},
    }
    expected = {"kind": "general", "status": "answered"}
    assert score_answer(case, expected, answer(), {})["exact_answer"]
    response = answer(provenance=ProvenanceReport(unsupported_numbers=["99"]))
    assert score_answer(case, expected, response, {})["failures"] == ["unsupported_numbers"]
    assert (
        "general_keywords"
        in score_answer({**case, "oracle": {"terms": ["rebound"]}}, expected, answer(), {})[
            "failures"
        ]
    )


def test_web_citation_must_be_used_and_limited_mode_is_not_accuracy():
    case = {
        "id": "web",
        "category": "web",
        "expected_status": "answered",
        "oracle": {"kind": "web"},
    }
    expected = {"kind": "web", "status": "answered"}
    source = AgentSource(
        source_id="s1",
        origin="web",
        title="Fixture",
        publisher="example.org",
        url="https://example.org/report",
    )
    assert (
        "web_citation_missing"
        in score_answer(case, expected, answer(sources=[source]), {})["failures"]
    )
    response = answer(sources=[source]).model_copy(
        update={"answer": ProseBlock(text="A source answers this.[^s1]")}
    )
    assert score_answer(case, expected, response, {})["exact_answer"]
    response = response.model_copy(update={"mode": "limited"})
    assert (
        "provider_unavailable_or_limited" in score_answer(case, expected, response, {})["failures"]
    )


def test_incomplete_runs_do_not_claim_flakiness_or_zero_cost():
    case = {
        "id": "concept",
        "category": "general",
        "expected_status": "answered",
        "oracle": {"terms": ["screen"]},
    }
    record = score_answer(case, {"kind": "general", "status": "answered"}, answer(), {})
    partial = summarize([record, record], planned=4, runs=3)
    assert partial["coverage"] == {
        "completed_runs": 2,
        "planned_runs": 12,
        "completed_questions": 0,
        "planned_questions": 4,
    }
    assert partial["flakiness"]["rate"] is None
    assert partial["estimated_cost_usd"]["total"] is None
    complete = summarize([record, record, {**record, "exact_answer": False}], planned=4, runs=3)
    assert complete["flakiness"] == {"correct": 1, "total": 1, "rate": 1}
