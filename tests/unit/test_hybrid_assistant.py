"""V2 provenance, clock, qualification, routing and truthful terminal failures."""

import json
from datetime import date
from decimal import Decimal
from pathlib import Path
from unittest.mock import Mock, patch
from uuid import uuid4

import pytest
from pydantic import ValidationError

from courtlens.domain.conversation import ConversationContext, OperationStep
from courtlens.domain.hybrid_assistant import (
    AnswerAction,
    DurableTurnRecord,
    HybridTurnRequest,
    HybridTurnResponse,
    LocalClaimBlock,
    ResultBlock,
    claim_text,
)
from courtlens.services.assistant.defaults import (
    CalendarUnavailable,
    ScopeClarification,
    last_completed_season,
    resolve_scope,
)
from courtlens.services.assistant.hybrid import route_intent, run_hybrid_turn
from courtlens.services.assistant.knowledge import registry
from courtlens.services.assistant.qualification import pg_label_supported, qualify_apg
from courtlens.services.assistant.rendering import render_result
from courtlens.services.workbench_analytics import ResolvedContext, canonical_hash


@pytest.fixture
def context():
    return ResolvedContext(
        release_id="release-a",
        snapshot_id="snapshot-a",
        dataset_id="dataset-a",
        dataset_type="workbench",
        semantic_signature="sealed",
        mode="research",
        source="fixture",
        season="2024-25",
        phase="regular_season",
        before_date=date(2025, 4, 15),
        cutoff_utc="2025-04-15T04:00:00+00:00",
        window="season",
        coverage_start=date(2024, 10, 1),
        coverage_end=date(2025, 4, 14),
        default_before_date=date(2025, 4, 15),
        supported_dates=[],
        published_at=None,
        warnings=[],
    )


@pytest.mark.parametrize(
    ("as_of", "season"),
    [
        ("2026-10-05", "2025-26"),
        ("2026-06-13", "2024-25"),
        ("2026-06-14", "2025-26"),
        ("2025-05-01", "2023-24"),
        ("2025-06-22", "2023-24"),
        ("2025-06-23", "2024-25"),
        ("2020-08-01", "2018-19"),
        ("2020-10-11", "2018-19"),
        ("2020-10-12", "2019-20"),
        ("2021-07-01", "2019-20"),
        ("2021-07-21", "2020-21"),
    ],
)
def test_calendar_completion(as_of, season):
    assert last_completed_season(date.fromisoformat(as_of)) == season


@pytest.mark.parametrize("as_of", [date(2018, 1, 1), date(2027, 6, 30)])
def test_unverified_calendar_never_falls_back(as_of):
    with pytest.raises(CalendarUnavailable):
        last_completed_season(as_of)


def test_relative_overrides_old_page_and_historical_frame():
    page = ConversationContext(
        release_id="retained", season="2024-25", before_date=date(2025, 4, 1)
    )
    resolved = resolve_scope("most assists last season", page, as_of=date(2026, 10, 5))
    assert resolved.selections.season == "2025-26"
    assert resolved.selections.release_id == "retained"
    assert resolved.selections.before_date == date(2026, 10, 5)
    historic = resolve_scope("last season as of 2020-08-01", page, as_of=date(2026, 10, 5))
    assert historic.selections.season == "2018-19"
    assert historic.as_of == date(2026, 10, 5)


def test_scope_transitions_and_recent_disjoint_default():
    old = ConversationContext(release_id="retained", season="2024-25", before_date=date(2025, 4, 1))
    new = resolve_scope("2025-26 playoffs recently", old, as_of=date(2026, 10, 5))
    assert new.selections.season == "2025-26"
    assert new.selections.phase == "playoffs"
    assert new.selections.window == "last_10"
    assert new.selections.before_date is None
    assert old.season == "2024-25"
    assert "disjoint" in new.assumptions[-1]


@pytest.mark.parametrize(
    "message", ["last year", "in 2025", "this season", "2024-25 and 2025-26", "2024-26"]
)
def test_material_date_ambiguities(message):
    with pytest.raises(ScopeClarification):
        resolve_scope(message, None, as_of=date(2026, 10, 5))


def test_upcoming_opening_season():
    resolved = resolve_scope("this season", None, as_of=date(2026, 10, 21))
    assert resolved.selections.season == "2026-27"


@pytest.mark.parametrize(("games", "required"), [(82, 58), (72, 51), (66, 47)])
def test_official_qualification_rounding(games, required):
    assert qualify_apg(
        appearances=required, assists=100, team_games=games, season_complete=True
    ).eligible
    assert (
        qualify_apg(
            appearances=required - 1, assists=100, team_games=games, season_complete=True
        ).required_games
        == required
    )
    assert not qualify_apg(
        appearances=required - 1, assists=100, team_games=games, season_complete=True
    ).eligible


