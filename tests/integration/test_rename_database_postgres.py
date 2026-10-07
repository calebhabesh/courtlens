"""RN02 exercises real migrations, sealed tables and a reversible namespace cutover."""

import os
from datetime import date
from uuid import uuid4

import pytest
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.operations import Operations
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from courtlens.services.assistant.history import history_inventory
from courtlens.workbench_models import (
    ForecastIssuance,
    ModelPolicyActivation,
    WorkbenchAcquisition,
    WorkbenchArtifact,
    WorkbenchDataset,
    WorkbenchDatasetMember,
    WorkbenchIdentity,
    WorkbenchObservation,
    WorkbenchPlayerGame,
    WorkbenchSchedule,
    WorkbenchTeamGame,
    WorkbenchVersion,
    allow_admin_mutation,
)

pytestmark = pytest.mark.postgres

ROW_SEALED = (
    "workbench_dataset_members",
    "workbench_schedules",
    "workbench_team_games",
    "workbench_player_games",
    "forecast_issuances",
)
STATEMENT_SEALED = (
    "research_datasets",
    "research_games",
    "research_shot_members",
    "finance_releases",
    "finance_sources",
    "finance_observations",
    "finance_members",
    "live_contents",
    "live_observations",
    "live_reconciliations",
    "saved_conversation_analyses",
    "saved_conversation_inputs",
    "assignment_datasets",
    "assignment_observations",
    "assignment_members",
    "assignment_games",
)


