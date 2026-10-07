"""Integration tests for Block B19: Rich-source admission into PostgreSQL.

Tests:
- End-to-end admission of PBP, possessions, lineups, shots, and matchups.
- Invariant verification and recording in workbench_rich_admissions table.
- Quarantine isolation of non-conforming games into rejected_games_json.
- Sealed table mutation enforcement: mutations outside allow_admin_mutation raise RuntimeError.
- Report extraction via get_rich_admissions_report.
"""

from __future__ import annotations

import csv
import gzip
import os
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session

from courtlens.database import Base
from courtlens.domain.rich_sources import (
    POSSESSION_POLICY_VERSION,
    RICH_PARSER_SIGNATURE,
)
from courtlens.models import new_uuid
from courtlens.services.rich_source_admission import (
    admit_rich_sources_for_season,
    get_rich_admissions_report,
)
from courtlens.workbench_models import (
    WorkbenchDataset,
    WorkbenchLineup,
    WorkbenchMatchup,
    WorkbenchPbpEvent,
    WorkbenchPossession,
    WorkbenchRichAdmission,
    WorkbenchShot,
    allow_admin_mutation,
)

pytestmark = pytest.mark.postgres


@pytest.fixture
def db_session() -> Session:
    url = os.getenv("COURTLENS_TEST_POSTGRES_URL") or os.getenv("COURTLENS_DATABASE_URL")
    if not url:
        if os.getenv("CI") or os.getenv("COURTLENS_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("COURTLENS_TEST_POSTGRES_URL must be configured")
        pytest.skip("PostgreSQL URL is not configured")
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    session = Session(engine)
    yield session
    session.close()
    engine.dispose()


@pytest.fixture
def test_dataset(db_session: Session) -> WorkbenchDataset:
    # Use existing ready dataset if available
    dataset = db_session.scalars(
        select(WorkbenchDataset).where(
            WorkbenchDataset.id == "17251a08-a4eb-4f46-b356-999fcf37c65d"
        )
    ).first()
    if not dataset:
        dataset = db_session.scalars(select(WorkbenchDataset)).first()
    if not dataset:
        with allow_admin_mutation(db_session):
            ds_id = f"test_rich_ds_{uuid4().hex[:8]}"
            dataset = WorkbenchDataset(
                id=ds_id,
                content_sha256=uuid4().hex * 2,
                membership_sha256=uuid4().hex * 2,
                semantic_signature=uuid4().hex * 2,
                source_namespace="sportsdataverse",
                parser_version="test-v1",
                quality_version="test-v1",
                seasons_json=["2023-24"],
                phases_json=["regular_season"],
                manifest_json={},
                coverage_json={},
                exclusions_json={},
                status="active",
            )
            db_session.add(dataset)
            db_session.commit()

    return dataset


def create_mock_season_dir(
    tmp_path: Path, ending_year: int = 2024, game_id: str = "0099999999"
) -> Path:
    """Create directory with mock rich source files for testing."""
    s_dir = tmp_path / f"sportsdataverse_{ending_year}"
    s_dir.mkdir(parents=True, exist_ok=True)

    # 1. PBP (.csv.gz)
    pbp_file = s_dir / f"nba_play_by_play_{ending_year}.csv.gz"
    with gzip.open(pbp_file, "wt", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "game_id",
                "order_index",
                "action_number",
                "period",
                "clock",
                "seconds_remaining",
                "event_type",
                "action_type",
                "sub_type",
                "team_id",
                "person_id",
                "score_home",
                "score_away",
                "points_total",
                "shot_value",
                "shot_distance",
                "x_legacy",
                "y_legacy",
                "possession_number",
                "off_player_1",
                "off_player_2",
                "off_player_3",
                "off_player_4",
                "off_player_5",
                "def_player_1",
                "def_player_2",
                "def_player_3",
                "def_player_4",
                "def_player_5",
                "description",
                "video_available",
            ]
        )
        writer.writerow(
            [
                game_id,
                "1",
                "1",
                "1",
                "12:00",
                "720.0",
                "start",
                "",
                "",
                "1610612738",
                "",
                "0",
                "0",
                "0",
                "",
                "",
                "",
                "",
                "1",
                "p1",
                "p2",
                "p3",
                "p4",
                "p5",
                "d1",
                "d2",
                "d3",
                "d4",
                "d5",
                "Start",
                "1",
            ]
        )
        writer.writerow(
            [
                game_id,
                "2",
                "2",
                "1",
                "11:30",
                "690.0",
                "shot",
                "Jump Shot",
                "",
                "1610612738",
                "p1",
                "2",
                "0",
                "2",
                "2",
                "10.0",
                "100",
                "50",
                "1",
                "p1",
                "p2",
                "p3",
                "p4",
                "p5",
                "d1",
                "d2",
                "d3",
                "d4",
                "d5",
                "Shot",
                "1",
            ]
        )

    # 2. Possessions (.csv.gz)
    poss_file = s_dir / f"nba_possessions_{ending_year}.csv.gz"
    with gzip.open(poss_file, "wt", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "game_id",
                "possession_number",
                "period",
                "number_in_period",
                "offense_team_id",
                "defense_team_id",
                "start_order_index",
                "end_order_index",
                "start_seconds_remaining",
                "end_seconds_remaining",
                "points",
                "is_second_chance",
                "count_as_possession",
                "possession_start_type",
                "fg2a",
                "fg2m",
                "fg3a",
                "fg3m",
                "fta",
                "ftm",
                "oreb",
                "dreb",
                "tov",
                "off_player_1",
                "off_player_2",
                "off_player_3",
                "off_player_4",
                "off_player_5",
                "def_player_1",
                "def_player_2",
                "def_player_3",
                "def_player_4",
                "def_player_5",
                "lineup_source",
            ]
        )
        writer.writerow(
            [
                game_id,
                "1",
                "1",
                "1",
                "1610612738",
                "1610612748",
                "1",
                "3",
                "720.0",
                "690.0",
                "2",
                "false",
                "true",
                "OffDeadball",
                "1",
                "1",
                "0",
                "0",
                "0",
                "0",
                "0",
                "0",
                "0",
                "p1",
                "p2",
                "p3",
                "p4",
                "p5",
                "d1",
                "d2",
                "d3",
                "d4",
                "d5",
                "quarter_box",
            ]
        )

    # 3. Game Lineups (.csv.gz)
    lineup_file = s_dir / f"nba_game_lineups_{ending_year}.csv.gz"
    with gzip.open(lineup_file, "wt", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "game_id",
                "action_number",
                "period",
                "home_player_1",
                "home_player_2",
                "home_player_3",
                "home_player_4",
                "home_player_5",
                "away_player_1",
                "away_player_2",
                "away_player_3",
                "away_player_4",
                "away_player_5",
            ]
        )
        writer.writerow(
            [
                game_id,
                "1",
                "1",
                "p1",
                "p2",
                "p3",
                "p4",
                "p5",
                "d1",
                "d2",
                "d3",
                "d4",
                "d5",
            ]
        )

    # 4. Shots (.csv)
    shots_file = s_dir / f"shots_{ending_year}.csv"
    with shots_file.open("w", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "game_id",
                "period",
                "clock",
                "team_id",
                "person_id",
                "player_name",
                "action_type",
                "sub_type",
                "shot_result",
                "shot_value",
                "shot_distance",
                "x_legacy",
                "y_legacy",
                "score_home",
                "score_away",
                "description",
            ]
        )
        # Shot 1: 2pt made, RA
        writer.writerow(
            [
                game_id,
                "1",
                "11:30",
                "1610612738",
                "p1",
                "Player One",
                "Jump Shot",
                "Pullup",
                "Made",
                "2",
                "3.0",
                "0",
                "30",
                "2",
                "0",
                "Made 2pt",
            ]
        )
        # Shot 2: 3pt made, Right Corner 3
        writer.writerow(
            [
                game_id,
                "1",
                "09:45",
                "1610612748",
                "d1",
                "Defender One",
                "Jump Shot",
                "3PT Jump Shot",
                "Made",
                "3",
                "23.0",
                "225",
                "50",
                "2",
                "3",
                "Made 3pt",
            ]
        )

    # 5. Matchups (.csv)
    matchup_file = s_dir / f"game_matchups_{ending_year}.csv"
    with matchup_file.open("w", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "game_id",
                "off_team_id",
                "def_team_id",
                "side",
                "off_person_id",
                "off_first_name",
                "off_family_name",
                "def_person_id",
                "def_first_name",
                "def_family_name",
                "matchup_minutes",
                "matchup_minutes_sort",
                "partial_possessions",
                "percentage_defender_total_time",
                "percentage_offensive_total_time",
                "percentage_total_time_both_on",
                "switches_on",
                "player_points",
                "team_points",
                "matchup_assists",
                "matchup_potential_assists",
                "matchup_turnovers",
                "matchup_blocks",
                "matchup_field_goals_made",
                "matchup_field_goals_attempted",
                "matchup_field_goals_percentage",
                "matchup_three_pointers_made",
                "matchup_three_pointers_attempted",
                "matchup_three_pointers_percentage",
                "help_blocks",
                "help_field_goals_made",
                "help_field_goals_attempted",
                "help_field_goals_percentage",
                "matchup_free_throws_made",
                "matchup_free_throws_attempted",
                "shooting_fouls",
            ]
        )
        writer.writerow(
            [
                game_id,
                "1610612738",
                "1610612748",
                "home",
                "p1",
                "Player",
                "One",
                "d1",
                "Defender",
                "One",
                "4:30",
                "270.0",
                "12.5",
                "0.20",
                "0.18",
                "0.55",
                "1",
                "5",
                "5",
                "0",
                "1",
                "0",
                "0",
                "2",
                "2",
                "1.0",
                "1",
                "1",
                "1.0",
                "0",
                "0",
                "0",
                "",
                "0",
                "0",
                "0",
            ]
        )

    return s_dir


