from __future__ import annotations

import json
import tempfile
from datetime import date, timedelta
from pathlib import Path
from typing import Any

import typer
from sqlalchemy import Connection, Engine, func, select

from courtlens.archive_models import ArchiveDataset
from courtlens.config import get_settings
from courtlens.database import Base, SessionLocal, engine
from courtlens.demo import (
    DEMO_EMAIL,
    DEMO_PASSWORD,
    DEMO_WEEK_START,
    fixture_documents,
)
from courtlens.domain.scoring import DEFAULT_POINTS_RULES, scoring_rules_hash
from courtlens.evaluation.challenger import run_final_evaluation
from courtlens.evaluation.config import load_config
from courtlens.evaluation.runner import run_baseline_evaluation
from courtlens.ingestion.archive import acquire_archive
from courtlens.ingestion.archive_import import import_archive
from courtlens.ingestion.client import BalldontlieClient
from courtlens.ingestion.loader import IngestionService
from courtlens.ingestion.raw_store import RawStore
from courtlens.models import (
    FantasyLeague,
    FantasyRosterEntry,
    FantasyWatchlistEntry,
    FantasyWeekState,
    User,
)
from courtlens.security import hash_password
from courtlens.services.backup_restore import (
    create_backup_archive,
    create_backup_manifest,
    restore_backup_archive,
    verify_restored_state,
)
from courtlens.services.publication import build_and_publish, rollback_publication
from courtlens.services.quality import run_operational_checks

app = typer.Typer(
    no_args_is_help=True,
    help="Ingest source data, seed labeled fixtures, and verify CourtLens's warehouse.",
)


@app.command("acquire-player-context")
def acquire_player_context_command(
    source: str = typer.Option("nba_player_index", help="Admitted PC05 source name."),
    url: str = typer.Option("https://cdn.nba.com/static/json/staticData/playerIndex.json"),
    season: str = typer.Option("2026-27"),
    root: Path = typer.Option(Path("data/raw/player-context")),
) -> None:
    """Scheduled bounded fetch; retain receipts even when acquisition fails."""
    import httpx

    from courtlens.services.player_context_ingestion import ContextFetcher

    with SessionLocal() as session, httpx.Client() as client:
        receipt = ContextFetcher(session, root, client).fetch(source, url, season)
        session.commit()
        typer.echo(
            json.dumps(
                {
                    "acquisition_id": receipt.id,
                    "status": receipt.status,
                    "http_status": receipt.http_status,
                    "reason": receipt.error_summary,
                }
            )
        )
        if receipt.status != "success":
            raise typer.Exit(1)


@app.command("import-player-context")
def import_player_context_command(
    acquisition_id: str | None = typer.Option(None),
    local_file: Path | None = typer.Option(None),
    source: str = typer.Option("nba_player_index"),
    url: str = typer.Option("https://cdn.nba.com/static/json/staticData/playerIndex.json"),
    season: str = typer.Option("2026-27"),
    root: Path = typer.Option(Path("data/raw/player-context")),
) -> None:
    """Admit an acquisition or dated local import; never publish historical statistics."""
    from courtlens.services.player_context import dataset_info
    from courtlens.services.player_context_ingestion import admit_context, capture_local

    if (acquisition_id is None) == (local_file is None):
        raise typer.BadParameter("choose exactly one of --acquisition-id or --local-file")
    with SessionLocal() as session:
        if local_file is not None:
            receipt = capture_local(session, root, local_file, source, url, season)
            session.commit()
            acquisition_id = receipt.id
        assert acquisition_id is not None
        try:
            dataset = admit_context(session, acquisition_id, root)
            session.commit()
        except (ValueError, KeyError, StopIteration) as error:
            session.rollback()
            raise typer.BadParameter(f"candidate rejected: {error}") from error
        typer.echo(dataset_info(session, dataset).model_dump_json(indent=2))


@app.command("acquire-archive")
def acquire_archive_command(
    destination: Path = typer.Option(
        Path("data/raw/nocturnebear-a5f108b5"),
        help="Directory to save the four pinned archive CSV files.",
    ),
    local_source: Path | None = typer.Option(
        None,
        help="Optional local directory containing pre-downloaded archive files.",
    ),
) -> None:
    """Download or copy the four pinned archive files and verify hashes."""
    manifest_path = acquire_archive(destination, local_source=local_source)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    typer.echo(
        json.dumps(
            {
                "manifest_path": str(manifest_path),
                "source": manifest.get("source"),
                "revision": manifest.get("revision"),
                "file_count": len(manifest.get("files", [])),
                "status": "verified",
            },
            indent=2,
        )
    )


@app.command("import-archive")
def import_archive_command(
    root: Path = typer.Option(
        Path("data/raw/nocturnebear-a5f108b5"), help="Directory with the four pinned CSV files."
    ),
) -> None:
    """Import verified historical files into an additive, unpublished dataset."""
    with SessionLocal() as session:
        run = import_archive(session, root)
        typer.echo(
            json.dumps(
                {"import_id": run.id, "dataset_id": run.dataset_id, "report": run.report_json},
                indent=2,
            )
        )


@app.command("publish-archive")
def publish_archive_command(
    dataset_id: str | None = typer.Option(
        None, help="Accepted archive dataset ID; defaults to the newest accepted dataset."
    ),
    channel: str = typer.Option("public", help="Allowlisted publication channel."),
    code_version: str = typer.Option("working-tree", help="Git revision or reproducible code ID."),
) -> None:
    """Build, validate, install, and atomically publish an archive snapshot."""
    if not channel.replace("_", "").isalnum() or len(channel) > 30:
        raise typer.BadParameter("channel must be alphanumeric/underscore and at most 30 chars")
    with SessionLocal() as session:
        selected_id = dataset_id or session.scalar(
            select(ArchiveDataset.id)
            .where(ArchiveDataset.status == "accepted")
            .order_by(ArchiveDataset.created_at.desc())
            .limit(1)
        )
        if selected_id is None:
            raise typer.BadParameter("no accepted archive dataset exists")
        snapshot = build_and_publish(
            session, selected_id, channel=channel, code_version=code_version
        )
        typer.echo(
            json.dumps(
                {
                    "snapshot_id": snapshot.id,
                    "dataset_id": snapshot.dataset_id,
                    "channel": channel,
                    "status": snapshot.status,
                    "default_replay_date": snapshot.default_replay_date.isoformat(),
                },
                indent=2,
            )
        )


