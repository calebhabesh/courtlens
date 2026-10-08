from __future__ import annotations

import copy
import gzip
import json
from dataclasses import replace
from decimal import Decimal
from pathlib import Path

import pytest

from courtlens.domain.impact_extras import (
    BOX_COUNTS,
    aggregate,
    assist_actor,
    box_counts,
    game_facts,
    joined_shot,
    play_bucket,
)
from courtlens.domain.impact_extras_catalog import BUCKETS, IMPACT_EXTRAS_CATALOG, WAVE_TWO
from courtlens.domain.possession_repair import RepairEvent
from courtlens.evaluation.impact_rating_inputs import write_artifact
from courtlens.ingestion.native_reconstruction import content_hash


@pytest.fixture
def real():
    path = Path("tests/fixtures/impact_repair/im05-game.json.gz")
    body = json.loads(gzip.decompress(path.read_bytes()))
    assert content_hash({k: v for k, v in body.items() if k != "sha256"}) == body["sha256"]
    return {k: body[k] for k in ("game", "candidate", "boxes", "rows", "cdn", "shots", "matchups")}


def player(*, points=22, fgm=8, fg3m=2):
    return {
        "team": "t",
        "support": {"seconds": 36000, "off_controls": 100, "def_controls": 80},
        "box": {
            "points": points,
            "fga": 10,
            "fgm": fgm,
            "fg3a": 4,
            "fg3m": fg3m,
            "fta": 10,
            "ftm": 4,
            "assists": 5,
            "steals": 2,
            "blocks": 3,
            "pf": 4,
        },
        "counts": {
            "drb": 4,
            "drb_opportunities": 10,
            "block_known": 2,
            "block_recovered": 1,
            "self_orb": 1,
            "self_opportunities": 4,
            "team_orb": 2,
            "team_opportunities": 8,
            "bad_pass_tov": 3,
            "rim_assists": 2,
            "charges": 1,
        },
        "buckets": {
            "create": {"fga": 6, "fgm": 4, "points": 8},
            "space": {"fga": 2, "fgm": 2, "points": 6},
            "trans": {"fga": 1, "fgm": 1, "points": 2},
            "finish": {"fga": 1, "fgm": 1, "points": 2},
            "unknown": {"fta": 10, "ftm": 4, "points": 4},
        },
        "rim_assists_complete": True,
        "charges_complete": True,
        "matchup_fga": 20,
    }


@pytest.fixture
def sample():
    p, q = player(), player(points=14, fgm=5, fg3m=0)
    q["buckets"] = {b: {} for b in BUCKETS}
    q["buckets"]["create"] = {"fga": 10, "fgm": 5, "points": 10}
    q["buckets"]["unknown"] = {"fta": 10, "ftm": 4, "points": 4}
    return {
        "g": {
            "day": "2025-01-01",
            "quality": "patched",
            "game_sha256": "gamehash",
            "facts": {
                "players": {"p": p, "q": q},
                "coverage": {},
                "matchup_offensive_fga_deltas": {},
            },
        }
    }


