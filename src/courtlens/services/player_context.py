"""Read-only dated context and projected roster joins to existing catalog computations."""

from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from courtlens.api.player_context_schemas import ContextDatasetInfo
from courtlens.archive_models import ArchivePlayerGame
from courtlens.domain.query_spec import MetricSelector, QuerySpec
from courtlens.domain.teams import get_team_info
from courtlens.ingestion.player_context import valid_season
from courtlens.player_context_models import (
    PlayerContextDataset,
    PlayerContextMember,
    PlayerContextVersion,
)
from courtlens.services.stats_engine import execute_stats_query
from courtlens.services.workbench_analytics import resolve_workbench_context
from courtlens.workbench_models import WorkbenchAcquisition, WorkbenchPlayerGame

REFERENCE_METRICS = ("gp", "min", "pts_per_game", "reb_per_game", "ast_per_game")


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def dataset_info(session: Session, dataset: PlayerContextDataset) -> ContextDatasetInfo:
    acquisition = session.get(WorkbenchAcquisition, dataset.acquisition_id)
    assert acquisition is not None
    return ContextDatasetInfo(
        dataset_id=dataset.id,
        source=dataset.source_name,
        source_url=acquisition.source_url,
        kind=dataset.kind,
        season=dataset.season,
        observed_at=aware(dataset.observed_at),
        content_sha256=dataset.content_sha256,
        membership_sha256=dataset.membership_sha256,
        parser_version=dataset.parser_version,
        coverage=dataset.coverage_json,
    )


def resolve_dataset(
    session: Session, dataset_id: str, known_at: datetime | None = None, kind: str | None = None
) -> PlayerContextDataset:
    if known_at is not None and known_at.tzinfo is None:
        raise HTTPException(422, "knownAt must include a timezone")
    dataset = session.get(PlayerContextDataset, dataset_id)
    if dataset is None:
        raise HTTPException(404, "player context dataset not found")
    if known_at is not None and aware(dataset.observed_at) > known_at:
        raise HTTPException(422, "dataset was observed after knownAt")
    if kind is not None and dataset.kind != kind:
        raise HTTPException(422, "dataset kind is incompatible with this operation")
    return dataset


def dataset_rows(
    session: Session, dataset: PlayerContextDataset, limit: int | None = None, offset: int = 0
) -> list[dict[str, Any]]:
    query = (
        select(PlayerContextVersion.payload_json)
        .join(PlayerContextMember, PlayerContextMember.version_id == PlayerContextVersion.id)
        .where(PlayerContextMember.dataset_id == dataset.id)
        .order_by(PlayerContextMember.entity_key)
        .offset(offset)
    )
    if limit is not None:
        query = query.limit(limit)
    return [dict(p) for p in session.scalars(query).all()]


def context_catalog(
    session: Session, season: str, known_at: datetime | None = None
) -> dict[str, Any]:
    valid_season(season)
    if known_at is not None and known_at.tzinfo is None:
        raise HTTPException(422, "knownAt must include a timezone")
    query = select(PlayerContextDataset).where(PlayerContextDataset.season == season)
    attempts_query = select(WorkbenchAcquisition).where(
        WorkbenchAcquisition.resource == "player_context"
    )
    if known_at is not None:
        query = query.where(PlayerContextDataset.observed_at <= known_at)
        attempts_query = attempts_query.where(WorkbenchAcquisition.finished_at <= known_at)
    datasets = list(
        session.scalars(
            query.order_by(
                PlayerContextDataset.observed_at.desc(),
                PlayerContextDataset.observation_order.desc(),
            )
        ).all()
    )
    attempts = [
        a
        for a in session.scalars(
            attempts_query.order_by(WorkbenchAcquisition.finished_at.desc()).limit(30)
        ).all()
        if a.metadata_json.get("season") == season
    ]
    capabilities = []
    for kind in ("player_index", "injuries", "transactions"):
        ds = next((d for d in datasets if d.kind == kind), None)
        failed = next(
            (a for a in attempts if a.metadata_json.get("kind") == kind and a.status == "failed"),
            None,
        )
        status = "not_yet_observed" if failed is None else "source_blocked"
        limitation = "No admitted observation; missing data remains unknown."
        if ds:
            # Index snapshots do not establish total roster completeness or transaction history.
            status = "partial"
            limitation = "; ".join(ds.coverage_json.get("limitations", []))
        capabilities.append(
            {
                "name": kind,
                "status": status,
                "dataset": dataset_info(session, ds) if ds else None,
                "limitation": limitation,
            }
        )
    return {
        "season": season,
        "known_at": known_at,
        "capabilities": capabilities,
        "attempts": [
            {
                "source": a.source_name,
                "observed_at": a.finished_at,
                "status": a.status,
                "http_status": a.http_status,
                "reason": a.error_summary,
            }
            for a in attempts
        ],
    }


