from __future__ import annotations

import csv
import hashlib
import importlib.util
from pathlib import Path

import pytest

from courtload.ingestion import archive

SCRIPT = Path(__file__).parents[2] / "scripts" / "historical_source_spike.py"
SPEC = importlib.util.spec_from_file_location("historical_source_spike", SCRIPT)
assert SPEC and SPEC.loader
spike = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(spike)


def player_row(**changes: str) -> dict[str, str]:
    row = {
        "season_year": "2021-22",
        "game_date": "2021-10-19",
        "gameId": "22100001",
        "matchup": "ATL vs. BOS",
        "teamId": "1",
        "teamTricode": "ATL",
        "personId": "11",
        "personName": "Fixture Player",
        "minutes": "12:30",
        "comment": "",
        **{field: "0" for field in spike.COUNT_FIELDS},
    }
    row.update({"fieldGoalsMade": "1", "fieldGoalsAttempted": "1", "points": "2"})
    row.update(changes)
    return row


def team_row(**changes: str) -> dict[str, str]:
    row = {
        "SEASON_YEAR": "2021-22",
        "GAME_DATE": "2021-10-19T00:00:00",
        "GAME_ID": "0022100001",
        "TEAM_ID": "1",
        "TEAM_ABBREVIATION": "ATL",
        "MATCHUP": "ATL vs. BOS",
        "PTS": "2",
        "MIN": "48.0",
    }
    row.update(changes)
    return row


def write_csv(path: Path, records: list[dict[str, str]], fields: list[str]) -> None:
    with path.open("w", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields)
        writer.writeheader()
        writer.writerows(records)


def test_archive_parser_keeps_unknown_distinct_from_zero() -> None:
    parsed = spike.parse_player(player_row(assists="", steals="0"))
    assert parsed["stats"]["assists"] is None
    assert parsed["stats"]["steals"] == 0
    assert parsed["minutes_seconds"] == 750
    assert parsed["appearance"] == "appeared"

    dnp = spike.parse_player(player_row(minutes="", comment="DNP - Coach's Decision"))
    assert dnp["appearance"] == "reported_nonappearance"
    assert dnp["minutes_seconds"] is None
    with pytest.raises(ValueError, match="malformed_minutes"):
        spike.parse_player(player_row(minutes="26:60"))
    with pytest.raises(ValueError, match="malformed_game_id"):
        spike.parse_player(player_row(gameId="123"))

    parsed_team = spike.parse_team(team_row(TOV="16.0", FG3A="49"))
    assert parsed_team["stats"]["turnovers"] == 16
    assert parsed_team["stats"]["threePointersAttempted"] == 49


