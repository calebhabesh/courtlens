"""Shared query layer, analytical service, and investigation reproduction for CourtLens research."""

from __future__ import annotations

import base64
import csv
import hashlib
import io
import json
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from pathlib import Path
from typing import Any, Literal
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from courtlens.archive_models import (
    ArchiveDataset,
    ArchivePlayerGame,
    ArchiveTeamGame,
    ArchiveVersion,
)
from courtlens.domain.metrics import (
    METRIC_CATALOG,
    METRIC_CATALOG_VERSION,
    compute_metrics,
)
from courtlens.domain.team_analytics import compute_team_schedule_context
from courtlens.domain.teams import get_team_info, resolve_team_label, resolve_team_tricode
from courtlens.models import new_uuid, utc_now
from courtlens.services.publication import DEFAULT_CHANNEL
from courtlens.services.workbench_forecasts import get_player_prospective_forecast
from courtlens.warehouse_models import PublishedSnapshot, ServingSnapshot
from courtlens.workbench_models import (
    SavedInvestigation,
    WorkbenchDataset,
    WorkbenchIdentity,
    WorkbenchPlayerGame,
    WorkbenchReleaseBinding,
    WorkbenchTeamGame,
)

MAX_EXPORT_ROWS = 2000
ARTIFACTS_DIR = Path("data/artifacts/analyses")


@dataclass(frozen=True)
class ResolvedContext:
    release_id: str
    snapshot_id: str
    dataset_id: str
    dataset_type: Literal["archive", "workbench"]
    semantic_signature: str
    mode: str
    source: str
    season: str
    phase: str
    before_date: date
    cutoff_utc: str
    window: str
    coverage_start: date
    coverage_end: date
    default_before_date: date
    supported_dates: list[str]
    published_at: str | None
    warnings: list[str]

    def to_dict(self) -> dict[str, Any]:
        return {
            "release_id": self.release_id,
            "snapshot_id": self.snapshot_id,
            "dataset_id": self.dataset_id,
            "dataset_type": self.dataset_type,
            "semantic_signature": self.semantic_signature,
            "mode": self.mode,
            "source": self.source,
            "season": self.season,
            "phase": self.phase,
            "before_date": self.before_date.isoformat(),
            "cutoff_utc": self.cutoff_utc,
            "window": self.window,
            "coverage_start": self.coverage_start.isoformat(),
            "coverage_end": self.coverage_end.isoformat(),
            "metric_version": METRIC_CATALOG_VERSION,
            "published_at": self.published_at,
        }


@dataclass(frozen=True)
class ResearchQuery:
    release_id: str | None = None
    season: str | None = None
    phase: str = "regular_season"
    before_date: date | None = None
    window: str = "season"
    team_id: str | None = None
    name: str | None = None
    metrics: list[str] | None = None
    min_games: int | None = None
    min_minutes: float | None = None
    min_avg_minutes: float | None = None
    sort_metric: str = "pts"
    sort_direction: str | None = None
    limit: int = 50
    cursor: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "release_id": self.release_id,
            "season": self.season,
            "phase": self.phase,
            "before_date": self.before_date.isoformat() if self.before_date else None,
            "window": self.window,
            "team_id": self.team_id,
            "name": self.name,
            "metrics": list(self.metrics) if self.metrics else None,
            "min_games": self.min_games,
            "min_minutes": self.min_minutes,
            "min_avg_minutes": self.min_avg_minutes,
            "sort_metric": self.sort_metric,
            "sort_direction": self.sort_direction,
            "limit": self.limit,
        }


def _cutoff_utc(cutoff_date: date) -> str:
    local = datetime.combine(cutoff_date, time.min, tzinfo=ZoneInfo("America/New_York"))
    return local.astimezone(UTC).isoformat()


def canonical_hash(payload: object) -> str:
    serialized = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def compute_query_context_hash(context: ResolvedContext, query: ResearchQuery) -> str:
    """Deterministic hash of query parameters and resolved context for cursor verification."""
    payload = [
        context.release_id,
        context.season,
        context.phase,
        context.before_date.isoformat(),
        query.window,
        query.team_id or "",
        (query.name or "").strip().lower(),
        query.min_games or 0,
        query.min_minutes or 0.0,
        query.min_avg_minutes or 0.0,
        query.sort_metric,
        query.sort_direction or METRIC_CATALOG[query.sort_metric].default_sort_direction,
    ]
    return canonical_hash(payload)[:32]


def encode_cursor(context_hash: str, offset: int) -> str:
    payload = [context_hash, offset]
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    return base64.urlsafe_b64encode(raw).decode("utf-8").rstrip("=")


def decode_cursor(cursor: str, expected_context_hash: str) -> int:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("utf-8")).decode("utf-8")
        payload = json.loads(raw)
        if not isinstance(payload, list) or len(payload) != 2:
            raise ValueError("invalid cursor structure")
        c_hash, offset = payload[0], int(payload[1])
        if c_hash != expected_context_hash:
            raise ValueError("cursor hash mismatch")
        return offset
    except Exception as err:
        raise HTTPException(
            status_code=422,
            detail="cursor does not match this request",
        ) from err


