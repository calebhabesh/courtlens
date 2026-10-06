"""AR03 development capture replay; includes the retained quota failure, no live work."""

import gzip
import hashlib
import json
from datetime import date
from pathlib import Path
from unittest.mock import patch
from uuid import uuid4

import pytest
from test_revamp_provider_replay import test_recorded_provider_replay as _replay_local

from courtload.domain.hybrid_assistant import HybridTurnRequest
from courtload.services.assistant.hybrid import run_hybrid_turn
from courtload.services.assistant.revamp_evaluation import load_corpus, score_answer

PATH = Path("docs/evidence/ar03-routing/live-capture.json.gz")
CAPTURE = json.loads(gzip.decompress(PATH.read_bytes()))
CORPUS, DIGEST = load_corpus()
CASES = {c["id"]: c for c in CORPUS["cases"] if c["split"] == "dev"}


def test_capture_is_only_frozen_dev_and_preserves_quota_stop():
    assert CAPTURE["corpus_sha256"] == DIGEST
    assert CAPTURE["split"] == "dev" and CAPTURE["stopped"] == "quota_exceeded"
    assert len(CAPTURE["records"]) == 66 and len(CAPTURE["provider_calls"]) == 18
    assert all(r["id"] in CASES for r in CAPTURE["records"])
    manifest = json.loads(PATH.with_name("manifest.json").read_text())
    assert hashlib.sha256(PATH.read_bytes()).hexdigest() == manifest["files"][PATH.name]


@pytest.mark.parametrize("record", CAPTURE["records"], ids=lambda r: f"{r['id']}-{r['repetition']}")
def test_ar03_actual_plan_and_general_replay(session, record):
    if record["category"] == "mixed":
        # The frozen v1/v2 dev inputs are unchanged. Reuse the independent executor
        # byte replay assertions; that helper also blocks real Gemini/source reads.
        _replay_local(session, record)
        return
    with (
        patch(
            "courtload.services.assistant.planner.GeminiPlanProvider.plan",
            side_effect=AssertionError("Replay cannot call Gemini"),
        ),
        patch(
            "courtload.services.assistant.hybrid.retrieve_source",
            side_effect=AssertionError("Replay cannot retrieve sources"),
        ),
    ):
        answer = run_hybrid_turn(
            session,
            HybridTurnRequest(request_id=uuid4(), message=record["message"]),
            clock=lambda: date.fromisoformat(CAPTURE["clock"]),
        )
    score = score_answer(CASES[record["id"]], record["expected"], None, answer)
    assert score["exact_answer"] == record["exact_answer"]
    assert answer.accounting.provider_calls == 0 and answer.scope is None
