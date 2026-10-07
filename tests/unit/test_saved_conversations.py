"""Retention request and spreadsheet export boundaries."""

from uuid import uuid4

import pytest
from pydantic import ValidationError

from courtlens.domain.conversation import SaveConversationRequest
from courtlens.services.assistant.saved import _csv_cell


def payload(**updates):
    return {
        "request_id": uuid4(),
        "conversation_id": uuid4(),
        "turn_id": uuid4(),
        "context_fingerprint": "a" * 64,
        "title": "Saved question",
        **updates,
    }


@pytest.mark.parametrize(
    "field,value",
    [
        ("results", [{"value": 999}]),
        ("plan", {"sql": "DELETE"}),
        ("question", "client substitute"),
        ("title", " \t "),
        ("title", "bad\nname"),
        ("context_fingerprint", "bad"),
    ],
)
def test_save_rejects_client_evidence_and_invalid_metadata(field, value):
    with pytest.raises(ValidationError):
        SaveConversationRequest.model_validate(payload(**{field: value}))


def test_question_retention_is_opt_in():
    assert not SaveConversationRequest.model_validate(payload()).include_question


@pytest.mark.parametrize(
    "value,expected",
    [
        ("=SUM(A1)", "'=SUM(A1)"),
        ("  @calc", "'  @calc"),
        ("+1", "'+1"),
        ("-2", "'-2"),
        ("\tformula", "'\tformula"),
        (0, "0"),
        (None, "null"),
        ("12345678901", "12345678901"),
    ],
)
def test_csv_formula_and_missingness(value, expected):
    assert _csv_cell(value) == expected
