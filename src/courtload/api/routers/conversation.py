"""Versioned assistant namespace; active state never writes analytical datasets."""

from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from courtload.database import get_db
from courtload.domain.conversation import (
    ConversationTurnRequest,
    ConversationTurnResponse,
    SaveConversationRequest,
)
from courtload.domain.saved_conversation import (
    SavedConversationDetail,
    SavedConversationReproduction,
    SavedConversationSummary,
)
from courtload.services.assistant.conversations import clear_conversation, run_conversation_turn
from courtload.services.assistant.operations import declarations
from courtload.services.assistant.saved import (
    export_saved,
    get_saved,
    list_saved,
    reproduce_saved,
    save_conversation,
)

router = APIRouter(prefix="/workbench/assistant", tags=["conversational analytics"])


@router.get("/operations")
def get_operations() -> list[dict[str, object]]:
    return declarations()


@router.post("/turn", response_model=ConversationTurnResponse)
def post_turn(
    request: ConversationTurnRequest, session: Session = Depends(get_db)
) -> ConversationTurnResponse:
    return run_conversation_turn(session, request)


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
