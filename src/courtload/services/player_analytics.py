"""Read-only assembly for immutable, published player analytics."""

from __future__ import annotations

import base64
import json
from dataclasses import dataclass
from datetime import UTC, date, datetime, time
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from courtload.archive_models import (
    ArchiveArtifact,
    ArchiveDataset,
    ArchiveObservation,
    ArchiveTeamGame,
    ArchiveVersion,
)
from courtload.evaluation.config import load_config
from courtload.services.publication import DEFAULT_CHANNEL, published_snapshot_query
from courtload.services.replay_estimates import CONFIG_PATH, profile_estimate
from courtload.warehouse_models import (
    PublishedSnapshot,
    ServingOpponentContext,
    ServingPlayerGame,
    ServingPlayerProfile,
    ServingSnapshot,
    WarehouseBuild,
)


@dataclass(frozen=True)
class SnapshotContext:
    snapshot: ServingSnapshot
    published_at: str | None
    warnings: list[str]


def resolve_snapshot(
    session: Session, snapshot_id: str | None, *, channel: str = DEFAULT_CHANNEL
) -> SnapshotContext:
    """Resolve the mutable pointer once, after which callers use only its immutable ID."""
    published_at = None
    if snapshot_id is None:
        snapshot = session.scalar(published_snapshot_query(channel))
        pointer = session.get(PublishedSnapshot, channel)
        if snapshot is None or pointer is None:
            raise HTTPException(
                status_code=503,
                detail={
                    "reason": "no_published_data",
                    "message": "No analytics snapshot is published.",
                },
            )
        published_at = pointer.published_at.isoformat()
    else:
        snapshot = session.get(ServingSnapshot, snapshot_id)
        if snapshot is None:
            raise HTTPException(status_code=404, detail="snapshot not found")
        if snapshot.status != "ready":
            raise HTTPException(
                status_code=410,
                detail={"reason": "snapshot_retired", "message": "This snapshot is unavailable."},
            )
        pointer = session.get(PublishedSnapshot, channel)
        if pointer is not None and pointer.snapshot_id == snapshot.id:
            published_at = pointer.published_at.isoformat()

    warnings = [
        "Historical reconstruction from an archive observed after the games were played.",
        "Schedule and team association are reconstructed from completed historical records.",
    ]
    newer_failure = session.scalar(
        select(WarehouseBuild.id).where(
            WarehouseBuild.dataset_id == snapshot.dataset_id,
            WarehouseBuild.status == "failed",
            WarehouseBuild.created_at > snapshot.created_at,
        )
    )
    if newer_failure is not None:
        warnings.append("A newer warehouse build failed; this is the last ready snapshot.")
    return SnapshotContext(snapshot=snapshot, published_at=published_at, warnings=warnings)


def resolve_replay_date(snapshot: ServingSnapshot, requested: date | None) -> date:
    replay_date = requested or snapshot.default_replay_date
    supported = set(snapshot.supported_replay_dates_json)
    if replay_date.isoformat() not in supported:
        raise HTTPException(
            status_code=422,
            detail={
                "reason": "unsupported_replay_date",
                "message": "The selected date is not available in this snapshot.",
                "coverage_start": snapshot.coverage_start.isoformat(),
                "coverage_end": snapshot.coverage_end.isoformat(),
                "nearest_supported_dates": _nearest_dates(replay_date, supported),
            },
        )
    return replay_date


def metadata(context: SnapshotContext, replay_date: date) -> dict[str, Any]:
    snapshot = context.snapshot
    return {
        "snapshot_id": snapshot.id,
        "dataset_id": snapshot.dataset_id,
        "replay_date": replay_date.isoformat(),
        "cutoff_utc": _cutoff_utc(replay_date),
        "mode": snapshot.mode,
        "source": snapshot.source,
        "coverage_end": snapshot.coverage_end.isoformat(),
        "metric_version": snapshot.metric_version,
        "scoring_version": snapshot.scoring_version,
        "warnings": list(context.warnings),
    }


