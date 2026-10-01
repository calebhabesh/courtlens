"""FastAPI router for CourtLoad workbench research endpoints."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtload.api.workbench_schemas import (
    AssistantAnswer,
    AssistantQueryRequest,
    AssistantStatusResponse,
    CreateJobRequest,
    ForecastIssuanceDetailResponse,
    ForecastsListResponse,
    InvestigationDetailResponse,
    InvestigationReproduceResponse,
    JobResponse,
    LineageResponse,
    MetricCatalogResponse,
    MetricComparisonItem,
    MetricDefinitionSchema,
    PlayerComparisonResponse,
    PlayerGameLogItem,
    PlayerGameLogResponse,
    PlayerProfileResponse,
    PlayerProfileStint,
    PlayerResearchItem,
    PlayerResearchResponse,
    PointsForecastEvaluationResponse,
    ResearchQuerySchema,
    SavedInvestigationResponse,
    SaveInvestigationRequest,
    TeamDetailResponse,
    TeamResearchItem,
    TeamResearchResponse,
    WorkbenchCatalogResponse,
    WorkbenchStatusResponse,
)
from courtload.config import get_settings
from courtload.database import get_db
from courtload.domain.metrics import list_metric_definitions
from courtload.services.assistant import get_assistant_status, run_assistant_query
from courtload.services.workbench_analytics import (
    ResearchQuery,
    compare_players,
    execute_player_research_query,
    export_investigation,
    get_investigation,
    get_lineage,
    get_player_game_log,
    get_player_profile,
    get_team_detail,
    get_teams_research,
    reproduce_investigation,
    resolve_workbench_context,
    save_investigation,
)
from courtload.services.workbench_forecasts import (
    get_forecast_issuance_detail,
    query_forecast_issuances,
)
from courtload.services.workbench_jobs import enqueue_job, get_workbench_status
from courtload.workbench_models import (
    ModelPolicyActivation,
    PlayerPortrait,
    SavedInvestigation,
    WorkbenchJob,
)

router = APIRouter(prefix="/workbench", tags=["workbench"])


def verify_operator_access(
    request: Request,
    authorization: str | None = Header(None),
    x_operator_token: str | None = Header(None, alias="X-Operator-Token"),
) -> None:
    """Validate operator credentials for background mutations."""
    settings = get_settings()
    client_host = request.client.host if request.client else ""
    is_localhost = client_host in ("127.0.0.1", "::1", "localhost", "testclient")

    token = x_operator_token
    if not token and authorization:
        parts = authorization.split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]

    expected = settings.operator_token.get_secret_value()

    if token and token == expected:
        return

    if token and token != expected:
        raise HTTPException(status_code=403, detail="Invalid operator token")

    if not is_localhost:
        raise HTTPException(status_code=401, detail="Operator token required for mutations")


@router.get("/catalog", response_model=WorkbenchCatalogResponse)
def get_catalog(
    release_id: str | None = Query(None, alias="releaseId"),
    session: Session = Depends(get_db),
) -> WorkbenchCatalogResponse:
    """Retrieve ready release, semantic signature, supported seasons, and capabilities."""
    context = resolve_workbench_context(session, release_id=release_id)
    return WorkbenchCatalogResponse(
        release_id=context.release_id,
        snapshot_id=context.snapshot_id,
        dataset_id=context.dataset_id,
        semantic_signature=context.semantic_signature,
        mode=context.mode,
        source=context.source,
        seasons=(context.supported_dates and [context.season]) or ["2023-24"],
        phases=[context.phase],
        default_season=context.season,
        default_phase=context.phase,
        default_before_date=context.default_before_date.isoformat(),
        supported_dates=context.supported_dates,
        coverage_start=context.coverage_start.isoformat(),
        coverage_end=context.coverage_end.isoformat(),
        metric_version="v1",
        published_at=context.published_at,
        warnings=context.warnings,
    )


@router.get("/metrics", response_model=MetricCatalogResponse)
def get_metrics() -> MetricCatalogResponse:
    """Retrieve versioned metric definitions and formula capabilities."""
    definitions = [MetricDefinitionSchema(**m.to_dict()) for m in list_metric_definitions()]
    return MetricCatalogResponse(version="v1", metrics=definitions)


@router.get("/players", response_model=PlayerResearchResponse)
def get_players(
    release_id: str | None = Query(None, alias="releaseId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    window: str = Query("season"),
    team_id: str | None = Query(None, alias="teamId"),
    name: str | None = Query(None),
    min_games: int | None = Query(None, alias="minGames", ge=0),
    min_minutes: float | None = Query(None, alias="minMinutes", ge=0.0),
    min_avg_minutes: float | None = Query(None, alias="minAvgMinutes", ge=0.0),
    sort_metric: str = Query("pts", alias="sortMetric"),
    sort_direction: str = Query("desc", alias="sortDirection"),
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = Query(None),
    session: Session = Depends(get_db),
) -> PlayerResearchResponse:
    """Browse, search, filter, and sort player research statistics."""
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase=phase,
        requested_before_date=before_date,
        requested_window=window,
    )

    query = ResearchQuery(
        release_id=release_id,
        season=context.season,
        phase=context.phase,
        before_date=context.before_date,
        window=context.window,
        team_id=team_id,
        name=name,
        min_games=min_games,
        min_minutes=min_minutes,
        min_avg_minutes=min_avg_minutes,
        sort_metric=sort_metric,
        sort_direction=sort_direction,
        limit=limit,
        cursor=cursor,
    )

    items_raw, total_count, next_cursor, has_more = execute_player_research_query(
        session, context, query
    )

    items = [
        PlayerResearchItem(
            player_id=r["player_id"],
            player_name=r["player_name"],
            teams=r["teams"],
            stints_count=r["stints_count"],
            games_played=r["games_played"],
            total_minutes=r["total_minutes"],
            metrics=r["metrics"],
            sample_sizes=r["sample_sizes"],
        )
        for r in items_raw
    ]

    return PlayerResearchResponse(
        context=context.to_dict(),
        query=ResearchQuerySchema(
            release_id=context.release_id,
            season=context.season,
            phase=context.phase,
            before_date=context.before_date.isoformat(),
            window=context.window,
            team_id=team_id,
            name=name,
            min_games=min_games,
            min_minutes=min_minutes,
            min_avg_minutes=min_avg_minutes,
            sort_metric=sort_metric,
            sort_direction=sort_direction,
            limit=limit,
        ),
        total_eligible_players=total_count,
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
        warnings=context.warnings,
    )


@router.get("/players/{id}", response_model=PlayerProfileResponse)
def get_player(
    id: str,
    release_id: str | None = Query(None, alias="releaseId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    session: Session = Depends(get_db),
) -> PlayerProfileResponse:
    """Retrieve detailed research profile for a player independent of forecast eligibility."""
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase=phase,
        requested_before_date=before_date,
    )

    profile = get_player_profile(session, context, player_id=id)

    stints = [
        PlayerProfileStint(
            team_id=s["team_id"],
            team_tricode=s["team_tricode"],
            team_name=s["team_name"],
            games_played=s["games_played"],
            metrics=s["metrics"],
        )
        for s in profile.get("stints", [])
    ]

    return PlayerProfileResponse(
        player=profile["player"],
        context=profile["context"],
        summaries=profile["summaries"],
        stints=stints,
        latest_team=profile["latest_team"],
        last_observed_date=profile["last_observed_date"],
        forecast_status=profile["forecast_status"],
        warnings=profile["warnings"],
    )


@router.get("/players/{id}/games", response_model=PlayerGameLogResponse)
def get_player_games_endpoint(
    id: str,
    release_id: str | None = Query(None, alias="releaseId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = Query(None),
    session: Session = Depends(get_db),
) -> PlayerGameLogResponse:
    """Retrieve prior-only game log for a player."""
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase=phase,
        requested_before_date=before_date,
    )

    player_dict, log_items, next_cursor, has_more = get_player_game_log(
        session, context, player_id=id, limit=limit, cursor=cursor
    )

    games = [PlayerGameLogItem(**g) for g in log_items]

    return PlayerGameLogResponse(
        player=player_dict,
        context=context.to_dict(),
        games=games,
        next_cursor=next_cursor,
        has_more=has_more,
        warnings=context.warnings,
    )


@router.get("/teams", response_model=TeamResearchResponse)
def get_teams(
    release_id: str | None = Query(None, alias="releaseId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    session: Session = Depends(get_db),
) -> TeamResearchResponse:
    """Retrieve team research standings, production, and allowance."""
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase=phase,
        requested_before_date=before_date,
    )

    teams_data = get_teams_research(session, context)
    teams = [TeamResearchItem(**t) for t in teams_data]

    return TeamResearchResponse(
        context=context.to_dict(),
        teams=teams,
        warnings=context.warnings,
        order_notice=(
            "Teams are sorted by win percentage descending, then point differential. "
            "Ties in record ordering do not establish official conference placement."
        ),
    )


@router.get("/teams/{id}", response_model=TeamDetailResponse)
def get_team_detail_endpoint(
    id: str,
    release_id: str | None = Query(None, alias="releaseId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    session: Session = Depends(get_db),
) -> TeamDetailResponse:
    """Retrieve team detail, production/allowance, and participation-scoped player cohort."""
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase=phase,
        requested_before_date=before_date,
    )

    detail = get_team_detail(session, context, team_id=id)
    return TeamDetailResponse(**detail)


@router.get("/compare", response_model=PlayerComparisonResponse)
def compare_players_endpoint(
    player_a_id: str | None = Query(None, alias="playerA"),
    player_b_id: str | None = Query(None, alias="playerB"),
    player_a: str | None = Query(None),
    player_b: str | None = Query(None),
    release_id: str | None = Query(None, alias="releaseId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    window: str = Query("season"),
    session: Session = Depends(get_db),
) -> PlayerComparisonResponse:
    """Compare two players under a single resolved query context with aligned metrics."""
    target_a = player_a_id or player_a
    target_b = player_b_id or player_b
    if not target_a or not target_b:
        raise HTTPException(
            status_code=422,
            detail=(
                "Both playerA (or player_a) and playerB (or player_b) "
                "query parameters are required."
            ),
        )

    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase=phase,
        requested_before_date=before_date,
        requested_window=window,
    )

    result = compare_players(session, context, player_a_id=target_a, player_b_id=target_b)
    aligned = [MetricComparisonItem(**item) for item in result["aligned_metrics"]]

    return PlayerComparisonResponse(
        context=result["context"],
        player_a=result["player_a"],
        player_b=result["player_b"],
        aligned_metrics=aligned,
        no_forced_winner_notice=result["no_forced_winner_notice"],
        warnings=result["warnings"],
    )


@router.get("/lineage", response_model=LineageResponse)
def get_lineage_endpoint(
    release_id: str | None = Query(None, alias="releaseId"),
    player_id: str | None = Query(None, alias="playerId"),
    game_id: str | None = Query(None, alias="gameId"),
    team_id: str | None = Query(None, alias="teamId"),
    session: Session = Depends(get_db),
) -> LineageResponse:
    """Retrieve contributing source observations and transform lineage path."""
    context = resolve_workbench_context(session, release_id=release_id)
    result = get_lineage(session, context, player_id=player_id, game_id=game_id, team_id=team_id)
    return LineageResponse(**result)


@router.post("/analyses", response_model=SavedInvestigationResponse, status_code=201)
def create_saved_analysis(
    payload: SaveInvestigationRequest,
    session: Session = Depends(get_db),
) -> SavedInvestigationResponse:
    """Save an analytical investigation manifest and reproducible result."""
    q_dict = payload.query
    context = resolve_workbench_context(
        session,
        release_id=q_dict.get("releaseId") or q_dict.get("release_id"),
        requested_season=q_dict.get("season"),
        requested_phase=q_dict.get("phase", "regular_season"),
        requested_before_date=(
            date.fromisoformat(q_dict["beforeDate"])
            if "beforeDate" in q_dict
            else (date.fromisoformat(q_dict["before_date"]) if "before_date" in q_dict else None)
        ),
        requested_window=q_dict.get("window", "season"),
    )

    query = ResearchQuery(
        release_id=context.release_id,
        season=context.season,
        phase=context.phase,
        before_date=context.before_date,
        window=context.window,
        team_id=q_dict.get("teamId") or q_dict.get("team_id"),
        name=q_dict.get("name"),
        min_games=q_dict.get("minGames") or q_dict.get("min_games"),
        min_minutes=q_dict.get("minMinutes") or q_dict.get("min_minutes"),
        min_avg_minutes=q_dict.get("minAvgMinutes") or q_dict.get("min_avg_minutes"),
        sort_metric=q_dict.get("sortMetric") or q_dict.get("sort_metric", "pts"),
        sort_direction=q_dict.get("sortDirection") or q_dict.get("sort_direction"),
    )

    inv = save_investigation(session, context, title=payload.title, query=query)
    inv_data = get_investigation(session, inv.id)

    return SavedInvestigationResponse(
        id=inv.id,
        title=inv.title,
        manifest_sha256=inv.manifest_sha256,
        result_sha256=inv.result_sha256,
        query=inv_data["query"],
        context=inv_data["context"],
        metric_version=inv_data["metric_version"],
        total_rows=inv_data["total_rows"],
        created_at=inv_data["created_at"],
    )


@router.get("/analyses", response_model=list[SavedInvestigationResponse])
def list_saved_analyses(
    session: Session = Depends(get_db),
) -> list[SavedInvestigationResponse]:
    """List all saved investigations."""
    records = session.scalars(
        select(SavedInvestigation).order_by(SavedInvestigation.created_at.desc())
    ).all()

    return [
        SavedInvestigationResponse(
            id=r.id,
            title=r.title,
            manifest_sha256=r.manifest_sha256,
            result_sha256=r.result_sha256,
            query=r.query_json,
            context=r.context_json,
            metric_version=r.metric_version,
            total_rows=len(r.query_json.get("metrics") or []),
            created_at=r.created_at.isoformat(),
        )
        for r in records
    ]


@router.get("/analyses/{id}", response_model=InvestigationDetailResponse)
def get_saved_analysis(
    id: str,
    session: Session = Depends(get_db),
) -> InvestigationDetailResponse:
    """Retrieve saved investigation details and results."""
    data = get_investigation(session, id)
    return InvestigationDetailResponse(**data)


@router.get("/analyses/{id}/reproduce", response_model=InvestigationReproduceResponse)
def reproduce_saved_analysis(
    id: str,
    session: Session = Depends(get_db),
) -> InvestigationReproduceResponse:
    """Re-execute analysis against bound inputs and verify bit-for-bit equivalence."""
    result = reproduce_investigation(session, id)
    return InvestigationReproduceResponse(**result)


@router.get("/analyses/{id}/export")
def export_saved_analysis(
    id: str,
    format: Literal["csv", "json"] = Query("csv"),
    session: Session = Depends(get_db),
) -> Response:
    """Export saved investigation as CSV or JSON with formula injection protection."""
    content_str, mime_type, filename = export_investigation(session, id, export_format=format)
    return Response(
        content=content_str,
        media_type=mime_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/status", response_model=WorkbenchStatusResponse)
def get_status(session: Session = Depends(get_db)) -> WorkbenchStatusResponse:
    """Retrieve operational pipeline, source freshness, worker health, and capabilities."""
    data = get_workbench_status(session)
    return WorkbenchStatusResponse(**data)


@router.get("/jobs", response_model=list[JobResponse])
def list_jobs(
    status: str | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
    session: Session = Depends(get_db),
) -> list[JobResponse]:
    """List recent background worker jobs."""
    query = select(WorkbenchJob).order_by(WorkbenchJob.created_at.desc()).limit(limit)
    if status:
        query = query.where(WorkbenchJob.status == status)
    records = session.scalars(query).all()
    return [
        JobResponse(
            job_id=r.id,
            job_type=r.job_type,
            status=r.status,
            stage=r.stage,
            owner=r.owner,
            started_at=r.started_at.isoformat() if r.started_at else None,
            finished_at=r.finished_at.isoformat() if r.finished_at else None,
            heartbeat_at=r.heartbeat_at.isoformat() if r.heartbeat_at else None,
            timings=r.timings_json or {},
            output_refs=r.output_refs_json or {},
            error_summary=r.error_summary,
            created_at=r.created_at.isoformat(),
        )
        for r in records
    ]


@router.get("/jobs/{id}", response_model=JobResponse)
def get_job(id: str, session: Session = Depends(get_db)) -> JobResponse:
    """Retrieve a single background worker job."""
    r = session.get(WorkbenchJob, id)
    if r is None:
        raise HTTPException(status_code=404, detail="Job not found")
    return JobResponse(
        job_id=r.id,
        job_type=r.job_type,
        status=r.status,
        stage=r.stage,
        owner=r.owner,
        started_at=r.started_at.isoformat() if r.started_at else None,
        finished_at=r.finished_at.isoformat() if r.finished_at else None,
        heartbeat_at=r.heartbeat_at.isoformat() if r.heartbeat_at else None,
        timings=r.timings_json or {},
        output_refs=r.output_refs_json or {},
        error_summary=r.error_summary,
        created_at=r.created_at.isoformat(),
    )


@router.post("/jobs", response_model=JobResponse, status_code=202)
def create_job(
    payload: CreateJobRequest,
    _auth: None = Depends(verify_operator_access),
    session: Session = Depends(get_db),
) -> JobResponse:
    """Enqueue an allowlisted worker job (bootstrap, refresh, portraits)."""
    try:
        job = enqueue_job(session, payload.job_type, payload.arguments)
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err

    return JobResponse(
        job_id=job.id,
        job_type=job.job_type,
        status=job.status,
        stage=job.stage,
        owner=job.owner,
        started_at=job.started_at.isoformat() if job.started_at else None,
        finished_at=job.finished_at.isoformat() if job.finished_at else None,
        heartbeat_at=job.heartbeat_at.isoformat() if job.heartbeat_at else None,
        timings=job.timings_json or {},
        output_refs=job.output_refs_json or {},
        error_summary=job.error_summary,
        created_at=job.created_at.isoformat(),
    )


@router.get("/media/players/{hash}")
def get_player_portrait_media(hash: str, session: Session = Depends(get_db)) -> FileResponse:
    """Serve cached allowlisted player portrait image by content SHA-256 hash."""
    portrait = session.scalar(select(PlayerPortrait).where(PlayerPortrait.content_sha256 == hash))
    if portrait is None:
        raise HTTPException(status_code=404, detail="Portrait not found")
    path = Path(portrait.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Portrait file missing on disk")
    return FileResponse(path, media_type=portrait.mime_type)


@router.get("/players/{id}/portrait")
def get_player_portrait(id: str, session: Session = Depends(get_db)) -> FileResponse:
    """Serve cached player portrait image by player ID with cache headers."""
    portrait = session.scalar(
        select(PlayerPortrait)
        .where(
            PlayerPortrait.player_id == id,
            PlayerPortrait.status == "active",
        )
        .order_by(PlayerPortrait.acquired_at.desc())
        .limit(1)
    )
    if portrait is None:
        raise HTTPException(status_code=404, detail="Portrait not found for player")
    path = Path(portrait.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Portrait file missing on disk")
    return FileResponse(
        path,
        media_type=portrait.mime_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )


@router.get("/forecasts/evaluation", response_model=PointsForecastEvaluationResponse)
def get_points_forecast_evaluation_endpoint(
    run_id: str | None = Query(None),
    session: Session = Depends(get_db),
) -> PointsForecastEvaluationResponse:
    """Retrieve points forecast evaluation report, model card, active policy, and error slices."""
    active_policy = session.scalar(
        select(ModelPolicyActivation)
        .where(ModelPolicyActivation.is_active == True)  # noqa: E712
        .order_by(ModelPolicyActivation.activated_at.desc())
        .limit(1)
    )
    active_policy_dict = None
    if active_policy is not None:
        active_policy_dict = {
            "id": active_policy.id,
            "policy_name": active_policy.policy_name,
            "target_metric": active_policy.target_metric,
            "estimator_identity": active_policy.estimator_identity,
            "calibration_identity": active_policy.calibration_identity,
            "eligibility_criteria": active_policy.eligibility_criteria_json,
            "activated_at": active_policy.activated_at.isoformat(),
            "experiment_run_id": active_policy.experiment_run_id,
        }

    settings = get_settings()
    eval_dir = settings.artifacts_root / "evaluation"

    target_run_id = run_id or (active_policy.experiment_run_id if active_policy else None)
    run_dir = None

    if target_run_id and (eval_dir / target_run_id).is_dir():
        run_dir = eval_dir / target_run_id
    elif (eval_dir / "b0e4bb3300011b5a3499").is_dir():
        run_dir = eval_dir / "b0e4bb3300011b5a3499"
    elif eval_dir.exists():
        for d in sorted(eval_dir.iterdir(), key=lambda p: p.stat().st_mtime, reverse=True):
            if d.is_dir() and (d / "evaluation-report.json").exists():
                run_dir = d
                break

    if run_dir is None or not (run_dir / "evaluation-report.json").exists():
        return PointsForecastEvaluationResponse(
            available=False,
            active_policy=active_policy_dict,
            message="No points forecast evaluation report found on disk.",
        )

    try:
        report_data = json.loads((run_dir / "evaluation-report.json").read_text(encoding="utf-8"))
    except Exception as err:
        return PointsForecastEvaluationResponse(
            available=False,
            active_policy=active_policy_dict,
            message=f"Failed to read evaluation report: {err}",
        )

    model_card = None
    if (run_dir / "model-card.md").exists():
        try:
            model_card = (run_dir / "model-card.md").read_text(encoding="utf-8")
        except Exception:
            model_card = None

    return PointsForecastEvaluationResponse(
        available=True,
        run_id=report_data.get("run_id", run_dir.name),
        task=report_data.get("task"),
        limitations=report_data.get("limitations", []),
        active_policy=active_policy_dict,
        promotion=report_data.get("promotion"),
        final_test=report_data.get("final_test"),
        validation=report_data.get("validation"),
        calibration=report_data.get("calibration"),
        model_card_markdown=model_card,
    )


@router.get("/forecasts", response_model=ForecastsListResponse)
def list_forecasts_endpoint(
    player_id: str | None = Query(None),
    team_id: str | None = Query(None),
    target_game_date: str | None = Query(None),
    status: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    session: Session = Depends(get_db),
) -> ForecastsListResponse:
    """Retrieve paginated genuine prospective forecast issuances, evidence, and scores."""
    parsed_date = date.fromisoformat(target_game_date) if target_game_date else None
    result = query_forecast_issuances(
        session,
        player_id=player_id,
        team_id=team_id,
        target_game_date=parsed_date,
        status=status,
        page=page,
        page_size=page_size,
    )
    return ForecastsListResponse(**result)


@router.get("/forecasts/{id}", response_model=ForecastIssuanceDetailResponse)
def get_forecast_detail_endpoint(
    id: str,
    session: Session = Depends(get_db),
) -> ForecastIssuanceDetailResponse:
    """Retrieve full detail for a prospective forecast issuance with feature vectors and scores."""
    detail = get_forecast_issuance_detail(session, id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Forecast issuance not found")
    return ForecastIssuanceDetailResponse(**detail)


@router.get("/assistant/status", response_model=AssistantStatusResponse)
def get_assistant_status_endpoint() -> AssistantStatusResponse:
    """Retrieve configuration status, active model, and capability boundaries of the assistant."""
    return get_assistant_status()


@router.post("/assistant/query", response_model=AssistantAnswer)
def assistant_query_endpoint(
    request: AssistantQueryRequest,
    session: Session = Depends(get_db),
) -> AssistantAnswer:
    """Execute a tool-backed natural language inquiry under pinned analytical context."""
    if len(request.question) > 2000:
        raise HTTPException(status_code=422, detail="Question exceeds 2,000 character limit.")
    try:
        return run_assistant_query(
            session=session,
            question=request.question,
            user_context=request.context,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
