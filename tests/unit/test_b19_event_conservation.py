"""Retained event joins and conservative conservation failures at the audit seam."""

from __future__ import annotations

import copy
import importlib.util
from pathlib import Path
from typing import Any

import pytest

SCRIPT = Path(__file__).parents[2] / "scripts" / "audit_b19_event_conservation.py"
SPEC = importlib.util.spec_from_file_location("b19_event_audit", SCRIPT)
assert SPEC and SPEC.loader
spike = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(spike)
GID = "0022500001"


def fixture() -> tuple[Any, Any, Any, Any, Any]:
    teams = {"1": {"side": "home", "points": "0"}, "2": {"side": "away", "points": "0"}}
    players = {
        str(pid): {"team_id": "1" if pid <= 5 else "2", "minutes": "48:00"} for pid in range(1, 11)
    }
    pbp, lineups, possessions = [], [], []
    for period in range(1, 5):
        for remaining in ("720", "0"):
            order = len(pbp)
            event = {
                "game_id": GID,
                "season": "2026",
                "period": str(period),
                "action_number": "2",
                "action_id": str(order + 1),
                "order_index": str(order),
                "seconds_remaining": remaining,
                "clock": "PT12M00S" if remaining == "720" else "PT0M00S",
                "score_home": "0",
                "score_away": "0",
                "is_field_goal": "0",
                "shot_result": "",
                "shot_value": "0",
                "team_id": "0",
                "person_id": "0",
                "event_type": "period",
                "description": "Start" if remaining == "720" else "End",
                **{f"off_player_{i}": str(i) for i in range(1, 6)},
                **{f"def_player_{i}": str(i + 5) for i in range(1, 6)},
            }
            lineup = {
                "game_id": GID,
                "season": "2026",
                "period": str(period),
                "action_number": "2",
                **{f"home_player_{i}": str(i) for i in range(1, 6)},
                **{f"away_player_{i}": str(i + 5) for i in range(1, 6)},
            }
            pbp.append((order + 1, event))
            lineups.append((order + 1, lineup))
        possessions.append(
            (
                period,
                {
                    "period": str(period),
                    "possession_number": str(period),
                    "offense_team_id": "1",
                    "defense_team_id": "2",
                    "start_order_index": str(2 * (period - 1)),
                    "end_order_index": str(2 * period - 1),
                    "start_seconds_remaining": "720",
                    "end_seconds_remaining": "0",
                    "points": "0",
                },
            )
        )
    return pbp, lineups, possessions, teams, players


def report(inputs: tuple[Any, ...]) -> Any:
    return spike.audit_game(GID, *inputs)


def test_repeated_action_numbers_preserve_all_rows_and_minutes() -> None:
    result = report(fixture())
    assert result["join_verified"] is True
    assert result["event_rows"] == 8
    assert result["repeated_action_rows"] == 7
    assert result["reason_counts"] == {}
    assert all(
        float(p["candidate_seconds"]) == 2880 for p in result["candidate_player_seconds"].values()
    )


def test_dropped_or_shifted_projection_is_rejected() -> None:
    inputs = fixture()
    inputs[1].pop()
    assert report(inputs)["reason_counts"] == {"ordered_projection_join_failed": 1}
    inputs = fixture()
    inputs[1][2][1]["period"] = "1"
    assert report(inputs)["reason_counts"] == {"ordered_projection_join_failed": 1}


def test_full_payload_and_locators_change_join_transcript() -> None:
    inputs = fixture()
    original = report(inputs)["ordered_join_sha256"]
    changed = copy.deepcopy(inputs)
    changed[0][0][1]["description"] = "Corrected start description"
    assert report(changed)["ordered_join_sha256"] != original
    changed = copy.deepcopy(inputs)
    changed[1][0] = (999, changed[1][0][1])
    assert report(changed)["ordered_join_sha256"] != original


def test_pbp_side_corruption_is_not_a_lineup_time_repair() -> None:
    inputs = fixture()
    inputs[0][0][1]["off_player_2"] = "1"
    result = report(inputs)
    assert result["invalid_pbp_off_def_rows"] == 1
    assert result["pbp_lineup_side_disagreement_rows"] == 1
    assert result["candidate_player_seconds"]["2"]["candidate_seconds"] == "2880"
    # Diagnostic time comes only from the separately joined home/away rows.


def test_repeated_lineup_player_quarantines_positive_time() -> None:
    inputs = fixture()
    inputs[1][0][1]["home_player_2"] = "1"
    result = report(inputs)
    assert result["invalid_lineup_positive_seconds"] == "720"
    assert result["reason_counts"]["invalid_lineup_five"] == 1
    assert result["reason_counts"]["invalid_lineup_positive_duration"] == 1
    assert result["reason_counts"]["player_seconds_mismatch"] == 10


def test_malformed_box_minutes_stay_unknown() -> None:
    inputs = fixture()
    inputs[4]["1"]["minutes"] = "30:60"
    result = report(inputs)
    assert result["reason_counts"] == {"independent_minutes_invalid": 1}
    assert "box_seconds" not in result["candidate_player_seconds"]["1"]