def catalog(session: Session, snapshot_id: str | None) -> dict[str, Any]:
    context = resolve_snapshot(session, snapshot_id)
    snapshot = context.snapshot
    seasons = list(
        session.scalars(
            select(ServingPlayerGame.season)
            .where(ServingPlayerGame.snapshot_id == snapshot.id)
            .distinct()
            .order_by(ServingPlayerGame.season)
        )
    )
    result = metadata(context, snapshot.default_replay_date)
    result.update(
        {
            "coverage_start": snapshot.coverage_start.isoformat(),
            "default_replay_date": snapshot.default_replay_date.isoformat(),
            "supported_replay_dates": snapshot.supported_replay_dates_json,
            "supported_seasons": seasons,
            "published_at": context.published_at,
            "feature_version": snapshot.feature_version,
            "estimator": _catalog_estimator(session, snapshot),
        }
    )
    return result


def _catalog_estimator(session: Session, snapshot: ServingSnapshot) -> dict[str, str | None]:
    try:
        frozen = load_config(CONFIG_PATH)
    except (OSError, ValueError):
        return {"status": "artifact_not_available", "version": None}
    dataset = session.get(ArchiveDataset, snapshot.dataset_id)
    if (
        snapshot.id == frozen.snapshot_id
        and dataset is not None
        and dataset.content_sha256 == frozen.dataset.content_sha256
        and dataset.observation_sha256 == frozen.dataset.observation_sha256
        and snapshot.scoring_version == frozen.target.scoring_sha256
    ):
        return {"status": "baseline_selected", "version": "ewma_20_hl5"}
    return {"status": "artifact_not_available", "version": None}


def search_players(
    session: Session,
    context: SnapshotContext,
    query: str,
    season: str | None,
    limit: int,
) -> list[dict[str, Any]]:
    escaped = query.replace("%", "\\%").replace("_", "\\_")
    statement = (
        select(
            ServingPlayerGame.player_id,
            func.min(ServingPlayerGame.player_name),
            func.max(ServingPlayerGame.game_date),
        )
        .where(
            ServingPlayerGame.snapshot_id == context.snapshot.id,
            ServingPlayerGame.player_name.ilike(f"%{escaped}%", escape="\\"),
        )
        .group_by(ServingPlayerGame.player_id)
        .order_by(func.min(ServingPlayerGame.player_name), ServingPlayerGame.player_id)
        .limit(limit)
    )
    if season is not None:
        statement = statement.where(ServingPlayerGame.season == season)
    return [
        {"id": player_id, "name": name, "last_observed_date": last_date.isoformat()}
        for player_id, name, last_date in session.execute(statement)
    ]


def player_profile(
    session: Session, context: SnapshotContext, player_id: str, replay_date: date
) -> dict[str, Any]:
    snapshot = context.snapshot
    row = session.scalar(
        select(ServingPlayerProfile).where(
            ServingPlayerProfile.snapshot_id == snapshot.id,
            ServingPlayerProfile.player_id == player_id,
            ServingPlayerProfile.replay_date == replay_date,
        )
    )
    identity = session.execute(
        select(ServingPlayerGame.player_name, ServingPlayerGame.season)
        .where(
            ServingPlayerGame.snapshot_id == snapshot.id,
            ServingPlayerGame.player_id == player_id,
        )
        .order_by(
            func.abs(func.julianday(ServingPlayerGame.game_date) - func.julianday(replay_date))
            if session.get_bind().dialect.name == "sqlite"
            else func.abs(ServingPlayerGame.game_date - replay_date),
            ServingPlayerGame.game_date,
        )
        .limit(1)
    ).first()
    if identity is None:
        raise HTTPException(status_code=404, detail="player not found in snapshot")

    result = metadata(context, replay_date)
    if row is None:
        result["warnings"].append("No pre-cutoff profile and reconstructed target are available.")
        result.update(
            {
                "player": {"id": player_id, "name": identity[0], "season": identity[1]},
                "last_observed": None,
                "summaries": {"last_5": None, "last_10": None, "season": None},
                "target": None,
                "opponent_context": None,
                "estimate": {
                    "status": "no_reconstructed_target",
                    "history_n": 0,
                    "point": None,
                    "interval": None,
                },
            }
        )
        return result

    target_team = session.scalar(
        select(ArchiveTeamGame).where(
            ArchiveTeamGame.dataset_id == snapshot.dataset_id,
            ArchiveTeamGame.game_id == row.target_game_id,
            ArchiveTeamGame.team_id == row.inferred_team_id,
        )
    )
    previous_team_date = session.scalar(
        select(func.max(ArchiveTeamGame.game_date)).where(
            ArchiveTeamGame.dataset_id == snapshot.dataset_id,
            ArchiveTeamGame.team_id == row.inferred_team_id,
            ArchiveTeamGame.game_date < row.target_game_date,
        )
    )
    opponent = session.scalar(
        select(ServingOpponentContext).where(
            ServingOpponentContext.snapshot_id == snapshot.id,
            ServingOpponentContext.team_id == row.target_opponent_id,
            ServingOpponentContext.replay_date == replay_date,
        )
    )
    team_labels = _team_labels_by_game(session, snapshot.dataset_id, [row.target_game_id]).get(
        row.target_game_id, {}
    )
    result.update(
        {
            "cutoff_utc": row.cutoff_utc.isoformat(),
            "player": {"id": row.player_id, "name": row.player_name, "season": row.season},
            "last_observed": {
                "team_id": row.inferred_team_id,
                "date": row.last_observed_date.isoformat(),
                "association": "last_observed_team",
            },
            "summaries": {
                "last_5": _numbers(row.last_5_json),
                "last_10": _numbers(row.last_10_json),
                "season": _numbers(row.season_json),
            },
            "target": {
                "game_id": row.target_game_id,
                "date": row.target_game_date.isoformat(),
                "team_id": row.inferred_team_id,
                "team": team_labels.get(row.inferred_team_id),
                "opponent_id": row.target_opponent_id,
                "opponent": team_labels.get(row.target_opponent_id),
                "side": target_team.side if target_team else None,
                "lead_days": row.lead_days,
                "rest_days": (row.target_game_date - previous_team_date).days - 1
                if previous_team_date
                else None,
                "reconstruction": "last_observed_team",
            },
            "opponent_context": {
                "eligible_games": opponent.eligible_games,
                "values": _numbers(opponent.context_json),
                "max_history_date": opponent.max_history_date.isoformat()
                if opponent.max_history_date
                else None,
            }
            if opponent
            else None,
            "estimate": profile_estimate(session, row, snapshot),
        }
    )
    if opponent is None or opponent.eligible_games < 5:
        result["warnings"].append("Insufficient opponent coverage; allowances are unavailable.")
    return result