def resolve_workbench_context(
    session: Session,
    release_id: str | None = None,
    requested_season: str | None = None,
    requested_phase: str | None = None,
    requested_before_date: date | None = None,
    requested_window: str | None = None,
    *,
    channel: str = DEFAULT_CHANNEL,
) -> ResolvedContext:
    """Resolve release context, temporal boundaries, and dataset binding."""
    published_at: str | None = None
    target_id = release_id

    if target_id is None:
        pointer = session.get(PublishedSnapshot, channel)
        if pointer is None:
            raise HTTPException(
                status_code=503,
                detail={
                    "reason": "no_published_data",
                    "message": "No analytics snapshot is published.",
                },
            )
        target_id = pointer.snapshot_id
        published_at = pointer.published_at.isoformat()

    # 1. Check if release_id is a WorkbenchReleaseBinding
    binding = session.scalar(
        select(WorkbenchReleaseBinding).where(
            or_(
                WorkbenchReleaseBinding.snapshot_id == target_id,
                WorkbenchReleaseBinding.id == target_id,
            )
        )
    )

    wb_dataset: WorkbenchDataset | None = None
    archive_dataset: ArchiveDataset | None = None
    serving_snapshot: ServingSnapshot | None = None

    if binding is not None:
        wb_dataset = session.get(WorkbenchDataset, binding.dataset_id)
    else:
        # Check direct WorkbenchDataset
        wb_dataset = session.get(WorkbenchDataset, target_id)

    if wb_dataset is None:
        # Check ServingSnapshot (historical archive)
        serving_snapshot = session.get(ServingSnapshot, target_id)
        if serving_snapshot is None:
            # Maybe target_id is ArchiveDataset directly
            archive_dataset = session.get(ArchiveDataset, target_id)
            if archive_dataset is not None:
                # Find serving snapshot for it if exists
                serving_snapshot = session.scalar(
                    select(ServingSnapshot).where(ServingSnapshot.dataset_id == archive_dataset.id)
                )
        else:
            archive_dataset = session.get(ArchiveDataset, serving_snapshot.dataset_id)

    if wb_dataset is None and serving_snapshot is None and archive_dataset is None:
        raise HTTPException(status_code=404, detail="snapshot or dataset not found")

    dataset_type: Literal["archive", "workbench"] = (
        "workbench" if wb_dataset is not None else "archive"
    )
    warnings = [
        "Historical reconstruction from completed records.",
        "Prior-day boundary: game_date < before_date is strictly enforced.",
    ]

    if dataset_type == "workbench":
        assert wb_dataset is not None
        dataset_id = wb_dataset.id
        semantic_signature = wb_dataset.semantic_signature
        mode = "workbench_recent"
        source = wb_dataset.source_namespace
        observed_seasons = session.scalars(
            select(WorkbenchPlayerGame.season)
            .where(WorkbenchPlayerGame.dataset_id == dataset_id)
            .distinct()
            .order_by(WorkbenchPlayerGame.season)
        ).all()
        seasons = (
            list(observed_seasons) if observed_seasons else (wb_dataset.seasons_json or ["2023-24"])
        )
        phases = wb_dataset.phases_json
        min_date = session.scalar(
            select(func.min(WorkbenchPlayerGame.game_date)).where(
                WorkbenchPlayerGame.dataset_id == dataset_id
            )
        ) or date(2021, 10, 19)
        max_date = session.scalar(
            select(func.max(WorkbenchPlayerGame.game_date)).where(
                WorkbenchPlayerGame.dataset_id == dataset_id
            )
        ) or date(2026, 4, 15)
        coverage_start = min_date
        coverage_end = max_date
        default_before_date = max_date
        supported_dates = [max_date.isoformat()]
    else:
        assert serving_snapshot is not None or archive_dataset is not None
        if serving_snapshot is not None:
            if serving_snapshot.status != "ready":
                raise HTTPException(
                    status_code=410,
                    detail={
                        "reason": "snapshot_retired",
                        "message": "This snapshot is unavailable.",
                    },
                )
            dataset_id = serving_snapshot.dataset_id
            semantic_signature = serving_snapshot.scoring_version
            mode = serving_snapshot.mode
            source = serving_snapshot.source
            coverage_start = serving_snapshot.coverage_start
            coverage_end = serving_snapshot.coverage_end
            default_before_date = serving_snapshot.default_replay_date
            supported_dates = serving_snapshot.supported_replay_dates_json
        else:
            assert archive_dataset is not None
            dataset_id = archive_dataset.id
            semantic_signature = archive_dataset.content_sha256
            mode = "historical_reconstruction"
            source = f"archive:{dataset_id}"
            coverage_start = date(2021, 10, 19)
            coverage_end = date(2024, 4, 14)
            default_before_date = date(2024, 4, 14)
            supported_dates = [default_before_date.isoformat()]

        seasons_rows = session.scalars(
            select(ArchivePlayerGame.season)
            .where(ArchivePlayerGame.dataset_id == dataset_id)
            .distinct()
            .order_by(ArchivePlayerGame.season)
        ).all()
        seasons = list(seasons_rows) or ["2023-24"]
        phases = ["regular_season"]

    default_season = "2023-24" if "2023-24" in seasons else (seasons[-1] if seasons else "2023-24")
    season = requested_season or default_season
    phase = requested_phase or (phases[0] if phases else "regular_season")

    if requested_before_date is None:
        from datetime import timedelta

        if dataset_type == "workbench":
            season_max = session.scalar(
                select(func.max(WorkbenchPlayerGame.game_date)).where(
                    WorkbenchPlayerGame.dataset_id == dataset_id,
                    WorkbenchPlayerGame.season == season,
                )
            )
        else:
            season_max = session.scalar(
                select(func.max(ArchivePlayerGame.game_date)).where(
                    ArchivePlayerGame.dataset_id == dataset_id,
                    ArchivePlayerGame.season == season,
                )
            )
        if season_max is not None:
            before_date = season_max + timedelta(days=1)
            default_before_date = before_date
        else:
            before_date = default_before_date
    else:
        before_date = requested_before_date

    window = requested_window or "season"

    if window not in ("season", "last_5", "last_10"):
        raise HTTPException(
            status_code=422, detail=f"unsupported window '{window}'; valid: season, last_5, last_10"
        )

    if window != "season":
        warnings.append(
            f"Window '{window}' evaluates recent form; descriptive changes do not establish "
            "causation."
        )

    return ResolvedContext(
        release_id=target_id,
        snapshot_id=target_id,
        dataset_id=dataset_id,
        dataset_type=dataset_type,
        semantic_signature=semantic_signature,
        mode=mode,
        source=source,
        season=season,
        phase=phase,
        before_date=before_date,
        cutoff_utc=_cutoff_utc(before_date),
        window=window,
        coverage_start=coverage_start,
        coverage_end=coverage_end,
        default_before_date=default_before_date,
        supported_dates=supported_dates,
        published_at=published_at,
        warnings=warnings,
    )


