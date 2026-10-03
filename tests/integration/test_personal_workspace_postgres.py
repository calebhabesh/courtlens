"""PostgreSQL atomic concurrency evidence using isolated workspace IDs."""

import os
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, delete
from sqlalchemy.orm import Session

from courtload.database import Base
from courtload.services.personal_state import (
    VersionConflictError,
    get_or_create_workspace,
    update_workspace_state,
)
from courtload.workbench_models import WorkbenchPersonalWorkspace

pytestmark = pytest.mark.postgres


@pytest.mark.parametrize("persisted", [False, True])
def test_atomic_workspace_conflict(persisted: bool) -> None:
    url = os.getenv("COURTLOAD_TEST_POSTGRES_URL")
    if not url:
        if os.getenv("CI") or os.getenv("COURTLOAD_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("COURTLOAD_TEST_POSTGRES_URL must be configured")
        pytest.skip("PostgreSQL URL is not configured")
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    workspace_id = uuid4().hex
    barrier = Barrier(2)
    try:
        with Session(engine) as session:
            initial = get_or_create_workspace(session, workspace_id)
            if persisted:
                initial = update_workspace_state(session, initial, expected_version=1)

        def write(name: str) -> str:
            with Session(engine) as session:
                observed = get_or_create_workspace(session, workspace_id)
                barrier.wait(timeout=10)
                try:
                    update_workspace_state(
                        session,
                        observed.model_copy(update={"name": name}),
                        expected_version=observed.version,
                    )
                    return "saved"
                except VersionConflictError:
                    return "conflict"

        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(write, ["First", "Second"]))
        assert sorted(results) == ["conflict", "saved"]
        with Session(engine) as session:
            restored = get_or_create_workspace(session, workspace_id)
            assert restored.version == initial.version + 1
            assert restored.name in {"First", "Second"}
    finally:
        with Session(engine) as session:
            session.execute(
                delete(WorkbenchPersonalWorkspace).where(
                    WorkbenchPersonalWorkspace.id == workspace_id
                )
            )
            session.commit()
        engine.dispose()