@app.command("rollback-publication")
def rollback_publication_command(
    snapshot_id: str = typer.Argument(..., help="Retained ready snapshot ID."),
    channel: str = typer.Option("public", help="Publication channel to move."),
) -> None:
    """Atomically point a channel back to a retained ready snapshot."""
    with SessionLocal() as session:
        snapshot = rollback_publication(session, snapshot_id, channel=channel)
        typer.echo(
            json.dumps(
                {"snapshot_id": snapshot.id, "channel": channel, "status": snapshot.status},
                indent=2,
            )
        )


@app.command("backup-manifest")
def backup_manifest_command(
    channel: str = typer.Option("public", help="Publication channel to document."),
    raw_dir: Path = typer.Option(
        Path("data/raw/nocturnebear-a5f108b5"), help="Path to raw archive directory."
    ),
    artifacts_dir: Path = typer.Option(
        Path("data/artifacts/evaluation"), help="Path to evaluation artifacts directory."
    ),
    code_version: str = typer.Option("working-tree", help="Git revision or code version ID."),
    with_lock: bool = typer.Option(
        False, help="Acquire publication advisory lock during manifest generation."
    ),
) -> None:
    """Generate a backup manifest describing database, dataset, pointer, and artifact hashes."""
    with SessionLocal() as session:
        manifest = create_backup_manifest(
            session,
            artifacts_dir=artifacts_dir,
            raw_dir=raw_dir,
            channel=channel,
            code_version=code_version,
            with_lock=with_lock,
        )
        typer.echo(json.dumps(manifest, indent=2))


@app.command("backup-archive")
def backup_archive_command(
    backup_dir: Path = typer.Option(
        Path("data/backups"), help="Directory where backup tar.gz will be saved."
    ),
    channel: str = typer.Option("public", help="Publication channel to backup."),
    code_version: str = typer.Option("working-tree", help="Code version identifier."),
) -> None:
    """Produce a complete, self-contained backup archive bundle coordinated with mutation lock."""
    with SessionLocal() as session:
        archive_path, manifest = create_backup_archive(
            session,
            backup_dir=backup_dir,
            channel=channel,
            code_version=code_version,
        )
        typer.echo(f"Backup archive created: {archive_path}")
        typer.echo(json.dumps(manifest, indent=2))


@app.command("restore-archive")
def restore_archive_command(
    archive_path: Path = typer.Argument(..., help="Path to backup tar.gz archive."),
    channel: str = typer.Option("public", help="Publication channel to verify."),
    database_name: str | None = typer.Option(
        None, help="Target PostgreSQL database name (defaults to courtlens)."
    ),
) -> None:
    """Restore database, configs, artifacts, and raw inputs from a backup archive bundle."""
    with SessionLocal() as session:
        result = restore_backup_archive(
            session,
            archive_path,
            channel=channel,
            target_database_name=database_name,
        )
        typer.echo(json.dumps(result, indent=2))


@app.command("verify-restore")
def verify_restore_command(
    snapshot_id: str | None = typer.Option(
        None, help="Expected published snapshot ID; defaults to current published snapshot."
    ),
    channel: str = typer.Option("public", help="Publication channel to verify."),
    artifacts_dir: Path = typer.Option(
        Path("data/artifacts/evaluation"), help="Path to evaluation artifacts directory."
    ),
    test_player_a: str = typer.Option("2544", help="Player A ID for verification query."),
    test_player_b: str = typer.Option("201939", help="Player B ID for verification query."),
) -> None:
    """Verify that a restored database and evaluation artifacts satisfy all CourtLens invariants."""
    with SessionLocal() as session:
        report = verify_restored_state(
            session,
            artifacts_dir=artifacts_dir,
            expected_snapshot_id=snapshot_id,
            channel=channel,
            test_player_a=test_player_a,
            test_player_b=test_player_b,
        )
        typer.echo(json.dumps(report, indent=2))


_DBT_SCHEMA_LAYERS = ("marts", "intermediate", "staging")


def _drop_dbt_schemas(connection: Connection, schema_prefix: str) -> None:
    """Remove derived dbt relations before resetting their operational sources."""
    if connection.dialect.name != "postgresql":
        return

    quote_identifier = connection.dialect.identifier_preparer.quote
    for layer in _DBT_SCHEMA_LAYERS:
        schema = quote_identifier(f"{schema_prefix}_{layer}")
        connection.exec_driver_sql(f"DROP SCHEMA IF EXISTS {schema} CASCADE")


def _reset_database(target_engine: Engine, schema_prefix: str) -> None:
    with target_engine.begin() as connection:
        _drop_dbt_schemas(connection, schema_prefix)
        Base.metadata.drop_all(connection)
        Base.metadata.create_all(connection)


@app.command("init-db")
def init_db() -> None:
    """Create tables for a local/dev database; production uses Alembic migrations."""
    Base.metadata.create_all(engine)
    typer.echo("CourtLens schema is ready")


@app.command()
def ingest(
    start: str = typer.Option(..., help="First provider date, formatted YYYY-MM-DD."),
    end: str = typer.Option(..., help="Last provider date, formatted YYYY-MM-DD."),
    include_stats: bool = typer.Option(False, help="Requires NBA ALL-STAR or higher."),
    include_players: bool = typer.Option(False, help="Paginate the provider player directory."),
) -> None:
    """Run an idempotent documented-provider load for a bounded date range."""
    try:
        parsed_start = date.fromisoformat(start)
        parsed_end = date.fromisoformat(end)
    except ValueError as error:
        raise typer.BadParameter("start and end must use YYYY-MM-DD") from error
    _execute_ingest(parsed_start, parsed_end, include_stats, include_players)


