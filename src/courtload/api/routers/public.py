from __future__ import annotations

from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from typing import Annotated, Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session, selectinload

from courtload.api.schemas import (
    AnalyticsCatalogResponse,
    AnalyticsCompareResponse,
    AnalyticsEvaluationResponse,
    AnalyticsLineageResponse,
    AnalyticsPlayerGamesResponse,
    AnalyticsPlayerResponse,
    AnalyticsPlayerSearchResponse,
)
from courtload.database import get_db
from courtload.domain.scoring import DEFAULT_POINTS_RULES, scoring_rules_hash
from courtload.models import (
    DataQualityRun,
    Game,
    IngestionRun,
    Player,
    PlayerGame,
    RawObject,
    Team,
)
from courtload.services.evaluation_public import public_evaluation
from courtload.services.planner import NON_SCHEDULED_STATES
from courtload.services.player_analytics import (
    catalog as analytics_catalog,
)
from courtload.services.player_analytics import (
    lineage as analytics_lineage,
)
from courtload.services.player_analytics import metadata as analytics_metadata
from courtload.services.player_analytics import (
    player_games as analytics_player_games,
)
from courtload.services.player_analytics import (
    player_profile as analytics_player_profile,
)
from courtload.services.player_analytics import (
    resolve_replay_date,
    resolve_snapshot,
)
from courtload.services.player_analytics import (
    search_players as analytics_search_players,
)
from courtload.services.recent_form import recent_form

router = APIRouter(tags=["public data"])


