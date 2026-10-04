"""Unit tests for resumable historical backfill and career completeness verification."""

from datetime import date
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from courtload.database import Base
from courtload.services.workbench_backfill import (
    execute_backfill_batch,
    get_backfill_status,
    verify_player_career_completeness,
)
from courtload.workbench_models import (
    WorkbenchDataset,
    WorkbenchPlayerDraft,
    WorkbenchPlayerGame,
)


@pytest.fixture
def memory_session() -> Session:
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as session:
            yield session
    finally:
        engine.dispose()


def test_get_backfill_status(memory_session: Session, tmp_path: Path) -> None:
    # Initially 2021..2023 has 0 imported
    status = get_backfill_status(memory_session, raw_root=tmp_path, start_year=2021, end_year=2023)
    assert status["total_seasons"] == 3
    assert status["imported_count"] == 0
    assert status["pending_count"] == 3
    assert status["pending_years"] == [2021, 2022, 2023]

    # Create a dummy dataset with season 2022-23 (ending year 2023)
    ds = WorkbenchDataset(
        id="ds-test-2023",
        content_sha256="sha-content-1",
        membership_sha256="sha-membership-1",
        semantic_signature="sig-1",
        source_namespace="sportsdataverse",
        parser_version="workbench-v1",
        quality_version="reconciliation-v1",
        seasons_json=["2022-23"],
        phases_json=["regular_season"],
        manifest_json={},
        coverage_json={},
        exclusions_json={},
        status="ready",
    )
    memory_session.add(ds)
    memory_session.commit()

    status_post = get_backfill_status(
        memory_session, raw_root=tmp_path, start_year=2021, end_year=2023
    )
    assert status_post["imported_count"] == 1
    assert status_post["imported_years"] == [2023]
    assert status_post["pending_years"] == [2021, 2022]


def test_execute_backfill_batch_resumption(memory_session: Session, tmp_path: Path) -> None:
    # Mock import_workbench_data to simulate importing datasets
    imported_seasons_history = []

    def mock_import(session, ending_years, raw_root=None):
        for y in ending_years:
            c_season = f"{y - 1}-{str(y)[-2:]}"
            imported_seasons_history.append(c_season)
            session.add(
                WorkbenchDataset(
                    id=f"ds-mock-{y}",
                    content_sha256=f"sha-{y}",
                    membership_sha256=f"mem-{y}",
                    semantic_signature=f"sig-{y}",
                    source_namespace="sportsdataverse",
                    parser_version="workbench-v1",
                    quality_version="reconciliation-v1",
                    seasons_json=[c_season],
                    phases_json=["regular_season"],
                    manifest_json={},
                    coverage_json={"total_player_games": 25000, "total_team_games": 2460},
                    exclusions_json={},
                    status="ready",
                )
            )
        session.commit()
        mock_ds = MagicMock()
        mock_ds.id = f"ds-batch-{ending_years[0]}"
        mock_ds.content_sha256 = "sha-batch"
        mock_ds.semantic_signature = "sig-batch"
        mock_ds.coverage_json = {"total_player_games": 50000, "total_team_games": 4920}
        return mock_ds

    with (
        patch("courtload.services.workbench_backfill.acquire_season_assets") as mock_acquire,
        patch(
            "courtload.services.workbench_backfill.import_workbench_data", side_effect=mock_import
        ),
    ):
        mock_acquire.return_value = {"status": "acquired_mock"}

        # Batch 1: range 2020..2023 with batch_size=2
        # Prioritizes descending: 2023, 2022
        res1 = execute_backfill_batch(
            memory_session,
            start_year=2020,
            end_year=2023,
            batch_size=2,
            raw_root=tmp_path,
        )
        assert res1["status"] == "batch_completed"
        assert res1["batch_years"] == [2023, 2022]
        assert res1["overall_imported_seasons_count"] == 2
        assert res1["remaining_pending_count"] == 2
        assert res1["next_batch_candidate_years"] == [2021, 2020]

        # Batch 2: Resumption picks up remaining 2021, 2020
        res2 = execute_backfill_batch(
            memory_session,
            start_year=2020,
            end_year=2023,
            batch_size=2,
            raw_root=tmp_path,
        )
        assert res2["status"] == "batch_completed"
        assert res2["batch_years"] == [2021, 2020]
        assert res2["overall_imported_seasons_count"] == 4
        assert res2["remaining_pending_count"] == 0

        # Batch 3: All completed
        res3 = execute_backfill_batch(
            memory_session,
            start_year=2020,
            end_year=2023,
            batch_size=2,
            raw_root=tmp_path,
        )
        assert res3["status"] == "already_completed"
        assert res3["batch_years"] == []


def test_career_completeness_guardrail(memory_session: Session) -> None:
    # 1. Drafted in 2016 (Pascal Siakam), but dataset games begin in 2023-10-25
    memory_session.add(
        WorkbenchPlayerDraft(
            id="draft-siakam",
            player_id="1627783",
            draft_year=2016,
            round_number=1,
            pick_overall=27,
            drafting_team_id="TOR",
            drafting_team_name="Toronto Raptors",
            draft_type="draft",
        )
    )
    # Add one player game in 2023-24
    memory_session.add(
        WorkbenchPlayerGame(
            id="pg-siakam-1",
            dataset_id="ds-current",
            game_id="0022300001",
            player_id="1627783",
            team_id="TOR",
            opponent_id="MIN",
            game_date=date(2023, 10, 25),
            date_precision="date",
            season="2023-24",
            phase="regular_season",
            appearance="appeared",
            minutes_original="34:12",
            points=18,
            stats_json={},
            source_version_id="ver-1",
            source_observation_id="obs-1",
        )
    )
    memory_session.commit()

    verif = verify_player_career_completeness(
        memory_session,
        player_id="1627783",
        dataset_coverage_start=date(2023, 10, 24),
    )
    assert verif["is_partial_career"] is True
    assert "Career statistics are explicitly partial" in verif["disclaimer"]
    assert verif["draft_year"] == 2016
    assert verif["earliest_observed_season"] == "2023-24"
    assert len(verif["reasons"]) >= 1

    # 2. Rookie whose draft year equals earliest observed year (Scottie Barnes drafted 2021)
    # If drafted 2023 and earliest game 2023-10-25 with dataset coverage start 2021-10-19:
    memory_session.add(
        WorkbenchPlayerDraft(
            id="draft-rookie",
            player_id="rookie-2023",
            draft_year=2023,
            draft_type="draft",
        )
    )
    memory_session.add(
        WorkbenchPlayerGame(
            id="pg-rookie-1",
            dataset_id="ds-current",
            game_id="0022300002",
            player_id="rookie-2023",
            team_id="TOR",
            opponent_id="MIN",
            game_date=date(2023, 10, 25),
            date_precision="date",
            season="2023-24",
            phase="regular_season",
            appearance="appeared",
            minutes_original="20:00",
            points=10,
            stats_json={},
            source_version_id="ver-1",
            source_observation_id="obs-1",
        )
    )
    memory_session.commit()

    verif_rookie = verify_player_career_completeness(
        memory_session,
        player_id="rookie-2023",
        dataset_coverage_start=date(2021, 10, 19),
    )
    assert verif_rookie["is_partial_career"] is False
    assert "Observed career within admitted seasons." in verif_rookie["disclaimer"]
