from __future__ import annotations

import json
import tempfile
from datetime import date, timedelta
from pathlib import Path

import typer
from sqlalchemy import Connection, Engine, select

from courtload.archive_models import ArchiveDataset
from courtload.config import get_settings
from courtload.database import Base, SessionLocal, engine
from courtload.demo import (
    DEMO_EMAIL,
    DEMO_PASSWORD,
    DEMO_WEEK_START,
    fixture_documents,
)
from courtload.domain.scoring import DEFAULT_POINTS_RULES, scoring_rules_hash
from courtload.evaluation.challenger import run_final_evaluation
from courtload.evaluation.config import load_config
from courtload.evaluation.runner import run_baseline_evaluation
from courtload.ingestion.archive import acquire_archive
from courtload.ingestion.archive_import import import_archive
from courtload.ingestion.client import BalldontlieClient
from courtload.ingestion.loader import IngestionService
from courtload.ingestion.raw_store import RawStore
from courtload.models import (
    FantasyLeague,
    FantasyRosterEntry,
    FantasyWatchlistEntry,
    FantasyWeekState,
    User,
)
from courtload.security import hash_password
from courtload.services.backup_restore import create_backup_manifest, verify_restored_state
from courtload.services.publication import build_and_publish, rollback_publication
from courtload.services.quality import run_operational_checks

app = typer.Typer(
    no_args_is_help=True,
    help="Ingest source data, seed labeled fixtures, and verify CourtLoad's warehouse.",
)


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
) -> None:
    """Generate a backup manifest describing database, dataset, pointer, and artifact hashes."""
    with SessionLocal() as session:
        manifest = create_backup_manifest(
            session,
            artifacts_dir=artifacts_dir,
            raw_dir=raw_dir,
            channel=channel,
            code_version=code_version,
        )
        typer.echo(json.dumps(manifest, indent=2))


@app.command("verify-restore")
def verify_restore_command(
    snapshot_id: str | None = typer.Option(
        None, help="Expected published snapshot ID; defaults to current published snapshot."
    ),
    channel: str = typer.Option("public", help="Publication channel to verify."),
    artifacts_dir: Path = typer.Option(
        Path("data/artifacts/evaluation"), help="Path to evaluation artifacts directory."
    ),
) -> None:
    """Verify that a restored database and evaluation artifacts satisfy all CourtLoad invariants."""
    with SessionLocal() as session:
        report = verify_restored_state(
            session,
            artifacts_dir=artifacts_dir,
            expected_snapshot_id=snapshot_id,
            channel=channel,
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
    typer.echo("CourtLoad schema is ready")


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
            "BALLDONTLIE_API_KEY is not set; CourtLoad will not substitute generated NBA data"
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
    with tempfile.TemporaryDirectory(prefix="courtload-demo-") as temporary:
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
