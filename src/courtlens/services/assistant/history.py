"""Durable acceptance/publication for v2/v3 turns and server-owned transcripts.

Short database transactions serialize lifecycle mutations across API processes. Analytical
work runs outside the lock. A lease covering the configured turn deadline plus a publication
margin (at least 50 seconds) fences abandoned work without cancelling another worker. Expiry
is recovered on polling/acceptance, never retried implicitly. This service owns its Session
transaction boundaries.
"""

from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy import Engine, delete, inspect, select, text, true
from sqlalchemy.orm import Session

from courtlens.assistant_history_models import (
    AssistantAgentTranscript,
    AssistantThread,
    AssistantTurn,
    AssistantTurnInput,
)
from courtlens.config import get_settings
from courtlens.domain.assistant_agent import (
    RESPONSE_ADAPTER,
    AgentHistoryPage,
    AgentTurnResponse,
    StoredTurnRecord,
    TranscriptReference,
    TurnResponse,
)
from courtlens.domain.conversation import AnalysisPlan, ConversationContext, OperationStep
from courtlens.domain.hybrid_assistant import (
    DurableThreadHeader,
    HybridTurnRequest,
    HybridTurnResponse,
    InabilityBlock,
    ThreadHistoryPage,
    TurnPhase,
)
from courtlens.services.assistant.agent.loop import StepCallback, run_turn
from courtlens.services.assistant.agent.providers.base import AgentProvider
from courtlens.services.assistant.conversations import MAX_TURN_BYTES
from courtlens.services.assistant.hybrid import run_hybrid_turn
from courtlens.services.assistant.planner import PlanProvider
from courtlens.services.workbench_analytics import canonical_hash

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


def record(row: AssistantTurn) -> StoredTurnRecord:
    return StoredTurnRecord(
        thread_id=UUID(row.thread_id),
        turn_id=UUID(row.id),
        request=HybridTurnRequest.model_validate(row.request_json),
        request_sha256=row.request_sha256,
        accepted_at=aware(row.accepted_at),
        state=row.state,
        response=RESPONSE_ADAPTER.validate_python(row.response_json) if row.response_json else None,
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


def publish(session: Session, row: AssistantTurn, answer: TurnResponse) -> None:
    answer = RESPONSE_ADAPTER.validate_python(answer.model_dump(mode="json"))
    row.state = (
        "cancelled"
        if answer.status == "cancelled"
        else "failed"
        if answer.status == "failed"
        else "completed"
    )
    row.response_json = answer.model_dump(mode="json")
    row.response_sha256 = canonical_hash(row.response_json)
    if isinstance(answer, AgentTurnResponse):
        if answer.selections:
            row.context_json = answer.selections.model_dump(mode="json")
        if answer.mode == "limited" and answer.results:
            row.plan_json = AnalysisPlan(
                steps=[
                    OperationStep(
                        step_id=b.result.step_id,
                        operation=b.result.operation,
                        arguments=b.result.arguments,
                    )
                    for b in answer.results[-8:]
                ]
            ).model_dump(mode="json")
        parent = session.get(AssistantThread, row.thread_id)
        if parent:
            parent.updated_at = datetime.now(UTC)
            parent.version += 1
        for agent_block in answer.results:
            result = agent_block.result
            context = agent_block.context or result.data.get("context", {})
            finance = result.operation == "finance"
            session.add(
                AssistantTurnInput(
                    turn_id=row.id,
                    step_id=result.step_id,
                    workbench_dataset_id=context.get("dataset_id")
                    if context.get("dataset_type") == "workbench"
                    else None,
                    archive_dataset_id=context.get("dataset_id")
                    if context.get("dataset_type") == "archive"
                    else None,
                    finance_release_id=result.arguments.get("book_id") if finance else None,
                    issuance_id=result.data.get("id") if result.operation == "forecast" else None,
                )
            )
        return
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


def accept(session: Session, request: HybridTurnRequest) -> StoredTurnRecord:
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
            lease_until=now
            + timedelta(
                seconds=max(LEASE_SECONDS, get_settings().assistant_turn_timeout_seconds + 10)
            ),
            state="pending",
            context_json=inherited,
            plan_json=old_plan,
        )
        session.add(row)
        session.flush()
        return record(row)


@dataclass(frozen=True)
class ClaimedTurn:
    """This process won pending -> running; it alone executes and publishes the turn."""

    turn_id: UUID
    thread_id: UUID
    inherited: ConversationContext | None
    previous_plan: AnalysisPlan | None
    interrupted: HybridTurnResponse


def claim_turn(session: Session, request: HybridTurnRequest) -> TurnResponse | ClaimedTurn:
    """Accept durably; return a retained response, or the claim to execute it."""
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
        return ClaimedTurn(
            turn_id=accepted.turn_id,
            thread_id=accepted.thread_id,
            inherited=ConversationContext.model_validate(row.context_json)
            if row.context_json
            else None,
            previous_plan=AnalysisPlan.model_validate(row.plan_json) if row.plan_json else None,
            interrupted=terminal(row, cancelled=False),
        )