def player_games(
    session: Session,
    context: SnapshotContext,
    player_id: str,
    replay_date: date,
    cursor: str | None,
    limit: int,
) -> dict[str, Any]:
    snapshot = context.snapshot
    conditions = [
        ServingPlayerGame.snapshot_id == snapshot.id,
        ServingPlayerGame.player_id == player_id,
        ServingPlayerGame.game_date < replay_date,
    ]
    if cursor:
        cursor_date, cursor_game = _decode_cursor(cursor, snapshot.id, player_id, replay_date)
        conditions.append(
            or_(
                ServingPlayerGame.game_date < cursor_date,
                and_(
                    ServingPlayerGame.game_date == cursor_date,
                    ServingPlayerGame.game_id < cursor_game,
                ),
            )
        )
    rows = list(
        session.scalars(
            select(ServingPlayerGame)
            .where(*conditions)
            .order_by(ServingPlayerGame.game_date.desc(), ServingPlayerGame.game_id.desc())
            .limit(limit + 1)
        )
    )
    if not rows:
        exists = session.scalar(
            select(ServingPlayerGame.id).where(
                ServingPlayerGame.snapshot_id == snapshot.id,
                ServingPlayerGame.player_id == player_id,
            )
        )
        if exists is None:
            raise HTTPException(status_code=404, detail="player not found in snapshot")
    has_more = len(rows) > limit
    visible = rows[:limit]
    labels_by_game = _team_labels_by_game(
        session, snapshot.dataset_id, [game.game_id for game in visible]
    )
    next_cursor = (
        _encode_cursor(snapshot.id, player_id, replay_date, visible[-1])
        if has_more and visible
        else None
    )
    result = metadata(context, replay_date)
    result.update(
        {
            "player_id": player_id,
            "games": [
                {
                    "game_id": game.game_id,
                    "date": game.game_date.isoformat(),
                    "season": game.season,
                    "team_id": game.team_id,
                    "team": labels_by_game.get(game.game_id, {}).get(game.team_id),
                    "opponent_id": game.opponent_id,
                    "opponent": labels_by_game.get(game.game_id, {}).get(game.opponent_id),
                    "appearance": game.appearance,
                    "minutes": round(game.minutes_seconds / 60, 2)
                    if game.minutes_seconds is not None
                    else None,
                    "stats": game.stats_json,
                    "reference_points": _number(game.reference_points),
                    "lineage_url": (
                        f"/api/analytics/lineage?playerId={player_id}&gameId={game.game_id}"
                        f"&snapshotId={snapshot.id}"
                    ),
                }
                for game in visible
            ],
            "next_cursor": next_cursor,
        }
    )
    return result


