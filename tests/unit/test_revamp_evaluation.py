"""AR02 scoring must detect errors independently of plan and response completeness."""

import hashlib
import json
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

import pytest

from courtload.domain.hybrid_assistant import HybridTurnResponse, InabilityBlock, TextBlock
from courtload.services.assistant.revamp_evaluation import (
    CORPUS,
    GENERAL_LABEL,
    load_corpus,
    score_answer,
    summarize,
)


def test_frozen_corpus_has_disjoint_families_and_all_categories():
    corpus, _ = load_corpus()
    assert len(corpus["cases"]) == 150
    assert corpus["runs"] == 3
    assert {s: sum(c["split"] == s for c in corpus["cases"]) for s in ("dev", "holdout")} == {
        "dev": 120,
        "holdout": 30,
    }
    assert {c["category"] for c in corpus["cases"]} == {
        "leaders",
        "single_player",
        "compare",
        "follow_up",
        "general",
        "mixed",
        "clarify_refuse",
        "forecast",
    }


def test_checksum_tampering_rejected(tmp_path):
    path = tmp_path / "corpus.json"
    path.write_bytes(CORPUS.read_bytes() + b" ")
    path.with_suffix(".sha256").write_bytes(CORPUS.with_suffix(".sha256").read_bytes())
    with pytest.raises(ValueError, match="checksum"):
        load_corpus(path)


def test_final_split_keeps_dev_targets_and_rejects_shared_setup_inputs(tmp_path):
    corpus, _ = load_corpus()
    baseline, _ = load_corpus(Path("evaluation/assistant/ar02-v1.json"))
    assert [c for c in corpus["cases"] if c["split"] == "dev"] == [
        c for c in baseline["cases"] if c["split"] == "dev"
    ]
    held = next(c for c in corpus["cases"] if c["split"] == "holdout")
    setup = next(
        c["setup"]["message"] for c in corpus["cases"] if c["split"] == "dev" and c.get("setup")
    )
    held["message"] = setup
    held["season"] = corpus["context_season"]
    held["before_date"] = corpus["before_date"]
    path = tmp_path / "leaking.json"
    path.write_text(json.dumps(corpus))
    path.with_suffix(".sha256").write_text(hashlib.sha256(path.read_bytes()).hexdigest())
    with pytest.raises(ValueError, match="Primary/setup input leaked"):
        load_corpus(path)


def inability():
    return HybridTurnResponse(
        request_id=uuid4(),
        thread_id=uuid4(),
        turn_id=uuid4(),
        status="unable",
        intent="inability",
        blocks=[
            InabilityBlock(
                reason="provider_disabled",
                text="Provider is unavailable.",
                next_action="Use Stats.",
            )
        ],
    )


def test_readable_refusal_never_counts_as_a_data_answer():
    case = {"id": "test", "category": "leaders", "split": "dev"}
    expected = {
        "status": "answered",
        "kind": "ranking",
        "metric": "pts_per_game",
        "rows": [{"player_id": "a", "value": 10, "n": 5}],
    }
    score = score_answer(case, expected, None, inability())
    assert score["readable"]
    assert not score["exact_answer"] and score["refused"] and not score["expected_refusal"]
    assert "sql_cells_or_order" in score["failures"]


@pytest.mark.parametrize(
    "text,correct",
    [
        (f"{GENERAL_LABEL}: The screen frees the ball handler.", True),
        ("The screen frees the ball handler.", False),
        (f"{GENERAL_LABEL}: The screen is used in 30 percent of ball plays.", False),
        (f"{GENERAL_LABEL}: Three players screen the ball handler.", False),
        (f"{GENERAL_LABEL}: Offensive spacing creates room.", False),
    ],
)
def test_general_scoring_requires_label_relevance_and_no_numbers(text, correct):
    case = {
        "id": "general",
        "category": "general",
        "split": "dev",
        "oracle": {"terms": ["screen", "ball"]},
    }
    answer = inability().model_copy(
        update={
            "status": "answered",
            "blocks": [
                TextBlock(origin="discussion", text=text, criteria=["basketball concepts"]),
            ],
        }
    )
    score = score_answer(case, {"kind": "general", "status": "answered"}, None, answer)
    assert score["exact_answer"] is correct