def _load_player_games(
    session: Session,
    context: ResolvedContext,
    player_id: str | None = None,
    team_id: str | None = None,
    name_query: str | None = None,
) -> list[dict[str, Any]]:
    """Extract and normalize raw player game rows from either workbench or archive tables."""
    results: list[dict[str, Any]] = []

    if context.dataset_type == "workbench":
        query = (
            select(WorkbenchPlayerGame, WorkbenchIdentity.display_name)
            .outerjoin(
                WorkbenchIdentity,
                (WorkbenchIdentity.external_id == WorkbenchPlayerGame.player_id)
                & (WorkbenchIdentity.kind == "player"),
            )
            .where(
                WorkbenchPlayerGame.dataset_id == context.dataset_id,
                WorkbenchPlayerGame.season == context.season,
                WorkbenchPlayerGame.phase == context.phase,
                WorkbenchPlayerGame.game_date < context.before_date,
            )
        )
        if player_id is not None:
            query = query.where(WorkbenchPlayerGame.player_id == player_id)
        if team_id is not None:
            team_info = get_team_info(team_id)
            match_ids = {team_id}
            if team_info:
                match_ids.add(team_info.team_id)
                match_ids.add(team_info.tricode)
            query = query.where(WorkbenchPlayerGame.team_id.in_(match_ids))
        if name_query:
            escaped = name_query.replace("%", "\\%").replace("_", "\\_")
            query = query.where(WorkbenchIdentity.display_name.ilike(f"%{escaped}%", escape="\\"))

        query = query.order_by(
            WorkbenchPlayerGame.game_date.asc(), WorkbenchPlayerGame.game_id.asc()
        )

        for game, p_name in session.execute(query):
            stats = game.stats_json or {}
            results.append(
                {
                    "game_id": game.game_id,
                    "game_date": game.game_date,
                    "season": game.season,
                    "phase": game.phase,
                    "player_id": game.player_id,
                    "player_name": p_name or game.player_id,
                    "team_id": game.team_id,
                    "opponent_id": game.opponent_id,
                    "appearance": game.appearance,
                    "minutes_original": game.minutes_original,
                    "minutes_seconds": game.minutes_seconds,
                    "points": game.points if game.points is not None else stats.get("points"),
                    "rebounds_offensive": stats.get("rebounds_offensive"),
                    "rebounds_defensive": stats.get("rebounds_defensive"),
                    "rebounds_total": stats.get("rebounds_total"),
                    "assists": stats.get("assists"),
                    "steals": stats.get("steals"),
                    "blocks": stats.get("blocks"),
                    "turnovers": stats.get("turnovers"),
                    "fouls_personal": stats.get("fouls_personal"),
                    "field_goals_made": stats.get("field_goals_made"),
                    "field_goals_attempted": stats.get("field_goals_attempted"),
                    "three_pointers_made": stats.get("three_pointers_made"),
                    "three_pointers_attempted": stats.get("three_pointers_attempted"),
                    "free_throws_made": stats.get("free_throws_made"),
                    "free_throws_attempted": stats.get("free_throws_attempted"),
                    "side": None,
                    "source_version_id": game.source_version_id,
                    "source_observation_id": game.source_observation_id,
                }
            )
    else:
        # Archive dataset
        query = (
            select(ArchivePlayerGame, ArchiveVersion.payload_json)
            .join(ArchiveVersion, ArchiveVersion.id == ArchivePlayerGame.source_version_id)
            .where(
                ArchivePlayerGame.dataset_id == context.dataset_id,
                ArchivePlayerGame.season == context.season,
                ArchivePlayerGame.game_date < context.before_date,
            )
        )
        if player_id is not None:
            query = query.where(ArchivePlayerGame.player_id == player_id)
        if team_id is not None:
            query = query.where(ArchivePlayerGame.team_id == team_id)

        query = query.order_by(ArchivePlayerGame.game_date.asc(), ArchivePlayerGame.game_id.asc())

        for game, version_payload in session.execute(query):
            p_name = str(version_payload.get("player") or game.player_id)
            if name_query and name_query.strip().lower() not in p_name.lower():
                continue
            stats = game.stats_json or {}
            results.append(
                {
                    "game_id": game.game_id,
                    "game_date": game.game_date,
                    "season": game.season,
                    "phase": context.phase,
                    "player_id": game.player_id,
                    "player_name": p_name,
                    "team_id": game.team_id,
                    "opponent_id": game.opponent_id,
                    "appearance": game.appearance,
                    "minutes_original": game.minutes_original,
                    "minutes_seconds": game.minutes_seconds,
                    "points": stats.get("points"),
                    "rebounds_offensive": stats.get("reboundsOffensive"),
                    "rebounds_defensive": stats.get("reboundsDefensive"),
                    "rebounds_total": stats.get("reboundsTotal"),
                    "assists": stats.get("assists"),
                    "steals": stats.get("steals"),
                    "blocks": stats.get("blocks"),
                    "turnovers": stats.get("turnovers"),
                    "fouls_personal": stats.get("foulsPersonal"),
                    "field_goals_made": stats.get("fieldGoalsMade"),
                    "field_goals_attempted": stats.get("fieldGoalsAttempted"),
                    "three_pointers_made": stats.get("threePointersMade"),
                    "three_pointers_attempted": stats.get("threePointersAttempted"),
                    "free_throws_made": stats.get("freeThrowsMade"),
                    "free_throws_attempted": stats.get("freeThrowsAttempted"),
                    "side": None,
                    "source_version_id": game.source_version_id,
                    "source_observation_id": game.source_observation_id,
                }
            )

    return results


def _load_team_games(
    session: Session,
    context: ResolvedContext,
    team_id: str | None = None,
) -> list[dict[str, Any]]:
    """Extract and normalize raw team game rows from either workbench or archive tables."""
    results: list[dict[str, Any]] = []

    if context.dataset_type == "workbench":
        wb_query = select(WorkbenchTeamGame).where(
            WorkbenchTeamGame.dataset_id == context.dataset_id,
            WorkbenchTeamGame.season == context.season,
            WorkbenchTeamGame.phase == context.phase,
            WorkbenchTeamGame.game_date < context.before_date,
        )
        if team_id is not None:
            team_info = get_team_info(team_id)
            match_ids = {team_id}
            if team_info:
                match_ids.add(team_info.team_id)
                match_ids.add(team_info.tricode)
            wb_query = wb_query.where(WorkbenchTeamGame.team_id.in_(match_ids))

        wb_query = wb_query.order_by(
            WorkbenchTeamGame.game_date.asc(), WorkbenchTeamGame.game_id.asc()
        )

        for game in session.scalars(wb_query):
            stats = game.stats_json or {}
            results.append(
                {
                    "game_id": game.game_id,
                    "game_date": game.game_date,
                    "season": game.season,
                    "phase": game.phase,
                    "team_id": game.team_id,
                    "opponent_id": game.opponent_id,
                    "side": game.side,
                    "points": game.points,
                    "opponent_points": game.opponent_points,
                    "is_final": game.is_final,
                    "stats": stats,
                }
            )
    else:
        archive_query = select(ArchiveTeamGame).where(
            ArchiveTeamGame.dataset_id == context.dataset_id,
            ArchiveTeamGame.season == context.season,
            ArchiveTeamGame.game_date < context.before_date,
        )
        if team_id is not None:
            archive_query = archive_query.where(ArchiveTeamGame.team_id == team_id)

        archive_query = archive_query.order_by(
            ArchiveTeamGame.game_date.asc(), ArchiveTeamGame.game_id.asc()
        )

        for a_game in session.scalars(archive_query):
            stats = a_game.stats_json or {}
            opp_pts = None
            if a_game.points is not None:
                # Find opponent's game row to determine opponent_points
                opp_game = session.scalar(
                    select(ArchiveTeamGame).where(
                        ArchiveTeamGame.dataset_id == context.dataset_id,
                        ArchiveTeamGame.game_id == a_game.game_id,
                        ArchiveTeamGame.team_id != a_game.team_id,
                    )
                )
                if opp_game is not None:
                    opp_pts = opp_game.points

            results.append(
                {
                    "game_id": a_game.game_id,
                    "game_date": a_game.game_date,
                    "season": a_game.season,
                    "phase": context.phase,
                    "team_id": a_game.team_id,
                    "opponent_id": a_game.opponent_id,
                    "side": a_game.side,
                    "points": a_game.points,
                    "opponent_points": opp_pts,
                    "is_final": True,
                    "stats": stats,
                }
            )

    return results