EXPECTED = {
    "pbp_stl_per100": 2.5,
    "pbp_blk_per100": 3.75,
    "pbp_foul_frequency": 4 / 90,
    "pbp_drb_pct": 0.4,
    "pbp_block_recovered_pct": 0.5,
    "matchup_fga_per100": 25,
    "impact_ts_pct": 22 / 28.8,
    "impact_rts": 22 / 28.8 - 0.625,
    "impact_tsadd_per100": 4,
    "impact_three_point_rate": 0.4,
    "impact_ftr": 1,
    "impact_ast_per100": 5,
    "pbp_bad_pass_tov": 3,
    "pbp_rim_assists": 2,
    "pbp_self_miss_orb_pct": 0.25,
    "pbp_team_miss_orb_pct": 0.25,
    "pbp_charges_drawn": 1,
    "pbp_credited_ftov_per100": 3.75,
    "pbp_create_tsa": 6,
    "pbp_create_frequency": 6 / 14.4,
    "pbp_create_ts": 8 / 12,
    "pbp_create_rts": 8 / 12 - 18 / 32,
    "pbp_space_tsa": 2,
    "pbp_space_frequency": 2 / 14.4,
    "pbp_space_ts": 1.5,
    "pbp_space_rts": 0,
    "pbp_trans_tsa": 1,
    "pbp_trans_frequency": 1 / 14.4,
    "pbp_trans_ts": 1,
    "pbp_trans_rts": 0,
    "pbp_finish_tsa": 1,
    "pbp_finish_frequency": 1 / 14.4,
    "pbp_finish_ts": 1,
    "pbp_finish_rts": 0,
    "pbp_unknown_tsa": 4.4,
    "pbp_unknown_frequency": 4.4 / 14.4,
    "pbp_unknown_ts": 4 / 8.8,
    "pbp_unknown_rts": 0,
}


@pytest.mark.parametrize("key,expected", EXPECTED.items())
def test_every_column_has_independent_formula_and_catalog_contract(sample, key, expected):
    value = aggregate(sample, "2025-01-02")["players"]["p"]["metrics"][key]
    assert value["value"] == pytest.approx(expected)
    assert value["covered_games"] == 1 and value["total_games"] == 1
    definition = IMPACT_EXTRAS_CATALOG[key]
    assert definition.formula and definition.unit and definition.validity_definition
    assert definition.required_fields and definition.limitations
    assert definition.capability_requirement == "impact_extras_im06"
    assert set(EXPECTED) == set(IMPACT_EXTRAS_CATALOG)


def test_full_sample_sums_before_division_and_preserves_trades(sample):
    second = copy.deepcopy(sample["g"])
    second["day"] = "2025-01-02"
    second["facts"]["players"]["p"]["support"]["def_controls"] = 20
    second["facts"]["players"]["p"]["team"] = "traded"
    sample["g2"] = second
    result = aggregate(sample, "2025-01-03")["players"]["p"]
    assert result["metrics"]["pbp_stl_per100"]["value"] == 4
    assert result["teams"] == ["t", "traded"]


def test_missing_game_sources_do_not_add_zero_or_uncovered_denominators(sample):
    missing = copy.deepcopy(sample["g"])
    r = missing["facts"]["players"]["p"]
    r["box"] = r["matchup_fga"] = None
    r["rim_assists_complete"] = r["charges_complete"] = False
    r["support"]["def_controls"] = 500
    sample["missing"] = missing
    values = aggregate(sample, "2025-01-02")["players"]["p"]["metrics"]
    for key in (
        "pbp_stl_per100",
        "matchup_fga_per100",
        "pbp_rim_assists",
        "pbp_charges_drawn",
        "impact_ts_pct",
        "pbp_create_frequency",
    ):
        assert values[key]["covered_games"] == 1
        assert values[key]["total_games"] == 2
        assert values[key]["value"] == pytest.approx(EXPECTED[key])


def test_empty_and_zero_denominators_are_unknown_not_zero(sample):
    r = sample["g"]["facts"]["players"]["p"]
    r["box"] = r["matchup_fga"] = None
    r["charges_complete"] = r["rim_assists_complete"] = False
    r["counts"] = {}
    values = aggregate(sample, "2025-01-02")["players"]["p"]["metrics"]
    for key in IMPACT_EXTRAS_CATALOG:
        if key != "pbp_bad_pass_tov":
            assert values[key]["value"] is None
            assert not values[key]["qualified"]
    assert values["pbp_bad_pass_tov"]["value"] == 0  # complete PBP, no bad passes


@pytest.mark.parametrize("bad", ["", "nan", "inf", "-1", ".5"])
def test_invalid_box_counts_do_not_become_zero(real, bad):
    row = copy.deepcopy(real["boxes"][0])
    row["steals"] = bad
    assert box_counts(row) is None