def test_rich_admission_end_to_end(
    db_session: Session, test_dataset: WorkbenchDataset, tmp_path: Path
) -> None:
    """Verify admitting 5 rich source families into PostgreSQL."""
    test_game_id = "0099999999"
    create_mock_season_dir(tmp_path, ending_year=2024, game_id=test_game_id)

    # Clean up prior test records if any
    with allow_admin_mutation(db_session):
        db_session.execute(
            delete(WorkbenchPbpEvent).where(
                WorkbenchPbpEvent.dataset_id == test_dataset.id,
                WorkbenchPbpEvent.game_id == test_game_id,
            )
        )
        db_session.execute(
            delete(WorkbenchPossession).where(
                WorkbenchPossession.dataset_id == test_dataset.id,
                WorkbenchPossession.game_id == test_game_id,
            )
        )
        db_session.execute(
            delete(WorkbenchLineup).where(
                WorkbenchLineup.dataset_id == test_dataset.id,
                WorkbenchLineup.game_id == test_game_id,
            )
        )
        db_session.execute(
            delete(WorkbenchShot).where(
                WorkbenchShot.dataset_id == test_dataset.id,
                WorkbenchShot.game_id == test_game_id,
            )
        )
        db_session.execute(
            delete(WorkbenchMatchup).where(
                WorkbenchMatchup.dataset_id == test_dataset.id,
                WorkbenchMatchup.game_id == test_game_id,
            )
        )
        db_session.commit()

    # Execute admission
    summaries = admit_rich_sources_for_season(
        session=db_session,
        dataset_id=test_dataset.id,
        season_ending_year=2024,
        raw_root=tmp_path,
        target_game_ids={test_game_id},
    )

    assert set(summaries.keys()) == {"pbp", "possessions", "lineups", "shots", "matchups"}
    for _fam, summary in summaries.items():
        assert summary.total_games_admitted == 1
        assert summary.total_games_rejected == 0
        assert summary.parser_signature == RICH_PARSER_SIGNATURE
        assert len(summary.source_sha256) == 64
        assert summary.source_bytes > 0

    # Verify PBP rows in DB
    pbp_events = db_session.scalars(
        select(WorkbenchPbpEvent).where(
            WorkbenchPbpEvent.dataset_id == test_dataset.id,
            WorkbenchPbpEvent.game_id == test_game_id,
        )
    ).all()
    assert len(pbp_events) == 2
    assert pbp_events[0].game_id == test_game_id
    assert pbp_events[0].clock == "12:00"
    assert pbp_events[0].off_lineup_json == ["p1", "p2", "p3", "p4", "p5"]

    # Verify Possessions rows in DB
    poss = db_session.scalars(
        select(WorkbenchPossession).where(
            WorkbenchPossession.dataset_id == test_dataset.id,
            WorkbenchPossession.game_id == test_game_id,
        )
    ).all()
    assert len(poss) == 1
    assert poss[0].possession_number == 1
    assert poss[0].policy_version == POSSESSION_POLICY_VERSION

    # Verify Lineups rows in DB
    lineups = db_session.scalars(
        select(WorkbenchLineup).where(
            WorkbenchLineup.dataset_id == test_dataset.id,
            WorkbenchLineup.game_id == test_game_id,
        )
    ).all()
    assert len(lineups) == 1
    assert lineups[0].home_lineup_json == ["p1", "p2", "p3", "p4", "p5"]

    # Verify Shots rows in DB
    shots = db_session.scalars(
        select(WorkbenchShot).where(
            WorkbenchShot.dataset_id == test_dataset.id,
            WorkbenchShot.game_id == test_game_id,
        )
    ).all()
    assert len(shots) == 2
    s1 = next(s for s in shots if s.shot_distance == 3.0)
    assert s1.zone_basic == "Restricted Area"
    assert s1.zone_range == "Less Than 8 ft."
    assert s1.coordinates_present is True

    s2 = next(s for s in shots if s.person_id == "d1")
    assert s2.zone_basic == "Right Corner 3"
    assert s2.coord_x_feet == 22.5
    assert s2.coord_y_feet == 5.0

    # Verify Matchups rows in DB
    matchups = db_session.scalars(
        select(WorkbenchMatchup).where(
            WorkbenchMatchup.dataset_id == test_dataset.id,
            WorkbenchMatchup.game_id == test_game_id,
        )
    ).all()
    assert len(matchups) == 1
    assert matchups[0].off_person_id == "p1"
    assert matchups[0].def_person_id == "d1"
    assert matchups[0].partial_possessions == 12.5

    # Verify WorkbenchRichAdmission records in DB
    admissions = db_session.scalars(
        select(WorkbenchRichAdmission).where(
            WorkbenchRichAdmission.dataset_id == test_dataset.id,
            WorkbenchRichAdmission.season == "2023-24",
        )
    ).all()
    assert len(admissions) == 5
    pbp_adm = next(a for a in admissions if a.source_family == "pbp")
    assert pbp_adm.status == "admitted"
    assert pbp_adm.total_games_admitted == 1
    assert pbp_adm.total_games_rejected == 0


