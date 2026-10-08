"""Real B19d regressions and adversarial boundaries for the v2 policy."""

from __future__ import annotations

import copy
import gzip
import json
from dataclasses import replace
from decimal import Decimal
from pathlib import Path

import pytest

from courtlens.domain.possession_repair import (
    POLICY_VERSION,
    RepairEvent,
    _simulate_period,
    arbitrate_sources,
    normalize_events,
    order_same_clock,
    parse_box_seconds,
    reconstruct_repaired_game,
)
from courtlens.ingestion.impact_repair_audit import ArchiveGames, retain_candidate, summarize
from courtlens.ingestion.native_reconstruction import content_hash

FIXTURE = Path(__file__).resolve().parents[1] / "fixtures/impact_repair/b19d.json.gz"


@pytest.fixture
def real_games():
    fixture = json.loads(gzip.decompress(FIXTURE.read_bytes()))
    assert fixture["content_sha256"] == content_hash(
        {k: v for k, v in fixture.items() if k != "content_sha256"}
    )
    return fixture["games"]


def replay(gid, game, **kwargs):
    evidence = {
        (e["period"], e["team"]): {
            k: v for k, v in e.items() if k not in ("period", "team", "expected")
        }
        for e in game["evidence"]
    }
    return reconstruct_repaired_game(
        game_id=gid,
        v3_rows=game["rows"],
        cdn_rows=None,
        boxes=game["boxes"],
        team_points=game["team_points"],
        input_hashes=game["input_hashes"],
        starter_evidence=evidence,
        **kwargs,
    )


@pytest.mark.parametrize(
    ("gid", "count"), [("0022500007", 6), ("0022500013", 8), ("0022500025", 5), ("0022501045", 4)]
)
def test_all_23_real_starter_disagreements_are_repaired(real_games, gid, count):
    game = real_games[gid]
    result = replay(gid, game)
    assert result["quality"] == "patched"
    assert result["errors"] == []
    assert result["rule_counts"]["IM02-R1"] == count
    for evidence in game["evidence"]:
        assert result["starters"][str(evidence["period"])][evidence["team"]] == evidence["expected"]
    assert (
        max(
            abs(Decimal(v["minutes_delta_seconds"]))
            for v in result["player_comparisons"].values()
            if v["minutes_delta_seconds"] is not None
        )
        <= 1
    )
    assert result["content_sha256"] == replay(gid, game)["content_sha256"]
    assert result["database_admission"] is False
    for repair in result["repairs"]:
        assert repair["policy_version"] == POLICY_VERSION
        assert repair["input_sha256"] == game["input_hashes"]
        assert repair["repair_sha256"] == content_hash(
            {k: v for k, v in repair.items() if k != "repair_sha256"}
        )


def test_real_25_60_is_carried_and_ambiguous_values_stay_unknown(real_games):
    result = replay("0022500007", real_games["0022500007"])
    carry = [r for r in result["repairs"] if r["rule_id"] == "IM02-R5"]
    assert len(carry) == 1
    assert carry[0]["original"] == "25:60"
    assert carry[0]["replacement"] == "1560"
    for raw in ("25:61", "NaN", "", "DNP", "-1:00", "1:inf"):
        assert parse_box_seconds(raw) == (None, False)
    assert parse_box_seconds("25:60") == (Decimal(1560), True)
    assert parse_box_seconds("00:00") == (Decimal(0), False)
    altered = copy.deepcopy(real_games["0022500007"])
    next(b for b in altered["boxes"] if b["person_id"] == "1629130")["minutes"] = "25:61"
    unknown = replay("0022500007", altered)
    assert unknown["quality"] == "patched"
    assert "1629130" in unknown["unknown_minutes"]
    assert unknown["player_comparisons"]["1629130"]["box_seconds"] is None


