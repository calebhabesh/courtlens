"""Service implementations for Block B12 analytical operations.

Handles period comparisons, distribution quantiles, contextual splits, opponent allowance,
statistical peers (similarity), and analytical rank operations.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from courtload.domain.analytical_ops import (
    INITIAL_SIMILARITY_DIMENSIONS,
    CohortSummary,
    ComparePeriodsRequest,
    ComparePeriodsResponse,
    DimensionStats,
    DistributionMeasure,
    DistributionRequest,
    DistributionResponse,
    DistributionSamplePoint,
    DistributionSummary,
    MetricDelta,
    OpponentContextRequest,
    OpponentContextResponse,
    PeerMatchItem,
    PeriodMode,
    PeriodSummary,
    RankOperationItem,
    RankOperationRequest,
    RankOperationResponse,
    SplitBucketSummary,
    SplitProfileRequest,
    SplitProfileResponse,
    SplitType,
    StatisticalPeersRequest,
    StatisticalPeersResponse,
    TargetPlayerProfile,
    TeamDefensiveAllowance,
    calculate_calendar_gap,
    categorize_rest_bucket,
    compute_distribution_summary,
    compute_period_delta,
    compute_population_sd,
)
from courtload.domain.metrics import METRIC_CATALOG
from courtload.domain.query_spec import (
    QuerySpec,
    SampleFilter,
    WindowKind,
    WindowSpec,
)
from courtload.domain.teams import get_team_info, resolve_team_tricode
from courtload.services.stats_engine import export_stats_query
from courtload.services.workbench_analytics import (
    _load_player_games,
    _load_team_games,
    canonical_hash,
    resolve_workbench_context,
)

CORE_COMPARE_METRICS = [
    "pts",
    "pts_per_game",
    "pts_per_36",
    "reb",
    "reb_per_game",
    "reb_per_36",
    "ast",
    "ast_per_game",
    "ast_per_36",
    "stl",
    "stl_per_game",
    "blk",
    "blk_per_game",
    "tov",
    "tov_per_game",
    "fg_pct",
    "fg3_pct",
    "ft_pct",
    "ts_pct",
    "efg_pct",
    "ftr",
    "min_per_game",
]


def _summarize_appearance_slice(
    label: str,
    mode: PeriodMode,
    games: list[dict[str, Any]],
    start_date: str | None = None,
    end_date: str | None = None,
) -> PeriodSummary:
    """Summarize an appearance slice with strict valid sample counts and paired rates."""
    n = len(games)
    stints = sorted(
        {resolve_team_tricode(str(g.get("team_id") or "")) for g in games if g.get("team_id")}
    )

    tot_sec = sum(int(g.get("minutes_seconds") or 0) for g in games)
    tot_min = round(tot_sec / 60.0, 1)
    min_pg = round(tot_min / n, 1) if n > 0 else None

    # Track raw sums and valid sample counts
    metric_values: dict[str, float | None] = {}
    sample_counts: dict[str, int] = {}

    def _accumulate(key: str) -> tuple[float, int]:
        valid = [float(g[key]) for g in games if g.get(key) is not None]
        return sum(valid), len(valid)

    # Box score counts
    pts_sum, pts_n = _accumulate("points")
    reb_sum, reb_n = _accumulate("rebounds_total")
    ast_sum, ast_n = _accumulate("assists")
    stl_sum, stl_n = _accumulate("steals")
    blk_sum, blk_n = _accumulate("blocks")
    tov_sum, tov_n = _accumulate("turnovers")
    oreb_sum, oreb_n = _accumulate("rebounds_offensive")
    dreb_sum, dreb_n = _accumulate("rebounds_defensive")
    pf_sum, pf_n = _accumulate("fouls_personal")

    # Shooting pairs
    fg_games = [
        g
        for g in games
        if g.get("field_goals_made") is not None and g.get("field_goals_attempted") is not None
    ]
    fgm_sum = sum(float(g["field_goals_made"]) for g in fg_games)
    fga_sum = sum(float(g["field_goals_attempted"]) for g in fg_games)
    fg_n = len(fg_games)

    fg3_games = [
        g
        for g in games
        if g.get("three_pointers_made") is not None
        and g.get("three_pointers_attempted") is not None
    ]
    fg3m_sum = sum(float(g["three_pointers_made"]) for g in fg3_games)
    fg3a_sum = sum(float(g["three_pointers_attempted"]) for g in fg3_games)
    fg3_n = len(fg3_games)

    ft_games = [
        g
        for g in games
        if g.get("free_throws_made") is not None and g.get("free_throws_attempted") is not None
    ]
    ftm_sum = sum(float(g["free_throws_made"]) for g in ft_games)
    fta_sum = sum(float(g["free_throws_attempted"]) for g in ft_games)
    ft_n = len(ft_games)

    # TS pair: points, fga, fta
    ts_games = [
        g
        for g in games
        if g.get("points") is not None
        and g.get("field_goals_attempted") is not None
        and g.get("free_throws_attempted") is not None
    ]
    ts_pts = sum(float(g["points"]) for g in ts_games)
    ts_fga = sum(float(g["field_goals_attempted"]) for g in ts_games)
    ts_fta = sum(float(g["free_throws_attempted"]) for g in ts_games)
    ts_n = len(ts_games)

    # eFG pair: fgm, fg3m, fga
    efg_games = [
        g
        for g in games
        if g.get("field_goals_made") is not None
        and g.get("three_pointers_made") is not None
        and g.get("field_goals_attempted") is not None
    ]
    efg_fgm = sum(float(g["field_goals_made"]) for g in efg_games)
    efg_fg3m = sum(float(g["three_pointers_made"]) for g in efg_games)
    efg_fga = sum(float(g["field_goals_attempted"]) for g in efg_games)
    efg_n = len(efg_games)

    # Populate basic totals and per-game
    metric_values["pts"] = round(pts_sum, 1) if pts_n > 0 else None
    metric_values["pts_per_game"] = round(pts_sum / pts_n, 1) if pts_n > 0 else None
    sample_counts["pts"] = pts_n
    sample_counts["pts_per_game"] = pts_n

    metric_values["reb"] = round(reb_sum, 1) if reb_n > 0 else None
    metric_values["reb_per_game"] = round(reb_sum / reb_n, 1) if reb_n > 0 else None
    sample_counts["reb"] = reb_n
    sample_counts["reb_per_game"] = reb_n

    metric_values["ast"] = round(ast_sum, 1) if ast_n > 0 else None
    metric_values["ast_per_game"] = round(ast_sum / ast_n, 1) if ast_n > 0 else None
    sample_counts["ast"] = ast_n
    sample_counts["ast_per_game"] = ast_n

    metric_values["stl"] = round(stl_sum, 1) if stl_n > 0 else None
    metric_values["stl_per_game"] = round(stl_sum / stl_n, 1) if stl_n > 0 else None
    sample_counts["stl"] = stl_n
    sample_counts["stl_per_game"] = stl_n

    metric_values["blk"] = round(blk_sum, 1) if blk_n > 0 else None
    metric_values["blk_per_game"] = round(blk_sum / blk_n, 1) if blk_n > 0 else None
    sample_counts["blk"] = blk_n
    sample_counts["blk_per_game"] = blk_n

    metric_values["tov"] = round(tov_sum, 1) if tov_n > 0 else None
    metric_values["tov_per_game"] = round(tov_sum / tov_n, 1) if tov_n > 0 else None
    sample_counts["tov"] = tov_n
    sample_counts["tov_per_game"] = tov_n

    metric_values["oreb"] = round(oreb_sum, 1) if oreb_n > 0 else None
    metric_values["oreb_per_game"] = round(oreb_sum / oreb_n, 1) if oreb_n > 0 else None
    sample_counts["oreb"] = oreb_n
    sample_counts["oreb_per_game"] = oreb_n

    metric_values["dreb"] = round(dreb_sum, 1) if dreb_n > 0 else None
    metric_values["dreb_per_game"] = round(dreb_sum / dreb_n, 1) if dreb_n > 0 else None
    sample_counts["dreb"] = dreb_n
    sample_counts["dreb_per_game"] = dreb_n

    metric_values["pf"] = round(pf_sum, 1) if pf_n > 0 else None
    metric_values["pf_per_game"] = round(pf_sum / pf_n, 1) if pf_n > 0 else None
    sample_counts["pf"] = pf_n
    sample_counts["pf_per_game"] = pf_n

    # Percentages
    metric_values["fg_pct"] = round(fgm_sum / fga_sum, 4) if fga_sum > 0 else None
    sample_counts["fg_pct"] = fg_n

    metric_values["fg3_pct"] = round(fg3m_sum / fg3a_sum, 4) if fg3a_sum > 0 else None
    sample_counts["fg3_pct"] = fg3_n

    metric_values["ft_pct"] = round(ftm_sum / fta_sum, 4) if fta_sum > 0 else None
    sample_counts["ft_pct"] = ft_n

    denom_ts = 2.0 * (ts_fga + 0.44 * ts_fta)
    metric_values["ts_pct"] = round(ts_pts / denom_ts, 4) if denom_ts > 0 else None
    sample_counts["ts_pct"] = ts_n

    metric_values["efg_pct"] = (
        round((efg_fgm + 0.5 * efg_fg3m) / efg_fga, 4) if efg_fga > 0 else None
    )
    sample_counts["efg_pct"] = efg_n

    metric_values["ftr"] = round(ftm_sum / fga_sum, 4) if fga_sum > 0 else None
    sample_counts["ftr"] = fg_n

    metric_values["min_per_game"] = min_pg
    sample_counts["min_per_game"] = n

    # Per-36 scaling
    def _rate_36(total_val: float, sample_n: int) -> float | None:
        if sample_n > 0 and tot_min > 0:
            return round((total_val / tot_min) * 36.0, 1)
        return None

    metric_values["pts_per_36"] = _rate_36(pts_sum, pts_n)
    sample_counts["pts_per_36"] = pts_n
    metric_values["reb_per_36"] = _rate_36(reb_sum, reb_n)
    sample_counts["reb_per_36"] = reb_n
    metric_values["ast_per_36"] = _rate_36(ast_sum, ast_n)
    sample_counts["ast_per_36"] = ast_n
    metric_values["stl_per_36"] = _rate_36(stl_sum, stl_n)
    sample_counts["stl_per_36"] = stl_n
    metric_values["blk_per_36"] = _rate_36(blk_sum, blk_n)
    sample_counts["blk_per_36"] = blk_n
    metric_values["tov_per_36"] = _rate_36(tov_sum, tov_n)
    sample_counts["tov_per_36"] = tov_n
    metric_values["fg3a_per_36"] = _rate_36(fg3a_sum, fg3_n)
    sample_counts["fg3a_per_36"] = fg3_n
    metric_values["fta_per_36"] = _rate_36(fta_sum, ft_n)
    sample_counts["fta_per_36"] = ft_n

    return PeriodSummary(
        label=label,
        mode=mode,
        start_date=start_date,
        end_date=end_date,
        appearances_count=n,
        total_minutes=tot_min,
        min_per_game=min_pg,
        stints=stints,
        metrics=metric_values,
        sample_counts=sample_counts,
    )


def compare_periods_service(
    session: Session, request: ComparePeriodsRequest
) -> ComparePeriodsResponse:
    """Execute disjoint period comparison with strict valid sample counts and delta math."""
    ctx = resolve_workbench_context(
        session,
        release_id=request.release_id,
        requested_season=request.season,
        requested_phase=request.phase,
        requested_before_date=request.before_date,
    )

    all_games = _load_player_games(session, ctx, player_id=request.player_id)
    if not all_games:
        raise HTTPException(
            status_code=404,
            detail={
                "reason": "player_not_found",
                "message": f"Player {request.player_id} not found in this release context.",
            },
        )

    # Filter to active appeared games strictly prior to cutoff
    appeared_games = [
        g
        for g in all_games
        if g.get("appearance") == "appeared" and g["game_date"] < ctx.before_date
    ]
    if not appeared_games:
        raise HTTPException(
            status_code=422,
            detail={
                "reason": "no_appearances",
                "message": (
                    f"Player {request.player_id} has no active appearances "
                    f"prior to {ctx.before_date}."
                ),
            },
        )

    player_name = str(appeared_games[0]["player_name"])
    # Sort reverse chronologically
    appeared_games.sort(key=lambda x: (x["game_date"], x["game_id"]), reverse=True)

    has_overlap = False
    disclosures = [
        "Descriptive comparison of historical disjoint periods strictly prior to cutoff.",
        "Zero future leakage: all observations satisfy game_date < before_date.",
        (
            "Differences represent observed sample shifts and do not imply causal change, "
            "fatigue, or future projection."
        ),
    ]

    if request.mode == PeriodMode.APPEARANCES:
        period_a_games = appeared_games[: request.period_a_n]
        period_b_games = appeared_games[
            request.period_a_n : request.period_a_n + request.period_b_n
        ]

        start_a = period_a_games[-1]["game_date"].isoformat() if period_a_games else None
        end_a = period_a_games[0]["game_date"].isoformat() if period_a_games else None
        start_b = period_b_games[-1]["game_date"].isoformat() if period_b_games else None
        end_b = period_b_games[0]["game_date"].isoformat() if period_b_games else None

        summary_a = _summarize_appearance_slice(
            f"Last {len(period_a_games)} Appearances",
            PeriodMode.APPEARANCES,
            period_a_games,
            start_a,
            end_a,
        )
        summary_b = _summarize_appearance_slice(
            f"Preceding {len(period_b_games)} Appearances",
            PeriodMode.APPEARANCES,
            period_b_games,
            start_b,
            end_b,
        )
    else:
        # Date range mode
        if (
            not request.period_a_from
            or not request.period_a_to
            or not request.period_b_from
            or not request.period_b_to
        ):
            raise HTTPException(
                status_code=422,
                detail=(
                    "period_a_from, period_a_to, period_b_from, and period_b_to are "
                    "required for date_range mode"
                ),
            )

        if (
            request.period_a_from < request.period_b_to
            and request.period_b_from < request.period_a_to
        ):
            has_overlap = True
            disclosures.append(
                "Notice: Period A and Period B date ranges overlap; some game records are shared."
            )

        period_a_games = [
            g
            for g in appeared_games
            if request.period_a_from <= g["game_date"] < request.period_a_to
        ]
        period_b_games = [
            g
            for g in appeared_games
            if request.period_b_from <= g["game_date"] < request.period_b_to
        ]

        summary_a = _summarize_appearance_slice(
            f"Range {request.period_a_from} to {request.period_a_to}",
            PeriodMode.DATE_RANGE,
            period_a_games,
            request.period_a_from.isoformat(),
            request.period_a_to.isoformat(),
        )
        summary_b = _summarize_appearance_slice(
            f"Range {request.period_b_from} to {request.period_b_to}",
            PeriodMode.DATE_RANGE,
            period_b_games,
            request.period_b_from.isoformat(),
            request.period_b_to.isoformat(),
        )

    # Stint disclosure
    if summary_a.stints != summary_b.stints:
        stints_a = ", ".join(summary_a.stints) or "None"
        stints_b = ", ".join(summary_b.stints) or "None"
        disclosures.append(
            f"Player team stints differ across periods: "
            f"Period A ({stints_a}), Period B ({stints_b})."
        )

    # Compute deltas across requested/core metrics
    target_metrics = request.metrics or CORE_COMPARE_METRICS
    deltas: list[MetricDelta] = []
    for metric_key in target_metrics:
        val_a = summary_a.metrics.get(metric_key)
        val_b = summary_b.metrics.get(metric_key)
        abs_d, pct_d = compute_period_delta(val_a, val_b)

        cat_entry = METRIC_CATALOG.get(metric_key)
        disp_name = cat_entry.display_name if cat_entry else metric_key.replace("_", " ").title()

        deltas.append(
            MetricDelta(
                metric_key=metric_key,
                display_name=disp_name,
                period_a_value=val_a,
                period_b_value=val_b,
                absolute_delta=abs_d,
                percentage_delta=pct_d,
                period_a_n=summary_a.sample_counts.get(metric_key, 0),
                period_b_n=summary_b.sample_counts.get(metric_key, 0),
            )
        )

    evidence_hash = canonical_hash(
        [
            ctx.release_id,
            request.player_id,
            ctx.season,
            ctx.phase,
            ctx.before_date.isoformat(),
            request.mode.value,
            len(period_a_games),
            len(period_b_games),
            summary_a.metrics,
            summary_b.metrics,
        ]
    )

    return ComparePeriodsResponse(
        operation_version="v1",
        evidence_hash=evidence_hash,
        player_id=request.player_id,
        player_name=player_name,
        season=ctx.season,
        phase=ctx.phase,
        before_date=ctx.before_date.isoformat(),
        period_a=summary_a,
        period_b=summary_b,
        deltas=deltas,
        has_calendar_overlap=has_overlap,
        disclosures=disclosures,
    )


def distribution_service(session: Session, request: DistributionRequest) -> DistributionResponse:
    """Execute quantile distribution analysis using type 7 linear interpolation."""
    ctx = resolve_workbench_context(
        session,
        release_id=request.release_id,
        requested_season=request.season,
        requested_phase=request.phase,
        requested_before_date=request.before_date,
    )

    all_games = _load_player_games(session, ctx, player_id=request.player_id)
    if not all_games:
        raise HTTPException(
            status_code=404,
            detail={
                "reason": "player_not_found",
                "message": f"Player {request.player_id} not found in this release context.",
            },
        )

    appeared_games = [
        g
        for g in all_games
        if g.get("appearance") == "appeared" and g["game_date"] < ctx.before_date
    ]
    if not appeared_games:
        raise HTTPException(
            status_code=422,
            detail={
                "reason": "no_appearances",
                "message": (
                    f"Player {request.player_id} has no active appearances "
                    f"prior to {ctx.before_date}."
                ),
            },
        )

    player_name = str(appeared_games[0]["player_name"])
    appeared_games.sort(key=lambda x: (x["game_date"], x["game_id"]), reverse=True)

    # Slice games by date range or window_n
    if request.from_date and request.to_date:
        window_games = [
            g for g in appeared_games if request.from_date <= g["game_date"] < request.to_date
        ]
    else:
        window_games = appeared_games[: request.window_n]

    # Map team games for venue (home/away)
    team_games = _load_team_games(session, ctx)
    team_side_map: dict[tuple[str, str], str] = {
        (tg["game_id"], tg["team_id"]): tg.get("side") or "home" for tg in team_games
    }

    metric_key = request.metric.strip().lower()
    # Map friendly aliases
    if metric_key in ("points", "pts"):
        field_accessor = "points"
    elif metric_key in ("rebounds", "reb", "rebounds_total"):
        field_accessor = "rebounds_total"
    elif metric_key in ("assists", "ast"):
        field_accessor = "assists"
    elif metric_key in ("steals", "stl"):
        field_accessor = "steals"
    elif metric_key in ("blocks", "blk"):
        field_accessor = "blocks"
    elif metric_key in ("turnovers", "tov"):
        field_accessor = "turnovers"
    elif metric_key in ("minutes", "min", "min_per_game"):
        field_accessor = "minutes_seconds"
    elif metric_key in ("three_pointers_made", "fg3m", "3pm"):
        field_accessor = "three_pointers_made"
    elif metric_key in ("field_goals_made", "fgm"):
        field_accessor = "field_goals_made"
    else:
        field_accessor = metric_key

    cat_def = METRIC_CATALOG.get(metric_key)
    display_name = cat_def.display_name if cat_def else metric_key.upper()
    unit = cat_def.unit if cat_def else "count"

    sample_points: list[DistributionSamplePoint] = []
    numeric_values: list[float] = []

    for g in window_games:
        raw_val = g.get(field_accessor)
        val: float | None = None
        if raw_val is not None:
            if field_accessor == "minutes_seconds":
                val = round(float(raw_val) / 60.0, 1)
            else:
                val = float(raw_val)
            numeric_values.append(val)

        t_tricode = resolve_team_tricode(str(g.get("team_id") or ""))
        opp_tricode = resolve_team_tricode(str(g.get("opponent_id") or ""))
        side = team_side_map.get((g["game_id"], g["team_id"]), "home")

        sec = g.get("minutes_seconds")
        min_flt = round(float(sec) / 60.0, 1) if sec is not None else None

        sample_points.append(
            DistributionSamplePoint(
                game_id=g["game_id"],
                game_date=g["game_date"].isoformat(),
                team_tricode=t_tricode,
                opponent_tricode=opp_tricode,
                is_home=(side == "home"),
                minutes=min_flt,
                value=val,
            )
        )

    # Compute descriptive distribution
    summary_dict = compute_distribution_summary(numeric_values)
    summary = DistributionSummary(**summary_dict)

    disclosures = [
        (
            "Historical empirical dispersion (IQR, standard deviation, quantiles) describes sample "
            "distribution and does not establish a prospective floor, ceiling, or injury/fatigue "
            "forecast."
        ),
        "Quantiles computed using standard linear interpolation (type 7).",
        "A minimum sample of n >= 5 is strictly required for distribution summary statistics.",
    ]

    evidence_hash = canonical_hash(
        [
            ctx.release_id,
            request.player_id,
            ctx.season,
            ctx.phase,
            ctx.before_date.isoformat(),
            metric_key,
            len(sample_points),
            summary_dict,
        ]
    )

    return DistributionResponse(
        operation_version="v1",
        evidence_hash=evidence_hash,
        player_id=request.player_id,
        player_name=player_name,
        metric=metric_key,
        metric_display_name=display_name,
        metric_unit=unit,
        season=ctx.season,
        phase=ctx.phase,
        before_date=ctx.before_date.isoformat(),
        summary=summary,
        samples=sample_points,
        disclosures=disclosures,
    )


def split_profile_service(session: Session, request: SplitProfileRequest) -> SplitProfileResponse:
    """Execute contextual splits across venue, rest days, and opponent team."""
    ctx = resolve_workbench_context(
        session,
        release_id=request.release_id,
        requested_season=request.season,
        requested_phase=request.phase,
        requested_before_date=request.before_date,
    )

    all_games = _load_player_games(session, ctx, player_id=request.player_id)
    if not all_games:
        raise HTTPException(
            status_code=404,
            detail={
                "reason": "player_not_found",
                "message": f"Player {request.player_id} not found in this release context.",
            },
        )

    appeared_games = [
        g
        for g in all_games
        if g.get("appearance") == "appeared" and g["game_date"] < ctx.before_date
    ]
    if not appeared_games:
        raise HTTPException(
            status_code=422,
            detail={
                "reason": "no_appearances",
                "message": (
                    f"Player {request.player_id} has no active appearances "
                    f"prior to {ctx.before_date}."
                ),
            },
        )

    player_name = str(appeared_games[0]["player_name"])
    # Sort chronologically for rest & gap calculation
    appeared_games.sort(key=lambda x: (x["game_date"], x["game_id"]), reverse=False)

    # Load team games to compute team rest days
    team_games = _load_team_games(session, ctx)
    team_games_by_team: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for tg in team_games:
        team_games_by_team[tg["team_id"]].append(tg)

    # Sort each team's games chronologically
    for t_id in team_games_by_team:
        team_games_by_team[t_id].sort(key=lambda x: (x["game_date"], x["game_id"]))

    # Map (game_id, team_id) -> (side, team_rest_days)
    game_team_context: dict[tuple[str, str], tuple[str, int | None]] = {}
    for _t_id, t_list in team_games_by_team.items():
        prev_date: date | None = None
        for tg in t_list:
            cur_date = tg["game_date"]
            rest_days = calculate_calendar_gap(cur_date, prev_date)
            game_team_context[(tg["game_id"], tg["team_id"])] = (
                tg.get("side") or "home",
                rest_days,
            )
            prev_date = cur_date

    # Enrich player appearances with rest days & player gap days
    enriched_games: list[dict[str, Any]] = []
    prev_player_date: date | None = None
    for g in appeared_games:
        g_id = g["game_id"]
        t_id = g["team_id"]
        cur_date = g["game_date"]

        side, team_rest = game_team_context.get((g_id, t_id), ("home", None))
        player_gap = calculate_calendar_gap(cur_date, prev_player_date)

        g_copy = dict(g)
        g_copy["side"] = side
        g_copy["team_rest_days"] = team_rest
        g_copy["rest_bucket"] = categorize_rest_bucket(team_rest)
        g_copy["appearance_gap_days"] = player_gap

        enriched_games.append(g_copy)
        prev_player_date = cur_date

    def _aggregate_bucket(
        bucket_key: str, bucket_label: str, games_subset: list[dict[str, Any]]
    ) -> SplitBucketSummary:
        summ = _summarize_appearance_slice(bucket_label, PeriodMode.APPEARANCES, games_subset)
        gaps = [
            float(g["appearance_gap_days"])
            for g in games_subset
            if g.get("appearance_gap_days") is not None
        ]
        avg_gap = round(sum(gaps) / len(gaps), 1) if gaps else None

        return SplitBucketSummary(
            bucket_key=bucket_key,
            bucket_label=bucket_label,
            games_played=summ.appearances_count,
            total_minutes=summ.total_minutes,
            min_per_game=summ.min_per_game,
            appearance_gap_days_avg=avg_gap,
            metrics=summ.metrics,
            sample_counts=summ.sample_counts,
        )

    venue_splits: list[SplitBucketSummary] = []
    rest_splits: list[SplitBucketSummary] = []
    opponent_splits: list[SplitBucketSummary] = []

    # 1. Venue Splits
    if request.split_type in (SplitType.VENUE, SplitType.ALL):
        home_games = [g for g in enriched_games if g["side"] == "home"]
        away_games = [g for g in enriched_games if g["side"] in ("away", "road")]
        if home_games:
            venue_splits.append(_aggregate_bucket("home", "Home Games", home_games))
        if away_games:
            venue_splits.append(_aggregate_bucket("away", "Away Games", away_games))

    # 2. Rest Splits
    if request.split_type in (SplitType.REST, SplitType.ALL):
        buckets_order = [
            ("0 days (Back-to-back)", "0_days_b2b", "0 Days (Back-to-back)"),
            ("1 day", "1_day", "1 Day Rest"),
            ("2 days", "2_days", "2 Days Rest"),
            ("3+ days", "3_plus_days", "3+ Days Rest"),
            ("Unknown / Season Opener", "unknown", "Unknown / Season Opener"),
        ]
        for b_name, b_key, b_label in buckets_order:
            b_games = [g for g in enriched_games if g["rest_bucket"] == b_name]
            if b_games:
                rest_splits.append(_aggregate_bucket(b_key, b_label, b_games))

    # 3. Opponent Splits
    if request.split_type in (SplitType.OPPONENT, SplitType.ALL):
        by_opp: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for g in enriched_games:
            by_opp[g["opponent_id"]].append(g)

        for opp_id in sorted(by_opp.keys()):
            opp_games = by_opp[opp_id]
            opp_tri = resolve_team_tricode(opp_id)
            opponent_splits.append(_aggregate_bucket(opp_tri, f"vs {opp_tri}", opp_games))

    disclosures = [
        (
            "Team rest days represent full local calendar days between scheduled team games: "
            "0 means back-to-back."
        ),
        (
            "A gap between player appearances is separately reported and does not establish "
            "player rest, maintenance, or injury status."
        ),
        (
            "Historical contextual splits are descriptive sample partitions and do not imply "
            "causal venue or rest effects."
        ),
    ]

    evidence_hash = canonical_hash(
        [
            ctx.release_id,
            request.player_id,
            ctx.season,
            ctx.phase,
            ctx.before_date.isoformat(),
            request.split_type.value,
            len(venue_splits),
            len(rest_splits),
            len(opponent_splits),
        ]
    )

    return SplitProfileResponse(
        operation_version="v1",
        evidence_hash=evidence_hash,
        player_id=request.player_id,
        player_name=player_name,
        season=ctx.season,
        phase=ctx.phase,
        before_date=ctx.before_date.isoformat(),
        venue_splits=venue_splits,
        rest_splits=rest_splits,
        opponent_splits=opponent_splits,
        disclosures=disclosures,
    )


def opponent_context_service(
    session: Session, request: OpponentContextRequest
) -> OpponentContextResponse:
    """Analyze defensive allowance of opponent teams across completed historical games."""
    ctx = resolve_workbench_context(
        session,
        release_id=request.release_id,
        requested_season=request.season,
        requested_phase=request.phase,
        requested_before_date=request.before_date,
    )

    all_team_games = _load_team_games(session, ctx)
    if not all_team_games:
        raise HTTPException(
            status_code=404,
            detail="no team games found for this release context",
        )

    # Group games by opponent_id (the team that CONCEDED the stats)
    by_opp: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for tg in all_team_games:
        by_opp[tg["opponent_id"]].append(tg)

    allowances: list[TeamDefensiveAllowance] = []

    for opp_id, games_against in by_opp.items():
        m = len(games_against)
        if m == 0:
            continue

        tot_pts = sum(float(g.get("points") or 0) for g in games_against)
        pts_allowed_pg = round(tot_pts / m, 1)

        # FGM & FGA allowed
        tot_fgm = sum(float(g.get("stats", {}).get("field_goals_made") or 0) for g in games_against)
        tot_fga = sum(
            float(g.get("stats", {}).get("field_goals_attempted") or 0) for g in games_against
        )
        fg_pct_allowed = round(tot_fgm / tot_fga, 4) if tot_fga > 0 else None

        # 3PM & 3PA allowed
        tot_3pm = sum(
            float(g.get("stats", {}).get("three_pointers_made") or 0) for g in games_against
        )
        tot_3pa = sum(
            float(g.get("stats", {}).get("three_pointers_attempted") or 0) for g in games_against
        )
        fg3_pct_allowed = round(tot_3pm / tot_3pa, 4) if tot_3pa > 0 else None

        # Rebounds, assists, turnovers allowed
        tot_reb = sum(float(g.get("stats", {}).get("rebounds_total") or 0) for g in games_against)
        tot_ast = sum(float(g.get("stats", {}).get("assists") or 0) for g in games_against)
        tot_tov = sum(float(g.get("stats", {}).get("turnovers") or 0) for g in games_against)

        opp_info = get_team_info(opp_id)
        tricode = opp_info.tricode if opp_info else resolve_team_tricode(opp_id)
        name = opp_info.name if opp_info else tricode

        allowances.append(
            TeamDefensiveAllowance(
                opponent_team_id=opp_id,
                opponent_tricode=tricode,
                opponent_name=name,
                games_observed=m,
                pts_allowed_per_game=pts_allowed_pg,
                fg_pct_allowed=fg_pct_allowed,
                fg3_pct_allowed=fg3_pct_allowed,
                reb_allowed_per_game=round(tot_reb / m, 1),
                ast_allowed_per_game=round(tot_ast / m, 1),
                tov_forced_per_game=round(tot_tov / m, 1),
                league_rank_pts_allowed=None,
                total_teams_in_rank=None,
            )
        )

    # Rank by points allowed ascending (stingiest defense = Rank 1)
    allowances.sort(key=lambda x: (x.pts_allowed_per_game, x.opponent_tricode))
    total_teams = len(allowances)
    for rank_idx, item in enumerate(allowances, start=1):
        item.league_rank_pts_allowed = rank_idx
        item.total_teams_in_rank = total_teams

    # If specific team requested, filter
    if request.team_id:
        req_norm = request.team_id.strip().upper()
        allowances = [
            a
            for a in allowances
            if a.opponent_team_id.upper() == req_norm or a.opponent_tricode.upper() == req_norm
        ]

    disclosures = [
        (
            "Opponent allowance is a historical team production average across completed games "
            "strictly prior to cutoff."
        ),
        (
            "It is not a positional matchup assignment, tracking metric, or opponent-adjusted "
            "individual forecast."
        ),
        (
            "League rank 1 indicates the lowest points allowed per game (stingiest defense) "
            "in the admitted cohort."
        ),
    ]

    evidence_hash = canonical_hash(
        [
            ctx.release_id,
            ctx.season,
            ctx.phase,
            ctx.before_date.isoformat(),
            request.team_id or "all",
            len(allowances),
        ]
    )

    return OpponentContextResponse(
        operation_version="v1",
        evidence_hash=evidence_hash,
        season=ctx.season,
        phase=ctx.phase,
        before_date=ctx.before_date.isoformat(),
        teams_analyzed=len(allowances),
        allowances=allowances,
        disclosures=disclosures,
    )


def statistical_peers_service(
    session: Session, request: StatisticalPeersRequest
) -> StatisticalPeersResponse:
    """Compute player similarity based on standardized per-36 production & efficiency."""
    ctx = resolve_workbench_context(
        session,
        release_id=request.release_id,
        requested_season=request.season,
        requested_phase=request.phase,
        requested_before_date=request.before_date,
    )

    # 1. Select cohort via SQL aggregation engine
    w_kind = WindowKind.LAST_10 if request.window == "last_10" else WindowKind.SEASON
    query = QuerySpec(
        season=ctx.season,
        window=WindowSpec(kind=w_kind),
        sample_filters=SampleFilter(
            min_games=request.min_appearances,
            min_minutes=request.min_minutes,
        ),
    )

    cohort_items = export_stats_query(session, ctx, query, max_rows=2000)
    if not cohort_items:
        raise HTTPException(
            status_code=422,
            detail="no players met sample requirements in this cohort",
        )

    # 2. Extract dimensions
    dims = request.dimensions or INITIAL_SIMILARITY_DIMENSIONS
    target_id = request.target_player_id.strip()

    # Find target player item
    target_item = next((it for it in cohort_items if str(it["player_id"]) == target_id), None)
    if target_item is None:
        # Check if target player exists at all to provide actionable feedback
        single_query = QuerySpec(
            season=ctx.season,
            window=WindowSpec(kind=w_kind),
            name=None,
        )
        all_players = export_stats_query(session, ctx, single_query, max_rows=2000)
        found_target = next((it for it in all_players if str(it["player_id"]) == target_id), None)
        if found_target:
            p_name = found_target.get("player_name", target_id)
            gp = found_target.get("games_played", 0)
            tot_m = found_target.get("total_minutes", 0)
            raise HTTPException(
                status_code=422,
                detail={
                    "reason": "insufficient_sample",
                    "message": (
                        f"Target player {p_name} has {gp} appearances and {tot_m} minutes, "
                        f"which does not satisfy minimums "
                        f"(min_appearances={request.min_appearances}, "
                        f"min_minutes={request.min_minutes})."
                    ),
                },
            )
        raise HTTPException(
            status_code=404,
            detail=f"Target player {target_id} not found in this release context.",
        )

    # 3. Standardize dimensions across cohort
    # Collect values for each dimension
    dim_values: dict[str, list[float]] = defaultdict(list)
    player_dim_raw: dict[str, dict[str, float | None]] = {}

    for it in cohort_items:
        p_id = str(it["player_id"])
        m = it.get("metrics") or {}
        p_raw: dict[str, float | None] = {}
        for d in dims:
            v = m.get(d)
            if v is not None:
                flt_v = float(v)
                p_raw[d] = flt_v
                dim_values[d].append(flt_v)
            else:
                p_raw[d] = None
        player_dim_raw[p_id] = p_raw

    dimension_stats: list[DimensionStats] = []
    active_dims: list[str] = []
    cohort_means: dict[str, float] = {}
    cohort_sds: dict[str, float] = {}

    for d in dims:
        vals = dim_values[d]
        cat_def = METRIC_CATALOG.get(d)
        disp = cat_def.display_name if cat_def else d.replace("_", " ").title()

        if len(vals) < 2:
            dimension_stats.append(
                DimensionStats(
                    dimension_key=d,
                    display_name=disp,
                    cohort_mean=0.0,
                    cohort_sd=0.0,
                    is_active=False,
                    exclusion_reason="Fewer than 2 valid observations in cohort",
                )
            )
            continue

        mean_v = sum(vals) / len(vals)
        sd_v = compute_population_sd(vals, mean_v)

        if sd_v < 1e-6:
            dimension_stats.append(
                DimensionStats(
                    dimension_key=d,
                    display_name=disp,
                    cohort_mean=round(mean_v, 2),
                    cohort_sd=0.0,
                    is_active=False,
                    exclusion_reason="Zero-variance dimension across eligible cohort",
                )
            )
            continue

        cohort_means[d] = mean_v
        cohort_sds[d] = sd_v
        active_dims.append(d)
        dimension_stats.append(
            DimensionStats(
                dimension_key=d,
                display_name=disp,
                cohort_mean=round(mean_v, 2),
                cohort_sd=round(sd_v, 2),
                is_active=True,
                exclusion_reason=None,
            )
        )

    # 4. Standardize z-scores for all cohort players
    player_z_scores: dict[str, dict[str, float | None]] = {}
    for p_id, raw_map in player_dim_raw.items():
        z_map: dict[str, float | None] = {}
        for d in active_dims:
            raw_v = raw_map.get(d)
            if raw_v is not None and d in cohort_sds and cohort_sds[d] > 0:
                z_map[d] = round((raw_v - cohort_means[d]) / cohort_sds[d], 3)
            else:
                z_map[d] = None
        player_z_scores[p_id] = z_map

    target_raw = player_dim_raw[target_id]
    target_z = player_z_scores[target_id]

    target_profile = TargetPlayerProfile(
        player_id=target_id,
        player_name=str(target_item["player_name"]),
        team_tricode=target_item.get("team_tricode"),
        games_played=target_item.get("games_played") or 0,
        total_minutes=target_item.get("total_minutes") or 0.0,
        raw_values=target_raw,
        standardized_values=target_z,
    )

    # 5. Compute Euclidean distance to all other players in cohort
    candidates: list[PeerMatchItem] = []

    for it in cohort_items:
        cand_id = str(it["player_id"])
        if cand_id == target_id:
            continue

        cand_raw = player_dim_raw[cand_id]
        cand_z = player_z_scores[cand_id]

        overlapping_dims = [
            d for d in active_dims if target_z.get(d) is not None and cand_z.get(d) is not None
        ]

        # Require at least 6 overlapping dimensions per contract
        if len(overlapping_dims) < 6:
            continue

        diff_sq_sum = 0.0
        contributions: dict[str, float] = {}
        for d in overlapping_dims:
            z_diff = target_z[d] - cand_z[d]  # type: ignore[operator]
            diff_sq = z_diff**2
            contributions[d] = round(diff_sq / len(overlapping_dims), 3)
            diff_sq_sum += diff_sq

        distance = round((diff_sq_sum / len(overlapping_dims)) ** 0.5, 3)

        candidates.append(
            PeerMatchItem(
                player_id=cand_id,
                player_name=str(it["player_name"]),
                team_tricode=it.get("team_tricode"),
                games_played=it.get("games_played") or 0,
                total_minutes=it.get("total_minutes") or 0.0,
                distance=distance,
                overlapping_dimensions_count=len(overlapping_dims),
                raw_values=cand_raw,
                standardized_values=cand_z,
                dimension_contributions=contributions,
            )
        )

    # Sort by distance asc, player_id asc for deterministic tie-breaker
    candidates.sort(key=lambda x: (x.distance, x.player_id))
    top_peers = candidates[: request.top_k]

    cohort_summary = CohortSummary(
        cohort_size=len(cohort_items),
        window_description=f"{w_kind.value} prior to {ctx.before_date}",
        min_appearances=request.min_appearances,
        min_minutes=request.min_minutes,
        active_dimensions_count=len(active_dims),
        dimensions=dimension_stats,
    )

    disclosures = [
        (
            "Statistical peer similarity represents geometric Euclidean distance across "
            "standardized per-36 production and efficiency dimensions in the eligible cohort."
        ),
        "Requires at least 6 overlapping valid dimensions with equal default weights.",
        (
            "Lower distance indicates statistical role and volume proximity on these dimensions, "
            "not player quality, fantasy value, or career projection."
        ),
    ]

    evidence_hash = canonical_hash(
        [
            ctx.release_id,
            target_id,
            ctx.season,
            ctx.phase,
            ctx.before_date.isoformat(),
            request.window,
            request.min_appearances,
            request.min_minutes,
            [p.player_id for p in top_peers],
            [p.distance for p in top_peers],
        ]
    )

    return StatisticalPeersResponse(
        operation_version="v1",
        evidence_hash=evidence_hash,
        target=target_profile,
        cohort=cohort_summary,
        peers=top_peers,
        disclosures=disclosures,
    )


def rank_operation_service(
    session: Session, request: RankOperationRequest
) -> RankOperationResponse:
    """Sort and filter analytical operation outputs across players in the cohort."""
    ctx = resolve_workbench_context(
        session,
        release_id=request.release_id,
        requested_season=request.season,
        requested_phase=request.phase,
        requested_before_date=request.before_date,
    )

    # Load candidate cohort
    query = QuerySpec(
        season=ctx.season,
        sample_filters=SampleFilter(
            min_games=request.min_games,
            min_minutes=request.min_minutes,
        ),
    )
    cohort = export_stats_query(session, ctx, query, max_rows=1000)

    items: list[RankOperationItem] = []

    if request.operation_type == "compare_periods":
        # Rank by period delta (e.g. last 10 vs preceding 10)
        for p in cohort:
            p_id = str(p["player_id"])
            try:
                comp_req = ComparePeriodsRequest(
                    player_id=p_id,
                    season=ctx.season,
                    phase=ctx.phase,
                    before_date=ctx.before_date,
                    mode=PeriodMode.APPEARANCES,
                    period_a_n=10,
                    period_b_n=10,
                    metrics=[request.metric],
                )
                comp_resp = compare_periods_service(session, comp_req)
                delta_obj = comp_resp.deltas[0] if comp_resp.deltas else None
                if delta_obj and delta_obj.absolute_delta is not None:
                    items.append(
                        RankOperationItem(
                            rank=0,
                            player_id=p_id,
                            player_name=str(p["player_name"]),
                            team_tricode=p.get("team_tricode"),
                            games_played=p.get("games_played") or 0,
                            total_minutes=p.get("total_minutes") or 0.0,
                            baseline_value=delta_obj.period_b_value,
                            comparison_value=delta_obj.period_a_value,
                            delta_value=delta_obj.absolute_delta,
                            metric_key=request.metric,
                            details={"percentage_delta": delta_obj.percentage_delta},
                        )
                    )
            except Exception:
                continue

    elif request.operation_type == "distribution":
        # Rank by dispersion (IQR or SD)
        for p in cohort:
            p_id = str(p["player_id"])
            try:
                dist_req = DistributionRequest(
                    player_id=p_id,
                    metric=request.metric,
                    season=ctx.season,
                    phase=ctx.phase,
                    before_date=ctx.before_date,
                    window_n=20,
                )
                dist_resp = distribution_service(session, dist_req)
                if dist_resp.summary.summary_available:
                    disp_val = (
                        dist_resp.summary.iqr
                        if request.measure == DistributionMeasure.IQR
                        else dist_resp.summary.population_sd
                    )
                    items.append(
                        RankOperationItem(
                            rank=0,
                            player_id=p_id,
                            player_name=str(p["player_name"]),
                            team_tricode=p.get("team_tricode"),
                            games_played=p.get("games_played") or 0,
                            total_minutes=p.get("total_minutes") or 0.0,
                            baseline_value=dist_resp.summary.mean,
                            comparison_value=dist_resp.summary.median,
                            delta_value=disp_val,
                            metric_key=f"{request.metric}_{request.measure.value}",
                            details={
                                "iqr": dist_resp.summary.iqr,
                                "sd": dist_resp.summary.population_sd,
                                "n": dist_resp.summary.n,
                            },
                        )
                    )
            except Exception:
                continue

    reverse_sort = request.sort_direction == "desc"
    items.sort(
        key=lambda x: (
            float("-inf")
            if x.delta_value is None and reverse_sort
            else float("inf")
            if x.delta_value is None
            else x.delta_value,
            x.player_id,
        ),
        reverse=reverse_sort,
    )

    ranked_items = items[: request.limit]
    for idx, item in enumerate(ranked_items, start=1):
        item.rank = idx

    disclosures = [
        (
            "Analytical rank operations sort registered descriptive deltas and distributions "
            "across eligible players."
        ),
        (
            "Candidate rankings indicate empirical sample shifts, not statistical significance "
            "or causal changepoints."
        ),
    ]

    evidence_hash = canonical_hash(
        [
            ctx.release_id,
            ctx.season,
            ctx.phase,
            ctx.before_date.isoformat(),
            request.operation_type,
            request.metric,
            len(ranked_items),
        ]
    )

    return RankOperationResponse(
        operation_version="v1",
        evidence_hash=evidence_hash,
        operation_type=request.operation_type,
        metric=request.metric,
        season=ctx.season,
        phase=ctx.phase,
        before_date=ctx.before_date.isoformat(),
        total_eligible=len(items),
        items=ranked_items,
        disclosures=disclosures,
    )
