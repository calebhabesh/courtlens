"""Allowlisted read-only analytical query tools and evidence ledger for CourtLens assistant."""

from __future__ import annotations

import json
import time
from datetime import date
from typing import Any

from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.api.workbench_schemas import (
    AssistantToolCallTrace,
    EvidenceCellRef,
)
from courtlens.config import get_settings
from courtlens.domain.metrics import (
    METRIC_CATALOG_VERSION,
    METRIC_DEFINITIONS,
)
from courtlens.domain.metrics import (
    get_metric_definition as get_domain_metric_def,
)
from courtlens.domain.teams import get_team_by_tricode
from courtlens.services.assistant.entities import resolve_player_identifier
from courtlens.services.workbench_analytics import (
    ResearchQuery,
    ResolvedContext,
    execute_player_research_query,
    resolve_workbench_context,
)
from courtlens.services.workbench_analytics import (
    compare_players as analytics_compare_players,
)
from courtlens.services.workbench_analytics import (
    get_player_profile as analytics_get_player_profile,
)
from courtlens.services.workbench_analytics import (
    get_team_detail as analytics_get_team_detail,
)
from courtlens.services.workbench_forecasts import (
    get_forecast_issuance_detail,
    query_forecast_issuances,
)
from courtlens.workbench_models import ModelPolicyActivation


class EvidenceLedger:
    """Server-side ledger of verified analytical evidence cells."""

    def __init__(self) -> None:
        self._cells: dict[str, EvidenceCellRef] = {}
        self._counter: int = 0

    def add(
        self,
        *,
        entity_type: str,
        entity_id: str,
        entity_name: str,
        field_name: str,
        raw_value: Any,
        formatted_value: str,
        source_tool: str,
        metric: str | None = None,
    ) -> str:
        """Register a verified server-owned fact cell and return its reference ID."""
        self._counter += 1
        ref_id = f"ev_{self._counter}_{field_name}"
        cell = EvidenceCellRef(
            ref_id=ref_id,
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            field_name=field_name,
            metric=metric,
            raw_value=raw_value,
            formatted_value=formatted_value,
            source_tool=source_tool,
        )
        self._cells[ref_id] = cell
        return ref_id

    def get(self, ref_id: str) -> EvidenceCellRef | None:
        return self._cells.get(ref_id)

    def all_cells(self) -> list[EvidenceCellRef]:
        return list(self._cells.values())


# -----------------------------------------------------------------------------
# Tool Argument Schemas (Strict validation against malicious or invalid inputs)
# -----------------------------------------------------------------------------

SAFE_IDENTIFIER_PATTERN = r"^[a-zA-Z0-9_\-\.\s]+$"


class GetCatalogArgs(BaseModel):
    pass


class GetMetricDefinitionArgs(BaseModel):
    metric_key: str = Field(..., pattern=r"^[a-zA-Z0-9_]+$")


class SearchRankPlayersArgs(BaseModel):
    name: str | None = Field(None, pattern=SAFE_IDENTIFIER_PATTERN)
    team_id: str | None = Field(None, pattern=r"^[a-zA-Z0-9_]+$")
    min_games: int | None = Field(None, ge=1, le=100)
    min_minutes: float | None = Field(None, ge=0.0, le=5000.0)
    min_avg_minutes: float | None = Field(None, ge=0.0, le=48.0)
    sort_metric: str = Field("pts", pattern=r"^[a-zA-Z0-9_]+$")
    sort_direction: str = Field("desc", pattern=r"^(asc|desc)$")
    limit: int = Field(10, ge=1, le=100)
    season: str | None = Field(None, pattern=r"^\d{4}-\d{2}$")
    phase: str | None = Field(None, pattern=r"^[a-zA-Z0-9_]+$")
    before_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    window: str | None = Field(None, pattern=r"^(season|last_10|last_5)$")


class GetPlayerProfileArgs(BaseModel):
    player_id: str = Field(..., pattern=SAFE_IDENTIFIER_PATTERN)
    season: str | None = Field(None, pattern=r"^\d{4}-\d{2}$")
    phase: str | None = Field(None, pattern=r"^[a-zA-Z0-9_]+$")
    before_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    window: str | None = Field(None, pattern=r"^(season|last_10|last_5)$")