@pytest.mark.parametrize(
    ("delta", "quality", "counter"),
    [(1, "patched", 0), (2, "patched", 1), (30, "patched", 1), (31, "excluded", 0)],
)
def test_minutes_thresholds_on_real_game(real_games, delta, quality, counter):
    altered = copy.deepcopy(real_games["0022500007"])
    box = next(b for b in altered["boxes"] if b["person_id"] == "1629130")
    seconds = Decimal("1559.5") + delta
    box["minutes"] = f"{int(seconds // 60)}:{seconds % 60:04.1f}"
    result = replay("0022500007", altered)
    assert result["quality"] == quality
    assert result["rule_counts"]["IM02-R4"] == counter
    assert result["rule_counts"]["IM02-R7"] == int(quality == "excluded")
    assert result["player_comparisons"]["1629130"]["minutes_delta_seconds"] == str(
        Decimal(-delta).quantize(Decimal("0.01"))
    )


def test_cross_source_box_conservation_and_unavailable_are_distinct(real_games):
    game = real_games["0022500007"]
    events = normalize_events(
        game["rows"], source="v3", source_sha256=game["input_hashes"]["v3"], boxes=game["boxes"]
    )
    cdn = [replace(e, source="cdn", source_sha256="b" * 64) for e in events]
    damaged = [
        replace(e, stats={**e.stats, "points": e.stats["points"] + 1})
        if e.stats.get("points", 0) > 0
        else e
        for e in events
    ]
    selected, repairs, check, errors = arbitrate_sources(
        game_id="0022500007",
        v3=damaged,
        cdn=cdn,
        boxes=game["boxes"],
        team_points=game["team_points"],
    )
    assert check["selected"] == "cdn"
    assert selected == cdn
    assert errors == []
    assert repairs and all(r.rule_id == "IM02-R6" for r in repairs)
    assert all(r.original["v3"] != r.original["cdn"] for r in repairs)
    _, _, absent, errors = arbitrate_sources(
        game_id="0022500007",
        v3=events,
        cdn=None,
        boxes=game["boxes"],
        team_points=game["team_points"],
    )
    assert absent["cdn_status"] == "unavailable"
    assert absent["agreed_events"] == 0
    assert errors == []
    _, _, both_bad, errors = arbitrate_sources(
        game_id="0022500007",
        v3=damaged,
        cdn=damaged,
        boxes=game["boxes"],
        team_points=game["team_points"],
    )
    assert both_bad["selected"] == "none"
    assert errors


def test_duplicate_action_numbers_keep_row_identity(real_games):
    game = real_games["0022500007"]
    events = normalize_events(
        game["rows"], source="v3", source_sha256="a" * 64, boxes=game["boxes"]
    )
    numbered = [replace(e, action_number=7) for e in events]
    _, _, check, errors = arbitrate_sources(
        game_id="0022500007",
        v3=numbered,
        cdn=numbered,
        boxes=game["boxes"],
        team_points=game["team_points"],
    )
    assert not errors
    assert check["agreed_events"] == sum(
        e.kind not in ("period", "timeout", "substitution", "instantreplay") for e in numbered
    )
    assert len({content_hash(e.locator()) for e in numbered}) == len(events)


def event(row, seconds, kind, pid="0", *, outgoing=(), incoming=(), points=0):
    return RepairEvent(
        "v3",
        "a" * 64,
        row,
        str(row),
        row,
        1,
        Decimal(seconds),
        kind,
        "home",
        pid,
        (pid,) if pid != "0" else (),
        outgoing,
        incoming,
        {"points": points} if points else {},
    )


def test_same_clock_ft_substitution_order_preserves_between_attempts():
    first = event(0, "600", "free_throw", "1", points=1)
    sub = event(1, "600", "substitution", outgoing=("2",), incoming=("6",))
    second = event(2, "600", "free_throw", "1", points=1)
    rebound = event(3, "600", "rebound", "3")
    unchanged, repairs = order_same_clock([first, sub, second, rebound], "g")
    assert unchanged == [first, sub, second, rebound]
    assert repairs == []
    incoming_shot = replace(first, player_id="6")
    moved, repairs = order_same_clock([incoming_shot, sub, rebound], "g")
    assert moved == [sub, incoming_shot, rebound]
    assert [r.rule_id for r in repairs] == ["IM02-R3"]
    assert repairs[0].original[0]["row_index"] == 0
    assert repairs[0].replacement[0]["row_index"] == 1