def _execute_ingest(start: date, end: date, include_stats: bool, include_players: bool) -> None:
    settings = get_settings()
    if settings.balldontlie_api_key is None:
        raise typer.BadParameter(
            "BALLDONTLIE_API_KEY is not set; CourtLens will not substitute generated NBA data"
        )
    Base.metadata.create_all(engine)
    with SessionLocal() as session:
        service = IngestionService(session, RawStore(settings.raw_store_path))
        with BalldontlieClient(
            api_key=settings.balldontlie_api_key.get_secret_value(),
            base_url=settings.bdl_base_url,
            requests_per_minute=settings.bdl_requests_per_minute,
        ) as client:
            run = service.ingest(
                client,
                start=start,
                end=end,
                include_stats=include_stats,
                include_players=include_players,
            )
        quality = run_operational_checks(session)
        typer.echo(
            json.dumps(
                {
                    "run_id": run.run_id,
                    "status": run.status,
                    "received": run.received_count,
                    "inserted": run.inserted_count,
                    "updated": run.updated_count,
                    "unchanged": run.unchanged_count,
                    "quality": quality.status,
                },
                indent=2,
            )
        )


@app.command("refresh")
def refresh(
    days_back: int = typer.Option(3, min=0, max=30),
    days_ahead: int = typer.Option(14, min=1, max=60),
    include_stats: bool = typer.Option(True),
) -> None:
    """Refresh a correction-aware rolling window around today."""
    today = date.today()
    _execute_ingest(
        today - timedelta(days=days_back),
        today + timedelta(days=days_ahead),
        include_stats,
        False,
    )


@app.command("seed-demo")
def seed_demo(
    reset: bool = typer.Option(
        False,
        "--reset",
        help="Recreate operational tables and remove derived dbt schemas before loading fixtures.",
    ),
) -> None:
    """Load an explicitly labeled fictional roster over provider-shaped test fixtures."""
    settings = get_settings()
    if settings.environment == "production":
        raise typer.BadParameter("fixture seeding is disabled in production")
    if reset:
        _reset_database(engine, settings.dbt_schema)
    else:
        Base.metadata.create_all(engine)
    with tempfile.TemporaryDirectory(prefix="courtlens-demo-") as temporary:
        paths: list[Path] = []
        for index, document in enumerate(fixture_documents()):
            path = Path(temporary) / f"{index:02d}-{document['resource']}.json"
            path.write_text(json.dumps(document), encoding="utf-8")
            paths.append(path)
        with SessionLocal() as session:
            service = IngestionService(session, RawStore(settings.raw_store_path))
            run = service.load_fixture_pages(paths, reset_source=False)
            user = session.scalar(select(User).where(User.email == DEMO_EMAIL))
            if user is None:
                user = User(email=DEMO_EMAIL, password_hash=hash_password(DEMO_PASSWORD))
                session.add(user)
                session.flush()
            league = session.scalar(
                select(FantasyLeague).where(
                    FantasyLeague.owner_id == user.id,
                    FantasyLeague.name == "Fixture Points League",
                )
            )
            if league is None:
                league = FantasyLeague(
                    owner_id=user.id,
                    name="Fixture Points League",
                    timezone="America/Toronto",
                    week_starts_on=0,
                    lineup_mode="daily",
                    lineup_slots_json={"G": 1, "F": 1, "UTIL": 1},
                    acquisition_limit=4,
                    scoring_mode="points",
                    scoring_rules_json=DEFAULT_POINTS_RULES,
                    scoring_rules_version=scoring_rules_hash(DEFAULT_POINTS_RULES),
                    roster_version=1,
                )
                session.add(league)
                session.flush()
                roster = [
                    (9101, ["PG", "G"]),
                    (9102, ["SG", "G"]),
                    (9103, ["SF", "F"]),
                    (9105, ["C"]),
                    (9107, ["PF", "F"]),
                    (9108, ["C"]),
                ]
                session.add_all(
                    [
                        FantasyRosterEntry(
                            league_id=league.id,
                            player_key=player_id,
                            eligible_slot_types_json=eligibility,
                            roster_version=1,
                        )
                        for player_id, eligibility in roster
                    ]
                )
                session.add_all(
                    [
                        FantasyWatchlistEntry(
                            league_id=league.id,
                            player_key=player_id,
                            label="Fixture comparison candidate",
                        )
                        for player_id in (9104, 9106)
                    ]
                )
                session.add(
                    FantasyWeekState(
                        league_id=league.id,
                        week_start=DEMO_WEEK_START,
                        acquisitions_used=1,
                    )
                )
            session.commit()
            quality = run_operational_checks(session)
            typer.echo(
                json.dumps(
                    {
                        "classification": "fixture",
                        "run_id": run.run_id,
                        "league_id": league.id,
                        "week_start": DEMO_WEEK_START.isoformat(),
                        "demo_email": DEMO_EMAIL,
                        "demo_password": DEMO_PASSWORD,
                        "quality": quality.status,
                        "warning": (
                            "These records are fictional fixtures, not operational NBA data."
                        ),
                    },
                    indent=2,
                )
            )


@app.command("quality")
def quality() -> None:
    """Run operational integrity checks and persist their result."""
    with SessionLocal() as session:
        result = run_operational_checks(session)
        typer.echo(json.dumps({"status": result.status, "checks": result.results_json}, indent=2))


@app.command("evaluate")
def evaluate_command(
    config: Path = typer.Option(
        Path("evaluation/config/baseline-v1.yaml"),
        exists=True,
        dir_okay=False,
        help="Frozen evaluation protocol configuration.",
    ),
    dataset: Path = typer.Option(
        Path("evaluation/manifests/accepted-archive-v1.json"),
        exists=True,
        dir_okay=False,
        help="Pinned accepted-dataset manifest; raw files are not read by evaluation.",
    ),
    output: Path = typer.Option(
        Path("data/artifacts/evaluation"),
        file_okay=False,
        help="Ignored local directory for immutable run artifacts.",
    ),
) -> None:
    """Rebuild M5 validation baselines while leaving the final holdout sealed."""
    frozen_config = load_config(config)
    with SessionLocal() as session:
        result = run_baseline_evaluation(
            session,
            config=frozen_config,
            config_path=config,
            dataset_manifest=dataset,
            output_root=output,
        )
    typer.echo(json.dumps(result, indent=2, default=str))


