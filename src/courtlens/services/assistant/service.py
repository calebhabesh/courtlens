"""Compatible assistant facade backed by the strict conversational execution path."""

from __future__ import annotations

import json
from typing import Any, cast
from uuid import uuid4

from sqlalchemy.orm import Session

from courtlens.api.workbench_schemas import (
    AssistantAnswer,
    AssistantStatusResponse,
    AssistantToolCallTrace,
    EvidenceCellRef,
    ExplorerQuery,
    ResultTable,
    ResultTableColumn,
    SupportedClaim,
)
from courtlens.config import get_settings
from courtlens.domain.conversation import ConversationContext, ConversationTurnRequest
from courtlens.services.assistant.agent.prompt import PROMPT_VERSION
from courtlens.services.assistant.conversations import run_conversation_turn
from courtlens.services.assistant.operations import REGISTRY
from courtlens.services.assistant.planner import GeminiPlanProvider, PlanningOutput, PlanProvider
from courtlens.services.assistant.provider import AssistantProvider, GeminiAssistantProvider
from courtlens.services.assistant.rendering import observed_claims

MAX_QUESTION_LENGTH = 2000
MAX_TOOL_ROUNDS = 4
MAX_TOOL_CALLS = 8
MAX_TOTAL_ROWS = 200
REQUEST_DEADLINE_SECONDS = 45.0


def get_assistant_status() -> AssistantStatusResponse:
    settings = get_settings()
    configured = settings.assistant_configured
    return AssistantStatusResponse(
        configured=configured,
        model=settings.resolved_assistant_model,
        provider=settings.resolved_assistant_provider,
        limited_mode=not configured,
        prompt_version=PROMPT_VERSION,
        limits={
            "max_steps": settings.assistant_max_steps,
            "max_web_searches": settings.assistant_max_web_searches,
            "max_tokens": settings.assistant_max_tokens,
            "turn_timeout_seconds": settings.assistant_turn_timeout_seconds,
            "max_question_chars": 2000,
            "max_rounds": 1,
            "max_calls": 8,
            "max_rows_per_call": 100,
            "max_total_rows": 200,
            "timeout_seconds": 45,
            "provider_timeout_seconds": 20,
            "provider_payload_bytes": 65536,
            "conversation_expiry_seconds": 1800,
        },
        allowed_tools=list(REGISTRY),
        privacy_notice=(
            "Questions, selected page context and bounded analytical results are sent "
            "to the configured provider. Native search sends queries through that provider. "
            "Threads stay in this local installation until deleted. Provider retention "
            "and data-use terms depend on your account configuration."
        ),
        setup_instructions=(
            "Set COURTLENS_GEMINI_API_KEY, COURTLENS_ANTHROPIC_API_KEY or "
            "COURTLENS_OPENAI_API_KEY in the server .env. Select a provider with "
            "COURTLENS_ASSISTANT_PROVIDER. Provider quotas and pricing apply."
        ),
    )