def execute_player_research_query(
    session: Session,
    context: ResolvedContext,
    query: ResearchQuery,
    *,
    legacy_nonappearance: bool = False,
) -> tuple[list[dict[str, Any]], int, str | None, bool]:
    """Execute typed ResearchQuery and return (items, total_count, next_cursor, has_more).

    Delegates to the SQL-backed stats_engine to ensure query computation executes
    inside the database engine using analytical windows and indexed fact tables.
    """
    from courtlens.domain.query_url import research_query_to_query_spec
    from courtlens.services.stats_engine import execute_stats_query

    spec = research_query_to_query_spec(query)
    is_export = query.limit > 100
    return execute_stats_query(
        session,
        context,
        spec,
        is_export=is_export,
        max_export_rows=query.limit if is_export else MAX_EXPORT_ROWS,
        legacy_nonappearance=legacy_nonappearance,
    )


def get_player_profile(
    session: Session,
    context: ResolvedContext,
    player_id: str,
) -> dict[str, Any]:
    """Retrieve comprehensive player research profile independent of target availability."""
    all_games = _load_player_games(session, context, player_id=player_id)
    if not all_games:
        # Check if player exists at all in the dataset (even in subsequent seasons or 0 games)
        if context.dataset_type == "workbench":
            exists = session.scalar(
                select(WorkbenchPlayerGame.id)
                .where(
                    WorkbenchPlayerGame.dataset_id == context.dataset_id,
                    WorkbenchPlayerGame.player_id == player_id,
                )
                .limit(1)
            )
        else:
            exists = session.scalar(
                select(ArchivePlayerGame.id)
                .where(
                    ArchivePlayerGame.dataset_id == context.dataset_id,
                    ArchivePlayerGame.player_id == player_id,
                )
                .limit(1)
            )
        if exists is None:
            raise HTTPException(status_code=404, detail="player not found in snapshot")

    p_name = all_games[0]["player_name"] if all_games else player_id
    all_games.sort(key=lambda x: (x["game_date"], x["game_id"]))
    appeared = [g for g in all_games if g.get("appearance") == "appeared"]

    season_metrics, season_samples = compute_metrics(all_games)
    last_5_metrics, last_5_samples = compute_metrics(appeared[-5:])
    last_10_metrics, last_10_samples = compute_metrics(appeared[-10:])

    # Multi-team stint breakdown (for traded players)
    teams_observed: set[str] = set(g["team_id"] for g in all_games)
    stints: list[dict[str, Any]] = []

    if len(teams_observed) > 1:
        for tid in sorted(teams_observed):
            team_games = [g for g in all_games if g["team_id"] == tid]
            t_metrics, _ = compute_metrics(team_games)
            stints.append(
                {
                    "team_id": tid,
                    "team_tricode": resolve_team_tricode(tid),
                    "team_name": resolve_team_label(tid),
                    "games_played": t_metrics["gp"],
                    "metrics": t_metrics,
                }
            )

    latest_team = None
    last_observed_date = None
    if appeared:
        last_g = appeared[-1]
        last_observed_date = last_g["game_date"].isoformat()
        latest_team = {
            "id": last_g["team_id"],
            "tricode": resolve_team_tricode(last_g["team_id"]),
            "name": resolve_team_label(last_g["team_id"]),
        }

    warnings = list(context.warnings)
    if not appeared:
        warnings.append("Player has zero confirmed active appearances before the cutoff date.")

    if context.dataset_type == "workbench":
        forecast_status = get_player_prospective_forecast(
            session, player_id, context.dataset_id, context.before_date
        )
    else:
        forecast_status = {
            "status": "archive_mode",
            "message": (
                "Archive release mode; prospective forecasting applies to workbench releases."
            ),
            "horizon_days": 7,
        }

    return {
        "player": {
            "id": player_id,
            "name": p_name,
            "portrait_url": f"/api/workbench/players/{player_id}/portrait",
        },
        "context": context.to_dict(),
        "summaries": {
            "season": season_metrics,
            "last_5": last_5_metrics,
            "last_10": last_10_metrics,
        },
        "sample_sizes": {
            "season": season_samples,
            "last_5": last_5_samples,
            "last_10": last_10_samples,
        },
        "stints": stints,
        "latest_team": latest_team,
        "last_observed_date": last_observed_date,
        "forecast_status": forecast_status,
        "warnings": warnings,
    }


