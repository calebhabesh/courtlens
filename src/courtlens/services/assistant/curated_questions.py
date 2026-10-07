"""Legacy smoke demonstrations with B33 clarification and strict-rendering expectations."""

from collections.abc import Callable
from dataclasses import dataclass

from courtlens.api.workbench_schemas import AssistantAnswer


@dataclass
class CuratedQuestionSpec:
    id: str
    question: str
    expected_tools: list[str]
    description: str
    verify: Callable[[AssistantAnswer], tuple[bool, str]]


def verify_status(*statuses: str) -> Callable[[AssistantAnswer], tuple[bool, str]]:
    def verify(answer: AssistantAnswer) -> tuple[bool, str]:
        if answer.status not in statuses:
            return False, f"Unexpected result status {answer.status}."
        if any(
            c.verified_value is not None and not c.evidence_ref_ids for c in answer.supported_claims
        ):
            return False, "Unbound numerical claim."
        if answer.status == "answered" and (
            not answer.result_tables or not answer.reproducible_manifest
        ):
            return False, "Answered result lacks executed evidence."
        return True, "Verified typed status and server-owned results."

    return verify


CURATED_QUESTIONS = [
    CuratedQuestionSpec(
        "raptors_defenders",
        "Who are the best defenders on the Raptors?",
        [],
        "Ambiguous overall defense requires a named metric.",
        verify_status("clarification_required"),
    ),
    CuratedQuestionSpec(
        "points_forecast_explanation",
        "Explain the next-game points forecast for Scottie Barnes",
        ["forecast"],
        "Registered issuance or explicit unavailability at the pinned cutoff.",
        verify_status("answered", "no_data"),
    ),
    CuratedQuestionSpec(
        "conference_placement_deferred",
        "Who will win the Eastern Conference and what are the playoff seeds?",
        [],
        "No registered team/conference forecast.",
        verify_status("unsupported"),
    ),
    CuratedQuestionSpec(
        "player_comparison",
        "Compare Scottie Barnes and RJ Barrett under current season",
        ["compare"],
        "Aligned descriptive comparison.",
        verify_status("answered"),
    ),
    CuratedQuestionSpec(
        "scoring_leaders",
        "Who leads the league in scoring points per game?",
        ["query"],
        "Canonical SQL ranking with actual eligible count.",
        verify_status("answered", "no_data"),
    ),
    CuratedQuestionSpec(
        "metric_definition",
        "What is the formula and definition for true shooting percentage ts_pct?",
        ["definition"],
        "Catalog-owned definition.",
        verify_status("answered"),
    ),
]