class GetTeamSummaryArgs(BaseModel):
    team_id: str = Field(..., pattern=r"^[a-zA-Z0-9_]+$")
    season: str | None = Field(None, pattern=r"^\d{4}-\d{2}$")
    phase: str | None = Field(None, pattern=r"^[a-zA-Z0-9_]+$")
    before_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class ComparePlayersArgs(BaseModel):
    player_a: str = Field(..., pattern=SAFE_IDENTIFIER_PATTERN)
    player_b: str = Field(..., pattern=SAFE_IDENTIFIER_PATTERN)
    season: str | None = Field(None, pattern=r"^\d{4}-\d{2}$")
    phase: str | None = Field(None, pattern=r"^[a-zA-Z0-9_]+$")
    before_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    window: str | None = Field(None, pattern=r"^(season|last_10|last_5)$")


class GetForecastArgs(BaseModel):
    player_id: str | None = Field(None, pattern=SAFE_IDENTIFIER_PATTERN)
    issuance_id: str | None = Field(None, pattern=r"^[a-zA-Z0-9_\-]+$")
    target_game_date: str | None = Field(None, pattern=r"^\d{4}-\d{2}-\d{2}$")


class GetEvaluationSummaryArgs(BaseModel):
    run_id: str | None = Field(None, pattern=r"^[a-zA-Z0-9_\-]+$")


# -----------------------------------------------------------------------------
# Tool Implementations
# -----------------------------------------------------------------------------


def resolve_team_identifier(team_id: str) -> str:
    """Resolve team tricode (e.g. TOR) or team ID to canonical NBA team ID."""
    clean = team_id.strip()
    if clean.isdigit():
        return clean
    team_by_tri = get_team_by_tricode(clean)
    if team_by_tri:
        return team_by_tri.team_id
    return clean


def _resolve_context_for_tool(
    session: Session,
    pinned_context: dict[str, Any],
    season: str | None = None,
    phase: str | None = None,
    before_date_str: str | None = None,
    window: str | None = None,
) -> ResolvedContext:
    eff_season = season or pinned_context.get("season")
    eff_phase = phase or pinned_context.get("phase")
    raw_before = before_date_str or pinned_context.get("before_date")
    eff_before_date: date | None = None
    if isinstance(raw_before, date):
        eff_before_date = raw_before
    elif isinstance(raw_before, str) and raw_before:
        eff_before_date = date.fromisoformat(raw_before)
    eff_window = window or pinned_context.get("window")
    return resolve_workbench_context(
        session,
        release_id=pinned_context.get("release_id"),
        requested_season=eff_season,
        requested_phase=eff_phase,
        requested_before_date=eff_before_date,
        requested_window=eff_window,
    )


def tool_get_catalog(
    session: Session,
    ledger: EvidenceLedger,
    pinned_context: dict[str, Any],
    args: dict[str, Any],
) -> dict[str, Any]:
    """Retrieve active workbench release catalog, supported seasons, and default boundaries."""
    ctx = _resolve_context_for_tool(session, pinned_context)
    data = {
        "release_id": ctx.release_id,
        "default_season": ctx.season,
        "default_phase": ctx.phase,
        "default_before_date": ctx.default_before_date.isoformat(),
        "default_window": ctx.window,
        "supported_seasons": [ctx.season],
        "supported_phases": [ctx.phase],
        "coverage_start": ctx.coverage_start.isoformat(),
        "coverage_end": ctx.coverage_end.isoformat(),
        "metric_version": METRIC_CATALOG_VERSION,
    }
    ledger.add(
        entity_type="catalog",
        entity_id=ctx.release_id,
        entity_name="Release Catalog",
        field_name="default_season",
        raw_value=ctx.season,
        formatted_value=ctx.season,
        source_tool="get_catalog",
    )
    return data


def tool_get_metric_definition(
    session: Session,
    ledger: EvidenceLedger,
    pinned_context: dict[str, Any],
    args: dict[str, Any],
) -> dict[str, Any]:
    """Retrieve catalog definition, formula, unit, and limitations for a specific metric."""
    parsed = GetMetricDefinitionArgs(**args)
    metric_key = parsed.metric_key
    metric_def = get_domain_metric_def(metric_key)
    if metric_def is None:
        valid_keys = ", ".join([m.key for m in METRIC_DEFINITIONS[:15]])
        raise ValueError(
            f"Metric '{metric_key}' is not defined in CourtLens catalog v1. "
            f"Supported examples: {valid_keys}"
        )

    res = metric_def.to_dict()
    ledger.add(
        entity_type="metric",
        entity_id=metric_def.key,
        entity_name=metric_def.display_name,
        field_name="formula",
        raw_value=metric_def.formula,
        formatted_value=metric_def.formula,
        source_tool="get_metric_definition",
        metric=metric_def.key,
    )
    return res


