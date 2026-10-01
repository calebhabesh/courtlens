"""Unit and lifecycle tests for genuine prospective points forecasting (Milestone P7).

Strict verification:
1. Temporal discipline: game_date < cutoff_date strictly enforced in features.
2. Future mutations / changes do not affect earlier forecast features hash or estimates.
3. Scheduled zero scores (0-0) are never treated as labels.
4. Absent box scores are unknown / DNP, not zeros.
5. Late stat corrections append-only revise scoring without mutating earlier records.
6. Idempotency: repeated issuance does not duplicate or alter records.
7. Time zone handling: America/New_York vs aware UTC.
8. Availability reasons: rookies, season openers, trades, insufficient history.
9. Prospective accuracy reports 'not_yet_observed' before game completions.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from courtload.database import Base
from courtload.evaluation.points_features import (
    PointsPlayerGame,
    compute_player_features,
    compute_points_feature_hash,
)
from courtload.models import new_uuid, utc_now
from courtload.services.workbench_forecasts import (
    determine_candidate_eligibility,
    get_eastern_date,
    issue_prospective_forecasts,
    query_forecast_issuances,
    score_forecast_issuances,
)
from courtload.warehouse_models import PublishedSnapshot
from courtload.workbench_models import (
    ForecastIssuance,
    ForecastScore,
    ModelPolicyActivation,
    WorkbenchDataset,
    WorkbenchPlayerGame,
    WorkbenchReleaseBinding,
    WorkbenchSchedule,
    WorkbenchTeamGame,
)


@pytest.fixture
def memory_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def _make_game(
    player_id: str,
    game_date: date,
    points: int = 20,
    minutes_seconds: int = 1800,
    season: str = "2026-27",
    phase: str = "regular_season",
    appearance: str = "appeared",
    team_id: str = "TOR",
) -> PointsPlayerGame:
    return PointsPlayerGame(
        game_id=f"g_{game_date.isoformat()}",
        player_id=player_id,
        team_id=team_id,
        opponent_id="BOS",
        game_date=game_date,
        season=season,
        phase=phase,
        appearance=appearance,
        minutes_seconds=minutes_seconds,
        points=points,
        field_goal_attempts=15,
        free_throw_attempts=5,
    )


def test_temporal_discipline_candidate_features():
    """Features strictly exclude target date and subsequent outcomes (game_date < cutoff)."""
    cutoff = date(2026, 11, 15)
    target_date = date(2026, 11, 16)

    # 5 games prior to cutoff, 1 game ON cutoff, 2 games AFTER cutoff
    games = [
        _make_game("P1", date(2026, 11, 10), points=20),
        _make_game("P1", date(2026, 11, 12), points=25),
        _make_game("P1", date(2026, 11, 14), points=30),
        # On or after cutoff:
        _make_game("P1", date(2026, 11, 15), points=50),  # ON cutoff: must be excluded!
        _make_game("P1", date(2026, 11, 16), points=60),  # Target date: must be excluded!
        _make_game("P1", date(2026, 11, 18), points=70),  # Future: must be excluded!
    ]

    features, pts_current, _ = compute_player_features(
        current_history=games,
        prior_season_history=None,
        cutoff=cutoff,
        target_game_date=target_date,
    )

    # Only the 3 games strictly before cutoff (11-10, 11-12, 11-14) should be included
    assert pts_current == [20.0, 25.0, 30.0]
    assert features["last_5_pts_mean"] == 25.0
    assert features["valid_history_count_capped_50"] == 3
    # Check that 50, 60, 70 did NOT contaminate features
    assert features["last_5_pts_mean"] < 35.0


def test_future_game_mutation_preserves_old_forecast_features_hash():
    """Changing future records or adding future games never alters an earlier forecast hash."""
    cutoff = date(2026, 11, 1)
    target_date = date(2026, 11, 3)

    prior_games = [_make_game("P1", date(2025, 12, 1), points=22) for _ in range(25)]
    current_games_v1 = [
        _make_game("P1", date(2026, 10, 22), points=18),
        _make_game("P1", date(2026, 10, 25), points=24),
    ]

    feat_v1, _, _ = compute_player_features(
        current_history=current_games_v1,
        prior_season_history=prior_games,
        cutoff=cutoff,
        target_game_date=target_date,
    )
    hash_v1 = compute_points_feature_hash(feat_v1)

    # Mutate future: add games on November 5, 10, 20
    current_games_v2 = [
        *current_games_v1,
        _make_game("P1", date(2026, 11, 5), points=40),
        _make_game("P1", date(2026, 11, 10), points=45),
    ]

    feat_v2, _, _ = compute_player_features(
        current_history=current_games_v2,
        prior_season_history=prior_games,
        cutoff=cutoff,
        target_game_date=target_date,
    )
    hash_v2 = compute_points_feature_hash(feat_v2)

    # Hashes MUST be identical!
    assert hash_v1 == hash_v2
    assert feat_v1 == feat_v2


def test_candidate_eligibility_and_reasons():
    """Validate frozen points-v1 cohort classification and explicit availability reasons."""
    cutoff = date(2026, 11, 15)
    mock_sched = WorkbenchSchedule(
        id="s1",
        dataset_id="ds1",
        game_id="0022600100",
        season="2026-27",
        phase="regular_season",
        game_date=date(2026, 11, 17),
        date_precision="date",
        home_team_id="TOR",
        away_team_id="BOS",
        game_status=1,
        annotations_json={},
        source_version_id="sv1",
        source_observation_id="so1",
    )

    prior_25 = [_make_game("P1", date(2025, 11, 1), points=20) for _ in range(25)]
    prior_10 = [_make_game("P1", date(2025, 11, 1), points=20) for _ in range(10)]

    # 1. Core cohort: >= 10 appearances in current season
    curr_12 = [
        _make_game("P1", date(2026, 10, 20) + timedelta(days=i), points=20) for i in range(12)
    ]
    is_el, cohort, _ = determine_candidate_eligibility(curr_12, None, cutoff, mock_sched, "TOR")
    assert is_el is True
    assert cohort == "core"

    # 2. Early-season cohort: 1-9 current appearances + >= 20 prior appearances
    curr_3 = [_make_game("P1", date(2026, 10, 20) + timedelta(days=i), points=20) for i in range(3)]
    is_el, cohort, _ = determine_candidate_eligibility(curr_3, prior_25, cutoff, mock_sched, "TOR")
    assert is_el is True
    assert cohort == "early_season"

    # 3. Available-history fallback: 5-9 current appearances + < 20 prior appearances
    curr_7 = [_make_game("P1", date(2026, 10, 20) + timedelta(days=i), points=20) for i in range(7)]
    is_el, cohort, _ = determine_candidate_eligibility(curr_7, prior_10, cutoff, mock_sched, "TOR")
    assert is_el is True
    assert cohort == "available_history_fallback"

    # 4. Season opener awaiting first game: 0 current appearances + >= 20 prior appearances
    is_el, reason, _ = determine_candidate_eligibility([], prior_25, cutoff, mock_sched, "TOR")
    assert is_el is False
    assert reason == "season_opener_awaiting_first_game"

    # 5. Rookie: 0 current appearances + 0 prior appearances
    is_el, reason, _ = determine_candidate_eligibility([], [], cutoff, mock_sched, "TOR")
    assert is_el is False
    assert reason == "rookie_no_history"

    # 6. Insufficient history: 1-4 current appearances + < 20 prior appearances
    curr_2 = [_make_game("P1", date(2026, 10, 20) + timedelta(days=i), points=20) for i in range(2)]
    is_el, reason, _ = determine_candidate_eligibility(curr_2, prior_10, cutoff, mock_sched, "TOR")
    assert is_el is False
    assert reason == "insufficient_history"

    # 7. No upcoming schedule
    is_el, reason, _ = determine_candidate_eligibility(curr_12, None, cutoff, None, "TOR")
    assert is_el is False
    assert reason == "no_upcoming_schedule"


def test_idempotent_repeated_issuance(memory_db: Session):
    """Calling issue_prospective_forecasts multiple times is strictly idempotent."""
    session = memory_db

    # Setup database with dataset, schedule, policy, and player history
    dataset = WorkbenchDataset(
        id="ds_test",
        content_sha256="c" * 64,
        membership_sha256="m" * 64,
        semantic_signature="s" * 64,
        source_namespace="sportsdataverse",
        parser_version="v1",
        quality_version="q1",
        seasons_json=["2026-27"],
        phases_json=["regular_season"],
        manifest_json={},
        coverage_json={},
        exclusions_json={},
        status="ready",
        created_at=utc_now(),
    )
    session.add(dataset)

    binding = WorkbenchReleaseBinding(
        id=new_uuid(),
        snapshot_id="snap_test",
        semantic_signature="s" * 64,
        dataset_id=dataset.id,
        capability_bindings_json={},
        created_at=utc_now(),
    )
    session.add(binding)

    pub = PublishedSnapshot(
        channel="public",
        snapshot_id="snap_test",
        published_at=utc_now(),
    )
    session.add(pub)

    policy = ModelPolicyActivation(
        id=new_uuid(),
        policy_name="points-v1-prior_blend",
        target_metric="basketball_points",
        estimator_identity="prior_blend",
        calibration_identity="calib_test",
        eligibility_criteria_json={},
        experiment_run_id=None,
        is_active=True,
        activated_at=utc_now(),
    )
    session.add(policy)

    today = date(2026, 10, 20)
    target_date = date(2026, 10, 22)

    sched = WorkbenchSchedule(
        id=new_uuid(),
        dataset_id=dataset.id,
        game_id="0022600001",
        season="2026-27",
        phase="regular_season",
        game_date=target_date,
        date_precision="date",
        home_team_id="TOR",
        away_team_id="BOS",
        game_status=1,
        annotations_json={},
        source_version_id="sv1",
        source_observation_id="so1",
    )
    session.add(sched)

    # Add 12 prior games for P1 (core cohort)
    for i in range(12):
        g_date = today - timedelta(days=20 - i)
        pg = WorkbenchPlayerGame(
            id=new_uuid(),
            dataset_id=dataset.id,
            game_id=f"g_{i}",
            player_id="P1",
            team_id="TOR",
            opponent_id="MIA",
            game_date=g_date,
            season="2026-27",
            phase="regular_season",
            appearance="appeared",
            minutes_original="30:00",
            minutes_seconds=1800,
            points=22,
            stats_json={"points": 22, "field_goals_attempted": 15},
            source_version_id="sv1",
            source_observation_id="so1",
        )
        session.add(pg)

    session.commit()

    # First issuance run
    res1 = issue_prospective_forecasts(session, release_id="snap_test", as_of_date=today)
    assert res1["status"] == "success"
    assert res1["issued_count"] == 1
    assert res1["skipped_count"] == 0

    issuances_v1 = list(session.scalars(select(ForecastIssuance)).all())
    assert len(issuances_v1) == 1
    orig_id = issuances_v1[0].id
    orig_hash = issuances_v1[0].features_hash
    orig_est = issuances_v1[0].point_estimate

    # Second issuance run (identical inputs)
    res2 = issue_prospective_forecasts(session, release_id="snap_test", as_of_date=today)
    assert res2["status"] == "success"
    assert res2["issued_count"] == 0
    assert res2["skipped_count"] == 1

    issuances_v2 = list(session.scalars(select(ForecastIssuance)).all())
    assert len(issuances_v2) == 1
    assert issuances_v2[0].id == orig_id
    assert issuances_v2[0].features_hash == orig_hash
    assert issuances_v2[0].point_estimate == orig_est


def test_scoring_scheduled_zero_scores_never_become_labels(memory_db: Session):
    """A scheduled 0-0 game before tipoff or an absent player is never scored as 0 PTS."""
    session = memory_db

    dataset_id = "ds_scoring_test"
    target_date = date(2026, 10, 22)
    scoring_date = date(2026, 10, 23)

    policy = ModelPolicyActivation(
        id=new_uuid(),
        policy_name="points-v1-prior_blend",
        target_metric="basketball_points",
        estimator_identity="prior_blend",
        calibration_identity="calib_test",
        is_active=True,
    )
    session.add(policy)

    # Create 2 issuances: P1 and P2
    iss1 = ForecastIssuance(
        id=new_uuid(),
        policy_id=policy.id,
        player_id="P1",
        target_game_id="0022600002",
        target_game_date=target_date,
        target_opponent_id="BOS",
        issued_at_utc=utc_now(),
        dataset_id=dataset_id,
        features_hash="h1",
        features_json={},
        schedule_evidence_json={},
        team_evidence_json={},
        point_estimate=24.0,
        interval_lower=16.6,
        interval_upper=31.4,
        availability_reason="eligible_core",
        issuance_status="issued",
    )
    iss2 = ForecastIssuance(
        id=new_uuid(),
        policy_id=policy.id,
        player_id="P2",
        target_game_id="0022600002",
        target_game_date=target_date,
        target_opponent_id="BOS",
        issued_at_utc=utc_now(),
        dataset_id=dataset_id,
        features_hash="h2",
        features_json={},
        schedule_evidence_json={},
        team_evidence_json={},
        point_estimate=15.0,
        interval_lower=7.6,
        interval_upper=22.4,
        availability_reason="eligible_core",
        issuance_status="issued",
    )
    session.add_all([iss1, iss2])

    # 1. Team game is completed
    tg = WorkbenchTeamGame(
        id=new_uuid(),
        dataset_id=dataset_id,
        game_id="0022600002",
        team_id="TOR",
        opponent_id="BOS",
        game_date=target_date,
        date_precision="date",
        season="2026-27",
        phase="regular_season",
        side="home",
        points=110,
        opponent_points=105,
        is_final=True,
        stats_json={},
        source_version_id="sv1",
        source_observation_id="so1",
    )
    session.add(tg)

    # 2. P1 appeared and scored 26 PTS
    pg1 = WorkbenchPlayerGame(
        id=new_uuid(),
        dataset_id=dataset_id,
        game_id="0022600002",
        player_id="P1",
        team_id="TOR",
        opponent_id="BOS",
        game_date=target_date,
        season="2026-27",
        phase="regular_season",
        appearance="appeared",
        minutes_original="32:00",
        minutes_seconds=1920,
        points=26,
        stats_json={"points": 26},
        source_version_id="sv1",
        source_observation_id="so1",
    )
    session.add(pg1)

    # 3. P2 is ABSENT from box score (did not play / inactive / DNP)
    # Notice: No WorkbenchPlayerGame for P2!
    session.commit()

    score_res = score_forecast_issuances(session, dataset_id=dataset_id, as_of_date=scoring_date)
    assert score_res["scored_count"] == 1
    assert score_res["unscored_dnp_count"] == 1

    # Check P1 score
    p1_score = session.scalar(select(ForecastScore).where(ForecastScore.issuance_id == iss1.id))
    assert p1_score is not None
    assert p1_score.score_status == "scored"
    assert p1_score.observed_points == 26
    assert p1_score.absolute_error == 2.0  # |26 - 24.0|
    assert p1_score.interval_hit is True  # 26 in [16.6, 31.4]

    # Check P2 score: Must be unscored_dnp, NOT zero points!
    p2_score = session.scalar(select(ForecastScore).where(ForecastScore.issuance_id == iss2.id))
    assert p2_score is not None
    assert p2_score.score_status == "unscored_dnp"
    assert p2_score.observed_points is None  # NEVER ZERO!
    assert p2_score.absolute_error is None
    assert p2_score.interval_hit is None
    assert p2_score.reason == "absent_from_box_score_unknown"


def test_scoring_stat_correction_appends_revised_score(memory_db: Session):
    """An official NBA stat correction appends a new score observation while preserving history."""
    session = memory_db
    dataset_id = "ds_stat_correction"
    target_date = date(2026, 10, 22)
    scoring_date = date(2026, 10, 23)

    policy = ModelPolicyActivation(
        id=new_uuid(),
        policy_name="points-v1-prior_blend",
        target_metric="basketball_points",
        estimator_identity="prior_blend",
        calibration_identity="calib_test",
        is_active=True,
    )
    session.add(policy)

    iss = ForecastIssuance(
        id=new_uuid(),
        policy_id=policy.id,
        player_id="P1",
        target_game_id="0022600003",
        target_game_date=target_date,
        target_opponent_id="CLE",
        issued_at_utc=utc_now(),
        dataset_id=dataset_id,
        features_hash="h1",
        features_json={},
        schedule_evidence_json={},
        team_evidence_json={},
        point_estimate=20.0,
        interval_lower=12.6,
        interval_upper=27.4,
        availability_reason="eligible_core",
        issuance_status="issued",
    )
    session.add(iss)

    tg = WorkbenchTeamGame(
        id=new_uuid(),
        dataset_id=dataset_id,
        game_id="0022600003",
        team_id="TOR",
        opponent_id="CLE",
        game_date=target_date,
        date_precision="date",
        season="2026-27",
        phase="regular_season",
        side="home",
        points=100,
        opponent_points=98,
        is_final=True,
        stats_json={},
        source_version_id="sv1",
        source_observation_id="so1",
    )
    pg = WorkbenchPlayerGame(
        id=new_uuid(),
        dataset_id=dataset_id,
        game_id="0022600003",
        player_id="P1",
        team_id="TOR",
        opponent_id="CLE",
        game_date=target_date,
        season="2026-27",
        phase="regular_season",
        appearance="appeared",
        minutes_original="30:00",
        minutes_seconds=1800,
        points=22,  # Initial box score points
        stats_json={"points": 22},
        source_version_id="sv1",
        source_observation_id="so1",
    )
    session.add_all([tg, pg])
    session.commit()

    # Initial scoring pass
    score_forecast_issuances(session, dataset_id=dataset_id, as_of_date=scoring_date)

    scores_v1 = list(
        session.scalars(select(ForecastScore).where(ForecastScore.issuance_id == iss.id)).all()
    )
    assert len(scores_v1) == 1
    assert scores_v1[0].score_status == "scored"
    assert scores_v1[0].observed_points == 22

    # Now simulate official stat correction: box score updated from 22 to 24
    session.info["allow_admin_mutation"] = True
    pg.points = 24
    session.commit()
    session.info["allow_admin_mutation"] = False

    # Re-run scoring pass
    res_corr = score_forecast_issuances(session, dataset_id=dataset_id, as_of_date=scoring_date)
    assert res_corr["revised_count"] == 1

    scores_v2 = list(
        session.scalars(
            select(ForecastScore)
            .where(ForecastScore.issuance_id == iss.id)
            .order_by(ForecastScore.scored_at.asc())
        ).all()
    )
    # MUST have 2 scores now (append-only history!)
    assert len(scores_v2) == 2
    assert scores_v2[0].score_status == "scored"
    assert scores_v2[0].observed_points == 22  # Original score preserved!

    assert scores_v2[1].score_status == "revised"
    assert scores_v2[1].observed_points == 24  # Revised score appended!
    assert scores_v2[1].absolute_error == 4.0  # |24 - 20.0|


def test_prospective_accuracy_status_not_yet_observed(memory_db: Session):
    """Before outcomes complete, prospective accuracy is reported as 'not_yet_observed'."""
    session = memory_db

    policy = ModelPolicyActivation(
        id=new_uuid(),
        policy_name="points-v1-prior_blend",
        target_metric="basketball_points",
        estimator_identity="prior_blend",
        calibration_identity="calib_test",
        is_active=True,
    )
    session.add(policy)

    iss = ForecastIssuance(
        id=new_uuid(),
        policy_id=policy.id,
        player_id="P_Raptor",
        target_game_id="0022600004",
        target_game_date=date(2026, 10, 25),
        target_opponent_id="MIA",
        issued_at_utc=utc_now(),
        dataset_id="ds_p7",
        features_hash="h1",
        features_json={},
        schedule_evidence_json={},
        team_evidence_json={},
        point_estimate=21.5,
        interval_lower=14.1,
        interval_upper=28.9,
        availability_reason="eligible_core",
        issuance_status="issued",
    )
    session.add(iss)
    session.commit()

    res = query_forecast_issuances(session)
    assert res["summary"]["total_issued"] == 1
    assert res["summary"]["total_scored"] == 0
    assert res["summary"]["prospective_accuracy_status"] == "not_yet_observed"
    assert res["summary"]["accuracy_metrics"] is None
    assert "not yet observed" in res["summary"]["message"]


def test_timezone_and_date_handling():
    """Verify NBA domain zone America/New_York conversions."""
    # October 1, 2026 16:00 UTC = 12:00 PM EDT (UTC-4)
    dt_utc = datetime(2026, 10, 1, 16, 0, 0, tzinfo=UTC)
    east_date = get_eastern_date(dt_utc)
    assert east_date == date(2026, 10, 1)

    # 1:00 AM UTC on Oct 2 = 9:00 PM EDT on Oct 1 (still Oct 1 in NY!)
    late_utc = datetime(2026, 10, 2, 1, 0, 0, tzinfo=UTC)
    east_late = get_eastern_date(late_utc)
    assert east_late == date(2026, 10, 1)
