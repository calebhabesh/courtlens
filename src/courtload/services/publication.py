"""Locked candidate validation and atomic serving-snapshot publication."""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from sqlalchemy import Select, func, select, text
from sqlalchemy.engine import Connection, Engine, make_url
from sqlalchemy.orm import Session

from courtload.archive_models import ArchiveDataset, ArchivePlayerGame, ArchiveTeamGame
from courtload.config import get_settings
from courtload.models import new_uuid
from courtload.warehouse_models import PublishedSnapshot, ServingSnapshot, WarehouseBuild

PUBLICATION_LOCK_KEY = 0x434F5552544C4F41  # ASCII "COURTLOA", stable across processes.
REFERENCE_POINTS_FORMULA = "PTS+1.2*REB+1.5*AST+3*STL+3*BLK-TOV"
SCORING_VERSION = hashlib.sha256(REFERENCE_POINTS_FORMULA.encode()).hexdigest()
METRIC_VERSION = "basketball-v1"
FEATURE_VERSION = "historical-prior-day-v1"
DEFAULT_CHANNEL = "public"
_IDENTIFIER = re.compile(r"^[a-z_][a-z0-9_]*$")


class BuildInProgressError(RuntimeError):
    """Raised when another process owns the warehouse publication lock."""


class CandidateValidationError(RuntimeError):
    """Raised when private candidate relations do not satisfy serving invariants."""


@contextmanager
def publication_lock(bind_or_session: Session | Engine | Connection) -> Iterator[Connection]:
    """Hold one PostgreSQL session advisory lock across build and publication."""
    if isinstance(bind_or_session, Session):
        bind = bind_or_session.get_bind()
    elif isinstance(bind_or_session, Connection):
        bind = bind_or_session.engine
    else:
        bind = bind_or_session
    if not isinstance(bind, Engine) or bind.dialect.name != "postgresql":
        raise RuntimeError("warehouse publication requires PostgreSQL session advisory locks")
    # This connection must never return to the pool while the lock is held. The work
    # session is intentionally separate so its commits cannot release/reassign the lock owner.
    with bind.connect() as lock_connection:
        acquired = lock_connection.scalar(select(func.pg_try_advisory_lock(PUBLICATION_LOCK_KEY)))
        lock_connection.commit()
        if not acquired:
            raise BuildInProgressError("another warehouse build already holds the publication lock")
        try:
            yield lock_connection
        finally:
            lock_connection.rollback()
            lock_connection.scalar(select(func.pg_advisory_unlock(PUBLICATION_LOCK_KEY)))
            lock_connection.commit()


def _candidate_schema(build_id: str) -> str:
    return f"cl_candidate_{build_id.replace('-', '')[:16]}"


def _relation(schema: str, layer: str, name: str) -> str:
    identifier = f"{schema}_{layer}"
    if not _IDENTIFIER.fullmatch(identifier) or not _IDENTIFIER.fullmatch(name):
        raise ValueError("unsafe candidate relation identifier")
    return f'"{identifier}"."{name}"'


def _dbt_environment(database_url: str, candidate_schema: str) -> dict[str, str]:
    url = make_url(database_url)
    if url.get_backend_name() != "postgresql":
        raise RuntimeError("archive warehouse builds require PostgreSQL")
    return {
        **os.environ,
        "DBT_HOST": str(url.host or "localhost"),
        "DBT_PORT": str(url.port or 5432),
        "DBT_USER": str(url.username or ""),
        "DBT_PASSWORD": str(url.password or ""),
        "DBT_DATABASE": str(url.database or ""),
        "DBT_SCHEMA": candidate_schema,
    }


def run_dbt_candidate(build: WarehouseBuild) -> None:
    """Build only archive-tagged relations in a private build-specific schema."""
    executable = shutil.which("dbt")
    if executable is None:
        candidate = Path(sys.executable).parent / "dbt"
        if candidate.is_file() and os.access(candidate, os.X_OK):
            executable = str(candidate)
        else:
            raise RuntimeError("dbt executable is unavailable; install the warehouse extra")
    warehouse = Path(__file__).resolve().parents[3] / "warehouse"
    command = [
        executable,
        "build",
        "--profiles-dir",
        ".",
        "--select",
        "tag:archive",
        "--vars",
        json.dumps(
            {
                "archive_dataset_id": build.dataset_id,
                "warehouse_build_id": build.id,
                "metric_version": build.metric_version,
                "feature_version": build.feature_version,
            }
        ),
    ]
    subprocess.run(
        command,
        cwd=warehouse,
        env=_dbt_environment(get_settings().database_url, build.candidate_schema),
        check=True,
    )


