"""Workbench ingestion, normalization, candidate validation, and release publication."""

from __future__ import annotations

import csv
import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
from collections.abc import Callable
from datetime import date
from pathlib import Path
from typing import Any

import httpx
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from courtlens.archive_models import ArchiveDataset
from courtlens.config import get_settings
from courtlens.domain.teams import resolve_team_tricode
from courtlens.ingestion.sportsdataverse import acquire_season_assets
from courtlens.ingestion.workbench_normalization import (
    parse_schedule_file,
    reconcile_season,
)
from courtlens.ingestion.workbench_source_config import ADMITTED_SEASONS
from courtlens.models import new_uuid, utc_now
from courtlens.services.publication import (
    DEFAULT_CHANNEL,
    CandidateValidationError,
    publication_lock,
)
from courtlens.services.workbench_registry import compute_semantic_signature
from courtlens.warehouse_models import PublishedSnapshot, ServingSnapshot, WarehouseBuild
from courtlens.workbench_models import (
    WorkbenchAcquisition,
    WorkbenchArtifact,
    WorkbenchDataset,
    WorkbenchDatasetMember,
    WorkbenchIdentity,
    WorkbenchObservation,
    WorkbenchPlayerGame,
    WorkbenchReleaseBinding,
    WorkbenchSchedule,
    WorkbenchTeamGame,
    WorkbenchVersion,
    allow_admin_mutation,
)

logger = logging.getLogger(__name__)

# 2000-01 through 2026-27. Stats alignment 43 (owner, 2026-10-13): history back to 2000-01 like
# Databallr; a refresh must republish every admitted season, never only the recent ones.
DEFAULT_WORKBENCH_SEASONS = list(range(2001, 2028))
# Parser identity is part of dataset membership, so a normalization fix yields a new dataset
# instead of silently reusing one parsed by the old rules. v2: person_id 0 placeholders quarantined;
# v3: whole-minute values ("26") parse as 26:00.
WORKBENCH_PARSER_VERSION = "workbench-v3"


def _dbt_workbench_env(database_url: str, schema: str = "analytics") -> dict[str, str]:
    url = make_url(database_url)
    return {
        **os.environ,
        "DBT_HOST": str(url.host or "localhost"),
        "DBT_PORT": str(url.port or 5432),
        "DBT_USER": str(url.username or "courtlens"),
        "DBT_PASSWORD": str(url.password or "courtlens"),
        "DBT_DATABASE": str(url.database or "courtlens"),
        "DBT_SCHEMA": schema,
    }


def run_dbt_workbench(dataset_id: str | None = None) -> None:
    """Build workbench models via dbt."""
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
        "tag:workbench",
    ]
    if dataset_id:
        command.extend(["--vars", json.dumps({"workbench_dataset_id": dataset_id})])
    settings = get_settings()
    db_url = os.environ.get("COURTLENS_TEST_POSTGRES_URL") or settings.database_url
    subprocess.run(
        command,
        cwd=warehouse,
        env=_dbt_workbench_env(db_url, settings.dbt_schema),
        check=True,
    )