def tool_search_rank_players(
    session: Session,
    ledger: EvidenceLedger,
    pinned_context: dict[str, Any],
    args: dict[str, Any],
) -> dict[str, Any]:
    """Search and rank players by single-formula box-score metrics under strict temporal cutoff."""
    parsed = SearchRankPlayersArgs(**args)
    effective_team = resolve_team_identifier(parsed.team_id) if parsed.team_id else None

    # Validate metric
    metric_def = get_domain_metric_def(parsed.sort_metric)
    if metric_def is None and parsed.sort_metric not in (
        "pts",
        "pts_per_game",
        "games_played",
        "total_minutes",
    ):
        raise ValueError(f"Unknown sort metric '{parsed.sort_metric}'")

    ctx = _resolve_context_for_tool(
        session,
        pinned_context,
        season=parsed.season,
        phase=parsed.phase,
        before_date_str=parsed.before_date,
        window=parsed.window,
    )

    query = ResearchQuery(
        release_id=ctx.release_id,
        season=ctx.season,
        phase=ctx.phase,
        before_date=ctx.before_date,
        window=ctx.window,
        team_id=effective_team,
        name=parsed.name,
        min_games=parsed.min_games,
        min_minutes=parsed.min_minutes,
        min_avg_minutes=parsed.min_avg_minutes,
        sort_metric=parsed.sort_metric,
        sort_direction=parsed.sort_direction,
        limit=min(parsed.limit, 100),
    )

    items, total_count, _, _ = execute_player_research_query(session, ctx, query)

    # Register evidence cells for top rows
    rows_data: list[dict[str, Any]] = []
    for item in items:
        p_id = item["player_id"]
        p_name = item["player_name"]
        gp = item["games_played"]
        tot_min = item["total_minutes"]
        metrics = item.get("metrics", {})

        # Register cells
        ledger.add(
            entity_type="player",
            entity_id=p_id,
            entity_name=p_name,
            field_name="games_played",
            raw_value=gp,
            formatted_value=f"{gp} GP",
            source_tool="search_players",
            metric="gp",
        )
        sort_val = metrics.get(parsed.sort_metric)
        if sort_val is not None:
            ledger.add(
                entity_type="player",
                entity_id=p_id,
                entity_name=p_name,
                field_name=parsed.sort_metric,
                raw_value=sort_val,
                formatted_value=f"{sort_val} {parsed.sort_metric.upper()}",
                source_tool="search_players",
                metric=parsed.sort_metric,
            )

        rows_data.append(
            {
                "player_id": p_id,
                "player_name": p_name,
                "teams": item.get("teams", []),
                "games_played": gp,
                "total_minutes": tot_min,
                "metrics": metrics,
            }
        )

    return {
        "context": ctx.to_dict(),
        "total_eligible_players": total_count,
        "sort_metric": parsed.sort_metric,
        "sort_direction": parsed.sort_direction,
        "items": rows_data,
    }