@app.command("evaluate-final")
def evaluate_final_command(
    baseline_run: str = typer.Option(..., help="Accepted, sealed M5 run ID."),
    open_final_test: bool = typer.Option(
        False, "--open-final-test", help="Explicitly open the frozen S3 holdout once."
    ),
    config: Path = typer.Option(Path("evaluation/config/baseline-v1.yaml"), exists=True),
    dataset: Path = typer.Option(
        Path("evaluation/manifests/accepted-archive-v1.json"), exists=True
    ),
    output: Path = typer.Option(Path("data/artifacts/evaluation")),
) -> None:
    """Run frozen challengers, register selection, then evaluate S3."""
    frozen_config = load_config(config)
    with SessionLocal() as session:
        result = run_final_evaluation(
            session,
            config=frozen_config,
            config_path=config,
            dataset_manifest=dataset,
            output_root=output,
            baseline_run_id=baseline_run,
            open_final_test=open_final_test,
        )
    typer.echo(json.dumps(result, indent=2, default=str))


@app.command("worker")
def worker_command(
    once: bool = typer.Option(False, "--once", help="Execute queued jobs once and exit."),
    worker_id: str | None = typer.Option(None, help="Explicit worker ID."),
) -> None:
    """Run the CourtLens background worker for job queue processing and daily refresh."""
    from courtlens.worker import start_worker

    start_worker(worker_id=worker_id, once=once)


@app.command("bootstrap")
def bootstrap_command(
    raw_root: Path | None = typer.Option(None, help="Directory containing raw data assets."),
    execute_now: bool = typer.Option(
        True, "--execute-now/--queue-only", help="Execute immediately or only enqueue."
    ),
) -> None:
    """Bootstrap recent research data, run dbt workbench models, and publish release."""
    from courtlens.services.workbench_jobs import enqueue_job, execute_job

    with SessionLocal() as session:
        job = enqueue_job(
            session, "bootstrap", arguments={"raw_root": str(raw_root) if raw_root else None}
        )
        job_id = job.id
    if execute_now:
        job = execute_job(engine, job_id)
    typer.echo(
        json.dumps(
            {
                "job_id": job.id,
                "job_type": job.job_type,
                "status": job.status,
                "stage": job.stage,
                "timings": job.timings_json,
                "output_refs": job.output_refs_json,
                "error": job.error_summary,
            },
            indent=2,
            default=str,
        )
    )


@app.command("refresh-workbench")
def refresh_workbench_command(
    execute_now: bool = typer.Option(
        True, "--execute-now/--queue-only", help="Execute immediately or only enqueue."
    ),
) -> None:
    """Refresh recent data and publish updated release if changed."""
    from courtlens.services.workbench_jobs import enqueue_job, execute_job

    with SessionLocal() as session:
        job = enqueue_job(session, "refresh")
        job_id = job.id
    if execute_now:
        job = execute_job(engine, job_id)
    typer.echo(
        json.dumps(
            {
                "job_id": job.id,
                "job_type": job.job_type,
                "status": job.status,
                "stage": job.stage,
                "timings": job.timings_json,
                "output_refs": job.output_refs_json,
                "error": job.error_summary,
            },
            indent=2,
            default=str,
        )
    )


@app.command("backfill-historical")
def backfill_historical_command(
    start_year: int = typer.Option(2001, help="Starting ending year (e.g. 2001 for 2000-01)."),
    end_year: int = typer.Option(
        2023, help="Ending year for historical range (e.g. 2023 for 2022-23)."
    ),
    batch_size: int = typer.Option(
        2, min=1, max=10, help="Number of seasons to process per batch."
    ),
    execute_now: bool = typer.Option(
        True, "--execute-now/--queue-only", help="Execute immediately or only enqueue."
    ),
) -> None:
    """Backfill historical NBA seasons toward 2000-01 in resumable batches."""
    from courtlens.services.workbench_jobs import enqueue_job, execute_job

    with SessionLocal() as session:
        job = enqueue_job(
            session,
            "backfill",
            {"start_year": start_year, "end_year": end_year, "batch_size": batch_size},
        )
        job_id = job.id
    if execute_now:
        job = execute_job(engine, job_id)
    typer.echo(
        json.dumps(
            {
                "job_id": job.id,
                "job_type": job.job_type,
                "status": job.status,
                "stage": job.stage,
                "timings": job.timings_json,
                "output_refs": job.output_refs_json,
                "error": job.error_summary,
            },
            indent=2,
            default=str,
        )
    )


@app.command("acquire-portraits")
def acquire_portraits_command(
    execute_now: bool = typer.Option(
        True, "--execute-now/--queue-only", help="Execute immediately or only enqueue."
    ),
    limit: int = typer.Option(200, min=1, max=2000, help="Maximum uncached players to attempt."),
) -> None:
    """Acquire and cache headshot portraits for active players."""
    from courtlens.services.workbench_jobs import enqueue_job, execute_job

    with SessionLocal() as session:
        job = enqueue_job(session, "portraits", {"limit": limit})
        job_id = job.id
    if execute_now:
        job = execute_job(engine, job_id)
    typer.echo(
        json.dumps(
            {
                "job_id": job.id,
                "job_type": job.job_type,
                "status": job.status,
                "output_refs": job.output_refs_json,
            },
            indent=2,
            default=str,
        )
    )


@app.command("acquire-rich-sources")
def acquire_rich_sources_command(
    season: int = typer.Option(2024, help="Season ending year (e.g. 2024 for 2023-24)."),
) -> None:
    """Acquire and verify rich source files (PBP, possessions, lineups, shots, matchups)."""
    from courtlens.ingestion.sportsdataverse import acquire_rich_season_assets

    settings = get_settings()
    manifest = acquire_rich_season_assets(season, settings.raw_store_path)
    typer.echo(json.dumps(manifest, indent=2, default=str))


