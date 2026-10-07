"""Data loading, candidate generation, and label resolution for points-v1 experiment."""

from __future__ import annotations

import csv
import hashlib
from bisect import bisect_left
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from typing import Any

from courtlens.domain.teams import resolve_team_tricode
from courtlens.evaluation.points_baselines import (
    current_ewma,
    current_rolling_mean,
    season_prior_blend,
)
from courtlens.evaluation.points_config import PointsConfig
from courtlens.evaluation.points_features import (
    PointsPlayerGame,
    compute_context_features,
    compute_player_features,
    compute_points_feature_hash,
)
from courtlens.ingestion.workbench_normalization import parse_schedule_file, reconcile_season

PRIOR_SEASON_MAP: dict[str, str] = {
    "2022-23": "2021-22",
    "2023-24": "2022-23",
    "2024-25": "2023-24",
    "2025-26": "2024-25",
}

ENDING_YEAR_TO_SEASON: dict[int, str] = {
    2022: "2021-22",
    2023: "2022-23",
    2024: "2023-24",
    2025: "2024-25",
    2026: "2025-26",
}


def compute_candidate_id(
    dataset_hash: str, player_id: str, replay_date: date, target_game_id: str
) -> str:
    token = f"{dataset_hash}:{player_id}:{replay_date.isoformat()}:{target_game_id}"
    return hashlib.sha256(token.encode()).hexdigest()


def split_for_target_game(config: PointsConfig, season: str, target_date: date) -> str | None:
    """Determine the block name for a given target game date."""
    for name in ("t", "v1", "v2", "c", "f"):
        contract = config.splits[name]
        seasons = contract.seasons if contract.seasons else (contract.season,)
        if season in seasons and contract.start <= target_date <= contract.end:
            return name
    return None


def is_purged_points(config: PointsConfig, split_name: str, cutoff_date: date) -> bool:
    """Purge candidates whose cutoff date strictly precedes the split block's start date."""
    contract = config.splits[split_name]
    return cutoff_date < contract.start


def load_points_dataset(
    raw_root: Path,
    years: list[int] | None = None,
) -> tuple[
    dict[tuple[str, str], list[PointsPlayerGame]],
    dict[tuple[str, str], PointsPlayerGame],
    dict[tuple[str, str], list[dict[str, Any]]],
    dict[tuple[str, str], dict[str, Any]],
]:
    """Load and reconcile raw SportsDataverse files into indexed player and team game records."""
    target_years = sorted(years or [2022, 2023, 2024, 2025, 2026])
    player_histories: dict[tuple[str, str], list[PointsPlayerGame]] = {}
    player_outcomes: dict[tuple[str, str], PointsPlayerGame] = {}
    team_schedules: dict[tuple[str, str], list[dict[str, Any]]] = {}
    team_games: dict[tuple[str, str], dict[str, Any]] = {}

    for year in target_years:
        season_name = ENDING_YEAR_TO_SEASON[year]
        season_dir = raw_root / f"sportsdataverse_{year}"
        sched_path = season_dir / f"nba_schedule_{year}.csv.gz"
        p_path = season_dir / f"player_boxscores_{year}.csv"
        t_path = season_dir / f"team_boxscores_{year}.csv"

        sched_lookup = parse_schedule_file(sched_path)
        with (
            p_path.open("r", encoding="utf-8-sig") as p_f,
            t_path.open("r", encoding="utf-8-sig") as t_f,
        ):
            reconciled = reconcile_season(csv.DictReader(p_f), csv.DictReader(t_f), sched_lookup)

        for row in reconciled["valid_player_rows"]:
            d_val = (
                date.fromisoformat(row["game_date"])
                if isinstance(row["game_date"], str)
                else row["game_date"]
            )
            stats = row.get("stats_json") or {}
            fga = stats.get("field_goals_attempted")
            fta = stats.get("free_throws_attempted")
            p_game = PointsPlayerGame(
                game_id=str(row["game_id"]),
                player_id=str(row["person_id"]),
                team_id=str(row["team_tricode"]),
                opponent_id=str(row["opponent_tricode"]),
                game_date=d_val,
                season=season_name,
                phase=row.get("phase", "regular_season"),
                appearance=row["appearance"],
                minutes_seconds=row["minutes_seconds"],
                points=row["points"],
                field_goal_attempts=int(fga) if fga is not None else None,
                free_throw_attempts=int(fta) if fta is not None else None,
            )
            player_histories.setdefault((season_name, p_game.player_id), []).append(p_game)
            player_outcomes[(p_game.game_id, p_game.player_id)] = p_game

        for g in sched_lookup.values():
            if g.get("phase") == "regular_season":
                d_val = (
                    date.fromisoformat(g["game_date"])
                    if isinstance(g["game_date"], str)
                    else g["game_date"]
                )
                raw_h = str(g.get("home_team_id") or "")
                raw_a = str(g.get("away_team_id") or "")
                h_tri = resolve_team_tricode(raw_h) or raw_h
                a_tri = resolve_team_tricode(raw_a) or raw_a
                g_norm = {**g, "game_date": d_val, "home_team_id": h_tri, "away_team_id": a_tri}
                if h_tri:
                    team_schedules.setdefault((season_name, h_tri), []).append(g_norm)
                if a_tri:
                    team_schedules.setdefault((season_name, a_tri), []).append(g_norm)

        for trow in reconciled["valid_team_rows"]:
            d_val = (
                date.fromisoformat(trow["game_date"])
                if isinstance(trow["game_date"], str)
                else trow["game_date"]
            )
            team_games[(str(trow["game_id"]), str(trow["team_tricode"]))] = {
                **trow,
                "game_date": d_val,
            }

    for games in team_schedules.values():
        games.sort(key=lambda item: item["game_date"])

    for history in player_histories.values():
        history.sort(key=lambda item: item.game_date)

    return player_histories, player_outcomes, team_schedules, team_games