def test_missing_substitution_replays_dead_ball_and_uses_recent_actor():
    roster = {str(i): "home" for i in range(1, 7)}
    rows = [
        event(0, "720", "period"),
        event(1, "710", "shot", "1", points=2),
        event(2, "700", "timeout"),
        event(3, "695", "shot", "6", points=2),
        event(4, "0", "period"),
    ]
    result = _simulate_period(
        rows, ("1", "2", "3", "4", "5"), "home", roster, "g", repair_missing=True
    )
    assert result.errors == []
    assert result.repairs[0].replacement == {"outgoing": "1", "incoming": "6"}
    assert result.repairs[0].locator["boundary"]["row_index"] == 2
    assert result.seconds["1"] == 20
    assert result.seconds["6"] == 700
    assert result.plus_minus["1"] == 2
    assert result.plus_minus["6"] == 2
    assert sum(result.seconds.values()) == 3600
    strict = _simulate_period(
        rows, ("1", "2", "3", "4", "5"), "home", roster, "g", repair_missing=False
    )
    assert strict.errors


def test_unrecoverable_clock_identity_and_scoring_remain_excluded(real_games):
    for defect in ("clock", "identity", "score", "empty"):
        altered = copy.deepcopy(real_games["0022500007"])
        if defect == "clock":
            altered["rows"][5]["clock"] = "PT12M01.00S"
        elif defect == "identity":
            sub = next(r for r in altered["rows"] if r["actionType"].lower() == "substitution")
            sub["description"] = "SUB: Unknown FOR Unknown"
        elif defect == "score":
            altered["team_points"][next(iter(altered["team_points"]))] += 1
        else:
            altered["rows"] = []
        result = replay("0022500007", altered)
        assert result["quality"] == "excluded"
        assert result["errors"]
        assert result["rule_counts"]["IM02-R7"] == 1


def test_candidate_reuse_rejects_corruption_and_summaries_count_exclusions(real_games, tmp_path):
    result = replay("0022500007", real_games["0022500007"])
    path = tmp_path / "candidate.json.gz"
    retain_candidate(path, result)
    original = path.read_bytes()
    retain_candidate(path, result)
    assert path.read_bytes() == original
    path.write_bytes(gzip.compress(b"{}"))
    with pytest.raises(ValueError, match="changed"):
        retain_candidate(path, result)
    excluded = copy.deepcopy(result)
    excluded["quality"] = "excluded"
    excluded["errors"] = ["bad"]
    summary = summarize({"one": result, "two": excluded})
    assert summary["scheduled_games"] == 2
    assert summary["quality_percent"] == {"clean": 0, "patched": 50, "excluded": 50}
    assert summary["excluded_games"] == {"two": ["bad"]}
    assert (
        summary["minutes_all_candidates"]["comparisons"]
        == 2 * summary["minutes_nonexcluded"]["comparisons"]
    )
    assert (
        summary["plus_minus_nonexcluded"]["comparisons"]
        > summary["plus_minus_nonexcluded"]["exact"]
    )


def test_archive_spool_reads_missing_as_absent(tmp_path):
    store = ArchiveGames(tmp_path / "spool.sqlite")
    try:
        assert store.get("cdn", "missing") == []
    finally:
        store.close()