def lineage(
    session: Session, context: SnapshotContext, player_id: str, game_id: str
) -> dict[str, Any]:
    game = session.scalar(
        select(ServingPlayerGame).where(
            ServingPlayerGame.snapshot_id == context.snapshot.id,
            ServingPlayerGame.player_id == player_id,
            ServingPlayerGame.game_id == game_id,
        )
    )
    if game is None:
        raise HTTPException(status_code=404, detail="player game not found in snapshot")
    row = session.execute(
        select(ArchiveVersion, ArchiveObservation, ArchiveArtifact)
        .join(ArchiveObservation, ArchiveObservation.version_id == ArchiveVersion.id)
        .join(ArchiveArtifact, ArchiveArtifact.id == ArchiveObservation.artifact_id)
        .where(
            ArchiveVersion.id == game.source_version_id,
            ArchiveObservation.id == game.source_observation_id,
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="source lineage is unavailable")
    version, observation, artifact = row
    return {
        "snapshot_id": context.snapshot.id,
        "dataset_id": context.snapshot.dataset_id,
        "player_id": player_id,
        "game_id": game_id,
        "source": context.snapshot.source,
        "source_version_id": version.id,
        "content_sha256": version.content_sha256,
        "parser_version": version.parser_version,
        "observed_at": observation.observed_at.isoformat(),
        "artifact": {
            "resource": artifact.resource,
            "sha256": artifact.sha256,
            "row_number": observation.row_number,
            "source_revision": artifact.source_revision,
        },
        "transform": {
            "metric_version": context.snapshot.metric_version,
            "feature_version": context.snapshot.feature_version,
            "scoring_version": context.snapshot.scoring_version,
        },
        "raw_payload_exposed": False,
    }


def _number(value: object) -> float | int | str | None:
    if value is None or isinstance(value, (float, int, str)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    return str(value)


def _cutoff_utc(replay_date: date) -> str:
    local = datetime.combine(replay_date, time.min, tzinfo=ZoneInfo("America/New_York"))
    return local.astimezone(UTC).isoformat()


def _numbers(values: dict[str, Any]) -> dict[str, Any]:
    return {key: _number(value) for key, value in values.items()}


def _team_labels_by_game(
    session: Session, dataset_id: str, game_ids: list[str]
) -> dict[str, dict[str, str]]:
    if not game_ids:
        return {}
    rows = session.execute(
        select(
            ArchiveTeamGame.game_id,
            ArchiveTeamGame.team_id,
            ArchiveVersion.payload_json,
        )
        .join(ArchiveVersion, ArchiveVersion.id == ArchiveTeamGame.source_version_id)
        .where(
            ArchiveTeamGame.dataset_id == dataset_id,
            ArchiveTeamGame.game_id.in_(game_ids),
        )
    )
    result: dict[str, dict[str, str]] = {}
    for game_id, team_id, payload in rows:
        result.setdefault(game_id, {})[team_id] = str(payload.get("team") or team_id)
    return result


def _nearest_dates(target: date, values: set[str]) -> list[str]:
    dates = sorted(
        (date.fromisoformat(value) for value in values),
        key=lambda value: abs(value - target),
    )
    return [value.isoformat() for value in dates[:2]]


def _encode_cursor(
    snapshot_id: str, player_id: str, replay_date: date, game: ServingPlayerGame
) -> str:
    payload = [
        snapshot_id,
        player_id,
        replay_date.isoformat(),
        game.game_date.isoformat(),
        game.game_id,
    ]
    encoded = base64.urlsafe_b64encode(json.dumps(payload, separators=(",", ":")).encode()).decode()
    return encoded.rstrip("=")


def _decode_cursor(
    cursor: str, snapshot_id: str, player_id: str, replay_date: date
) -> tuple[date, str]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        payload = json.loads(base64.urlsafe_b64decode(padded).decode())
        if payload[:3] != [snapshot_id, player_id, replay_date.isoformat()]:
            raise ValueError
        return date.fromisoformat(payload[3]), str(payload[4])
    except (ValueError, TypeError, json.JSONDecodeError) as error:
        raise HTTPException(status_code=422, detail="cursor does not match this request") from error