@app.command("admit-rich-sources")
def admit_rich_sources_command(
    season: int = typer.Option(2024, help="Season ending year (e.g. 2024 for 2023-24)."),
    dataset_id: str | None = typer.Option(None, help="Target workbench dataset ID."),
    limit_games: int | None = typer.Option(None, help="Optional limit on admitted games."),
    execute_now: bool = typer.Option(
        True, "--execute-now/--queue-only", help="Execute immediately or only enqueue."
    ),
) -> None:
    """Admit and verify rich source data into immutable workbench facts."""
    from courtlens.services.workbench_jobs import enqueue_job, execute_job

    with SessionLocal() as session:
        job = enqueue_job(
            session,
            "rich_admission",
            {"ending_year": season, "dataset_id": dataset_id, "limit_games": limit_games},
        )
        job_id = job.id
    if execute_now:
        job = execute_job(engine, job_id)
    typer.echo(
        json.dumps(
            {
                "job_id": job.id,
                "job_type": job.job_type,
                "status": job.status,
                "stage": job.stage,
                "timings": job.timings_json,
                "output_refs": job.output_refs_json,
                "error": job.error_summary,
            },
            indent=2,
            default=str,
        )
    )


@app.command("verify-rich-admission")
def verify_rich_admission_command(
    dataset_id: str | None = typer.Option(None, help="Target workbench dataset ID."),
    season: str | None = typer.Option(None, help="Canonical season string (e.g. 2023-24)."),
) -> None:
    """Inspect admitted rich sources, lineage hashes, policy versions, and quarantine reports."""
    from courtlens.services.publication import DEFAULT_CHANNEL
    from courtlens.services.rich_source_admission import get_rich_admissions_report
    from courtlens.warehouse_models import PublishedSnapshot
    from courtlens.workbench_models import WorkbenchDataset, WorkbenchReleaseBinding

    with SessionLocal() as session:
        target_id = dataset_id
        if not target_id:
            pub = session.scalar(
                select(PublishedSnapshot).where(PublishedSnapshot.channel == DEFAULT_CHANNEL)
            )
            if pub:
                binding = session.scalar(
                    select(WorkbenchReleaseBinding).where(
                        WorkbenchReleaseBinding.snapshot_id == pub.snapshot_id
                    )
                )
                if binding:
                    target_id = binding.dataset_id
            if not target_id:
                ds = session.scalar(
                    select(WorkbenchDataset).order_by(WorkbenchDataset.created_at.desc())
                )
                if ds:
                    target_id = ds.id

        if not target_id:
            typer.echo(json.dumps({"error": "No workbench dataset found"}, indent=2))
            return

        report = get_rich_admissions_report(session, target_id, season=season)
        typer.echo(json.dumps({"dataset_id": target_id, "admissions": report}, indent=2))


@app.command("reconstruct-stints")
def reconstruct_stints_command(
    season: str = typer.Option("2023-24", help="Canonical season string (e.g. 2023-24)."),
    dataset_id: str | None = typer.Option(None, help="Target workbench dataset ID."),
    game_id: str | None = typer.Option(None, help="Target NBA game ID for single-game run."),
    limit_games: int | None = typer.Option(None, help="Optional limit on processed games."),
    execute_now: bool = typer.Option(
        True, "--execute-now/--queue-only", help="Execute immediately or only enqueue."
    ),
) -> None:
    """Reconstruct 5-on-5 continuous lineup stints under possession-policy-v1."""
    from courtlens.services.workbench_jobs import enqueue_job, execute_job

    with SessionLocal() as session:
        job = enqueue_job(
            session,
            "possession_warehouse",
            {
                "season": season,
                "dataset_id": dataset_id,
                "game_id": game_id,
                "limit_games": limit_games,
            },
        )
        job_id = job.id
    if execute_now:
        job = execute_job(engine, job_id)
    typer.echo(
        json.dumps(
            {
                "job_id": job.id,
                "job_type": job.job_type,
                "status": job.status,
                "stage": job.stage,
                "timings": job.timings_json,
                "output_refs": job.output_refs_json,
                "error": job.error_summary,
            },
            indent=2,
            default=str,
        )
    )


@app.command("verify-possession-warehouse")
def verify_possession_warehouse_command(
    dataset_id: str | None = typer.Option(None, help="Target workbench dataset ID."),
    season: str = typer.Option("2023-24", help="Canonical season string."),
    player_id: str | None = typer.Option(None, help="Player ID to verify cutoff-safe exposure."),
) -> None:
    """Inspect reconstructed lineup stints, invariant status, and cutoff-safe exposure."""
    from courtlens.services.possession_warehouse import (
        get_cutoff_safe_player_exposure,
        get_reconstruction_overrides,
    )
    from courtlens.services.publication import DEFAULT_CHANNEL
    from courtlens.warehouse_models import PublishedSnapshot
    from courtlens.workbench_models import (
        WorkbenchDataset,
        WorkbenchLineupStint,
        WorkbenchReleaseBinding,
        WorkbenchStintPlayer,
    )

    with SessionLocal() as session:
        target_id = dataset_id
        if not target_id:
            pub = session.scalar(
                select(PublishedSnapshot).where(PublishedSnapshot.channel == DEFAULT_CHANNEL)
            )
            if pub:
                binding = session.scalar(
                    select(WorkbenchReleaseBinding).where(
                        WorkbenchReleaseBinding.snapshot_id == pub.snapshot_id
                    )
                )
                if binding:
                    target_id = binding.dataset_id
            if not target_id:
                ds = session.scalar(
                    select(WorkbenchDataset).order_by(WorkbenchDataset.created_at.desc())
                )
                if ds:
                    target_id = ds.id

        if not target_id:
            typer.echo(json.dumps({"error": "No workbench dataset found"}, indent=2))
            return

        stint_count = (
            session.scalar(
                select(func.count(WorkbenchLineupStint.id)).where(
                    WorkbenchLineupStint.dataset_id == target_id
                )
            )
            or 0
        )
        stint_player_count = (
            session.scalar(
                select(func.count(WorkbenchStintPlayer.id)).where(
                    WorkbenchStintPlayer.dataset_id == target_id
                )
            )
            or 0
        )
        overrides = get_reconstruction_overrides(session, dataset_id=target_id)

        sample_player_exposure = None
        if player_id:
            sample_player_exposure = get_cutoff_safe_player_exposure(
                session,
                dataset_id=target_id,
                player_id=player_id,
                season=season,
            )

        typer.echo(
            json.dumps(
                {
                    "dataset_id": target_id,
                    "season": season,
                    "total_lineup_stints": stint_count,
                    "total_stint_player_records": stint_player_count,
                    "active_overrides_count": len(overrides),
                    "player_exposure": sample_player_exposure,
                },
                indent=2,
                default=str,
            )
        )