def _scalar(session: Session, sql: str, **parameters: object) -> Any:
    return session.execute(text(sql), parameters).scalar_one()


def validate_candidate(session: Session, build: WarehouseBuild) -> dict[str, Any]:
    """Validate counts, dataset binding, grain, and prior-day semantics."""
    player_fact = _relation(build.candidate_schema, "intermediate", "fct_archive_player_game")
    team_fact = _relation(build.candidate_schema, "intermediate", "fct_archive_team_game")
    profiles = _relation(build.candidate_schema, "marts", "mart_archive_player_profile")
    contexts = _relation(build.candidate_schema, "marts", "mart_archive_opponent_context")
    expected_players = session.scalar(
        select(func.count())
        .select_from(ArchivePlayerGame)
        .where(ArchivePlayerGame.dataset_id == build.dataset_id)
    )
    expected_teams = session.scalar(
        select(func.count())
        .select_from(ArchiveTeamGame)
        .where(ArchiveTeamGame.dataset_id == build.dataset_id)
    )
    checks = {
        "player_fact_rows": int(_scalar(session, f"select count(*) from {player_fact}")),
        "team_fact_rows": int(_scalar(session, f"select count(*) from {team_fact}")),
        "profile_rows": int(_scalar(session, f"select count(*) from {profiles}")),
        "opponent_context_rows": int(_scalar(session, f"select count(*) from {contexts}")),
        "wrong_dataset_rows": int(
            _scalar(
                session,
                "select sum(rows) from ("
                f"select count(*) as rows from {player_fact} where dataset_id <> :dataset_id "
                "union all "
                f"select count(*) from {team_fact} where dataset_id <> :dataset_id "
                "union all "
                f"select count(*) from {profiles} where dataset_id <> :dataset_id "
                "union all "
                f"select count(*) from {contexts} where dataset_id <> :dataset_id"
                ") invalid",
                dataset_id=build.dataset_id,
            )
        ),
        "bad_team_pairs": int(
            _scalar(
                session,
                "select count(*) from ("
                f"select game_id from {team_fact} group by game_id "
                "having count(*) <> 2 or count(distinct team_id) <> 2"
                ") invalid",
            )
        ),
        "profile_leakage_rows": int(
            _scalar(
                session,
                f"select count(*) from {profiles} where max_history_date >= replay_date",
            )
        ),
        "context_leakage_rows": int(
            _scalar(
                session,
                f"select count(*) from {contexts} where max_history_date >= replay_date",
            )
        ),
        "incomplete_context_value_rows": int(
            _scalar(
                session,
                f"select count(*) from {contexts} where eligible_games < 5 and ("
                "context_json ->> 'points_allowed_per_game' is not null or "
                "context_json ->> 'rebounds_allowed_per_game' is not null or "
                "context_json ->> 'assists_allowed_per_game' is not null)",
            )
        ),
        "duplicate_profile_rows": int(
            _scalar(
                session,
                "select count(*) from ("
                f"select player_id, replay_date from {profiles} "
                "group by player_id, replay_date having count(*) <> 1"
                ") invalid",
            )
        ),
        "duplicate_context_rows": int(
            _scalar(
                session,
                "select count(*) from ("
                f"select team_id, replay_date from {contexts} "
                "group by team_id, replay_date having count(*) <> 1"
                ") invalid",
            )
        ),
    }
    failures: list[str] = []
    if checks["player_fact_rows"] != expected_players:
        failures.append("player fact count differs from the immutable dataset")
    if checks["team_fact_rows"] != expected_teams:
        failures.append("team fact count differs from the immutable dataset")
    if checks["profile_rows"] == 0:
        failures.append("candidate contains no player profiles")
    for key in (
        "wrong_dataset_rows",
        "bad_team_pairs",
        "profile_leakage_rows",
        "context_leakage_rows",
        "incomplete_context_value_rows",
        "duplicate_profile_rows",
        "duplicate_context_rows",
    ):
        if checks[key]:
            failures.append(f"{key}={checks[key]}")
    report = {
        "status": "failed" if failures else "passed",
        "dataset_id": build.dataset_id,
        "checks": checks,
        "failures": failures,
    }
    if failures:
        raise CandidateValidationError("; ".join(failures))
    return report