def complete_turn(
    session: Session,
    request: HybridTurnRequest,
    claimed: ClaimedTurn,
    *,
    provider: PlanProvider | None = None,
    on_phase: Callable[[TurnPhase], None] | None = None,
    agent_provider: AgentProvider | None = None,
    on_step: StepCallback | None = None,
    on_delta: Callable[[str], None] | None = None,
    on_reset: Callable[[], None] | None = None,
) -> TurnResponse:
    transcript: dict[str, Any] | None = None
    try:
        execution = request.model_copy(update={"thread_id": claimed.thread_id})
        use_agent = agent_provider is not None or (provider is None and request.plan is None)
        if use_agent:
            prior = session.scalars(
                select(AssistantTurn)
                .where(
                    AssistantTurn.thread_id == str(claimed.thread_id),
                    AssistantTurn.id != str(claimed.turn_id),
                    AssistantTurn.response_json.is_not(None),
                )
                .order_by(AssistantTurn.sequence.desc())
                .limit(8)
            ).all()
            session.rollback()
            run = run_turn(
                session,
                execution,
                inherited=claimed.inherited,
                previous_plan=claimed.previous_plan,
                history=[record(r) for r in reversed(prior)],
                provider=agent_provider,
                turn_id=claimed.turn_id,
                on_step=on_step,
                on_delta=on_delta,
                on_reset=on_reset,
            )
            transcript = run.transcript
            answer: TurnResponse = run.response.model_copy(
                update={
                    "transcript": TranscriptReference(
                        turn_id=claimed.turn_id, sha256=canonical_hash(transcript)
                    )
                }
            )
        else:
            answer = run_hybrid_turn(
                session,
                execution,
                inherited_context=claimed.inherited,
                previous_plan=claimed.previous_plan,
                provider=provider,
                on_phase=on_phase,
            ).model_copy(update={"turn_id": claimed.turn_id})
        if len(answer.model_dump_json().encode()) > MAX_TURN_BYTES:
            answer = claimed.interrupted
    except Exception:
        # No raw database/provider exceptions are retained or returned.
        answer = claimed.interrupted
    with lifecycle(session):
        recover_locked(session)
        current = session.get(AssistantTurn, str(claimed.turn_id))
        if current is None:
            raise HTTPException(404, "Thread was deleted.")
        if current.response_json:
            return record(current).response  # type: ignore[return-value]
        if isinstance(answer, AgentTurnResponse) and transcript is not None:
            session.add(
                AssistantAgentTranscript(
                    turn_id=current.id, sha256=canonical_hash(transcript), payload_json=transcript
                )
            )
        publish(session, current, answer)
        session.flush()
        return record(current).response  # type: ignore[return-value]


def run_durable_turn(
    session: Session,
    request: HybridTurnRequest,
    *,
    provider: PlanProvider | None = None,
    agent_provider: AgentProvider | None = None,
) -> TurnResponse:
    claimed = claim_turn(session, request)
    if isinstance(claimed, (HybridTurnResponse, AgentTurnResponse)):
        return claimed
    return complete_turn(
        session, request, claimed, provider=provider, agent_provider=agent_provider
    )


def cancel_turn(session: Session, thread_id: UUID, turn_id: UUID) -> StoredTurnRecord:
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
        session.execute(
            delete(AssistantAgentTranscript).where(AssistantAgentTranscript.turn_id.in_(ids))
        )
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
) -> AgentHistoryPage:
    recover_interrupted(session)
    thread = require_thread(session, thread_id)
    rows = session.scalars(
        select(AssistantTurn)
        .where(AssistantTurn.thread_id == str(thread_id), AssistantTurn.sequence > cursor)
        .order_by(AssistantTurn.sequence)
        .limit(limit + 1)
    ).all()
    return AgentHistoryPage(
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
    transcripts: dict[str, AssistantAgentTranscript] = {}
    connection = session.connection()
    if inspect(connection).has_table("assistant_agent_transcripts"):
        transcripts = {
            t.turn_id: t for t in session.scalars(select(AssistantAgentTranscript)).all()
        }
    else:
        # RN02 must back up the owner's AG02 database before upgrading its schema.
        # Only that recognized pre-transcript revision may omit the table; newer
        # databases still fail closed, as do any retained v3 transcript references below.
        schema = inspect(connection)
        revisions = (
            session.scalars(text("SELECT version_num FROM alembic_version")).all()
            if schema.has_table("alembic_version")
            else []
        )
        if revisions != ["07b810a4f005"]:
            raise ValueError("assistant transcript table missing from an unrecognized schema")
    for turn in turns:
        retained = record(turn).response
        if isinstance(retained, AgentTurnResponse) and retained.transcript:
            transcript = transcripts.get(turn.id)
            if transcript is None or retained.transcript.sha256 != transcript.sha256:
                raise ValueError("assistant transcript reference mismatch")
    for transcript in transcripts.values():
        if canonical_hash(transcript.payload_json) != transcript.sha256:
            raise ValueError("assistant transcript digest mismatch")
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
                        **(
                            {"agent_transcript": transcripts[t.id].payload_json}
                            if t.id in transcripts
                            else {}
                        ),
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