def get_player_game_log(
    session: Session,
    context: ResolvedContext,
    player_id: str,
    limit: int = 50,
    cursor: str | None = None,
) -> tuple[dict[str, str], list[dict[str, Any]], str | None, bool]:
    """Retrieve prior-only game log for a player."""
    all_games = _load_player_games(session, context, player_id=player_id)
    if not all_games:
        raise HTTPException(status_code=404, detail="player not found in snapshot")

    p_name = all_games[0]["player_name"]
    # Reverse chronological order
    all_games.sort(key=lambda x: (x["game_date"], x["game_id"]), reverse=True)

    context_hash = canonical_hash([context.release_id, player_id, context.before_date.isoformat()])[
        :32
    ]
    offset = 0
    if cursor:
        offset = decode_cursor(cursor, context_hash)

    limit = min(max(1, limit), 100)
    visible = all_games[offset : offset + limit]
    has_more = (offset + limit) < len(all_games)
    next_cursor = encode_cursor(context_hash, offset + limit) if has_more else None

    log_items: list[dict[str, Any]] = []
    for g in visible:
        stats = {
            "points": g["points"],
            "rebounds_total": g["rebounds_total"],
            "rebounds_offensive": g["rebounds_offensive"],
            "rebounds_defensive": g["rebounds_defensive"],
            "assists": g["assists"],
            "steals": g["steals"],
            "blocks": g["blocks"],
            "turnovers": g["turnovers"],
            "fouls_personal": g["fouls_personal"],
            "field_goals_made": g["field_goals_made"],
            "field_goals_attempted": g["field_goals_attempted"],
            "three_pointers_made": g["three_pointers_made"],
            "three_pointers_attempted": g["three_pointers_attempted"],
            "free_throws_made": g["free_throws_made"],
            "free_throws_attempted": g["free_throws_attempted"],
        }
        lfs = None
        if all(
            stats[k] is not None
            for k in ("points", "rebounds_total", "assists", "steals", "blocks", "turnovers")
        ):
            lfs = round(
                float(stats["points"])
                + 1.2 * float(stats["rebounds_total"])
                + 1.5 * float(stats["assists"])
                + 3.0 * float(stats["steals"])
                + 3.0 * float(stats["blocks"])
                - float(stats["turnovers"]),
                1,
            )

        log_items.append(
            {
                "game_id": g["game_id"],
                "game_date": g["game_date"].isoformat(),
                "season": g["season"],
                "phase": g["phase"],
                "team_id": g["team_id"],
                "team_tricode": resolve_team_tricode(g["team_id"]),
                "opponent_id": g["opponent_id"],
                "opponent_tricode": resolve_team_tricode(g["opponent_id"]),
                "side": g["side"],
                "appearance": g["appearance"],
                "minutes": round(g["minutes_seconds"] / 60.0, 1)
                if g["minutes_seconds"] is not None
                else None,
                "points": g["points"],
                "stats": stats,
                "legacy_fantasy_score": lfs,
                "lineage_ref": (
                    f"/api/workbench/lineage?releaseId={context.release_id}&playerId={player_id}&gameId={g['game_id']}"
                ),
            }
        )

    return {"id": player_id, "name": p_name}, log_items, next_cursor, has_more


def get_teams_research(
    session: Session,
    context: ResolvedContext,
) -> tuple[list[dict[str, Any]], dict[str, float]]:
    """Retrieve team research facts with records, production, allowance, and four factors."""
    from courtlens.services.team_analytics import _compute_all_team_four_factors

    all_factors, league_averages, _ = _compute_all_team_four_factors(session, context)
    team_games = _load_team_games(session, context)
    games_by_team: dict[str, list[dict[str, Any]]] = {}
    games_by_game_and_team: dict[tuple[str, str], dict[str, Any]] = {}
    for g in team_games:
        games_by_team.setdefault(g["team_id"], []).append(g)
        games_by_game_and_team[(g["game_id"], g["team_id"])] = g
        t_info = get_team_info(g["team_id"])
        if t_info:
            games_by_game_and_team[(g["game_id"], t_info.tricode)] = g
            games_by_game_and_team[(g["game_id"], t_info.team_id)] = g

    team_items: list[dict[str, Any]] = []

    for tid, games in games_by_team.items():
        gp = len(games)
        wins = sum(
            1
            for g in games
            if g["points"] is not None
            and g["opponent_points"] is not None
            and g["points"] > g["opponent_points"]
        )
        losses = sum(
            1
            for g in games
            if g["points"] is not None
            and g["opponent_points"] is not None
            and g["points"] < g["opponent_points"]
        )
        win_pct = round(wins / gp, 3) if gp > 0 else None

        pts_for = sum(g["points"] for g in games if g["points"] is not None)
        pts_against = sum(g["opponent_points"] for g in games if g["opponent_points"] is not None)

        total_fgm = sum(float(g["stats"].get("field_goals_made", 0) or 0) for g in games)
        total_fga = sum(float(g["stats"].get("field_goals_attempted", 0) or 0) for g in games)
        total_fg3m = sum(float(g["stats"].get("three_pointers_made", 0) or 0) for g in games)
        total_fg3a = sum(float(g["stats"].get("three_pointers_attempted", 0) or 0) for g in games)
        total_ftm = sum(float(g["stats"].get("free_throws_made", 0) or 0) for g in games)
        total_fta = sum(float(g["stats"].get("free_throws_attempted", 0) or 0) for g in games)

        opp_fgm = 0.0
        opp_fga = 0.0
        opp_fg3m = 0.0
        opp_fg3a = 0.0
        for g in games:
            opp_g = games_by_game_and_team.get((g["game_id"], g.get("opponent_id", "")))
            if opp_g:
                o_st = opp_g.get("stats") or {}
                opp_fgm += float(o_st.get("field_goals_made", 0) or 0)
                opp_fga += float(o_st.get("field_goals_attempted", 0) or 0)
                opp_fg3m += float(o_st.get("three_pointers_made", 0) or 0)
                opp_fg3a += float(o_st.get("three_pointers_attempted", 0) or 0)

        production = {
            "pts_per_game": round(pts_for / gp, 1) if gp > 0 else None,
            "pts_total": pts_for,
            "fg_pct": round(total_fgm / total_fga, 4) if total_fga > 0 else None,
            "fg3_pct": round(total_fg3m / total_fg3a, 4) if total_fg3a > 0 else None,
            "ft_pct": round(total_ftm / total_fta, 4) if total_fta > 0 else None,
            "efg_pct": (
                round((total_fgm + 0.5 * total_fg3m) / total_fga, 4) if total_fga > 0 else None
            ),
        }
        allowance = {
            "pts_allowed_per_game": round(pts_against / gp, 1) if gp > 0 else None,
            "pts_allowed_total": pts_against,
            "fg_pct_allowed": round(opp_fgm / opp_fga, 4) if opp_fga > 0 else None,
            "fg3_pct_allowed": round(opp_fg3m / opp_fg3a, 4) if opp_fg3a > 0 else None,
            "efg_pct_allowed": (
                round((opp_fgm + 0.5 * opp_fg3m) / opp_fga, 4) if opp_fga > 0 else None
            ),
        }

        team_info = get_team_info(tid)
        canonical_id = team_info.team_id if team_info else tid
        tricode = team_info.tricode if team_info else resolve_team_tricode(tid)
        name = team_info.name if team_info else resolve_team_label(tid)

        team_factors = (
            all_factors.get(tricode) or all_factors.get(canonical_id) or all_factors.get(tid)
        )
        ratings = None
        four_factors = None
        if team_factors:
            ratings = {
                "off_rating": team_factors.get("off_rating"),
                "def_rating": team_factors.get("def_rating"),
                "net_rating": team_factors.get("net_rating"),
                "pace": team_factors.get("pace"),
            }
            four_factors = {
                "efg_pct": team_factors.get("efg_pct"),
                "tov_pct": team_factors.get("tov_pct"),
                "oreb_pct": team_factors.get("oreb_pct"),
                "ftr": team_factors.get("ftr"),
                "opp_efg_pct": team_factors.get("opp_efg_pct"),
                "opp_tov_pct": team_factors.get("opp_tov_pct"),
                "opp_oreb_pct": team_factors.get("opp_oreb_pct"),
                "opp_ftr": team_factors.get("opp_ftr"),
            }

        team_items.append(
            {
                "team_id": canonical_id,
                "tricode": tricode,
                "name": name,
                "games_played": gp,
                "wins": wins,
                "losses": losses,
                "win_pct": win_pct,
                "production": production,
                "allowance": allowance,
                "observed_games": gp,
                "exclusions": 0,
                "conference": team_info.conference if team_info else None,
                "division": team_info.division if team_info else None,
                "ratings": ratings,
                "four_factors": four_factors,
            }
        )

    # Sort stably by win_pct desc, differential desc, team_id
    def _team_sort_key(t: dict[str, Any]) -> tuple[int, float, float, str]:
        wp = t["win_pct"]
        if wp is None:
            return (1, 0.0, 0.0, t["team_id"])
        p_for = t["production"]["pts_per_game"] or 0.0
        p_against = t["allowance"]["pts_allowed_per_game"] or 0.0
        diff = p_for - p_against
        return (0, -wp, -diff, t["team_id"])

    team_items.sort(key=_team_sort_key)
    return team_items, league_averages


