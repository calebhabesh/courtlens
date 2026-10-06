"""Admission-spike guards: unknown outcomes, identity grain and complete coverage."""

from __future__ import annotations

import csv
import importlib.util
from pathlib import Path
from typing import Any

import pytest

SCRIPT = Path(__file__).parents[2] / "scripts" / "audit_b19_rich_sources.py"
SPEC = importlib.util.spec_from_file_location("audit_b19_rich_sources", SCRIPT)
assert SPEC and SPEC.loader
spike = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(spike)

GID = "0022500001"


def baseline() -> tuple[dict[str, Any], dict[str, Any]]:
    teams = {GID: {"1": {"side": "home", "points": "0"}, "2": {"side": "away", "points": "0"}}}
    players = {
        GID: {
            str(pid): {
                "team_id": "1" if pid <= 5 else "2",
                "minutes": "12:00",
                **dict.fromkeys(spike.COUNTS, "0"),
            }
            for pid in range(1, 11)
        }
    }
    return teams, players


def write_rows(tmp_path: Path, records: list[dict[str, str]]) -> Path:
    path = tmp_path / "source.csv"
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(records[0]))
        writer.writeheader()
        writer.writerows(records)
    return path


def events() -> list[dict[str, str]]:
    return [
        {
            "game_id": GID,
            "season": "2026",
            "period": str(period),
            "order_index": str(period - 1),
            "action_number": "2",
            "action_id": str(period),
            "seconds_remaining": "0",
            "clock": "PT0M00S",
            "score_home": "0",
            "score_away": "0",
            "is_field_goal": "0",
            **{f"off_player_{i}": str(i) for i in range(1, 6)},
            **{f"def_player_{i}": str(i + 5) for i in range(1, 6)},
        }
        for period in range(1, 5)
    ]


def test_action_number_is_not_provider_event_identity(tmp_path: Path) -> None:
    teams, players = baseline()
    report = spike.audit_family("pbp", write_rows(tmp_path, events()), 2026, teams, players)
    assert report["necessary_checks_passed_games"] == [GID]
    assert report["repeated_action_number_rows_by_game"] == {GID: 3}
    assert report["not_admitted"] is True
    assert "player minute conservation" in report["unresolved_gates"]


def test_duplicate_provider_event_is_quarantined(tmp_path: Path) -> None:
    teams, players = baseline()
    records = events()
    records[1]["action_id"] = records[0]["action_id"]
    report = spike.audit_family("pbp", write_rows(tmp_path, records), 2026, teams, players)
    assert report["necessary_checks_passed_games"] == []
    assert report["rejected_or_review_games"][GID]["reason_counts"] == {
        "duplicate_provider_event_identity": 1
    }


def test_missing_expected_game_and_orphan_game_are_both_reported(tmp_path: Path) -> None:
    teams, players = baseline()
    records = events()
    for row in records:
        row["game_id"] = "0022500002"
    report = spike.audit_family("pbp", write_rows(tmp_path, records), 2026, teams, players)
    rejected = report["rejected_or_review_games"]
    assert rejected[GID]["reason_counts"] == {"missing_source_game": 1}
    assert rejected["0022500002"]["reason_counts"] == {"missing_independent_team_baseline": 4}


def test_duplicate_player_side_does_not_pass_length_check(tmp_path: Path) -> None:
    teams, players = baseline()
    records = events()
    records[0]["off_player_2"] = records[0]["off_player_1"]
    report = spike.audit_family("pbp", write_rows(tmp_path, records), 2026, teams, players)
    assert report["rejected_or_review_games"][GID]["reason_counts"] == {
        "invalid_five_player_side": 1
    }


def test_unknown_result_never_becomes_a_miss() -> None:
    tally: dict[str, Any] = {}
    with pytest.raises(ValueError, match="unknown field-goal"):
        spike.record_shot({"person_id": "1"}, tally, 2, "")
    assert tally == {}


@pytest.mark.parametrize("raw", ["", "NaN", "-1", "1.5"])
def test_unknown_or_invalid_denominator_never_becomes_zero(raw: str) -> None:
    with pytest.raises(ValueError, match="unknown/noninteger"):
        spike.count(raw)


def test_bad_box_minutes_do_not_erase_observed_shot_totals(tmp_path: Path) -> None:
    teams, players = baseline()
    players[GID]["1"]["minutes"] = "30:60"
    players[GID]["1"]["field_goals_attempted"] = "1"
    players[GID]["1"]["field_goals_made"] = "1"
    records = events()
    # Add shot-only columns to every row, as the real complete CSV does.
    for row in records:
        row.update(person_id="1", shot_value="2", shot_result="Made", score_home="2")
    records[0]["is_field_goal"] = "1"
    teams[GID]["1"]["points"] = "2"
    report = spike.audit_family("pbp", write_rows(tmp_path, records), 2026, teams, players)
    reasons = report["rejected_or_review_games"][GID]["reason_counts"]
    assert reasons == {"independent_player_minutes_invalid": 4}


def test_zero_box_attempts_must_reconcile_too(tmp_path: Path) -> None:
    teams, players = baseline()
    row = {
        "game_id": GID,
        "season": "2026",
        "period": "1",
        "clock": "PT1M00S",
        "person_id": "1",
        "team_id": "1",
        "shot_value": "2",
        "shot_result": "Made",
        "x_legacy": "0",
        "y_legacy": "0",
        "shot_distance": "0",
    }
    report = spike.audit_family("shots", write_rows(tmp_path, [row]), 2026, teams, players)
    assert report["necessary_checks_passed_games"] == []
    assert report["rejected_or_review_games"][GID]["reason_counts"] == {
        "player_shot_total_mismatch": 2
    }
