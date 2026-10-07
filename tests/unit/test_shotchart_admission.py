"""Strict shot admission failures and ordered offline evidence; all small rows are synthetic."""

from __future__ import annotations

import csv
import gzip
import io
import json
import lzma
import tarfile
from copy import deepcopy
from datetime import UTC, date, datetime
from pathlib import Path
from unittest.mock import patch

import pytest

from courtlens.domain.shotchart import box_counts, game_identity, parse_shot, reconcile_game
from courtlens.evaluation.shotchart_admission import (
    audit_source,
    season_schedule,
    verify_game_proof,
)
from courtlens.ingestion.shotchart import DOCUMENTS, archive_url, shot_rows, verify_source
from courtlens.ingestion.sportsdataverse import hash_file
from courtlens.ingestion.workbench_source_config import (
    player_boxscores_url,
    schedule_csv_url,
    team_boxscores_url,
)

REVISION = "a" * 40


def shot(**changes: str) -> dict[str, str]:
    return {
        "GAME_ID": "22500001",
        "GAME_EVENT_ID": "1",
        "PLAYER_ID": "10",
        "TEAM_ID": "100",
        "PERIOD": "1",
        "MINUTES_REMAINING": "11",
        "SECONDS_REMAINING": "59",
        "EVENT_TYPE": "Made Shot",
        "SHOT_TYPE": "2PT Field Goal",
        "SHOT_DISTANCE": "0",
        "LOC_X": "0",
        "LOC_Y": "0",
        "SHOT_ATTEMPTED_FLAG": "1",
        "SHOT_MADE_FLAG": "1",
        "GAME_DATE": "20251021",
        "HTM": "ABC",
        "VTM": "DEF",
        "ACTION_TYPE": "Dunk Shot",
        **changes,
    }


def schedule(**changes: str) -> dict[str, str]:
    return {
        "game_id": "0022500001",
        "season": "2026",
        "season_type": "regular-season",
        "game_date": "2025-10-21",
        "home_team_id": "100",
        "away_team_id": "200",
        "home_team_abbreviation": "ABC",
        "away_team_abbreviation": "DEF",
        "home_pts": "2",
        "away_pts": "3",
        "home_wl": "L",
        "away_wl": "W",
        **changes,
    }


def box(**changes: str) -> dict[str, str]:
    return {
        "game_id": "0022500001",
        "season": "2026",
        "season_type_id": "2",
        "team_id": "100",
        "side": "home",
        "team_tricode": "ABC",
        "field_goals_attempted": "1",
        "field_goals_made": "1",
        "three_pointers_attempted": "0",
        "three_pointers_made": "0",
        "free_throws_made": "0",
        "free_throws_attempted": "0",
        "points": "2",
        **changes,
    }


def game_rows() -> tuple[list[dict[str, str]], list[dict[str, str]], list[dict[str, str]]]:
    shots = [
        shot(),
        shot(
            GAME_EVENT_ID="2",
            PLAYER_ID="20",
            TEAM_ID="200",
            SHOT_TYPE="3PT Field Goal",
            LOC_Y="240",
            SHOT_DISTANCE="24",
            SECONDS_REMAINING="58",
        ),
    ]
    teams = [
        box(),
        box(
            team_id="200",
            side="away",
            team_tricode="DEF",
            points="3",
            three_pointers_attempted="1",
            three_pointers_made="1",
        ),
    ]
    players = [
        {**teams[0], "person_id": "10"},
        {**teams[1], "person_id": "20"},
        box(person_id="30", field_goals_attempted="0", field_goals_made="0", points="0"),
    ]
    return shots, teams, players


def reconcile(
    rows: list[dict[str, str]], teams: list[dict[str, str]], players: list[dict[str, str]]
) -> dict:
    attempts = [parse_shot(r, starting_year=2025, source_line=i + 2) for i, r in enumerate(rows)]
    return reconcile_game(attempts, schedule(), teams, players, starting_year=2025)


