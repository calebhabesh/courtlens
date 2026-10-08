"""Possession boundaries, conservation and IM02 ordered-event attribution."""

from __future__ import annotations

import copy
from dataclasses import replace
from decimal import Decimal

import pytest

from courtlens.domain.impact_possessions import build_impact_game
from courtlens.domain.possession_repair import RepairEvent
from courtlens.ingestion.native_reconstruction import content_hash


def example(kinds):
    events = []
    rows = {}
    points = {"h": 0, "a": 0}
    for index, (kind, team, stats, subtype) in enumerate(kinds):
        events.append(
            RepairEvent(
                "v3",
                "a" * 64,
                index,
                str(index),
                index,
                1,
                Decimal(700 - index * 10),
                kind,
                team,
                team + "0",
                stats=stats,
            )
        )
        rows[index] = {"subType": subtype, "description": ""}
        points[team] += stats.get("points", 0)
    candidate = {
        "game_id": "test",
        "policy_version": "possession-policy-v2",
        "quality": "clean",
        "errors": [],
        "team_stints": {
            t: [
                {
                    "period": 1,
                    "start_seconds": "720",
                    "end_seconds": "0",
                    "lineup": [t + str(i) for i in range(5)],
                }
            ]
            for t in ("h", "a")
        },
        "event_lineups": {
            t: [{"locator": e.locator(), "lineup": [t + str(i) for i in range(5)]} for e in events]
            for t in ("h", "a")
        },
        "player_comparisons": {
            t + str(i): {"seconds": "720"} for t in ("h", "a") for i in range(5)
        },
    }
    candidate["content_sha256"] = content_hash(candidate)
    boxes = [
        {
            "team_id": t,
            "points": str(points[t]),
            "field_goals_attempted": str(
                sum(e.stats.get("fga", 0) for e in events if e.team_id == t)
            ),
            "free_throws_attempted": str(
                sum(e.stats.get("fta", 0) for e in events if e.team_id == t)
            ),
            "rebounds_offensive": "0",
            "turnovers": "0",
        }
        for t in ("h", "a")
    ]
    return {
        "candidate": candidate,
        "events": events,
        "raw_rows": rows,
        "home_team": "h",
        "away_team": "a",
        "team_boxes": boxes,
    }


def test_offensive_rebound_keeps_one_possession_and_exposes_opportunity():
    args = example(
        [
            ("shot", "h", {"fga": 1, "fgm": 0, "points": 0}, ""),
            ("rebound", "h", {}, "offensive"),
            ("shot", "h", {"fga": 1, "fgm": 1, "points": 2}, ""),
        ]
    )
    result = build_impact_game(**args)
    assert len(result["possessions"]) == 1
    p = result["possessions"][0]
    assert (p["points"], p["stats_json"]["orb"], p["stats_json"]["orb_opportunities"]) == (2, 1, 1)
    assert p["stats_json"]["ts_attempts"] == 2
    assert result["content_sha256"] == build_impact_game(**args)["content_sha256"]


def test_defensive_rebound_and_turnover_end_possessions():
    args = example(
        [
            ("shot", "h", {"fga": 1, "fgm": 0, "points": 0}, ""),
            ("rebound", "a", {}, "defensive"),
            ("turnover", "a", {}, "bad pass"),
        ]
    )
    result = build_impact_game(**args)
    assert [p["offense_team_id"] for p in result["possessions"]] == ["h", "a"]
    assert result["possessions"][1]["stats_json"]["turnovers"] == 1
    assert result["possessions"][0]["stats_json"]["orb_opportunities"] == 1


def test_final_free_throw_and_technical_do_not_double_count():
    args = example(
        [
            ("free_throw", "h", {"fta": 1, "ftm": 1, "points": 1}, "1of2"),
            ("free_throw", "a", {"fta": 1, "ftm": 1, "points": 1}, "technical"),
            ("free_throw", "h", {"fta": 1, "ftm": 1, "points": 1}, "2of2"),
        ]
    )
    args["events"][1] = replace(args["events"][1], technical=True)
    result = build_impact_game(**args)
    assert sum(p["count_as_possession"] for p in result["possessions"]) == 1
    assert sum(p["points"] for p in result["possessions"]) == 3
    assert result["possessions"][1]["stats_json"]["fta"] == 2


def test_same_clock_substitution_scores_to_the_ordered_lineup():
    args = example(
        [
            ("free_throw", "h", {"fta": 1, "ftm": 1, "points": 1}, "1of2"),
            ("substitution", "h", {}, ""),
            ("free_throw", "h", {"fta": 1, "ftm": 1, "points": 1}, "2of2"),
        ]
    )
    args["events"] = [replace(e, seconds=Decimal(700)) for e in args["events"]]
    c = args["candidate"]
    old, new = ["h" + str(i) for i in range(5)], ["h" + str(i) for i in range(1, 6)]
    c["team_stints"]["h"] = [
        {"period": 1, "start_seconds": "720", "end_seconds": "700", "lineup": old},
        {"period": 1, "start_seconds": "700", "end_seconds": "0", "lineup": new},
    ]
    c["event_lineups"]["h"][1]["lineup"] = new
    c["event_lineups"]["h"][2]["lineup"] = new
    c["player_comparisons"]["h0"]["seconds"] = "20"
    c["player_comparisons"]["h5"] = {"seconds": "700"}
    c["content_sha256"] = content_hash({k: v for k, v in c.items() if k != "content_sha256"})
    result = build_impact_game(**args)
    assert [(s["home_points"], s["duration_seconds"]) for s in result["stints"]] == [
        (1, 20),
        (1, 700),
    ]