def projected_roster(
    session: Session,
    dataset_id: str,
    team_id: str | None,
    statistics_release_id: str | None,
    known_at: datetime | None = None,
) -> dict[str, Any]:
    dataset = resolve_dataset(session, dataset_id, known_at, "player_index")
    team = get_team_info(team_id) if team_id else None
    if team_id and team is None:
        raise HTTPException(422, "unknown NBA team")
    players = [
        p
        for p in dataset_rows(session, dataset)
        if p["roster_status"] == "active" and (team is None or p["team_id"] == team.team_id)
    ]
    start = int(dataset.season[:4]) - 1
    reference_season = f"{start}-{(start + 1) % 100:02d}"
    reference: dict[str, dict[str, Any]] = {}
    release_id = None
    current_appearances = None
    limits = [
        "Projected roster context; prior-season statistics are references, not forecasts.",
        "Current team comes from the dated index, not prior-season participation.",
        "Players without admitted reference statistics remain unknown.",
    ]
    if statistics_release_id is not None:
        # Metadata observations and reference statistics have separate input identities.
        context = resolve_workbench_context(
            session,
            release_id=statistics_release_id,
            requested_season=reference_season,
            requested_phase="regular_season",
            requested_before_date=date(start + 1, 7, 1),
        )
        query = QuerySpec(
            release_id=context.release_id,
            season=reference_season,
            before_date=context.before_date,
            metric_selectors=[MetricSelector(key=k) for k in REFERENCE_METRICS],
        )
        values, _, _, _ = execute_stats_query(
            session, context, query, is_export=True, max_export_rows=2000
        )
        reference = {row["player_id"]: row for row in values}
        release_id = context.release_id
        model = WorkbenchPlayerGame if context.dataset_type == "workbench" else ArchivePlayerGame
        games_query = (
            select(func.count())
            .select_from(model)
            .where(
                model.dataset_id == context.dataset_id,
                model.season == dataset.season,
                model.appearance == "appeared",
            )
        )
        if context.dataset_type == "workbench":
            games_query = games_query.where(WorkbenchPlayerGame.phase == "regular_season")
        current_appearances = session.scalar(games_query) or 0
        limits.append(
            "No current-season minutes observed in the bound statistics release."
            if current_appearances == 0
            else "Current-season appearances exist; this view still uses prior-season references."
        )
    else:
        limits.append("Select a statistics release to attach prior-season references.")
    result_players = []
    for player in players:
        stats = reference.get(player["player_id"])
        result_players.append(
            {
                **player,
                "reference": {
                    "season": reference_season,
                    "release_id": release_id,
                    "before_date": context.before_date.isoformat(),
                    "metrics": {key: stats["metrics"].get(key) for key in REFERENCE_METRICS},
                    "sample_sizes": {
                        key: stats["sample_sizes"].get(key, 0) for key in REFERENCE_METRICS
                    },
                }
                if stats
                else None,
                "reference_unknown_reason": None if stats else "no_admitted_reference_statistics",
            }
        )
    return {
        "context": dataset_info(session, dataset),
        "label": f"{dataset.season} · Projected",
        "reference_season": reference_season,
        "statistics_release_id": release_id,
        "current_season_appearances_in_release": current_appearances,
        "limitations": limits,
        "players": result_players,
    }