@app.command("jobs")
def jobs_command(
    status: str | None = typer.Option(
        None, help="Filter by status (queued, running, succeeded, failed, interrupted)."
    ),
    limit: int = typer.Option(20, min=1, max=100),
) -> None:
    """List recent background worker jobs."""
    from courtlens.workbench_models import WorkbenchJob

    with SessionLocal() as session:
        query = select(WorkbenchJob).order_by(WorkbenchJob.created_at.desc()).limit(limit)
        if status:
            query = query.where(WorkbenchJob.status == status)
        records = session.scalars(query).all()
        typer.echo(
            json.dumps(
                [
                    {
                        "id": r.id,
                        "job_type": r.job_type,
                        "status": r.status,
                        "stage": r.stage,
                        "owner": r.owner,
                        "started_at": r.started_at.isoformat() if r.started_at else None,
                        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
                        "timings": r.timings_json,
                        "error": r.error_summary,
                    }
                    for r in records
                ],
                indent=2,
            )
        )


@app.command("evaluate-points")
def evaluate_points_command(
    config: Path = typer.Option(
        Path("evaluation/config/points-v1.yaml"),
        exists=True,
        dir_okay=False,
        help="Frozen points evaluation protocol configuration.",
    ),
    dataset: Path = typer.Option(
        Path("evaluation/manifests/accepted-points-v1.json"),
        exists=True,
        dir_okay=False,
        help="Pinned accepted-dataset manifest.",
    ),
    output: Path = typer.Option(
        Path("data/artifacts/evaluation"),
        file_okay=False,
        help="Local directory for immutable run artifacts.",
    ),
    stage: str = typer.Option(
        "validate",
        help="Stage to execute: validate, calibrate, or final.",
    ),
    registered_run: str | None = typer.Option(
        None, "--registered-run", help="Registered run ID for calibrate or final stage."
    ),
    open_final_test: bool = typer.Option(
        False, "--open-final-test", help="Explicitly open the frozen Block F holdout once."
    ),
) -> None:
    """Execute points-v1 forecasting evaluation by stage (validate, calibrate, final)."""
    from courtlens.evaluation.points_config import load_points_config
    from courtlens.evaluation.points_runner import (
        run_points_calibration,
        run_points_final_test,
        run_points_validation,
    )

    points_cfg = load_points_config(config)

    if stage == "validate":
        result = run_points_validation(
            config=points_cfg,
            dataset_manifest=dataset,
            output_root=output,
        )
        typer.echo(json.dumps(result, indent=2, default=str))
    elif stage == "calibrate":
        target_run_id = registered_run
        if not target_run_id:
            # If not provided, run validation first to obtain run_id
            v_res = run_points_validation(
                config=points_cfg,
                dataset_manifest=dataset,
                output_root=output,
            )
            target_run_id = v_res["run_id"]
        result = run_points_calibration(
            run_id=target_run_id,
            output_root=output,
            dataset_manifest=dataset,
            config=points_cfg,
        )
        typer.echo(json.dumps(result, indent=2, default=str))
    elif stage == "final":
        if not registered_run:
            raise typer.BadParameter("--registered-run <run-id> is required for final stage")
        result = run_points_final_test(
            run_id=registered_run,
            output_root=output,
            dataset_manifest=dataset,
            config=points_cfg,
            open_final_test=open_final_test,
        )
        typer.echo(json.dumps(result, indent=2, default=str))
    else:
        raise typer.BadParameter(f"unknown stage '{stage}'; must be validate, calibrate, or final")


@app.command("activate-points-policy")
def activate_points_policy_command(
    registered_run: str = typer.Option(
        ..., "--registered-run", help="Completed points experiment run ID."
    ),
    output: Path = typer.Option(
        Path("data/artifacts/evaluation"),
        file_okay=False,
        help="Local directory containing evaluation artifacts.",
    ),
) -> None:
    """Activate the evaluated points-v1 forecasting policy in database."""
    from courtlens.evaluation.points_runner import activate_points_policy_record

    with SessionLocal() as session:
        policy = activate_points_policy_record(session, run_id=registered_run, output_root=output)
        typer.echo(
            json.dumps(
                {
                    "status": "activated",
                    "policy_id": policy.id,
                    "policy_name": policy.policy_name,
                    "target_metric": policy.target_metric,
                    "estimator_identity": policy.estimator_identity,
                    "calibration_identity": policy.calibration_identity,
                    "is_active": policy.is_active,
                    "experiment_run_id": policy.experiment_run_id,
                },
                indent=2,
                default=str,
            )
        )


@app.command("issue-forecasts")
def issue_forecasts_command(
    release: str | None = typer.Option(
        None,
        "--release",
        help="Snapshot/release ID to issue forecasts for (defaults to public channel).",
    ),
    as_of_date: str | None = typer.Option(
        None,
        "--as-of-date",
        help="Evaluation / cutoff date (YYYY-MM-DD).",
    ),
) -> None:
    """Issue genuine prospective points forecasts against active policy and published inputs."""
    from datetime import date as dt_date

    from courtlens.services.workbench_forecasts import issue_prospective_forecasts

    parsed_date = dt_date.fromisoformat(as_of_date) if as_of_date else None
    with SessionLocal() as session:
        result = issue_prospective_forecasts(session, release_id=release, as_of_date=parsed_date)
        typer.echo(json.dumps(result, indent=2, default=str))


