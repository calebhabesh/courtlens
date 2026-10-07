"""Unit tests for SportsDataverse source acquisition, normalization, and reconciliation."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from courtlens.ingestion.workbench_normalization import (
    canonical_hash,
    canonical_phase_from_game_id,
    normalize_game_id,
    normalize_player_row,
    normalize_team_row,
    parse_count,
    parse_minutes,
    parse_schedule_file,
    reconcile_season,
    validate_stats,
)
from courtlens.ingestion.workbench_source_config import (
    ADMITTED_SEASONS,
    canonical_season_name,
    player_boxscores_url,
    raw_schedule_json_url,
    schedule_csv_url,
    team_boxscores_url,
)


def test_parse_minutes_strict_format() -> None:
    assert parse_minutes("") is None
    assert parse_minutes("   ") is None
    assert parse_minutes("0:00") == 0
    assert parse_minutes("0:59") == 59
    assert parse_minutes("1:00") == 60
    assert parse_minutes("45:15") == 45 * 60 + 15
    assert parse_minutes("240:00") == 240 * 60  # team minutes can exceed 60
    assert parse_minutes("290:00") == 290 * 60

    # Seconds out of 0..59 range must raise ValueError
    with pytest.raises(ValueError, match="seconds_out_of_range"):
        parse_minutes("45:60")
    with pytest.raises(ValueError, match="seconds_out_of_range"):
        parse_minutes("12:99")

    # Malformed strings
    with pytest.raises(ValueError, match="malformed_minutes"):
        parse_minutes("45.5")
    with pytest.raises(ValueError, match="malformed_minutes"):
        parse_minutes("invalid")


def test_parse_count_and_trailing_zeros() -> None:
    assert parse_count(None) is None
    assert parse_count("") is None
    assert parse_count("0") == 0
    assert parse_count("42") == 42
    assert parse_count("125.0") == 125
    assert parse_count("-5") == -5

    with pytest.raises(ValueError, match="malformed_count"):
        parse_count("abc")
    with pytest.raises(ValueError, match="malformed_count"):
        parse_count("12.3")


def test_normalize_game_id_and_phases() -> None:
    assert normalize_game_id("0022500001") == "0022500001"
    assert normalize_game_id("22500001") == "0022500001"
    with pytest.raises(ValueError, match="malformed_game_id"):
        normalize_game_id("invalid")

    assert canonical_phase_from_game_id("0012600001") == "preseason"
    assert canonical_phase_from_game_id("0022500001") == "regular_season"
    assert canonical_phase_from_game_id("0042400101") == "playoffs"
    assert canonical_phase_from_game_id("0052300001") == "play_in"
    assert canonical_phase_from_game_id("0062400001") == "cup_final"
    cup_res = canonical_phase_from_game_id("0022400001", season_type_hint="nba-cup-final")
    assert cup_res == "cup_final"
    assert canonical_phase_from_game_id("0099900001") == "unknown"


def test_validate_stats_constraints() -> None:
    # Valid stats
    valid = {
        "field_goals_made": 10,
        "field_goals_attempted": 20,
        "three_pointers_made": 3,
        "three_pointers_attempted": 8,
        "free_throws_made": 5,
        "free_throws_attempted": 6,
        "points": 28,  # 2*(10-3) + 3*3 + 5 = 14 + 9 + 5 = 28
    }
    validate_stats(valid)

    # Makes exceed attempts
    with pytest.raises(ValueError, match="makes_exceed_attempts"):
        validate_stats({**valid, "field_goals_made": 25})

    with pytest.raises(ValueError, match="makes_exceed_attempts"):
        validate_stats({**valid, "three_pointers_made": 10})

    # Points formula mismatch
    with pytest.raises(ValueError, match="point_formula_mismatch"):
        validate_stats({**valid, "points": 35})


def test_canonical_hash_stability() -> None:
    data1 = {"b": 2, "a": 1, "c": [3, 4]}
    data2 = {"a": 1, "c": [3, 4], "b": 2}
    h1 = canonical_hash(data1)
    h2 = canonical_hash(data2)
    assert h1 == h2
    assert len(h1) == 64


def test_parse_schedule_and_normalization_golden(tmp_path: Path) -> None:
    # Create small synthetic schedule JSON
    sched_json = {
        "leagueSchedule": {
            "seasonYear": "2026-27",
            "gameDates": [
                {
                    "gameDate": "10/20/2026",
                    "games": [
                        {
                            "gameId": "0022600001",
                            "gameDateEst": "2026-10-20",
                            "gameDateTimeUTC": "2026-10-20T23:30:00Z",
                            "gameStatus": 3,
                            "homeTeam": {"teamId": 1610612760, "score": 110},
                            "awayTeam": {"teamId": 1610612761, "score": 105},
                        }
                    ],
                }
            ],
        }
    }
    sched_file = tmp_path / "sched.json"
    sched_file.write_text(json.dumps(sched_json), encoding="utf-8")

    lookup = parse_schedule_file(sched_file)
    assert "0022600001" in lookup
    entry = lookup["0022600001"]
    assert entry["game_date"] == "2026-10-20"
    assert entry["status"] == "final"
    assert entry["phase"] == "regular_season"

    # Normalize player row
    p_raw = {
        "game_id": "0022600001",
        "person_id": "1629652",
        "first_name": "Luguentz",
        "family_name": "Dort",
        "team_id": "1610612760",
        "team_tricode": "OKC",
        "side": "home",
        "minutes": "35:00",
        "field_goals_made": "5",
        "field_goals_attempted": "10",
        "three_pointers_made": "2",
        "three_pointers_attempted": "5",
        "free_throws_made": "3",
        "free_throws_attempted": "4",
        "points": "15",
        "comment": "",
    }
    p_norm = normalize_player_row(p_raw, lookup)
    assert p_norm["appearance"] == "appeared"
    assert p_norm["minutes_seconds"] == 2100
    assert p_norm["stats"]["points"] == 15
    assert p_norm["player_name"] == "Luguentz Dort"

    # Normalize team row
    t_raw = {
        "game_id": "0022600001",
        "team_id": "1610612760",
        "team_tricode": "OKC",
        "side": "home",
        "minutes": "240:00",
        "field_goals_made": "40",
        "field_goals_attempted": "85",
        "three_pointers_made": "12",
        "three_pointers_attempted": "30",
        "free_throws_made": "18",
        "free_throws_attempted": "22",
        "points": "110",
    }
    t_norm = normalize_team_row(t_raw, lookup)
    assert t_norm["points"] == 110
    assert t_norm["minutes_seconds"] == 14400


def test_reconciliation_detects_mismatches(tmp_path: Path) -> None:
    sched_lookup = {
        "0022600001": {
            "game_id": "0022600001",
            "game_date": "2026-10-20",
            "phase": "regular_season",
            "status": "final",
        }
    }
    # Player row with 15 points
    p_rows = [
        {
            "game_id": "0022600001",
            "person_id": "1",
            "first_name": "A",
            "family_name": "One",
            "team_id": "10",
            "team_tricode": "AAA",
            "side": "home",
            "minutes": "20:00",
            "field_goals_made": "5",
            "field_goals_attempted": "10",
            "three_pointers_made": "2",
            "three_pointers_attempted": "4",
            "free_throws_made": "3",
            "free_throws_attempted": "4",
            "points": "15",
            "comment": "",
        }
    ]
    # Team rows: team 10 declares 110 points (which != 15) and team 20 also home (side mismatch)
    t_rows = [
        {
            "game_id": "0022600001",
            "team_id": "10",
            "team_tricode": "AAA",
            "side": "home",
            "minutes": "240:00",
            "field_goals_made": "40",
            "field_goals_attempted": "80",
            "three_pointers_made": "10",
            "three_pointers_attempted": "20",
            "free_throws_made": "20",
            "free_throws_attempted": "25",
            "points": "110",
        },
        {
            "game_id": "0022600001",
            "team_id": "20",
            "team_tricode": "BBB",
            "side": "home",  # side mismatch: two home teams!
            "minutes": "240:00",
            "field_goals_made": "35",
            "field_goals_attempted": "80",
            "three_pointers_made": "10",
            "three_pointers_attempted": "20",
            "free_throws_made": "20",
            "free_throws_attempted": "25",
            "points": "100",
        },
    ]
    rec = reconcile_season(iter(p_rows), iter(t_rows), sched_lookup)
    assert rec["opposing_side_mismatches_count"] == 1
    # both team 10 and 20 fail player sum match
    assert rec["point_reconciliation_failures_count"] == 2


def test_workbench_source_config_integrity() -> None:
    assert 2026 in ADMITTED_SEASONS
    assert canonical_season_name(2026) == "2025-26"
    assert canonical_season_name(2027) == "2026-27"
    assert "player_boxscores_2026.csv" in player_boxscores_url(2026)
    assert "team_boxscores_2026.csv" in team_boxscores_url(2026)
    assert "nba_schedule_2026.csv.gz" in schedule_csv_url(2026)
    assert "2027.json" in raw_schedule_json_url(2027)