def get_team_detail(
    session: Session,
    context: ResolvedContext,
    team_id: str,
) -> dict[str, Any]:
    """Retrieve team details, past games, and participation-scoped player cohort."""
    team_games = _load_team_games(session, context, team_id=team_id)
    if not team_games:
        # Check if team is known
        info = resolve_team_label(team_id)
        if not info:
            raise HTTPException(status_code=404, detail="team not found in snapshot")

    gp = len(team_games)
    wins = sum(
        1
        for g in team_games
        if g["points"] is not None
        and g["opponent_points"] is not None
        and g["points"] > g["opponent_points"]
    )
    losses = sum(
        1
        for g in team_games
        if g["points"] is not None
        and g["opponent_points"] is not None
        and g["points"] < g["opponent_points"]
    )
    win_pct = round(wins / gp, 3) if gp > 0 else None

    pts_for = sum(g["points"] for g in team_games if g["points"] is not None)
    pts_against = sum(g["opponent_points"] for g in team_games if g["opponent_points"] is not None)

    # Player cohort who participated for this team in this season before cutoff
    player_games = _load_player_games(session, context, team_id=team_id)
    players_by_id: dict[str, list[dict[str, Any]]] = {}
    player_names: dict[str, str] = {}
    for pg in player_games:
        pid = pg["player_id"]
        players_by_id.setdefault(pid, []).append(pg)
        player_names[pid] = pg["player_name"]

    cohort: list[dict[str, Any]] = []
    for pid, pgames in players_by_id.items():
        m, _ = compute_metrics(pgames)
        cohort.append(
            {
                "player_id": pid,
                "player_name": player_names[pid],
                "games_played": m["gp"],
                "total_minutes": m["min"],
                "pts_per_game": m["pts_per_game"],
                "reb_per_game": m["reb_per_game"],
                "ast_per_game": m["ast_per_game"],
            }
        )
    cohort.sort(key=lambda x: (x["games_played"], x["pts_per_game"] or 0), reverse=True)

    recent_games = [
        {
            "game_id": g["game_id"],
            "game_date": g["game_date"].isoformat(),
            "opponent_id": g["opponent_id"],
            "opponent_tricode": resolve_team_tricode(g["opponent_id"]),
            "side": g["side"],
            "points": g["points"],
            "opponent_points": g["opponent_points"],
            "is_win": (g["points"] > g["opponent_points"])
            if g["points"] and g["opponent_points"]
            else None,
        }
        for g in sorted(team_games, key=lambda x: (x["game_date"], x["game_id"]), reverse=True)[:10]
    ]

    team_info = get_team_info(team_id)
    canonical_id = team_info.team_id if team_info else team_id
    tricode = team_info.tricode if team_info else resolve_team_tricode(team_id)
    name = team_info.name if team_info else resolve_team_label(team_id)

    sched_context = compute_team_schedule_context(team_games)

    total_fgm = sum(float(g["stats"].get("field_goals_made", 0) or 0) for g in team_games)
    total_fga = sum(float(g["stats"].get("field_goals_attempted", 0) or 0) for g in team_games)
    total_fg3m = sum(float(g["stats"].get("three_pointers_made", 0) or 0) for g in team_games)
    total_fg3a = sum(float(g["stats"].get("three_pointers_attempted", 0) or 0) for g in team_games)
    total_ftm = sum(float(g["stats"].get("free_throws_made", 0) or 0) for g in team_games)
    total_fta = sum(float(g["stats"].get("free_throws_attempted", 0) or 0) for g in team_games)

    return {
        "team": {
            "id": canonical_id,
            "tricode": tricode,
            "name": name,
        },
        "context": context.to_dict(),
        "record": {
            "games_played": gp,
            "wins": wins,
            "losses": losses,
            "win_pct": win_pct,
            "differential": round(pts_for - pts_against, 1),
        },
        "production": {
            "pts_per_game": round(pts_for / gp, 1) if gp > 0 else None,
            "pts_total": pts_for,
            "fg_pct": round(total_fgm / total_fga, 4) if total_fga > 0 else None,
            "fg3_pct": round(total_fg3m / total_fg3a, 4) if total_fg3a > 0 else None,
            "ft_pct": round(total_ftm / total_fta, 4) if total_fta > 0 else None,
            "efg_pct": (
                round((total_fgm + 0.5 * total_fg3m) / total_fga, 4) if total_fga > 0 else None
            ),
        },
        "allowance": {
            "pts_allowed_per_game": round(pts_against / gp, 1) if gp > 0 else None,
            "pts_allowed_total": pts_against,
        },
        "home_split": sched_context["home_split"],
        "away_split": sched_context["away_split"],
        "current_streak": sched_context["overall_record"]["current_streak"],
        "player_cohort": cohort,
        "recent_games": recent_games,
        "warnings": list(context.warnings),
    }