@app.command("score-forecasts")
def score_forecasts_command(
    dataset: str | None = typer.Option(
        None,
        "--dataset",
        help="Dataset ID to score against (defaults to all datasets).",
    ),
    as_of_date: str | None = typer.Option(
        None,
        "--as-of-date",
        help="Scoring evaluation date (YYYY-MM-DD).",
    ),
) -> None:
    """Score pending forecast issuances against observed final box score outcomes."""
    from datetime import date as dt_date

    from courtlens.services.workbench_forecasts import score_forecast_issuances

    parsed_date = dt_date.fromisoformat(as_of_date) if as_of_date else None
    with SessionLocal() as session:
        result = score_forecast_issuances(session, dataset_id=dataset, as_of_date=parsed_date)
        typer.echo(json.dumps(result, indent=2, default=str))


@app.command("smoke-assistant")
def smoke_assistant_command(
    live: bool = typer.Option(
        False,
        "--live",
        help="Run live verification against Gemini API using COURTLENS_GEMINI_API_KEY.",
    ),
) -> None:
    """Run curated benchmark verification suite for analytical research assistant."""
    from courtlens.services.assistant.smoke import run_assistant_smoke

    exit_code = run_assistant_smoke(live=live)
    if exit_code != 0:
        raise typer.Exit(code=exit_code)


@app.command("finance-template")
def finance_template_command(destination: Path) -> None:
    """Write the strict manual import CSV header without overwriting files."""
    from courtlens.domain.finance import export_csv

    with destination.open("xb") as stream:
        stream.write(export_csv(()))
    typer.echo(str(destination))


@app.command("acquire-finance")
def acquire_finance_command(
    source: str = typer.Option(...),
    url: list[str] = typer.Option(...),
    season: str = "2026-27",
    root: Path = Path("data/raw/finance"),
) -> None:
    """Serial scheduled fetches; stop a rejected host and retain every receipt."""
    import httpx

    from courtlens.services.finance_refresh import FinanceFetcher

    if not 1 <= len(url) <= 64:
        raise typer.BadParameter("provide 1-64 admitted URLs")
    results = []
    with SessionLocal() as session, httpx.Client() as client:
        fetcher = FinanceFetcher(session, root, client)
        for value in url:
            receipt = fetcher.fetch(source, value, season)
            session.commit()
            results.append(
                {
                    "acquisition_id": receipt.id,
                    "status": receipt.status,
                    "http_status": receipt.http_status,
                    "reason": receipt.error_summary,
                }
            )
    typer.echo(json.dumps(results, indent=2))
    if any(r["status"] != "success" for r in results):
        raise typer.Exit(1)


@app.command("acquire-stats-feeds")
def acquire_stats_feeds_command(
    revision: str = typer.Option(..., help="Pinned 40-hex hoopR-nba-stats-raw commit."),
    season: str = typer.Option("2025-26"),
    draft_year: list[int] = typer.Option([], help="Draft/combine years to include."),
    pbpstats: bool = typer.Option(True, help="Include pbpstats secondary totals."),
    pbpstats_lineups: bool = typer.Option(True, help="Include per-team pbpstats lineups."),
    root: Path = typer.Option(Path("data/raw/stats-feeds")),
    report: Path | None = typer.Option(None, help="Write the run summary JSON here."),
) -> None:
    """One bounded scheduled run: fetch, retain and admit each feed in its own transaction."""
    import httpx

    from courtlens.services.stats_feed_ingestion import FeedFetcher, admit_feed, run_plan

    plan = run_plan(
        revision, season, draft_year, pbpstats=pbpstats, pbpstats_lineups=pbpstats_lineups
    )
    results = []
    with SessionLocal() as session, httpx.Client() as client:
        fetcher = FeedFetcher(session, root, client)
        for source, url, scope_season in plan:
            receipt = fetcher.fetch(source, url, scope_season)
            session.commit()
            result: dict[str, Any] = {
                "url": url,
                "acquisition_id": receipt.id,
                "status": receipt.status,
                "http_status": receipt.http_status,
                "bytes": receipt.bytes,
                "reason": receipt.error_summary,
            }
            if receipt.status == "success":
                try:
                    dataset = admit_feed(session, receipt.id, root)
                    session.commit()
                    result |= {
                        "dataset_id": dataset.id,
                        "rows": dataset.coverage_json["rows"],
                        "empty": dataset.coverage_json["empty"],
                        "truncated": dataset.coverage_json["truncated"],
                    }
                except (ValueError, KeyError) as error:
                    session.rollback()
                    result |= {"status": "rejected", "reason": str(error)[:300]}
            results.append(result)
            typer.echo(json.dumps(result))
    summary = {
        "revision": revision,
        "season": season,
        "draft_years": draft_year,
        "planned": len(plan),
        "admitted": sum("dataset_id" in r for r in results),
        "failed": sum(r["status"] == "failed" for r in results),
        "rejected": sum(r["status"] == "rejected" for r in results),
        "results": results,
    }
    if report is not None:
        report.write_text(json.dumps(summary, indent=2) + "\n")
    if summary["admitted"] != len(plan):
        raise typer.Exit(1)


@app.command("refresh-darko")
def refresh_darko_command(
    season: list[str] = typer.Option(["2023-24", "2024-25", "2025-26"], help="Seasons to fetch."),
    phase: list[str] = typer.Option(["regular_season", "playoffs"], help="Phases to fetch."),
    root: Path = typer.Option(Path("data/raw/darko")),
    output: Path = typer.Option(Path("data/derived/darko-dpm-v2")),
) -> None:
    """Operator run: seal dated DARKO snapshots at each phase's last admitted game date."""
    import httpx

    from courtlens.services.darko import refresh

    with SessionLocal() as session, httpx.Client() as client:
        path, results = refresh(session, root, client, season, output, phase)
    for result in results:
        typer.echo(json.dumps(result))
    typer.echo(f"sealed {path}  (set COURTLENS_DARKO_MANIFEST or config.darko_manifest)")


@app.command("import-stats-feed")
def import_stats_feed_command(
    acquisition_id: str, root: Path = typer.Option(Path("data/raw/stats-feeds"))
) -> None:
    """Admit one retained acquisition; re-admitting returns the same dataset."""
    from courtlens.services.stats_feed_ingestion import admit_feed

    with SessionLocal() as session:
        try:
            dataset = admit_feed(session, acquisition_id, root)
            session.commit()
        except (ValueError, KeyError) as error:
            session.rollback()
            raise typer.BadParameter(f"stats feed rejected: {error}") from error
        typer.echo(json.dumps({"dataset_id": dataset.id, **dataset.coverage_json}, indent=2))


