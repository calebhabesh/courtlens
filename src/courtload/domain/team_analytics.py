"""Domain models, pure mathematical functions, and schedule/factor algorithms for team analytics.

Implements Block B15:
- Dean Oliver Four Factors (eFG%, TOV%, ORB%, FTR) for offense and defense.
- Box-score estimated possessions, tempo/pace, and offensive/defensive/net ratings.
- League-wide context, rankings (high-is-good vs low-is-good), and empirical percentiles.
- Three-point variation scenario (Feature F18: what-if accounting holding volume constant).
- Canonical schedule context, rest days, back-to-backs, and venue streaks strictly prior to cutoff.
- Historical team similarity / peers using standardized Euclidean distance.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any

# --- Pure Mathematical Functions ---


def compute_estimated_possessions(
    fga: float,
    fta: float,
    oreb: float,
    tov: float,
) -> float:
    """Conventional box-score possession estimate: FGA + 0.44 * FTA - OREB + TOV.

    Notice: This is a conventional box-score estimate and is distinct from
    reconstructed play-by-play possessions (replica contract line 75).
    """
    raw = fga + 0.44 * fta - oreb + tov
    return max(0.0, round(raw, 2))


def compute_team_pace(
    possessions: float,
    games_played: int,
    total_minutes: float | None = None,
) -> float:
    """Conventional pace estimate normalized to 48 minutes.

    If total_minutes is provided (e.g. from player seconds / 5), uses:
    48.0 * (possessions / (total_minutes / 5.0)).
    Otherwise assumes 48 regulation minutes per game: possessions / games_played.
    """
    if total_minutes is not None and total_minutes > 0:
        game_mins = total_minutes / 5.0
        return round(48.0 * (possessions / game_mins), 2)
    if games_played > 0:
        return round(possessions / games_played, 2)
    return 0.0


def compute_offensive_rating(points: float, possessions: float) -> float | None:
    """Points scored per 100 estimated possessions."""
    if possessions <= 0:
        return None
    return round(100.0 * points / possessions, 2)


def compute_defensive_rating(opp_points: float, opp_possessions: float) -> float | None:
    """Points allowed per 100 estimated opponent possessions."""
    if opp_possessions <= 0:
        return None
    return round(100.0 * opp_points / opp_possessions, 2)


def compute_net_rating(off_rating: float | None, def_rating: float | None) -> float | None:
    """Offensive rating minus defensive rating."""
    if off_rating is None or def_rating is None:
        return None
    return round(off_rating - def_rating, 2)


def compute_efg_pct(fgm: float, fg3m: float, fga: float) -> float | None:
    """Effective Field Goal Percentage: (FGM + 0.5 * 3PM) / FGA."""
    if fga <= 0:
        return None
    return round((fgm + 0.5 * fg3m) / fga, 4)


def compute_tov_pct(tov: float, fga: float, fta: float) -> float | None:
    """Turnover Percentage: TOV / (FGA + 0.44 * FTA + TOV)."""
    denom = fga + 0.44 * fta + tov
    if denom <= 0:
        return None
    return round(tov / denom, 4)


def compute_oreb_pct(oreb: float, opp_dreb: float) -> float | None:
    """Offensive Rebound Percentage: OREB / (OREB + Opp_DREB)."""
    denom = oreb + opp_dreb
    if denom <= 0:
        return None
    return round(oreb / denom, 4)


def compute_dreb_pct(dreb: float, opp_oreb: float) -> float | None:
    """Defensive Rebound Percentage: DREB / (DREB + Opp_OREB)."""
    denom = dreb + opp_oreb
    if denom <= 0:
        return None
    return round(dreb / denom, 4)


def compute_ftr(fta: float, fga: float) -> float | None:
    """Free Throw Rate: FTA / FGA."""
    if fga <= 0:
        return None
    return round(fta / fga, 4)


# --- Dean Oliver Four Factors Calculation ---


FOUR_FACTOR_METRIC_CONFIG: dict[str, dict[str, Any]] = {
    "efg_pct": {
        "display_name": "Effective FG %",
        "factor": "shooting",
        "weight": 0.40,
        "side": "offense",
        "good_direction": "high",
        "unit": "percentage",
        "formula": "(FGM + 0.5 * 3PM) / FGA",
    },
    "tov_pct": {
        "display_name": "Turnover %",
        "factor": "turnovers",
        "weight": 0.25,
        "side": "offense",
        "good_direction": "low",
        "unit": "percentage",
        "formula": "TOV / (FGA + 0.44 * FTA + TOV)",
    },
    "oreb_pct": {
        "display_name": "Offensive Rebound %",
        "factor": "rebounding",
        "weight": 0.20,
        "side": "offense",
        "good_direction": "high",
        "unit": "percentage",
        "formula": "OREB / (OREB + Opp_DREB)",
    },
    "ftr": {
        "display_name": "Free Throw Rate",
        "factor": "free_throws",
        "weight": 0.15,
        "side": "offense",
        "good_direction": "high",
        "unit": "ratio",
        "formula": "FTA / FGA",
    },
    "opp_efg_pct": {
        "display_name": "Opponent Effective FG %",
        "factor": "shooting",
        "weight": 0.40,
        "side": "defense",
        "good_direction": "low",
        "unit": "percentage",
        "formula": "(Opp_FGM + 0.5 * Opp_3PM) / Opp_FGA",
    },
    "opp_tov_pct": {
        "display_name": "Opponent Turnover % (Forced)",
        "factor": "turnovers",
        "weight": 0.25,
        "side": "defense",
        "good_direction": "high",
        "unit": "percentage",
        "formula": "Opp_TOV / (Opp_FGA + 0.44 * Opp_FTA + Opp_TOV)",
    },
    "dreb_pct": {
        "display_name": "Defensive Rebound %",
        "factor": "rebounding",
        "weight": 0.20,
        "side": "defense",
        "good_direction": "high",
        "unit": "percentage",
        "formula": "DREB / (DREB + Opp_OREB)",
    },
    "opp_oreb_pct": {
        "display_name": "Opponent Offensive Rebound % (Allowed)",
        "factor": "rebounding",
        "weight": 0.20,
        "side": "defense",
        "good_direction": "low",
        "unit": "percentage",
        "formula": "Opp_OREB / (Opp_OREB + DREB)",
    },
    "opp_ftr": {
        "display_name": "Opponent Free Throw Rate",
        "factor": "free_throws",
        "weight": 0.15,
        "side": "defense",
        "good_direction": "low",
        "unit": "ratio",
        "formula": "Opp_FTA / Opp_FGA",
    },
    "off_rating": {
        "display_name": "Offensive Rating",
        "factor": "efficiency",
        "weight": None,
        "side": "overall",
        "good_direction": "high",
        "unit": "rating",
        "formula": "100 * PTS / Possessions",
    },
    "def_rating": {
        "display_name": "Defensive Rating",
        "factor": "efficiency",
        "weight": None,
        "side": "overall",
        "good_direction": "low",
        "unit": "rating",
        "formula": "100 * Opp_PTS / Opp_Possessions",
    },
    "net_rating": {
        "display_name": "Net Rating",
        "factor": "efficiency",
        "weight": None,
        "side": "overall",
        "good_direction": "high",
        "unit": "rating",
        "formula": "Off_Rating - Def_Rating",
    },
    "pace": {
        "display_name": "Pace",
        "factor": "tempo",
        "weight": None,
        "side": "overall",
        "good_direction": "high",
        "unit": "possessions",
        "formula": "Possessions per 48 Minutes",
    },
}


def compute_team_four_factors(
    team_totals: dict[str, float],
    opp_totals: dict[str, float],
    games_played: int,
    total_minutes: float | None = None,
) -> dict[str, Any]:
    """Compute Dean Oliver Four Factors, possessions, pace, and ratings from aggregated totals.

    Args:
        team_totals: Aggregated box-score counts for the team.
        opp_totals: Aggregated box-score counts for opponents.
        games_played: Number of completed games observed.
        total_minutes: Sum of team minutes played across games (optional).
    """
    fgm = team_totals.get("field_goals_made", 0.0)
    fga = team_totals.get("field_goals_attempted", 0.0)
    fg3m = team_totals.get("three_pointers_made", 0.0)
    fg3a = team_totals.get("three_pointers_attempted", 0.0)
    ftm = team_totals.get("free_throws_made", 0.0)
    fta = team_totals.get("free_throws_attempted", 0.0)
    oreb = team_totals.get("rebounds_offensive", 0.0)
    dreb = team_totals.get("rebounds_defensive", 0.0)
    tov = team_totals.get("turnovers", 0.0)
    pts = team_totals.get("points", 0.0)

    opp_fgm = opp_totals.get("field_goals_made", 0.0)
    opp_fga = opp_totals.get("field_goals_attempted", 0.0)
    opp_fg3m = opp_totals.get("three_pointers_made", 0.0)
    opp_fg3a = opp_totals.get("three_pointers_attempted", 0.0)
    opp_ftm = opp_totals.get("free_throws_made", 0.0)
    opp_fta = opp_totals.get("free_throws_attempted", 0.0)
    opp_oreb = opp_totals.get("rebounds_offensive", 0.0)
    opp_dreb = opp_totals.get("rebounds_defensive", 0.0)
    opp_tov = opp_totals.get("turnovers", 0.0)
    opp_pts = opp_totals.get("points", 0.0)

    # Conventional shooting percentages
    fg_pct = round(fgm / fga, 4) if fga > 0 else None
    fg3_pct = round(fg3m / fg3a, 4) if fg3a > 0 else None
    ft_pct = round(ftm / fta, 4) if fta > 0 else None

    opp_fg_pct = round(opp_fgm / opp_fga, 4) if opp_fga > 0 else None
    opp_fg3_pct = round(opp_fg3m / opp_fg3a, 4) if opp_fg3a > 0 else None
    opp_ft_pct = round(opp_ftm / opp_fta, 4) if opp_fta > 0 else None

    # Offense Four Factors
    efg_pct = compute_efg_pct(fgm, fg3m, fga)
    tov_pct = compute_tov_pct(tov, fga, fta)
    oreb_pct = compute_oreb_pct(oreb, opp_dreb)
    ftr = compute_ftr(fta, fga)

    # Defense Four Factors
    opp_efg_pct = compute_efg_pct(opp_fgm, opp_fg3m, opp_fga)
    opp_tov_pct = compute_tov_pct(opp_tov, opp_fga, opp_fta)
    dreb_pct = compute_dreb_pct(dreb, opp_oreb)
    opp_oreb_pct = compute_oreb_pct(opp_oreb, dreb)
    opp_ftr = compute_ftr(opp_fta, opp_fga)

    # Possessions, Pace, Ratings
    team_poss = compute_estimated_possessions(fga, fta, oreb, tov)
    opp_poss = compute_estimated_possessions(opp_fga, opp_fta, opp_oreb, opp_tov)
    pace = compute_team_pace(team_poss, games_played, total_minutes)

    off_rating = compute_offensive_rating(pts, team_poss)
    def_rating = compute_defensive_rating(opp_pts, opp_poss)
    net_rating = compute_net_rating(off_rating, def_rating)

    return {
        "games_played": games_played,
        # Shooting & Volume
        "fg_pct": fg_pct,
        "fg3_pct": fg3_pct,
        "ft_pct": ft_pct,
        "opp_fg_pct": opp_fg_pct,
        "opp_fg3_pct": opp_fg3_pct,
        "opp_ft_pct": opp_ft_pct,
        # Offense Four Factors
        "efg_pct": efg_pct,
        "tov_pct": tov_pct,
        "oreb_pct": oreb_pct,
        "ftr": ftr,
        # Defense Four Factors
        "opp_efg_pct": opp_efg_pct,
        "opp_tov_pct": opp_tov_pct,
        "dreb_pct": dreb_pct,
        "opp_oreb_pct": opp_oreb_pct,
        "opp_ftr": opp_ftr,
        # Possessions & Ratings
        "possessions_estimated": team_poss,
        "opp_possessions_estimated": opp_poss,
        "pace": pace,
        "off_rating": off_rating,
        "def_rating": def_rating,
        "net_rating": net_rating,
        # Raw totals
        "totals": {
            "points": pts,
            "field_goals_made": fgm,
            "field_goals_attempted": fga,
            "three_pointers_made": fg3m,
            "three_pointers_attempted": fg3a,
            "free_throws_made": ftm,
            "free_throws_attempted": fta,
            "rebounds_offensive": oreb,
            "rebounds_defensive": dreb,
            "turnovers": tov,
        },
        "opponent_totals": {
            "points": opp_pts,
            "field_goals_made": opp_fgm,
            "field_goals_attempted": opp_fga,
            "three_pointers_made": opp_fg3m,
            "three_pointers_attempted": opp_fg3a,
            "free_throws_made": opp_ftm,
            "free_throws_attempted": opp_fta,
            "rebounds_offensive": opp_oreb,
            "rebounds_defensive": opp_dreb,
            "turnovers": opp_tov,
        },
    }


# --- League Context & Rankings Computation ---


def compute_league_rankings(
    all_team_factors: dict[str, dict[str, Any]],
) -> tuple[dict[str, float], dict[str, dict[str, dict[str, Any]]]]:
    """Compute league-wide averages, ranks (1..N), and empirical percentiles across all teams.

    Returns:
        tuple of (league_averages, team_rankings_by_team)
    """
    total_teams = len(all_team_factors)
    if total_teams == 0:
        return {}, {}

    # 1. Compute League Averages for each metric
    league_averages: dict[str, float] = {}
    for metric_key in FOUR_FACTOR_METRIC_CONFIG:
        valid_vals = [
            factors[metric_key]
            for factors in all_team_factors.values()
            if factors.get(metric_key) is not None
        ]
        if valid_vals:
            league_averages[metric_key] = round(sum(valid_vals) / len(valid_vals), 4)

    # 2. Compute Ranks and Percentiles for each team and metric
    team_rankings: dict[str, dict[str, dict[str, Any]]] = {tid: {} for tid in all_team_factors}

    for metric_key, cfg in FOUR_FACTOR_METRIC_CONFIG.items():
        good_dir = cfg["good_direction"]  # "high" or "low"

        # Collect valid (team_id, value)
        valid_pairs: list[tuple[str, float]] = []
        for tid, factors in all_team_factors.items():
            val = factors.get(metric_key)
            if val is not None:
                valid_pairs.append((tid, float(val)))

        n_valid = len(valid_pairs)
        if n_valid == 0:
            continue

        # Sort pairs best-to-worst:
        # If good_direction == "high": highest value is rank 1.
        # If good_direction == "low": lowest value is rank 1.
        # Stable secondary sort on team_id.
        if good_dir == "high":
            valid_pairs.sort(key=lambda x: (-x[1], x[0]))
        else:
            valid_pairs.sort(key=lambda x: (x[1], x[0]))

        # Assign ranks (1-indexed) and percentiles
        for rank_idx, (tid, val) in enumerate(valid_pairs, start=1):
            # Compute empirical percentile:
            # count_worse is the number of teams with worse performance
            if good_dir == "high":
                count_worse = sum(1 for _, v in valid_pairs if v < val)
                count_equal = sum(1 for _, v in valid_pairs if v == val)
            else:
                count_worse = sum(1 for _, v in valid_pairs if v > val)
                count_equal = sum(1 for _, v in valid_pairs if v == val)

            pctile = (
                round(100.0 * (count_worse + 0.5 * count_equal) / n_valid, 1)
                if n_valid > 1
                else 50.0
            )

            team_rankings[tid][metric_key] = {
                "rank": rank_idx,
                "percentile": pctile,
                "total_teams": n_valid,
                "league_avg": league_averages.get(metric_key),
                "good_direction": good_dir,
            }

    return league_averages, team_rankings


# --- Three-Point Variation Scenario (Feature F18) ---


def compute_three_point_variation(
    observed_fg3m: float,
    observed_fg3a: float,
    points_total: float,
    possessions: float,
    games_played: int,
    def_rating: float | None,
    league_3p_pct: float,
) -> dict[str, Any]:
    """Calculate the hypothetical scoring outcome if observed 3PA converted at league-average rate.

    This what-if accounting scenario holds observed 3PA and all other terms constant.
    It is not a causal claim of luck removal or a projected forecast (contract line 107).
    """
    obs_3p_pct = round(observed_fg3m / observed_fg3a, 4) if observed_fg3a > 0 else 0.0
    hypothetical_fg3m = round(observed_fg3a * league_3p_pct, 1)
    delta_fg3m = hypothetical_fg3m - observed_fg3m
    delta_points = round(delta_fg3m * 3.0, 1)

    hypothetical_points = round(points_total + delta_points, 1)
    actual_ppg = round(points_total / games_played, 1) if games_played > 0 else 0.0
    hypothetical_ppg = round(hypothetical_points / games_played, 1) if games_played > 0 else 0.0

    actual_ortg = compute_offensive_rating(points_total, possessions)
    hyp_ortg = compute_offensive_rating(hypothetical_points, possessions)
    delta_ortg = (
        round(hyp_ortg - actual_ortg, 2)
        if hyp_ortg is not None and actual_ortg is not None
        else None
    )

    actual_net = compute_net_rating(actual_ortg, def_rating)
    hyp_net = compute_net_rating(hyp_ortg, def_rating)
    delta_net = (
        round(hyp_net - actual_net, 2) if hyp_net is not None and actual_net is not None else None
    )

    return {
        "observed_fg3m": observed_fg3m,
        "observed_fg3a": observed_fg3a,
        "observed_3p_pct": obs_3p_pct,
        "league_3p_pct": league_3p_pct,
        "hypothetical_fg3m": hypothetical_fg3m,
        "delta_points": delta_points,
        "actual_ppg": actual_ppg,
        "hypothetical_ppg": hypothetical_ppg,
        "actual_off_rating": actual_ortg,
        "hypothetical_off_rating": hyp_ortg,
        "delta_off_rating": delta_ortg,
        "actual_net_rating": actual_net,
        "hypothetical_net_rating": hyp_net,
        "delta_net_rating": delta_net,
        "disclaimer": (
            "Three-point variation scenario replaces observed 3PM with (3PA * league_3p_pct) "
            "holding shot volume and attempts fixed. It is an analytical what-if accounting "
            "exercise, never a claim that shooting variance was caused by luck or that "
            "regression is assured."
        ),
    }


# --- Team Schedule Context & Rest Calculation ---


def categorize_rest_bucket(rest_days: int | None) -> str:
    """Categorize rest days into standard NBA analytical buckets."""
    if rest_days is None:
        return "unknown"
    if rest_days == 0:
        return "0_days_rest"  # Back-to-back
    if rest_days == 1:
        return "1_day_rest"
    if rest_days == 2:
        return "2_days_rest"
    return "3+_days_rest"


def compute_team_schedule_context(
    games: list[dict[str, Any]],
) -> dict[str, Any]:
    """Compute chronological schedule, rest days, back-to-backs, and streaks prior to cutoff.

    Args:
        games: List of team games sorted chronologically by (game_date, game_id).
    """
    if not games:
        return {
            "overall_record": {
                "games_played": 0,
                "wins": 0,
                "losses": 0,
                "win_pct": None,
                "differential": 0.0,
                "current_streak": None,
            },
            "home_split": {
                "games_played": 0,
                "wins": 0,
                "losses": 0,
                "win_pct": None,
                "ppg": None,
                "opp_ppg": None,
                "differential": 0.0,
            },
            "away_split": {
                "games_played": 0,
                "wins": 0,
                "losses": 0,
                "win_pct": None,
                "ppg": None,
                "opp_ppg": None,
                "differential": 0.0,
            },
            "rest_splits": [],
            "back_to_back_summary": {
                "second_leg_games": {"games": 0, "wins": 0, "losses": 0, "win_pct": None},
                "first_leg_games": {"games": 0, "wins": 0, "losses": 0, "win_pct": None},
            },
            "longest_homestand": 0,
            "longest_road_trip": 0,
            "games": [],
        }

    # Ensure chronological sort
    sorted_games = sorted(games, key=lambda x: (x["game_date"], x["game_id"]))

    processed_games: list[dict[str, Any]] = []
    prev_date: date | None = None
    active_streak_kind: str | None = None  # "W" or "L"
    active_streak_count = 0
    active_venue_kind: str | None = None  # "home" or "away"
    active_venue_count = 0

    longest_home = 0
    longest_away = 0

    for _i, g in enumerate(sorted_games):
        g_date = g["game_date"]
        side = g.get("side", "home")
        pts = g.get("points")
        opp_pts = g.get("opponent_points")

        # Win / Loss / Margin
        is_win = None
        result = None
        diff = None
        if pts is not None and opp_pts is not None:
            is_win = pts > opp_pts
            result = "W" if is_win else "L"
            diff = pts - opp_pts

        # Rest days: calendar date difference minus 1
        rest_days = None
        if prev_date is not None:
            delta = (g_date - prev_date).days - 1
            rest_days = max(0, delta)

        is_b2b = rest_days == 0
        bucket = categorize_rest_bucket(rest_days)

        # Streaks
        if result is not None:
            if result == active_streak_kind:
                active_streak_count += 1
            else:
                active_streak_kind = result
                active_streak_count = 1
            streak_str = f"{active_streak_kind}{active_streak_count}"
        else:
            streak_str = None

        # Venue streak
        if side == active_venue_kind:
            active_venue_count += 1
        else:
            active_venue_kind = side
            active_venue_count = 1
        venue_str = f"{'Home' if side == 'home' else 'Road'} {active_venue_count}"

        if side == "home":
            longest_home = max(longest_home, active_venue_count)
        else:
            longest_away = max(longest_away, active_venue_count)

        processed_games.append(
            {
                "game_id": g["game_id"],
                "game_date": g_date.isoformat() if isinstance(g_date, date) else str(g_date),
                "side": side,
                "opponent_id": g.get("opponent_id"),
                "opponent_tricode": g.get("opponent_tricode", g.get("opponent_id")),
                "opponent_name": g.get("opponent_name", g.get("opponent_id")),
                "team_points": pts,
                "opponent_points": opp_pts,
                "differential": diff,
                "is_win": is_win,
                "result": result,
                "rest_days": rest_days,
                "is_back_to_back": is_b2b,
                "rest_bucket": bucket,
                "streak": streak_str,
                "venue_streak": venue_str,
            }
        )

        prev_date = g_date

    # Determine first-leg of back-to-back games (next game on following calendar day)
    first_leg_indices: set[int] = set()
    for idx in range(len(sorted_games) - 1):
        cur_d = sorted_games[idx]["game_date"]
        next_d = sorted_games[idx + 1]["game_date"]
        if (next_d - cur_d).days == 1:
            first_leg_indices.add(idx)

    # Calculate splits
    def _calc_record_split(sub_games: list[dict[str, Any]]) -> dict[str, Any]:
        gp = len(sub_games)
        wins = sum(1 for sg in sub_games if sg["is_win"] is True)
        losses = sum(1 for sg in sub_games if sg["is_win"] is False)
        wp = round(wins / gp, 3) if gp > 0 else None
        pts_for = sum(sg["team_points"] for sg in sub_games if sg["team_points"] is not None)
        pts_against = sum(
            sg["opponent_points"] for sg in sub_games if sg["opponent_points"] is not None
        )
        return {
            "games_played": gp,
            "wins": wins,
            "losses": losses,
            "win_pct": wp,
            "ppg": round(pts_for / gp, 1) if gp > 0 else None,
            "opp_ppg": round(pts_against / gp, 1) if gp > 0 else None,
            "differential": round(pts_for - pts_against, 1),
        }

    overall = _calc_record_split(processed_games)
    overall["current_streak"] = processed_games[-1]["streak"] if processed_games else None

    home_games = [g for g in processed_games if g["side"] == "home"]
    away_games = [g for g in processed_games if g["side"] == "away"]
    home_split = _calc_record_split(home_games)
    away_split = _calc_record_split(away_games)

    # Rest splits
    rest_splits: list[dict[str, Any]] = []
    bucket_labels = {
        "0_days_rest": "0 Days (Back-to-Back)",
        "1_day_rest": "1 Day Rest",
        "2_days_rest": "2 Days Rest",
        "3+_days_rest": "3+ Days Rest",
    }
    for b_key, b_label in bucket_labels.items():
        b_games = [g for g in processed_games if g["rest_bucket"] == b_key]
        split_data = _calc_record_split(b_games)
        split_data["bucket_key"] = b_key
        split_data["bucket_label"] = b_label
        rest_splits.append(split_data)

    # Back-to-Back Summary
    second_leg_games = [g for g in processed_games if g["is_back_to_back"]]
    second_leg_split = _calc_record_split(second_leg_games)

    first_leg_list = [processed_games[idx] for idx in first_leg_indices]
    first_leg_split = _calc_record_split(first_leg_list)

    return {
        "overall_record": overall,
        "home_split": home_split,
        "away_split": away_split,
        "rest_splits": rest_splits,
        "back_to_back_summary": {
            "second_leg_games": {
                "games": second_leg_split["games_played"],
                "wins": second_leg_split["wins"],
                "losses": second_leg_split["losses"],
                "win_pct": second_leg_split["win_pct"],
            },
            "first_leg_games": {
                "games": first_leg_split["games_played"],
                "wins": first_leg_split["wins"],
                "losses": first_leg_split["losses"],
                "win_pct": first_leg_split["win_pct"],
            },
        },
        "longest_homestand": longest_home,
        "longest_road_trip": longest_away,
        "games": processed_games,
    }


# --- Historical Team Similarity / Peers ---


DEFAULT_SIMILARITY_DIMENSIONS = [
    "efg_pct",
    "tov_pct",
    "oreb_pct",
    "ftr",
    "opp_efg_pct",
    "opp_tov_pct",
    "dreb_pct",
    "opp_ftr",
    "pace",
    "off_rating",
    "def_rating",
]


def compute_team_similarity(
    target_team_id: str,
    all_team_factors: dict[str, dict[str, Any]],
    dimensions: list[str] | None = None,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """Compute statistical peer teams using standardized Euclidean distance.

    Args:
        target_team_id: The team to compare against.
        all_team_factors: Mapping of candidate_team_id -> factors dictionary.
        dimensions: Features to include (defaults to 8 four factors + pace + ORTG + DRTG).
        limit: Max number of top peers to return.
    """
    dims = dimensions or DEFAULT_SIMILARITY_DIMENSIONS
    target_factors = all_team_factors.get(target_team_id)
    if not target_factors:
        return []

    # 1. Compute mean and population standard deviation for each dimension across cohort
    cohort_stats: dict[str, tuple[float, float]] = {}
    active_dims: list[str] = []

    for d in dims:
        vals = [float(f[d]) for f in all_team_factors.values() if f.get(d) is not None]
        if len(vals) < 2:
            continue
        mean_val = sum(vals) / len(vals)
        variance = sum((v - mean_val) ** 2 for v in vals) / len(vals)
        std_val = math.sqrt(variance)

        # Exclude zero-variance dimensions
        if std_val > 1e-6 and target_factors.get(d) is not None:
            cohort_stats[d] = (mean_val, std_val)
            active_dims.append(d)

    if len(active_dims) < 4:
        return []

    # 2. Standardize target team
    target_z: dict[str, float] = {}
    for d in active_dims:
        mean_val, std_val = cohort_stats[d]
        target_z[d] = (float(target_factors[d]) - mean_val) / std_val

    # 3. Compute Euclidean distance for all other teams
    peers: list[dict[str, Any]] = []
    for cand_id, cand_factors in all_team_factors.items():
        if cand_id == target_team_id:
            continue

        # Check overlapping valid dimensions
        sq_diffs: list[float] = []
        dim_diffs: dict[str, Any] = {}
        for d in active_dims:
            cand_val = cand_factors.get(d)
            if cand_val is not None:
                mean_val, std_val = cohort_stats[d]
                cand_z = (float(cand_val) - mean_val) / std_val
                diff = target_z[d] - cand_z
                sq_diffs.append(diff**2)
                dim_diffs[d] = {
                    "target_value": target_factors[d],
                    "candidate_value": cand_val,
                    "target_z": round(target_z[d], 2),
                    "candidate_z": round(cand_z, 2),
                    "z_diff": round(diff, 2),
                }

        if len(sq_diffs) == len(active_dims):
            distance = round(math.sqrt(sum(sq_diffs) / len(sq_diffs)), 3)
            # Normalized similarity score in (0, 1]
            similarity_score = round(1.0 / (1.0 + distance), 3)

            peers.append(
                {
                    "team_id": cand_id,
                    "distance": distance,
                    "similarity_score": similarity_score,
                    "dimensions_used": active_dims,
                    "dimension_diffs": dim_diffs,
                }
            )

    # Sort nearest first (distance ascending, team_id ascending for stability)
    peers.sort(key=lambda p: (p["distance"], p["team_id"]))
    return peers[:limit]