def compare_players(
    session: Session,
    context: ResolvedContext,
    player_a_id: str,
    player_b_id: str,
) -> dict[str, Any]:
    """Compare two players under the identical resolved query context."""
    profile_a = get_player_profile(session, context, player_a_id)
    profile_b = get_player_profile(session, context, player_b_id)

    metrics_a = profile_a["summaries"][context.window]
    metrics_b = profile_b["summaries"][context.window]

    samples_a = profile_a["sample_sizes"][context.window]
    samples_b = profile_b["sample_sizes"][context.window]
    aligned_metrics: list[dict[str, Any]] = []

    for defn in METRIC_CATALOG.values():
        k = defn.key
        va = metrics_a.get(k)
        vb = metrics_b.get(k)
        diff = None
        if isinstance(va, (int, float)) and isinstance(vb, (int, float)):
            diff = round(va - vb, 2)

        aligned_metrics.append(
            {
                "metric": k,
                "display_name": defn.display_name,
                "unit": defn.unit,
                "value_a": va,
                "value_b": vb,
                "diff": diff,
                "n_a": samples_a.get(k, 0),
                "n_b": samples_b.get(k, 0),
            }
        )

    return {
        "context": context.to_dict(),
        "player_a": {
            "id": player_a_id,
            "name": profile_a["player"]["name"],
            "games_played": metrics_a.get("gp", 0),
            "total_minutes": metrics_a.get("min", 0.0),
            "metrics": metrics_a,
            "sample_sizes": samples_a,
            "forecast_status": profile_a["forecast_status"],
        },
        "player_b": {
            "id": player_b_id,
            "name": profile_b["player"]["name"],
            "games_played": metrics_b.get("gp", 0),
            "total_minutes": metrics_b.get("min", 0.0),
            "metrics": metrics_b,
            "sample_sizes": samples_b,
            "forecast_status": profile_b["forecast_status"],
        },
        "aligned_metrics": aligned_metrics,
        "no_forced_winner_notice": (
            "CourtLens displays aligned empirical distributions and descriptive differences. "
            "We never invent a winner probability or automated start/sit decision from "
            "overlapping ranges."
        ),
        "warnings": list(context.warnings),
    }


def get_lineage(
    session: Session,
    context: ResolvedContext,
    player_id: str | None = None,
    game_id: str | None = None,
    team_id: str | None = None,
) -> dict[str, Any]:
    """Retrieve lineage information with sanitized locators."""
    contributing_facts: list[dict[str, Any]] = []

    if context.dataset_type == "workbench":
        wb_query = select(WorkbenchPlayerGame).where(
            WorkbenchPlayerGame.dataset_id == context.dataset_id,
            WorkbenchPlayerGame.game_date < context.before_date,
        )
        if player_id:
            wb_query = wb_query.where(WorkbenchPlayerGame.player_id == player_id)
        if game_id:
            wb_query = wb_query.where(WorkbenchPlayerGame.game_id == game_id)
        if team_id:
            wb_query = wb_query.where(WorkbenchPlayerGame.team_id == team_id)

        for fact in session.scalars(wb_query.limit(20)):
            contributing_facts.append(
                {
                    "kind": "workbench_player_game",
                    "fact_id": fact.id,
                    "game_id": fact.game_id,
                    "game_date": fact.game_date.isoformat(),
                    "source_version_id": fact.source_version_id,
                    "source_observation_id": fact.source_observation_id,
                }
            )
    else:
        archive_query = select(ArchivePlayerGame).where(
            ArchivePlayerGame.dataset_id == context.dataset_id,
            ArchivePlayerGame.game_date < context.before_date,
        )
        if player_id:
            archive_query = archive_query.where(ArchivePlayerGame.player_id == player_id)
        if game_id:
            archive_query = archive_query.where(ArchivePlayerGame.game_id == game_id)
        if team_id:
            archive_query = archive_query.where(ArchivePlayerGame.team_id == team_id)

        for a_fact in session.scalars(archive_query.limit(20)):
            contributing_facts.append(
                {
                    "kind": "archive_player_game",
                    "fact_id": a_fact.id,
                    "game_id": a_fact.game_id,
                    "game_date": a_fact.game_date.isoformat(),
                    "source_version_id": a_fact.source_version_id,
                    "source_observation_id": a_fact.source_observation_id,
                }
            )

    transform_path = [
        f"Raw data acquisition from {context.source}",
        "Normalization into immutable entity versions and observations",
        (
            f"Dataset compilation ({context.dataset_id}) with semantic signature "
            f"{context.semantic_signature[:16]}..."
        ),
        (
            f"Analytical query filtering: season={context.season}, phase={context.phase}, "
            f"game_date < {context.before_date.isoformat()}"
        ),
        f"Canonical metric calculation ({METRIC_CATALOG_VERSION})",
    ]

    return {
        "release_id": context.release_id,
        "dataset_id": context.dataset_id,
        "semantic_signature": context.semantic_signature,
        "source_namespace": context.source,
        "contributing_facts": contributing_facts,
        "transform_path": transform_path,
        "warnings": list(context.warnings),
    }


def save_investigation(
    session: Session,
    context: ResolvedContext,
    title: str,
    query: ResearchQuery,
) -> SavedInvestigation:
    """Save bounded investigation manifest and full reproducible results."""
    # Execute full query up to MAX_EXPORT_ROWS
    unbounded_query = ResearchQuery(
        release_id=query.release_id,
        season=query.season,
        phase=query.phase,
        before_date=query.before_date,
        window=query.window,
        team_id=query.team_id,
        name=query.name,
        metrics=query.metrics,
        min_games=query.min_games,
        min_minutes=query.min_minutes,
        min_avg_minutes=query.min_avg_minutes,
        sort_metric=query.sort_metric,
        sort_direction=query.sort_direction,
        limit=MAX_EXPORT_ROWS,
        cursor=None,
    )
    items, _, _, _ = execute_player_research_query(session, context, unbounded_query)

    result_payload = items
    result_sha256 = canonical_hash(result_payload)

    manifest_payload = {
        "title": title,
        "query": query.to_dict(),
        "context": context.to_dict(),
        "metric_version": METRIC_CATALOG_VERSION,
        "total_rows": len(result_payload),
        "result_sha256": result_sha256,
        "timestamp": utc_now().isoformat(),
    }
    manifest_sha256 = canonical_hash(manifest_payload)

    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    artifact_path = ARTIFACTS_DIR / f"{result_sha256}.json"
    artifact_path.write_text(json.dumps(result_payload, separators=(",", ":")), encoding="utf-8")

    investigation = SavedInvestigation(
        id=new_uuid(),
        manifest_sha256=manifest_sha256,
        title=title,
        query_json=query.to_dict(),
        context_json=context.to_dict(),
        metric_version=METRIC_CATALOG_VERSION,
        result_sha256=result_sha256,
        result_artifact_path=str(artifact_path),
        warnings_json=list(context.warnings),
        created_at=utc_now(),
    )
    session.add(investigation)
    session.commit()
    return investigation