def test_preserves_event_identity_true_zero_and_full_raw_hash() -> None:
    parsed = parse_shot(shot(), starting_year=2025, source_line=9)
    assert parsed.game_id == "0022500001" and parsed.event_id == 1 and parsed.source_line == 9
    assert parsed.distance_feet == parsed.x_feet == parsed.y_feet == 0
    assert parsed.geometry_exclusions == () and parsed.zone == "Restricted Area"
    changed = parse_shot(shot(ACTION_TYPE="Layup Shot"), starting_year=2025, source_line=9)
    assert parsed.raw_fields_sha256 != changed.raw_fields_sha256


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("GAME_ID", "2.25e7"),
        ("GAME_ID", "0042500001"),
        ("GAME_ID", "0022400001"),
        ("GAME_EVENT_ID", ""),
        ("GAME_EVENT_ID", "0"),
        ("PLAYER_ID", "unknown"),
        ("TEAM_ID", "0"),
        ("SHOT_ATTEMPTED_FLAG", "0"),
        ("SHOT_MADE_FLAG", "yes"),
        ("SHOT_MADE_FLAG", ""),
        ("EVENT_TYPE", "Missed Shot"),
        ("SHOT_TYPE", ""),
        ("SHOT_TYPE", "Free Throw"),
        ("LOC_X", "nan"),
        ("LOC_Y", "inf"),
        ("SHOT_DISTANCE", "-inf"),
        ("SHOT_DISTANCE", "three"),
        ("LOC_X", "1.5"),
        ("GAME_DATE", "20250230"),
        ("GAME_DATE", "20241021"),
        ("GAME_DATE", "2025-10-21"),
        ("PERIOD", "0"),
        ("PERIOD", "21"),
        ("SECONDS_REMAINING", "60"),
        ("MINUTES_REMAINING", "13"),
        ("HTM", ""),
    ],
)
def test_rejects_unknown_malformed_and_nonfinite_event_fields(field: str, value: str) -> None:
    with pytest.raises(ValueError):
        parse_shot(shot(**{field: value}), starting_year=2025, source_line=2)


def test_missing_target_never_becomes_miss_and_overtime_clock_is_bounded() -> None:
    row = shot()
    del row["SHOT_MADE_FLAG"]
    with pytest.raises(ValueError, match="missing required"):
        parse_shot(row, starting_year=2025, source_line=2)
    with pytest.raises(ValueError, match="clock"):
        parse_shot(shot(PERIOD="5"), starting_year=2025, source_line=2)
    parsed = parse_shot(
        shot(PERIOD="5", MINUTES_REMAINING="5", SECONDS_REMAINING="0"),
        starting_year=2025,
        source_line=2,
    )
    assert parsed.seconds_remaining == 300


@pytest.mark.parametrize(
    ("changes", "reason"),
    [
        ({"LOC_X": ""}, "missing_coordinates"),
        ({"SHOT_DISTANCE": ""}, "missing_distance"),
        ({"SHOT_DISTANCE": "-1"}, "negative_distance"),
        ({"LOC_X": "251"}, "off_court_coordinates"),
        ({"LOC_Y": "888"}, "off_court_coordinates"),
        ({"SHOT_DISTANCE": "10"}, "distance_coordinate_mismatch"),
    ],
)
def test_geometry_exclusions_preserve_observed_targets(
    changes: dict[str, str], reason: str
) -> None:
    parsed = parse_shot(shot(**changes), starting_year=2025, source_line=2)
    assert parsed.made and parsed.shot_value == 2
    assert reason in parsed.geometry_exclusions
    if changes.get("SHOT_DISTANCE") == "":
        assert parsed.distance_feet is None


def test_exact_reconciliation_includes_geometry_excluded_and_zero_attempt_players() -> None:
    rows, teams, players = game_rows()
    rows[0]["LOC_X"] = ""
    result = reconcile(rows, teams, players)
    assert result["status"] == "reconciled"
    assert result["observed_attempts"] == 2 and result["model_eligible_attempts"] == 1
    zero = next(c for c in result["comparisons"] if c["id"] == "30")
    assert zero["box_counts"] == zero["shot_counts"] == (0, 0, 0, 0)
    rows.pop(0)
    result = reconcile(rows, teams, players)
    assert result["status"] == "quarantined" and result["model_eligible_attempts"] == 0
    assert "team_counts_mismatch:100" in result["reasons"]


