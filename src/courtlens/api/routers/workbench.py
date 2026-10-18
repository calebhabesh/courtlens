"""FastAPI router for CourtLens workbench research endpoints."""

from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.api.workbench_schemas import (
    AggregateRankingBoardsRequest,
    AssistantAnswer,
    AssistantQueryRequest,
    AssistantStatusResponse,
    BackfillStatusResponse,
    BoardAggregationResult,
    CombineViewResponse,
    ComparePeriodsRequest,
    ComparePeriodsResponse,
    ComparisonCareer,
    ComparisonCareerResponse,
    ComparisonGroupPlayer,
    ComparisonGroupResponse,
    CreateCustomViewRequest,
    CreateJobRequest,
    CreateRankingBoardRequest,
    CreateTierListRequest,
    CrosswalkItem,
    CrosswalkResponse,
    CustomViewDefinition,
    DefenseViewResponse,
    DistributionMeasure,
    DistributionRequest,
    DistributionResponse,
    DraftClassesResponse,
    ForecastIssuanceDetailResponse,
    ForecastsListResponse,
    ImpactResponse,
    ImportWorkspaceRequest,
    InvestigationDetailResponse,
    InvestigationReproduceResponse,
    JobResponse,
    LineageResponse,
    LookupResponse,
    MatchupsViewResponse,
    MeasurementsQueryResponse,
    MetricCatalogResponse,
    MetricComparisonItem,
    MetricDefinitionSchema,
    OpponentContextRequest,
    OpponentContextResponse,
    PeriodMode,
    PersonalWorkspaceState,
    PlayerBioResponse,
    PlayerCareerResponse,
    PlayerCareerSeason,
    PlayerComparisonResponse,
    PlayerGameLogItem,
    PlayerGameLogResponse,
    PlayerMeasurementsDetailResponse,
    PlayerProfileResponse,
    PlayerProfileStint,
    PlayerResearchItem,
    PlayerResearchResponse,
    PlayerSeasonsResponse,
    PlayerTrackingResponse,
    PlayoffBracketResponse,
    PlayoffSeriesDetailResponse,
    PlayTypesViewResponse,
    PointsForecastEvaluationResponse,
    RankingBoardDefinition,
    RankOperationRequest,
    RankOperationResponse,
    ReorderViewsRequest,
    ResearchQuerySchema,
    RosterShapesResponse,
    SavedInvestigationResponse,
    SaveInvestigationRequest,
    ScheduleDatesResponse,
    SplitProfileRequest,
    SplitProfileResponse,
    SplitType,
    StatisticalPeersRequest,
    StatisticalPeersResponse,
    TeamDetailResponse,
    TeamFourFactorsResponse,
    TeamPeersResponse,
    TeamResearchItem,
    TeamResearchResponse,
    TeamScheduleResponse,
    ThreePointVariationResponse,
    TierListDefinition,
    TrackingViewResponse,
    UpdateCompareTrayRequest,
    UpdateCustomViewRequest,
    UpdateFavoritesRequest,
    UpdatePreferencesRequest,
    ValueArchetypesResponse,
    WorkbenchCatalogResponse,
    WorkbenchQueryRequest,
    WorkbenchQueryResponse,
    WorkbenchStatusResponse,
    WorkspaceBundle,
    WorkspacePreferences,
    WowyViewResponse,
)
from courtlens.config import get_settings
from courtlens.database import get_db
from courtlens.domain.context import CapabilityEntry, CapabilityStatus
from courtlens.domain.impact_catalog import RATING_METRICS, SERVING_VERSIONS
from courtlens.domain.impact_catalog import SERVING_CATALOG as METRIC_CATALOG
from courtlens.domain.metrics import (
    METRIC_CATALOG_VERSION,
    SUPPORTED_PHASES,
    list_metric_definitions,
)
from courtlens.domain.personal_state import CANONICAL_BUILTIN_VIEWS
from courtlens.domain.query_spec import ALLOWED_METADATA_FIELDS, QuerySpec, WindowKind
from courtlens.domain.query_url import deserialize_params_to_query, query_spec_to_research_query
from courtlens.domain.source_policy import pending_capabilities
from courtlens.services.analytical_ops import (
    compare_periods_service,
    distribution_service,
    opponent_context_service,
    rank_operation_service,
    split_profile_service,
    statistical_peers_service,
)
from courtlens.services.assistant.service import run_assistant_query
from courtlens.services.assistant.status import get_assistant_status
from courtlens.services.darko import darko_catalog_scope, darko_disclosure
from courtlens.services.entity_lookup import (
    lookup_entities,
    resolve_lookup_binding,
    scoped_team_associations,
)
from courtlens.services.identity_crosswalk import resolve_crosswalk
from courtlens.services.impact_serving import (
    impact_catalog_scope,
    impact_for_query,
    impact_query_fields,
    query_uses_impact,
)
from courtlens.services.measurements import (
    get_player_measurements_detail_service,
    query_measurements_service,
)
from courtlens.services.personal_state import (
    VersionConflictError,
    add_custom_view,
    add_favorite_player,
    add_to_compare_tray,
    aggregate_ranking_boards_service,
    clear_compare_tray,
    delete_custom_view,
    delete_ranking_board,
    delete_tier_list,
    export_workspace_bundle,
    get_or_create_workspace,
    import_workspace_bundle,
    remove_favorite_player,
    remove_from_compare_tray,
    reorder_custom_views,
    reset_workspace,
    save_ranking_board,
    save_tier_list,
    update_compare_tray,
    update_custom_view,
    update_favorites,
    update_preferences_service,
    update_workspace_state,
)
from courtlens.services.player_bio import current_teams, player_bio
from courtlens.services.player_honours import (
    availability,
    championships,
    teams_by_last_appearance,
)
from courtlens.services.portrait_derivatives import (
    PORTRAIT_DERIVATIVE_MIME,
    PORTRAIT_SIZES,
    portrait_derivative,
)
from courtlens.services.position_estimates import (
    draft_class_player_ids,
    draft_classes,
    position_player_ids,
    season_positions,
)
from courtlens.services.roster_shapes import roster_shapes
from courtlens.services.schedule_dates import schedule_dates
from courtlens.services.season_portraits import find_season_portrait
from courtlens.services.stats_catalog import stats_catalog_scope
from courtlens.services.stats_cohort_cache import presentation_page
from courtlens.services.stats_engine import (
    darko_query_fields,
    decode_cursor,
    execute_stats_query,
    stats_cohort_summary,
    stats_presentation_hash,
)
from courtlens.services.stats_feed_ingestion import feed_capabilities
from courtlens.services.stats_feed_views import (
    combine_view,
    defense_view,
    matchups_view,
    play_types_view,
    player_tracking,
    rounded,
    tracking_view,
)
from courtlens.services.team_analytics import (
    get_team_four_factors,
    get_team_peers,
    get_team_schedule,
    get_team_three_point_variation,
)
from courtlens.services.value_archetypes import (
    load_value_store,
    unknown_row,
    value_archetype_rows,
    value_archetypes_capability,
    value_archetypes_summary,
)
from courtlens.services.workbench_analytics import (
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
from courtlens.services.workbench_backfill import get_backfill_status
from courtlens.services.workbench_forecasts import (
    get_forecast_issuance_detail,
    query_forecast_issuances,
)
from courtlens.services.workbench_jobs import enqueue_job, get_workbench_status
from courtlens.services.workbench_playoffs import (
    get_playoff_bracket,
    get_playoff_series_detail,
)
from courtlens.services.wowy_serving import wowy_capability, wowy_view
from courtlens.workbench_models import (
    ModelPolicyActivation,
    PlayerPortrait,
    PlayerSeasonPortrait,
    SavedInvestigation,
    WorkbenchIdentity,
    WorkbenchJob,
    WorkbenchPlayerGame,
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


def verify_workspace_operator_access(
    request: Request,
    x_operator_token: str | None = Header(None, alias="X-Operator-Token"),
) -> None:
    """Workspace writes always require server operator credentials, including loopback."""
    if not x_operator_token:
        raise HTTPException(
            status_code=401, detail="Operator token required for workspace mutations"
        )
    verify_operator_access(request, x_operator_token=x_operator_token)


@router.get("/catalog", response_model=WorkbenchCatalogResponse)
def get_catalog(
    release_id: str | None = Query(None, alias="releaseId"),
    session: Session = Depends(get_db),
) -> WorkbenchCatalogResponse:
    """Retrieve ready release, semantic signature, supported seasons, and capabilities."""
    context = resolve_workbench_context(session, release_id=release_id)
    stats_scope = stats_catalog_scope(session, context)
    capabilities = {
        "core_stats": CapabilityEntry(
            name="core_stats",
            status=CapabilityStatus.AVAILABLE
            if stats_scope["seasons"]
            else CapabilityStatus.SOURCE_BLOCKED,
            seasons=stats_scope["seasons"],
            phases=stats_scope["phases"],
            coverage_start=context.coverage_start,
            coverage_end=context.coverage_end,
        ),
        "schedules": CapabilityEntry(
            name="schedules",
            status=CapabilityStatus.AVAILABLE,
            seasons=(context.supported_dates and [context.season]) or ["2023-24"],
            phases=[context.phase],
            coverage_start=context.coverage_start,
            coverage_end=context.coverage_end,
        ),
        "measurements": CapabilityEntry(
            name="measurements",
            status=CapabilityStatus.AVAILABLE,
            limitations=[
                (
                    "Listed roster measurements reflect team-reported values and are not "
                    "interchangeable with combine measurements."
                ),
                "Missing measurements are null, never zero.",
            ],
        ),
        "draft_metadata": CapabilityEntry(
            name="draft_metadata",
            status=CapabilityStatus.AVAILABLE,
            limitations=["Undrafted players have draft_type='undrafted' with null round/pick."],
        ),
        "identity_crosswalk": CapabilityEntry(
            name="identity_crosswalk",
            status=CapabilityStatus.AVAILABLE,
            limitations=[
                "Verified crosswalk mappings across NBA, ESPN, BRef, and Spotrac namespaces."
            ],
        ),
        "hypothetical": CapabilityEntry(
            name="hypothetical",
            status=CapabilityStatus.NOT_IMPLEMENTED,
        ),
    }
    capabilities["value_archetypes_pc09"] = value_archetypes_capability(load_value_store())
    capabilities["wowy"] = wowy_capability()
    # Measured PC07 feed coverage first; admitted-but-unobserved placeholders last.
    for name, entry in feed_capabilities(session).items():
        capabilities.setdefault(name, entry)
    for name, entry in pending_capabilities().items():
        capabilities.setdefault(name, entry)
    return WorkbenchCatalogResponse(
        release_id=context.release_id,
        snapshot_id=context.snapshot_id,
        dataset_id=context.dataset_id,
        semantic_signature=context.semantic_signature,
        mode=context.mode,
        source=context.source,
        **stats_scope,
        supported_dates=context.supported_dates,
        coverage_start=context.coverage_start.isoformat(),
        coverage_end=context.coverage_end.isoformat(),
        metric_version="v1",
        published_at=context.published_at,
        warnings=context.warnings,
        capabilities=capabilities,
        impact=impact_catalog_scope(),
        darko=darko_catalog_scope(),
    )


@router.get("/metrics", response_model=MetricCatalogResponse)
def get_metrics(version: str | None = None) -> MetricCatalogResponse:
    """Retrieve versioned metric definitions and formula capabilities."""
    target_version = version or METRIC_CATALOG_VERSION
    definitions = [
        MetricDefinitionSchema(**m.to_dict())
        for m in (
            SERVING_VERSIONS[target_version].values()
            if target_version in SERVING_VERSIONS
            else list_metric_definitions(version=target_version)
        )
    ]
    return MetricCatalogResponse(version=target_version, metrics=definitions)


@router.get("/impact", response_model=ImpactResponse)
def get_impact(
    season: str = Query("2025-26", pattern=r"^\d{4}-\d{2}$"),
    phase: Literal["regular_season", "playoffs"] = "regular_season",
    before_date: date = Query(date(2026, 7, 1), alias="beforeDate"),
    player_id: str | None = Query(None, alias="playerId", max_length=128),
    team_id: str | None = Query(None, alias="teamId", max_length=128),
    limit: int = Query(20, ge=1, le=100),
    window: WindowKind = WindowKind.SEASON,
    sort_metric: str = Query("rapm", alias="sortMetric", max_length=40),
    session: Session = Depends(get_db),
) -> ImpactResponse:
    """Bounded descriptive coefficients; no acquisition, fitting or raw source export."""
    from courtlens.domain.query_spec import TeamScope, WindowSpec

    query = QuerySpec(
        season=season,
        phase=phase,
        before_date=before_date,
        team_scope=TeamScope(team_id=team_id),
        window=WindowSpec(kind=WindowKind(window)),
    )
    result = impact_for_query(query, before_date.isoformat())
    players = result.pop("players")
    # PC11: Six-Factor ranks by one factor; only sealed rating coefficients are sortable.
    if sort_metric not in RATING_METRICS:
        raise HTTPException(422, f"sortMetric must be a served rating, not {sort_metric!r}.")
    ids = (
        [player_id]
        if player_id
        else sorted(
            [pid for pid in players if players[pid]["metrics"].get(sort_metric) is not None],
            key=lambda pid: (-(players[pid]["metrics"][sort_metric]), pid),
        )[:limit]
    )
    identities = session.execute(
        select(WorkbenchIdentity.external_id, WorkbenchIdentity.display_name).where(
            WorkbenchIdentity.kind == "player", WorkbenchIdentity.external_id.in_(ids)
        )
    ).all()
    names = {pid: name for pid, name in identities}
    return ImpactResponse(
        **result,
        total_players=len(players),
        players=[
            {"player_id": pid, "player_name": names.get(pid) or f"NBA player {pid}", **players[pid]}
            for pid in ids
            if pid in players
        ],
    )


@router.get("/roster-shapes", response_model=RosterShapesResponse)
def get_roster_shapes(
    dataset_id: str | None = Query(None, alias="datasetId"),
    release_id: str | None = Query(None, alias="releaseId"),
    session: Session = Depends(get_db),
) -> RosterShapesResponse:
    """PC10: 2026-27 projected rosters sized by sealed BPR value over replacement."""
    return RosterShapesResponse.model_validate(roster_shapes(session, dataset_id, release_id))


SEASON_PATTERN = r"^\d{4}-\d{2}$"
FeedPhase = Literal["regular_season", "playoffs"]


@router.get("/defense", response_model=DefenseViewResponse)
def get_defense_view(
    season: str | None = Query(None, pattern=SEASON_PATTERN),
    phase: FeedPhase | None = None,
    category: str = Query("overall", max_length=40),
    player_id: str | None = Query(None, alias="playerId", max_length=20),
    session: Session = Depends(get_db),
) -> DefenseViewResponse:
    """PC11 Defensive Matchups: NBA tracking defended shots, hustle and matchup exposure."""
    view = defense_view(session, season, phase, category, player_id)
    return DefenseViewResponse.model_validate(rounded(view))


@router.get("/season-matchups", response_model=MatchupsViewResponse)
def get_season_matchups(
    season: str | None = Query(None, pattern=SEASON_PATTERN),
    phase: FeedPhase | None = None,
    player_id: str | None = Query(None, alias="playerId", max_length=20),
    side: Literal["offense", "defense"] = "offense",
    limit: int = Query(15, ge=1, le=500),
    opponent_id: str | None = Query(None, alias="opponentId", max_length=20),
    session: Session = Depends(get_db),
) -> MatchupsViewResponse:
    """PC11 Player Matchups from NBA tracking season matchups (who guarded whom), optionally with
    one opponent's direct matchup both ways."""
    view = matchups_view(
        session, season, phase, player_id, side, limit=limit, opponent_id=opponent_id
    )
    return MatchupsViewResponse.model_validate(rounded(view))


@router.get("/play-types", response_model=PlayTypesViewResponse)
def get_play_types(
    season: str | None = Query(None, pattern=SEASON_PATTERN),
    phase: FeedPhase | None = None,
    side: Literal["offensive", "defensive"] = "offensive",
    player_id: str | None = Query(None, alias="playerId", max_length=20),
    session: Session = Depends(get_db),
) -> PlayTypesViewResponse:
    """PC11 play-type-adjusted scoring from NBA Synergy play types."""
    view = play_types_view(session, season, phase, side, player_id)
    return PlayTypesViewResponse.model_validate(rounded(view))


@router.get("/tracking", response_model=TrackingViewResponse)
def get_tracking(
    season: str | None = Query(None, pattern=SEASON_PATTERN),
    phase: FeedPhase | None = None,
    group: str = Query("drives", max_length=40),
    session: Session = Depends(get_db),
) -> TrackingViewResponse:
    """PC11 league tracking table (season totals; never joined into date-windowed Stats)."""
    view = tracking_view(session, season, phase, group)
    return TrackingViewResponse.model_validate(rounded(view))


@router.get("/players/{player_id}/tracking", response_model=PlayerTrackingResponse)
def get_player_tracking(
    player_id: str,
    season: str | None = Query(None, pattern=SEASON_PATTERN),
    phase: FeedPhase | None = None,
    session: Session = Depends(get_db),
) -> PlayerTrackingResponse:
    """PC11 player profile Tracking tab: every group with league percentiles."""
    view = player_tracking(session, player_id, season, phase)
    return PlayerTrackingResponse.model_validate(rounded(view))


@router.get("/players/{player_id}/bio", response_model=PlayerBioResponse)
def get_player_bio(
    player_id: str,
    season: str = Query(..., pattern=SEASON_PATTERN),
    before_date: date = Query(..., alias="beforeDate"),
    session: Session = Depends(get_db),
) -> PlayerBioResponse:
    """Player page header: listed size, age as of the scope, draft and combine values."""
    return PlayerBioResponse.model_validate(player_bio(session, player_id, season, before_date))


@router.get("/wowy", response_model=WowyViewResponse)
def get_wowy(
    season: str | None = Query(None, pattern=SEASON_PATTERN),
    phase: FeedPhase | None = None,
    team_id: str | None = Query(None, alias="teamId", max_length=20),
    a: str | None = Query(None, max_length=20),
    b: str | None = Query(None, max_length=20),
    session: Session = Depends(get_db),
) -> WowyViewResponse:
    """PC11 WOWY pair splits derived from sealed IM03 stints (D4); read-only."""
    view = wowy_view(session, season, phase, team_id, a, b)
    return WowyViewResponse.model_validate(rounded(view))


@router.get("/combine", response_model=CombineViewResponse)
def get_combine(
    draft_year: int | None = Query(None, alias="draftYear", ge=1947, le=2100),
    player_id: str | None = Query(None, alias="playerId", max_length=20),
    session: Session = Depends(get_db),
) -> CombineViewResponse:
    """PC11 Combine & Wingspan from the official NBA Draft Combine feeds."""
    return CombineViewResponse.model_validate(rounded(combine_view(session, draft_year, player_id)))


@router.get("/draft-classes", response_model=DraftClassesResponse)
def get_draft_classes(session: Session = Depends(get_db)) -> DraftClassesResponse:
    """NBA draft years available to the Stats draft-class filter (official draft history)."""
    return DraftClassesResponse(classes=draft_classes(session))


@router.get("/players/{player_id}/career", response_model=PlayerCareerResponse)
def get_player_career(
    player_id: str,
    phase: Literal["regular_season", "playoffs"] = "regular_season",
    release_id: str | None = Query(None, alias="releaseId"),
    session: Session = Depends(get_db),
) -> PlayerCareerResponse:
    """Player page career table in one read: every season row with its league table ranks."""
    from courtlens.services.player_career import player_career

    career = player_career(session, player_id, phase, release_id)

    def item(row: dict[str, Any] | None, season: str | list[str]) -> PlayerResearchItem | None:
        if row is None:
            return None
        return PlayerResearchItem(
            **{
                key: row.get(key)
                for key in (
                    "player_id",
                    "player_name",
                    "teams",
                    "stints_count",
                    "games_played",
                    "total_minutes",
                    "metrics",
                    "sample_sizes",
                    "impact_support",
                    "table_qualified",
                    "table_percentiles",
                    "table_cohort_sample_sizes",
                )
            },
            position=season_positions(season).get(player_id),
        )

    return PlayerCareerResponse(
        player_id=player_id,
        release_id=career.context.release_id,
        phase=career.phase,
        seasons=[
            PlayerCareerSeason(season=entry.season, item=item(entry.item, entry.season))
            for entry in career.seasons
        ],
        career=item(career.career, [entry.season for entry in career.seasons]),
    )


@router.get("/compare/career", response_model=ComparisonCareerResponse)
def get_comparison_career(
    player_a: str = Query(..., alias="playerA"),
    player_b: str = Query(..., alias="playerB"),
    season: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    before_date: date = Query(..., alias="beforeDate"),
    phase: Literal["regular_season", "playoffs"] = "regular_season",
    release_id: str | None = Query(None, alias="releaseId"),
    session: Session = Depends(get_db),
) -> ComparisonCareerResponse:
    """Both players' careers through the comparison cutoff, for Compare's Career view."""
    from courtlens.services.player_career import career_through

    careers = career_through(session, [player_a, player_b], phase, season, before_date, release_id)
    base = resolve_workbench_context(session, release_id=release_id, requested_phase=phase)
    available = availability(session, base.dataset_id, phase, before_date, [player_a, player_b])

    def entry(player_id: str) -> ComparisonCareer:
        career = careers[player_id]
        row = career.item
        return ComparisonCareer(
            player_id=player_id,
            seasons=career.seasons,
            availability=available.get(player_id) if career.seasons else None,
            item=PlayerResearchItem(**{key: row.get(key) for key in _RESEARCH_ITEM_FIELDS})
            if row is not None
            else None,
        )

    return ComparisonCareerResponse(
        season=season,
        phase=phase,
        before_date=before_date.isoformat(),
        player_a=entry(player_a),
        player_b=entry(player_b),
    )


_RESEARCH_ITEM_FIELDS = (
    "player_id",
    "player_name",
    "teams",
    "stints_count",
    "games_played",
    "total_minutes",
    "metrics",
    "sample_sizes",
)


@router.get("/compare/group", response_model=ComparisonGroupResponse)
def get_comparison_group(
    player_ids: list[str] = Query(..., alias="playerId", min_length=1, max_length=5),
    season: str | None = Query(None, pattern=r"^\d{4}-\d{2}$"),
    phase: Literal["regular_season", "playoffs"] = "regular_season",
    before_date: date | None = Query(None, alias="beforeDate"),
    window: WindowKind = WindowKind.SEASON,
    span: Literal["season", "career"] = "season",
    release_id: str | None = Query(None, alias="releaseId"),
    session: Session = Depends(get_db),
) -> ComparisonGroupResponse:
    """Up to five players under one scope, one column each, for Compare's grid (row 3, 64).

    Each column carries the player's Stats row (every counting mode), or their career through
    the cutoff, with the card's extras: teams by last appearance, titles and availability.
    One aggregate Stats query serves every player.
    """
    from courtlens.domain.query_spec import WindowSpec
    from courtlens.domain.stats_presentation import StatsPresentation
    from courtlens.services.player_career import career_query, career_through, serving_item
    from courtlens.services.workbench_analytics import season_context

    ids = list(dict.fromkeys(player_ids))
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase=phase,
        requested_before_date=before_date,
        requested_window=window.value,
    )
    if context.dataset_type != "workbench":
        raise HTTPException(status_code=422, detail="Grid comparisons need a workbench release")
    cutoff = context.before_date
    rows: dict[str, dict[str, Any] | None] = {}
    seasons: dict[str, list[str]] = {}
    if span == "career":
        for player_id, career in career_through(
            session, ids, phase, context.season, cutoff, release_id
        ).items():
            rows[player_id], seasons[player_id] = career.item, career.seasons
    else:
        query = career_query(context, context.season, cutoff).model_copy(
            update={"window": WindowSpec(kind=window)}
        )
        found, _, _, _ = execute_stats_query(
            session,
            season_context(context, context.season, cutoff),
            query,
            is_export=True,
            max_export_rows=len(ids),
            presentation=StatsPresentation(),
            cohort_percentiles=False,
            subject_player_ids=ids,
        )
        rows = {row["player_id"]: serving_item(row) for row in found}
    ordered = teams_by_last_appearance(
        session,
        context.dataset_id,
        None if span == "career" else context.season,
        context.phase,
        cutoff,
        ids,
    )
    titles = championships(session, context.dataset_id, cutoff, ids)
    # Availability needs the teams' schedule as its span: season-to-date, or the whole career.
    available = (
        availability(
            session,
            context.dataset_id,
            context.phase,
            cutoff,
            ids,
            None if span == "career" else context.season,
        )
        if span == "career" or window == WindowKind.SEASON
        else {}
    )
    names: dict[str, str] = {
        external_id: display_name
        for external_id, display_name in session.execute(
            select(WorkbenchIdentity.external_id, WorkbenchIdentity.display_name).where(
                WorkbenchIdentity.kind == "player", WorkbenchIdentity.external_id.in_(ids)
            )
        ).all()
    }

    unknown = [player_id for player_id in ids if player_id not in names and player_id not in rows]
    if unknown:
        raise HTTPException(status_code=404, detail="player not found in snapshot")

    def column(player_id: str) -> ComparisonGroupPlayer:
        row = rows.get(player_id)
        played = row is not None and bool(row.get("games_played"))
        return ComparisonGroupPlayer(
            player_id=player_id,
            name=names.get(player_id) or (row or {}).get("player_name") or player_id,
            item=PlayerResearchItem(**{key: row.get(key) for key in _RESEARCH_ITEM_FIELDS})
            if row is not None
            else None,
            seasons=seasons.get(player_id) if span == "career" else None,
            teams_chronological=ordered.get(player_id, []),
            championships=titles.get(player_id),
            availability=available.get(player_id) if played else None,
        )

    return ComparisonGroupResponse(
        context={
            "release_id": context.release_id,
            "season": context.season,
            "phase": context.phase,
            "before_date": cutoff.isoformat(),
            "window": window.value,
        },
        span=span,
        players=[column(player_id) for player_id in ids],
    )


@router.get("/player-seasons", response_model=PlayerSeasonsResponse)
def get_player_seasons(
    player_ids: list[str] = Query(..., alias="playerId", min_length=1, max_length=8),
    phase: str = Query("regular_season"),
    release_id: str | None = Query(None, alias="releaseId"),
    session: Session = Depends(get_db),
) -> PlayerSeasonsResponse:
    """Seasons each player has game rows in, so a stat trend queries only those seasons."""
    context = resolve_workbench_context(session, release_id=release_id, requested_phase=phase)
    seasons: dict[str, list[str]] = {pid: [] for pid in player_ids}
    if context.dataset_type == "workbench":
        rows = session.execute(
            select(WorkbenchPlayerGame.player_id, WorkbenchPlayerGame.season)
            .where(
                WorkbenchPlayerGame.dataset_id == context.dataset_id,
                WorkbenchPlayerGame.phase == phase,
                WorkbenchPlayerGame.player_id.in_(player_ids),
            )
            .distinct()
        ).all()
        for pid, season in rows:
            seasons[pid].append(season)
    else:
        seasons = {pid: [context.season] for pid in player_ids}
    return PlayerSeasonsResponse(
        phase=phase, seasons={pid: sorted(values) for pid, values in seasons.items()}
    )


@router.get("/value-archetypes", response_model=ValueArchetypesResponse)
def get_value_archetypes(
    player_ids: list[str] | None = Query(None, alias="playerId", max_length=64),
    limit: int = Query(50, ge=1, le=1000),
    session: Session = Depends(get_db),
) -> ValueArchetypesResponse:
    """Sealed PC09 value (BPR) and derived archetypes; no fitting or raw source export."""
    store = load_value_store()
    summary = value_archetypes_summary(store)
    rows = value_archetype_rows(store) if store else {}
    total = len(rows)
    if player_ids:
        ids = list(dict.fromkeys(player_ids))
        rows |= {pid: unknown_row(pid) for pid in ids if pid not in rows}
    else:
        # Known values first, highest first; unknown values keep a stable id order.
        ids = sorted(
            rows,
            key=lambda pid: (
                rows[pid]["value"] is None,
                -(rows[pid]["value"] or {}).get("value", 0.0),
                pid,
            ),
        )[:limit]
    identities = session.execute(
        select(WorkbenchIdentity.external_id, WorkbenchIdentity.display_name).where(
            WorkbenchIdentity.kind == "player", WorkbenchIdentity.external_id.in_(ids)
        )
    ).all()
    names = {pid: name for pid, name in identities}
    return ValueArchetypesResponse(
        **summary,
        total_players=total,
        players=[
            {"player_name": names.get(pid) or f"NBA player {pid}", **rows[pid]} for pid in ids
        ],
    )


@router.post("/query", response_model=WorkbenchQueryResponse)
def execute_query_endpoint(
    payload: WorkbenchQueryRequest,
    session: Session = Depends(get_db),
) -> WorkbenchQueryResponse:
    """Read-only typed v2 query execution under canonical QuerySpec."""
    spec = payload.query

    # Validate metric selectors and sort metric against catalog
    for s in spec.sort:
        if s.field not in METRIC_CATALOG and s.field not in ALLOWED_METADATA_FIELDS:
            valid_metrics = ", ".join(sorted(METRIC_CATALOG.keys()))
            raise HTTPException(
                status_code=422,
                detail=f"unsupported sort metric '{s.field}'; valid metrics are: {valid_metrics}",
            )
    for selector in spec.metric_selectors:
        if selector.key not in METRIC_CATALOG:
            valid_metrics = ", ".join(sorted(METRIC_CATALOG.keys()))
            raise HTTPException(
                status_code=422,
                detail=(
                    f"unsupported metric selector '{selector.key}'; "
                    f"valid metrics are: {valid_metrics}"
                ),
            )

    context = resolve_workbench_context(
        session,
        release_id=spec.release_id,
        requested_season=spec.season,
        requested_phase=spec.phase,
        requested_before_date=spec.before_date,
        requested_window=spec.window.kind.value,
    )

    presentation = payload.presentation
    position_scope: str | list[str] = spec.season_scope.seasons or spec.season or context.season
    if presentation is not None and (presentation.positions or presentation.draft_year):
        # Positions and draft classes narrow the displayed players like favorites; the
        # analytical cohort and its percentiles are unchanged.
        shown = set(presentation.player_ids) if presentation.player_ids is not None else None
        for ids in (
            position_player_ids(position_scope, presentation.positions)
            if presentation.positions
            else None,
            draft_class_player_ids(session, presentation.draft_year)
            if presentation.draft_year
            else None,
        ):
            if ids is not None:
                shown = ids if shown is None else shown & ids
        payload = payload.model_copy(
            update={
                "presentation": presentation.model_copy(
                    update={
                        "player_ids": sorted(shown or set()),
                        "positions": None,
                        "draft_year": None,
                    }
                )
            }
        )
    positions = season_positions(position_scope)
    view_impact = impact_query_fields(spec)

    # Presentation queries page through a cached whole cohort: display filters never re-run
    # the analytics (services/stats_cohort_cache.py).
    cached = (
        presentation_page(session, context, spec, payload.presentation)
        if payload.presentation is not None
        else None
    )
    eligible: int | None = None
    if cached is not None:
        items_raw, total_count, next_cursor, has_more, eligible = cached
    else:
        items_raw, total_count, next_cursor, has_more = execute_stats_query(
            session, context, spec, presentation=payload.presentation
        )
    cohort = (
        stats_cohort_summary(session, context, spec, payload.presentation, eligible)
        if payload.presentation is not None
        else None
    )

    table_cohort = None
    if payload.presentation is not None and payload.presentation.table_percentiles:
        from courtlens.services.table_percentiles import annotate_players

        table_cohort = annotate_players(session, context, spec, items_raw)

    listings = current_teams(session, [r["player_id"] for r in items_raw])
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
            percentiles=r.get("percentiles"),
            cohort_sample_sizes=r.get("cohort_sample_sizes"),
            # Support for the view's own impact columns, not every sealed metric (~26 KB a row).
            impact_support={
                key: value
                for key, value in (r.get("impact_support") or {}).items()
                if key in view_impact
            }
            if r.get("impact_support") is not None
            else None,
            table_qualified=r.get("table_qualified"),
            table_percentiles=r.get("table_percentiles"),
            table_cohort_sample_sizes=r.get("table_cohort_sample_sizes"),
            position=positions.get(r["player_id"]),
            current_team=listings.get(r["player_id"]),
        )
        for r in items_raw
    ]

    return WorkbenchQueryResponse(
        context=context.to_dict(),
        query=spec,
        total_eligible_players=cohort["eligible_players"] if cohort is not None else total_count,
        total_output_players=total_count if cohort is not None else None,
        output_offset=(
            decode_cursor(
                spec.page.cursor, [stats_presentation_hash(context, spec, payload.presentation)]
            )
            if payload.presentation is not None and spec.page.cursor
            else (0 if payload.presentation is not None else None)
        ),
        cohort=cohort,
        table_cohort=table_cohort,
        items=items,
        next_cursor=next_cursor,
        has_more=has_more,
        warnings=context.warnings,
        impact={
            k: v
            for k, v in impact_for_query(spec, context.before_date.isoformat()).items()
            if k != "players"
        }
        if query_uses_impact(spec)
        else None,
        darko=darko_disclosure(spec, context.before_date) if darko_query_fields(spec) else None,
    )


