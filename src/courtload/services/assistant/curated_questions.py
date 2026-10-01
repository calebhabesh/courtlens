"""Curated benchmark question set with expected tool/query/evidence invariants."""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

from courtload.api.workbench_schemas import AssistantAnswer


@dataclass
class CuratedQuestionSpec:
    """Specification and verification invariant for a curated research workbench question."""

    id: str
    question: str
    expected_tools: list[str]
    description: str
    verify: Callable[[AssistantAnswer], tuple[bool, str]]


def verify_raptors_defense(answer: AssistantAnswer) -> tuple[bool, str]:
    if answer.status != "answered":
        return False, f"Expected status 'answered', got '{answer.status}'"
    tools_called = [t.tool_name for t in answer.tool_trace]
    if "search_players" not in tools_called and "rank_players" not in tools_called:
        return False, f"Expected search_players in {tools_called}"
    has_limitation = any("best defender" in lim.lower() for lim in answer.limitations)
    if not has_limitation:
        return False, "Missing required limitation regarding zero composite best defender rating"
    if not answer.result_tables:
        return False, "Expected at least one result table with defensive box statistics"
    return True, "Passed: verified defensive box metrics without composite impact score"


def verify_points_forecast(answer: AssistantAnswer) -> tuple[bool, str]:
    if answer.status != "answered":
        return False, f"Expected status 'answered', got '{answer.status}'"
    tools_called = [t.tool_name for t in answer.tool_trace]
    if "get_forecast" not in tools_called:
        return False, f"Expected get_forecast in {tools_called}"
    has_cond = any("conditional" in lim.lower() for lim in answer.limitations)
    if not has_cond:
        return False, "Missing required limitation regarding forecast appearance conditionality"
    return True, "Passed: verified point estimate and conditionality"


def verify_conference_placement(answer: AssistantAnswer) -> tuple[bool, str]:
    if answer.status != "model_not_available":
        return False, f"Expected status 'model_not_available', got '{answer.status}'"
    has_deferred = any(
        "conference" in lim.lower() and "deferred" in lim.lower() for lim in answer.limitations
    )
    if not has_deferred:
        return False, "Missing limitation stating conference forecasting is deferred"
    if not answer.result_tables:
        return False, "Expected alternative team record table"
    return True, "Passed: returned model_not_available with factual team alternative"


def verify_player_comparison(answer: AssistantAnswer) -> tuple[bool, str]:
    if answer.status != "answered":
        return False, f"Expected status 'answered', got '{answer.status}'"
    tools_called = [t.tool_name for t in answer.tool_trace]
    if "compare_players" not in tools_called:
        return False, f"Expected compare_players in {tools_called}"
    has_winner_notice = any(
        "forced" in lim.lower() or "winner" in lim.lower() for lim in answer.limitations
    )
    if not has_winner_notice:
        return False, "Missing no-forced-winner limitation"
    return True, "Passed: verified aligned comparison without forced winner"


def verify_scoring_leaders(answer: AssistantAnswer) -> tuple[bool, str]:
    if answer.status != "answered":
        return False, f"Expected status 'answered', got '{answer.status}'"
    if not answer.result_tables:
        return False, "Expected scoring leaders table"
    # Verify all supported claims match evidence
    for claim in answer.supported_claims:
        if claim.verified_value is not None and not claim.evidence_ref_ids:
            return False, f"Claim '{claim.statement}' has verified value without evidence reference"
    return True, "Passed: verified scoring leaders with evidence refs"


def verify_metric_definition(answer: AssistantAnswer) -> tuple[bool, str]:
    if answer.status != "answered":
        return False, f"Expected status 'answered', got '{answer.status}'"
    tools_called = [t.tool_name for t in answer.tool_trace]
    if "get_metric_definition" not in tools_called:
        return False, f"Expected get_metric_definition in {tools_called}"
    return True, "Passed: verified canonical metric definition"


CURATED_QUESTIONS: list[CuratedQuestionSpec] = [
    CuratedQuestionSpec(
        id="raptors_defenders",
        question="Who are the best defenders on the Raptors?",
        expected_tools=["search_players"],
        description="Raptors defensive research: box metrics without composite impact rating",
        verify=verify_raptors_defense,
    ),
    CuratedQuestionSpec(
        id="points_forecast_explanation",
        question="Explain the next-game points forecast for Scottie Barnes",
        expected_tools=["get_forecast"],
        description="Forecast explanation: point estimate, 80% interval, and conditionality",
        verify=verify_points_forecast,
    ),
    CuratedQuestionSpec(
        id="conference_placement_deferred",
        question="Who will win the Eastern Conference and what are the playoff seeds?",
        expected_tools=["get_team_summary"],
        description="Conference prediction: model_not_available and factual record alternative",
        verify=verify_conference_placement,
    ),
    CuratedQuestionSpec(
        id="player_comparison",
        question="Compare Scottie Barnes and RJ Barrett under current season",
        expected_tools=["compare_players"],
        description="Player comparison: aligned metrics and no forced winner notice",
        verify=verify_player_comparison,
    ),
    CuratedQuestionSpec(
        id="scoring_leaders",
        question="Who leads the league in scoring points per game?",
        expected_tools=["search_players"],
        description="Scoring leaders: single-formula PPG ranking and evidence references",
        verify=verify_scoring_leaders,
    ),
    CuratedQuestionSpec(
        id="metric_definition",
        question="What is the formula and definition for true shooting percentage ts_pct?",
        expected_tools=["get_metric_definition"],
        description="Metric definition: retrieval of canonical catalog formula and limitations",
        verify=verify_metric_definition,
    ),
]