def test_quarantine_rejection_records(
    db_session: Session, test_dataset: WorkbenchDataset, tmp_path: Path
) -> None:
    """Verify that games with invariant failures are isolated and recorded in JSON."""
    invalid_game_id = "0022300098"
    s_dir = tmp_path / "sportsdataverse_2024"
    s_dir.mkdir(parents=True, exist_ok=True)

    # Create PBP with clock inversion
    pbp_file = s_dir / "nba_play_by_play_2024.csv.gz"
    with gzip.open(pbp_file, "wt", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "game_id",
                "order_index",
                "action_number",
                "period",
                "clock",
                "seconds_remaining",
                "event_type",
                "team_id",
                "person_id",
                "score_home",
                "score_away",
                "points_total",
                "shot_value",
                "shot_distance",
                "x_legacy",
                "y_legacy",
                "possession_number",
                "off_player_1",
                "off_player_2",
                "off_player_3",
                "off_player_4",
                "off_player_5",
                "def_player_1",
                "def_player_2",
                "def_player_3",
                "def_player_4",
                "def_player_5",
                "description",
                "video_available",
            ]
        )
        writer.writerow(
            [
                invalid_game_id,
                "1",
                "1",
                "1",
                "10:00",
                "600.0",
                "foul",
                "",
                "",
                "",
                "",
                "0",
                "",
                "",
                "",
                "",
                "",
                "p1",
                "p2",
                "p3",
                "p4",
                "p5",
                "d1",
                "d2",
                "d3",
                "d4",
                "d5",
                "Foul",
                "0",
            ]
        )
        writer.writerow(
            [
                # Clock jump backwards from 600.0s to 715.0s
                invalid_game_id,
                "2",
                "2",
                "1",
                "11:55",
                "715.0",
                "foul",
                "",
                "",
                "",
                "",
                "0",
                "",
                "",
                "",
                "",
                "",
                "p1",
                "p2",
                "p3",
                "p4",
                "p5",
                "d1",
                "d2",
                "d3",
                "d4",
                "d5",
                "Foul",
                "0",
            ]
        )

    summaries = admit_rich_sources_for_season(
        session=db_session,
        dataset_id=test_dataset.id,
        season_ending_year=2024,
        raw_root=tmp_path,
        target_game_ids={invalid_game_id},
        families=["pbp"],
    )

    pbp_summary = summaries["pbp"]
    assert pbp_summary.total_games_admitted == 0
    assert pbp_summary.total_games_rejected == 1
    assert len(pbp_summary.rejected_games) == 1
    assert pbp_summary.rejected_games[0].game_id == invalid_game_id
    assert pbp_summary.rejected_games[0].rejection_code == "pbp_invariant_failed"
    assert "clock_inversion" in pbp_summary.rejected_games[0].detail

    # Verify no PBP events were admitted for this game
    events = db_session.scalars(
        select(WorkbenchPbpEvent).where(
            WorkbenchPbpEvent.dataset_id == test_dataset.id,
            WorkbenchPbpEvent.game_id == invalid_game_id,
        )
    ).all()
    assert len(events) == 0

    # Verify rejection record in workbench_rich_admissions
    adm = db_session.scalars(
        select(WorkbenchRichAdmission).where(
            WorkbenchRichAdmission.dataset_id == test_dataset.id,
            WorkbenchRichAdmission.source_family == "pbp",
            WorkbenchRichAdmission.season == "2023-24",
        )
    ).first()
    assert adm is not None
    assert adm.total_games_rejected == 1
    assert len(adm.rejected_games_json) == 1
    assert adm.rejected_games_json[0]["game_id"] == invalid_game_id


