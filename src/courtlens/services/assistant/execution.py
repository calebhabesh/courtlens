"""Deadline-supervised read-only PostgreSQL operation execution."""

from __future__ import annotations

import json
import multiprocessing
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from fastapi import HTTPException
from sqlalchemy import create_engine, event, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from courtlens.domain.conversation import OperationStep
from courtlens.services.assistant.operations import execute_operation
from courtlens.services.starting_positions import PositionEvidenceUnavailable
from courtlens.services.workbench_analytics import ResolvedContext


def _worker(
    connection: Any,
    url: str,
    search_path: str,
    context: ResolvedContext | None,
    step: OperationStep,
    deadline: float,
    full_result: bool = False,
    legacy_nonappearance: bool = False,
) -> None:
    # Registration has no acquisition/build/publication side effects.
    import courtlens.models  # noqa: F401

    engine = create_engine(url, isolation_level="REPEATABLE READ")
    try:
        with Session(engine) as session:
            session.execute(text("SET TRANSACTION READ ONLY"))
            session.execute(
                text("SELECT set_config('search_path', :value, true)"), {"value": search_path}
            )
            session.execute(
                text("SELECT set_config('statement_timeout', :value, true)"),
                {"value": str(max(1, int(min(20, deadline - time.monotonic()) * 1000)))},
            )
            data = execute_operation(
                session,
                context,
                step,
                deadline,
                full_result=full_result,
                legacy_nonappearance=legacy_nonappearance,
            )
            raw = json.dumps({"data": data}, allow_nan=False).encode()
            if len(raw) > 2 * 1024 * 1024:
                raise ValueError("result budget exceeded")
            connection.send_bytes(raw)
    except HTTPException as exc:
        connection.send_bytes(json.dumps({"http_status": exc.status_code}).encode())
    except TimeoutError:
        connection.send_bytes(b'{"timeout":true}')
    except PositionEvidenceUnavailable:
        connection.send_bytes(b'{"position_unavailable":true}')
    except ValueError:
        connection.send_bytes(b'{"invalid":true}')
    except DBAPIError as exc:
        connection.send_bytes(
            b'{"timeout":true}'
            if getattr(exc.orig, "sqlstate", None) == "57014"
            else b'{"failed":true}'
        )
    except Exception:
        connection.send_bytes(b'{"failed":true}')
    finally:
        engine.dispose()
        connection.close()


def execute_bounded(
    session: Session,
    context: ResolvedContext | None,
    step: OperationStep,
    deadline: float,
    *,
    full_result: bool = False,
    legacy_nonappearance: bool = False,
) -> dict[str, Any]:
    """Supervise CPU and DB time without sharing ORM sessions or letting late results win."""
    if session.bind is None or session.bind.dialect.name != "postgresql":
        return execute_operation(
            session,
            context,
            step,
            deadline,
            full_result=full_result,
            legacy_nonappearance=legacy_nonappearance,
        )
    search_path = session.execute(text("SHOW search_path")).scalar_one()
    url = session.get_bind().url.render_as_string(hide_password=False)  # type: ignore[union-attr]
    spawn = multiprocessing.get_context("spawn")
    parent, child = spawn.Pipe(duplex=False)
    process = spawn.Process(
        target=_worker,
        args=(
            child,
            url,
            search_path,
            context,
            step,
            deadline,
            full_result,
            legacy_nonappearance,
        ),
        daemon=True,
    )
    process.start()
    child.close()
    try:
        if not parent.poll(max(0, deadline - time.monotonic())):
            raise TimeoutError("analytical deadline")
        raw = parent.recv_bytes(maxlength=2 * 1024 * 1024)
        response = json.loads(raw)
        if response.get("timeout"):
            raise TimeoutError("analytical deadline")
        if response.get("position_unavailable"):
            raise PositionEvidenceUnavailable("position evidence unavailable")
        if response.get("invalid"):
            raise ValueError("invalid analytical operation")
        if "http_status" in response:
            raise HTTPException(
                response["http_status"],
                "Full result exceeds its export bound; narrow the query."
                if response["http_status"] == 413
                else "Analytical operation unavailable.",
            )
        if response.get("failed"):
            raise RuntimeError("analytical execution failed")
        data: dict[str, Any] = response["data"]
        return data
    finally:
        parent.close()
        if process.is_alive():
            process.terminate()
        process.join(timeout=1)
        if process.is_alive():
            process.kill()
            process.join(timeout=1)
        process.close()


@contextmanager
def query_deadline(session: Session, deadline: float) -> Iterator[None]:
    """Apply the remaining deadline to every parent resolution/identity SQL statement."""
    if session.bind is None or session.bind.dialect.name != "postgresql":
        yield
        return
    connection = session.connection()
    original = connection.execute(text("SHOW statement_timeout")).scalar_one()

    def before_query(
        conn: Any,
        cursor: Any,
        statement: str,
        parameters: Any,
        execution_context: Any,
        executemany: bool,
    ) -> None:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError("analytical deadline")
        milliseconds = max(1, int(min(20, remaining) * 1000))
        cursor.execute("SELECT set_config('statement_timeout', %s, true)", (str(milliseconds),))

    event.listen(connection, "before_cursor_execute", before_query)
    try:
        yield
    finally:
        event.remove(connection, "before_cursor_execute", before_query)
        driver = connection.connection.driver_connection if not connection.invalidated else None
        status = getattr(getattr(driver, "info", None), "transaction_status", None)
        if getattr(status, "name", "") != "INERROR" and not connection.invalidated:
            connection.execute(
                text("SELECT set_config('statement_timeout', :value, true)"), {"value": original}
            )
