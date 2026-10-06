"""Durable acceptance and publication; no process-local history or provider transcripts.

Short database transactions serialize lifecycle mutations across API processes. Analytical
work runs outside the lock. A 50-second lease fences abandoned work without cancelling live
work when a second worker starts. Expiry is recovered on polling/acceptance, never retried
implicitly. This service owns its Session transaction boundaries.
"""

from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import Engine, delete, select, text, true
from sqlalchemy.orm import Session

from courtload.assistant_history_models import AssistantThread, AssistantTurn, AssistantTurnInput
from courtload.domain.conversation import AnalysisPlan, ConversationContext
from courtload.domain.hybrid_assistant import (
    DurableThreadHeader,
    DurableTurnRecord,
    HybridTurnRequest,
    HybridTurnResponse,
    InabilityBlock,
    ThreadHistoryPage,
    TurnHistoryPage,
)
from courtload.services.assistant.conversations import MAX_TURN_BYTES
from courtload.services.assistant.hybrid import run_hybrid_turn
from courtload.services.assistant.planner import PlanProvider
from courtload.services.workbench_analytics import canonical_hash

ACTIVE = ("pending", "running")
LEASE_SECONDS = 50


@contextmanager
def lifecycle(session: Session) -> Iterator[None]:
    session.rollback()
    try:
        if session.get_bind().dialect.name == "postgresql":
            session.execute(text("SET TRANSACTION ISOLATION LEVEL READ COMMITTED"))
            session.execute(text("SELECT pg_advisory_xact_lock(70702026)"))
        yield
        session.commit()
    except Exception:
        session.rollback()
        raise


@contextmanager
def history_backup_lock(session: Session) -> Iterator[None]:
    """Fence transcript mutations while dump and manifest observe the same history."""
    bind = session.get_bind()
    if not isinstance(bind, Engine) or bind.dialect.name != "postgresql":
        yield
        return
    with bind.connect() as connection:
        connection.execute(text("SELECT pg_advisory_lock(70702026)"))
        connection.commit()
        try:
            yield
        finally:
            connection.rollback()
            connection.execute(text("SELECT pg_advisory_unlock(70702026)"))
            connection.commit()


