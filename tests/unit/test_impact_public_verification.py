from __future__ import annotations

from copy import deepcopy
from pathlib import Path

import pytest

from courtlens.domain.impact_public_verification import review_public_sequences
from courtlens.domain.impact_verification import verify_event_game
from courtlens.domain.possession_repair import normalize_events, order_same_clock
from courtlens.ingestion.impact_population import read_json
from courtlens.ingestion.native_reconstruction import content_hash

FIXTURES = Path(__file__).resolve().parents[1] / "fixtures/impact_repair"


@pytest.mark.parametrize("gid", ["0022300021", "0022400181", "0022400213", "0022401049"])
def test_real_public_sequences_reconcile_without_changing_selected_counts(gid):
    fixture = read_json(FIXTURES / f"im03-public-{gid}.json.gz")
    assert (
        content_hash({k: v for k, v in fixture.items() if k != "content_sha256"})
        == fixture["content_sha256"]
    )
    game, candidate = fixture["game"], fixture["candidate"]
    source = candidate["arbitration"]["selected"]
    events, _ = order_same_clock(
        normalize_events(
            fixture["rows"],
            source=source,
            source_sha256=candidate["input_sha256"][source],
            boxes=fixture["player_boxes"],
        ),
        gid,
    )
    event_check = verify_event_game(
        game=game,
        candidate=candidate,
        events=events,
        raw_rows={int(r["_row_index"]): r for r in fixture["rows"]},
        team_boxes=fixture["team_boxes"],
    )
    assert event_check["passed"], event_check["errors"]
    before = deepcopy(game)
    for team, groups in fixture["public_groups"].items():
        result = review_public_sequences(game, fixture["rows"], groups, team)
        assert result["passed"], result
        assert sum(c["delta"] for c in result["components"]) == result["delta"]
        assert result == review_public_sequences(game, fixture["rows"], groups, team)
    assert game == before


def test_real_public_stale_shot_retains_selected_turnover_revision_evidence():
    fixture = read_json(FIXTURES / "im03-public-0022400181.json.gz")
    team = "1610612750"
    result = review_public_sequences(
        fixture["game"], fixture["rows"], fixture["public_groups"][team], team
    )
    revisions = result["source_event_revisions"]
    assert any(
        "MISS DiVincenzo" in r["public_description"]
        and r["selected_trial"] == ["divincenzo", "turnover", "1"]
        and r["selected_seconds_remaining"] == 125
        and r["source_locators"]
        for r in revisions
    )


def test_unknown_nonempty_public_event_blocks_even_when_total_count_matches():
    fixture = read_json(FIXTURES / "im03-public-0022400213.json.gz")
    team, groups = next(iter(fixture["public_groups"].items()))
    poisoned = deepcopy(groups)
    row = poisoned[0]
    row.update(
        EVENTS="Unknown Actor Jump Shot (999 PTS)",
        _descriptions=["Unknown Actor Jump Shot (999 PTS)"],
        _event_ids=[],
        PERIOD="99",
        FG2A="1",
        FG2M="1",
        FG3A="0",
        FG3M="0",
        TURNOVERS="0",
    )
    result = review_public_sequences(fixture["game"], fixture["rows"], poisoned, team)
    original = review_public_sequences(fixture["game"], fixture["rows"], groups, team)
    assert result["delta"] == original["delta"]
    assert not result["passed"]
    assert any(c["rule"] == "unresolved_public_event" for c in result["components"])
