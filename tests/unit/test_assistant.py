"""Unit tests for CourtLens analytical assistant service, tools, and evidence ledger.

Verifies:
1. Tool argument schemas and input validation (injection prevention, identifier patterns).
2. Evidence ledger recording, retrieval, and cell ref matching.
3. Assistant loop budget enforcement (max rounds, question limit, disabled key status).
4. Guardrails and domain boundaries (no win probabilities, conference forecasting deferred,
   defense limited to box-score totals, appearance conditionality).
5. Offline fixture provider execution of curated benchmark inquiries.
"""

from __future__ import annotations

import os
from unittest.mock import patch

import pytest
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from courtlens.api.workbench_schemas import AssistantQueryRequest
from courtlens.config import Settings
from courtlens.database import Base
from courtlens.services.assistant.curated_questions import CURATED_QUESTIONS
from courtlens.services.assistant.provider import OfflinePlanFixtureProvider
from courtlens.services.assistant.service import (
    MAX_QUESTION_LENGTH,
    get_assistant_status,
    run_assistant_query,
)
from courtlens.services.assistant.tools import (
    ALLOWLISTED_TOOLS,
    ASSISTANT_TOOL_DECLARATIONS,
    ComparePlayersArgs,
    EvidenceLedger,
    GetPlayerProfileArgs,
    SearchRankPlayersArgs,
)


@pytest.fixture
def postgres_session():
    url = os.getenv("COURTLENS_TEST_POSTGRES_URL")
    if not url:
        if os.getenv("CI") or os.getenv("COURTLENS_REQUIRE_POSTGRES_TESTS"):
            pytest.fail("COURTLENS_TEST_POSTGRES_URL must be configured")
        pytest.skip("COURTLENS_TEST_POSTGRES_URL is not configured")
    engine = create_engine(url)
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        yield session
    engine.dispose()


def test_tool_declarations_allowlisted():
    """Verify tool declarations strictly match allowlisted tools."""
    declared_names = {t["name"] for t in ASSISTANT_TOOL_DECLARATIONS}
    assert declared_names.issubset(ALLOWLISTED_TOOLS.keys())
    assert len(declared_names) == 8
    assert "get_catalog" in declared_names
    assert "get_metric_definition" in declared_names
    assert "search_players" in declared_names
    assert "get_player_profile" in declared_names
    assert "get_team_summary" in declared_names
    assert "compare_players" in declared_names
    assert "get_forecast" in declared_names
    assert "get_evaluation_summary" in declared_names


def test_tool_argument_validation_and_injection_prevention():
    """Verify input validation rejects SQL injection patterns or malformed parameters."""
    # 1. SearchRankPlayersArgs rejects malicious sort_metric or invalid limit
    with pytest.raises(ValidationError):
        SearchRankPlayersArgs(sort_metric="pts; DROP TABLE users;")

    with pytest.raises(ValidationError):
        SearchRankPlayersArgs(sort_direction="invalid_direction")

    # 2. ComparePlayersArgs rejects malicious identifiers
    with pytest.raises(ValidationError):
        ComparePlayersArgs(player_a="1630567' OR 1=1 --", player_b="1628369")

    # 3. GetPlayerProfileArgs rejects invalid window or dates
    with pytest.raises(ValidationError):
        GetPlayerProfileArgs(player_id="1630567", window="invalid_window")

    with pytest.raises(ValidationError):
        GetPlayerProfileArgs(player_id="1630567", before_date="not-a-date")

    # 4. Valid args succeed
    valid_search = SearchRankPlayersArgs(sort_metric="pts_per_game", limit=25)
    assert valid_search.sort_metric == "pts_per_game"
    assert valid_search.limit == 25


def test_evidence_ledger_registration_and_lookup():
    """Verify EvidenceLedger registers typed cells and supports matching."""
    ledger = EvidenceLedger()
    ref1_id = ledger.add(
        entity_type="player",
        entity_id="1630567",
        entity_name="Scottie Barnes",
        field_name="pts_per_game",
        raw_value=19.9,
        formatted_value="19.9 PPG",
        source_tool="search_players",
        metric="pts_per_game",
    )
    assert ref1_id.startswith("ev_1")
    cell1 = ledger.get(ref1_id)
    assert cell1 is not None
    assert cell1.ref_id == ref1_id
    assert cell1.raw_value == 19.9

    ref2_id = ledger.add(
        entity_type="team",
        entity_id="1610612761",
        entity_name="Toronto Raptors",
        field_name="record",
        raw_value="25-57",
        formatted_value="25-57",
        source_tool="get_team_summary",
    )
    assert ref2_id.startswith("ev_2")
    assert len(ledger.all_cells()) == 2

    assert ledger.get(ref1_id) == cell1
    assert ledger.get("unknown") is None


def test_assistant_question_length_and_empty_validation():
    """Verify input validation enforces question length <= 2000 chars and non-empty."""
    req_too_long = "a" * (MAX_QUESTION_LENGTH + 1)
    with pytest.raises(ValidationError):
        AssistantQueryRequest(question=req_too_long)

    req_empty = ""
    with pytest.raises(ValidationError):
        AssistantQueryRequest(question=req_empty)


def test_assistant_status_when_disabled():
    """Verify get_assistant_status correctly reports disabled when API key is missing."""
    with patch("courtlens.services.assistant.service.get_settings") as mock_settings:
        mock_settings.return_value = Settings(_env_file=None, assistant_provider="none")
        status = get_assistant_status()
        assert status.configured is False
        assert "query" in status.allowed_tools and "similarity" in status.allowed_tools


def test_assistant_query_when_disabled(postgres_session: Session):
    """Verify run_assistant_query returns typed disabled answer when key is unset."""
    with (
        patch("courtlens.services.assistant.service.get_settings") as mock_settings,
        patch("courtlens.services.assistant.conversations.get_settings") as conversation_settings,
    ):
        mock_settings.return_value.gemini_api_key = None
        mock_settings.return_value.gemini_model = "gemini-2.5-flash"
        conversation_settings.return_value = mock_settings.return_value
        answer = run_assistant_query(
            session=postgres_session,
            question="Who leads the league in scoring?",
        )
        assert answer.status == "disabled"
        assert "disabled" in answer.interpretation.lower()
        assert answer.error_detail is not None
        assert "not configured" in answer.error_detail.lower()


def test_curated_questions_offline_verification(postgres_session: Session):
    """Verify all 6 curated benchmark inquiries pass under OfflineFixtureAssistantProvider."""
    provider = OfflinePlanFixtureProvider()

    for spec in CURATED_QUESTIONS:
        answer = run_assistant_query(
            session=postgres_session,
            question=spec.question,
            provider=provider,
        )
        passed, msg = spec.verify(answer)
        assert passed, f"Curated question '{spec.id}' failed verification: {msg}"
        # Invariants:
        assert len(answer.tool_trace) <= 8
        assert answer.interpretation != ""
        if answer.status == "answered":
            assert answer.reproducible_manifest is not None
            assert "manifest_sha256" in answer.reproducible_manifest
        if answer.explorer_query:
            assert answer.explorer_query.target_url.startswith("/")
