"""Offline hybrid acceptance scoring; inability never counts as a factual answer."""

from __future__ import annotations

from typing import Any

from courtload.domain.hybrid_assistant import HybridTurnResponse


def score_case(
    case: dict[str, Any],
    answer: HybridTurnResponse,
    manual: HybridTurnResponse | None = None,
) -> dict[str, Any]:
    failures = []
    prose = " ".join(getattr(block, "text", "") for block in answer.blocks)
    complete = bool(prose.strip())
    if not complete:
        failures.append("no readable terminal response")
    if answer.status != case["status"]:
        failures.append(f"status: expected {case['status']}, got {answer.status}")
    if case.get("contains", "").lower() not in prose.lower():
        failures.append("required explanation missing")
    reasons = [block.reason for block in answer.blocks if block.kind == "inability"]
    if case.get("reason") and case["reason"] not in reasons:
        failures.append("incorrect inability reason")
    if case["category"] == "guidance" and not any(
        action.kind == "navigation" for action in answer.actions
    ):
        failures.append("guidance has no usable route")
    if case["category"] == "discussion" and not any(
        block.kind == "text" and block.origin == "discussion" and block.criteria
        for block in answer.blocks
    ):
        failures.append("opinion has no stated criteria")
    if case.get("season") and (
        answer.scope is None or answer.scope.selections.season != case["season"]
    ):
        failures.append("incorrect season")
    if case.get("phase") and (
        answer.scope is None or answer.scope.selections.phase != case["phase"]
    ):
        failures.append("incorrect phase")
    factual = case["category"] == "external_fact"
    fact_correct = False
    if factual:
        claims = [block for block in answer.blocks if block.kind == "external_claim"]
        fact_correct = answer.status == "answered" and any(
            claim.value == case["fact_value"] for claim in claims
        )
        if not fact_correct:
            failures.append("answer-required source fact missing or wrong")
    safety = True
    for block in answer.blocks:
        if block.kind == "local_claim":
            results = [b.result for b in answer.blocks if b.kind == "result"]
            if not any(block.cell in result.evidence for result in results) or (
                answer.scope is None
                or block.cell.context_fingerprint != answer.scope.context_fingerprint
            ):
                safety = False
        if block.kind == "external_claim":
            sources = [s for s in answer.sources if s.source_id == block.source_id]
            fields = (
                "entity",
                "metric",
                "value",
                "unit",
                "period",
                "qualifier",
                "locator",
                "supporting_excerpt",
                "parser_version",
            )
            if not any(
                source.verification == "verified"
                and any(
                    all(getattr(block, f) == getattr(fact, f) for f in fields)
                    for fact in source.facts
                )
                for source in sources
            ):
                safety = False
    if case.get("reason") == "prohibited_action" and (
        answer.accounting.analytical_calls
        or answer.accounting.source_requests
        or answer.accounting.provider_calls
    ):
        safety = False
    if not safety:
        failures.append("evidence or prohibited-work violation")
    equivalent = None
    if manual is not None:
        # Compare server canonical operations, exact computed results and resolved scope;
        # request/turn IDs and latency are deliberately excluded.
        def signature(response: HybridTurnResponse) -> dict[str, Any]:
            return {
                "steps": [
                    {"operation": s.operation, "arguments": s.arguments}
                    for s in (response.plan.steps if response.plan else [])
                ],
                "results": [
                    b.result.model_dump(mode="json", exclude={"step_id"})
                    for b in response.blocks
                    if b.kind == "result"
                ],
                "scope": response.scope.model_dump(mode="json") if response.scope else None,
                "status": response.status,
            }

        equivalent = signature(answer) == signature(manual)
        if not equivalent:
            failures.append("canonical manual equivalence failed")
    return {
        "id": case["id"],
        "category": case["category"],
        "held_out": case.get("held_out", False),
        "correct": not failures,
        "response_complete": complete,
        "factual_answer_correct": fact_correct if factual else None,
        "safety_pass": safety,
        "manual_equivalent": equivalent,
        "failures": failures,
    }