def test_score_correction_is_not_clamped_to_running_maximum() -> None:
    inputs = fixture()
    inputs[0][0][1]["score_home"] = "1"
    result = report(inputs)
    assert result["reason_counts"]["score_decrease"] == 1
    assert result["last_observed_scores"]["1"] == 0


def test_opponent_ft_inside_possession_is_not_credited_to_offense() -> None:
    inputs = fixture()
    event = inputs[0][1][1]
    event.update(
        event_type="free_throw",
        team_id="2",
        person_id="6",
        description="Player Free Throw Technical (1 PTS)",
    )
    inputs[3]["2"]["points"] = "1"
    for _, row in inputs[0][1:]:
        row["score_away"] = "1"
    result = report(inputs)
    assert result["direct_points"]["2"] == 1
    assert result["opponent_points_inside_possessions"] == 1
    assert result["reason_counts"]["opponent_points_inside_possession"] == 1
    assert result["reason_counts"]["possession_team_point_mismatch"] == 1
    assert "direct_event_point_mismatch" not in result["reason_counts"]


def test_scoring_event_missing_membership_remains_quarantined() -> None:
    inputs = fixture()
    inputs[0][1][1].update(
        is_field_goal="1", shot_value="2", shot_result="Made", team_id="1", person_id="1"
    )
    inputs[2].pop(0)
    result = report(inputs)
    assert result["reason_counts"]["scoring_event_membership_not_one"] == 1


def test_duplicate_event_and_overlapping_membership_are_separate_failures() -> None:
    inputs = fixture()
    inputs[0][1][1]["action_id"] = "1"
    inputs[2].append(copy.deepcopy(inputs[2][0]))
    result = report(inputs)
    assert result["reason_counts"]["duplicate_or_invalid_event_id"] == 1
    assert result["reason_counts"]["duplicate_possession_identity"] == 1
    assert result["reason_counts"]["overlapping_possession_event_membership"] == 2


@pytest.mark.parametrize("raw", ["", "30:60", "NaN", "-1:00"])
def test_invalid_minutes_never_become_zero(raw: str) -> None:
    with pytest.raises((ValueError, ArithmeticError)):
        spike.minute_seconds(raw)


def test_unknown_ft_outcome_is_rejected() -> None:
    with pytest.raises(ValueError, match="unknown free-throw"):
        spike.event_points(
            {"is_field_goal": "0", "event_type": "free_throw", "description": "Free Throw"}
        )


def test_substitution_snapshot_interpretations_do_not_hide_disagreement() -> None:
    inputs = fixture()
    inputs[4]["1"]["minutes"] = "36:00"
    inputs[4]["11"] = {"team_id": "1", "minutes": "12:00"}
    # First row is the pre-sub snapshot; the next row observes the replaced player.
    inputs[0][0][1]["event_type"] = "substitution"
    inputs[1][1][1]["home_player_1"] = "11"
    result = report(inputs)
    assert result["candidate_player_seconds"]["1"]["delta_seconds"] == "720"
    assert result["candidate_player_seconds"]["1"]["endpoint_delta_seconds"] == "0"
    assert result["endpoint_player_mismatch_count"] == 0
    assert result["reason_counts"]["player_seconds_mismatch"] == 2
    # Indistinguishable projection keys with different lineups require further provenance.
    assert result["reason_counts"]["ambiguous_repeated_projection_lineup"] == 1


def test_explicit_nonparticipation_is_preserved_without_inventing_box_minutes() -> None:
    inputs = fixture()
    inputs[4]["11"] = {"team_id": "1", "minutes": "", "comment": "DNP - Coach's Decision"}
    result = report(inputs)
    assert result["reason_counts"] == {}
    assert result["explicit_nonparticipants"] == 1
    assert "box_seconds" not in result["candidate_player_seconds"]["11"]
    inputs[4]["11"]["comment"] = ""
    result = report(inputs)
    assert result["reason_counts"] == {"independent_minutes_invalid": 1}
    assert result["unknown_box_minutes"] == 1


def test_invalid_clock_is_diagnostic_and_does_not_erase_the_game() -> None:
    inputs = fixture()
    inputs[0][0][1]["seconds_remaining"] = "NaN"
    result = report(inputs)
    assert result["join_verified"] is True
    assert result["reason_counts"]["event_required_value_invalid"] == 1
    assert result["reason_counts"]["incomplete_period_clock_span"] == 1


def test_game_stream_rejects_reopened_groups(tmp_path: Path) -> None:
    import csv

    path = tmp_path / "rows.csv"
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=["game_id"])
        writer.writeheader()
        writer.writerows({"game_id": g} for g in [GID, "0022500002", GID])
    with pytest.raises(ValueError, match="noncontiguous/unsorted"):
        list(spike.games(path))


def test_output_directory_cannot_be_overwritten(tmp_path: Path) -> None:
    with pytest.raises(FileExistsError):
        spike.run(tmp_path, tmp_path, tmp_path, 2026)