def test_point_conservation_quarantine_with_real_game(
    db_session: Session, test_dataset: WorkbenchDataset, tmp_path: Path
) -> None:
    """Verify that a possession stream with mismatched points vs real box scores is quarantined."""
    real_game_id = "0022300099"  # Real game in DB: LAC scored 123, SAS scored 83
    s_dir = tmp_path / "sportsdataverse_2024"
    s_dir.mkdir(parents=True, exist_ok=True)

    poss_file = s_dir / "nba_possessions_2024.csv.gz"
    with gzip.open(poss_file, "wt", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(
            [
                "game_id",
                "possession_number",
                "period",
                "number_in_period",
                "offense_team_id",
                "defense_team_id",
                "start_order_index",
                "end_order_index",
                "start_seconds_remaining",
                "end_seconds_remaining",
                "points",
                "is_second_chance",
                "count_as_possession",
                "possession_start_type",
                "fg2a",
                "fg2m",
                "fg3a",
                "fg3m",
                "fta",
                "ftm",
                "oreb",
                "dreb",
                "tov",
                "off_player_1",
                "off_player_2",
                "off_player_3",
                "off_player_4",
                "off_player_5",
                "def_player_1",
                "def_player_2",
                "def_player_3",
                "def_player_4",
                "def_player_5",
                "lineup_source",
            ]
        )
        # Only 2 points for LAC instead of 123
        writer.writerow(
            [
                real_game_id,
                "1",
                "1",
                "1",
                "LAC",
                "SAS",
                "1",
                "3",
                "720.0",
                "690.0",
                "2",
                "false",
                "true",
                "OffDeadball",
                "1",
                "1",
                "0",
                "0",
                "0",
                "0",
                "0",
                "0",
                "0",
                "p1",
                "p2",
                "p3",
                "p4",
                "p5",
                "d1",
                "d2",
                "d3",
                "d4",
                "d5",
                "quarter_box",
            ]
        )

    summaries = admit_rich_sources_for_season(
        session=db_session,
        dataset_id=test_dataset.id,
        season_ending_year=2024,
        raw_root=tmp_path,
        target_game_ids={real_game_id},
        families=["possessions"],
    )

    poss_summary = summaries["possessions"]
    assert poss_summary.total_games_admitted == 0
    assert poss_summary.total_games_rejected == 1
    assert len(poss_summary.rejected_games) == 1
    assert "point_conservation_mismatch" in poss_summary.rejected_games[0].detail


def test_sealed_table_mutation_enforcement(
    db_session: Session, test_dataset: WorkbenchDataset
) -> None:
    """Verify that mutating rich rows outside allow_admin_mutation raises RuntimeError."""
    shot_id = new_uuid()
    with allow_admin_mutation(db_session):
        shot = WorkbenchShot(
            id=shot_id,
            dataset_id=test_dataset.id,
            game_id="0022300099",
            period=1,
            clock="11:30",
            team_id="1610612738",
            person_id="p1",
            shot_result="Made",
            is_made=True,
            shot_value=2,
            points=2,
            shot_distance=3.0,
            coordinates_present=True,
            zone_basic="Restricted Area",
            zone_range="Less Than 8 ft.",
            source_hash="sha",
            status="valid",
        )
        db_session.add(shot)
        db_session.commit()

    persisted_shot = db_session.get(WorkbenchShot, shot_id)
    assert persisted_shot is not None

    # Mutating without allow_admin_mutation raises RuntimeError
    with pytest.raises(RuntimeError, match="is sealed and immutable against ordinary mutation"):
        persisted_shot.points = 3
        db_session.flush()

    db_session.rollback()

    # Clean up test shot inside allow_admin_mutation
    with allow_admin_mutation(db_session):
        db_session.execute(delete(WorkbenchShot).where(WorkbenchShot.id == shot_id))
        db_session.commit()


def test_get_rich_admissions_report(db_session: Session, test_dataset: WorkbenchDataset) -> None:
    """Verify querying rich admission reports."""
    report = get_rich_admissions_report(
        session=db_session, dataset_id=test_dataset.id, season="2023-24"
    )
    assert isinstance(report, list)
    assert len(report) >= 1
    rec = report[0]
    assert "source_family" in rec
    assert "parser_signature" in rec
    assert "policy_version" in rec
    assert rec["dataset_id"] == test_dataset.id
    assert rec["season"] == "2023-24"
