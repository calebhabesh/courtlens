"""Actual retained-ball and-one misclassification regression; v1 remains frozen."""

from pathlib import Path

from courtlens.domain.impact_possessions import METHOD_VERSION_V2, build_impact_game
from courtlens.domain.impact_verification import verify_event_game
from courtlens.domain.possession_repair import normalize_events, order_same_clock
from courtlens.ingestion.impact_population import read_json


def inputs():
    f = read_json(
        Path(__file__).resolve().parents[1] / "fixtures/impact_repair/im03-retained-ft.json.gz"
    )
    c = f["candidate"]
    source = c["arbitration"]["selected"]
    events, _ = order_same_clock(
        normalize_events(
            f["rows"], source=source, source_sha256=c["input_sha256"][source], boxes=f["boxes"]
        ),
        c["game_id"],
    )
    h, a = f["game"]["stints"][0]["home_team_id"], f["game"]["stints"][0]["away_team_id"]
    return f, {
        "candidate": c,
        "events": events,
        "raw_rows": {int(r["_row_index"]): r for r in f["rows"]},
        "home_team": h,
        "away_team": a,
        "team_boxes": f["team_boxes"],
    }


def test_original_retained_ft_fixture_still_replays_v1_exactly():
    f, args = inputs()
    assert build_impact_game(**args) == f["game"]


def test_v2_retained_flagrant_ft_does_not_merge_two_knicks_controls():
    _, args = inputs()
    game = build_impact_game(**args, method_version=METHOD_VERSION_V2)
    shot = next(p for p in game["possessions"] if p["start_order_index"] == 75)
    assert shot["end_order_index"] == 75
    assert any(
        p["start_order_index"] == 79 and p["count_as_possession"] for p in game["possessions"]
    )
    check = verify_event_game(
        game=game, **{k: v for k, v in args.items() if k not in {"home_team", "away_team"}}
    )
    assert check["passed"], check["errors"]