def test_future_games_and_target_date_do_not_affect_hash_or_references(sample):
    original = content_hash(aggregate(sample, "2025-01-02"))
    future = copy.deepcopy(sample["g"])
    future["day"] = "2025-01-02"
    future["facts"]["players"]["p"]["box"]["points"] = 999
    sample["future"] = future
    assert content_hash(aggregate(sample, "2025-01-02")) == original
    future["facts"]["players"]["q"]["buckets"]["create"]["points"] = 777
    assert content_hash(aggregate(sample, "2025-01-02")) == original


def event(seconds=Decimal(690)):
    return RepairEvent(
        "v3",
        "a" * 64,
        0,
        "1",
        10,
        1,
        seconds,
        "shot",
        "t",
        "p",
        stats={"fga": 1, "fgm": 1, "fg3a": 0, "points": 2},
    )


def test_transition_uses_previous_live_control_end_and_six_second_boundary():
    previous = {
        "period": 1,
        "offense_team_id": "o",
        "ending": "defensive_rebound",
        "end_seconds_remaining": 696,
    }
    assert play_bucket(event(), None, False, None, previous) == "trans"
    assert play_bucket(event(Decimal("689.99")), None, False, None, previous) == "unknown"
    for changed in ({"period": 2}, {"offense_team_id": "t"}, {"ending": "shot"}):
        assert play_bucket(event(), None, False, None, {**previous, **changed}) == "unknown"
    assert play_bucket(event(Decimal(697)), None, False, None, previous) == "unknown"


def test_bucket_precedence_and_unknowns():
    rim = {"SHOT_ZONE_BASIC": "Restricted Area"}
    outside = {"SHOT_ZONE_BASIC": "Mid-Range"}
    assert play_bucket(event(), rim, True, "a", None) == "finish"
    assert play_bucket(event(), outside, True, "a", None) == "space"
    assert play_bucket(event(), outside, True, None, None) == "create"
    assert play_bucket(event(), outside, False, None, None) == "unknown"
    assert play_bucket(event(), None, True, "a", None) == "unknown"


def test_real_game_conserves_every_player_and_correct_matchup_orientation(real):
    facts = game_facts(**real)
    assert len(facts["players"]) == 20
    # Adams is the offensive player in the archived Dort/Adams first pair.
    # Defender aggregate belongs to matchups_person_id, independently tabulated.
    defender = "203500"
    expected = sum(
        int(r["matchup_field_goals_attempted"])
        for r in real["matchups"]
        if r["matchups_person_id"] == defender
    )
    assert facts["players"][defender]["matchup_fga"] == expected == 13
    assert (
        sum(
            int(r["matchup_field_goals_attempted"])
            for r in real["matchups"]
            if r["person_id"] == defender
        )
        == 8
    )
    for r in facts["players"].values():
        for field in ("points", "fga", "fgm", "fta", "ftm"):
            assert sum(b.get(field, 0) for b in r["buckets"].values()) == r["box"][field]
    assert facts["players"]["1630578"]["counts"]["bad_pass_tov"] > 0


def test_duplicate_or_wrong_team_matchups_are_rejected(real):
    real["matchups"].append(copy.deepcopy(real["matchups"][0]))
    with pytest.raises(ValueError, match="matchup orientation"):
        game_facts(**real)
    real["matchups"].pop()
    real["matchups"][0]["team_id"] = "wrong"
    with pytest.raises(ValueError, match="matchup orientation"):
        game_facts(**real)


def test_unknown_matchup_actor_invalidates_only_supplemental_game_sample(real):
    real["matchups"][0]["matchups_person_id"] = "absent"
    facts = game_facts(**real)
    assert all(r["matchup_fga"] is None for r in facts["players"].values())
    assert facts["coverage"]["unresolved_matchup_actors"] == 1
    assert facts["join_failures"][0]["reason"] == "actor_absent_from_independent_box_roster"
    assert facts["players"]["1631096"]["box"]["points"] == 28