class LegacyPlanningAdapter:
    """Accept legacy fixture tool requests, but never their tables, prose, or numerical claims."""

    def __init__(self, provider: AssistantProvider) -> None:
        self.provider = provider

    def plan(self, payload: str, *, timeout_seconds: float) -> PlanningOutput:
        from courtlens.services.assistant.tools import ASSISTANT_TOOL_DECLARATIONS

        request = json.loads(payload)
        result = self.provider.generate(
            messages=[{"role": "user", "content": request["message"]}],
            system_prompt="Propose only read-only analytical operations. Return no findings.",
            tools=ASSISTANT_TOOL_DECLARATIONS,
        )
        mapping = {
            "get_metric_definition": "definition",
            "search_players": "query",
            "rank_players": "query",
            "get_player_profile": "profile",
            "compare_players": "compare",
            "get_team_summary": "team",
            "get_forecast": "forecast",
        }
        steps = []
        for index, (name, raw_args) in enumerate(result.tool_calls):
            args = dict(raw_args)
            if name not in mapping:
                return PlanningOutput({"status": "unsupported", "clarification": "capability"})
            if name == "get_metric_definition":
                args = {"metric": args.get("metric_key")}
            elif name in ("search_players", "rank_players"):
                from courtlens.domain.query_url import deserialize_params_to_query

                permitted = {
                    "name",
                    "team_id",
                    "min_games",
                    "min_minutes",
                    "min_avg_minutes",
                    "sort_metric",
                    "sort_direction",
                    "limit",
                    "season",
                    "phase",
                    "before_date",
                    "window",
                }
                if set(args) - permitted:
                    return PlanningOutput({"status": "unsupported", "clarification": "capability"})
                params = {**request["context"], **args}
                args = deserialize_params_to_query(params).model_dump(mode="json")
            steps.append(
                {"step_id": f"step_{index}", "operation": mapping[name], "arguments": args}
            )
        if not steps:
            return PlanningOutput({"status": "unsupported", "clarification": "capability"})
        return PlanningOutput({"steps": steps})


def run_assistant_query(
    session: Session,
    question: str,
    user_context: dict[str, Any] | None = None,
    provider: AssistantProvider | PlanProvider | None = None,
) -> AssistantAnswer:
    if not question.strip() or len(question) > MAX_QUESTION_LENGTH:
        raise ValueError("Question must contain 1-2,000 characters.")
    request = ConversationTurnRequest(
        message=question,
        request_id=uuid4(),
        context=ConversationContext.model_validate(user_context) if user_context else None,
    )
    planner: PlanProvider | None = None
    if isinstance(provider, GeminiAssistantProvider):
        planner = GeminiPlanProvider(provider.api_key, provider.model)
    elif provider is not None:
        planner = (
            cast(PlanProvider, provider)
            if hasattr(provider, "plan")
            else LegacyPlanningAdapter(provider)
        )
    result = run_conversation_turn(session, request, planner)
    tables = []
    for operation in result.results:
        keys = list(dict.fromkeys(key for row in operation.rows for key in row))
        tables.append(
            ResultTable(
                title=operation.operation.replace("_", " ").title(),
                columns=[ResultTableColumn(key=k, label=k.replace("_", " ")) for k in keys],
                rows=operation.rows,
                row_count=len(operation.rows),
            )
        )
    first_link = next((r.open_url for r in result.results if r.open_url), None)
    manifest = result.manifest
    return AssistantAnswer(
        status=result.status,
        resolved_context=result.context,
        interpretation=result.interpretation,
        tool_trace=[
            AssistantToolCallTrace(
                round=1,
                tool_name=r.operation,
                arguments=r.arguments,
                status="success",
                result_summary="Validated server analytical result.",
                execution_ms=0,
            )
            for r in result.results
        ],
        evidence_refs=[
            EvidenceCellRef(
                ref_id=c.evidence_id,
                entity_type="analytical_cell",
                entity_id=c.entity_id,
                entity_name=c.entity_id,
                field_name=c.path,
                metric=c.metric,
                raw_value=c.value,
                formatted_value=str(c.value) if c.value is not None else "Unknown",
                source_tool=r.operation,
            )
            for r in result.results
            for c in r.evidence
        ],
        supported_claims=[
            SupportedClaim(
                statement=c["statement"],
                evidence_ref_ids=[c["evidence_id"]],
                subject=c["entity_id"],
                metric=c["metric"],
                verified_value=c["value"],
                unit=c["unit"],
            )
            for r in result.results
            for c in observed_claims(r)
        ],
        result_tables=tables,
        limitations=result.limitations,
        explorer_query=ExplorerQuery(view="analytical_operation", target_url=first_link, params={})
        if first_link
        else None,
        narrative=result.interpretation,
        reproducible_manifest=manifest,
        error_detail="Gemini key is not configured." if result.status == "disabled" else None,
    )
