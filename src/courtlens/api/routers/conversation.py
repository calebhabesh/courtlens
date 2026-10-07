"""Versioned assistant namespace; active state never writes analytical datasets."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from courtlens.api.routers.workbench import verify_workspace_operator_access
from courtlens.database import get_db
from courtlens.domain.assistant_agent import AgentHistoryPage, StoredTurnRecord, TurnResponse
from courtlens.domain.conversation import (
    ConversationTurnRequest,
    ConversationTurnResponse,
    SaveConversationRequest,
)
from courtlens.domain.hybrid_assistant import (
    DurableThreadHeader,
    HybridTurnRequest,
    ThreadHistoryPage,
)
from courtlens.domain.saved_conversation import (
    SavedConversationDetail,
    SavedConversationReproduction,
    SavedConversationSummary,
)
from courtlens.services.assistant.conversations import clear_conversation, run_conversation_turn
from courtlens.services.assistant.history import (
    cancel_turn,
    claim_turn,
    create_thread,
    delete_history,
    list_threads,
    list_turns,
    run_durable_turn,
)
from courtlens.services.assistant.operations import declarations
from courtlens.services.assistant.saved import (
    export_saved,
    get_saved,
    list_saved,
    reproduce_saved,
    save_conversation,
)
from courtlens.services.assistant.streaming import stream_turn

router = APIRouter(prefix="/workbench/assistant", tags=["conversational analytics"])


@router.get("/operations")
def get_operations() -> list[dict[str, object]]:
    return declarations()


@router.post("/turn", response_model=ConversationTurnResponse)
def post_turn(
    request: ConversationTurnRequest, session: Session = Depends(get_db)
) -> ConversationTurnResponse:
    return run_conversation_turn(session, request)


@router.post("/v2/turn", response_model=TurnResponse)
def post_hybrid_turn(
    request: HybridTurnRequest,
    session: Session = Depends(get_db),
    _auth: None = Depends(verify_workspace_operator_access),
) -> TurnResponse:
    """Accept durably before execution; retransmissions replay the exact retained response."""
    return run_durable_turn(session, request)


@router.post(
    "/v2/turn/stream",
    response_class=StreamingResponse,
    responses={200: {"content": {"text/event-stream": {}}}},
)
def post_hybrid_turn_stream(
    request: HybridTurnRequest,
    session: Session = Depends(get_db),
    _auth: None = Depends(verify_workspace_operator_access),
) -> StreamingResponse:
    """AR05 SSE view of the same durable turn. Acceptance errors stay plain HTTP statuses."""
    claimed = claim_turn(session, request)
    return StreamingResponse(
        stream_turn(session, request, claimed),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"},
    )


@router.post(
    "/v2/threads",
    response_model=DurableThreadHeader,
    status_code=201,
    dependencies=[Depends(verify_workspace_operator_access)],
)
def new_thread(session: Session = Depends(get_db)) -> DurableThreadHeader:
    return create_thread(session)


@router.get("/v2/threads", response_model=ThreadHistoryPage)
def threads(
    limit: int = Query(20, ge=1, le=100),
    cursor: UUID | None = None,
    session: Session = Depends(get_db),
) -> ThreadHistoryPage:
    return list_threads(session, limit, cursor)


@router.get("/v2/threads/{thread_id}/turns", response_model=AgentHistoryPage)
def turns(
    thread_id: UUID,
    limit: int = Query(20, ge=1, le=100),
    cursor: int = Query(0, ge=0),
    session: Session = Depends(get_db),
) -> AgentHistoryPage:
    return list_turns(session, thread_id, limit, cursor)


@router.post(
    "/v2/threads/{thread_id}/turns/{turn_id}/cancel",
    response_model=StoredTurnRecord,
    dependencies=[Depends(verify_workspace_operator_access)],
)
def stop_turn(
    thread_id: UUID, turn_id: UUID, session: Session = Depends(get_db)
) -> StoredTurnRecord:
    return cancel_turn(session, thread_id, turn_id)


@router.delete("/v2/threads/{thread_id}", dependencies=[Depends(verify_workspace_operator_access)])
def remove_thread(thread_id: UUID, session: Session = Depends(get_db)) -> dict[str, bool]:
    return delete_history(session, thread_id)


@router.delete("/v2/threads", dependencies=[Depends(verify_workspace_operator_access)])
def clear_history(session: Session = Depends(get_db)) -> dict[str, bool]:
    return delete_history(session)


@router.delete("/conversations/{conversation_id}")
def delete_conversation(conversation_id: UUID) -> dict[str, bool]:
    return {"cleared": clear_conversation(conversation_id)}


@router.post("/investigations", status_code=201, response_model=SavedConversationDetail)
def save_result(
    request: SaveConversationRequest, session: Session = Depends(get_db)
) -> dict[str, object]:
    return save_conversation(session, request)


@router.get("/investigations", response_model=list[SavedConversationSummary])
def saved_results(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=100000),
    session: Session = Depends(get_db),
) -> list[dict[str, object]]:
    return list_saved(session, limit, offset)


@router.get("/investigations/{analysis_id}", response_model=SavedConversationDetail)
def saved_result(analysis_id: UUID, session: Session = Depends(get_db)) -> dict[str, object]:
    return get_saved(session, str(analysis_id))


@router.get("/investigations/{analysis_id}/reproduce", response_model=SavedConversationReproduction)
def reproduce_result(analysis_id: UUID, session: Session = Depends(get_db)) -> dict[str, object]:
    return reproduce_saved(session, str(analysis_id))


@router.get("/investigations/{analysis_id}/export")
def export_result(
    analysis_id: UUID,
    format: Literal["json", "csv"] = "json",
    session: Session = Depends(get_db),
) -> Response:
    content, mime, filename = export_saved(session, str(analysis_id), format)
    return Response(
        content,
        media_type=mime,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "no-store",
        },
    )