def test_real_charge_actors_and_conditional_block_recovery(real):
    facts = game_facts(**real)
    assert facts["coverage"]["credited_charges"] == 2
    assert all(r["charges_complete"] for r in facts["players"].values())
    assert facts["players"]["1631119"]["counts"]["charges"] == 1
    assert facts["players"]["1628392"]["counts"]["charges"] == 1
    assert facts["coverage"]["blocks_with_individual_recovery"] == 5
    assert sum(r["counts"].get("block_known", 0) for r in facts["players"].values()) == 5


def test_rebound_opportunity_uses_lineup_after_substitution_not_miss_lineup():
    from courtlens.domain.possession_repair import normalize_events

    home = ["p", "a", "b", "c", "d"]
    away = ["u", "v", "w", "x", "y"]
    boxes = [
        {
            "person_id": p,
            "team_id": t,
            "family_name": p,
            **{field: "0" for field in BOX_COUNTS.values()},
        }
        for t, ids in (("t", [*home, "bench"]), ("o", away))
        for p in ids
    ]
    boxes[0]["field_goals_attempted"] = "1"
    rows = [
        {
            "actionNumber": "1",
            "actionId": "1",
            "period": "1",
            "clock": "PT10M00.00S",
            "teamId": "t",
            "personId": "p",
            "actionType": "Missed Shot",
            "subType": "",
            "description": "MISS p",
            "shotResult": "Missed",
        },
        {
            "actionNumber": "2",
            "actionId": "2",
            "period": "1",
            "clock": "PT10M00.00S",
            "teamId": "o",
            "personId": "u",
            "actionType": "",
            "subType": "",
            "description": "u BLOCK (1 BLK)",
        },
        {
            "actionNumber": "3",
            "actionId": "3",
            "period": "1",
            "clock": "PT10M00.00S",
            "teamId": "t",
            "personId": "p",
            "actionType": "substitution",
            "subType": "",
            "description": "SUB: bench FOR p",
        },
        {
            "actionNumber": "4",
            "actionId": "4",
            "period": "1",
            "clock": "PT10M00.00S",
            "teamId": "t",
            "personId": "bench",
            "actionType": "rebound",
            "subType": "offensive",
            "description": "bench REBOUND",
        },
    ]
    rows = [{**r, "_row_index": str(i)} for i, r in enumerate(rows)]
    events = normalize_events(rows, source="v3", source_sha256="a" * 64, boxes=boxes)
    end = ["bench", *home[1:]]
    candidate = {
        "arbitration": {"selected": "v3"},
        "input_sha256": {"v3": "a" * 64},
        "event_lineups": {
            "t": [
                {"locator": e.locator(), "lineup": home if i < 2 else end}
                for i, e in enumerate(events)
            ],
            "o": [{"locator": e.locator(), "lineup": away} for e in events],
        },
    }
    game = {
        "stints": [
            {
                "home_lineup_json": lineup,
                "away_lineup_json": away,
                "duration_seconds": 10,
                "home_possessions": 1,
                "away_possessions": 1,
            }
            for lineup in (home, end)
        ],
        "possessions": [
            {
                "count_as_possession": True,
                "offense_team_id": "t",
                "defense_team_id": "o",
                "period": 1,
                "end_seconds_remaining": 600,
                "end_order_index": 3,
                "stats_json": {
                    "events": [
                        {
                            "order_index": 0,
                            "locator": events[0].locator(),
                            "values": {"fga": 1, "fgm": 0},
                        }
                    ]
                },
            }
        ],
    }
    facts = game_facts(game, candidate, boxes, rows, [], [], [])
    assert facts["players"]["p"]["counts"].get("self_opportunities", 0) == 0
    assert facts["players"]["bench"]["counts"]["team_opportunities"] == 1
    assert facts["players"]["bench"]["counts"]["team_orb"] == 1
    assert facts["players"]["u"]["counts"]["block_known"] == 1
    assert facts["players"]["u"]["counts"]["block_recovered"] == 0
    assert facts["players"]["u"]["counts"]["drb_opportunities"] == 1