def _snapshot_metadata(session: Session, build: WarehouseBuild) -> dict[str, Any]:
    team_fact = _relation(build.candidate_schema, "intermediate", "fct_archive_team_game")
    profiles = _relation(build.candidate_schema, "marts", "mart_archive_player_profile")
    coverage = session.execute(
        text(f"select min(game_date), max(game_date) from {team_fact}")
    ).one()
    replay_dates = list(
        session.execute(
            text(f"select distinct replay_date from {profiles} order by replay_date")
        ).scalars()
    )
    if coverage[0] is None or coverage[1] is None or not replay_dates:
        raise CandidateValidationError("candidate metadata has no coverage or replay dates")
    return {
        "coverage_start": coverage[0],
        "coverage_end": coverage[1],
        "replay_dates": replay_dates,
        "default_replay_date": replay_dates[len(replay_dates) // 2],
    }


def _install_candidate(session: Session, build: WarehouseBuild, snapshot: ServingSnapshot) -> None:
    player_fact = _relation(build.candidate_schema, "intermediate", "fct_archive_player_game")
    profiles = _relation(build.candidate_schema, "marts", "mart_archive_player_profile")
    contexts = _relation(build.candidate_schema, "marts", "mart_archive_opponent_context")
    parameters = {"snapshot_id": snapshot.id}
    session.execute(
        text(
            "insert into serving_player_games ("
            "id, snapshot_id, dataset_id, game_id, player_id, player_name, team_id, opponent_id, "
            "game_date, season, appearance, minutes_seconds, stats_json, reference_points, "
            "source_version_id, source_observation_id) "
            f"select gen_random_uuid()::text, :snapshot_id, dataset_id, game_id, player_id, "
            "player_name, team_id, opponent_id, game_date, season, appearance, minutes_seconds, "
            "stats_json, reference_points, source_version_id, source_observation_id "
            f"from {player_fact}"
        ),
        parameters,
    )
    session.execute(
        text(
            "insert into serving_player_profiles ("
            "id, snapshot_id, dataset_id, player_id, player_name, season, replay_date, cutoff_utc, "
            "inferred_team_id, last_observed_date, target_game_id, target_game_date, "
            "target_opponent_id, lead_days, last_5_json, last_10_json, season_json, "
            "max_history_date) "
            f"select gen_random_uuid()::text, :snapshot_id, dataset_id, player_id, player_name, "
            "season, replay_date, cutoff_utc, inferred_team_id, last_observed_date, "
            "target_game_id, "
            "target_game_date, target_opponent_id, lead_days, last_5_json, last_10_json, "
            f"season_json, max_history_date from {profiles}"
        ),
        parameters,
    )
    session.execute(
        text(
            "insert into serving_opponent_contexts ("
            "id, snapshot_id, dataset_id, team_id, season, replay_date, eligible_games, "
            "context_json, max_history_date) "
            f"select gen_random_uuid()::text, :snapshot_id, dataset_id, team_id, season, "
            f"replay_date, eligible_games, context_json, max_history_date from {contexts}"
        ),
        parameters,
    )


def _point_channel(
    session: Session, channel: str, snapshot: ServingSnapshot, published_at: datetime
) -> None:
    pointer = session.get(PublishedSnapshot, channel)
    if pointer is None:
        session.add(
            PublishedSnapshot(channel=channel, snapshot_id=snapshot.id, published_at=published_at)
        )
    else:
        pointer.snapshot_id = snapshot.id
        pointer.published_at = published_at


def build_and_publish_unlocked(
    session: Session,
    dataset_id: str,
    *,
    channel: str = DEFAULT_CHANNEL,
    code_version: str = "working-tree",
    runner: Callable[[WarehouseBuild], None] = run_dbt_candidate,
) -> ServingSnapshot:
    """Build privately and publish one snapshot assuming the publication lock is already held."""
    if len(channel) > 30 or not _IDENTIFIER.fullmatch(channel):
        raise ValueError("publication channel must be a safe lowercase identifier")
    dataset = session.get(ArchiveDataset, dataset_id)
    if dataset is None or dataset.status != "accepted":
        raise ValueError("dataset must exist and be accepted")
    existing = session.scalar(
        select(ServingSnapshot)
        .join(WarehouseBuild, ServingSnapshot.build_id == WarehouseBuild.id)
        .where(
            ServingSnapshot.dataset_id == dataset_id,
            ServingSnapshot.status == "ready",
            WarehouseBuild.code_version == code_version,
            WarehouseBuild.metric_version == METRIC_VERSION,
            WarehouseBuild.feature_version == FEATURE_VERSION,
            WarehouseBuild.scoring_version == SCORING_VERSION,
        )
        .order_by(ServingSnapshot.created_at.desc())
        .limit(1)
    )
    if existing is not None:
        _point_channel(session, channel, existing, datetime.now(UTC))
        session.commit()
        return existing
    build_id = new_uuid()
    build = WarehouseBuild(
        id=build_id,
        dataset_id=dataset_id,
        status="created",
        candidate_schema=_candidate_schema(build_id),
        code_version=code_version,
        metric_version=METRIC_VERSION,
        feature_version=FEATURE_VERSION,
        scoring_version=SCORING_VERSION,
    )
    session.add(build)
    session.commit()
    try:
        runner(build)
        build.status = "built"
        session.commit()
        report = validate_candidate(session, build)
        metadata = _snapshot_metadata(session, build)
        build.status = "validated"
        build.validation_report_json = report
        snapshot = ServingSnapshot(
            build_id=build.id,
            dataset_id=dataset.id,
            status="ready",
            mode="historical_reconstruction",
            source=dataset.source_namespace,
            coverage_start=metadata["coverage_start"],
            coverage_end=metadata["coverage_end"],
            default_replay_date=metadata["default_replay_date"],
            supported_replay_dates_json=[value.isoformat() for value in metadata["replay_dates"]],
            code_version=build.code_version,
            metric_version=build.metric_version,
            feature_version=build.feature_version,
            scoring_version=build.scoring_version,
            quality_report_json=report,
        )
        session.add(snapshot)
        session.flush()
        _install_candidate(session, build, snapshot)
        now = datetime.now(UTC)
        _point_channel(session, channel, snapshot, now)
        build.status = "ready"
        build.finished_at = now
        session.commit()
        return snapshot
    except Exception as error:
        session.rollback()
        stored = session.get(WarehouseBuild, build.id)
        assert stored is not None
        stored.status = "failed"
        stored.finished_at = datetime.now(UTC)
        stored.error = f"{type(error).__name__}: {str(error)[:500]}"
        session.commit()
        raise


def build_and_publish(
    session: Session,
    dataset_id: str,
    *,
    channel: str = DEFAULT_CHANNEL,
    code_version: str = "working-tree",
    runner: Callable[[WarehouseBuild], None] = run_dbt_candidate,
    acquire_lock: bool = True,
) -> ServingSnapshot:
    """Build privately and atomically publish one validated immutable snapshot."""
    if len(channel) > 30 or not _IDENTIFIER.fullmatch(channel):
        raise ValueError("publication channel must be a safe lowercase identifier")
    if acquire_lock:
        with publication_lock(session):
            return build_and_publish_unlocked(
                session,
                dataset_id,
                channel=channel,
                code_version=code_version,
                runner=runner,
            )
    return build_and_publish_unlocked(
        session,
        dataset_id,
        channel=channel,
        code_version=code_version,
        runner=runner,
    )


def rollback_publication(
    session: Session,
    snapshot_id: str,
    *,
    channel: str = DEFAULT_CHANNEL,
    acquire_lock: bool = True,
) -> ServingSnapshot:
    """Move a channel pointer to a retained ready snapshot without editing history."""

    def _do_rollback() -> ServingSnapshot:
        snapshot = session.get(ServingSnapshot, snapshot_id)
        if snapshot is None or snapshot.status != "ready":
            raise ValueError("rollback target must be a retained ready snapshot")
        now = datetime.now(UTC)
        _point_channel(session, channel, snapshot, now)
        session.commit()
        return snapshot

    if acquire_lock:
        with publication_lock(session):
            return _do_rollback()
    return _do_rollback()


def published_snapshot_query(channel: str = DEFAULT_CHANNEL) -> Select[tuple[ServingSnapshot]]:
    """Return the query used to resolve and pin a snapshot once per request."""
    return (
        select(ServingSnapshot)
        .join(PublishedSnapshot, PublishedSnapshot.snapshot_id == ServingSnapshot.id)
        .where(PublishedSnapshot.channel == channel, ServingSnapshot.status == "ready")
    )
