"""Real raw examples for contextual FTs, substitute and-ones and anonymous turnovers."""

from pathlib import Path

import pytest

from courtlens.domain.impact_event_repairs import project_team_actions
from courtlens.domain.impact_possessions import METHOD_VERSION_V2, build_impact_game
from courtlens.domain.impact_verification import verify_event_game
from courtlens.domain.possession_repair import normalize_events, order_same_clock
from courtlens.ingestion.impact_population import read_json


@pytest.mark.parametrize("gid", ["0022300006", "0022300013", "0042300303"])
def test_raw_v2_corrections_and_v1_hash_preservation(gid):
    f = read_json(
        Path(__file__).resolve().parents[1] / f"fixtures/impact_repair/im03-{gid}.json.gz"
    )
    c = f["candidate"]
    source = c["arbitration"]["selected"]
    events, _ = order_same_clock(
        normalize_events(
            f["rows"], source=source, source_sha256=c["input_sha256"][source], boxes=f["boxes"]
        ),
        gid,
    )
    home, away = f["game"]["stints"][0]["home_team_id"], f["game"]["stints"][0]["away_team_id"]
    args = {
        "candidate": c,
        "events": events,
        "raw_rows": {int(r["_row_index"]): r for r in f["rows"]},
        "home_team": home,
        "away_team": away,
        "team_boxes": f["team_boxes"],
    }
    assert build_impact_game(**args) == f["game"]
    old = verify_event_game(
        game=f["game"], **{k: v for k, v in args.items() if k not in {"home_team", "away_team"}}
    )
    assert not old["passed"]
    projected, rows, repairs = project_team_actions(
        events=events,
        rows=f["rows"],
        other_rows=f["other_rows"],
        input_sha256=c["input_sha256"],
        teams=(home, away),
    )
    args.update(events=projected, raw_rows=rows)
    game = build_impact_game(**args, method_version=METHOD_VERSION_V2)
    check = verify_event_game(
        game=game, **{k: v for k, v in args.items() if k not in {"home_team", "away_team"}}
    )
    assert check["passed"], check["errors"]
    if gid == "0042300303":
        assert len(repairs) == 1
        assert repairs[0]["team_id"] == "1610612738"
        assert repairs[0]["evidence"]["source"] == "cdn"
        _, unchanged, missing = project_team_actions(
            events=events,
            rows=f["rows"],
            other_rows=[],
            input_sha256=c["input_sha256"],
            teams=(home, away),
        )
        assert not missing
        assert unchanged[33105]["teamId"] == "0"
    else:
        assert not repairs