@pytest.fixture
def renamed_database():
    url = os.getenv("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        if os.getenv("CI") or os.getenv("COURTLENS_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("COURTLENS_TEST_POSTGRES_URL required")
        pytest.skip("disposable PostgreSQL URL required")
    root = create_engine(url)
    schema = "rn02_" + uuid4().hex
    with root.begin() as connection:
        connection.execute(text(f"CREATE SCHEMA {schema}"))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"})
    config = Config("alembic.ini")
    config.set_main_option("path_separator", "os")
    scripts = ScriptDirectory.from_config(config)
    revisions = list(reversed(list(scripts.walk_revisions())))
    try:
        with (
            engine.begin() as connection,
            Operations.context(MigrationContext.configure(connection)),
        ):
            for revision in revisions:
                revision.module.upgrade()
        _seed_rows(engine)
        yield engine, revisions[-1].module
    finally:
        engine.dispose()
        with root.begin() as connection:
            connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        root.dispose()


def _seed_rows(engine):
    """Every row-level guard must encounter a real row, rather than a zero-row no-op."""
    with Session(engine) as session:
        artifact = WorkbenchArtifact(
            sha256="1" * 64,
            resource="fixture",
            bytes=1,
            storage_path="fixture",
            mime_type="application/json",
            source_attribution="fixture",
        )
        identity = WorkbenchIdentity(
            namespace="nba",
            kind="player",
            external_id="2544",
            display_name="Fixture",
        )
        dataset = WorkbenchDataset(
            content_sha256="2" * 64,
            membership_sha256="3" * 64,
            semantic_signature="4" * 64,
            source_namespace="fixture",
            parser_version="fixture",
            quality_version="fixture",
            seasons_json=["2025-26"],
            phases_json=["regular_season"],
            manifest_json={},
            coverage_json={},
            exclusions_json={},
            status="ready",
        )
        policy = ModelPolicyActivation(
            policy_name="fixture",
            target_metric="points",
            estimator_identity="fixture",
            calibration_identity="fixture",
        )
        session.add_all([artifact, identity, dataset, policy])
        session.flush()
        acquisition = WorkbenchAcquisition(
            source_name="fixture",
            resource="fixture",
            source_url="https://example.com",
            status="success",
            artifact_id=artifact.id,
        )
        version = WorkbenchVersion(
            identity_id=identity.id,
            content_sha256="5" * 64,
            parser_version="fixture",
            payload_json={},
        )
        session.add_all([acquisition, version])
        session.flush()
        observation = WorkbenchObservation(
            acquisition_id=acquisition.id,
            artifact_id=artifact.id,
            row_identifier="fixture",
            identity_id=identity.id,
            version_id=version.id,
            observation_order=1,
        )
        session.add(observation)
        session.flush()
        provenance = {
            "dataset_id": dataset.id,
            "source_version_id": version.id,
            "source_observation_id": observation.id,
            "game_id": "0022500001",
            "game_date": date(2025, 10, 22),
            "season": "2025-26",
            "phase": "regular_season",
        }
        session.add_all(
            [
                WorkbenchDatasetMember(
                    dataset_id=dataset.id,
                    identity_id=identity.id,
                    version_id=version.id,
                    observation_id=observation.id,
                ),
                WorkbenchSchedule(
                    **provenance, home_team_id="LAL", away_team_id="GSW", game_status=3
                ),
                WorkbenchTeamGame(
                    **provenance,
                    team_id="LAL",
                    opponent_id="GSW",
                    side="home",
                    points=100,
                    opponent_points=90,
                    stats_json={},
                ),
                WorkbenchPlayerGame(
                    **provenance,
                    player_id="2544",
                    team_id="LAL",
                    opponent_id="GSW",
                    appearance="appeared",
                    minutes_original="30:00",
                    points=20,
                    stats_json={},
                ),
                ForecastIssuance(
                    dataset_id=dataset.id,
                    policy_id=policy.id,
                    player_id="2544",
                    target_game_id="0022500002",
                    target_game_date=date(2025, 10, 24),
                    target_opponent_id="GSW",
                    features_hash="6" * 64,
                    features_json={},
                    schedule_evidence_json={},
                    team_evidence_json={},
                    point_estimate=20,
                    interval_lower=10,
                    interval_upper=30,
                ),
            ]
        )
        session.commit()


def _definitions(connection):
    functions = connection.execute(
        text("""
        SELECT p.oid, p.proname, pg_get_functiondef(p.oid)
        FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
        WHERE n.nspname=current_schema() ORDER BY p.oid
    """)
    ).all()
    triggers = connection.execute(
        text("""
        SELECT t.oid, t.tgname, t.tgfoid, t.tgtype, t.tgenabled, c.relname
        FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE NOT t.tgisinternal AND n.nspname=current_schema() ORDER BY t.oid
    """)
    ).all()
    return functions, triggers


def test_up_down_up_preserves_function_oids_bodies_and_trigger_bindings(renamed_database):
    engine, migration = renamed_database
    with engine.begin() as connection:
        renamed, triggers = _definitions(connection)
        assert not any("courtload" in definition for _, _, definition in renamed)
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
        legacy, old_triggers = _definitions(connection)
        assert triggers == old_triggers
        assert len(legacy) == len(renamed)
        for (oid, name, definition), (new_oid, new_name, new_definition) in zip(
            legacy, renamed, strict=True
        ):
            assert oid == new_oid
            assert name.replace("courtload_", "courtlens_") == new_name
            assert (
                definition.replace("courtload_", "courtlens_").replace(
                    "courtload.allow_admin_mutation", "courtlens.allow_admin_mutation"
                )
                == new_definition
            )
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        assert _definitions(connection) == (renamed, triggers)


@pytest.mark.parametrize("table", ROW_SEALED + STATEMENT_SEALED)
@pytest.mark.parametrize("operation", ("UPDATE", "DELETE"))
def test_every_database_sealed_table_preserves_mutation_exception(
    renamed_database, table, operation
):
    engine, migration = renamed_database
    with engine.begin() as connection:
        column = inspect(connection).get_columns(table)[0]["name"]
        sql = (
            f"UPDATE {table} SET {column}={column}"
            if operation == "UPDATE"
            else f"DELETE FROM {table}"
        )
        errors = []
        for legacy in (False, True, False):
            if legacy:
                with Operations.context(MigrationContext.configure(connection)):
                    migration.downgrade()
            with connection.begin_nested() as savepoint:
                with pytest.raises(DBAPIError, match=r"append-only|sealed and immutable") as error:
                    connection.execute(text(sql))
                errors.append((error.value.orig.sqlstate, error.value.orig.diag.message_primary))
                savepoint.rollback()
            if legacy:
                with Operations.context(MigrationContext.configure(connection)):
                    migration.upgrade()
        assert errors[0] == errors[1] == errors[2]


def test_admin_namespace_hard_cut_and_context_manager_cleanup(renamed_database):
    engine, _ = renamed_database
    with Session(engine) as session:
        session.execute(text("SET LOCAL courtload.allow_admin_mutation = 'true'"))
        with pytest.raises(DBAPIError, match="sealed and immutable"):
            session.execute(text("UPDATE workbench_schedules SET game_status=game_status"))
        session.rollback()
        with allow_admin_mutation(session):
            session.execute(text("UPDATE workbench_schedules SET game_status=game_status"))
        assert (
            session.scalar(text("SELECT current_setting('courtlens.allow_admin_mutation')"))
            == "false"
        )
        with pytest.raises(DBAPIError, match="sealed and immutable"):
            session.execute(text("DELETE FROM workbench_schedules"))
        session.rollback()


def test_backup_recognizes_pre_transcript_schema_but_rejects_new_schema_damage(renamed_database):
    engine, _ = renamed_database
    with engine.connect() as connection:
        # Entire test rolls back; no retained application schema or data is touched.
        transaction = connection.begin()
        connection.execute(text("DROP TABLE assistant_agent_transcripts"))
        connection.execute(
            text("CREATE TABLE alembic_version (version_num varchar(32) PRIMARY KEY)")
        )
        connection.execute(text("INSERT INTO alembic_version VALUES ('07b810a4f005')"))
        with Session(connection) as session:
            assert history_inventory(session) == {"threads": [], "turns": [], "inputs": []}
            connection.execute(text("UPDATE alembic_version SET version_num='08b810a4f006'"))
            with pytest.raises(ValueError, match="transcript table missing"):
                history_inventory(session)
        transaction.rollback()
