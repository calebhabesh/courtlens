"""Executed migration guards, atomic rollback, exact decimals and A→B→A observations."""

import importlib.util
import os
from pathlib import Path
from uuid import uuid4

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from assignment_fakes import make_assignment_inputs, prepare, write_csv
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from courtlens.assignment_models import AssignmentDataset, AssignmentMember, AssignmentObservation
from courtlens.services.assignment_admission import admit_assignments, verify_assignments

pytestmark = pytest.mark.postgres


@pytest.fixture
def assignment_database():
    url = os.getenv("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        if os.getenv("CI") or os.getenv("COURTLENS_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("COURTLENS_TEST_POSTGRES_URL required")
        pytest.skip("disposable PostgreSQL URL required")
    engine = create_engine(url)
    schema = "b19b_" + uuid4().hex
    with engine.connect() as connection:
        connection.execute(text(f"CREATE SCHEMA {schema}"))
        connection.execute(text(f"SET search_path TO {schema}"))
        spec = importlib.util.spec_from_file_location(
            "b19b_migration", Path("migrations/versions/19b810a4f004_assignment_admission.py")
        )
        assert spec and spec.loader
        migration = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(migration)
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        connection.commit()
        try:
            yield connection
        finally:
            connection.rollback()
            connection.execute(text("SET search_path TO public"))
            connection.execute(text(f"DROP SCHEMA {schema} CASCADE"))
            connection.commit()
    engine.dispose()


def test_atomic_rollback_exact_precision_and_immutable_replay(assignment_database, tmp_path):
    inputs = make_assignment_inputs(tmp_path)
    a = prepare(inputs)
    with Session(assignment_database) as session:
        dataset = admit_assignments(session, a)
        aid = dataset.id
        session.rollback()
        assert session.scalar(select(func.count()).select_from(AssignmentDataset)) == 0
        assert session.scalar(select(func.count()).select_from(AssignmentMember)) == 0
        assert session.scalar(select(func.count()).select_from(AssignmentObservation)) == 0
        dataset = admit_assignments(session, a)
        aid = dataset.id
        session.commit()
        first = verify_assignments(session, dataset, inputs[3])
        assert first["rows"] == 1
        assert first["matchup_seconds"] == "85.500000000000000001"
        source, _, _, _, row = inputs
        row["team_points"] = "9"
        write_csv(source, [row])
        b = prepare(inputs)
        changed = admit_assignments(session, b)
        bid = changed.id
        session.commit()
        assert aid != bid
        assert verify_assignments(session, session.get(AssignmentDataset, aid), inputs[3]) == first
        row["team_points"] = "0"
        write_csv(source, [row])
        repeated = admit_assignments(session, prepare(inputs))
        assert repeated.id == aid
        session.commit()
        assert session.scalar(select(func.count()).select_from(AssignmentDataset)) == 2
        observations = session.scalars(
            select(AssignmentObservation).order_by(AssignmentObservation.observed_at)
        ).all()
        assert [o.dataset_id for o in observations] == [aid, bid, aid]


@pytest.mark.parametrize(
    "statement",
    [
        "UPDATE assignment_datasets SET content_sha256='changed'",
        "DELETE FROM assignment_games",
        "UPDATE assignment_members SET matchup_seconds=0",
        "DELETE FROM assignment_observations",
        "TRUNCATE assignment_datasets CASCADE",
        "TRUNCATE assignment_members",
        "INSERT INTO assignment_games SELECT dataset_id,'0022500002',game_date,"
        "row_count,membership_sha256 FROM assignment_games",
        "INSERT INTO assignment_members SELECT dataset_id,2,game_id,off_person_id,'99',"
        "off_team_id,def_team_id,matchup_seconds,partial_possessions,row_sha256,payload_json "
        "FROM assignment_members",
    ],
)
def test_sql_guards_cannot_be_bypassed_by_admin_setting(assignment_database, tmp_path, statement):
    inputs = make_assignment_inputs(tmp_path)
    with Session(assignment_database) as session:
        admit_assignments(session, prepare(inputs))
        session.commit()
        session.execute(text("SET LOCAL courtload.allow_admin_mutation = 'true'"))
        with pytest.raises(DBAPIError, match=r"append-only|already sealed"):
            session.execute(text(statement))
        session.rollback()
        assert session.scalar(select(func.count()).select_from(AssignmentMember)) == 1


def test_mid_admission_failure_rolls_back_parent_and_members(assignment_database, tmp_path):
    candidate = prepare(make_assignment_inputs(tmp_path))
    # A FK failure after the parent and game memberships have been staged.
    candidate["members"][0]["game_id"] = "0022500999"
    with Session(assignment_database) as session:
        with pytest.raises(DBAPIError, match="foreign key"):
            admit_assignments(session, candidate)
        session.rollback()
        assert session.scalar(select(func.count()).select_from(AssignmentDataset)) == 0
        assert session.scalar(select(func.count()).select_from(AssignmentMember)) == 0