@app.command("verify-stats-feeds")
def verify_stats_feeds_command(
    dataset_id: list[str] = typer.Option([], help="Default: every latest dataset."),
    root: Path = typer.Option(Path("data/raw/stats-feeds")),
) -> None:
    """Re-parse retained bytes and recompute membership/row hashes without fetching."""
    from courtlens.services.stats_feed_ingestion import latest_datasets, verify_feed

    with SessionLocal() as session:
        ids = dataset_id or [d.id for d in latest_datasets(session)]
        results = [verify_feed(session, value, root) for value in ids]
    typer.echo(
        json.dumps(
            {
                "checked": len(results),
                "verified": sum(r["verified"] for r in results),
                "failures": [r for r in results if not r["verified"]],
            },
            indent=2,
        )
    )
    if not all(r["verified"] for r in results):
        raise typer.Exit(1)


@app.command("stats-feed-coverage")
def stats_feed_coverage_command() -> None:
    """Latest admitted observation per feed scope, with empty/truncated flags."""
    from courtlens.services.stats_feed_ingestion import coverage_summary

    with SessionLocal() as session:
        typer.echo(json.dumps(coverage_summary(session), indent=2))


@app.command("map-bref-identities")
def map_bref_identities_command(
    acquisition_id: list[str] = typer.Option(..., help="Retained BRef contract acquisitions."),
    roster_dataset_id: str = typer.Option(..., help="Pinned PC05 NBA player index dataset."),
    root: Path = typer.Option(Path("data/raw/finance")),
    report: Path | None = typer.Option(None),
) -> None:
    """Owner-approved name-and-team rule; record mappings before the next acquisition."""
    from courtlens.services.bref_identity import (
        propose_mappings,
        record_mappings,
        register_index_identities,
    )

    with SessionLocal() as session:
        proposal = propose_mappings(session, acquisition_id, roster_dataset_id, root)
        proposal["recorded"] = record_mappings(session, proposal)
        proposal["registry"] = register_index_identities(session, roster_dataset_id)
        session.commit()
    if report is not None:
        report.write_text(json.dumps(proposal, indent=1, sort_keys=True) + "\n")
    typer.echo(
        json.dumps(
            {
                "bref_players": proposal["bref_players"],
                "mapped": len(proposal["mappings"]),
                "unresolved": len(proposal["unresolved"]),
                "recorded": proposal["recorded"],
                "registry": proposal["registry"],
            }
        )
    )


@app.command("import-finance-thresholds")
def import_finance_thresholds_command(path: Path) -> None:
    """Hand-enter an official season release; record actual import time."""
    from courtlens.services.finance_refresh import import_thresholds, threshold_info

    with SessionLocal() as session:
        record = import_thresholds(session, path)
        session.commit()
        typer.echo(threshold_info(record).model_dump_json(indent=2))


@app.command("import-finance-refresh")
def import_finance_refresh_command(
    acquisition_id: list[str] = typer.Option(...),
    roster_dataset_id: str = typer.Option(...),
    threshold_id: str | None = None,
    root: Path = Path("data/raw/finance"),
) -> None:
    """Seal a bounded run, a separate book and explicit roster salary coverage."""
    from courtlens.services.finance_refresh import admit_refresh, refresh_info

    with SessionLocal() as session:
        try:
            record = admit_refresh(
                session,
                acquisition_id,
                roster_dataset_id,
                threshold_id,
                root,
                get_settings().artifacts_root,
            )
            session.commit()
        except ValueError as error:
            session.rollback()
            raise typer.BadParameter(f"finance candidate rejected: {error}") from error
        typer.echo(refresh_info(session, record.id).model_dump_json(indent=2))


@app.command("verify-finance-refresh")
def verify_finance_refresh_command(refresh_id: str, root: Path = Path("data/raw/finance")) -> None:
    """Reconcile source bytes, book membership and roster coverage without fetching."""
    from courtlens.services.finance_refresh import verify_refresh

    with SessionLocal() as session:
        typer.echo(json.dumps(verify_refresh(session, refresh_id, root), indent=2))


@app.command("finance-preview")
def finance_preview_command(bundle: Path) -> None:
    """Validate retained source bytes, crosswalks and corrections without writes."""
    from courtlens.services.finance_import import preview_bundle

    with SessionLocal() as session:
        typer.echo(json.dumps(preview_bundle(session, bundle), indent=2))


@app.command("finance-import")
def finance_import_command(bundle: Path, execute_now: bool = False) -> None:
    """Stage and enqueue the allowlisted local operator import; never publish basketball."""
    from courtlens.services.finance_import import preview_bundle, stage_bundle
    from courtlens.services.workbench_jobs import enqueue_job, execute_job

    with SessionLocal() as session:
        preview_bundle(session, bundle)
    key = stage_bundle(bundle, get_settings().artifacts_root)
    with SessionLocal() as session:
        job = enqueue_job(session, "finance_import", {"bundle_hash": key})
        job_id = job.id
    if execute_now:
        job = execute_job(engine, job_id, worker_id="finance-cli")
    typer.echo(
        json.dumps(
            {"job_id": job_id, "status": job.status, "output": job.output_refs_json}, indent=2
        )
    )


@app.command("finance-verify")
def finance_verify_command(release_id: str) -> None:
    """Verify retained finance source bytes and resolved memberships after restore."""
    from courtlens.services.finance_import import verify_release

    with SessionLocal() as session:
        typer.echo(json.dumps(verify_release(session, release_id), indent=2))


@app.command("reconcile-live-final")
def reconcile_live_final_command(observation_id: str, dataset_id: str) -> None:
    """Compare retained final Live team scores to admitted batch facts without publishing."""
    from courtlens.services.live_reconciliation import reconcile_final

    with SessionLocal() as session:
        result = reconcile_final(session, observation_id, dataset_id)
    typer.echo(json.dumps(result, indent=2))