def build_points_candidates(
    config: PointsConfig,
    player_histories: dict[tuple[str, str], list[PointsPlayerGame]],
    player_outcomes: dict[tuple[str, str], PointsPlayerGame],
    team_schedules: dict[tuple[str, str], list[dict[str, Any]]],
    team_games: dict[tuple[str, str], dict[str, Any]],
    allowed_splits: set[str] | None = None,
) -> tuple[
    list[dict[str, Any]],  # feature rows
    list[dict[str, Any]],  # label rows
    list[dict[str, Any]],  # baseline prediction rows
    dict[str, int],  # candidate & label counts
]:
    """Generate candidates, compute point-in-time features and baselines, and resolve labels."""
    dataset_hash = config.dataset.content_sha256
    splits_to_process = allowed_splits or {"t", "v1", "v2", "c", "f"}

    feature_rows: list[dict[str, Any]] = []
    label_rows: list[dict[str, Any]] = []
    baseline_rows: list[dict[str, Any]] = []
    counts: Counter[str] = Counter()

    # Pre-index opponent team games by (season, team_id)
    team_games_by_season_team: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for (_gid, tid), tg in team_games.items():
        s = tg.get("season")
        if s:
            team_games_by_season_team.setdefault((s, tid), []).append(tg)
    for t_list in team_games_by_season_team.values():
        t_list.sort(key=lambda x: x["game_date"])

    # Determine unique game dates per season
    season_game_dates: dict[str, list[date]] = {}
    for (s_name, _), s_list in team_schedules.items():
        season_game_dates.setdefault(s_name, []).extend([g["game_date"] for g in s_list])
    for s_name in season_game_dates:
        season_game_dates[s_name] = sorted(set(season_game_dates[s_name]))

    for (season_name, player_id), p_games in player_histories.items():
        prior_season = PRIOR_SEASON_MAP.get(season_name)
        prior_history = player_histories.get((prior_season, player_id), []) if prior_season else []
        prior_valid_count = len([g for g in prior_history if g.is_valid_history])

        appeared_games = [g for g in p_games if g.appearance == "appeared"]
        if not appeared_games:
            continue
        app_dates = [g.game_date for g in appeared_games]

        for cutoff in season_game_dates.get(season_name, []):
            counts["potential_player_cutoffs"] += 1

            # Most recent appearance strictly before cutoff
            idx = bisect_left(app_dates, cutoff) - 1
            if idx < 0:
                counts["no_prior_team"] += 1
                continue
            last_app = appeared_games[idx]

            # 30-day team association rule
            if (cutoff - last_app.game_date).days > config.eligibility.team_association_days:
                counts["stale_team_association"] += 1
                continue

            # Upcoming regular season game for predicted team in [cutoff, cutoff + horizon]
            team_sched = team_schedules.get((season_name, last_app.team_id), [])
            team_dates = [g["game_date"] for g in team_sched]
            t_idx = bisect_left(team_dates, cutoff)
            if t_idx >= len(team_sched):
                counts["no_target_in_horizon"] += 1
                continue
            target_game = team_sched[t_idx]
            target_date = target_game["game_date"]
            if target_date > cutoff + timedelta(days=config.eligibility.target_horizon_days):
                counts["no_target_in_horizon"] += 1
                continue

            # Check split membership
            split_name = split_for_target_game(config, season_name, target_date)
            if split_name not in splits_to_process:
                continue

            counts["candidate_rows"] += 1

            # Lead-time purging rule: cutoff must not precede the split's start date
            if is_purged_points(config, split_name, cutoff):
                counts[f"purged_{split_name}"] += 1
                continue

            # Target game opponent and home/away status
            is_home = target_game["home_team_id"] == last_app.team_id
            target_opp_id = target_game["away_team_id"] if is_home else target_game["home_team_id"]
            lead_days = (target_date - cutoff).days

            # Eligibility & cohort
            valid_current_count = len(
                [g for g in p_games if g.game_date < cutoff and g.is_valid_history]
            )
            if valid_current_count >= config.eligibility.core_min_history:
                cohort = "core"
            elif (
                config.eligibility.early_season_min_history
                <= valid_current_count
                <= config.eligibility.early_season_max_history
                and prior_valid_count >= config.eligibility.early_season_min_prior_history
            ):
                cohort = "early_season"
            elif (
                config.eligibility.fallback_min_history
                <= valid_current_count
                <= config.eligibility.early_season_max_history
            ):
                cohort = "limited_history_fallback"
            else:
                cohort = "insufficient_history"

            counts[f"{cohort}_rows"] += 1

            # Generate candidate ID
            candidate_id = compute_candidate_id(
                dataset_hash, player_id, cutoff, str(target_game["game_id"])
            )

            # Compute features and baselines for eligible cohorts
            player_features_dict, prior_pts, prior_pts_mean = compute_player_features(
                p_games, prior_history, cutoff, target_date
            )

            opp_games = team_games_by_season_team.get((season_name, target_opp_id), [])
            context_features_dict = compute_context_features(
                is_home=is_home,
                team_schedule=team_sched,
                target_game_id=str(target_game["game_id"]),
                target_game_date=target_date,
                opponent_prior_games=opp_games,
                cutoff=cutoff,
            )

            all_features = {
                "candidate_id": candidate_id,
                "split": split_name,
                "season": season_name,
                "player_id": player_id,
                "predicted_team_id": last_app.team_id,
                "target_game_id": str(target_game["game_id"]),
                "target_game_date": target_date,
                "target_opponent_id": target_opp_id,
                "replay_date": cutoff,
                "cohort": cohort,
                **player_features_dict,
                **context_features_dict,
            }
            feat_hash = compute_points_feature_hash(all_features)
            feature_rows.append({**all_features, "feature_hash": feat_hash})

            # Baselines
            b_rolling = current_rolling_mean(
                prior_pts,
                window=config.baselines["rolling_mean"].window or 10,
                min_appearances=config.baselines["rolling_mean"].min_appearances or 5,
                previous_season_mean=prior_pts_mean,
            )
            b_ewma = current_ewma(
                prior_pts,
                window=config.baselines["ewma_20_hl5"].window or 20,
                half_life=config.baselines["ewma_20_hl5"].half_life_appearances or 5.0,
                min_appearances=config.baselines["ewma_20_hl5"].min_appearances or 5,
                previous_season_mean=prior_pts_mean,
            )
            b_prior_blend = season_prior_blend(
                prior_pts,
                previous_season_mean=prior_pts_mean,
                blend_threshold=config.baselines["prior_blend"].blend_threshold or 10,
                blend_weight=config.baselines["prior_blend"].blend_weight or 10.0,
                ewma_window=config.baselines["prior_blend"].ewma_window or 20,
                ewma_half_life=config.baselines["prior_blend"].ewma_half_life or 5.0,
            )

            # Slices
            n_curr = len(prior_pts)
            curr_slice = (
                "1_to_4"
                if n_curr < 5
                else "5_to_9"
                if n_curr < 10
                else "10_to_19"
                if n_curr < 20
                else "20_to_39"
                if n_curr < 40
                else "40_plus"
            )
            min_mean = player_features_dict["last_10_minutes_mean"]
            min_slice = (
                "<15"
                if (min_mean is not None and min_mean < 15)
                else "15_<28"
                if (min_mean is not None and min_mean < 28)
                else ">=28"
            )
            lead_slice = "0" if lead_days == 0 else "1_to_3" if lead_days <= 3 else "4_to_6"
            opp_slice = (
                "missing" if context_features_dict["opponent_context_missing"] else "complete"
            )
            t_rest = context_features_dict["team_rest_days_capped_30"]
            rest_slice = (
                "back_to_back"
                if t_rest == 0
                else "1_day"
                if t_rest == 1
                else "2_to_3_days"
                if (t_rest is not None and t_rest <= 3)
                else "4_plus_days"
            )

            # Check if player changed observed team earlier in the same season
            teams_seen = {g.team_id for g in p_games if g.game_date < cutoff}
            team_change_slice = "changed" if len(teams_seen) > 1 else "same"

            slices = {
                "current_appearances_slice": curr_slice,
                "prior_season_eligibility": "eligible"
                if (prior_valid_count >= 20)
                else "not_eligible",
                "prior_minutes_slice": min_slice,
                "team_rest_slice": rest_slice,
                "lead_days_slice": lead_slice,
                "opponent_context_slice": opp_slice,
                "season_slice": season_name,
                "team_changed_slice": team_change_slice,
            }

            baseline_rows.append(
                {
                    "candidate_id": candidate_id,
                    "split": split_name,
                    "season": season_name,
                    "player_id": player_id,
                    "target_game_id": str(target_game["game_id"]),
                    "cohort": cohort,
                    "rolling_mean": b_rolling,
                    "ewma_20_hl5": b_ewma,
                    "prior_blend": b_prior_blend,
                    **slices,
                }
            )

            # Resolve outcome & label
            outcome = player_outcomes.get((str(target_game["game_id"]), player_id))
            if outcome is None:
                label_status = "unmatched_or_unknown"
                actual = None
            elif outcome.team_id != last_app.team_id:
                label_status = "team_mismatch"
                actual = None
            elif outcome.appearance == "reported_nonappearance":
                label_status = "explicit_nonappearance"
                actual = None
            elif outcome.appearance != "appeared":
                label_status = "unknown_appearance"
                actual = None
            elif outcome.minutes_seconds is None or outcome.minutes_seconds <= 0:
                label_status = "unconfirmed_zero_minutes"
                actual = None
            elif outcome.points is None or outcome.points < 0:
                label_status = "excluded_incomplete_label"
                actual = None
            else:
                label_status = "scored"
                actual = float(outcome.points)

            counts[f"label_{label_status}"] += 1
            label_rows.append(
                {
                    "candidate_id": candidate_id,
                    "label_status": label_status,
                    "actual_points": actual,
                }
            )

    feature_rows.sort(key=lambda r: r["candidate_id"])
    label_rows.sort(key=lambda r: r["candidate_id"])
    baseline_rows.sort(key=lambda r: r["candidate_id"])

    return feature_rows, label_rows, baseline_rows, dict(sorted(counts.items()))
