"""Prospective points-v1 forecast issuance, scoring, and lifecycle service.

Strict temporal discipline:
1. Feature computations strictly exclude target date and subsequent outcomes (game_date < cutoff).
2. Input observations must have been observed by issuance time (observed_at_utc <= issued_at_utc).
3. Scheduled zero scores (e.g. 0-0 before tipoff) are NEVER treated as labels.
4. Absent box-score rows are unknown / DNP, not zeros.
5. Revisions or late stat corrections append scoring observations; they do not rewrite issuances.
6. Before outcomes complete, prospective accuracy is reported as 'not_yet_observed'.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from courtload.config import get_settings
from courtload.domain.teams import resolve_team_tricode
from courtload.evaluation.points_baselines import (
    clip_point_prediction,
    current_ewma,
    current_rolling_mean,
    season_prior_blend,
)
from courtload.evaluation.points_features import (
    PointsPlayerGame,
    compute_context_features,
    compute_player_features,
    compute_points_feature_hash,
)
from courtload.models import new_uuid, utc_now
from courtload.services.publication import DEFAULT_CHANNEL
from courtload.warehouse_models import PublishedSnapshot
from courtload.workbench_models import (
    ForecastIssuance,
    ForecastScore,
    ModelPolicyActivation,
    WorkbenchDataset,
    WorkbenchIdentity,
    WorkbenchPlayerGame,
    WorkbenchReleaseBinding,
    WorkbenchSchedule,
    WorkbenchTeamGame,
)

logger = logging.getLogger(__name__)

NBA_ZONE = ZoneInfo("America/New_York")


def get_eastern_date(dt: datetime | None = None) -> date:
    """Return the current or specified date in the NBA domain zone (America/New_York)."""
    if dt is None:
        dt = datetime.now(UTC)
    elif dt.tzinfo is None:
        dt = dt.replace(tzinfo=UTC)
    return dt.astimezone(NBA_ZONE).date()


def get_active_points_policy(session: Session) -> ModelPolicyActivation | None:
    """Retrieve the currently active points forecasting policy from the database."""
    return session.scalar(
        select(ModelPolicyActivation)
        .where(
            ModelPolicyActivation.target_metric == "basketball_points",
            ModelPolicyActivation.is_active == True,  # noqa: E712
        )
        .order_by(desc(ModelPolicyActivation.activated_at))
        .limit(1)
    )


def load_policy_calibration(
    policy: ModelPolicyActivation,
    output_root: Path | None = None,
) -> dict[str, Any]:
    """Load the calibrated 80% empirical intervals for the active policy from artifacts."""
    settings = get_settings()
    root = output_root or (settings.artifacts_root / "evaluation")

    run_id = policy.experiment_run_id
    if not run_id:
        return {}

    run_dir = root / run_id
    calib_file = run_dir / "calibration.json"
    if not calib_file.exists():
        logger.warning("Calibration file not found at %s", calib_file)
        return {}

    try:
        data = json.loads(calib_file.read_text(encoding="utf-8"))
        est = policy.estimator_identity
        if est in data and isinstance(data[est], dict):
            return dict(data[est])
        if isinstance(data, dict):
            return dict(data)
        return {}
    except Exception as exc:
        logger.error("Failed to load calibration from %s: %s", calib_file, exc)
        return {}


def determine_candidate_eligibility(
    current_games: list[PointsPlayerGame],
    prior_games: list[PointsPlayerGame] | None,
    cutoff: date,
    upcoming_target: WorkbenchSchedule | None,
    last_team_id: str | None,
) -> tuple[bool, str, str | None]:
    """Determine player candidate eligibility according to frozen points-v1 protocol.

    Returns:
        (is_eligible, cohort_or_reason, human_readable_message)
    """
    if upcoming_target is None:
        return (
            False,
            "no_upcoming_schedule",
            "No scheduled team game within the 7-day forecast horizon [D, D+6].",
        )

    valid_current = [g for g in current_games if g.game_date < cutoff and g.is_valid_history]
    n_current = len(valid_current)

    valid_prior = [g for g in (prior_games or []) if g.is_valid_history]
    n_prior = len(valid_prior)
    prior_eligible = n_prior >= 20

    # Main cohort 1: Core cohort (>= 10 valid current-season appearances)
    if n_current >= 10:
        return (
            True,
            "core",
            f"Eligible under core cohort ({n_current} appearances in current season).",
        )

    # Main cohort 2: Early-season cohort (1-9 current appearances + >= 20 prior season)
    if 1 <= n_current < 10 and prior_eligible:
        return (
            True,
            "early_season",
            (
                f"Eligible under early-season cohort ({n_current} current appearances, "
                f"{n_prior} prior appearances)."
            ),
        )

    # Fallback cohort: 5-9 current appearances but no qualifying prior season
    if 5 <= n_current < 10 and not prior_eligible:
        return (
            True,
            "available_history_fallback",
            (
                f"Eligible under available-history fallback ({n_current} current appearances, "
                "prior season unavailable)."
            ),
        )

    # Ineligible cases with explicit reasons
    if n_current == 0:
        if prior_eligible:
            return (
                False,
                "season_opener_awaiting_first_game",
                (
                    "Awaiting first regular-season appearance of current season to confirm "
                    "active team role; prior season context available in research."
                ),
            )
        if n_prior == 0:
            return (
                False,
                "rookie_no_history",
                (
                    "Rookie player with no prior regular-season appearances; "
                    "insufficient history for empirical forecasting."
                ),
            )
        return (
            False,
            "season_opener_no_prior",
            (
                f"Season opener with insufficient prior history ({n_prior} prior appearances; "
                "minimum 20 required)."
            ),
        )

    if 1 <= n_current < 5:
        return (
            False,
            "insufficient_history",
            (
                f"Insufficient history ({n_current} current appearance(s), "
                "prior season unavailable; minimum 5 appearances required)."
            ),
        )

    return (
        False,
        "ineligible_general",
        "Player does not meet points-v1 eligibility criteria.",
    )


def compute_estimate_and_interval(
    estimator_identity: str,
    pts_current: list[float],
    prior_pts_mean: float | None,
    cohort: str,
    calibration_entry: dict[str, Any],
) -> tuple[float, float, float]:
    """Compute point estimate and empirical 80% interval for eligible player."""
    point_est: float | None = None

    if estimator_identity == "prior_blend":
        point_est = season_prior_blend(pts_current, previous_season_mean=prior_pts_mean)
    elif estimator_identity == "current_ewma":
        point_est = current_ewma(pts_current, previous_season_mean=prior_pts_mean)
    elif estimator_identity == "current_rolling_mean":
        point_est = current_rolling_mean(pts_current, previous_season_mean=prior_pts_mean)
    else:
        # Fallback to season_prior_blend if unrecognized
        point_est = season_prior_blend(pts_current, previous_season_mean=prior_pts_mean)

    if point_est is None:
        if pts_current:
            point_est = sum(pts_current) / len(pts_current)
        elif prior_pts_mean is not None:
            point_est = prior_pts_mean
        else:
            point_est = 0.0

    clipped_point = clip_point_prediction(point_est) or 0.0

    # Empirical interval half-width
    q: float = 7.41  # Default conservative fallback
    cohort_key = "early_season" if cohort == "early_season" else "core"
    cohort_calib = calibration_entry.get(cohort_key, {})
    if cohort_calib.get("available") and cohort_calib.get("absolute_residual_quantile") is not None:
        q = float(cohort_calib["absolute_residual_quantile"])
    elif calibration_entry.get("core", {}).get("absolute_residual_quantile") is not None:
        q = float(calibration_entry["core"]["absolute_residual_quantile"])

    interval_lower = max(0.0, round(clipped_point - q, 2))
    interval_upper = round(clipped_point + q, 2)
    return round(clipped_point, 2), interval_lower, interval_upper


def issue_prospective_forecasts(
    session: Session,
    release_id: str | None = None,
    as_of_date: date | None = None,
    as_of_time: datetime | None = None,
) -> dict[str, Any]:
    """Issue genuine prospective points forecasts against active policy and published inputs.

    Strict temporal discipline:
    - Replay date cutoff strictly filters player history (game_date < as_of_date).
    - Observations must have been received before or at as_of_time.
    - Idempotent: existing issuances for (policy_id, player_id, target_game_id) are preserved.
    """
    issued_time = as_of_time or utc_now()
    cutoff_date = as_of_date or get_eastern_date(issued_time)

    # 1. Resolve active policy
    policy = get_active_points_policy(session)
    if policy is None:
        logger.info("No active points policy found in database; cannot issue forecasts.")
        return {
            "status": "no_policy_registered",
            "issued_count": 0,
            "skipped_count": 0,
            "ineligible_count": 0,
            "message": "No active points policy registered in database.",
        }

    # 2. Resolve dataset and release
    target_snapshot_id = release_id
    if target_snapshot_id is None:
        pub = session.scalar(
            select(PublishedSnapshot).where(PublishedSnapshot.channel == DEFAULT_CHANNEL)
        )
        if pub is None:
            logger.info("No published snapshot found on channel '%s'.", DEFAULT_CHANNEL)
            return {
                "status": "no_published_release",
                "issued_count": 0,
                "skipped_count": 0,
                "ineligible_count": 0,
                "message": "No published release found.",
            }
        target_snapshot_id = pub.snapshot_id

    binding = session.scalar(
        select(WorkbenchReleaseBinding).where(
            WorkbenchReleaseBinding.snapshot_id == target_snapshot_id
        )
    )
    if binding is None:
        return {
            "status": "binding_not_found",
            "issued_count": 0,
            "skipped_count": 0,
            "ineligible_count": 0,
            "message": f"Release binding for snapshot {target_snapshot_id} not found.",
        }

    dataset_id = binding.dataset_id
    dataset = session.get(WorkbenchDataset, dataset_id)
    if dataset is None:
        return {
            "status": "dataset_not_found",
            "issued_count": 0,
            "skipped_count": 0,
            "ineligible_count": 0,
            "message": f"Dataset {dataset_id} not found.",
        }

    calibration_entry = load_policy_calibration(policy)

    # 3. Find upcoming scheduled games in [cutoff_date, cutoff_date + 6]
    max_target_date = cutoff_date + timedelta(days=6)
    upcoming_schedules = list(
        session.scalars(
            select(WorkbenchSchedule)
            .where(
                WorkbenchSchedule.dataset_id == dataset_id,
                WorkbenchSchedule.phase == "regular_season",
                WorkbenchSchedule.game_date >= cutoff_date,
                WorkbenchSchedule.game_date <= max_target_date,
            )
            .order_by(WorkbenchSchedule.game_date.asc(), WorkbenchSchedule.game_id.asc())
        ).all()
    )

    if not upcoming_schedules:
        logger.info(
            "No scheduled regular season games found in horizon [%s, %s] for dataset %s.",
            cutoff_date,
            max_target_date,
            dataset_id,
        )
        return {
            "status": "no_upcoming_schedules",
            "issued_count": 0,
            "skipped_count": 0,
            "ineligible_count": 0,
            "message": (
                f"No upcoming regular season games found in [{cutoff_date}, {max_target_date}]."
            ),
        }

    # Map team_id -> next scheduled target game
    team_next_game: dict[str, tuple[WorkbenchSchedule, str, str]] = {}
    for s in upcoming_schedules:
        # If tipoff_utc is set and in the past, skip
        if s.tipoff_utc and s.tipoff_utc < issued_time:
            continue
        # home team
        if s.home_team_id not in team_next_game:
            team_next_game[s.home_team_id] = (s, "home", s.away_team_id)
        # away team
        if s.away_team_id not in team_next_game:
            team_next_game[s.away_team_id] = (s, "away", s.home_team_id)

    # 4. Load all historical player games strictly before cutoff
    raw_pgs = list(
        session.scalars(
            select(WorkbenchPlayerGame).where(
                WorkbenchPlayerGame.dataset_id == dataset_id,
                WorkbenchPlayerGame.game_date < cutoff_date,
            )
        ).all()
    )

    # Group by player
    player_history: dict[str, list[PointsPlayerGame]] = {}
    for g in raw_pgs:
        stats = g.stats_json or {}
        item = PointsPlayerGame(
            game_id=g.game_id,
            player_id=g.player_id,
            team_id=g.team_id,
            opponent_id=g.opponent_id,
            game_date=g.game_date,
            season=g.season,
            phase=g.phase,
            appearance=g.appearance,
            minutes_seconds=g.minutes_seconds,
            points=g.points if g.points is not None else stats.get("points"),
            field_goal_attempts=stats.get("field_goals_attempted"),
            free_throw_attempts=stats.get("free_throws_attempted"),
        )
        player_history.setdefault(g.player_id, []).append(item)

    # Team schedules for context features
    all_team_schedules: dict[str, list[dict[str, Any]]] = {}
    for s in upcoming_schedules:
        all_team_schedules.setdefault(s.home_team_id, []).append(
            {"game_id": s.game_id, "game_date": s.game_date}
        )
        all_team_schedules.setdefault(s.away_team_id, []).append(
            {"game_id": s.game_id, "game_date": s.game_date}
        )

    # Opponent prior games for context features
    opp_team_games: dict[str, list[dict[str, Any]]] = {}
    raw_tgs = list(
        session.scalars(
            select(WorkbenchTeamGame).where(
                WorkbenchTeamGame.dataset_id == dataset_id,
                WorkbenchTeamGame.game_date < cutoff_date,
                WorkbenchTeamGame.phase == "regular_season",
            )
        ).all()
    )
    for tg in raw_tgs:
        opp_team_games.setdefault(tg.team_id, []).append(
            {
                "game_id": tg.game_id,
                "game_date": tg.game_date,
                "phase": tg.phase,
                "points": tg.points,
                "opponent_points": tg.opponent_points,
            }
        )

    target_season = upcoming_schedules[0].season
    prior_season_year = int(target_season.split("-")[0]) - 1
    prior_season = f"{prior_season_year}-{str(prior_season_year + 1)[-2:]}"

    issued_count = 0
    skipped_existing = 0
    ineligible_count = 0

    for pid, games in player_history.items():
        games.sort(key=lambda x: (x.game_date, x.game_id))
        valid_games = [g for g in games if g.is_valid_history]
        if not valid_games:
            ineligible_count += 1
            continue

        latest_game = valid_games[-1]
        player_team_id = latest_game.team_id

        # Check if player's team has an upcoming game
        if player_team_id not in team_next_game:
            ineligible_count += 1
            continue

        target_sched, side, opp_id = team_next_game[player_team_id]

        # Separate current season and immediately prior season
        curr_games = [g for g in games if g.season == target_season]
        prior_games = [g for g in games if g.season == prior_season]

        is_eligible, cohort_or_reason, _ = determine_candidate_eligibility(
            curr_games,
            prior_games,
            cutoff=cutoff_date,
            upcoming_target=target_sched,
            last_team_id=player_team_id,
        )

        if not is_eligible:
            ineligible_count += 1
            continue

        # Check idempotency: does an issuance already exist for this (policy, player, target_game)?
        existing = session.scalar(
            select(ForecastIssuance).where(
                ForecastIssuance.policy_id == policy.id,
                ForecastIssuance.player_id == pid,
                ForecastIssuance.target_game_id == target_sched.game_id,
            )
        )
        if existing is not None:
            skipped_existing += 1
            continue

        # Build features strictly obeying game_date < cutoff_date
        player_features, pts_current, prior_mean = compute_player_features(
            current_history=curr_games,
            prior_season_history=prior_games,
            cutoff=cutoff_date,
            target_game_date=target_sched.game_date,
        )

        team_sched = all_team_schedules.get(player_team_id, [])
        opp_games = opp_team_games.get(opp_id, [])
        context_features = compute_context_features(
            is_home=(side == "home"),
            team_schedule=team_sched,
            target_game_id=target_sched.game_id,
            target_game_date=target_sched.game_date,
            opponent_prior_games=opp_games,
            cutoff=cutoff_date,
        )

        features = {**player_features, **context_features}
        feat_hash = compute_points_feature_hash(features)

        point_est, int_low, int_upp = compute_estimate_and_interval(
            estimator_identity=policy.estimator_identity,
            pts_current=pts_current,
            prior_pts_mean=prior_mean,
            cohort=cohort_or_reason,
            calibration_entry=calibration_entry,
        )

        schedule_evidence = {
            "game_id": target_sched.game_id,
            "game_date": target_sched.game_date.isoformat(),
            "season": target_sched.season,
            "side": side,
            "home_team_id": target_sched.home_team_id,
            "away_team_id": target_sched.away_team_id,
            "target_opponent_id": opp_id,
            "lead_days": max(0, min((target_sched.game_date - cutoff_date).days, 6)),
            "source_version_id": target_sched.source_version_id,
            "source_observation_id": target_sched.source_observation_id,
        }

        team_evidence = {
            "player_id": pid,
            "team_id": player_team_id,
            "association_basis": "observed_participation",
            "last_observed_date": latest_game.game_date.isoformat(),
            "valid_current_appearances": len(pts_current),
            "valid_prior_appearances": len(
                [g for g in prior_games if g.is_valid_history and g.points is not None]
            ),
            "cohort": cohort_or_reason,
        }

        issuance = ForecastIssuance(
            id=new_uuid(),
            policy_id=policy.id,
            player_id=pid,
            target_game_id=target_sched.game_id,
            target_game_date=target_sched.game_date,
            target_opponent_id=opp_id,
            issued_at_utc=issued_time,
            dataset_id=dataset_id,
            features_hash=feat_hash,
            features_json=features,
            schedule_evidence_json=schedule_evidence,
            team_evidence_json=team_evidence,
            point_estimate=point_est,
            interval_lower=int_low,
            interval_upper=int_upp,
            availability_reason=f"eligible_{cohort_or_reason}",
            issuance_status="issued",
        )
        session.add(issuance)
        issued_count += 1

    if issued_count > 0:
        session.commit()

    logger.info(
        "Issued %d prospective forecasts for policy %s (skipped %d existing, %d ineligible).",
        issued_count,
        policy.policy_name,
        skipped_existing,
        ineligible_count,
    )

    return {
        "status": "success",
        "policy_id": policy.id,
        "policy_name": policy.policy_name,
        "issued_count": issued_count,
        "skipped_count": skipped_existing,
        "ineligible_count": ineligible_count,
        "cutoff_date": cutoff_date.isoformat(),
        "issued_at_utc": issued_time.isoformat(),
    }


def score_forecast_issuances(
    session: Session,
    dataset_id: str | None = None,
    as_of_date: date | None = None,
) -> dict[str, Any]:
    """Score pending forecast issuances against observed final box score outcomes.

    Strict rules:
    - Never score future games (target_game_date > as_of_date).
    - Scheduled zero scores (0-0 before tipoff) are NEVER treated as labels.
    - Absent box-score rows are unknown/DNP, NOT zeros.
    - Late stat corrections append a new ForecastScore observation with score_status='revised'.
    """
    scoring_date = as_of_date or get_eastern_date()

    query = select(ForecastIssuance).where(
        ForecastIssuance.target_game_date <= scoring_date,
        ForecastIssuance.issuance_status == "issued",
    )
    if dataset_id:
        query = query.where(ForecastIssuance.dataset_id == dataset_id)

    issuances = list(session.scalars(query).all())
    if not issuances:
        return {
            "status": "no_pending_issuances",
            "scored_count": 0,
            "unscored_dnp_count": 0,
            "unscored_cancelled_count": 0,
            "revised_count": 0,
        }

    scored_count = 0
    unscored_dnp_count = 0
    unscored_cancelled_count = 0
    revised_count = 0

    for iss in issuances:
        # Check team game completion
        team_game = session.scalar(
            select(WorkbenchTeamGame).where(
                WorkbenchTeamGame.dataset_id == iss.dataset_id,
                WorkbenchTeamGame.game_id == iss.target_game_id,
            )
        )

        schedule = session.scalar(
            select(WorkbenchSchedule).where(
                WorkbenchSchedule.dataset_id == iss.dataset_id,
                WorkbenchSchedule.game_id == iss.target_game_id,
            )
        )

        # Check if game was cancelled or postponed
        if schedule and schedule.game_status in (4, 5):  # Postponed / Cancelled
            existing_cancelled = session.scalar(
                select(ForecastScore).where(
                    ForecastScore.issuance_id == iss.id,
                    ForecastScore.score_status == "unscored_cancelled",
                )
            )
            if not existing_cancelled:
                sc = ForecastScore(
                    id=new_uuid(),
                    issuance_id=iss.id,
                    observed_points=None,
                    scored_at=utc_now(),
                    scoring_policy_id="points-v1-scoring",
                    absolute_error=None,
                    interval_hit=None,
                    score_status="unscored_cancelled",
                    reason="game_cancelled_or_postponed",
                )
                session.add(sc)
                unscored_cancelled_count += 1
            continue

        # If team game is not yet final, target outcome is pending
        if team_game is None or not team_game.is_final:
            continue

        # Query player outcome in box score
        player_game = session.scalar(
            select(WorkbenchPlayerGame).where(
                WorkbenchPlayerGame.dataset_id == iss.dataset_id,
                WorkbenchPlayerGame.player_id == iss.player_id,
                WorkbenchPlayerGame.game_id == iss.target_game_id,
            )
        )

        # Check existing scores for this issuance (sorted by scored_at asc)
        existing_scores = list(
            session.scalars(
                select(ForecastScore)
                .where(ForecastScore.issuance_id == iss.id)
                .order_by(ForecastScore.scored_at.asc())
            ).all()
        )

        # Case 1: Player appeared in final box score
        if (
            player_game is not None
            and player_game.appearance == "appeared"
            and player_game.points is not None
            and player_game.minutes_seconds is not None
            and player_game.minutes_seconds > 0
        ):
            pts = player_game.points
            abs_err = round(abs(float(pts) - iss.point_estimate), 3)
            hit = bool(iss.interval_lower <= pts <= iss.interval_upper)

            if not existing_scores:
                sc = ForecastScore(
                    id=new_uuid(),
                    issuance_id=iss.id,
                    observed_points=pts,
                    scored_at=utc_now(),
                    scoring_policy_id="points-v1-scoring",
                    outcome_observation_id=player_game.source_observation_id,
                    absolute_error=abs_err,
                    interval_hit=hit,
                    score_status="scored",
                    reason="confirmed_appearance",
                )
                session.add(sc)
                scored_count += 1
            else:
                last_sc = existing_scores[-1]
                if last_sc.observed_points != pts:
                    # Append-only revision!
                    rev = ForecastScore(
                        id=new_uuid(),
                        issuance_id=iss.id,
                        observed_points=pts,
                        scored_at=utc_now(),
                        scoring_policy_id="points-v1-scoring",
                        outcome_observation_id=player_game.source_observation_id,
                        absolute_error=abs_err,
                        interval_hit=hit,
                        score_status="revised",
                        reason=f"stat_correction_from_{last_sc.observed_points}_to_{pts}",
                    )
                    session.add(rev)
                    revised_count += 1

        # Case 2: Player did not appear (DNP or zero minutes in box score)
        elif player_game is not None and (
            player_game.appearance == "dnp"
            or player_game.minutes_seconds == 0
            or player_game.minutes_seconds is None
        ):
            if not existing_scores:
                sc = ForecastScore(
                    id=new_uuid(),
                    issuance_id=iss.id,
                    observed_points=None,
                    scored_at=utc_now(),
                    scoring_policy_id="points-v1-scoring",
                    outcome_observation_id=player_game.source_observation_id,
                    absolute_error=None,
                    interval_hit=None,
                    score_status="unscored_dnp",
                    reason="did_not_appear_dnp",
                )
                session.add(sc)
                unscored_dnp_count += 1

        # Case 3: Absent from final box score completely (unknown / nonappearance)
        else:
            if not existing_scores:
                sc = ForecastScore(
                    id=new_uuid(),
                    issuance_id=iss.id,
                    observed_points=None,
                    scored_at=utc_now(),
                    scoring_policy_id="points-v1-scoring",
                    outcome_observation_id=None,
                    absolute_error=None,
                    interval_hit=None,
                    score_status="unscored_dnp",
                    reason="absent_from_box_score_unknown",
                )
                session.add(sc)
                unscored_dnp_count += 1

    has_updates = (
        scored_count > 0
        or unscored_dnp_count > 0
        or unscored_cancelled_count > 0
        or revised_count > 0
    )
    if has_updates:
        session.commit()

    return {
        "status": "success",
        "scored_count": scored_count,
        "unscored_dnp_count": unscored_dnp_count,
        "unscored_cancelled_count": unscored_cancelled_count,
        "revised_count": revised_count,
    }


def query_forecast_issuances(
    session: Session,
    player_id: str | None = None,
    team_id: str | None = None,
    target_game_date: date | None = None,
    status: str | None = None,
    page: int = 1,
    page_size: int = 50,
) -> dict[str, Any]:
    """Query forecast issuances with pagination, player names, and scoring summary."""
    active_policy = get_active_points_policy(session)

    stmt = select(
        ForecastIssuance,
        WorkbenchIdentity.display_name,
    ).outerjoin(
        WorkbenchIdentity,
        (WorkbenchIdentity.external_id == ForecastIssuance.player_id)
        & (WorkbenchIdentity.kind == "player"),
    )

    if player_id:
        stmt = stmt.where(ForecastIssuance.player_id == player_id)
    if target_game_date:
        stmt = stmt.where(ForecastIssuance.target_game_date == target_game_date)

    total_count = (
        session.scalar(select(func.count(ForecastIssuance.id)).select_from(ForecastIssuance)) or 0
    )

    offset = (page - 1) * page_size
    records = session.execute(
        stmt.order_by(
            ForecastIssuance.target_game_date.desc(),
            ForecastIssuance.issued_at_utc.desc(),
        )
        .offset(offset)
        .limit(page_size)
    ).all()

    items: list[dict[str, Any]] = []
    for iss, p_name in records:
        # Find latest score observation
        latest_score = session.scalar(
            select(ForecastScore)
            .where(ForecastScore.issuance_id == iss.id)
            .order_by(ForecastScore.scored_at.desc())
            .limit(1)
        )
        score_dict = None
        if latest_score is not None:
            score_dict = {
                "id": latest_score.id,
                "issuance_id": latest_score.issuance_id,
                "observed_points": latest_score.observed_points,
                "scored_at": latest_score.scored_at.isoformat(),
                "scoring_policy_id": latest_score.scoring_policy_id,
                "outcome_observation_id": latest_score.outcome_observation_id,
                "absolute_error": latest_score.absolute_error,
                "interval_hit": latest_score.interval_hit,
                "score_status": latest_score.score_status,
                "reason": latest_score.reason,
            }

        team_ev = iss.team_evidence_json or {}
        p_team_id = team_ev.get("team_id") or ""
        items.append(
            {
                "id": iss.id,
                "policy_id": iss.policy_id,
                "player_id": iss.player_id,
                "player_name": p_name or iss.player_id,
                "team_id": p_team_id,
                "team_tricode": resolve_team_tricode(p_team_id),
                "target_game_id": iss.target_game_id,
                "target_game_date": iss.target_game_date.isoformat(),
                "target_opponent_id": iss.target_opponent_id,
                "target_opponent_tricode": resolve_team_tricode(iss.target_opponent_id),
                "issued_at_utc": iss.issued_at_utc.isoformat(),
                "dataset_id": iss.dataset_id,
                "features_hash": iss.features_hash,
                "point_estimate": iss.point_estimate,
                "interval_lower": iss.interval_lower,
                "interval_upper": iss.interval_upper,
                "availability_reason": iss.availability_reason,
                "issuance_status": iss.issuance_status,
                "latest_score": score_dict,
            }
        )

    # Compute overall summary metrics across all issuances
    total_scored = (
        session.scalar(
            select(func.count(ForecastScore.id)).where(
                ForecastScore.score_status.in_(["scored", "revised"])
            )
        )
        or 0
    )

    total_dnp = (
        session.scalar(
            select(func.count(ForecastScore.id)).where(ForecastScore.score_status == "unscored_dnp")
        )
        or 0
    )

    total_cancelled = (
        session.scalar(
            select(func.count(ForecastScore.id)).where(
                ForecastScore.score_status == "unscored_cancelled"
            )
        )
        or 0
    )

    total_pending = max(0, total_count - total_scored - total_dnp - total_cancelled)

    prospective_status = "observed" if total_scored > 0 else "not_yet_observed"
    metrics_summary = None

    if total_scored > 0:
        scored_scores = list(
            session.scalars(
                select(ForecastScore).where(ForecastScore.score_status.in_(["scored", "revised"]))
            ).all()
        )
        errors = [s.absolute_error for s in scored_scores if s.absolute_error is not None]
        hits = [s.interval_hit for s in scored_scores if s.interval_hit is not None]
        mae = (sum(errors) / len(errors)) if errors else None
        coverage = (sum(1 for h in hits if h) / len(hits)) if hits else None
        metrics_summary = {
            "scored_count": total_scored,
            "mae": round(mae, 3) if mae is not None else None,
            "interval_coverage": round(coverage, 3) if coverage is not None else None,
        }

    policy_summary = None
    if active_policy is not None:
        policy_summary = {
            "id": active_policy.id,
            "policy_name": active_policy.policy_name,
            "estimator_identity": active_policy.estimator_identity,
            "calibration_identity": active_policy.calibration_identity,
            "experiment_run_id": active_policy.experiment_run_id,
            "activated_at": active_policy.activated_at.isoformat(),
        }

    return {
        "items": items,
        "summary": {
            "total_issued": total_count,
            "total_scored": total_scored,
            "total_pending": total_pending,
            "total_unscored_dnp": total_dnp,
            "total_unscored_cancelled": total_cancelled,
            "prospective_accuracy_status": prospective_status,
            "accuracy_metrics": metrics_summary,
            "active_policy": policy_summary,
            "message": (
                "Prospective accuracy not yet observed: Awaiting 2026-27 regular season tipoff."
                if total_scored == 0
                else f"Observed prospective accuracy across {total_scored} scored appearances."
            ),
        },
        "page": page,
        "page_size": page_size,
        "total_items": total_count,
        "warnings": [],
    }


def get_forecast_issuance_detail(
    session: Session,
    issuance_id: str,
) -> dict[str, Any] | None:
    """Retrieve complete issuance detail including features, evidence, and score history."""
    iss = session.get(ForecastIssuance, issuance_id)
    if iss is None:
        return None

    p_name = session.scalar(
        select(WorkbenchIdentity.display_name).where(
            WorkbenchIdentity.external_id == iss.player_id,
            WorkbenchIdentity.kind == "player",
        )
    )

    scores = list(
        session.scalars(
            select(ForecastScore)
            .where(ForecastScore.issuance_id == iss.id)
            .order_by(ForecastScore.scored_at.asc())
        ).all()
    )

    team_ev = iss.team_evidence_json or {}
    p_team_id = team_ev.get("team_id") or ""

    return {
        "id": iss.id,
        "policy_id": iss.policy_id,
        "player_id": iss.player_id,
        "player_name": p_name or iss.player_id,
        "team_id": p_team_id,
        "team_tricode": resolve_team_tricode(p_team_id),
        "target_game_id": iss.target_game_id,
        "target_game_date": iss.target_game_date.isoformat(),
        "target_opponent_id": iss.target_opponent_id,
        "target_opponent_tricode": resolve_team_tricode(iss.target_opponent_id),
        "issued_at_utc": iss.issued_at_utc.isoformat(),
        "dataset_id": iss.dataset_id,
        "features_hash": iss.features_hash,
        "point_estimate": iss.point_estimate,
        "interval_lower": iss.interval_lower,
        "interval_upper": iss.interval_upper,
        "availability_reason": iss.availability_reason,
        "issuance_status": iss.issuance_status,
        "features_json": iss.features_json,
        "schedule_evidence_json": iss.schedule_evidence_json,
        "team_evidence_json": iss.team_evidence_json,
        "scores": [
            {
                "id": s.id,
                "issuance_id": s.issuance_id,
                "observed_points": s.observed_points,
                "scored_at": s.scored_at.isoformat(),
                "scoring_policy_id": s.scoring_policy_id,
                "outcome_observation_id": s.outcome_observation_id,
                "absolute_error": s.absolute_error,
                "interval_hit": s.interval_hit,
                "score_status": s.score_status,
                "reason": s.reason,
            }
            for s in scores
        ],
    }


def get_player_prospective_forecast(
    session: Session,
    player_id: str,
    dataset_id: str,
    cutoff_date: date,
) -> dict[str, Any]:
    """Retrieve prospective forecast status or explicit availability reason for a player."""
    active_policy = get_active_points_policy(session)
    if active_policy is None:
        return {
            "status": "no_policy_registered",
            "message": "Points forecasting policy is not yet registered for this release.",
            "horizon_days": 7,
        }

    # 1. Look for an existing issued forecast for upcoming games
    latest_issuance = session.scalar(
        select(ForecastIssuance)
        .where(
            ForecastIssuance.player_id == player_id,
            ForecastIssuance.policy_id == active_policy.id,
            ForecastIssuance.target_game_date >= cutoff_date,
        )
        .order_by(ForecastIssuance.target_game_date.asc())
        .limit(1)
    )

    if latest_issuance is not None:
        opp_tricode = resolve_team_tricode(latest_issuance.target_opponent_id)
        msg = (
            f"Estimated {latest_issuance.point_estimate:.1f} PTS "
            f"[{latest_issuance.interval_lower:.1f}, {latest_issuance.interval_upper:.1f}] "
            f"for {latest_issuance.target_game_date.isoformat()} vs {opp_tricode} "
            "conditional on appearance."
        )
        return {
            "status": "forecast_issued",
            "message": msg,
            "point_estimate": latest_issuance.point_estimate,
            "interval_lower": latest_issuance.interval_lower,
            "interval_upper": latest_issuance.interval_upper,
            "target_game_id": latest_issuance.target_game_id,
            "target_game_date": latest_issuance.target_game_date.isoformat(),
            "target_opponent": opp_tricode,
            "policy_name": active_policy.policy_name,
            "horizon_days": 7,
        }

    # 2. Determine explicit reason why no forecast is issued
    raw_games = list(
        session.scalars(
            select(WorkbenchPlayerGame).where(
                WorkbenchPlayerGame.dataset_id == dataset_id,
                WorkbenchPlayerGame.player_id == player_id,
                WorkbenchPlayerGame.game_date < cutoff_date,
            )
        ).all()
    )

    valid_games = [
        g
        for g in raw_games
        if g.phase == "regular_season"
        and g.appearance == "appeared"
        and g.minutes_seconds is not None
        and g.minutes_seconds > 0
    ]

    if not valid_games:
        return {
            "status": "rookie_no_history",
            "message": (
                "Player has zero prior regular-season appearances; "
                "insufficient history for empirical forecasting."
            ),
            "horizon_days": 7,
        }

    latest_valid = max(valid_games, key=lambda x: (x.game_date, x.game_id))
    latest_team_id = latest_valid.team_id

    # Check upcoming schedule for latest team
    upcoming_sched = session.scalar(
        select(WorkbenchSchedule)
        .where(
            WorkbenchSchedule.dataset_id == dataset_id,
            WorkbenchSchedule.phase == "regular_season",
            WorkbenchSchedule.game_date >= cutoff_date,
            WorkbenchSchedule.game_date <= cutoff_date + timedelta(days=6),
            (WorkbenchSchedule.home_team_id == latest_team_id)
            | (WorkbenchSchedule.away_team_id == latest_team_id),
        )
        .order_by(WorkbenchSchedule.game_date.asc())
        .limit(1)
    )

    if upcoming_sched is None:
        team_tri = resolve_team_tricode(latest_team_id)
        return {
            "status": "unavailable_no_schedule",
            "message": (
                f"No scheduled regular season game for {team_tri} within the 7-day "
                "horizon [D, D+6]."
            ),
            "horizon_days": 7,
        }

    # If upcoming game exists but no issuance was created, evaluate count
    curr_season = upcoming_sched.season
    curr_season_games = [g for g in valid_games if g.season == curr_season]
    n_curr = len(curr_season_games)

    if n_curr == 0:
        return {
            "status": "season_opener_awaiting_first_game",
            "message": (
                f"Awaiting first regular-season appearance of {curr_season} to confirm "
                "active team role; prior season context available in research."
            ),
            "horizon_days": 7,
        }

    if n_curr < 5:
        return {
            "status": "insufficient_history",
            "message": (
                f"Only {n_curr} current appearance(s) and no qualifying prior season; "
                "minimum 5 appearances required."
            ),
            "horizon_days": 7,
        }

    return {
        "status": "ineligible",
        "message": "Player does not currently meet points-v1 prospective eligibility criteria.",
        "horizon_days": 7,
    }
