from __future__ import annotations

import json
import tempfile
from datetime import date, timedelta
from pathlib import Path

import typer
from sqlalchemy import select

from courtload.config import get_settings
from courtload.database import Base, SessionLocal, engine
from courtload.demo import (
    DEMO_EMAIL,
    DEMO_PASSWORD,
    DEMO_WEEK_START,
    fixture_documents,
)
from courtload.domain.scoring import DEFAULT_POINTS_RULES, scoring_rules_hash
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
from courtload.services.quality import run_operational_checks

app = typer.Typer(
    no_args_is_help=True,
    help="Ingest source data, seed labeled fixtures, and verify CourtLoad's warehouse.",
)


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
        help="Drop and recreate the selected database before loading fixtures.",
    ),
) -> None:
    """Load an explicitly labeled fictional roster over provider-shaped test fixtures."""
    settings = get_settings()
    if settings.environment == "production":
        raise typer.BadParameter("fixture seeding is disabled in production")
    if reset:
        Base.metadata.drop_all(engine)
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