def test_acquisition_rejects_partial_file_without_installing_it(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source = tmp_path / "source.csv"
    source.write_bytes(b"full file")
    name = "fixture.csv"
    monkeypatch.setitem(archive.FILES, name, source.stat().st_size)
    monkeypatch.setitem(archive.SHA256, name, hashlib.sha256(source.read_bytes()).hexdigest())
    destination = tmp_path / "destination.csv"
    result = archive.acquire_file(name, destination, local_source=source)
    assert result["sha256"] == archive.SHA256[name]
    assert destination.read_bytes() == source.read_bytes()

    destination.unlink()
    source.write_bytes(b"short")
    with pytest.raises(ValueError, match="Incomplete"):
        archive.acquire_file(name, destination, local_source=source)
    assert not destination.exists()
    assert not list(tmp_path.glob(".destination.csv.*"))


def test_conflicting_fixture_row_quarantines_game(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    player_fields = list(player_row())
    team_fields = list(team_row())
    first_game = [
        player_row(),
        player_row(
            personId="12",
            personName="Fixture Opponent",
            teamId="2",
            teamTricode="BOS",
            matchup="BOS @ ATL",
            fieldGoalsMade="0",
            fieldGoalsAttempted="0",
            points="0",
        ),
    ]
    second_game = [dict(row, gameId="22100002", game_date="2021-10-20") for row in first_game]
    conflicting = dict(second_game[0], fieldGoalsMade="2", fieldGoalsAttempted="2", points="4")
    write_csv(tmp_path / spike.PLAYER_FILES[0], first_game + second_game, player_fields)
    write_csv(tmp_path / spike.PLAYER_FILES[1], [conflicting], player_fields)
    write_csv(tmp_path / spike.PLAYER_FILES[2], [], player_fields)
    teams = [
        team_row(),
        team_row(TEAM_ID="2", TEAM_ABBREVIATION="BOS", MATCHUP="BOS @ ATL", PTS="0"),
    ]
    teams += [dict(row, GAME_ID="0022100002", GAME_DATE="2021-10-20T00:00:00") for row in teams]
    write_csv(tmp_path / spike.TEAM_FILE, teams, team_fields)
    for name in spike.FILES:
        data = (tmp_path / name).read_bytes()
        monkeypatch.setitem(spike.FILES, name, len(data))
        monkeypatch.setitem(spike.SHA256, name, hashlib.sha256(data).hexdigest())

    report = spike.analyze(tmp_path)
    assert report["duplicates"]["conflicting_player"] == 1
    assert report["game_counts"]["2021-22"]["admitted_games"] == 1
    assert report["reconciliation"]["games_with_conflicting_rows"] == 1


def test_import_reversion_keeps_observations_and_reuses_dataset(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, session: object
) -> None:
    from sqlalchemy import func, select
    from sqlalchemy.orm import Session

    from courtload.archive_models import (
        ArchiveDataset,
        ArchiveObservation,
        ArchivePlayerGame,
        ArchiveQuarantine,
        ArchiveVersion,
    )
    from courtload.ingestion.archive_import import import_archive

    assert isinstance(session, Session)

    def write_version(points: int) -> None:
        player = player_row(
            fieldGoalsMade=str(points // 2),
            fieldGoalsAttempted=str(points // 2),
            points=str(points),
        )
        opponent = player_row(
            personId="12",
            personName="Fixture Opponent",
            teamId="2",
            teamTricode="BOS",
            matchup="BOS @ ATL",
            fieldGoalsMade="0",
            fieldGoalsAttempted="0",
            points="0",
        )
        malformed = dict(player, personId="13", personName="Bad Minute", minutes="26:60")
        write_csv(tmp_path / spike.PLAYER_FILES[0], [player, opponent, malformed], list(player))
        for name in spike.PLAYER_FILES[1:]:
            write_csv(tmp_path / name, [], list(player))
        teams = [
            team_row(PTS=str(points)),
            team_row(TEAM_ID="2", TEAM_ABBREVIATION="BOS", MATCHUP="BOS @ ATL", PTS="0"),
        ]
        write_csv(tmp_path / spike.TEAM_FILE, teams, list(teams[0]))
        for name in spike.FILES:
            data = (tmp_path / name).read_bytes()
            monkeypatch.setitem(spike.FILES, name, len(data))
            monkeypatch.setitem(spike.SHA256, name, hashlib.sha256(data).hexdigest())

    # A quarantined row excludes its whole game, so use a separate second game for it.
    # Here it is checked through a failed import; then remove the malformed row for A/B/A.
    write_version(2)
    with pytest.raises(ValueError, match="No reconciled games admitted"):
        import_archive(session, tmp_path)
    assert session.scalar(select(func.count()).select_from(ArchiveDataset)) == 0

    def remove_bad_row() -> None:
        path = tmp_path / spike.PLAYER_FILES[0]
        with path.open(newline="") as stream:
            records = list(csv.DictReader(stream))
        write_csv(path, records[:2], list(records[0]))
        data = path.read_bytes()
        monkeypatch.setitem(spike.FILES, path.name, len(data))
        monkeypatch.setitem(spike.SHA256, path.name, hashlib.sha256(data).hexdigest())

    dataset_ids = []
    for points in (2, 4, 2):
        write_version(points)
        remove_bad_row()
        run = import_archive(session, tmp_path)
        assert run.status == "accepted"
        dataset_ids.append(run.dataset_id)
    assert dataset_ids[0] != dataset_ids[1]
    assert dataset_ids[0] == dataset_ids[2]
    assert session.scalar(select(func.count()).select_from(ArchiveDataset)) == 2
    assert session.scalar(select(func.count()).select_from(ArchiveObservation)) == 12
    assert session.scalar(select(func.count()).select_from(ArchiveVersion)) >= 5
    assert session.scalar(select(func.count()).select_from(ArchivePlayerGame)) == 4
    assert session.scalar(select(func.count()).select_from(ArchiveQuarantine)) == 0


def test_import_retains_quarantine_locator_on_accepted_dataset(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, session: object
) -> None:
    from sqlalchemy import select
    from sqlalchemy.orm import Session

    from courtload.archive_models import ArchiveQuarantine
    from courtload.ingestion.archive_import import import_archive

    assert isinstance(session, Session)
    home = player_row()
    away = player_row(
        personId="12",
        personName="Opponent",
        teamId="2",
        teamTricode="BOS",
        matchup="BOS @ ATL",
        fieldGoalsMade="0",
        fieldGoalsAttempted="0",
        points="0",
    )
    second = [dict(row, gameId="22100002", game_date="2021-10-20") for row in (home, away)]
    bad = dict(second[0], personId="13", personName="Bad Minute", minutes="26:60")
    write_csv(tmp_path / spike.PLAYER_FILES[0], [home, away, *second, bad], list(home))
    for name in spike.PLAYER_FILES[1:]:
        write_csv(tmp_path / name, [], list(home))
    first_teams = [
        team_row(),
        team_row(TEAM_ID="2", TEAM_ABBREVIATION="BOS", MATCHUP="BOS @ ATL", PTS="0"),
    ]
    second_teams = [
        dict(row, GAME_ID="0022100002", GAME_DATE="2021-10-20T00:00:00") for row in first_teams
    ]
    write_csv(tmp_path / spike.TEAM_FILE, first_teams + second_teams, list(first_teams[0]))
    for name in spike.FILES:
        data = (tmp_path / name).read_bytes()
        monkeypatch.setitem(spike.FILES, name, len(data))
        monkeypatch.setitem(spike.SHA256, name, hashlib.sha256(data).hexdigest())
    run = import_archive(session, tmp_path)
    assert run.report_json["admitted_games"] == 1
    quarantined = session.scalars(
        select(ArchiveQuarantine).where(ArchiveQuarantine.reason == "malformed_minutes")
    ).all()
    assert len(quarantined) == 1
    assert quarantined[0].row_number == 6
    assert quarantined[0].game_id == "0022100002"