@pytest.mark.parametrize(
    "mutation",
    [
        "duplicate_event",
        "duplicate_player",
        "missing_team",
        "unexpected_shooter",
        "wrong_team",
        "zero_count_mismatch",
        "missing_count",
        "three_count_mismatch",
        "wrong_phase",
        "score",
        "clock_order",
        "wrong_date",
        "wrong_home",
        "player_sums",
    ],
)
def test_quarantines_entire_game_on_unresolved_identity_or_counts(mutation: str) -> None:
    rows, teams, players = game_rows()
    if mutation == "duplicate_event":
        rows[1]["GAME_EVENT_ID"] = "1"
    elif mutation == "duplicate_player":
        players.append(deepcopy(players[0]))
    elif mutation == "missing_team":
        teams.pop()
    elif mutation == "unexpected_shooter":
        rows[0]["PLAYER_ID"] = "99"
    elif mutation == "wrong_team":
        rows[0]["TEAM_ID"] = "200"
    elif mutation == "zero_count_mismatch":
        players[0]["field_goals_made"] = players[0]["field_goals_attempted"] = "0"
    elif mutation == "missing_count":
        players[0]["field_goals_attempted"] = ""
    elif mutation == "three_count_mismatch":
        teams[1]["three_pointers_made"] = "0"
    elif mutation == "wrong_phase":
        teams[0]["season_type_id"] = "4"
    elif mutation == "score":
        teams[0]["points"] = "10"
    elif mutation == "clock_order":
        rows[1]["MINUTES_REMAINING"] = "12"
        rows[1]["SECONDS_REMAINING"] = "0"
    elif mutation == "wrong_date":
        rows[0]["GAME_DATE"] = "20251022"
    elif mutation == "wrong_home":
        rows[0]["HTM"] = "XYZ"
    elif mutation == "player_sums":
        players.pop(0)
    result = reconcile(rows, teams, players)
    assert result["status"] == "quarantined" and result["model_eligible_attempts"] == 0


