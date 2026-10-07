"""AR07 UI selections are bounded, optional and confer no analytical authority."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from courtload.domain.conversation import ConversationContext, OperationStep
from courtload.domain.hybrid_assistant import AssistantPageContext, HybridTurnRequest
from courtload.services.assistant.page_context import bind_page_step


def test_old_request_serialization_preserves_hash_input():
    request = HybridTurnRequest(request_id=uuid4(), message="Show scoring")
    assert "page_context" not in request.model_dump(mode="json")
    assert (
        HybridTurnRequest.model_validate(request.model_dump()).model_dump() == request.model_dump()
    )


@pytest.mark.parametrize(
    "changes",
    [
        {"route": "/settings"},
        {"player_ids": ["his"]},
        {"player_ids": ["2"]},
        {"player_ids": ["1", "1"]},
        {"team_ids": ["1610612761"]},
        {"route": "/compare", "player_ids": ["1"]},
    ],
)
def test_page_context_rejects_inconsistent_or_unbounded_entities(changes):
    with pytest.raises(ValidationError):
        AssistantPageContext.model_validate(
            {"route": "/players/1", "player_ids": ["1"], "selections": {}, **changes}
        )


def test_page_context_roundtrip_is_retained_with_request():
    page = AssistantPageContext(
        route="/players/1", player_ids=["1"], selections=ConversationContext(season="2024-25")
    )
    request = HybridTurnRequest(request_id=uuid4(), message="Show his profile", page_context=page)
    assert HybridTurnRequest.model_validate_json(request.model_dump_json()) == request


def test_server_binding_cannot_be_changed_by_planner():
    step = OperationStep(step_id="page", operation="profile", arguments={"player_id": "his"})
    assert bind_page_step(step, {"player_id": "1"}).arguments["player_id"] == "1"
    with pytest.raises(ValueError, match="page referent"):
        bind_page_step(
            step.model_copy(update={"arguments": {"player_id": "2"}}), {"player_id": "1"}
        )


def test_page_player_query_requires_unambiguous_canonical_predicate():
    base = OperationStep(step_id="page", operation="query", arguments={})
    with pytest.raises(ValueError, match="page player"):
        bind_page_step(base, {"player_id": "1"})
    leaf = {"field": "player_id", "op": "eq", "value": "1"}
    safe = base.model_copy(
        update={"arguments": {"predicates": {"conjunction": "and", "predicates": [leaf]}}}
    )
    assert bind_page_step(safe, {"player_id": "1"}) == safe
    unsafe = base.model_copy(
        update={
            "arguments": {
                "predicates": {
                    "conjunction": "or",
                    "predicates": [leaf, {"field": "player_id", "op": "eq", "value": "2"}],
                }
            }
        }
    )
    with pytest.raises(ValueError, match="page player"):
        bind_page_step(unsafe, {"player_id": "1"})