@router.get("/lookup", response_model=LookupResponse)
def get_lookup(
    q: str = Query("", description="Search query string"),
    release_id: str | None = Query(None, alias="releaseId"),
    release_id_alt: str | None = Query(None, alias="release_id"),
    season: str | None = Query(None, description="Optional season context"),
    phase: str | None = Query(None, description="Optional observed phase"),
    before_date: date | None = Query(None, description="Exclusive observed cutoff"),
    before_date_alt: date | None = Query(None, alias="beforeDate"),
    kinds: str | None = Query(
        None, description="Optional comma-separated kinds: player, team, page"
    ),
    limit: int = Query(10, ge=1, le=20, description="Maximum matches to return (1-20)"),
    session: Session = Depends(get_db),
) -> LookupResponse:
    """Incremental entity discovery API for players, teams, and navigation pages."""
    effective_release, dataset_id = resolve_lookup_binding(session, release_id or release_id_alt)

    allowed_kinds = None
    if kinds:
        allowed_kinds = [k.strip().lower() for k in kinds.split(",") if k.strip()]

    return lookup_entities(
        session=session,
        query=q,
        release_id=effective_release,
        dataset_id=dataset_id,
        season=season,
        phase=phase,
        before_date=before_date or before_date_alt,
        kinds=allowed_kinds,
        limit=limit,
    )


