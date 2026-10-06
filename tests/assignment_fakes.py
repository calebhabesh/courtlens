"""Small complete assignment season used by unit and PostgreSQL regressions."""

import csv
import gzip
from pathlib import Path

from courtload.services.assignment_admission import (
    BOX_COUNTS,
    COUNTS,
    PERCENTAGES,
    prepare_assignments,
)


def write_csv(path: Path, rows: list[dict[str, str]]) -> None:
    opener = gzip.open if path.suffix == ".gz" else Path.open
    with opener(path, "wt", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def make_assignment_inputs(tmp_path: Path):
    baseline = tmp_path / "baseline"
    baseline.mkdir()
    gid = "0022500001"
    source = tmp_path / "game_matchups_2026.csv"
    method = tmp_path / "methodology.md"
    method.write_text("Fixture provider denominator reference")
    common = {"game_id": gid, "season": "2026", **dict.fromkeys(BOX_COUNTS, "0")}
    write_csv(
        baseline / "team_boxscores_2026.csv",
        [
            {**common, "team_id": tid, "side": side, "points": "0"}
            for tid, side in (("1", "home"), ("2", "away"))
        ],
    )
    write_csv(
        baseline / "player_boxscores_2026.csv",
        [
            {**common, "team_id": tid, "person_id": pid, "minutes": "30:60"}
            for tid, pid in (("1", "10"), ("2", "20"))
        ],
    )
    write_csv(
        baseline / "nba_schedule_2026.csv.gz",
        [
            {
                "game_id": gid,
                "game_date": "2025-10-21",
                "season_type": "regular",
                "home_team_id": "1",
                "away_team_id": "2",
                "home_pts": "0",
                "away_pts": "0",
            }
        ],
    )
    row = {
        "game_id": gid,
        "season": "2026",
        "season_type_id": "2",
        "side": "home",
        "off_person_id": "10",
        "def_person_id": "20",
        "off_team_id": "1",
        "def_team_id": "2",
        "matchup_minutes": "1:26",
        "matchup_minutes_sort": "85.500000000000000001",
        "partial_possessions": "7.7",
        "off_jersey_num": "00",
        **dict.fromkeys(COUNTS, "0"),
        **dict.fromkeys(PERCENTAGES, "0"),
    }
    write_csv(source, [row])
    return source, baseline, method, tmp_path / "store", row


def prepare(inputs):
    source, baseline, method, store, _ = inputs
    return prepare_assignments(source, baseline, method, store, 2026)
