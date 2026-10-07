"""Source admission regressions: precision, full-field identity and fail-closed coverage."""

from decimal import Decimal

import pytest
from assignment_fakes import make_assignment_inputs, prepare, write_csv

from courtlens.services.assignment_admission import AssignmentAdmissionError


@pytest.fixture
def assignment_inputs(tmp_path):
    return make_assignment_inputs(tmp_path)


def test_exact_exposure_full_row_hash_and_repeated_content(assignment_inputs):
    a = prepare(assignment_inputs)
    member = a["members"][0]
    assert member["matchup_seconds"] == Decimal("85.500000000000000001")
    assert member["source_row"] == 1
    assert member["payload_json"]["off_jersey_num"] == "00"
    assert a["content_sha256"] == prepare(assignment_inputs)["content_sha256"]
    source, _, _, store, row = assignment_inputs
    row["team_points"] = "9"
    write_csv(source, [row])
    b = prepare(assignment_inputs)
    assert b["members"][0]["row_sha256"] != member["row_sha256"]
    assert b["content_sha256"] != a["content_sha256"]
    assert (store / a["manifest"]["inputs"]["assignments"]["locator"]).exists()


@pytest.mark.parametrize(
    "field,value",
    [
        ("matchup_minutes_sort", "NaN"),
        ("partial_possessions", "-1"),
        ("partial_possessions", ""),
        ("team_points", ""),
        ("help_field_goals_made", "1"),
        ("side", "away"),
        ("def_person_id", "99"),
        ("percentage_total_time_both_on", "Infinity"),
        ("matchup_three_pointers_attempted", "1"),
    ],
)
def test_bad_row_rejects_entire_game(assignment_inputs, field, value):
    source, _, _, _, row = assignment_inputs
    row[field] = value
    write_csv(source, [row])
    with pytest.raises(AssignmentAdmissionError) as error:
        prepare(assignment_inputs)
    assert error.value.failures[0]["game_id"] == row["game_id"]
    assert error.value.failures[0]["source_row"] == 1


def test_duplicate_pair_and_orphan_missing_games(assignment_inputs):
    source, _, _, _, row = assignment_inputs
    write_csv(source, [row, row])
    with pytest.raises(AssignmentAdmissionError, match="1 failures"):
        prepare(assignment_inputs)
    row["game_id"] = "0022500002"
    write_csv(source, [row])
    with pytest.raises(AssignmentAdmissionError) as error:
        prepare(assignment_inputs)
    assert {f["game_id"] for f in error.value.failures} == {"0022500001", "0022500002"}


def test_retained_corruption_is_never_overwritten(assignment_inputs):
    a = prepare(assignment_inputs)
    path = assignment_inputs[3] / a["manifest"]["inputs"]["assignments"]["locator"]
    path.write_bytes(b"corrupted")
    with pytest.raises(ValueError, match="retained input checksum differs"):
        prepare(assignment_inputs)