def test_tampering_and_source_identity_changes_fail():
    args = example([("shot", "h", {"fga": 1, "fgm": 1, "points": 2}, "")])
    changed = copy.deepcopy(args)
    changed["candidate"]["quality"] = "patched"
    with pytest.raises(ValueError, match="candidate"):
        build_impact_game(**changed)
    args["events"][0] = replace(args["events"][0], row_index=99)
    with pytest.raises(ValueError, match="identities"):
        build_impact_game(**args)


def test_unknown_free_throw_sequence_is_not_guessed():
    args = example([("free_throw", "h", {"fta": 1, "ftm": 1, "points": 1}, "unknown")])
    with pytest.raises(ValueError, match="sequence"):
        build_impact_game(**args)


def test_real_archived_game_reproduces_curated_hash_and_box_factors():
    from pathlib import Path

    from courtlens.domain.possession_repair import normalize_events, order_same_clock
    from courtlens.ingestion.impact_population import read_json

    fixture = read_json(
        Path(__file__).resolve().parents[1] / "fixtures/impact_repair/im03-game.json.gz"
    )
    assert (
        content_hash({k: v for k, v in fixture.items() if k != "content_sha256"})
        == fixture["content_sha256"]
    )
    candidate = fixture["candidate"]
    source = candidate["arbitration"]["selected"]
    events, _ = order_same_clock(
        normalize_events(
            fixture["rows"],
            source=source,
            source_sha256=candidate["input_sha256"][source],
            boxes=fixture["boxes"],
        ),
        candidate["game_id"],
    )
    result = build_impact_game(
        candidate=candidate,
        events=events,
        raw_rows={int(r["_row_index"]): r for r in fixture["rows"]},
        home_team=fixture["schedule"]["home_team_id"],
        away_team=fixture["schedule"]["away_team_id"],
        team_boxes=fixture["team_boxes"],
    )
    assert result["content_sha256"] == fixture["game"]["content_sha256"]
    assert all(v["orb_box_delta"] == 0 for v in result["conservation"].values())
    assert [v["possessions"] for v in result["conservation"].values()] == [104, 104]


def test_nonfinal_free_throw_team_deadball_rebound_is_not_an_orb():
    args = example(
        [
            ("free_throw", "h", {"fta": 1, "ftm": 0, "points": 0}, "1of2"),
            ("rebound", "h", {}, "offensive"),
            ("free_throw", "h", {"fta": 1, "ftm": 1, "points": 1}, "2of2"),
        ]
    )
    args["events"][1] = replace(args["events"][1], player_id="0")
    result = build_impact_game(**args)
    assert len(result["possessions"]) == 1
    assert result["possessions"][0]["stats_json"]["orb_opportunities"] == 0


def test_and_one_does_not_create_a_second_possession():
    args = example(
        [
            ("shot", "h", {"fga": 1, "fgm": 1, "points": 2}, ""),
            ("free_throw", "h", {"fta": 1, "ftm": 1, "points": 1}, "1of1"),
        ]
    )
    args["events"] = [replace(e, seconds=Decimal(700)) for e in args["events"]]
    result = build_impact_game(**args)
    assert len(result["possessions"]) == 1 and result["possessions"][0]["points"] == 3


def test_im03_readers_never_enter_forecast_features(monkeypatch):
    from datetime import date

    from courtlens.evaluation import features, points_features

    def forbidden(*args, **kwargs):
        pytest.fail("IM03 descriptive data reached forecasting")

    monkeypatch.setattr("courtlens.domain.impact_possessions.build_impact_game", forbidden)
    monkeypatch.setattr("courtlens.ingestion.impact_population.populate_impact_season", forbidden)
    monkeypatch.setattr("courtlens.ingestion.impact_population.prepare_population", forbidden)
    cutoff = date(2025, 1, 2)
    past = features.PlayerGame(
        "past", "p", "t", "o", date(2025, 1, 1), "2024-25", "appeared", 1800, 10, 8, 3
    )
    future = features.PlayerGame(
        "future", "p", "t", "o", date(2025, 1, 3), "2024-25", "appeared", 1800, 999, 400, 200
    )
    before = features.player_features([past], cutoff)
    after = features.player_features([past, future], cutoff)
    assert before == after and features.feature_hash(before[0]) == features.feature_hash(after[0])
    assert all(
        not any(term in name for term in ("impact", "possession", "rapm", "bpr", "on_off"))
        for variant in points_features.POINTS_FEATURE_VARIANTS.values()
        for name in variant
    )
