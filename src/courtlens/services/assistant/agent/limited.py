"""Labelled no-key/failure mode over the preserved rule planner and typed dispatcher."""

import time
from datetime import date
from uuid import UUID, uuid4

from sqlalchemy.orm import Session

from courtlens.domain.assistant_agent import (
    AgentAccounting,
    AgentResultBlock,
    AgentTurnResponse,
    ProseBlock,
    TraceStep,
)
from courtlens.domain.conversation import AnalysisPlan, ConversationContext
from courtlens.domain.hybrid_assistant import AnswerAction, HybridTurnRequest
from courtlens.services.assistant.agent.prompt import PROMPT_VERSION
from courtlens.services.assistant.agent.providers.base import ProviderFailure, ToolCall
from courtlens.services.assistant.agent.tools import dispatch
from courtlens.services.assistant.rule_planner import rule_plan

EXAMPLES = [
    "Show scoring leaders last season",
    "Compare Scottie Barnes and Luka Dončić",
    "Show guards ranked by scoring",
]


def run_limited(
    session: Session,
    request: HybridTurnRequest,
    *,
    selections: ConversationContext,
    today: date,
    deadline: float,
    previous_plan: AnalysisPlan | None = None,
    page_bindings: dict[str, str] | None = None,
    failure: ProviderFailure | None = None,
    turn_id: UUID | None = None,
) -> AgentTurnResponse:
    trace = []
    result_blocks = []
    actions = []
    answer = "I can only answer simple stat questions in limited mode."
    status = "answered"
    plan = request.plan
    if plan is None:
        try:
            planned = rule_plan(session, request.message, previous_plan, page_bindings)
            plan = planned.plan if planned else None
        except (ValueError, RuntimeError):
            plan = None
    if plan and plan.status == "execute":
        for step in plan.steps:
            started = time.monotonic()
            tool = dispatch(
                session,
                ToolCall(
                    id=step.step_id,
                    name="query_stats",
                    arguments={
                        "operation": step.operation,
                        "arguments": step.arguments,
                        **selections.model_dump(mode="json", exclude={"release_id", "window"}),
                    },
                ),
                selections=selections,
                as_of=today,
                deadline=deadline,
            )
            trace.append(
                TraceStep(
                    tool=tool.result.name,
                    arguments=step.arguments,
                    status="error" if tool.result.is_error else "ok",
                    elapsed_ms=(time.monotonic() - started) * 1000,
                    rows=len(tool.warehouse_result.rows) if tool.warehouse_result else 0,
                )
            )
            if tool.warehouse_result:
                result = tool.warehouse_result.model_copy(update={"step_id": step.step_id})
                result_blocks.append(
                    AgentResultBlock(
                        result=result,
                        context=tool.context.to_dict()
                        if tool.context
                        else tool.full_payload.get("scope"),
                    )
                )
                if result.open_url:
                    actions.append(
                        AnswerAction(
                            kind="executed_operation",
                            label="Open equivalent analysis",
                            url=result.open_url,
                            operation_hash=result.operation_hash,
                        )
                    )
            else:
                answer = "The requested warehouse observations are unavailable in limited mode."
        if result_blocks:
            names = []
            for block in result_blocks:
                row = block.result.rows[0] if block.result.rows else {}
                name = row.get("name", row.get("player_name"))
                if name:
                    names.append(str(name))
            answer = "The selected observations are shown below with their sample and scope." + (
                " Leading returned player: " + ", ".join(names) + "." if names else ""
            )
    if failure:
        answer += " Limited mode after " + failure.kind.replace("_", " ") + "."
        if not result_blocks:
            status = "failed"
    return AgentTurnResponse(
        request_id=request.request_id,
        thread_id=request.thread_id or uuid4(),
        turn_id=turn_id if isinstance(turn_id, UUID) else uuid4(),
        status=status,
        mode="limited",
        answer=ProseBlock(text=answer),
        results=result_blocks,
        actions=actions,
        trace=trace,
        follow_ups=EXAMPLES,
        selections=selections,
        saveable=bool(result_blocks),
        failure=failure.kind if failure else None,
        retry_after=failure.retry_after if failure else None,
        accounting=AgentAccounting(
            provider="none", model="rule-planner", prompt_version=PROMPT_VERSION
        ),
    )