def tool_get_player_profile(
    session: Session,
    ledger: EvidenceLedger,
    pinned_context: dict[str, Any],
    args: dict[str, Any],
) -> dict[str, Any]:
    """Retrieve comprehensive research profile, stint breakdowns, and forecast status."""
    parsed = GetPlayerProfileArgs(**args)
    p_id, p_name = resolve_player_identifier(session, parsed.player_id)

    ctx = _resolve_context_for_tool(
        session,
        pinned_context,
        season=parsed.season,
        phase=parsed.phase,
        before_date_str=parsed.before_date,
        window=parsed.window,
    )

    profile = analytics_get_player_profile(
        session,
        context=ctx,
        player_id=p_id,
    )

    summaries = profile.get("summaries", {})
    window_metrics = summaries.get(ctx.window, {}) or summaries.get("season", {})
    pts = window_metrics.get("pts")
    pts_g = window_metrics.get("pts_per_game")
    gp = window_metrics.get("gp")

    if gp is not None:
        ledger.add(
            entity_type="player",
            entity_id=p_id,
            entity_name=p_name,
            field_name="games_played",
            raw_value=gp,
            formatted_value=f"{gp} GP",
            source_tool="get_player_profile",
            metric="gp",
        )
    if pts is not None:
        ledger.add(
            entity_type="player",
            entity_id=p_id,
            entity_name=p_name,
            field_name="pts",
            raw_value=pts,
            formatted_value=f"{pts} PTS",
            source_tool="get_player_profile",
            metric="pts",
        )
    if pts_g is not None:
        ledger.add(
            entity_type="player",
            entity_id=p_id,
            entity_name=p_name,
            field_name="pts_per_game",
            raw_value=pts_g,
            formatted_value=f"{pts_g:.1f} PPG",
            source_tool="get_player_profile",
            metric="pts_per_game",
        )

    # Register forecast status if available
    f_stat = profile.get("forecast_status", {})
    if f_stat.get("point_estimate") is not None:
        pe = f_stat["point_estimate"]
        ledger.add(
            entity_type="forecast",
            entity_id=p_id,
            entity_name=p_name,
            field_name="point_estimate",
            raw_value=pe,
            formatted_value=f"{pe:.1f} PTS",
            source_tool="get_player_profile",
            metric="point_estimate",
        )

    return profile


def tool_get_team_summary(
    session: Session,
    ledger: EvidenceLedger,
    pinned_context: dict[str, Any],
    args: dict[str, Any],
) -> dict[str, Any]:
    """Retrieve team record, production, defensive allowance, and season player cohort."""
    parsed = GetTeamSummaryArgs(**args)
    effective_team = resolve_team_identifier(parsed.team_id)

    ctx = _resolve_context_for_tool(
        session,
        pinned_context,
        season=parsed.season,
        phase=parsed.phase,
        before_date_str=parsed.before_date,
    )

    detail = analytics_get_team_detail(
        session,
        context=ctx,
        team_id=effective_team,
    )

    team_name = detail["team"]["name"]
    record = detail.get("record", {})
    wins = record.get("wins")
    losses = record.get("losses")
    win_pct = record.get("win_pct")

    if wins is not None and losses is not None:
        ledger.add(
            entity_type="team",
            entity_id=effective_team,
            entity_name=team_name,
            field_name="record",
            raw_value=f"{wins}-{losses}",
            formatted_value=f"{wins}-{losses}",
            source_tool="get_team_summary",
        )
    if win_pct is not None:
        ledger.add(
            entity_type="team",
            entity_id=effective_team,
            entity_name=team_name,
            field_name="win_pct",
            raw_value=win_pct,
            formatted_value=f"{win_pct * 100:.1f}%",
            source_tool="get_team_summary",
        )

    # Register top players from cohort
    cohort = detail.get("player_cohort", [])
    for p in cohort[:10]:
        cp_id = p["player_id"]
        cp_name = p["player_name"]
        c_pts = p.get("pts_per_game") or p.get("pts")
        if c_pts is not None:
            ledger.add(
                entity_type="player",
                entity_id=cp_id,
                entity_name=cp_name,
                field_name="pts",
                raw_value=c_pts,
                formatted_value=f"{c_pts} PTS",
                source_tool="get_team_summary",
                metric="pts",
            )

    return detail


def tool_compare_players(
    session: Session,
    ledger: EvidenceLedger,
    pinned_context: dict[str, Any],
    args: dict[str, Any],
) -> dict[str, Any]:
    """Compare two players across aligned metrics without declaring a forced winner."""
    parsed = ComparePlayersArgs(**args)
    p_a_id, p_a_name = resolve_player_identifier(session, parsed.player_a)
    p_b_id, p_b_name = resolve_player_identifier(session, parsed.player_b)

    ctx = _resolve_context_for_tool(
        session,
        pinned_context,
        season=parsed.season,
        phase=parsed.phase,
        before_date_str=parsed.before_date,
        window=parsed.window,
    )

    comp = analytics_compare_players(
        session,
        context=ctx,
        player_a_id=p_a_id,
        player_b_id=p_b_id,
    )

    for item in comp.get("aligned_metrics", []):
        m_key = item["metric"]
        val_a = item["value_a"]
        val_b = item["value_b"]
        diff = item["diff"]
        if val_a is not None:
            ledger.add(
                entity_type="player",
                entity_id=p_a_id,
                entity_name=p_a_name,
                field_name=m_key,
                raw_value=val_a,
                formatted_value=f"{val_a} {item['unit']}".strip(),
                source_tool="compare_players",
                metric=m_key,
            )
        if val_b is not None:
            ledger.add(
                entity_type="player",
                entity_id=p_b_id,
                entity_name=p_b_name,
                field_name=m_key,
                raw_value=val_b,
                formatted_value=f"{val_b} {item['unit']}".strip(),
                source_tool="compare_players",
                metric=m_key,
            )
        if diff is not None:
            ledger.add(
                entity_type="comparison",
                entity_id=f"{p_a_id}_vs_{p_b_id}",
                entity_name=f"{p_a_name} vs {p_b_name}",
                field_name=f"{m_key}_diff",
                raw_value=diff,
                formatted_value=f"{diff:+.1f} {item['unit']}".strip(),
                source_tool="compare_players",
                metric=m_key,
            )

    return comp