def test_missing_auxiliary_sources_keep_counts_and_unknown_buckets(real):
    real["cdn"], real["shots"], real["matchups"] = [], [], []
    facts = game_facts(**real)
    assert facts["coverage"]["unjoined_shots"] == 201
    assert all(
        not r["charges_complete"] and r["matchup_fga"] is None and not r["rim_assists_complete"]
        for r in facts["players"].values()
    )
    assert (
        sum(
            sum(b.get("points", 0) for b in r["buckets"].values())
            for r in facts["players"].values()
        )
        == 249
    )


def test_ambiguous_shot_join_and_wrong_actor_do_not_match(real):
    r = next(r for r in real["shots"] if r["PLAYER_ID"] == "1631096")
    from courtlens.domain.possession_repair import normalize_events

    events = normalize_events(
        real["rows"],
        source="v3",
        source_sha256=real["candidate"]["input_sha256"]["v3"],
        boxes=real["boxes"],
    )
    e = next(e for e in events if e.action_number == int(r["GAME_EVENT_ID"]))
    assert joined_shot(e, [r]) is not None
    assert joined_shot(e, [r, r]) is None
    assert joined_shot(replace(e, player_id="wrong"), [r]) is None
    changed = {**r, "SHOT_MADE_FLAG": str(1 - e.stats["fgm"])}
    assert joined_shot(e, [changed]) is None


def test_assist_conflict_and_ambiguous_names_are_unknown():
    e = event()
    row = {
        "actionNumber": "10",
        "period": "1",
        "clock": "PT11M30.00S",
        "teamId": "t",
        "personId": "p",
        "description": "Make (Smith 1 AST)",
    }
    aux = {**row, "assistPersonId": "a", "isFieldGoal": "1", "shotResult": "Made"}
    assert assist_actor(e, row, {"smith": {"a"}}, {"a": "t"}, [aux]) == (True, "a")
    assert assist_actor(e, row, {"smith": {"a", "b"}}, {"a": "t"}, []) == (False, None)
    assert assist_actor(e, row, {"smith": {"b"}}, {"a": "t"}, [aux]) == (False, None)
    assert assist_actor(e, row, {"smith": {"a"}}, {"a": "opponent"}, [aux]) == (False, None)


def test_append_only_artifact_and_source_gates(tmp_path, sample):
    obj = aggregate(sample, "2025-01-02")
    path, digest = write_artifact(tmp_path, obj)
    assert write_artifact(tmp_path, obj) == (path, digest)
    path.write_text("changed")
    with pytest.raises(ValueError, match="changed"):
        write_artifact(tmp_path, obj)
    assert set(WAVE_TWO).isdisjoint(IMPACT_EXTRAS_CATALOG)
    assert all(WAVE_TWO.values())


def test_descriptive_extras_never_enter_forecasting(monkeypatch):
    from datetime import date

    from courtlens.evaluation import points_features

    def forbidden(*args, **kwargs):
        pytest.fail("IM05 reached forecasting")

    monkeypatch.setattr("courtlens.domain.impact_extras.aggregate", forbidden)
    monkeypatch.setattr("courtlens.domain.impact_extras.game_facts", forbidden)
    monkeypatch.setattr("courtlens.evaluation.impact_extras_runner.run", forbidden)
    assert "impact_extras" not in Path(points_features.__file__).read_text()
    row = points_features.PointsPlayerGame(
        "past",
        "p",
        "t",
        "o",
        date(2025, 1, 1),
        "2024-25",
        "regular_season",
        "appeared",
        1800,
        10,
        8,
        3,
    )
    features, _, _ = points_features.compute_player_features(
        [row], None, date(2025, 1, 2), date(2025, 1, 2)
    )
    assert not any(key in IMPACT_EXTRAS_CATALOG for key in features)