def aware(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value


def header(row: AssistantThread) -> DurableThreadHeader:
    return DurableThreadHeader(
        thread_id=UUID(row.id),
        title=row.title,
        created_at=aware(row.created_at),
        updated_at=aware(row.updated_at),
        version=row.version,
    )


def record(row: AssistantTurn) -> DurableTurnRecord:
    return DurableTurnRecord(
        thread_id=UUID(row.thread_id),
        turn_id=UUID(row.id),
        request=HybridTurnRequest.model_validate(row.request_json),
        request_sha256=row.request_sha256,
        accepted_at=aware(row.accepted_at),
        state=row.state,
        response=HybridTurnResponse.model_validate(row.response_json)
        if row.response_json
        else None,
        response_sha256=row.response_sha256,
    )


def terminal(row: AssistantTurn, *, cancelled: bool) -> HybridTurnResponse:
    return HybridTurnResponse(
        request_id=UUID(row.request_id),
        thread_id=UUID(row.thread_id),
        turn_id=UUID(row.id),
        status="cancelled" if cancelled else "failed",
        intent="inability",
        blocks=[
            InabilityBlock(
                reason="cancelled" if cancelled else "backend_failure",
                text="This request was stopped."
                if cancelled
                else "This request was interrupted before an answer could be retained.",
                next_action="Retry with a new request linked to this turn.",
            )
        ],
    )


def publish(session: Session, row: AssistantTurn, answer: HybridTurnResponse) -> None:
    answer = HybridTurnResponse.model_validate(answer.model_dump(mode="json"))
    row.state = (
        "cancelled"
        if answer.status == "cancelled"
        else "failed"
        if answer.status == "failed"
        else "completed"
    )
    row.response_json = answer.model_dump(mode="json")
    row.response_sha256 = canonical_hash(row.response_json)
    if answer.scope:
        row.context_json = answer.scope.selections.model_dump(mode="json")
    elif answer.status == "answered":
        # A drawer may open with guidance before its first analytical question. Retain
        # its explicit page selections without manufacturing an analytical scope.
        request_context = row.request_json.get("context")
        if request_context and row.context_json is None:
            merged = dict(row.context_json or {})
            merged.update(request_context)
            row.context_json = ConversationContext.model_validate(merged).model_dump(mode="json")
    if answer.plan:
        row.plan_json = answer.plan.model_dump(mode="json")
    parent = session.get(AssistantThread, row.thread_id)
    if parent:
        parent.updated_at = datetime.now(UTC)
        parent.version += 1
    if answer.scope and answer.scope.local_context:
        context = answer.scope.local_context
        for block in answer.blocks:
            if block.kind != "result":
                continue
            result = block.result
            step = (
                next((s for s in answer.plan.steps if s.step_id == result.step_id), None)
                if answer.plan
                else None
            )
            session.add(
                AssistantTurnInput(
                    turn_id=row.id,
                    step_id=result.step_id,
                    workbench_dataset_id=context["dataset_id"]
                    if context["dataset_type"] == "workbench"
                    else None,
                    archive_dataset_id=context["dataset_id"]
                    if context["dataset_type"] == "archive"
                    else None,
                    finance_release_id=step.arguments.get("book_id")
                    if step and step.operation == "finance"
                    else None,
                    issuance_id=result.data.get("id") if result.operation == "forecast" else None,
                )
            )


def recover_locked(session: Session) -> int:
    rows = session.scalars(
        select(AssistantTurn)
        .where(AssistantTurn.state.in_(ACTIVE), AssistantTurn.lease_until <= datetime.now(UTC))
        .order_by(AssistantTurn.lease_until)
        .limit(100)
    ).all()
    for row in rows:
        publish(session, row, terminal(row, cancelled=False))
    # Sessions disable autoflush; subsequent acceptance must see the recovered state.
    session.flush()
    return len(rows)


def recover_interrupted(session: Session) -> int:
    with lifecycle(session):
        return recover_locked(session)


def require_thread(session: Session, thread_id: UUID) -> AssistantThread:
    row = session.get(AssistantThread, str(thread_id))
    if row is None:
        raise HTTPException(404, "Thread not found.")
    return row


def create_thread(session: Session) -> DurableThreadHeader:
    with lifecycle(session):
        now = datetime.now(UTC)
        row = AssistantThread(
            id=str(uuid4()), title="New chat", created_at=now, updated_at=now, version=1
        )
        session.add(row)
        session.flush()
        return header(row)


def accept(session: Session, request: HybridTurnRequest) -> DurableTurnRecord:
    with lifecycle(session):
        recover_locked(session)
        digest = canonical_hash(request.model_dump(mode="json"))
        previous = session.scalar(
            select(AssistantTurn).where(AssistantTurn.request_id == str(request.request_id))
        )
        if previous:
            if previous.request_sha256 != digest:
                raise HTTPException(409, "Request identity was reused with different content.")
            return record(previous)
        now = datetime.now(UTC)
        if request.thread_id:
            thread = require_thread(session, request.thread_id)
        else:
            thread = AssistantThread(
                id=str(uuid4()),
                title=request.message[:255],
                created_at=now,
                updated_at=now,
                version=1,
            )
            session.add(thread)
            session.flush()
        if session.scalar(
            select(AssistantTurn.id)
            .where(AssistantTurn.thread_id == thread.id, AssistantTurn.state.in_(ACTIVE))
            .limit(1)
        ):
            raise HTTPException(409, "A turn is already running in this thread.")
        if request.retry_of:
            retry = session.get(AssistantTurn, str(request.retry_of))
            if (
                not retry
                or retry.thread_id != thread.id
                or retry.state in ACTIVE
                or not retry.response_json
                or retry.response_json["status"] not in ("unable", "failed", "cancelled")
            ):
                raise HTTPException(
                    422, "Retry must link to a terminal unsuccessful turn in this thread."
                )
        # Only the most recent server-owned selections/plan enter working context.
        last = session.scalar(
            select(AssistantTurn)
            .where(AssistantTurn.thread_id == thread.id)
            .order_by(AssistantTurn.sequence.desc())
            .limit(1)
        )
        inherited = last.context_json if last else None
        old_plan = last.plan_json if last else None
        thread.version += 1
        thread.updated_at = now
        if thread.title == "New chat":
            thread.title = request.message[:255]
        row = AssistantTurn(
            id=str(uuid4()),
            thread_id=thread.id,
            sequence=thread.version,
            request_id=str(request.request_id),
            retry_of=str(request.retry_of) if request.retry_of else None,
            request_sha256=digest,
            request_json=request.model_dump(mode="json"),
            accepted_at=now,
            lease_until=now + timedelta(seconds=LEASE_SECONDS),
            state="pending",
            context_json=inherited,
            plan_json=old_plan,
        )
        session.add(row)
        session.flush()
        return record(row)


def run_durable_turn(
    session: Session, request: HybridTurnRequest, *, provider: PlanProvider | None = None
) -> HybridTurnResponse:
    accepted = accept(session, request)
    if accepted.response:
        return accepted.response
    # Only the process that wins pending -> running executes; duplicates poll/replay.
    with lifecycle(session):
        row = session.get(AssistantTurn, str(accepted.turn_id))
        if row is None:
            raise HTTPException(404, "Thread was deleted.")
        if row.response_json:
            return record(row).response  # type: ignore[return-value]
        if row.state != "pending":
            raise HTTPException(409, "Request is running; poll its retained turn.")
        row.state = "running"
        inherited = (
            ConversationContext.model_validate(row.context_json) if row.context_json else None
        )
        previous_plan = AnalysisPlan.model_validate(row.plan_json) if row.plan_json else None
        interrupted = terminal(row, cancelled=False)
    try:
        execution = request.model_copy(update={"thread_id": accepted.thread_id})
        answer = run_hybrid_turn(
            session,
            execution,
            inherited_context=inherited,
            previous_plan=previous_plan,
            provider=provider,
        )
        answer = answer.model_copy(update={"turn_id": accepted.turn_id})
        if len(answer.model_dump_json().encode()) > MAX_TURN_BYTES:
            answer = interrupted
    except Exception:
        # No raw database/provider exceptions are retained or returned.
        answer = interrupted
    with lifecycle(session):
        recover_locked(session)
        current = session.get(AssistantTurn, str(accepted.turn_id))
        if current is None:
            raise HTTPException(404, "Thread was deleted.")
        if current.response_json:
            return record(current).response  # type: ignore[return-value]
        publish(session, current, answer)
        session.flush()
        return record(current).response  # type: ignore[return-value]


def cancel_turn(session: Session, thread_id: UUID, turn_id: UUID) -> DurableTurnRecord:
    with lifecycle(session):
        require_thread(session, thread_id)
        row = session.get(AssistantTurn, str(turn_id))
        if not row or row.thread_id != str(thread_id):
            raise HTTPException(404, "Turn not found.")
        if row.state in ACTIVE:
            publish(session, row, terminal(row, cancelled=True))
        return record(row)


def delete_history(session: Session, thread_id: UUID | None = None) -> dict[str, bool]:
    with lifecycle(session):
        if thread_id:
            require_thread(session, thread_id)
        ids = select(AssistantTurn.id)
        if thread_id:
            ids = ids.where(AssistantTurn.thread_id == str(thread_id))
        session.execute(delete(AssistantTurnInput).where(AssistantTurnInput.turn_id.in_(ids)))
        # Self-FK retry links are removed together; delete all turns in one statement.
        statement = delete(AssistantTurn)
        if thread_id:
            statement = statement.where(AssistantTurn.thread_id == str(thread_id))
        session.execute(statement)
        statement_thread = delete(AssistantThread)
        if thread_id:
            statement_thread = statement_thread.where(AssistantThread.id == str(thread_id))
        session.execute(statement_thread)
        return {"cleared": True}


def list_threads(
    session: Session, limit: int = 20, cursor: UUID | None = None
) -> ThreadHistoryPage:
    rows = session.scalars(
        select(AssistantThread)
        .where(AssistantThread.id > str(cursor) if cursor else true())
        .order_by(AssistantThread.id)
        .limit(limit + 1)
    ).all()
    return ThreadHistoryPage(
        threads=[header(row) for row in rows[:limit]],
        next_cursor=rows[limit - 1].id if len(rows) > limit else None,
    )


def list_turns(
    session: Session, thread_id: UUID, limit: int = 20, cursor: int = 0
) -> TurnHistoryPage:
    recover_interrupted(session)
    thread = require_thread(session, thread_id)
    rows = session.scalars(
        select(AssistantTurn)
        .where(AssistantTurn.thread_id == str(thread_id), AssistantTurn.sequence > cursor)
        .order_by(AssistantTurn.sequence)
        .limit(limit + 1)
    ).all()
    return TurnHistoryPage(
        thread=header(thread),
        turns=[record(row) for row in rows[:limit]],
        next_cursor=str(rows[limit - 1].sequence) if len(rows) > limit else None,
    )


def history_inventory(session: Session) -> dict[str, Any]:
    """Backup/restore integrity includes transcript, references and working-context hashes."""
    threads = session.scalars(select(AssistantThread).order_by(AssistantThread.id)).all()
    turns = session.scalars(select(AssistantTurn).order_by(AssistantTurn.id)).all()
    inputs = session.scalars(
        select(AssistantTurnInput).order_by(AssistantTurnInput.turn_id, AssistantTurnInput.step_id)
    ).all()
    return {
        "threads": [header(t).model_dump(mode="json") for t in threads],
        "turns": [
            {
                "turn_id": t.id,
                "sha256": canonical_hash(
                    {
                        "record": record(t).model_dump(mode="json"),
                        "context": t.context_json,
                        "plan": t.plan_json,
                        "retry_of": t.retry_of,
                        "sequence": t.sequence,
                        "lease_until": aware(t.lease_until).isoformat(),
                    }
                ),
            }
            for t in turns
        ],
        "inputs": [
            {
                "turn_id": i.turn_id,
                "step_id": i.step_id,
                "workbench_dataset_id": i.workbench_dataset_id,
                "archive_dataset_id": i.archive_dataset_id,
                "finance_release_id": i.finance_release_id,
                "issuance_id": i.issuance_id,
            }
            for i in inputs
        ],
    }