def tool_get_forecast(
    session: Session,
    ledger: EvidenceLedger,
    pinned_context: dict[str, Any],
    args: dict[str, Any],
) -> dict[str, Any]:
    """Retrieve genuine prospective next-game points forecast estimate, 80% interval, and scores."""
    parsed = GetForecastArgs(**args)
    if parsed.issuance_id:
        detail = get_forecast_issuance_detail(session, parsed.issuance_id)
        if detail is None:
            raise ValueError(f"Forecast issuance '{parsed.issuance_id}' not found.")
        pe = detail["point_estimate"]
        low = detail["interval_lower"]
        up = detail["interval_upper"]
        p_name = detail["player_name"]
        ledger.add(
            entity_type="forecast",
            entity_id=detail["id"],
            entity_name=p_name,
            field_name="point_estimate",
            raw_value=pe,
            formatted_value=f"{pe:.1f} PTS",
            source_tool="get_forecast",
            metric="point_estimate",
        )
        ledger.add(
            entity_type="forecast",
            entity_id=detail["id"],
            entity_name=p_name,
            field_name="interval_lower",
            raw_value=low,
            formatted_value=f"{low:.1f} PTS",
            source_tool="get_forecast",
            metric="interval_lower",
        )
        ledger.add(
            entity_type="forecast",
            entity_id=detail["id"],
            entity_name=p_name,
            field_name="interval_upper",
            raw_value=up,
            formatted_value=f"{up:.1f} PTS",
            source_tool="get_forecast",
            metric="interval_upper",
        )
        return detail

    p_id = None
    if parsed.player_id:
        p_id, _ = resolve_player_identifier(session, parsed.player_id)

    res = query_forecast_issuances(
        session,
        player_id=p_id,
        page=1,
        page_size=10,
    )

    for item in res.get("items", []):
        pe = item["point_estimate"]
        low = item["interval_lower"]
        up = item["interval_upper"]
        p_name = item["player_name"]
        ledger.add(
            entity_type="forecast",
            entity_id=item["id"],
            entity_name=p_name,
            field_name="point_estimate",
            raw_value=pe,
            formatted_value=f"{pe:.1f} PTS",
            source_tool="get_forecast",
            metric="point_estimate",
        )
        ledger.add(
            entity_type="forecast",
            entity_id=item["id"],
            entity_name=p_name,
            field_name="interval_range",
            raw_value=f"[{low:.1f}, {up:.1f}]",
            formatted_value=f"[{low:.1f}, {up:.1f}] PTS",
            source_tool="get_forecast",
        )

    return res