def test_impossible_box_counts_and_nonnumeric_identity_are_rejected() -> None:
    with pytest.raises(ValueError, match="impossible"):
        box_counts(box(field_goals_attempted="1", field_goals_made="2"))
    with pytest.raises(ValueError):
        game_identity("+22500001", 2025)


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    opener = gzip.open if path.suffix == ".gz" else Path.open
    with opener(path, "wt", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def write_tar(path: Path, *, rows: list[dict[str, str]], bad_member: str | None = None) -> None:
    data = io.StringIO(newline="")
    writer = csv.DictWriter(data, fieldnames=list(rows[0]))
    writer.writeheader()
    writer.writerows(rows)
    payload = data.getvalue().encode()
    with tarfile.open(path, "w:xz") as archive:
        info = tarfile.TarInfo("shotdetail_2025.csv")
        info.size = len(payload)
        archive.addfile(info, io.BytesIO(payload))
        if bad_member:
            bad = tarfile.TarInfo(bad_member)
            archive.addfile(bad, io.BytesIO(b""))


def source_fixture(tmp_path: Path, *, bad_shot: bool = False) -> tuple[Path, Path]:
    source, boxes = tmp_path / "shots", tmp_path / "boxes"
    (source / "datasets").mkdir(parents=True)
    boxes.mkdir()
    rows, teams, players = game_rows()
    if bad_shot:
        rows[0]["SHOT_MADE_FLAG"] = "unknown"
    write_tar(source / "datasets/shotdetail_2025.tar.xz", rows=rows)
    assets = []
    for name in (*DOCUMENTS, "datasets/shotdetail_2025.tar.xz"):
        if name in DOCUMENTS:
            (source / name).write_text("SYNTHETIC TEST FIXTURE; no external reuse claim")
        digest, size = hash_file(source / name)
        assets.append(
            {
                "url": archive_url(REVISION, 2025, name),
                "sha256": digest,
                "bytes": size,
                "observed_at": datetime.now(UTC).isoformat(),
            }
        )
    (source / "acquisition.json").write_text(json.dumps({"revision": REVISION, "assets": assets}))
    specs = {
        "schedule": ("nba_schedule_2026.csv.gz", [schedule()], schedule_csv_url(2026)),
        "team_boxscores": ("team_boxscores_2026.csv", teams, team_boxscores_url(2026)),
        "player_boxscores": ("player_boxscores_2026.csv", players, player_boxscores_url(2026)),
    }
    files = {}
    for kind, (name, records, url) in specs.items():
        write_csv(boxes / name, records)
        digest, size = hash_file(boxes / name)
        files[kind] = {"url": url, "sha256": digest, "bytes": size}
    (boxes / "retrieval-manifest.json").write_text(
        json.dumps(
            {
                "ending_year": 2026,
                "acquired_at_utc": datetime.now(UTC).isoformat(),
                "files": files,
            }
        )
    )
    return source, boxes


def test_streaming_archive_rejects_extra_members_and_restores_csv_limit(tmp_path: Path) -> None:
    archive = tmp_path / "test.tar.xz"
    write_tar(archive, rows=[shot()], bad_member="../escape")
    limit = csv.field_size_limit()
    with pytest.raises(ValueError, match="exactly"):
        list(shot_rows(archive, starting_year=2025))
    assert csv.field_size_limit() == limit
    assert not (tmp_path.parent / "escape").exists()


def test_archive_checksum_and_pinned_receipt_are_verified(tmp_path: Path) -> None:
    source, _ = source_fixture(tmp_path)
    verify_source(source, starting_year=2025)
    (source / "LICENSE").write_text("changed bytes")
    with pytest.raises(ValueError, match="bytes/hash"):
        verify_source(source, starting_year=2025)
    with pytest.raises(ValueError, match="full Git revision"):
        archive_url("main", 2025)


def test_stream_limits_and_archive_corruption_fail_closed(tmp_path: Path) -> None:
    archive = tmp_path / "test.tar.xz"
    write_tar(archive, rows=[shot(), shot(GAME_EVENT_ID="2")])
    with (
        patch("courtlens.ingestion.shotchart.MAX_ROWS", 1),
        pytest.raises(ValueError, match="row budget"),
    ):
        list(shot_rows(archive, starting_year=2025))
    with (
        patch("courtlens.ingestion.shotchart.MAX_EXPANDED_BYTES", 1024),
        pytest.raises(ValueError, match="byte limit"),
    ):
        list(shot_rows(archive, starting_year=2025))
    payload = bytearray(archive.read_bytes())
    payload[-10] ^= 255
    archive.write_bytes(payload)
    with pytest.raises((lzma.LZMAError, tarfile.ReadError, EOFError)):
        list(shot_rows(archive, starting_year=2025))


def test_event_clock_violation_retains_exact_provider_keys() -> None:
    rows, teams, players = game_rows()
    rows[0]["SECONDS_REMAINING"] = "57"
    result = reconcile(rows, teams, players)
    assert result["clock_order_violations"] == [
        {
            "previous_event_id": 1,
            "previous_period": 1,
            "previous_seconds_remaining": 717,
            "event_id": 2,
            "period": 1,
            "seconds_remaining": 718,
        }
    ]


def test_v2_retains_clock_reversals_without_changing_counts_or_membership() -> None:
    rows, teams, players = game_rows()
    rows[0]["SECONDS_REMAINING"] = "57"
    shots = [parse_shot(row, starting_year=2025, source_line=i + 2) for i, row in enumerate(rows)]
    v1 = reconcile_game(shots, schedule(), teams, players, starting_year=2025)
    v2 = reconcile_game(shots, schedule(), teams, players, starting_year=2025, policy_version="v2")
    assert v1["status"] == "quarantined" and v1["reasons"] == ["event_clock_order"]
    assert v2["status"] == "reconciled" and v2["model_eligible_attempts"] == len(shots)
    for key in ("clock_order_violations", "comparisons", "row_membership_sha256"):
        assert v1[key] == v2[key]
    duplicate = reconcile_game(
        [*shots, shots[0]], schedule(), teams, players, starting_year=2025, policy_version="v2"
    )
    assert duplicate["status"] == "quarantined"
    assert "duplicate_game_event" in duplicate["reasons"]
    assert any("counts_mismatch" in reason for reason in duplicate["reasons"])
    assert duplicate["model_eligible_attempts"] == 0
    with pytest.raises(ValueError, match="unknown shot admission policy"):
        reconcile_game(shots, schedule(), teams, players, starting_year=2025, policy_version="v3")


def test_v2_proofs_are_registered_exclusive_and_cannot_be_used_as_v1(tmp_path: Path) -> None:
    source, boxes = source_fixture(tmp_path)
    output = tmp_path / "v2-game"
    result = audit_source(
        shot_root=source,
        box_root=boxes,
        starting_year=2025,
        before_date=date(2026, 10, 3),
        game_id="0022500001",
        output=output,
        policy_version="v2",
    )
    registration = json.loads((output / "policy-registration.json").read_text())
    assert registration["registered_at"] < result["observed_at"]
    assert not registration["fit_authorized"] and not registration["sequence_analytics_authorized"]
    assert result["transform_version"] == "courtload-shotchart-v2"
    verify_game_proof(
        output,
        source=result["source"],
        independent=result["independent_sources"],
        policy_version="v2",
    )
    with pytest.raises(ValueError, match="quality recipe"):
        verify_game_proof(
            output, source=result["source"], independent=result["independent_sources"]
        )
    (output / "policy-registration.json").write_text("changed")
    with pytest.raises(ValueError, match="registration bytes"):
        verify_game_proof(
            output,
            source=result["source"],
            independent=result["independent_sources"],
            policy_version="v2",
        )


def test_offline_game_evidence_is_complete_exclusive_and_not_fit_authorization(
    tmp_path: Path,
) -> None:
    source, boxes = source_fixture(tmp_path)
    output = tmp_path / "game"
    result = audit_source(
        shot_root=source,
        box_root=boxes,
        starting_year=2025,
        before_date=date(2026, 10, 3),
        game_id="0022500001",
        output=output,
    )
    assert result["status"] == "reconciled_offline_candidate"
    assert result["observed_attempts"] == result["model_eligible_attempts"] == 2
    assert not result["fit_authorized"] and not result["database_admitted"]
    assert not result["complete_reconciled_season"]
    verify_game_proof(output, source=result["source"], independent=result["independent_sources"])
    original = (output / "manifest.json").read_bytes()
    with pytest.raises(FileExistsError):
        audit_source(
            shot_root=source,
            box_root=boxes,
            starting_year=2025,
            before_date=date(2026, 10, 3),
            game_id="0022500001",
            output=output,
        )
    assert (output / "manifest.json").read_bytes() == original
    with pytest.raises(ValueError, match="one-game proof"):
        audit_source(
            shot_root=source,
            box_root=boxes,
            starting_year=2025,
            before_date=date(2026, 10, 3),
            output=tmp_path / "season",
        )
    season = audit_source(
        shot_root=source,
        box_root=boxes,
        starting_year=2025,
        before_date=date(2026, 10, 3),
        output=tmp_path / "season",
        game_proof=output,
    )
    assert season["status"] == "source_blocked" and not season["complete_reconciled_season"]
    (output / "attempts.jsonl").write_text("changed")
    with pytest.raises(ValueError, match="artifact bytes"):
        verify_game_proof(
            output, source=result["source"], independent=result["independent_sources"]
        )


def test_bad_shot_quarantines_game_and_cannot_be_a_season_proof(tmp_path: Path) -> None:
    source, boxes = source_fixture(tmp_path, bad_shot=True)
    output = tmp_path / "game"
    result = audit_source(
        shot_root=source,
        box_root=boxes,
        starting_year=2025,
        before_date=date(2026, 10, 3),
        game_id="0022500001",
        output=output,
    )
    assert result["quarantined_games"] == result["rejected_rows"] == 1
    assert result["model_eligible_attempts"] == 0 and result["status"] == "source_blocked"
    with pytest.raises(ValueError, match="does not reconcile"):
        audit_source(
            shot_root=source,
            box_root=boxes,
            starting_year=2025,
            before_date=date(2026, 10, 3),
            output=tmp_path / "season",
            game_proof=output,
        )


def test_independent_denominator_detects_missing_game_duplicates_and_future_dates() -> None:
    rows = []
    for round_index in range(82):
        for pair in range(15):
            index = round_index * 15 + pair + 1
            rows.append(
                schedule(
                    game_id=f"00225{index:05d}",
                    home_team_id=str(100 + 2 * pair),
                    away_team_id=str(101 + 2 * pair),
                )
            )
    _, denominator = season_schedule(rows, starting_year=2025, before_date=date(2026, 10, 3))
    assert denominator["denominator_verified"]
    _, partial = season_schedule(rows[:-1], starting_year=2025, before_date=date(2026, 10, 3))
    assert not partial["denominator_verified"]
    with pytest.raises(ValueError, match="duplicate"):
        season_schedule([*rows, rows[0]], starting_year=2025, before_date=date(2026, 10, 3))
    with pytest.raises(ValueError, match="date"):
        season_schedule(
            [schedule(game_date="2026-10-03")], starting_year=2025, before_date=date(2026, 10, 3)
        )