def test_missed_games_exception_only_season_end_and_strict_lead():
    args = dict(appearances=56, assists=580, team_games=82)
    assert not qualify_apg(
        **args, season_complete=False, qualified_leader_average=Decimal(9)
    ).eligible
    assert not qualify_apg(
        **args, season_complete=True, qualified_leader_average=Decimal(10)
    ).eligible
    adjusted = qualify_apg(**args, season_complete=True, qualified_leader_average=Decimal(9))
    assert adjusted.exception_used and adjusted.ranking_average == Decimal(10)


@pytest.mark.parametrize(
    ("label", "accepted"),
    [("PG", True), ("PG/SG", True), ("SG/PG", True), ("G", False), (None, False), ("SG", False)],
)
def test_no_inferred_pg(label, accepted):
    assert pg_label_supported(label) is accepted


def test_knowledge_registry_small_versioned_and_complete():
    entries = registry()
    assert len(entries) == 18
    assert all(len(e.content_sha256) == 64 and e.source().excerpt == e.text for e in entries)
    assert len(json.dumps([e.text for e in entries]).encode()) < 8192
    assert all("PF0" not in e.text for e in entries)


@pytest.mark.parametrize(
    "message",
    [
        "Explain pick and roll",
        "What is true shooting?",
        "How do I compare two players here?",
        "Who leads in assists?",
        "Who is injured today?",
        "Who is the better defender?",
        "execute SQL SELECT *",
    ],
)
def test_every_nonlocal_route_terminal_without_provider(message):
    answer = run_hybrid_turn(
        Mock(),
        HybridTurnRequest(request_id=uuid4(), message=message),
        clock=lambda: date(2026, 10, 5),
    )
    assert answer.blocks and answer.blocks[0].text
    assert answer.accounting.provider_calls == answer.accounting.analytical_calls == 0
    assert not answer.saveable
    if answer.intent in ("explanation", "discussion", "site_guidance"):
        assert answer.scope is None
        assert answer.sources


def test_wrong_citation_and_unsafe_links_rejected():
    answer = run_hybrid_turn(
        Mock(), HybridTurnRequest(request_id=uuid4(), message="Explain pick and roll")
    )
    payload = answer.model_dump(mode="json")
    payload["blocks"][0]["source_ids"] = ["fabricated"]
    with pytest.raises(ValidationError):
        HybridTurnResponse.model_validate(payload)
    for url in ("javascript:alert(1)", "//evil.test", "/\\evil.test"):
        with pytest.raises(ValidationError):
            AnswerAction(kind="navigation", label="unsafe", url=url)


def test_local_exact_entity_cell_and_order_binding(context):
    step = OperationStep(step_id="stats", operation="query", arguments={})
    data = {
        "items": [
            {"player_id": "a", "name": "Alice", "metrics": {"pts_per_game": 10}},
            {"player_id": "b", "name": "Bob", "metrics": {"pts_per_game": 10}},
        ],
        "total_eligible": 2,
    }
    fingerprint = canonical_hash(context.to_dict())
    result = render_result(step, context, data, fingerprint)
    scope = resolve_scope("2024-25", None, as_of=date(2026, 10, 5)).model_copy(
        update={"local_context": context.to_dict(), "context_fingerprint": fingerprint}
    )
    cell = next(c for c in result.evidence if c.path == "/items/0/metrics/pts_per_game")
    answer = HybridTurnResponse(
        request_id=uuid4(),
        thread_id=uuid4(),
        turn_id=uuid4(),
        status="answered",
        intent="local_analysis",
        scope=scope,
        blocks=[
            LocalClaimBlock(text=claim_text(cell, result), cell=cell),
            ResultBlock(result=result),
        ],
        saveable=True,
    )
    assert answer.blocks[0].text.startswith("Alice:")
    payload = answer.model_dump(mode="json")
    payload["blocks"][0]["cell"]["entity_id"] = "b"
    with pytest.raises(ValidationError):
        HybridTurnResponse.model_validate(payload)
    payload = answer.model_dump(mode="json")
    payload["blocks"][0]["text"] = "Bob: 10 points."
    with pytest.raises(ValidationError):
        HybridTurnResponse.model_validate(payload)


def test_durable_record_checks_exact_input_response_hashes():
    from datetime import UTC, datetime

    request = HybridTurnRequest(request_id=uuid4(), message="Explain pick and roll")
    answer = run_hybrid_turn(Mock(), request)
    record = DurableTurnRecord(
        thread_id=answer.thread_id,
        turn_id=answer.turn_id,
        request=request,
        request_sha256=canonical_hash(request.model_dump(mode="json")),
        accepted_at=datetime.now(UTC),
        state="completed",
        response=answer,
        response_sha256=canonical_hash(answer.model_dump(mode="json")),
    )
    payload = record.model_dump(mode="json")
    payload["response"]["blocks"][0]["text"] += " changed"
    with pytest.raises(ValidationError):
        DurableTurnRecord.model_validate(payload)