def tool_get_evaluation_summary(
    session: Session,
    ledger: EvidenceLedger,
    pinned_context: dict[str, Any],
    args: dict[str, Any],
) -> dict[str, Any]:
    """Retrieve points forecast evaluation report, active policy, and calibration."""
    active_policy = session.scalar(
        select(ModelPolicyActivation)
        .where(ModelPolicyActivation.is_active == True)  # noqa: E712
        .order_by(ModelPolicyActivation.activated_at.desc())
        .limit(1)
    )
    active_policy_dict = None
    if active_policy is not None:
        active_policy_dict = {
            "policy_name": active_policy.policy_name,
            "target_metric": active_policy.target_metric,
            "estimator_identity": active_policy.estimator_identity,
            "calibration_identity": active_policy.calibration_identity,
            "activated_at": active_policy.activated_at.isoformat(),
        }

    settings = get_settings()
    eval_dir = settings.artifacts_root / "evaluation"
    report_data: dict[str, Any] = {}

    target_run_id = args.get("run_id") or (
        active_policy.experiment_run_id if active_policy else None
    )
    run_dir = None
    if target_run_id and (eval_dir / target_run_id).is_dir():
        run_dir = eval_dir / target_run_id
    elif eval_dir.exists():
        for d in sorted(eval_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if d.is_dir() and (d / "evaluation-report.json").exists():
                run_dir = d
                break

    if run_dir and (run_dir / "evaluation-report.json").exists():
        try:
            report_data = json.loads(
                (run_dir / "evaluation-report.json").read_text(encoding="utf-8")
            )
        except Exception:
            report_data = {}

    final_test = report_data.get("final_test", {})
    baseline_mae = final_test.get("baseline_mae")
    challenger_mae = final_test.get("challenger_mae")
    if baseline_mae is not None:
        ledger.add(
            entity_type="evaluation",
            entity_id=run_dir.name if run_dir else "eval",
            entity_name="Points Evaluation",
            field_name="baseline_mae",
            raw_value=baseline_mae,
            formatted_value=f"{baseline_mae:.2f} MAE",
            source_tool="get_evaluation_summary",
        )
    if challenger_mae is not None:
        ledger.add(
            entity_type="evaluation",
            entity_id=run_dir.name if run_dir else "eval",
            entity_name="Points Evaluation",
            field_name="challenger_mae",
            raw_value=challenger_mae,
            formatted_value=f"{challenger_mae:.2f} MAE",
            source_tool="get_evaluation_summary",
        )

    return {
        "active_policy": active_policy_dict,
        "task": report_data.get("task", "next_game_points"),
        "final_test": final_test,
        "calibration": report_data.get("calibration", {}),
        "limitations": report_data.get("limitations", []),
    }


# -----------------------------------------------------------------------------
# Allowlisted Registry & Dispatcher
# -----------------------------------------------------------------------------

ALLOWLISTED_TOOLS: dict[str, Any] = {
    "get_catalog": tool_get_catalog,
    "get_metric_definition": tool_get_metric_definition,
    "search_players": tool_search_rank_players,
    "rank_players": tool_search_rank_players,
    "get_player_profile": tool_get_player_profile,
    "get_team_summary": tool_get_team_summary,
    "compare_players": tool_compare_players,
    "get_forecast": tool_get_forecast,
    "get_evaluation_summary": tool_get_evaluation_summary,
}


def execute_tool_call(
    session: Session,
    ledger: EvidenceLedger,
    pinned_context: dict[str, Any],
    tool_name: str,
    arguments: dict[str, Any],
    call_round: int,
) -> tuple[AssistantToolCallTrace, dict[str, Any] | str]:
    """Execute an allowlisted tool call with argument validation, bounds, and execution tracing."""
    t0 = time.perf_counter()

    if tool_name not in ALLOWLISTED_TOOLS:
        elapsed = (time.perf_counter() - t0) * 1000.0
        err_msg = f"Tool '{tool_name}' is not in the allowlisted read-only analytical tools."
        trace = AssistantToolCallTrace(
            round=call_round,
            tool_name=tool_name,
            arguments=arguments,
            status="rejected",
            result_summary=err_msg,
            execution_ms=round(elapsed, 2),
        )
        return trace, err_msg

    tool_func = ALLOWLISTED_TOOLS[tool_name]

    try:
        result = tool_func(session, ledger, pinned_context, arguments)
        elapsed = (time.perf_counter() - t0) * 1000.0
        summary = f"Executed {tool_name} successfully ({round(elapsed, 1)}ms)"
        if isinstance(result, dict):
            if "total_eligible_players" in result:
                summary += f"; found {result['total_eligible_players']} players"
            elif "team" in result:
                summary += f"; retrieved team {result['team'].get('tricode', '')}"
            elif "player" in result:
                summary += f"; retrieved profile for {result['player'].get('name', '')}"
            elif "point_estimate" in result:
                summary += f"; estimate={result['point_estimate']} PTS"

        trace = AssistantToolCallTrace(
            round=call_round,
            tool_name=tool_name,
            arguments=arguments,
            status="success",
            result_summary=summary,
            execution_ms=round(elapsed, 2),
        )
        return trace, result
    except Exception as exc:
        elapsed = (time.perf_counter() - t0) * 1000.0
        err_msg = f"Execution error in {tool_name}: {exc}"
        trace = AssistantToolCallTrace(
            round=call_round,
            tool_name=tool_name,
            arguments=arguments,
            status="error",
            result_summary=err_msg,
            execution_ms=round(elapsed, 2),
        )
        return trace, err_msg


# -----------------------------------------------------------------------------
# Tool Declarations (Function declarations for LLM providers)
# -----------------------------------------------------------------------------

ASSISTANT_TOOL_DECLARATIONS = [
    {
        "name": "get_catalog",
        "description": "Retrieve active release catalog metadata, default season, and phase.",
        "parameters": {
            "type": "object",
            "properties": {},
        },
    },
    {
        "name": "get_metric_definition",
        "description": "Retrieve definition, formula, unit, and limitations for a specific metric.",
        "parameters": {
            "type": "object",
            "properties": {
                "metric_key": {
                    "type": "string",
                    "description": "Metric key (e.g. 'pts_per_game', 'stl', 'blk', 'ts_pct').",
                },
            },
            "required": ["metric_key"],
        },
    },
    {
        "name": "search_players",
        "description": "Search and rank NBA players by specific box-score metrics.",
        "parameters": {
            "type": "object",
            "properties": {
                "name": {"type": "string", "description": "Player name search substring."},
                "team_id": {
                    "type": "string",
                    "description": "Team ID (e.g. '1610612761') or tricode (e.g. 'TOR').",
                },
                "min_games": {
                    "type": "integer",
                    "description": "Minimum games played in window (e.g. 5, 10).",
                },
                "min_minutes": {
                    "type": "number",
                    "description": "Minimum total minutes played in window.",
                },
                "min_avg_minutes": {
                    "type": "number",
                    "description": "Minimum average minutes per game.",
                },
                "sort_metric": {
                    "type": "string",
                    "description": "Metric to rank by (e.g. 'pts_per_game', 'stl_per_game').",
                },
                "sort_direction": {
                    "type": "string",
                    "enum": ["asc", "desc"],
                    "description": "Sort direction ('desc' or 'asc').",
                },
                "limit": {
                    "type": "integer",
                    "description": "Number of players to return (max 100).",
                },
            },
        },
    },
    {
        "name": "get_player_profile",
        "description": "Retrieve research profile, stint breakdowns, and forecast status.",
        "parameters": {
            "type": "object",
            "properties": {
                "player_id": {
                    "type": "string",
                    "description": "Player ID (e.g. '1630567') or name (e.g. 'Scottie Barnes').",
                },
            },
            "required": ["player_id"],
        },
    },
    {
        "name": "get_team_summary",
        "description": "Retrieve team record, points production, allowance, and player cohort.",
        "parameters": {
            "type": "object",
            "properties": {
                "team_id": {
                    "type": "string",
                    "description": "Team ID (e.g. '1610612761') or tricode (e.g. 'TOR').",
                },
            },
            "required": ["team_id"],
        },
    },
    {
        "name": "compare_players",
        "description": "Compare two players across aligned metrics without forced winner.",
        "parameters": {
            "type": "object",
            "properties": {
                "player_a": {
                    "type": "string",
                    "description": "First player ID or name (e.g. 'Scottie Barnes').",
                },
                "player_b": {
                    "type": "string",
                    "description": "Second player ID or name (e.g. 'RJ Barrett').",
                },
            },
            "required": ["player_a", "player_b"],
        },
    },
    {
        "name": "get_forecast",
        "description": "Retrieve prospective points forecast, 80% interval, and scored outcome.",
        "parameters": {
            "type": "object",
            "properties": {
                "player_id": {
                    "type": "string",
                    "description": "Player ID or name to look up prospective forecast for.",
                },
                "issuance_id": {
                    "type": "string",
                    "description": "Specific forecast issuance ID if known.",
                },
            },
        },
    },
    {
        "name": "get_evaluation_summary",
        "description": "Retrieve points forecast evaluation report, baseline MAE, and calibration.",
        "parameters": {
            "type": "object",
            "properties": {
                "run_id": {
                    "type": "string",
                    "description": "Evaluation run ID if inspecting a specific experiment run.",
                },
            },
        },
    },
]