@router.get("/players", response_model=PlayerResearchResponse)
def get_players(
    release_id: str | None = Query(None, alias="releaseId"),
    release_id_alt: str | None = Query(None, alias="release_id"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    before_date_alt: date | None = Query(None, alias="before_date"),
    window: str = Query("season"),
    team_id: str | None = Query(None, alias="teamId"),
    team_id_alt: str | None = Query(None, alias="team_id"),
    name: str | None = Query(None),
    min_games: int | None = Query(None, alias="minGames", ge=0),
    min_games_alt: int | None = Query(None, alias="min_games", ge=0),
    min_minutes: float | None = Query(None, alias="minMinutes", ge=0.0),
    min_minutes_alt: float | None = Query(None, alias="min_minutes", ge=0.0),
    min_avg_minutes: float | None = Query(None, alias="minAvgMinutes", ge=0.0),
    min_avg_minutes_alt: float | None = Query(None, alias="min_avg_minutes", ge=0.0),
    sort_metric: str = Query("pts", alias="sortMetric"),
    sort_metric_alt: str | None = Query(None, alias="sort_metric"),
    sort_direction: str = Query("desc", alias="sortDirection"),
    sort_direction_alt: str | None = Query(None, alias="sort_direction"),
    limit: int = Query(50, ge=1, le=100),
    cursor: str | None = Query(None),
    session: Session = Depends(get_db),
) -> PlayerResearchResponse:
    """Browse, search, filter, and sort player research statistics."""
    eff_release_id = release_id or release_id_alt
    eff_before_date = before_date or before_date_alt
    eff_team_id = team_id or team_id_alt
    eff_min_games = min_games if min_games is not None else min_games_alt
    eff_min_minutes = min_minutes if min_minutes is not None else min_minutes_alt
    eff_min_avg_minutes = min_avg_minutes if min_avg_minutes is not None else min_avg_minutes_alt
    eff_sort_metric = (sort_metric_alt or sort_metric).strip().lower()
    eff_sort_direction = (sort_direction_alt or sort_direction).strip().lower()

    if eff_sort_metric not in METRIC_CATALOG and eff_sort_metric not in ALLOWED_METADATA_FIELDS:
        valid_keys = ", ".join(sorted(METRIC_CATALOG.keys()))
        raise HTTPException(
            status_code=422,
            detail=f"unsupported metric '{eff_sort_metric}'; valid metrics are: {valid_keys}",
        )

    if phase not in SUPPORTED_PHASES:
        valid_phases = ", ".join(SUPPORTED_PHASES)
        raise HTTPException(
            status_code=422,
            detail=f"unsupported phase '{phase}'; valid phases are: {valid_phases}",
        )

    context = resolve_workbench_context(
        session,
        release_id=eff_release_id,
        requested_season=season,
        requested_phase=phase,
        requested_before_date=eff_before_date,
        requested_window=window,
    )

    query = ResearchQuery(
        release_id=eff_release_id,
        season=context.season,
        phase=context.phase,
        before_date=context.before_date,
        window=context.window,
        team_id=eff_team_id,
        name=name,
        min_games=eff_min_games,
        min_minutes=eff_min_minutes,
        min_avg_minutes=eff_min_avg_minutes,
        sort_metric=eff_sort_metric,
        sort_direction=eff_sort_direction,
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
            team_id=eff_team_id,
            name=name,
            min_games=eff_min_games,
            min_minutes=eff_min_minutes,
            min_avg_minutes=eff_min_avg_minutes,
            sort_metric=eff_sort_metric,
            sort_direction=eff_sort_direction,
            limit=limit,
            cursor=cursor,
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
        sample_sizes=profile["sample_sizes"],
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

    teams_data, league_averages = get_teams_research(session, context)
    from courtlens.services.table_percentiles import annotate_teams

    annotate_teams(teams_data)
    teams = [TeamResearchItem(**t) for t in teams_data]

    return TeamResearchResponse(
        context=context.to_dict(),
        teams=teams,
        warnings=context.warnings,
        order_notice=(
            "Teams are sorted by win percentage descending, then point differential. "
            "Ties in record ordering do not establish official conference placement."
        ),
        league_averages=league_averages,
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


@router.get("/teams/{id}/schedule", response_model=TeamScheduleResponse)
def get_team_schedule_endpoint(
    id: str,
    release_id: str | None = Query(None, alias="releaseId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    session: Session = Depends(get_db),
) -> TeamScheduleResponse:
    """Retrieve canonical team schedule, rest days, back-to-backs, and splits prior to cutoff."""
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase=phase,
        requested_before_date=before_date,
    )
    result = get_team_schedule(session, context, team_id=id)
    return TeamScheduleResponse(**result)


@router.get("/schedule/dates", response_model=ScheduleDatesResponse)
def get_schedule_dates_endpoint(
    start: date,
    end: date,
    response: Response,
    release_id: str | None = Query(None, alias="releaseId"),
    phase: str | None = Query(None),
    before_date: date | None = Query(None, alias="beforeDate"),
    focus: date | None = Query(None),
    session: Session = Depends(get_db),
) -> ScheduleDatesResponse:
    """Per-date scheduled and admitted final game counts for a release (Live date strip)."""
    context = resolve_workbench_context(session, release_id=release_id)
    response.headers["Cache-Control"] = "no-store"
    result = schedule_dates(
        session, context, start, end, phase=phase, before_date=before_date, focus=focus
    )
    return ScheduleDatesResponse(**result)


@router.get("/teams/{id}/four-factors", response_model=TeamFourFactorsResponse)
def get_team_four_factors_endpoint(
    id: str,
    release_id: str | None = Query(None, alias="releaseId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    session: Session = Depends(get_db),
) -> TeamFourFactorsResponse:
    """Retrieve Dean Oliver Four Factors (offense & defense) with league ranks and percentiles."""
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase=phase,
        requested_before_date=before_date,
    )
    result = get_team_four_factors(session, context, team_id=id)
    return TeamFourFactorsResponse(**result)


@router.get("/teams/{id}/peers", response_model=TeamPeersResponse)
def get_team_peers_endpoint(
    id: str,
    limit: int = Query(10, ge=1, le=30),
    release_id: str | None = Query(None, alias="releaseId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    session: Session = Depends(get_db),
) -> TeamPeersResponse:
    """Retrieve statistical peer teams based on Four Factors, tempo, and ratings."""
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase=phase,
        requested_before_date=before_date,
    )
    result = get_team_peers(session, context, team_id=id, limit=limit)
    return TeamPeersResponse(**result)


@router.get("/teams/{id}/three-point-variation", response_model=ThreePointVariationResponse)
def get_team_three_point_variation_endpoint(
    id: str,
    release_id: str | None = Query(None, alias="releaseId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    session: Session = Depends(get_db),
) -> ThreePointVariationResponse:
    """Retrieve Feature F18 Three-Point Variation scenario holding volume constant."""
    context = resolve_workbench_context(
        session,
        release_id=release_id,
        requested_season=season,
        requested_phase=phase,
        requested_before_date=before_date,
    )
    result = get_team_three_point_variation(session, context, team_id=id)
    return ThreePointVariationResponse(**result)


# --- Block B17: Playoff / Series Endpoints ---


@router.get("/playoffs", response_model=PlayoffBracketResponse)
def get_playoffs_endpoint(
    season: int | str = Query(
        2024, description="Playoff season ending year (e.g. 2024) or string (e.g. 2023-24)"
    ),
    cutoff_date: date | None = Query(
        None, description="Optional temporal replay cutoff date (YYYY-MM-DD)"
    ),
    cutoffDate: date | None = Query(None, description="CamelCase alias for cutoff_date"),
    session: Session = Depends(get_db),
) -> PlayoffBracketResponse:
    """Retrieve canonical playoff bracket hierarchy, rounds 1-4, and seed evidence."""
    effective_cutoff = cutoff_date or cutoffDate
    return get_playoff_bracket(session, season=season, cutoff_date=effective_cutoff)


@router.get("/playoffs/series/{series_id}", response_model=PlayoffSeriesDetailResponse)
def get_playoff_series_detail_endpoint(
    series_id: str,
    cutoff_date: date | None = Query(
        None, description="Optional temporal replay cutoff date (YYYY-MM-DD)"
    ),
    cutoffDate: date | None = Query(None, description="CamelCase alias for cutoff_date"),
    session: Session = Depends(get_db),
) -> PlayoffSeriesDetailResponse:
    """Retrieve playoff series detail with 7-game cards, Four Factors, and player stats."""
    effective_cutoff = cutoff_date or cutoffDate
    return get_playoff_series_detail(
        session, series_id_or_slug=series_id, cutoff_date=effective_cutoff
    )


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

    associations = scoped_team_associations(
        session,
        context.dataset_id,
        context.season,
        context.phase,
        context.before_date,
        [target_a, target_b],
        window=context.window,
    )

    ordered = teams_by_last_appearance(
        session,
        context.dataset_id,
        context.season,
        context.phase,
        context.before_date,
        [target_a, target_b],
    )
    titles = championships(session, context.dataset_id, context.before_date, [target_a, target_b])
    # Availability needs the season's team schedule as its span, so only season-to-date has it.
    available = (
        availability(
            session,
            context.dataset_id,
            context.phase,
            context.before_date,
            [target_a, target_b],
            context.season,
        )
        if context.window == "season"
        else {}
    )

    # A player without games in the scope has no profile name; use the identity catalog's name
    # instead of echoing the ID (alignment row 3, 39).
    names: dict[str, str] = {
        external_id: display_name
        for external_id, display_name in session.execute(
            select(WorkbenchIdentity.external_id, WorkbenchIdentity.display_name).where(
                WorkbenchIdentity.kind == "player",
                WorkbenchIdentity.external_id.in_([target_a, target_b]),
            )
        ).all()
    }

    # API-only identity enrichment leaves analytical/saved serializers unchanged.
    def with_teams(player: dict[str, Any]) -> dict[str, Any]:
        association = associations.get(player["id"])
        name = player.get("name")
        return {
            **player,
            "name": names.get(player["id"], name) if not name or name == player["id"] else name,
            "teams": association.teams if association else [],
            "teams_chronological": ordered.get(player["id"], []),
            "championships": titles.get(player["id"]),
            "availability": available.get(player["id"]),
        }

    return PlayerComparisonResponse(
        context=result["context"],
        player_a=with_teams(result["player_a"]),
        player_b=with_teams(result["player_b"]),
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
    spec = deserialize_params_to_query(payload.query)
    context = resolve_workbench_context(
        session,
        release_id=spec.release_id,
        requested_season=spec.season,
        requested_phase=spec.phase,
        requested_before_date=spec.before_date,
        requested_window=spec.window.kind.value,
    )
    if query_uses_impact(spec) and spec.impact_manifest_sha256 is None:
        digest = impact_for_query(spec, context.before_date.isoformat())["manifest_sha256"]
        spec = spec.model_copy(update={"impact_manifest_sha256": digest})
    if darko_query_fields(spec) and spec.darko_manifest_sha256 is None:
        digest = darko_disclosure(spec, context.before_date)["manifest_sha256"]
        if digest is None:
            raise HTTPException(
                status_code=422,
                detail="No sealed DARKO bundle is available to retain this investigation.",
            )
        spec = spec.model_copy(update={"darko_manifest_sha256": digest})
    query = query_spec_to_research_query(spec)
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


@router.get("/players/{id}/portrait", response_model=None)
def get_player_portrait(
    id: str,
    size: int | None = Query(
        None, description=f"Square face-framed derivative in pixels: one of {PORTRAIT_SIZES}"
    ),
    season: str | None = Query(
        None,
        pattern=r"^\d{4}-\d{2}$",
        description="Prefer the player's headshot from this season (2015-16 on).",
    ),
    team: str | None = Query(
        None,
        pattern=r"^[A-Za-z]{2,4}$|^[0-9]{1,12}$",
        description="With season: prefer that team's headshot (tricode or NBA team ID).",
    ),
    session: Session = Depends(get_db),
) -> FileResponse | Response:
    """Serve a player's cached portrait, or a display-sized derivative of it, by player ID.

    With ``season`` the team-season headshot is served when one was acquired; otherwise the
    current one. ``X-Portrait-Season`` names the season actually served (absent for current).
    """
    if size is not None and size not in PORTRAIT_SIZES:
        raise HTTPException(status_code=422, detail=f"size must be one of {PORTRAIT_SIZES}")
    seasonal = find_season_portrait(session, id, season, team) if season else None
    portrait: PlayerPortrait | PlayerSeasonPortrait | None = seasonal or session.scalar(
        select(PlayerPortrait)
        .where(
            PlayerPortrait.player_id == id,
            PlayerPortrait.status == "active",
        )
        .order_by(PlayerPortrait.acquired_at.desc())
        .limit(1)
    )
    if portrait is None or portrait.storage_path is None or portrait.content_sha256 is None:
        raise HTTPException(status_code=404, detail="Portrait not found for player")
    headers = {"Cache-Control": "public, max-age=86400"}
    if seasonal is not None:
        headers["X-Portrait-Season"] = seasonal.season
    path = Path(portrait.storage_path)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Portrait file missing on disk")
    if size is not None:
        content = portrait_derivative(
            path, portrait.content_sha256, size, get_settings().portraits_cache_path
        )
        return Response(content, media_type=PORTRAIT_DERIVATIVE_MIME, headers=headers)
    return FileResponse(path, media_type=portrait.mime_type or "image/png", headers=headers)


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


# ---------------------------------------------------------------------------
# Personal Workspace State Persistence Endpoints (Block B08)
# ---------------------------------------------------------------------------


@router.get("/workspace", response_model=PersonalWorkspaceState)
def get_workspace_endpoint(
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Retrieve personal workspace state (views, favorites, tray, boards, preferences)."""
    return get_or_create_workspace(session, workspace_id=workspace_id)


@router.put("/workspace", response_model=PersonalWorkspaceState)
def update_workspace_endpoint(
    payload: PersonalWorkspaceState,
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Update complete personal workspace state with optimistic concurrency version check."""
    try:
        return update_workspace_state(session, payload, expected_version=expected_version)
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.post("/workspace/reset", response_model=PersonalWorkspaceState)
def reset_workspace_endpoint(
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Reset workspace state to canonical defaults (recovering built-in presets)."""
    try:
        return reset_workspace(
            session, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.get("/workspace/export", response_model=WorkspaceBundle)
def export_workspace_endpoint(
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    session: Session = Depends(get_db),
) -> WorkspaceBundle:
    """Export complete personal workspace bundle with cryptographic SHA-256 integrity checksum."""
    return export_workspace_bundle(session, workspace_id=workspace_id)


@router.post("/workspace/import", response_model=PersonalWorkspaceState)
def import_workspace_endpoint(
    payload: ImportWorkspaceRequest,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Import a workspace bundle into personal state, supporting replace or merge mode."""
    try:
        return import_workspace_bundle(
            session,
            bundle=payload.bundle,
            mode=payload.mode,
            expected_version=expected_version,
            workspace_id=workspace_id,
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


# ---------------------------------------------------------------------------
# Custom Views Endpoints (F04)
# ---------------------------------------------------------------------------


@router.get("/workspace/presets", response_model=list[CustomViewDefinition])
def get_workspace_presets_endpoint() -> list[CustomViewDefinition]:
    """Recover the canonical built-in definitions without consuming custom-view slots."""
    return CANONICAL_BUILTIN_VIEWS


@router.get("/workspace/views", response_model=list[CustomViewDefinition])
def get_custom_views_endpoint(
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    session: Session = Depends(get_db),
) -> list[CustomViewDefinition]:
    """List all custom views in the personal workspace."""
    workspace = get_or_create_workspace(session, workspace_id=workspace_id)
    return workspace.views


@router.post("/workspace/views", response_model=PersonalWorkspaceState, status_code=201)
def add_custom_view_endpoint(
    payload: CreateCustomViewRequest,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Add a custom view (up to 10 views, max 25 columns, validated metrics)."""
    try:
        view = CustomViewDefinition(
            name=payload.name,
            metric_version=payload.metric_version,
            columns=payload.columns,
            unavailable_columns=payload.unavailable_columns,
            sort_field=payload.sort_field,
            sort_direction=payload.sort_direction,
            is_default=payload.is_default,
        )
        return add_custom_view(
            session, view, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.get("/workspace/views/{view_id}", response_model=CustomViewDefinition)
def get_custom_view_detail_endpoint(
    view_id: str,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    session: Session = Depends(get_db),
) -> CustomViewDefinition:
    """Get a specific custom view by ID."""
    workspace = get_or_create_workspace(session, workspace_id=workspace_id)
    for v in workspace.views:
        if v.id == view_id:
            return v
    raise HTTPException(status_code=404, detail=f"View with id '{view_id}' not found")


@router.put("/workspace/views/{view_id}", response_model=PersonalWorkspaceState)
def update_custom_view_endpoint(
    view_id: str,
    payload: UpdateCustomViewRequest,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Update an existing custom view."""
    try:
        update_data = payload.model_dump(exclude_unset=True)
        return update_custom_view(
            session,
            view_id,
            update_data,
            expected_version=expected_version,
            workspace_id=workspace_id,
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except KeyError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.delete("/workspace/views/{view_id}", response_model=PersonalWorkspaceState)
def delete_custom_view_endpoint(
    view_id: str,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Delete a custom view by ID."""
    try:
        return delete_custom_view(
            session, view_id, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except KeyError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.post("/workspace/views/reorder", response_model=PersonalWorkspaceState)
def reorder_custom_views_endpoint(
    payload: ReorderViewsRequest,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Reorder custom views to match the supplied ID ordering."""
    try:
        return reorder_custom_views(
            session,
            payload.ordered_view_ids,
            expected_version=expected_version,
            workspace_id=workspace_id,
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


# ---------------------------------------------------------------------------
# Favorites & Compare Tray Endpoints (F05)
# ---------------------------------------------------------------------------


@router.get("/workspace/favorites", response_model=list[str])
def get_favorites_endpoint(
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    session: Session = Depends(get_db),
) -> list[str]:
    """List favorite player IDs."""
    workspace = get_or_create_workspace(session, workspace_id=workspace_id)
    return workspace.favorites


@router.put("/workspace/favorites", response_model=PersonalWorkspaceState)
def update_favorites_endpoint(
    payload: UpdateFavoritesRequest,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Replace entire favorite player list."""
    try:
        return update_favorites(
            session, payload.favorites, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.post("/workspace/favorites/{player_id}", response_model=PersonalWorkspaceState)
def add_favorite_player_endpoint(
    player_id: str,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Add a player ID to favorites."""
    try:
        return add_favorite_player(
            session, player_id, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.delete("/workspace/favorites/{player_id}", response_model=PersonalWorkspaceState)
def remove_favorite_player_endpoint(
    player_id: str,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Remove a player ID from favorites."""
    try:
        return remove_favorite_player(
            session, player_id, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.get("/workspace/compare-tray", response_model=list[str])
def get_compare_tray_endpoint(
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    session: Session = Depends(get_db),
) -> list[str]:
    """List player IDs in compare tray."""
    workspace = get_or_create_workspace(session, workspace_id=workspace_id)
    return workspace.compare_tray


@router.put("/workspace/compare-tray", response_model=PersonalWorkspaceState)
def update_compare_tray_endpoint(
    payload: UpdateCompareTrayRequest,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Replace compare tray list (enforcing max 8 players)."""
    try:
        return update_compare_tray(
            session,
            payload.compare_tray,
            expected_version=expected_version,
            workspace_id=workspace_id,
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.post("/workspace/compare-tray/{player_id}", response_model=PersonalWorkspaceState)
def add_to_compare_tray_endpoint(
    player_id: str,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Add a player to comparison tray (enforcing max 8 players)."""
    try:
        return add_to_compare_tray(
            session, player_id, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.delete("/workspace/compare-tray/{player_id}", response_model=PersonalWorkspaceState)
def remove_from_compare_tray_endpoint(
    player_id: str,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Remove a player from comparison tray."""
    try:
        return remove_from_compare_tray(
            session, player_id, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.delete("/workspace/compare-tray", response_model=PersonalWorkspaceState)
def clear_compare_tray_endpoint(
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Clear all players from comparison tray."""
    try:
        return clear_compare_tray(
            session, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


# ---------------------------------------------------------------------------
# Ranking Boards Endpoints (F16)
# ---------------------------------------------------------------------------


@router.get("/workspace/ranking-boards", response_model=list[RankingBoardDefinition])
def list_ranking_boards_endpoint(
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    session: Session = Depends(get_db),
) -> list[RankingBoardDefinition]:
    """List all personal ranking boards."""
    workspace = get_or_create_workspace(session, workspace_id=workspace_id)
    return workspace.ranking_boards


@router.post("/workspace/ranking-boards", response_model=PersonalWorkspaceState, status_code=201)
def create_ranking_board_endpoint(
    payload: CreateRankingBoardRequest,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Create a new personal ranking board."""
    try:
        board = RankingBoardDefinition(
            title=payload.title,
            board_type=payload.board_type,
            scope=payload.scope,
            notes=payload.notes,
            entries=payload.entries,
        )
        return save_ranking_board(
            session, board, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.get("/workspace/ranking-boards/{board_id}", response_model=RankingBoardDefinition)
def get_ranking_board_endpoint(
    board_id: str,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    session: Session = Depends(get_db),
) -> RankingBoardDefinition:
    """Get a specific ranking board by ID."""
    workspace = get_or_create_workspace(session, workspace_id=workspace_id)
    for b in workspace.ranking_boards:
        if b.id == board_id:
            return b
    raise HTTPException(status_code=404, detail=f"Ranking board with id '{board_id}' not found")


@router.put("/workspace/ranking-boards/{board_id}", response_model=PersonalWorkspaceState)
def update_ranking_board_endpoint(
    board_id: str,
    payload: CreateRankingBoardRequest,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Update an existing ranking board."""
    try:
        board = RankingBoardDefinition(
            id=board_id,
            title=payload.title,
            board_type=payload.board_type,
            scope=payload.scope,
            notes=payload.notes,
            entries=payload.entries,
        )
        return save_ranking_board(
            session, board, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.delete("/workspace/ranking-boards/{board_id}", response_model=PersonalWorkspaceState)
def delete_ranking_board_endpoint(
    board_id: str,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Delete a ranking board by ID."""
    try:
        return delete_ranking_board(
            session, board_id, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except KeyError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.post("/workspace/ranking-boards/aggregate", response_model=BoardAggregationResult)
def aggregate_ranking_boards_endpoint(
    payload: AggregateRankingBoardsRequest,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    session: Session = Depends(get_db),
) -> BoardAggregationResult:
    """Aggregate selected personal boards with explicit missing-rank rules."""
    try:
        return aggregate_ranking_boards_service(
            session,
            board_ids=payload.board_ids,
            method=payload.method,
            missing_rank_penalty=payload.missing_rank_penalty,
            workspace_id=workspace_id,
        )
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


# ---------------------------------------------------------------------------
# Tier Lists Endpoints (F27)
# ---------------------------------------------------------------------------


@router.get("/workspace/tier-lists", response_model=list[TierListDefinition])
def list_tier_lists_endpoint(
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    session: Session = Depends(get_db),
) -> list[TierListDefinition]:
    """List all personal tier lists."""
    workspace = get_or_create_workspace(session, workspace_id=workspace_id)
    return workspace.tier_lists


@router.post("/workspace/tier-lists", response_model=PersonalWorkspaceState, status_code=201)
def create_tier_list_endpoint(
    payload: CreateTierListRequest,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Create a new personal tier list."""
    try:
        tier_list = TierListDefinition(
            title=payload.title,
            description=payload.description,
            tiers=payload.tiers,
        )
        return save_tier_list(
            session, tier_list, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.get("/workspace/tier-lists/{tier_list_id}", response_model=TierListDefinition)
def get_tier_list_endpoint(
    tier_list_id: str,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    session: Session = Depends(get_db),
) -> TierListDefinition:
    """Get a specific tier list by ID."""
    workspace = get_or_create_workspace(session, workspace_id=workspace_id)
    for t in workspace.tier_lists:
        if t.id == tier_list_id:
            return t
    raise HTTPException(status_code=404, detail=f"Tier list with id '{tier_list_id}' not found")


@router.put("/workspace/tier-lists/{tier_list_id}", response_model=PersonalWorkspaceState)
def update_tier_list_endpoint(
    tier_list_id: str,
    payload: CreateTierListRequest,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Update an existing tier list."""
    try:
        tier_list = TierListDefinition(
            id=tier_list_id,
            title=payload.title,
            description=payload.description,
            tiers=payload.tiers,
        )
        return save_tier_list(
            session, tier_list, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


@router.delete("/workspace/tier-lists/{tier_list_id}", response_model=PersonalWorkspaceState)
def delete_tier_list_endpoint(
    tier_list_id: str,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Delete a tier list by ID."""
    try:
        return delete_tier_list(
            session, tier_list_id, expected_version=expected_version, workspace_id=workspace_id
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except KeyError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


# ---------------------------------------------------------------------------
# Workspace Preferences Endpoints
# ---------------------------------------------------------------------------


@router.get("/workspace/preferences", response_model=WorkspacePreferences)
def get_preferences_endpoint(
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    session: Session = Depends(get_db),
) -> WorkspacePreferences:
    """Get personal workspace preferences (density, identity mode, counting mode, theme)."""
    workspace = get_or_create_workspace(session, workspace_id=workspace_id)
    return workspace.preferences


@router.patch("/workspace/preferences", response_model=PersonalWorkspaceState)
def patch_preferences_endpoint(
    payload: UpdatePreferencesRequest,
    workspace_id: str = Query(
        "default", alias="workspaceId", min_length=1, max_length=36, pattern=r"^[a-zA-Z0-9_-]+$"
    ),
    expected_version: int = Query(..., alias="expectedVersion", ge=1),
    _auth: None = Depends(verify_workspace_operator_access),
    session: Session = Depends(get_db),
) -> PersonalWorkspaceState:
    """Update workspace presentation and layout preferences."""
    try:
        update_data = payload.model_dump(exclude_unset=True)
        return update_preferences_service(
            session,
            update_data,
            expected_version=expected_version,
            workspace_id=workspace_id,
        )
    except VersionConflictError as err:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(err),
                "current_version": err.current_version,
                "expected_version": err.expected_version,
            },
        ) from err
    except ValueError as err:
        raise HTTPException(status_code=422, detail=str(err)) from err


# ---------------------------------------------------------------------------
# Block B12: Analytical Operations Endpoints
# ---------------------------------------------------------------------------


@router.post("/operations/compare-periods", response_model=ComparePeriodsResponse)
def post_compare_periods_endpoint(
    payload: ComparePeriodsRequest,
    session: Session = Depends(get_db),
) -> ComparePeriodsResponse:
    """Disjoint period comparison with strict sample validation and percentage deltas."""
    return compare_periods_service(session, payload)


@router.get("/operations/compare-periods", response_model=ComparePeriodsResponse)
def get_compare_periods_endpoint(
    player_id: str = Query(..., alias="playerId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    release_id: str | None = Query(None, alias="releaseId"),
    mode: PeriodMode = Query(PeriodMode.APPEARANCES),
    period_a_n: int = Query(10, alias="periodAN", ge=1, le=82),
    period_b_n: int = Query(10, alias="periodBN", ge=1, le=82),
    period_a_from: date | None = Query(None, alias="periodAFrom"),
    period_a_to: date | None = Query(None, alias="periodATo"),
    period_b_from: date | None = Query(None, alias="periodBFrom"),
    period_b_to: date | None = Query(None, alias="periodBTo"),
    metrics: list[str] | None = Query(None),
    session: Session = Depends(get_db),
) -> ComparePeriodsResponse:
    """GET variant of period comparison for query-string navigation."""
    req = ComparePeriodsRequest(
        player_id=player_id,
        season=season,
        phase=phase,
        before_date=before_date,
        release_id=release_id,
        mode=mode,
        period_a_n=period_a_n,
        period_b_n=period_b_n,
        period_a_from=period_a_from,
        period_a_to=period_a_to,
        period_b_from=period_b_from,
        period_b_to=period_b_to,
        metrics=metrics,
    )
    return compare_periods_service(session, req)


@router.post("/operations/distribution", response_model=DistributionResponse)
def post_distribution_endpoint(
    payload: DistributionRequest,
    session: Session = Depends(get_db),
) -> DistributionResponse:
    """Descriptive quantile distribution analysis with n >= 5 sample rule."""
    return distribution_service(session, payload)


@router.get("/operations/distribution", response_model=DistributionResponse)
def get_distribution_endpoint(
    player_id: str = Query(..., alias="playerId"),
    metric: str = Query("pts"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    release_id: str | None = Query(None, alias="releaseId"),
    window_n: int = Query(20, alias="windowN", ge=1, le=82),
    from_date: date | None = Query(None, alias="fromDate"),
    to_date: date | None = Query(None, alias="toDate"),
    session: Session = Depends(get_db),
) -> DistributionResponse:
    """GET variant of distribution analysis for query-string navigation."""
    req = DistributionRequest(
        player_id=player_id,
        metric=metric,
        season=season,
        phase=phase,
        before_date=before_date,
        release_id=release_id,
        window_n=window_n,
        from_date=from_date,
        to_date=to_date,
    )
    return distribution_service(session, req)


@router.post("/operations/splits", response_model=SplitProfileResponse)
def post_splits_endpoint(
    payload: SplitProfileRequest,
    session: Session = Depends(get_db),
) -> SplitProfileResponse:
    """Contextual splits across venue, team rest days, and opponent team."""
    return split_profile_service(session, payload)


@router.get("/operations/splits", response_model=SplitProfileResponse)
def get_splits_endpoint(
    player_id: str = Query(..., alias="playerId"),
    split_type: SplitType = Query(SplitType.ALL, alias="splitType"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    release_id: str | None = Query(None, alias="releaseId"),
    session: Session = Depends(get_db),
) -> SplitProfileResponse:
    """GET variant of contextual splits for query-string navigation."""
    req = SplitProfileRequest(
        player_id=player_id,
        split_type=split_type,
        season=season,
        phase=phase,
        before_date=before_date,
        release_id=release_id,
    )
    return split_profile_service(session, req)


@router.post("/operations/opponent-context", response_model=OpponentContextResponse)
def post_opponent_context_endpoint(
    payload: OpponentContextRequest,
    session: Session = Depends(get_db),
) -> OpponentContextResponse:
    """Opponent team defensive allowance across completed games prior to cutoff."""
    return opponent_context_service(session, payload)


@router.get("/operations/opponent-context", response_model=OpponentContextResponse)
def get_opponent_context_endpoint(
    team_id: str | None = Query(None, alias="teamId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    release_id: str | None = Query(None, alias="releaseId"),
    session: Session = Depends(get_db),
) -> OpponentContextResponse:
    """GET variant of opponent allowance for query-string navigation."""
    req = OpponentContextRequest(
        team_id=team_id,
        season=season,
        phase=phase,
        before_date=before_date,
        release_id=release_id,
    )
    return opponent_context_service(session, req)


@router.post("/operations/similarity", response_model=StatisticalPeersResponse)
def post_similarity_endpoint(
    payload: StatisticalPeersRequest,
    session: Session = Depends(get_db),
) -> StatisticalPeersResponse:
    """Statistical peer similarity across standardized per-36 production & efficiency."""
    return statistical_peers_service(session, payload)


@router.get("/operations/similarity", response_model=StatisticalPeersResponse)
def get_similarity_endpoint(
    player_id: str = Query(..., alias="playerId"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    release_id: str | None = Query(None, alias="releaseId"),
    window: Literal["last_10", "season"] = Query("last_10"),
    min_appearances: int = Query(10, alias="minAppearances", ge=1, le=82),
    min_minutes: float = Query(150.0, alias="minMinutes", ge=0.0),
    top_k: int = Query(5, alias="topK", ge=1, le=25),
    dimensions: list[str] | None = Query(None),
    session: Session = Depends(get_db),
) -> StatisticalPeersResponse:
    """GET variant of statistical peer similarity for query-string navigation."""
    req = StatisticalPeersRequest(
        target_player_id=player_id,
        season=season,
        phase=phase,
        before_date=before_date,
        release_id=release_id,
        window=window,
        min_appearances=min_appearances,
        min_minutes=min_minutes,
        top_k=top_k,
        dimensions=dimensions,
    )
    return statistical_peers_service(session, req)


@router.post("/operations/rank", response_model=RankOperationResponse)
def post_rank_operation_endpoint(
    payload: RankOperationRequest,
    session: Session = Depends(get_db),
) -> RankOperationResponse:
    """Rank and sort analytical operation outputs across players in the cohort."""
    return rank_operation_service(session, payload)


@router.get("/operations/rank", response_model=RankOperationResponse)
def get_rank_operation_endpoint(
    operation_type: Literal["compare_periods", "distribution"] = Query(
        "compare_periods", alias="operationType"
    ),
    metric: str = Query("pts"),
    season: str | None = Query(None),
    phase: str = Query("regular_season"),
    before_date: date | None = Query(None, alias="beforeDate"),
    release_id: str | None = Query(None, alias="releaseId"),
    sort_direction: Literal["asc", "desc"] = Query("desc", alias="sortDirection"),
    min_games: int = Query(10, alias="minGames", ge=1, le=82),
    min_minutes: float = Query(150.0, alias="minMinutes", ge=0.0),
    limit: int = Query(50, ge=1, le=100),
    measure: DistributionMeasure = Query(DistributionMeasure.IQR),
    session: Session = Depends(get_db),
) -> RankOperationResponse:
    """GET variant of analytical rank operation for query-string navigation."""
    req = RankOperationRequest(
        operation_type=operation_type,
        metric=metric,
        season=season,
        phase=phase,
        before_date=before_date,
        release_id=release_id,
        sort_direction=sort_direction,
        min_games=min_games,
        min_minutes=min_minutes,
        limit=limit,
        measure=measure,
    )
    return rank_operation_service(session, req)


@router.get("/measurements", response_model=MeasurementsQueryResponse)
def get_measurements_endpoint(
    player_id: str | None = Query(None, alias="playerId"),
    draft_year: int | None = Query(None, alias="draftYear"),
    min_wingspan: float | None = Query(None, alias="minWingspan"),
    max_wingspan: float | None = Query(None, alias="maxWingspan"),
    min_height: float | None = Query(None, alias="minHeight"),
    max_height: float | None = Query(None, alias="maxHeight"),
    measurement_type: str = Query("all", alias="measurementType"),
    limit: int = Query(50, ge=1, le=200),
    session: Session = Depends(get_db),
) -> MeasurementsQueryResponse:
    """Query anthropometric combine and listed roster measurements with wingspan filters."""
    res = query_measurements_service(
        session=session,
        player_id=player_id,
        draft_year=draft_year,
        min_wingspan=min_wingspan,
        max_wingspan=max_wingspan,
        min_height=min_height,
        max_height=max_height,
        measurement_type=measurement_type,
        limit=limit,
    )
    return MeasurementsQueryResponse(**res)


@router.get("/players/{player_id}/measurements", response_model=PlayerMeasurementsDetailResponse)
def get_player_measurements_endpoint(
    player_id: str,
    session: Session = Depends(get_db),
) -> PlayerMeasurementsDetailResponse:
    """Retrieve full anthropometric combine, listed roster, and draft profile for a player."""
    res = get_player_measurements_detail_service(session, player_id)
    return PlayerMeasurementsDetailResponse(**res)


@router.get("/crosswalk", response_model=CrosswalkResponse)
def get_crosswalk_endpoint(
    source_namespace: str = Query(..., alias="sourceNamespace"),
    source_id: str = Query(..., alias="sourceId"),
    target_namespace: str = Query("nba", alias="targetNamespace"),
    kind: str = Query("player"),
    session: Session = Depends(get_db),
) -> CrosswalkResponse:
    """Resolve an external identifier (e.g. ESPN, BRef, Spotrac) to canonical NBA entity."""
    cw = resolve_crosswalk(
        session=session,
        source_namespace=source_namespace,
        source_id=source_id,
        target_namespace=target_namespace,
        kind=kind,
    )
    if cw:
        item = CrosswalkItem(
            source_namespace=cw.source_namespace,
            source_id=cw.source_id,
            target_namespace=cw.target_namespace,
            target_id=cw.target_id,
            kind=cw.kind,
            confidence=cw.confidence,
            mapping_method=cw.mapping_method,
            evidence=cw.evidence_json or {},
        )
        return CrosswalkResponse(item=item, resolved=True)
    return CrosswalkResponse(item=None, resolved=False)


@router.get("/backfill/status", response_model=BackfillStatusResponse)
def get_backfill_status_endpoint(
    start_year: int = Query(2001, alias="startYear"),
    end_year: int = Query(2023, alias="endYear"),
    session: Session = Depends(get_db),
) -> BackfillStatusResponse:
    """Inspect progress and status of resumable historical backfill toward 2000-01."""
    res = get_backfill_status(session, start_year=start_year, end_year=end_year)
    return BackfillStatusResponse(
        range=res["range"],
        total_seasons=res["total_seasons"],
        imported_count=res["imported_count"],
        acquired_count=res["acquired_count"],
        pending_count=res["pending_count"],
        imported_years=res["imported_years"],
        acquired_years=res["acquired_years"],
        pending_years=res["pending_years"],
    )