def test_real_archive_substitution_runs_arbitration_and_exclusion():
    fixture_path = FIXTURE.parent / "archive-failures.json.gz"
    fixture = json.loads(gzip.decompress(fixture_path.read_bytes()))
    assert content_hash(fixture["games"]) == fixture["content_sha256"]
    repaired = reconstruct_repaired_game(game_id="0022501221", **fixture["games"]["0022501221"])
    assert repaired["quality"] == "patched"
    # This real game has multiple substitution runs at one clock. Collapsing them
    # across free throws produced false missing substitutions and a 19.9 s error.
    assert repaired["rule_counts"]["IM02-R2"] == 0
    assert repaired["rule_counts"]["IM02-R4"] == 0
    assert repaired["arbitration"]["selected"] == "cdn"
    assert repaired["rule_counts"]["IM02-R6"] > 0
    assert max(
        abs(Decimal(v["minutes_delta_seconds"]))
        for v in repaired["player_comparisons"].values()
        if v["minutes_delta_seconds"] is not None
    ) <= Decimal("0.5")
    excluded = reconstruct_repaired_game(game_id="0022500149", **fixture["games"]["0022500149"])
    assert excluded["quality"] == "excluded"
    assert excluded["rule_counts"]["IM02-R7"] == 1
    assert all(
        v["seconds"] is None and v["plus_minus_delta"] is None
        for v in excluded["player_comparisons"].values()
    )


def test_real_same_clock_free_throws_substitutions_and_rebounds_preserve_source_order(real_games):
    import itertools

    game = real_games["0022500007"]
    events = normalize_events(
        game["rows"], source="v3", source_sha256=game["input_hashes"]["v3"], boxes=game["boxes"]
    )
    groups = [list(g) for _, g in itertools.groupby(events, key=lambda e: (e.period, e.seconds))]
    observed = [
        g
        for g in groups
        if any(e.kind == "free_throw" for e in g) and any(e.kind == "substitution" for e in g)
    ]
    assert observed
    for group in observed:
        ordered, repairs = order_same_clock(group, "0022500007")
        assert ordered == group
        assert repairs == []
    rebound_groups = [g for g in groups if any(e.kind == "rebound" for e in g)]
    assert rebound_groups
    for group in rebound_groups:
        ordered, _ = order_same_clock(group, "0022500007")
        assert [e.locator() for e in ordered if e.kind == "rebound"] == [
            e.locator() for e in group if e.kind == "rebound"
        ]


