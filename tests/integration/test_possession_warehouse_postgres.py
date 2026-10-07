"""Integration tests for Block B20: Possession and stint warehouse in PostgreSQL.

Tests:
- End-to-end stint reconstruction and persistence into workbench_lineup_stints
  and workbench_stint_players
- Verification of invariants against live relational models (5-player sides,
  minute/point conservation)
- Sealed table mutation enforcement: mutations outside allow_admin_mutation raise RuntimeError
- Provenance-bearing reconstruction override registry insertion, application, and sealed protection
- Cutoff-safe exposure queries for players and lineups (strictly excluding later games)
"""

from __future__ import annotations

import os
from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, delete, select
from sqlalchemy.orm import Session

from courtlens.database import Base
from courtlens.domain.rich_sources import (
    POSSESSION_POLICY_VERSION,
)
from courtlens.domain.stints import format_lineup_key
from courtlens.models import new_uuid
from courtlens.services.possession_warehouse import (
    get_cutoff_safe_lineup_exposure,
    get_cutoff_safe_player_exposure,
    get_reconstruction_overrides,
    reconstruct_game_stints_for_game,
    record_reconstruction_override,
)
from courtlens.workbench_models import (
    WorkbenchDataset,
    WorkbenchLineup,
    WorkbenchLineupStint,
    WorkbenchObservation,
    WorkbenchPbpEvent,
    WorkbenchPossession,
    WorkbenchReconstructionOverride,
    WorkbenchSchedule,
    WorkbenchStintPlayer,
    WorkbenchTeamGame,
    WorkbenchVersion,
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
    # Use existing dataset or create test dataset
    dataset = db_session.scalars(select(WorkbenchDataset)).first()
    if not dataset:
        with allow_admin_mutation(db_session):
            ds_id = f"test_b20_ds_{uuid4().hex[:8]}"
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


@pytest.fixture
def valid_version_and_obs(db_session: Session) -> tuple[str, str]:
    version = db_session.scalars(select(WorkbenchVersion)).first()
    obs = db_session.scalars(select(WorkbenchObservation)).first()
    if not version or not obs:
        with allow_admin_mutation(db_session):
            if not version:
                version = WorkbenchVersion(
                    id=new_uuid(),
                    source_namespace="sportsdataverse",
                    content_sha256="v" * 64,
                    parser_version="test-v1",
                )
                db_session.add(version)
            if not obs:
                obs = WorkbenchObservation(
                    id=new_uuid(),
                    identity_id="test_ident",
                    version_id=version.id,
                    observation_order=1,
                    observation_sha256="o" * 64,
                )
                db_session.add(obs)
            db_session.commit()
    return version.id, obs.id


def test_end_to_end_stint_reconstruction_and_persistence(
    db_session: Session,
    test_dataset: WorkbenchDataset,
    valid_version_and_obs: tuple[str, str],
) -> None:
    """Test end-to-end reconstruction, persistence into PostgreSQL, and invariant verification."""
    ver_id, obs_id = valid_version_and_obs
    gid = f"0099{uuid4().hex[:6]}"
    home_team = "1610612747"
    away_team = "1610612744"
    h_lineup = [f"h_{i}" for i in range(1, 6)]
    a_lineup = [f"a_{i}" for i in range(1, 6)]

    with allow_admin_mutation(db_session):
        # 1. Schedule
        sch = WorkbenchSchedule(
            id=new_uuid(),
            dataset_id=test_dataset.id,
            game_id=gid,
            game_date=date(2024, 1, 10),
            season="2023-24",
            phase="regular_season",
            home_team_id=home_team,
            away_team_id=away_team,
            game_status=3,
            source_version_id=ver_id,
            source_observation_id=obs_id,
        )
        db_session.add(sch)

        # 2. Team games (Home 100, Away 90)
        tg_home = WorkbenchTeamGame(
            id=new_uuid(),
            dataset_id=test_dataset.id,
            game_id=gid,
            team_id=home_team,
            opponent_id=away_team,
            game_date=date(2024, 1, 10),
            season="2023-24",
            phase="regular_season",
            side="home",
            points=100,
            opponent_points=90,
            is_final=True,
            stats_json={},
            source_version_id=ver_id,
            source_observation_id=obs_id,
        )
        tg_away = WorkbenchTeamGame(
            id=new_uuid(),
            dataset_id=test_dataset.id,
            game_id=gid,
            team_id=away_team,
            opponent_id=home_team,
            game_date=date(2024, 1, 10),
            season="2023-24",
            phase="regular_season",
            side="away",
            points=90,
            opponent_points=100,
            is_final=True,
            stats_json={},
            source_version_id=ver_id,
            source_observation_id=obs_id,
        )
        db_session.add(tg_home)
        db_session.add(tg_away)

        # 3. Lineups (1 lineup per quarter)
        for p in range(1, 5):
            lu = WorkbenchLineup(
                id=new_uuid(),
                dataset_id=test_dataset.id,
                game_id=gid,
                action_number=p * 10,
                period=p,
                home_lineup_json=h_lineup,
                away_lineup_json=a_lineup,
                source_hash=f"lu_{p}",
                status="valid",
            )
            db_session.add(lu)

            # PBP event: home scores 25 pts, away scores 22.5 (rounded to 23/22)
            pts_h = 25
            pts_a = 22 if p % 2 == 0 else 23
            ev_h = WorkbenchPbpEvent(
                id=new_uuid(),
                dataset_id=test_dataset.id,
                game_id=gid,
                order_index=p * 2 - 1,
                action_number=p * 10 + 1,
                period=p,
                clock="06:00",
                seconds_remaining=360.0,
                event_type="shot",
                team_id=home_team,
                person_id="h_1",
                score_home=p * 25,
                score_away=(p - 1) * 22,
                points_total=pts_h,
                source_hash=f"pbp_h_{p}",
                status="valid",
            )
            ev_a = WorkbenchPbpEvent(
                id=new_uuid(),
                dataset_id=test_dataset.id,
                game_id=gid,
                order_index=p * 2,
                action_number=p * 10 + 2,
                period=p,
                clock="01:00",
                seconds_remaining=60.0,
                event_type="shot",
                team_id=away_team,
                person_id="a_1",
                score_home=p * 25,
                score_away=p * 22 if p % 2 == 0 else p * 23,
                points_total=pts_a,
                source_hash=f"pbp_a_{p}",
                status="valid",
            )
            db_session.add(ev_h)
            db_session.add(ev_a)

            # Possession
            poss = WorkbenchPossession(
                id=new_uuid(),
                dataset_id=test_dataset.id,
                game_id=gid,
                possession_number=p,
                period=p,
                number_in_period=1,
                offense_team_id=home_team,
                defense_team_id=away_team,
                start_order_index=p * 2 - 1,
                end_order_index=p * 2,
                start_seconds_remaining=720.0,
                end_seconds_remaining=0.0,
                points=pts_h,
                stats_json={},
                off_lineup_json=h_lineup,
                def_lineup_json=a_lineup,
                policy_version=POSSESSION_POLICY_VERSION,
                source_hash=f"poss_{p}",
                status="valid",
            )
            db_session.add(poss)

        db_session.commit()

    try:
        # Reconstruct and persist
        res = reconstruct_game_stints_for_game(
            db_session,
            dataset_id=test_dataset.id,
            game_id=gid,
            persist=True,
        )

        assert res.invariants_passed
        assert len(res.stints) == 4
        assert res.total_duration_seconds == 2880.0
        assert res.total_home_points == 100
        assert res.total_away_points == 90

        # Verify persisted rows in PostgreSQL
        stints_in_db = db_session.scalars(
            select(WorkbenchLineupStint).where(
                WorkbenchLineupStint.dataset_id == test_dataset.id,
                WorkbenchLineupStint.game_id == gid,
            )
        ).all()
        assert len(stints_in_db) == 4

        stint_players_in_db = db_session.scalars(
            select(WorkbenchStintPlayer).where(
                WorkbenchStintPlayer.dataset_id == test_dataset.id,
                WorkbenchStintPlayer.game_id == gid,
            )
        ).all()
        # 4 stints * 10 players = 40 rows
        assert len(stint_players_in_db) == 40

        # Check invariant on DB rows: exactly 5 players per side
        for s in stints_in_db:
            assert len(s.home_lineup_json) == 5
            assert len(s.away_lineup_json) == 5
            assert s.policy_version == POSSESSION_POLICY_VERSION
            assert s.status == "valid"

    finally:
        with allow_admin_mutation(db_session):
            db_session.execute(
                delete(WorkbenchStintPlayer).where(WorkbenchStintPlayer.game_id == gid)
            )
            db_session.execute(
                delete(WorkbenchLineupStint).where(WorkbenchLineupStint.game_id == gid)
            )
            db_session.execute(
                delete(WorkbenchPossession).where(WorkbenchPossession.game_id == gid)
            )
            db_session.execute(delete(WorkbenchPbpEvent).where(WorkbenchPbpEvent.game_id == gid))
            db_session.execute(delete(WorkbenchLineup).where(WorkbenchLineup.game_id == gid))
            db_session.execute(delete(WorkbenchTeamGame).where(WorkbenchTeamGame.game_id == gid))
            db_session.execute(delete(WorkbenchSchedule).where(WorkbenchSchedule.game_id == gid))
            db_session.commit()


def test_sealed_table_mutation_enforcement(
    db_session: Session, test_dataset: WorkbenchDataset
) -> None:
    """Verifies that direct mutation on stint warehouse tables outside allow_admin_mutation
    raises RuntimeError.
    """
    gid = f"0098{uuid4().hex[:6]}"
    with allow_admin_mutation(db_session):
        stint = WorkbenchLineupStint(
            id=new_uuid(),
            dataset_id=test_dataset.id,
            game_id=gid,
            stint_index=1,
            period=1,
            start_clock="12:00",
            end_clock="00:00",
            start_seconds_remaining=720.0,
            end_seconds_remaining=0.0,
            duration_seconds=720.0,
            home_team_id="1610612747",
            away_team_id="1610612744",
            home_lineup_json=["h1", "h2", "h3", "h4", "h5"],
            away_lineup_json=["a1", "a2", "a3", "a4", "a5"],
            home_lineup_key="h1|h2|h3|h4|h5",
            away_lineup_key="a1|a2|a3|a4|a5",
            home_points=25,
            away_points=20,
            source_hash="test_hash",
        )
        db_session.add(stint)
        db_session.commit()

    try:
        # Mutation outside allow_admin_mutation must raise RuntimeError
        stint.home_points = 99
        with pytest.raises(RuntimeError, match="is sealed and immutable"):
            db_session.commit()
        db_session.rollback()

        # Deletion outside allow_admin_mutation must raise RuntimeError
        stint_loaded = db_session.get(WorkbenchLineupStint, stint.id)
        assert stint_loaded is not None
        db_session.delete(stint_loaded)
        with pytest.raises(RuntimeError, match="is sealed and immutable"):
            db_session.commit()
        db_session.rollback()

        # Mutation inside allow_admin_mutation succeeds
        with allow_admin_mutation(db_session):
            stint_loaded = db_session.get(WorkbenchLineupStint, stint.id)
            assert stint_loaded is not None
            stint_loaded.home_points = 30
            db_session.commit()

        stint_check = db_session.get(WorkbenchLineupStint, stint.id)
        assert stint_check is not None
        assert stint_check.home_points == 30

    finally:
        with allow_admin_mutation(db_session):
            db_session.execute(
                delete(WorkbenchLineupStint).where(WorkbenchLineupStint.game_id == gid)
            )
            db_session.commit()


def test_reconstruction_override_registry_postgres(
    db_session: Session, test_dataset: WorkbenchDataset
) -> None:
    """Test inserting and querying provenance-bearing overrides in PostgreSQL."""
    gid = f"0097{uuid4().hex[:6]}"
    override = record_reconstruction_override(
        db_session,
        dataset_id=test_dataset.id,
        game_id=gid,
        override_type="starter_override",
        period=1,
        team_id="1610612747",
        original_value=["h1", "h2", "h3", "h4", "h5"],
        override_value=["h1", "h2", "h3", "h4", "h99"],
        reason="Injury substitution correction prior to tipoff",
        author="operator@courtlens.local",
    )

    try:
        assert override.id is not None
        assert override.status == "active"

        # Query overrides
        active_ovs = get_reconstruction_overrides(
            db_session, dataset_id=test_dataset.id, game_id=gid
        )
        assert len(active_ovs) == 1
        assert active_ovs[0].override_type == "starter_override"
        assert active_ovs[0].author == "operator@courtlens.local"
        assert active_ovs[0].override_value_json == ["h1", "h2", "h3", "h4", "h99"]

        # Sealed table protection on override table
        db_ov = db_session.get(WorkbenchReconstructionOverride, override.id)
        assert db_ov is not None
        db_ov.author = "hacker"
        with pytest.raises(RuntimeError, match="is sealed and immutable"):
            db_session.commit()
        db_session.rollback()

    finally:
        with allow_admin_mutation(db_session):
            db_session.execute(
                delete(WorkbenchReconstructionOverride).where(
                    WorkbenchReconstructionOverride.game_id == gid
                )
            )
            db_session.commit()


def test_cutoff_safe_exposure_queries(
    db_session: Session,
    test_dataset: WorkbenchDataset,
    valid_version_and_obs: tuple[str, str],
) -> None:
    """Test cutoff-safe player and lineup queries strictly respecting cutoff date."""
    ver_id, obs_id = valid_version_and_obs
    gid_past = f"0096{uuid4().hex[:6]}"
    gid_future = f"0095{uuid4().hex[:6]}"
    player_id = "test_player_exposure"

    with allow_admin_mutation(db_session):
        # Game 1: Jan 10 (past)
        sch_past = WorkbenchSchedule(
            id=new_uuid(),
            dataset_id=test_dataset.id,
            game_id=gid_past,
            game_date=date(2024, 1, 10),
            season="2023-24",
            phase="regular_season",
            home_team_id="T1",
            away_team_id="T2",
            game_status=3,
            source_version_id=ver_id,
            source_observation_id=obs_id,
        )
        stint_past = WorkbenchLineupStint(
            id=new_uuid(),
            dataset_id=test_dataset.id,
            game_id=gid_past,
            stint_index=1,
            period=1,
            start_clock="12:00",
            end_clock="00:00",
            start_seconds_remaining=720.0,
            end_seconds_remaining=0.0,
            duration_seconds=720.0,
            home_team_id="T1",
            away_team_id="T2",
            home_lineup_json=[player_id, "p2", "p3", "p4", "p5"],
            away_lineup_json=["a1", "a2", "a3", "a4", "a5"],
            home_lineup_key=format_lineup_key([player_id, "p2", "p3", "p4", "p5"]),
            away_lineup_key=format_lineup_key(["a1", "a2", "a3", "a4", "a5"]),
            home_points=30,
            away_points=25,
            home_possessions=20.0,
            away_possessions=20.0,
            total_possessions=40.0,
            source_hash="hash_past",
        )
        sp_past = WorkbenchStintPlayer(
            id=new_uuid(),
            dataset_id=test_dataset.id,
            stint_id=stint_past.id,
            game_id=gid_past,
            team_id="T1",
            opponent_team_id="T2",
            player_id=player_id,
            side="home",
            period=1,
            duration_seconds=720.0,
            possessions=20.0,
            opponent_possessions=20.0,
            points=12,
            team_points=30,
            points_allowed=25,
            stats_json={"fgm": 5, "fga": 10, "points": 12},
            source_hash="sp_hash_past",
        )
        db_session.add(sch_past)
        db_session.add(stint_past)
        db_session.add(sp_past)

        # Game 2: Jan 20 (future / after cutoff date of Jan 15)
        sch_future = WorkbenchSchedule(
            id=new_uuid(),
            dataset_id=test_dataset.id,
            game_id=gid_future,
            game_date=date(2024, 1, 20),
            season="2023-24",
            phase="regular_season",
            home_team_id="T1",
            away_team_id="T3",
            game_status=3,
            source_version_id=ver_id,
            source_observation_id=obs_id,
        )
        stint_future = WorkbenchLineupStint(
            id=new_uuid(),
            dataset_id=test_dataset.id,
            game_id=gid_future,
            stint_index=1,
            period=1,
            start_clock="12:00",
            end_clock="00:00",
            start_seconds_remaining=720.0,
            end_seconds_remaining=0.0,
            duration_seconds=720.0,
            home_team_id="T1",
            away_team_id="T3",
            home_lineup_json=[player_id, "p2", "p3", "p4", "p5"],
            away_lineup_json=["b1", "b2", "b3", "b4", "b5"],
            home_lineup_key=format_lineup_key([player_id, "p2", "p3", "p4", "p5"]),
            away_lineup_key=format_lineup_key(["b1", "b2", "b3", "b4", "b5"]),
            home_points=40,
            away_points=35,
            home_possessions=25.0,
            away_possessions=25.0,
            total_possessions=50.0,
            source_hash="hash_fut",
        )
        sp_future = WorkbenchStintPlayer(
            id=new_uuid(),
            dataset_id=test_dataset.id,
            stint_id=stint_future.id,
            game_id=gid_future,
            team_id="T1",
            opponent_team_id="T3",
            player_id=player_id,
            side="home",
            period=1,
            duration_seconds=720.0,
            possessions=25.0,
            opponent_possessions=25.0,
            points=20,
            team_points=40,
            points_allowed=35,
            stats_json={"fgm": 8, "fga": 15, "points": 20},
            source_hash="sp_hash_fut",
        )
        db_session.add(sch_future)
        db_session.add(stint_future)
        db_session.add(sp_future)
        db_session.commit()

    try:
        # Cutoff as of Jan 15: strictly excludes Jan 20 game!
        exp_as_of_jan15 = get_cutoff_safe_player_exposure(
            db_session,
            dataset_id=test_dataset.id,
            player_id=player_id,
            cutoff_date=date(2024, 1, 15),
        )

        assert exp_as_of_jan15["games_count"] == 1
        assert exp_as_of_jan15["total_minutes"] == 12.0
        assert exp_as_of_jan15["possessions"] == 20.0
        assert exp_as_of_jan15["points"] == 12
        assert exp_as_of_jan15["team_points_on"] == 30
        assert exp_as_of_jan15["offensive_rating"] == 150.0  # (30 * 100) / 20 = 150.0
        assert exp_as_of_jan15["defensive_rating"] == 125.0  # (25 * 100) / 20 = 125.0
        assert exp_as_of_jan15["net_rating"] == 25.0

        # Cutoff as of Jan 25: includes both games!
        exp_as_of_jan25 = get_cutoff_safe_player_exposure(
            db_session,
            dataset_id=test_dataset.id,
            player_id=player_id,
            cutoff_date=date(2024, 1, 25),
        )
        assert exp_as_of_jan25["games_count"] == 2
        assert exp_as_of_jan25["total_minutes"] == 24.0
        assert exp_as_of_jan25["possessions"] == 45.0
        assert exp_as_of_jan25["points"] == 32

        # Lineup unit query cutoff safety
        lineup_exp_jan15 = get_cutoff_safe_lineup_exposure(
            db_session,
            dataset_id=test_dataset.id,
            lineup_players=[player_id, "p2", "p3", "p4", "p5"],
            cutoff_date=date(2024, 1, 15),
        )
        assert lineup_exp_jan15["games_count"] == 1
        assert lineup_exp_jan15["total_minutes"] == 12.0
        assert lineup_exp_jan15["possessions_off"] == 20.0
        assert lineup_exp_jan15["points_scored"] == 30

    finally:
        with allow_admin_mutation(db_session):
            db_session.execute(
                delete(WorkbenchStintPlayer).where(
                    WorkbenchStintPlayer.game_id.in_([gid_past, gid_future])
                )
            )
            db_session.execute(
                delete(WorkbenchLineupStint).where(
                    WorkbenchLineupStint.game_id.in_([gid_past, gid_future])
                )
            )
            db_session.execute(
                delete(WorkbenchSchedule).where(
                    WorkbenchSchedule.game_id.in_([gid_past, gid_future])
                )
            )
            db_session.commit()