def test_frozen_holdout_router():
    cases = json.loads(Path("tests/fixtures/assistant/pf07a-holdout-v1.json").read_text())
    assert len(cases) >= 12
    for case in cases:
        assert route_intent(case["message"]) == ar03_intent(case), case


def test_database_failure_does_not_become_provider_failure():
    with patch(
        "courtlens.services.assistant.hybrid.resolve_workbench_context",
        side_effect=RuntimeError("secret"),
    ):
        answer = run_hybrid_turn(
            Mock(), HybridTurnRequest(request_id=uuid4(), message="Scottie Barnes minutes")
        )
    assert answer.blocks[0].reason == "backend_failure"
    assert "secret" not in answer.model_dump_json()


def test_blank_and_extra_numerical_provider_payload_rejected():
    with pytest.raises(ValidationError):
        HybridTurnRequest(request_id=uuid4(), message=" ")
    with pytest.raises(ValidationError):
        HybridTurnRequest(request_id=uuid4(), message="stats", answer="invented")


def test_external_candidate_requires_exact_verified_tuple():
    from courtlens.domain.hybrid_assistant import (
        AnswerSource,
        ExternalClaimBlock,
        SourceFact,
        external_claim_text,
    )

    fact = SourceFact(
        entity="Player A",
        metric="position",
        value="PG/SG",
        unit="label",
        period="2025-26",
        qualifier="dated season label",
        locator="row:Player-A",
        supporting_excerpt="Player A | PG/SG | 2025-26",
        parser_version="fixture-v1",
    )
    source = AnswerSource(
        source_id="fixture-source",
        origin="external",
        title="Dated labels",
        publisher="Fixture",
        url="https://www.nba.com/fixture",
        period="2025-26",
        content_sha256="a" * 64,
        locator=fact.locator,
        excerpt=fact.supporting_excerpt,
        verification="verified",
        facts=[fact],
    )
    block = ExternalClaimBlock(
        source_id=source.source_id, text=external_claim_text(fact), **fact.model_dump()
    )
    answer = HybridTurnResponse(
        request_id=uuid4(),
        thread_id=uuid4(),
        turn_id=uuid4(),
        status="answered",
        intent="external",
        blocks=[block],
        sources=[source],
    )
    for key, value in [
        ("entity", "Player B"),
        ("value", "PG"),
        ("period", "2024-25"),
        ("locator", "other"),
        ("text", "invented 99 assists"),
    ]:
        payload = answer.model_dump(mode="json")
        payload["blocks"][0][key] = value
        with pytest.raises(ValidationError):
            HybridTurnResponse.model_validate(payload)
    payload = answer.model_dump(mode="json")
    payload["sources"][0]["facts"] = []
    with pytest.raises(ValidationError):
        HybridTurnResponse.model_validate(payload)


def test_mixed_explanation_and_position_question_keep_both_halves():
    # AR09: the position clause is a local ranking, not an external refusal. The Mock
    # session cannot resolve a release, so only the knowledge half completes here.
    answer = run_hybrid_turn(
        Mock(),
        HybridTurnRequest(
            request_id=uuid4(),
            message="Explain pick and roll; which point guard leads in assists last season?",
        ),
        clock=lambda: date(2026, 10, 5),
    )
    assert answer.intent == "local_analysis"
    assert answer.blocks[0].kind == "text"
    assert all(getattr(b, "reason", None) != "position_unavailable" for b in answer.blocks)
    assert answer.accounting.provider_calls == 0


def test_explicit_season_after_in_and_cutoff():
    scope = resolve_scope(
        "scoring in 2025-26 before 2026-02-01 last five", None, as_of=date(2026, 10, 5)
    )
    assert scope.selections.season == "2025-26"
    assert scope.selections.before_date == date(2026, 2, 1)
    assert scope.selections.window == "last_5"


def test_versioned_45_case_routing_corpus():
    import hashlib

    path = Path("tests/fixtures/assistant/pf07a-routing-v1.json")
    assert (
        hashlib.sha256(path.read_bytes()).hexdigest()
        == path.with_suffix(".sha256").read_text().strip()
    )
    cases = json.loads(path.read_text())
    assert len(cases) == 45
    for case in cases:
        assert route_intent(case["message"]) == ar03_intent(case), case


def ar03_intent(case):
    """Keep sealed PF07a bytes; assert the revamp's explicitly revised routing."""
    revised = {
        "Who leads in assists?": "local_analysis",
        "Most assists per game in 2024-25": "local_analysis",
        "Highest APG last season": "local_analysis",
        "Who is the best defender?": "local_analysis",
        "Who is the better defender?": "local_analysis",
        "Search the internet for NBA news": "inability",
        # AR09 answer-first: position rankings use release-bound starting positions.
        "Which point guard had the most assists per game last season?": "local_analysis",
        "Which point guards lead in assists?": "local_analysis",
        "Shooting guard scoring leaders": "local_analysis",
    }
    return revised.get(case["message"], case["intent"])