def get_investigation(session: Session, investigation_id: str) -> dict[str, Any]:
    """Retrieve saved investigation and its verified result rows."""
    inv = session.get(SavedInvestigation, investigation_id)
    if inv is None:
        inv = session.scalar(
            select(SavedInvestigation).where(SavedInvestigation.manifest_sha256 == investigation_id)
        )
    if inv is None:
        raise HTTPException(status_code=404, detail="investigation not found")

    artifact_path = Path(inv.result_artifact_path)
    if not artifact_path.exists():
        raise HTTPException(status_code=500, detail="saved analysis artifact file is missing")

    results = json.loads(artifact_path.read_text(encoding="utf-8"))
    return {
        "id": inv.id,
        "title": inv.title,
        "manifest_sha256": inv.manifest_sha256,
        "result_sha256": inv.result_sha256,
        "query": inv.query_json,
        "context": inv.context_json,
        "metric_version": inv.metric_version,
        "total_rows": len(results),
        "results": results,
        "created_at": inv.created_at.isoformat(),
    }


def reproduce_investigation(session: Session, investigation_id: str) -> dict[str, Any]:
    """Re-execute saved query against bound input release and compare SHA-256."""
    inv = session.get(SavedInvestigation, investigation_id)
    if inv is None:
        inv = session.scalar(
            select(SavedInvestigation).where(SavedInvestigation.manifest_sha256 == investigation_id)
        )
    if inv is None:
        raise HTTPException(status_code=404, detail="investigation not found")

    q_dict = inv.query_json
    c_dict = inv.context_json

    context = resolve_workbench_context(
        session,
        release_id=c_dict.get("release_id"),
        requested_season=c_dict.get("season"),
        requested_phase=c_dict.get("phase"),
        requested_before_date=date.fromisoformat(c_dict["before_date"])
        if "before_date" in c_dict
        else None,
        requested_window=c_dict.get("window"),
    )

    query = ResearchQuery(
        release_id=q_dict.get("release_id"),
        season=q_dict.get("season"),
        phase=q_dict.get("phase", "regular_season"),
        before_date=date.fromisoformat(q_dict["before_date"])
        if q_dict.get("before_date")
        else None,
        window=q_dict.get("window", "season"),
        team_id=q_dict.get("team_id"),
        name=q_dict.get("name"),
        metrics=q_dict.get("metrics"),
        min_games=q_dict.get("min_games"),
        min_minutes=q_dict.get("min_minutes"),
        min_avg_minutes=q_dict.get("min_avg_minutes"),
        sort_metric=q_dict.get("sort_metric", "pts"),
        sort_direction=q_dict.get("sort_direction"),
        limit=MAX_EXPORT_ROWS,
        cursor=None,
    )

    items, _, _, _ = execute_player_research_query(session, context, query)
    new_hash = canonical_hash(items)
    is_match = new_hash == inv.result_sha256
    if not is_match and context.dataset_type == "workbench":
        legacy_items, _, _, _ = execute_player_research_query(
            session, context, query, legacy_nonappearance=True
        )
        legacy_hash = canonical_hash(legacy_items)
        if legacy_hash == inv.result_sha256:
            items = legacy_items
            new_hash = legacy_hash
            is_match = True

    return {
        "id": inv.id,
        "reproducible": is_match,
        "saved_result_sha256": inv.result_sha256,
        "recomputed_result_sha256": new_hash,
        "match": is_match,
        "reason": None if is_match else "Results differed from the saved artifact hash.",
    }


def export_investigation(
    session: Session,
    investigation_id: str,
    export_format: Literal["csv", "json"] = "csv",
) -> tuple[str, str, str]:
    """Export saved investigation with formula injection escaping for CSV.

    Returns:
        (content_str, mime_type, filename)
    """
    data = get_investigation(session, investigation_id)
    title_slug = data["title"].lower().replace(" ", "_")[:30]

    if export_format == "json":
        output = json.dumps(data, indent=2)
        return output, "application/json", f"courtlens_{title_slug}_{data['id'][:8]}.json"

    # CSV Format with formula injection sanitization
    output_stream = io.StringIO()
    writer = csv.writer(output_stream)

    # Header metadata comments
    writer.writerow(["# CourtLens Workbench Analysis Export"])
    writer.writerow([f"# Title: {data['title']}"])
    writer.writerow([f"# Manifest SHA-256: {data['manifest_sha256']}"])
    writer.writerow([f"# Result SHA-256: {data['result_sha256']}"])
    writer.writerow([f"# Metric Version: {data['metric_version']}"])
    writer.writerow([f"# Created: {data['created_at']}"])
    writer.writerow([])

    results = data["results"]
    if not results:
        writer.writerow(["No results found"])
        return output_stream.getvalue(), "text/csv", f"courtlens_{title_slug}.csv"

    # Column headers
    headers = [
        "player_id",
        "player_name",
        "teams",
        "games_played",
        "total_minutes",
    ]
    # Add metric columns
    first_metrics = results[0].get("metrics", {})
    metric_keys = sorted(first_metrics.keys())
    headers.extend(metric_keys)
    writer.writerow(headers)

    for row in results:
        m = row.get("metrics", {})
        row_vals = [
            row.get("player_id"),
            _sanitize_csv_cell(row.get("player_name", "")),
            "/".join(row.get("teams", [])),
            row.get("games_played"),
            row.get("total_minutes"),
        ]
        for mk in metric_keys:
            val = m.get(mk)
            row_vals.append(val if val is not None else "")
        writer.writerow(row_vals)

    return output_stream.getvalue(), "text/csv", f"courtlens_{title_slug}_{data['id'][:8]}.csv"


def _sanitize_csv_cell(value: Any) -> Any:
    """Escape CSV formula injection characters: '=', '+', '-', '@'."""
    if isinstance(value, str) and value.startswith(("=", "+", "-", "@")):
        return f"'{value}"
    return value