def test_impact_inputs_never_enter_forecasting_feature_construction(monkeypatch):
    from datetime import date

    from courtlens.evaluation import features, points_features

    def forbidden(*args, **kwargs):
        pytest.fail("descriptive impact inputs reached forecasting feature construction")

    monkeypatch.setattr("courtlens.domain.possession_repair.reconstruct_repaired_game", forbidden)
    monkeypatch.setattr(
        "courtlens.services.possession_warehouse.get_cutoff_safe_player_exposure", forbidden
    )
    monkeypatch.setattr("courtlens.ingestion.impact_repair_audit.ArchiveGames.get", forbidden)
    cutoff = date(2025, 1, 2)
    history = [
        features.PlayerGame(
            "past", "p", "t", "o", date(2025, 1, 1), "2024-25", "appeared", 1800, 10, 8, 3
        ),
        features.PlayerGame(
            "future", "p", "t", "o", date(2025, 1, 3), "2024-25", "appeared", 1800, 99, 40, 20
        ),
    ]
    before = features.player_features(history, cutoff)
    baseline_hash = features.feature_hash(before[0])
    after = features.player_features(history, cutoff)
    assert after == before
    assert features.feature_hash(after[0]) == baseline_hash
    points = [
        points_features.PointsPlayerGame(
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
    ]
    result = points_features.compute_player_features(points, None, cutoff, cutoff)
    assert result[1] == [10.0]
    forbidden_names = ("rapm", "bpr", "on_off", "possession", "impact")
    assert all(not any(name in key for name in forbidden_names) for key in result[0])
    assert all(
        not any(name in key for name in forbidden_names)
        for keys in points_features.POINTS_FEATURE_VARIANTS.values()
        for key in keys
    )


def test_real_2023_v3_shots_use_explicit_three_point_marker():
    fixture = json.loads((FIXTURE.parent / "legacy-v3-shots.json").read_text())
    roster = [
        {"person_id": row["personId"], "team_id": row["teamId"]}
        for row in fixture["rows"]
        if row["personId"] != "0"
    ]
    events = normalize_events(
        fixture["rows"], source="v3", source_sha256=fixture["source_sha256"], boxes=roster
    )
    three = next(e for e in events if e.row_index == 7)
    assert three.stats == {"fga": 1, "fgm": 1, "fg3a": 1, "fg3m": 1, "points": 3}
    assert fixture["rows"][7]["pointsTotal"] == "5"
    assert "shotValue" not in fixture["rows"][7]
    assert three.locator()["sha256"] == fixture["source_sha256"]


def test_clean_game_and_unavailable_cross_checks_are_reported_separately(real_games):
    game = real_games["0022500013"]
    result = reconstruct_repaired_game(
        game_id="0022500013",
        v3_rows=game["rows"],
        cdn_rows=None,
        boxes=game["boxes"],
        team_points=game["team_points"],
        input_hashes=game["input_hashes"],
    )
    assert result["quality"] == "clean"
    assert result["repairs"] == []
    assert result["arbitration"]["cdn_status"] == "unavailable"
    assert result["period_starter_box_evidence"] == "unavailable"


@pytest.mark.parametrize(
    ("gid", "missing", "tolerance"), [("0022500568", 2, 0), ("0022300167", 1, 1)]
)
def test_natural_missing_substitution_and_minutes_repairs(gid, missing, tolerance):
    fixture = json.loads(gzip.decompress((FIXTURE.parent / "repair-rules.json.gz").read_bytes()))
    assert content_hash(fixture["games"]) == fixture["content_sha256"]
    game = fixture["games"][gid]
    result = reconstruct_repaired_game(game_id=gid, **game)
    assert result["quality"] == "patched"
    assert result["errors"] == []
    assert result["rule_counts"]["IM02-R2"] == missing
    assert result["rule_counts"]["IM02-R4"] == tolerance
    insertions = [r for r in result["repairs"] if r["rule_id"] == "IM02-R2"]
    assert all(r["locator"]["boundary"]["source"] == "cdn" for r in insertions)
    assert all(
        r["locator"]["boundary"]["row_index"] <= r["locator"]["discovery"]["row_index"]
        for r in insertions
    )
    if gid == "0022500568":
        assert insertions[0]["replacement"] == {"incoming": "203482", "outgoing": "1642844"}
        assert insertions[1]["replacement"] == {"incoming": "1642844", "outgoing": "203482"}
        assert all(
            Decimal(v["minutes_delta_seconds"]) == 0
            for v in result["player_comparisons"].values()
            if v["minutes_delta_seconds"] is not None
        )
    else:
        assert insertions[0]["replacement"] == {"incoming": "1630598", "outgoing": "1628983"}
        assert max(
            abs(Decimal(v["minutes_delta_seconds"]))
            for v in result["player_comparisons"].values()
            if v["minutes_delta_seconds"] is not None
        ) == Decimal("23.2")


def test_real_same_clock_shooter_can_leave_and_return_after_timeout():
    fixture = json.loads(gzip.decompress((FIXTURE.parent / "repair-rules.json.gz").read_bytes()))
    game = fixture["games"]["0022400542"]
    events = normalize_events(
        game["v3_rows"], source="v3", source_sha256=game["input_hashes"]["v3"], boxes=game["boxes"]
    )
    group = [e for e in events if e.period == 4 and e.seconds == Decimal("6.6")]
    ordered, repairs = order_same_clock(group, "0022400542")
    assert ordered == group
    assert repairs == []
    result = reconstruct_repaired_game(game_id="0022400542", **game)
    assert result["quality"] == "patched"
    assert result["errors"] == []
    assert result["rule_counts"]["IM02-R2"] == 0
    assert result["rule_counts"]["IM02-R3"] == 0
    assert result["rule_counts"]["IM02-R4"] == 0
    assert result["arbitration"]["selected"] == "v3"