def acquire_workbench_data(
    ending_years: list[int] | None = None,
    raw_root: Path | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """Download/verify raw SportsDataverse assets for the requested seasons."""
    years = ending_years or DEFAULT_WORKBENCH_SEASONS
    root = raw_root or get_settings().raw_store_path
    root.mkdir(parents=True, exist_ok=True)

    owns_client = client is None
    http_client = client or httpx.Client(follow_redirects=True, timeout=45.0)
    manifests: dict[str, Any] = {}

    try:
        for year in years:
            manifest = acquire_season_assets(year, root, client=http_client)
            manifests[str(year)] = manifest
    finally:
        if owns_client:
            http_client.close()

    return manifests


def _compute_file_sha256(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def history_file(root: Path) -> Path | None:
    """The sealed Basketball-Reference game logs (1983-84 to 1999-00) the last seal wrote."""
    from courtlens.services.bbref_history_seal import GAMELOG_PREFIX, newest_sealed

    return newest_sealed(root, GAMELOG_PREFIX)


def history_totals_sha(root: Path) -> str | None:
    """SHA-256 of the sealed season totals the last seal wrote, when they are loaded."""
    from courtlens.services.bbref_history_seal import SEASONS_PREFIX, newest_sealed

    path = newest_sealed(root, SEASONS_PREFIX)
    if path is None:
        return None
    manifest = path.with_suffix("").with_suffix(".manifest.json")
    return str(json.loads(manifest.read_text())["sha256"]) if manifest.is_file() else None


def workbench_content_sha256(
    years: list[int], root: Path, history: Path | None = None
) -> tuple[str, list[str], list[Path]]:
    """Aggregate raw-file hash that identifies a workbench dataset's content."""
    content_hasher = hashlib.sha256()
    files_to_hash: list[Path] = []
    seasons_meta: list[str] = []

    for year in sorted(years):
        cfg = ADMITTED_SEASONS.get(year)
        if not cfg:
            continue
        seasons_meta.append(cfg.canonical_season)
        season_dir = root / f"sportsdataverse_{year}"
        if cfg.has_schedule_csv:
            f = season_dir / f"nba_schedule_{year}.csv.gz"
            if f.exists():
                files_to_hash.append(f)
        if cfg.has_raw_schedule_json:
            f = season_dir / f"schedule_{year}.json"
            if f.exists():
                files_to_hash.append(f)
        if cfg.has_player_boxscores:
            f = season_dir / f"player_boxscores_{year}.csv"
            if f.exists():
                files_to_hash.append(f)
        if cfg.has_team_boxscores:
            f = season_dir / f"team_boxscores_{year}.csv"
            if f.exists():
                files_to_hash.append(f)

    for f_path in sorted(files_to_hash):
        content_hasher.update(f_path.name.encode())
        content_hasher.update(_compute_file_sha256(f_path).encode())
    if history is not None:
        # Hashed after the season files, so a dataset without history keeps its old hash.
        content_hasher.update(history.name.encode())
        content_hasher.update(_compute_file_sha256(history).encode())
        files_to_hash.append(history)
    return content_hasher.hexdigest(), seasons_meta, files_to_hash


def import_workbench_data(
    session: Session,
    ending_years: list[int] | None = None,
    raw_root: Path | None = None,
    builder: str | None = None,
) -> WorkbenchDataset:
    """Parse, reconcile, and import SportsDataverse seasons into immutable workbench tables.

    `builder` names the job that sealed the dataset in its manifest (the daily season refresh
    marks its datasets so it can retire superseded ones); it is not part of the content hash.
    """
    years = ending_years or DEFAULT_WORKBENCH_SEASONS
    root = raw_root or get_settings().raw_store_path
    # The full default range carries the sealed pre-2000-01 history (full-history FH03/FH04);
    # an explicit list of years (a backfill batch) imports only those seasons.
    history = history_file(root) if ending_years is None else None
    totals_sha = history_totals_sha(root) if history is not None else None
    history_records: dict[str, list[dict[str, Any]]] = {}
    if history is not None:
        from courtlens.services.bbref_history_seal import read_sealed

        history_records = read_sealed(history)

    # 1. Compute aggregate content hash across raw files
    overall_content_sha256, seasons_meta, files_to_hash = workbench_content_sha256(
        years, root, history
    )
    if totals_sha is not None:
        # The pinned season totals (1946-47 on) are part of what the release serves.
        overall_content_sha256 = hashlib.sha256(
            f"{overall_content_sha256}:season-totals:{totals_sha}".encode()
        ).hexdigest()
    history_seasons = sorted({row["season"] for row in history_records.get("schedule", [])})
    seasons_meta = history_seasons + seasons_meta
    membership_sha256 = hashlib.sha256(
        f"{overall_content_sha256}:{','.join(sorted(seasons_meta))}:{WORKBENCH_PARSER_VERSION}".encode()
    ).hexdigest()

    # 2. Check if a WorkbenchDataset with these hashes already exists
    existing_dataset = session.scalar(
        select(WorkbenchDataset).where(
            WorkbenchDataset.content_sha256 == overall_content_sha256,
            WorkbenchDataset.membership_sha256 == membership_sha256,
        )
    )
    if existing_dataset is not None:
        return existing_dataset

    # 3. Process seasons and gather rows
    all_schedules: list[dict[str, Any]] = []
    all_team_games: list[dict[str, Any]] = []
    all_player_games: list[dict[str, Any]] = []
    player_identities: dict[str, str] = {}
    team_identities: dict[str, str] = {}

    coverage_summary: dict[str, Any] = {"seasons": seasons_meta, "total_games": 0}
    exclusions_summary: dict[str, Any] = {"quarantined_player_rows": 0}

    for year in sorted(years):
        cfg = ADMITTED_SEASONS.get(year)
        if not cfg:
            continue
        season_dir = root / f"sportsdataverse_{year}"

        # Schedule
        sched_path = None
        if cfg.has_schedule_csv:
            sched_path = season_dir / f"nba_schedule_{year}.csv.gz"
        elif cfg.has_raw_schedule_json:
            sched_path = season_dir / f"schedule_{year}.json"

        sched_lookup: dict[str, Any] = {}
        if sched_path and sched_path.exists():
            sched_lookup = parse_schedule_file(sched_path)

        for game_id, g in sched_lookup.items():
            home_raw = g.get("home_team_id") or ""
            away_raw = g.get("away_team_id") or ""
            home_tri = resolve_team_tricode(home_raw) or home_raw
            away_tri = resolve_team_tricode(away_raw) or away_raw
            if home_tri:
                team_identities[home_tri] = home_raw or home_tri
            if away_tri:
                team_identities[away_tri] = away_raw or away_tri

            all_schedules.append(
                {
                    "game_id": game_id,
                    "season": cfg.canonical_season,
                    "phase": g.get("phase", "regular_season"),
                    "home_team_id": home_tri,
                    "away_team_id": away_tri,
                    "game_date": g["game_date"],
                    "date_precision": "date",
                    "tipoff_utc": g.get("tipoff_utc"),
                    "game_status": g.get("game_status", 3 if g.get("status") == "final" else 1),
                    "annotations_json": g.get("annotations", {}),
                }
            )

        # Box scores
        if cfg.has_player_boxscores and cfg.has_team_boxscores:
            p_path = season_dir / f"player_boxscores_{year}.csv"
            t_path = season_dir / f"team_boxscores_{year}.csv"

            if p_path.exists() and t_path.exists():
                with (
                    p_path.open("r", encoding="utf-8-sig") as p_stream,
                    t_path.open("r", encoding="utf-8-sig") as t_stream,
                ):
                    p_reader = csv.DictReader(p_stream)
                    t_reader = csv.DictReader(t_stream)
                    reconciled = reconcile_season(p_reader, t_reader, sched_lookup)

                exclusions_summary["quarantined_player_rows"] += reconciled[
                    "quarantined_player_rows_count"
                ]

                # Collect valid teams
                for tg in reconciled["valid_team_rows"]:
                    team_tri = tg["team_tricode"]
                    opp_tri = tg["opponent_tricode"]
                    team_identities[team_tri] = tg["team_id"]
                    team_identities[opp_tri] = tg.get("opponent_id", opp_tri)

                    all_team_games.append(
                        {
                            "game_id": tg["game_id"],
                            "team_id": team_tri,
                            "opponent_id": opp_tri,
                            "game_date": tg["game_date"],
                            "date_precision": "date",
                            "tipoff_utc": tg.get("tipoff_utc"),
                            "season": cfg.canonical_season,
                            "phase": tg.get("phase", "regular_season"),
                            "side": tg["side"],
                            "points": tg["points"],
                            "opponent_points": tg["opponent_points"],
                            "is_final": True,
                            "stats_json": tg["stats_json"],
                        }
                    )

                # Collect valid players
                for pg in reconciled["valid_player_rows"]:
                    p_id = str(pg["person_id"])
                    p_name = f"{pg.get('first_name', '')} {pg.get('family_name', '')}".strip()
                    if p_id and p_name:
                        player_identities[p_id] = p_name

                    all_player_games.append(
                        {
                            "game_id": pg["game_id"],
                            "player_id": p_id,
                            "team_id": pg["team_tricode"],
                            "opponent_id": pg["opponent_tricode"],
                            "game_date": pg["game_date"],
                            "date_precision": "date",
                            "tipoff_utc": pg.get("tipoff_utc"),
                            "season": cfg.canonical_season,
                            "phase": pg.get("phase", "regular_season"),
                            "appearance": pg["appearance"],
                            "minutes_original": pg["minutes_original"],
                            "minutes_seconds": pg["minutes_seconds"],
                            "points": pg["points"],
                            "stats_json": pg["stats_json"],
                        }
                    )

    history_names: dict[str, str] = {}
    if history_records:
        for row in history_records.get("schedule", []):
            all_schedules.append({**row, "date_precision": "date", "tipoff_utc": None})
        for row in history_records.get("team_game", []):
            all_team_games.append(
                {**row, "date_precision": "date", "tipoff_utc": None, "is_final": True}
            )
            team_identities.setdefault(row["team_id"], row["team_id"])
        for row in history_records.get("player_game", []):
            all_player_games.append({**row, "date_precision": "date", "tipoff_utc": None})
        for row in history_records.get("identity", []):
            history_names[row["external_id"]] = row["display_name"]
            player_identities.setdefault(row["external_id"], row["display_name"])
        coverage_summary["history"] = {
            "source": "basketball_reference",
            "file": history.name if history else None,
            "seasons": history_seasons,
            "team_stats_basis": "player_sum",
            "game_id_basis": "courtlens_sequence",
            "season_totals_sha256": totals_sha,
        }

    coverage_summary["total_team_games"] = len(all_team_games)
    coverage_summary["total_player_games"] = len(all_player_games)
    coverage_summary["total_schedules"] = len(all_schedules)

    semantic_signature = compute_semantic_signature(
        content_sha256=overall_content_sha256,
        membership_sha256=membership_sha256,
        metric_version="v1",
        feature_version="prior-day-v1",
        scoring_version="points-v1",
        coverage=coverage_summary,
        exclusions=exclusions_summary,
    )

    with allow_admin_mutation(session):
        dataset_id = new_uuid()
        dataset = WorkbenchDataset(
            id=dataset_id,
            content_sha256=overall_content_sha256,
            membership_sha256=membership_sha256,
            semantic_signature=semantic_signature,
            source_namespace="sportsdataverse",
            parser_version=WORKBENCH_PARSER_VERSION,
            quality_version="reconciliation-v1",
            seasons_json=seasons_meta,
            phases_json=["regular_season", "preseason", "playoffs", "play_in", "cup_final"],
            manifest_json={
                "admitted_years": years,
                "file_count": len(files_to_hash),
                **({"builder": builder} if builder else {}),
            },
            coverage_json=coverage_summary,
            exclusions_json=exclusions_summary,
            status="candidate",
            created_at=utc_now(),
        )
        session.add(dataset)
        session.flush()

        # Insert / update identities
        known_players = set(
            session.scalars(
                select(WorkbenchIdentity.external_id).where(WorkbenchIdentity.kind == "player")
            )
        )
        for pid, name in player_identities.items():
            if pid in known_players:
                continue
            # Unmatched pre-2000-01 players keep their Basketball-Reference ID (never guessed).
            namespace = "basketball_reference" if pid.startswith("bbref:") else "nba"
            session.add(
                WorkbenchIdentity(
                    namespace=namespace,
                    external_id=pid,
                    kind="player",
                    display_name=name,
                    metadata_json={
                        "aliases": [name],
                        **({"name_source": "basketball_reference"} if pid in history_names else {}),
                    },
                )
            )

        for tid, orig_id in team_identities.items():
            existing_ident = session.scalar(
                select(WorkbenchIdentity).where(
                    WorkbenchIdentity.namespace == "nba",
                    WorkbenchIdentity.external_id == tid,
                    WorkbenchIdentity.kind == "team",
                )
            )
            if existing_ident is None:
                session.add(
                    WorkbenchIdentity(
                        namespace="nba",
                        external_id=tid,
                        kind="team",
                        display_name=tid,
                        metadata_json={"aliases": [orig_id, tid]},
                    )
                )
        session.flush()

        # Create acquisition & version records
        total_bytes = sum(f.stat().st_size for f in files_to_hash)
        acq_id = new_uuid()
        acq = WorkbenchAcquisition(
            id=acq_id,
            source_name="sportsdataverse",
            resource=f"sportsdataverse-{years[0]}-{years[-1]}",
            status="completed",
            source_url="https://github.com/sportsdataverse/sportsdataverse-data/releases/download/nba_stats/",
            bytes=total_bytes,
            content_sha256=overall_content_sha256,
            started_at=utc_now(),
            finished_at=utc_now(),
        )
        session.add(acq)
        session.flush()

        # Raw content is content-addressed: a re-parse of identical files (new parser version)
        # reuses the retained artifact instead of duplicating it.
        resource = f"sportsdataverse-{years[0]}-{years[-1]}"
        art_id = session.scalar(
            select(WorkbenchArtifact.id).where(
                WorkbenchArtifact.sha256 == overall_content_sha256,
                WorkbenchArtifact.resource == resource,
            )
        )
        if art_id is None:
            art_id = new_uuid()
            session.add(
                WorkbenchArtifact(
                    id=art_id,
                    sha256=overall_content_sha256,
                    resource=resource,
                    storage_path=str(root),
                    mime_type="application/csv+gzip",
                    bytes=total_bytes,
                    source_attribution="SportsDataverse NBA Stats release",
                    acquired_at=utc_now(),
                )
            )
            session.flush()

        # Generic shared version & observation for dataset rows
        ident_sample = session.scalar(select(WorkbenchIdentity.id).limit(1))
        assert ident_sample is not None

        ver_id = new_uuid()
        ver = WorkbenchVersion(
            id=ver_id,
            identity_id=ident_sample,
            content_sha256=overall_content_sha256,
            parser_version=WORKBENCH_PARSER_VERSION,
            payload_json={"years": years},
        )
        session.add(ver)
        session.flush()

        obs_id = new_uuid()
        obs = WorkbenchObservation(
            id=obs_id,
            acquisition_id=acq_id,
            artifact_id=art_id,
            row_identifier="dataset-manifest",
            identity_id=ident_sample,
            version_id=ver_id,
            observed_at=utc_now(),
            observation_order=1,
        )
        session.add(obs)
        session.flush()

        # Add DatasetMember
        session.add(
            WorkbenchDatasetMember(
                dataset_id=dataset.id,
                identity_id=ident_sample,
                version_id=ver_id,
                observation_id=obs_id,
            )
        )

        # Batch insert schedules, team games, player games
        # 1. Schedules
        for s in all_schedules:
            s["id"] = new_uuid()
            s["dataset_id"] = dataset.id
            s["source_version_id"] = ver_id
            s["source_observation_id"] = obs_id
        if all_schedules:
            session.execute(
                pg_insert(WorkbenchSchedule).on_conflict_do_nothing(
                    index_elements=["dataset_id", "game_id"]
                ),
                all_schedules,
            )

        # 2. Team games
        for tg in all_team_games:
            tg["id"] = new_uuid()
            tg["dataset_id"] = dataset.id
            tg["source_version_id"] = ver_id
            tg["source_observation_id"] = obs_id
        if all_team_games:
            session.execute(
                pg_insert(WorkbenchTeamGame).on_conflict_do_nothing(
                    index_elements=["dataset_id", "game_id", "team_id"]
                ),
                all_team_games,
            )

        # 3. Player games
        for pg in all_player_games:
            pg["id"] = new_uuid()
            pg["dataset_id"] = dataset.id
            pg["source_version_id"] = ver_id
            pg["source_observation_id"] = obs_id
        if all_player_games:
            # Batch in chunks of 5000 for efficiency
            for i in range(0, len(all_player_games), 5000):
                chunk = all_player_games[i : i + 5000]
                session.execute(
                    pg_insert(WorkbenchPlayerGame).on_conflict_do_nothing(
                        index_elements=["dataset_id", "game_id", "player_id"]
                    ),
                    chunk,
                )

        session.commit()

    return dataset


def validate_workbench_candidate(
    session: Session,
    dataset_id: str,
) -> dict[str, Any]:
    """Validate player fact counts, team pairs, grains, and shot arithmetic."""
    expected_players = session.scalar(
        select(func.count())
        .select_from(WorkbenchPlayerGame)
        .where(WorkbenchPlayerGame.dataset_id == dataset_id)
    )
    expected_teams = session.scalar(
        select(func.count())
        .select_from(WorkbenchTeamGame)
        .where(WorkbenchTeamGame.dataset_id == dataset_id)
    )

    bad_team_pairs = session.execute(
        text(
            "select count(*) from ("
            "select game_id from workbench_team_games where dataset_id = :dataset_id "
            "group by game_id having count(*) <> 2 or count(distinct team_id) <> 2"
            ") invalid"
        ),
        {"dataset_id": dataset_id},
    ).scalar_one()

    bad_shots = session.execute(
        text(
            "select count(*) from workbench_player_games where dataset_id = :dataset_id and ("
            "(stats_json ->> 'field_goals_made')::integer > "
            "(stats_json ->> 'field_goals_attempted')::integer or "
            "(stats_json ->> 'three_pointers_made')::integer > "
            "(stats_json ->> 'three_pointers_attempted')::integer or "
            "(stats_json ->> 'free_throws_made')::integer > "
            "(stats_json ->> 'free_throws_attempted')::integer"
            ")"
        ),
        {"dataset_id": dataset_id},
    ).scalar_one()

    failures: list[str] = []
    if expected_players == 0:
        failures.append("candidate contains 0 player games")
    if expected_teams == 0:
        failures.append("candidate contains 0 team games")
    if bad_team_pairs > 0:
        failures.append(f"candidate has {bad_team_pairs} games without 2 opposing sides")
    if bad_shots > 0:
        failures.append(f"candidate has {bad_shots} rows where made shots exceed attempts")

    report = {
        "status": "failed" if failures else "passed",
        "dataset_id": dataset_id,
        "player_games_count": expected_players,
        "team_games_count": expected_teams,
        "bad_team_pairs": bad_team_pairs,
        "bad_shots": bad_shots,
        "failures": failures,
    }
    if failures:
        raise CandidateValidationError("; ".join(failures))
    return report


def publish_workbench_release(
    session: Session,
    dataset_id: str,
    *,
    channel: str = DEFAULT_CHANNEL,
    acquire_lock: bool = True,
    runner: Callable[[str], None] | None = None,
) -> WorkbenchReleaseBinding:
    """Build, validate, and atomically publish a workbench release."""
    dataset = session.get(WorkbenchDataset, dataset_id)
    if dataset is None:
        raise ValueError("workbench dataset does not exist")

    def _publish_unlocked() -> WorkbenchReleaseBinding:
        # Check existing release binding
        existing_binding = session.scalar(
            select(WorkbenchReleaseBinding).where(
                WorkbenchReleaseBinding.dataset_id == dataset_id,
                WorkbenchReleaseBinding.semantic_signature == dataset.semantic_signature,
            )
        )
        if existing_binding is not None:
            # Check if public pointer points to it
            pointer = session.get(PublishedSnapshot, channel)
            if pointer is None:
                session.add(
                    PublishedSnapshot(
                        channel=channel,
                        snapshot_id=existing_binding.snapshot_id,
                        published_at=utc_now(),
                    )
                )
            else:
                pointer.snapshot_id = existing_binding.snapshot_id
                pointer.published_at = utc_now()
            session.commit()
            return existing_binding

        # Run dbt build
        if runner:
            runner(dataset_id)
        else:
            run_dbt_workbench(dataset_id)

        # Validate candidate
        report = validate_workbench_candidate(session, dataset_id)

        with allow_admin_mutation(session):
            snapshot_id = new_uuid()

            # Ensure an ArchiveDataset and WarehouseBuild exist for foreign key integrity
            archive_dataset = session.scalar(
                select(ArchiveDataset).where(ArchiveDataset.status == "accepted").limit(1)
            )
            if archive_dataset is None:
                archive_dataset = ArchiveDataset(
                    content_sha256=dataset.content_sha256,
                    observation_sha256=dataset.membership_sha256,
                    source_namespace="sportsdataverse",
                    parser_version="workbench-v1",
                    manifest_json={},
                    status="accepted",
                )
                session.add(archive_dataset)
                session.flush()

            build = WarehouseBuild(
                id=new_uuid(),
                dataset_id=archive_dataset.id,
                status="ready",
                candidate_schema=f"cl_wb_{dataset.id.replace('-', '')[:16]}",
                code_version="workbench",
                metric_version="v1",
                feature_version="prior-day-v1",
                scoring_version="points-v1",
            )
            session.add(build)
            session.flush()

            cov = session.execute(
                select(
                    func.min(WorkbenchTeamGame.game_date),
                    func.max(WorkbenchTeamGame.game_date),
                ).where(WorkbenchTeamGame.dataset_id == dataset.id)
            ).one()
            cov_start = cov[0] or date(2023, 10, 24)
            cov_end = cov[1] or date(2026, 6, 20)

            serving_snap = ServingSnapshot(
                id=snapshot_id,
                build_id=build.id,
                dataset_id=archive_dataset.id,
                status="ready",
                mode="workbench_recent",
                source="sportsdataverse",
                coverage_start=cov_start,
                coverage_end=cov_end,
                default_replay_date=cov_start,
                supported_replay_dates_json=[cov_start.isoformat(), cov_end.isoformat()],
                code_version="workbench",
                metric_version="v1",
                feature_version="prior-day-v1",
                scoring_version="points-v1",
                quality_report_json=report,
            )
            session.add(serving_snap)
            session.flush()

            binding = WorkbenchReleaseBinding(
                id=new_uuid(),
                snapshot_id=snapshot_id,
                semantic_signature=dataset.semantic_signature,
                dataset_id=dataset.id,
                capability_bindings_json={
                    "player_facts": True,
                    "team_facts": True,
                    "schedules": True,
                    "forecasting": "no_policy_registered",
                    "validation_report": report,
                },
                created_at=utc_now(),
            )
            session.add(binding)

            dataset.status = "ready"

            pointer = session.get(PublishedSnapshot, channel)
            now = utc_now()
            if pointer is None:
                session.add(
                    PublishedSnapshot(channel=channel, snapshot_id=snapshot_id, published_at=now)
                )
            else:
                pointer.snapshot_id = snapshot_id
                pointer.published_at = now

            session.commit()
            return binding

    if acquire_lock:
        with publication_lock(session):
            return _publish_unlocked()
    return _publish_unlocked()