@router.get(
    "/analytics/evaluations", tags=["analytics"], response_model=AnalyticsEvaluationResponse
)
def published_analytics_evaluations(
    run_id: Annotated[str | None, Query(alias="runId", max_length=32)] = None,
    snapshot_id: Annotated[str | None, Query(alias="snapshotId", max_length=36)] = None,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    context = resolve_snapshot(session, snapshot_id)
    return public_evaluation(session, context, run_id)


@router.get("/analytics/compare", tags=["analytics"], response_model=AnalyticsCompareResponse)
def published_analytics_compare(
    player_a: Annotated[str, Query(alias="playerA", min_length=1, max_length=100)],
    player_b: Annotated[str, Query(alias="playerB", min_length=1, max_length=100)],
    replay_date: Annotated[date | None, Query(alias="date")] = None,
    snapshot_id: Annotated[str | None, Query(alias="snapshotId", max_length=36)] = None,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    if player_a == player_b:
        raise HTTPException(status_code=422, detail={"reason": "identical_players"})
    context = resolve_snapshot(session, snapshot_id)
    selected_date = resolve_replay_date(context.snapshot, replay_date)
    first = analytics_player_profile(session, context, player_a, selected_date)
    second = analytics_player_profile(session, context, player_b, selected_date)
    first_point = first["estimate"]["point"]
    second_point = second["estimate"]["point"]
    result = analytics_metadata(context, selected_date)
    result.update(
        {
            "player_a": first,
            "player_b": second,
            "estimate_gap": first_point - second_point
            if isinstance(first_point, (int, float)) and isinstance(second_point, (int, float))
            else None,
        }
    )
    return result


@router.get("/analytics/catalog", tags=["analytics"], response_model=AnalyticsCatalogResponse)
def published_analytics_catalog(
    snapshot_id: Annotated[str | None, Query(alias="snapshotId", max_length=36)] = None,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    return analytics_catalog(session, snapshot_id)


@router.get("/analytics/players", tags=["analytics"], response_model=AnalyticsPlayerSearchResponse)
def published_analytics_players(
    query: Annotated[str, Query(min_length=1, max_length=80)],
    season: Annotated[str | None, Query(max_length=10)] = None,
    snapshot_id: Annotated[str | None, Query(alias="snapshotId", max_length=36)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    context = resolve_snapshot(session, snapshot_id)
    return {
        "snapshot_id": context.snapshot.id,
        "dataset_id": context.snapshot.dataset_id,
        "query": query,
        "season": season,
        "players": analytics_search_players(session, context, query, season, limit),
    }


@router.get(
    "/analytics/players/{player_id}", tags=["analytics"], response_model=AnalyticsPlayerResponse
)
def published_analytics_player(
    player_id: str,
    replay_date: Annotated[date | None, Query(alias="date")] = None,
    snapshot_id: Annotated[str | None, Query(alias="snapshotId", max_length=36)] = None,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    context = resolve_snapshot(session, snapshot_id)
    selected_date = resolve_replay_date(context.snapshot, replay_date)
    return analytics_player_profile(session, context, player_id, selected_date)


@router.get(
    "/analytics/players/{player_id}/games",
    tags=["analytics"],
    response_model=AnalyticsPlayerGamesResponse,
)
def published_analytics_player_games(
    player_id: str,
    replay_date: Annotated[date | None, Query(alias="date")] = None,
    snapshot_id: Annotated[str | None, Query(alias="snapshotId", max_length=36)] = None,
    cursor: Annotated[str | None, Query(max_length=1000)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    context = resolve_snapshot(session, snapshot_id)
    selected_date = resolve_replay_date(context.snapshot, replay_date)
    return analytics_player_games(
        session, context, player_id, selected_date, cursor=cursor, limit=limit
    )


@router.get("/analytics/lineage", tags=["analytics"], response_model=AnalyticsLineageResponse)
def published_analytics_lineage(
    player_id: Annotated[str, Query(alias="playerId", min_length=1, max_length=100)],
    game_id: Annotated[str, Query(alias="gameId", min_length=1, max_length=10)],
    snapshot_id: Annotated[str | None, Query(alias="snapshotId", max_length=36)] = None,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    context = resolve_snapshot(session, snapshot_id)
    return analytics_lineage(session, context, player_id, game_id)


@router.get("/health")
def health(session: Session = Depends(get_db)) -> dict[str, str]:
    session.execute(text("SELECT 1"))
    return {"status": "ok", "database": "ok"}


@router.get("/data-status")
def data_status(session: Session = Depends(get_db)) -> dict[str, Any]:
    latest_attempt = session.scalar(
        select(IngestionRun).order_by(IngestionRun.started_at.desc()).limit(1)
    )
    latest_success = session.scalar(
        select(IngestionRun)
        .where(IngestionRun.status == "succeeded")
        .order_by(IngestionRun.finished_at.desc())
        .limit(1)
    )
    quality = session.scalar(
        select(DataQualityRun).order_by(DataQualityRun.executed_at.desc()).limit(1)
    )
    latest_observation = session.scalar(select(func.max(Game.last_observed_at)))
    counts = {
        "teams": session.scalar(select(func.count()).select_from(Team)) or 0,
        "players": session.scalar(select(func.count()).select_from(Player)) or 0,
        "games": session.scalar(select(func.count()).select_from(Game)) or 0,
        "player_games": session.scalar(select(func.count()).select_from(PlayerGame)) or 0,
        "raw_versions": session.scalar(select(func.count()).select_from(RawObject)) or 0,
    }
    classification = (
        "fixture"
        if latest_success is not None and latest_success.source_name == "fixture"
        else "operational"
        if latest_success is not None
        else "empty"
    )
    freshness = _freshness(latest_observation, classification)
    return {
        "provider": "BALLDONTLIE",
        "classification": classification,
        "unofficial": True,
        "latest_attempt": _run_summary(latest_attempt),
        "latest_success": _run_summary(latest_success),
        "latest_source_observation": latest_observation.isoformat() if latest_observation else None,
        "freshness": freshness,
        "quality": {
            "status": quality.status,
            "executed_at": quality.executed_at.isoformat(),
            "passed": quality.passed_count,
            "failed": quality.failed_count,
            "checks": quality.results_json,
        }
        if quality
        else None,
        "coverage": counts,
        "source_contract_checked_on": "2026-08-23",
        "source_contract_url": "https://www.balldontlie.io/openapi/nba.yml",
        "terms_url": "https://www.balldontlie.io/terms.html",
        "limitations": [
            "Provider data is best effort and is not an official NBA feed.",
            "Game-player stats require an NBA ALL-STAR or higher provider entitlement.",
            "A missing player-stat row is unknown, not inferred as a DNP or injury.",
        ],
    }


def _run_summary(run: IngestionRun | None) -> dict[str, Any] | None:
    if run is None:
        return None
    return {
        "id": run.run_id,
        "source": run.source_name,
        "status": run.status,
        "started_at": run.started_at.isoformat(),
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "received": run.received_count,
        "inserted": run.inserted_count,
        "updated": run.updated_count,
        "unchanged": run.unchanged_count,
        # Detailed validation/provider errors stay in private job logs; this endpoint is public.
        "error": run.error_summary.partition(":")[0] if run.error_summary else None,
    }


def _freshness(observed: datetime | None, classification: str) -> dict[str, Any]:
    if classification == "fixture":
        return {
            "status": "fixture",
            "age_hours": None,
            "warn_after_hours": 36,
            "error_after_hours": 72,
        }
    if observed is None:
        return {
            "status": "unknown",
            "age_hours": None,
            "warn_after_hours": 36,
            "error_after_hours": 72,
        }
    if observed.tzinfo is None:
        observed = observed.replace(tzinfo=UTC)
    age_hours = max(0.0, (datetime.now(UTC) - observed.astimezone(UTC)).total_seconds() / 3600)
    freshness_status = "fresh" if age_hours <= 36 else "degraded" if age_hours <= 72 else "stale"
    return {
        "status": freshness_status,
        "age_hours": round(age_hours, 2),
        "warn_after_hours": 36,
        "error_after_hours": 72,
    }


@router.get("/schedule/week")
def schedule_week(
    start: date,
    timezone_name: Annotated[str, Query(alias="timezone")] = "America/Toronto",
    light_threshold: Annotated[int, Query(ge=0, le=15)] = 5,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    try:
        zone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError as error:
        raise HTTPException(status_code=422, detail="unknown IANA timezone") from error
    end = start + timedelta(days=6)
    lower = datetime.combine(start, time.min, tzinfo=zone).astimezone(UTC)
    upper = datetime.combine(end + timedelta(days=1), time.min, tzinfo=zone).astimezone(UTC)
    games = session.scalars(
        select(Game)
        .options(selectinload(Game.home_team), selectinload(Game.away_team))
        .where(
            Game.scheduled_start_utc >= lower - timedelta(days=1),
            Game.scheduled_start_utc < upper,
        )
        .order_by(Game.scheduled_start_utc)
    ).all()
    usable_games = [
        game
        for game in games
        if not game.postponed and game.status_state not in NON_SCHEDULED_STATES
    ]
    team_dates: dict[int, set[date]] = defaultdict(set)
    for game in usable_games:
        local_date = game.scheduled_start_utc.astimezone(zone).date()
        team_dates[game.home_team_key].add(local_date)
        team_dates[game.away_team_key].add(local_date)
    by_day: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for game in usable_games:
        local_date = game.scheduled_start_utc.astimezone(zone).date()
        if local_date < start:
            continue
        day_key = local_date.isoformat()
        previous_date = local_date - timedelta(days=1)
        by_day[day_key].append(
            {
                "id": game.game_key,
                "tipoff_utc": game.scheduled_start_utc.isoformat(),
                "away": {
                    "id": game.away_team_key,
                    "abbreviation": game.away_team.abbreviation,
                    "name": game.away_team.full_name,
                    "back_to_back": previous_date in team_dates[game.away_team_key],
                },
                "home": {
                    "id": game.home_team_key,
                    "abbreviation": game.home_team.abbreviation,
                    "name": game.home_team.full_name,
                    "back_to_back": previous_date in team_dates[game.home_team_key],
                },
                "status": game.status_state,
                "postponed": game.postponed,
            }
        )
    days = []
    for offset in range(7):
        day = start + timedelta(days=offset)
        day_games = by_day[day.isoformat()]
        days.append(
            {
                "date": day.isoformat(),
                "game_count": len(day_games),
                "is_light_slate": len(day_games) <= light_threshold,
                "games": day_games,
            }
        )
    return {
        "week_start": start.isoformat(),
        "week_end": end.isoformat(),
        "timezone": timezone_name,
        "light_slate_threshold": light_threshold,
        "days": days,
        "definitions": {
            "light_slate": "A date with no more than the visible light_slate_threshold NBA games.",
            "back_to_back": (
                "The team also has a non-cancelled game on the previous league-local date."
            ),
        },
    }


@router.get("/players")
def players(
    query: Annotated[str, Query(min_length=1, max_length=80)],
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    session: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    escaped = query.replace("%", "\\%").replace("_", "\\_")
    rows = session.scalars(
        select(Player)
        .options(selectinload(Player.current_team))
        .where(Player.full_name.ilike(f"%{escaped}%", escape="\\"))
        .order_by(Player.full_name)
        .limit(limit)
    ).all()
    return [
        {
            "id": player.player_key,
            "name": player.full_name,
            "listed_position": player.listed_position,
            "team": player.current_team.abbreviation if player.current_team else None,
            "source_backed": True,
        }
        for player in rows
    ]


@router.get("/players/{player_id}/form")
def player_form(
    player_id: int,
    as_of: Annotated[datetime | None, Query(alias="asOf")] = None,
    window: Annotated[int, Query(ge=1, le=50)] = 10,
    session: Session = Depends(get_db),
) -> dict[str, Any]:
    player = session.get(Player, player_id)
    if player is None:
        raise HTTPException(status_code=404, detail="player not found")
    cutoff = as_of or datetime.now(UTC)
    if cutoff.tzinfo is None:
        cutoff = cutoff.replace(tzinfo=UTC)
    result = recent_form(
        session,
        player_id=player_id,
        as_of=cutoff,
        window=window,
        scoring_rules=DEFAULT_POINTS_RULES,
    )
    result["player"] = {"id": player.player_key, "name": player.full_name}
    result["scoring_rules"] = DEFAULT_POINTS_RULES
    result["scoring_rules_version"] = scoring_rules_hash(DEFAULT_POINTS_RULES)
    return result


@router.get("/lineage/player-games/{source_stat_id}")
def player_game_lineage(source_stat_id: int, session: Session = Depends(get_db)) -> dict[str, Any]:
    player_game = session.get(PlayerGame, source_stat_id)
    if player_game is None:
        raise HTTPException(status_code=404, detail="player-game stat row not found")
    raw = (
        session.get(RawObject, player_game.source_object_id)
        if player_game.source_object_id
        else None
    )
    return {
        "grain": "one provider-reported full-game player stat row",
        "player_game": {
            "source_stat_id": player_game.source_stat_id,
            "game_id": player_game.game_key,
            "player_id": player_game.player_key,
            "team_id": player_game.team_key,
            "appearance_status": player_game.appearance_status,
            "last_observed_at": player_game.last_observed_at.isoformat(),
            "source_object_id": player_game.source_object_id,
        },
        "raw_source": {
            "object_id": raw.object_id,
            "source": raw.source_name,
            "resource": raw.resource,
            "source_key": raw.source_key,
            "fetched_at": raw.fetched_at.isoformat(),
            "http_status": raw.http_status,
            "content_sha256": raw.content_sha256,
            "schema_version": raw.source_schema_version,
        }
        if raw
        else None,
        "warehouse_path": [
            "operational.fct_player_games",
            "stg_player_games",
            "int_player_games_scored",
            "mart_player_point_in_time_features",
            "mart_player_recent_form",
        ],
        "raw_payload_exposed": False,
        "note": (
            "The API returns trace metadata, not the stored provider payload. dbt models retain "
            "source_stat_id and source_object_id at the player-game grain."
        ),
    }


@router.get("/methodology")
def methodology() -> dict[str, Any]:
    return {
        "version": "1.0.0",
        "metrics": {
            "scheduled_player_game": (
                "The player's observed/current NBA team has a non-cancelled game in the "
                "league-local date range; it does not claim the player will appear."
            ),
            "startable_player_game": (
                "A scheduled player-game placed in one compatible active slot by deterministic "
                "maximum-cardinality matching."
            ),
            "lineup_conflict": (
                "A scheduled player cannot be assigned because compatible active slots are full."
            ),
            "light_slate_day": "A date at or below the displayed league-wide NBA game threshold.",
            "recent_production": (
                "Descriptive fantasy output from final games strictly before the as-of timestamp."
            ),
            "watchlist_candidate": (
                "A user-selected comparison player; availability and health are not implied."
            ),
        },
        "planner": {
            "objective_order": [
                "maximize the number of assigned players",
                "maximize transparent trailing fantasy-points weight",
                "apply a stable player/slot tie-break",
            ],
            "not_supported": [
                "weekly-lock leagues",
                "automatic transactions",
                "injury or availability prediction",
                "multi-transaction optimization",
            ],
        },
        "temporal_rule": (
            "Recent features use only games with scheduled_start_utc strictly before the cutoff."
        ),
    }


@router.get("/models/runs")
def model_runs() -> dict[str, Any]:
    return {
        "promoted_model": None,
        "runs": [],
        "decision": "No ML estimate is promoted in v1; the planner uses descriptive trailing form.",
    }
