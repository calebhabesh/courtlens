"""IM07 development revision, source policy, and impact answer scoring controls."""

import json
from datetime import date
from pathlib import Path

import pytest

from courtlens.domain.conversation import ConversationContext
from courtlens.services.assistant.agent.evaluation import load_corpus
from courtlens.services.assistant.agent.impact_oracle import coefficient_rows
from courtlens.services.assistant.agent.prompt import build_prompt

ROOT = Path(__file__).resolve().parents[2]


def test_im07_revision_preserves_every_holdout_and_unrelated_dev_case():
    old, _ = load_corpus(ROOT / "evaluation/assistant/ag-v3.json")
    new, _ = load_corpus(ROOT / "evaluation/assistant/ag-v3-im07.json")
    revised = {"ag06-web-01", "ag06-web-02", "ag06-web-03", "ag06-web-05", "ag06-web-07"}
    by_id = {c["id"]: c for c in new["cases"]}
    for case in old["cases"]:
        if case["id"] not in revised:
            assert by_id[case["id"]] == case
        else:
            assert by_id[case["id"]]["split"] == "dev"
            assert by_id[case["id"]]["require_warehouse"]
    assert sum(c["require_warehouse"] for c in new["cases"] if c.get("require_warehouse")) == 16


def test_revision_rejects_rehashed_holdout_edits(tmp_path):
    import hashlib

    path = tmp_path / "ag-v3-im07.json"
    corpus = json.loads((ROOT / "evaluation/assistant/ag-v3-im07.json").read_bytes())
    next(c for c in corpus["cases"] if c["split"] == "holdout")["oracle"] = {"kind": "web"}
    # Change the message too so this control does not depend on its original oracle.
    next(c for c in corpus["cases"] if c["split"] == "holdout")["message"] = "Changed holdout"
    raw = json.dumps(corpus).encode()
    path.write_bytes(raw)
    path.with_suffix(".sha256").write_text(hashlib.sha256(raw).hexdigest())
    (tmp_path / "ag-v3.json").write_bytes((ROOT / "evaluation/assistant/ag-v3.json").read_bytes())
    with pytest.raises(ValueError, match="changed the frozen AG06 holdout"):
        load_corpus(path)


def test_prompt_routes_impact_to_warehouse_and_keeps_historical_policy():
    args = {"today": date(2026, 10, 8), "selections": ConversationContext(), "page_context": None}
    prompt = build_prompt(**args)
    assert prompt.startswith("courtlens-agent-prompt-v2\n")
    assert "RAPM/ORAPM/DRAPM" in prompt and "onoff_net_rating" in prompt
    assert "BPR is a CourtLens analogue, never DPM" in prompt
    assert "strictly before before_date" in prompt and "not causal or forecasts" in prompt
    assert '"key": "d_ts"' in prompt
    legacy = build_prompt(**args, version="courtlens-agent-prompt-v1")
    assert "DPM and on/off are absent" in legacy
    with pytest.raises(ValueError, match="Unsupported agent prompt"):
        build_prompt(**args, version="invented")


def test_independent_onoff_oracle_recomputes_totals_and_withholds_traded_references():
    body = {
        "rapm": {"players": {"p": {"games": 30}}},
        "on_off": {
            "p:t": {
                "on": {"points": 1200, "allowed": 1000, "off_controls": 1000, "def_controls": 1000},
                "off": {
                    "points": 1100,
                    "allowed": 1050,
                    "off_controls": 1000,
                    "def_controls": 1000,
                },
                "difference": {"net": -999},
            }
        },
    }
    assert coefficient_rows(body, "onoff_net_rating") == [
        {"player_id": "p", "value": 15, "n": 30, "qualified": True}
    ]
    body["on_off"]["p:u"] = body["on_off"]["p:t"]
    assert coefficient_rows(body, "onoff_net_rating")[0]["value"] is None