def test_unlabelled_extra_general_block_cannot_hide_a_statistic():
    case = {
        "id": "general",
        "category": "general",
        "split": "dev",
        "oracle": {"terms": ["screen", "ball"]},
    }
    answer = inability().model_copy(
        update={
            "status": "answered",
            "blocks": [
                TextBlock(
                    origin="discussion",
                    text=f"{GENERAL_LABEL}: Screens free the ball handler.",
                    criteria=["basketball concepts"],
                ),
                TextBlock(
                    origin="discussion",
                    text="He averaged thirty points.",
                    criteria=["basketball concepts"],
                ),
            ],
        }
    )
    assert not score_answer(case, {"kind": "general", "status": "answered"}, None, answer)[
        "exact_answer"
    ]


def test_summary_keeps_denominators_incomplete_repetitions_and_refusals_separate():
    base = {
        "id": "one",
        "category": "leaders",
        "exact_answer": True,
        "plan_correct": True,
        "expected_refusal": False,
        "refused": False,
        "answer_signature": "a",
        "elapsed_ms": 100,
        "provider_calls": 1,
        "analytical_calls": 1,
    }
    records = [
        base,
        base,
        {**base, "exact_answer": False, "refused": True, "answer_signature": "b"},
        {**base, "id": "incomplete"},
    ]
    result = summarize(records, 2, 3)
    assert result["coverage"]["completed_questions"] == 1
    assert result["coverage"]["planned_runs"] == 6
    assert result["exact_answer"] == {"correct": 3, "total": 4, "rate": 0.75}
    assert result["plan_accuracy"]["rate"] == 1
    assert result["flakiness"] == {"flaky": 1, "total": 1, "rate": 1}
    assert result["refusal_precision"]["rate"] == 0
    assert result["refusal_recall"]["rate"] is None


def test_missing_forecast_requires_honest_unavailability_not_a_prediction():
    case = {"id": "forecast", "category": "forecast", "split": "dev"}
    expected = {
        "kind": "forecast",
        "status": "unable",
        "reason": "no_observations",
        "data": {"status": "no_issuance", "player_id": "a"},
    }
    answer = inability().model_copy(
        update={
            "blocks": [
                InabilityBlock(
                    reason="no_observations",
                    text="No registered issuance is available.",
                    next_action="Inspect the retained forecasts.",
                ),
            ]
        }
    )
    score = score_answer(case, expected, None, answer)
    assert score["exact_answer"] and score["expected_refusal"]
    assert not score_answer(case, expected, None, inability())["exact_answer"]


def captured_success():
    # Retained SQL expectations are independent of the captured assistant answer.
    report = json.loads(Path("tests/fixtures/assistant/ar02/recorded-provider-v1.json").read_text())
    return next(r for r in report["records"] if r["exact_answer"] and r["category"] == "leaders")


@pytest.mark.parametrize("mutation", ["value", "entity", "order", "sample", "scope", "plan"])
def test_sql_scoring_rejects_mutated_answer(mutation):
    record = deepcopy(captured_success())
    corpus, _ = load_corpus()
    case = next(c for c in corpus["cases"] if c["id"] == record["id"])
    answer = HybridTurnResponse.model_validate(record["response"])
    result = next(b.result for b in answer.blocks if b.kind == "result")
    metric = record["expected"]["metric"]
    if mutation == "value":
        result.data["items"][0]["metrics"][metric] += 1
    elif mutation == "entity":
        result.data["items"][0]["player_id"] = "wrong"
    elif mutation == "order":
        result.data["items"] = list(reversed(result.data["items"]))
    elif mutation == "sample":
        result.data["items"][0]["sample_sizes"][metric] += 1
    elif mutation == "scope":
        answer = answer.model_copy(
            update={
                "scope": answer.scope.model_copy(
                    update={
                        "selections": answer.scope.selections.model_copy(
                            update={"season": "2024-25"}
                        ),
                    }
                )
            }
        )
    else:
        answer.plan.steps[0].arguments["page"]["limit"] = 5
    # Bypass wire cross-record validators to exercise scoring itself, rather than validation.
    score = score_answer(case, record["expected"], record["expected_plan"], answer)
    if mutation == "plan":
        assert score["exact_answer"] and not score["plan_correct"]
    else:
        assert not score["exact_answer"]
