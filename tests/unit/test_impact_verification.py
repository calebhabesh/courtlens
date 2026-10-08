"""Independent IM03 raw-event verification rejects corrupt reconstructed facts."""

import copy
from pathlib import Path

import pytest

from courtlens.domain.impact_verification import verify_event_game
from courtlens.domain.possession_repair import normalize_events, order_same_clock
from courtlens.ingestion.impact_population import read_json


@pytest.fixture
def archived():
    f = read_json(Path(__file__).resolve().parents[1] / "fixtures/impact_repair/im03-game.json.gz")
    c = f["candidate"]
    source = c["arbitration"]["selected"]
    events, _ = order_same_clock(
        normalize_events(
            f["rows"], source=source, source_sha256=c["input_sha256"][source], boxes=f["boxes"]
        ),
        c["game_id"],
    )
    return {
        "events": events,
        "raw_rows": {int(r["_row_index"]): r for r in f["rows"]},
        "candidate": c,
        "game": f["game"],
        "team_boxes": f["team_boxes"],
    }


def test_independent_events_accept_real_game_despite_box_estimate_failure(archived):
    r = verify_event_game(**archived)
    assert r["passed"] and not r["errors"]
    assert r["expected_records"] == 208
    assert r["box_discrepancy_ledger"]["1610612765"]["delta"] == "-3.88"
    assert verify_event_game(**archived) == r


@pytest.mark.parametrize(
    "mutation",
    [
        "duplicate",
        "missing",
        "boundary",
        "contribution",
        "factor",
        "lineup",
        "stint_duration",
        "stint_points",
        "stint_exposure",
    ],
)
def test_independent_gate_rejects_mutated_output(archived, mutation):
    args = copy.deepcopy(archived)
    ps = args["game"]["possessions"]
    if mutation == "duplicate":
        ps.insert(0, copy.deepcopy(ps[0]))
    elif mutation == "missing":
        ps.pop(0)
    elif mutation == "boundary":
        ps[0]["end_order_index"] += 1
    elif mutation == "contribution":
        ps[0]["stats_json"]["events"].append(copy.deepcopy(ps[0]["stats_json"]["events"][0]))
    elif mutation == "factor":
        ps[0]["stats_json"]["fga"] += 1
    elif mutation == "lineup":
        ps[0]["off_lineup_json"][0] = "unsupported-player"
    elif mutation == "stint_duration":
        args["game"]["stints"][0]["duration_seconds"] += 1
    elif mutation == "stint_points":
        args["game"]["stints"][0]["away_points"] += 1
    else:
        args["game"]["stints"][0]["home_possessions"] += 1
    r = verify_event_game(**args)
    assert not r["passed"] and r["errors"]


def test_verifier_does_not_trust_normalized_outcomes(archived):
    from dataclasses import replace

    args = copy.deepcopy(archived)
    args["events"] = [replace(e, stats={}, kind="other", technical=True) for e in args["events"]]
    assert verify_event_game(**args)["passed"]
    shot = args["game"]["possessions"][0]["stats_json"]["events"][0]["locator"]["row_index"]
    args["raw_rows"][shot]["shotResult"] = "Missed"
    assert not verify_event_game(**args)["passed"]
