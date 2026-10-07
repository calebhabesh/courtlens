"""One tool-calling turn seam, bounded execution, retained evidence and nonblocking repair."""

from __future__ import annotations

import json
import queue
import re
import threading
import time
from collections.abc import Callable, Sequence
from contextlib import suppress
from dataclasses import dataclass
from datetime import UTC, date, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from courtload.config import Settings, get_settings
from courtload.domain.assistant_agent import (
    MARKER,
    AgentAccounting,
    AgentResultBlock,
    AgentSource,
    AgentTurnResponse,
    ProseBlock,
    ProvenanceReport,
    StepKind,
    StoredTurnRecord,
    TraceStep,
)
from courtload.domain.conversation import (
    AnalysisPlan,
    ConversationContext,
    OperationResult,
    OperationStep,
)
from courtload.domain.hybrid_assistant import AnswerAction, HybridTurnRequest
from courtload.services.assistant.agent.history import compact_history
from courtload.services.assistant.agent.limited import run_limited
from courtload.services.assistant.agent.pricing import estimate_cost
from courtload.services.assistant.agent.prompt import PROMPT_VERSION, build_prompt
from courtload.services.assistant.agent.provenance import audit_warehouse_coverage, check_provenance
from courtload.services.assistant.agent.providers import create_provider
from courtload.services.assistant.agent.providers.base import (
    AgentMessage,
    AgentProvider,
    AgentStep,
    Citation,
    DeltaCallback,
    ProviderFailure,
    ToolCall,
    ToolDeclaration,
    ToolResult,
    Usage,
    map_failure,
)
from courtload.services.assistant.agent.providers.replay import RecordingProvider, ReplayProvider
from courtload.services.assistant.agent.tools import DispatchedTool, declarations, dispatch
from courtload.services.assistant.defaults import (
    CalendarUnavailable,
    ScopeClarification,
    civil_today,
    last_completed_season,
    resolve_scope,
)
from courtload.services.assistant.execution import query_deadline
from courtload.services.assistant.page_context import (
    PLAYER_REFERENCE,
    bind_page_step,
    resolve_page_message,
)
from courtload.services.workbench_analytics import resolve_workbench_context

# This only enforces prohibited actions. There is no analytical intent router or plan validator.
PROHIBITED = re.compile(
    r"\b(?:execute|run)\s+(?:sql|python|shell|bash|code)\b|\bselect\s+\*\s+from\b|"
    r"\b(?:read|show|reveal|print|give|expose)\b.{0,60}"
    r"\b(?:api[ _-]?key|secrets?|env|credentials|config)\b|"
    r"\b(?:refresh|import|publish|rollback)\s+(?:the\s+)?(?:data|release|snapshot|warehouse)\b|"
    r"\b(?:winner|win|winning)\s+probabilit|"
    r"\b(?:betting picks?|start[ /-]sit|should I (?:start|sit|bench))\b",
    re.I,
)
MAX_TOOLS_PER_STEP = 6
# Faulty adapters cannot hold up a turn or permit overlapping late transports.
_PROVIDER_SLOT = threading.Lock()


@dataclass(frozen=True)
class AgentRun:
    response: AgentTurnResponse
    transcript: dict[str, Any]


StepCallback = Callable[[StepKind, str], None]


def _bounded_step(
    provider: RecordingProvider,
    prompt: str,
    messages: Sequence[AgentMessage],
    tools: Sequence[ToolDeclaration],
    *,
    timeout: float,
    output_tokens: int,
    searches: int,
    on_delta: DeltaCallback | None,
) -> AgentStep:
    if timeout <= 0:
        raise ProviderFailure("provider_timeout")
    if not _PROVIDER_SLOT.acquire(blocking=False):
        raise ProviderFailure("provider_busy")
    results: queue.Queue[AgentStep | Exception] = queue.Queue(maxsize=1)
    live = threading.Event()
    live.set()

    def delta(text: str) -> None:
        if live.is_set() and on_delta:
            on_delta(text)

    def work() -> None:
        try:
            results.put(
                provider.step(
                    prompt,
                    messages,
                    tools,
                    timeout_seconds=timeout,
                    max_output_tokens=output_tokens,
                    remaining_web_searches=searches,
                    on_delta=delta if on_delta else None,
                )
            )
        except Exception as exc:
            results.put(exc)
        finally:
            _PROVIDER_SLOT.release()

    threading.Thread(target=work, daemon=True, name="courtlens-agent-provider").start()
    try:
        result = results.get(timeout=timeout)
    except queue.Empty:
        if provider.records:
            provider.records[-1].failure = "provider_timeout"
        raise ProviderFailure("provider_timeout") from None
    finally:
        live.clear()
    if isinstance(result, Exception):
        # Exact replay drift remains a hard test failure, not an adapter failure.
        if isinstance(result, ValueError):
            raise result
        failure = map_failure(result)
        if provider.records:
            provider.records[-1].failure = failure.kind
            provider.records[-1].retry_after = failure.retry_after
        raise failure
    return result


def _selections(
    session: Session,
    request: HybridTurnRequest,
    inherited: ConversationContext | None,
    today: date,
    deadline: float,
) -> tuple[ConversationContext, dict[str, str]]:
    base = (inherited or ConversationContext()).model_dump()
    if request.page_context:
        base.update(request.page_context.selections.model_dump(exclude_unset=True))
    if request.context:
        base.update(request.context.model_dump(exclude_unset=True))
    base.setdefault("season", None)
    if base["season"] is None:
        base["season"] = last_completed_season(today)
    selections = ConversationContext.model_validate(base)
    with suppress(ScopeClarification):
        selections = resolve_scope(request.message, selections, as_of=today).selections
    bindings: dict[str, str] = {}
    try:
        with session.begin_nested(), query_deadline(session, deadline):
            # Pin the published release once for all tools; tool scope stays model-selectable.
            context = resolve_workbench_context(
                session,
                release_id=selections.release_id,
                requested_season=selections.season,
                requested_phase=selections.phase,
            )
            selections = selections.model_copy(update={"release_id": context.release_id})
            with suppress(ScopeClarification, ValueError):
                _, bindings = resolve_page_message(
                    session, context, request.message, request.page_context
                )
    except HTTPException as exc:
        if exc.status_code not in (404, 503):
            raise
    except (DBAPIError, TimeoutError):
        return selections, {}
    return selections, bindings


def _page_call(call: ToolCall, bindings: dict[str, str]) -> ToolCall:
    args = dict(call.arguments)
    if call.name == "lookup_entity" and bindings.get("player_id"):
        query = args.get("query")
        if isinstance(query, str) and PLAYER_REFERENCE.fullmatch(query):
            args["query"] = bindings["player_id"]
    elif call.name == "query_stats" and isinstance(args.get("arguments"), dict):
        step = bind_page_step(
            OperationStep(
                step_id="agent_tool",
                operation=args.get("operation", "unknown"),
                arguments=args["arguments"],
            ),
            bindings,
        )
        args["arguments"] = step.arguments
    return call.model_copy(update={"arguments": args})


def _parts(text: str) -> tuple[str, str | None, list[str]]:
    assumption = None
    follow_ups: list[str] = []
    prose = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.lower().startswith("assumption:"):
            assumption = stripped.split(":", 1)[1].strip()[:500] or None
        elif stripped.lower().startswith("follow-up:"):
            chip = stripped.split(":", 1)[1].strip()[:200]
            if chip and chip not in follow_ups and len(follow_ups) < 3:
                follow_ups.append(chip)
        else:
            prose.append(line)
    return "\n".join(prose).strip(), assumption, follow_ups


def _tool_sources(
    tool: DispatchedTool, sources: list[AgentSource], today: date
) -> list[AgentSource]:
    result = tool.warehouse_result
    if result:
        source = AgentSource(
            source_id=f"s{len(sources) + 1}",
            origin="warehouse",
            title="CourtLens: " + result.operation,
            publisher="CourtLens",
            url=result.open_url,
            operation_hash=result.operation_hash,
            retrieved_at=datetime.now(UTC),
        )
    else:
        raw = tool.full_payload.get("source")
        if not isinstance(raw, dict):
            return []
        source = AgentSource(
            source_id=f"s{len(sources) + 1}",
            origin="external" if tool.result.name == "awards" else "knowledge",
            title=raw["title"],
            publisher=raw["publisher"],
            url=raw.get("url"),
            excerpt=raw.get("excerpt", ""),
            content_sha256=raw.get("content_sha256"),
            retrieved_at=datetime.now(UTC),
        )
    existing = next(
        (
            s
            for s in sources
            if s.operation_hash == source.operation_hash
            and s.url == source.url
            and s.title == source.title
        ),
        None,
    )
    if existing:
        return [existing]
    sources.append(source)
    return [source]


def _web_sources(
    text: str,
    citations: Sequence[Citation],
    sources: list[AgentSource],
) -> str:
    sources[:] = [s.model_copy(update={"span": None}) for s in sources]
    insertions: dict[int, list[str]] = {}
    current: list[AgentSource] = []
    for ref in citations:
        if not ref.url.startswith("https://"):
            continue
        valid_span = ref.span if ref.span and 0 <= ref.span[0] < ref.span[1] <= len(text) else None
        source = AgentSource(
            source_id=f"s{len(sources) + 1}",
            origin="web",
            title=ref.title,
            publisher=ref.publisher,
            url=ref.url,
            retrieved_at=ref.retrieved_at,
            excerpt=(ref.cited_text or "")[:24000],
            span=valid_span,
        )
        sources.append(source)
        current.append(source)
        if valid_span:
            insertions.setdefault(valid_span[1], []).append("[^" + source.source_id + "]")
    # Insert native markers at grounding boundaries, retaining character offsets.
    for offset in sorted(insertions, reverse=True):
        text = text[:offset] + "".join(insertions[offset]) + text[offset:]
    for source in current:
        if source.span:
            start, end = source.span
            shift_start = sum(sum(map(len, v)) for p, v in insertions.items() if p <= start)
            shift_end = sum(sum(map(len, v)) for p, v in insertions.items() if p < end)
            replacement = source.model_copy(update={"span": (start + shift_start, end + shift_end)})
            sources[sources.index(source)] = replacement
    return text


def _remap_spans(original: str, answer: str, sources: list[AgentSource]) -> list[AgentSource]:
    remapped = []
    for source in sources:
        span = None
        if source.span:
            segment = original[source.span[0] : source.span[1]]
            offset = answer.find(segment)
            if segment and offset >= 0 and answer.find(segment, offset + 1) < 0:
                span = (offset, offset + len(segment))
        remapped.append(source.model_copy(update={"span": span}))
    return remapped


def _provenance(
    text: str,
    assumption: str | None,
    results: Sequence[OperationResult],
    sources: Sequence[AgentSource],
    *,
    repaired: bool = False,
    contexts: dict[str, dict[str, Any] | None] | None = None,
) -> ProvenanceReport:
    report = check_provenance(text, results, sources, repaired=repaired, contexts=contexts)
    if assumption:
        extra = check_provenance(
            assumption, results, [s.model_copy(update={"span": None}) for s in sources]
        )
        report = report.model_copy(
            update={
                "bound_numbers": [*report.bound_numbers, *extra.bound_numbers],
                "cited_numbers": [*report.cited_numbers, *extra.cited_numbers],
                "unsupported_numbers": [*report.unsupported_numbers, *extra.unsupported_numbers],
                "assumption_unverified": bool(extra.unsupported_numbers),
                "warehouse_override_missed": report.warehouse_override_missed
                + extra.warehouse_override_missed,
            }
        )
    return report


def run_turn(
    session: Session,
    request: HybridTurnRequest,
    *,
    provider: AgentProvider | None = None,
    settings: Settings | None = None,
    history: Sequence[StoredTurnRecord] = (),
    inherited: ConversationContext | None = None,
    previous_plan: AnalysisPlan | None = None,
    turn_id: UUID | None = None,
    today: date | None = None,
    on_step: StepCallback | None = None,
    on_delta: DeltaCallback | None = None,
    on_reset: Callable[[], None] | None = None,
) -> AgentRun:
    settings = settings or get_settings()
    today = today or civil_today()
    started = time.monotonic()
    deadline = started + settings.assistant_turn_timeout_seconds
    turn_id = turn_id or uuid4()
    request = request.model_copy(update={"thread_id": request.thread_id or uuid4()})
    assert request.thread_id is not None
    sources: list[AgentSource] = []
    results: list[OperationResult] = []
    result_contexts: dict[str, dict[str, Any] | None] = {}
    tools_run: list[dict[str, Any]] = []
    trace: list[TraceStep] = []
    usage = Usage()
    steps = calls = 0
    stopped: str | None = None
    recording: RecordingProvider | None = None
    final_text = ""
    assumption: str | None = None
    chips: list[str] = []
    selections = inherited or ConversationContext()
    draft_visible = False

    def reset_draft(*, force: bool = False) -> None:
        nonlocal draft_visible
        if (draft_visible or force) and on_reset:
            on_reset()
        draft_visible = False

    def finish(answer: AgentTurnResponse) -> AgentRun:
        if answer.mode == "limited" and answer.results and not tools_run:
            tools_run.extend({"limited_result": b.model_dump(mode="json")} for b in answer.results)
        if isinstance(provider, ReplayProvider):
            provider.verify_tools(tools_run)
        accounting = answer.accounting.model_copy(
            update={
                "provider": settings.resolved_assistant_provider
                if provider is None
                else type(provider).__name__,
                "model": recording.model if recording else answer.accounting.model,
                "steps": steps,
                "provider_calls": calls,
                "web_searches": usage.web_searches,
                "input_tokens": usage.input_tokens,
                "output_tokens": usage.output_tokens,
                "est_cost_usd": estimate_cost(
                    settings.assistant_prices_file,
                    recording.model if recording else answer.accounting.model,
                    usage,
                    today=today,
                ),
                "elapsed_ms": (time.monotonic() - started) * 1000,
                "stopped_by_limit": stopped,
                "token_overshoot": max(0, usage.total_tokens - settings.assistant_max_tokens),
                "web_search_overshoot": max(
                    0, usage.web_searches - settings.assistant_max_web_searches
                ),
            }
        )
        answer = answer.model_copy(update={"accounting": accounting})
        transcript = {
            "format": "courtlens-agent-transcript-v1",
            "prompt_version": PROMPT_VERSION,
            "model": accounting.model,
            "steps": [r.model_dump(mode="json") for r in recording.records] if recording else [],
            "tools": tools_run,
        }
        return AgentRun(
            AgentTurnResponse.model_validate(answer.model_dump(mode="json")), transcript
        )

    def base(text: str, status: str = "answered") -> AgentTurnResponse:
        return AgentTurnResponse(
            request_id=request.request_id,
            thread_id=request.thread_id,
            turn_id=turn_id,
            status=status,
            answer=ProseBlock(text=text),
            sources=sources,
            results=[
                AgentResultBlock(result=r, context=result_contexts.get(r.operation_hash))
                for r in results
            ],
            saveable=status == "answered" and bool(results),
            selections=selections,
            accounting=AgentAccounting(
                provider=settings.resolved_assistant_provider,
                model=settings.resolved_assistant_model,
                prompt_version=PROMPT_VERSION,
            ),
        )

    if PROHIBITED.search(request.message):
        return finish(
            base(
                "I cannot execute code, expose secrets, change data, "
                "or give betting or start/sit verdicts.",
                "refused",
            )
        )
    try:
        selections, page_bindings = _selections(session, request, inherited, today, deadline)
        prompt = build_prompt(
            today=today,
            selections=selections,
            page_context=request.page_context,
            page_bindings=page_bindings,
        )
    except CalendarUnavailable:
        answer = base(
            "The verified NBA season calendar needs an update before I can resolve this question.",
            "failed",
        )
        return finish(answer.model_copy(update={"failure": "calendar_unavailable"}))
    if provider is None and not settings.assistant_configured:
        return finish(
            run_limited(
                session,
                request,
                selections=selections,
                today=today,
                deadline=deadline,
                previous_plan=previous_plan,
                page_bindings=page_bindings,
                turn_id=turn_id,
            )
        )
    recording = RecordingProvider(provider or create_provider(settings))
    messages = [*compact_history(history), AgentMessage(role="user", text=request.message)]
    declared = declarations()
    retried_busy = False

    def step(*, final: bool = False) -> AgentStep:
        nonlocal steps, calls, retried_busy, usage
        remaining = deadline - time.monotonic()
        # Bound output by remaining allowance; finalization is the one explicit extra call.
        output_tokens = max(
            1, min(4096 if not final else 1024, settings.assistant_max_tokens - usage.total_tokens)
        )
        if on_step:
            on_step(
                "writing" if final else "thinking",
                "Writing the answer" if final else "Considering sources",
            )
        for attempt in range(2):
            # A new model attempt replaces any preliminary tool commentary or failed draft.
            reset_draft()
            writing = False

            def delta(text: str) -> None:
                nonlocal writing, draft_visible
                if not text:
                    return
                if not writing and not final and on_step:
                    on_step("writing", "Writing the answer")
                writing = True
                draft_visible = True
                if on_delta:
                    on_delta(text)

            steps += 1
            calls += 1
            try:
                response = _bounded_step(
                    recording,
                    prompt,
                    messages,
                    [] if final else declared,
                    timeout=remaining,
                    output_tokens=output_tokens,
                    searches=0
                    if final
                    else max(0, settings.assistant_max_web_searches - usage.web_searches),
                    on_delta=delta if on_delta else None,
                )
                calls += response.provider_calls - 1
                usage = Usage(
                    **{
                        key: getattr(usage, key) + getattr(response.usage, key)
                        for key in Usage.model_fields
                    }
                )
                return response
            except ProviderFailure as exc:
                if (
                    exc.kind != "provider_busy"
                    or retried_busy
                    or attempt
                    or (not final and steps >= settings.assistant_max_steps)
                ):
                    raise
                retried_busy = True
                remaining = deadline - time.monotonic()
        raise AssertionError("unreachable")

    try:
        for _ in range(settings.assistant_max_steps):
            if time.monotonic() >= deadline:
                stopped = "timeout"
                break
            if usage.total_tokens >= settings.assistant_max_tokens:
                stopped = "tokens"
                break
            if steps >= settings.assistant_max_steps:
                stopped = "steps"
                break
            response = step()
            messages.extend(response.as_messages())
            for completed in response.completed_tool_results:
                tools_run.append({"native_result": completed.model_dump(mode="json")})
            if response.usage.web_searches:
                if on_step:
                    # Native SDKs report search usage on completion, not before dispatch.
                    on_step("search", "Web search completed")
                trace.append(
                    TraceStep(
                        tool="web_search",
                        status="ok",
                        elapsed_ms=0,
                        hits=len(response.citations),
                        arguments={"searches": response.usage.web_searches},
                    )
                )
            # Earlier-step grounding is evidence snippets only; spans refer to earlier prose.
            if response.tool_calls:
                _web_sources(
                    "", [c.model_copy(update={"span": None}) for c in response.citations], sources
                )
            for index, call in enumerate(response.tool_calls):
                tool_start = time.monotonic()
                if on_step:
                    on_step("tool", "Querying CourtLens: " + call.name)
                if index >= MAX_TOOLS_PER_STEP:
                    tool = DispatchedTool(
                        ToolResult(
                            call_id=call.id,
                            name=call.name,
                            payload={"error": {"code": "tool_budget", "recoverable": True}},
                            is_error=True,
                        ),
                        {},
                    )
                else:
                    try:
                        call = _page_call(call, page_bindings)
                    except ValueError:
                        tool = DispatchedTool(
                            ToolResult(
                                call_id=call.id,
                                name=call.name,
                                is_error=True,
                                payload={
                                    "error": {
                                        "code": "page_referent",
                                        "recoverable": True,
                                        "message": "Use the server-resolved page identity.",
                                        "bindings": page_bindings,
                                    }
                                },
                            ),
                            {},
                        )
                    else:
                        tool = dispatch(
                            session, call, selections=selections, as_of=today, deadline=deadline
                        )
                if tool.warehouse_result:
                    if selections.release_id is None and tool.context:
                        selections = selections.model_copy(
                            update={"release_id": tool.context.release_id}
                        )
                    result = tool.warehouse_result.model_copy(
                        update={"step_id": f"agent_{len(results) + 1}"}
                    )
                    if not any(r.operation_hash == result.operation_hash for r in results):
                        results.append(result)
                        result_contexts[result.operation_hash] = (
                            tool.context.to_dict()
                            if tool.context
                            else tool.full_payload.get("scope")
                        )
                refs = _tool_sources(tool, sources, today)
                model_result = tool.result.model_copy(
                    update={
                        "payload": {
                            **tool.result.payload,
                            "answer_sources": [
                                s.model_dump(mode="json", exclude={"retrieved_at"}) for s in refs
                            ],
                        }
                    }
                )
                messages.append(AgentMessage(role="tool", tool_results=[model_result]))
                tools_run.append(
                    {
                        "call": call.model_dump(mode="json"),
                        "result": model_result.model_dump(mode="json"),
                        "full_payload": tool.full_payload,
                        "warehouse_result": tool.warehouse_result.model_dump(mode="json")
                        if tool.warehouse_result
                        else None,
                    }
                )
                trace.append(
                    TraceStep(
                        tool=call.name,
                        arguments=call.arguments,
                        status="error" if tool.result.is_error else "ok",
                        elapsed_ms=(time.monotonic() - tool_start) * 1000,
                        rows=len(tool.warehouse_result.rows) if tool.warehouse_result else 0,
                    )
                )
            if (
                response.search_limit_reached
                or usage.web_searches >= settings.assistant_max_web_searches > 0
            ):
                stopped = "searches"
            if usage.total_tokens >= settings.assistant_max_tokens:
                stopped = "tokens"
            if not response.tool_calls:
                final_text = _web_sources(response.text, response.citations, sources)
                break
            if stopped:
                break
        else:
            stopped = "steps"
        if stopped and stopped != "timeout":
            messages.append(
                AgentMessage(
                    role="user",
                    text="Stopped at the "
                    + stopped
                    + " limit. Give a final answer from retained evidence only, "
                    "with no tools or searches. State the limitation.",
                )
            )
            response = step(final=True)
            final_text = _web_sources(response.text, response.citations, sources)
            messages.extend(response.as_messages())
        original = final_text
        final_text, assumption, chips = _parts(final_text)
        sources = _remap_spans(original, final_text, sources)
        known = {s.source_id for s in sources}
        final_text = MARKER.sub(lambda m: m[0] if m[1] in known else "", final_text)
        if assumption:
            assumption = MARKER.sub(lambda m: m[0] if m[1] in known else "", assumption)
        if not final_text:
            final_text = "The available sources did not supply an answer within this turn's limits."
        report = _provenance(final_text, assumption, results, sources, contexts=result_contexts)
        if report.unsupported_numbers and time.monotonic() < deadline:
            reset_draft(force=True)
            messages.append(
                AgentMessage(
                    role="user",
                    text="These numbers have no source: "
                    + ", ".join(report.unsupported_numbers)
                    + ". Cite them from retained sources or remove them. "
                    "One repair only; no tools or searches. Available source markers: "
                    + json.dumps([s.model_dump(mode="json") for s in sources]),
                )
            )
            try:
                response = step(final=True)
            except ProviderFailure as exc:
                # Provenance repair never discards a sourced answer or blocks publication.
                response = AgentStep(text=final_text)
                report = report.model_copy(update={"repaired": True})
                trace.append(
                    TraceStep(
                        tool="provenance_repair",
                        status="error",
                        arguments={"failure": exc.kind},
                        elapsed_ms=0,
                    )
                )
            else:
                # Prior spans cannot ground rewritten prose. Snippets remain usable.
                sources = [s.model_copy(update={"span": None}) for s in sources]
                repaired_text = _web_sources(response.text, response.citations, sources)
                original = repaired_text
                repaired_text, repaired_assumption, repaired_chips = _parts(repaired_text)
                sources = _remap_spans(original, repaired_text, sources)
                repaired_text = MARKER.sub(
                    lambda m: m[0] if m[1] in {s.source_id for s in sources} else "", repaired_text
                )
                if repaired_text:
                    final_text = repaired_text
                    assumption = repaired_assumption or assumption
                    if assumption:
                        assumption = MARKER.sub(
                            lambda m: m[0] if m[1] in {s.source_id for s in sources} else "",
                            assumption,
                        )
                    chips = repaired_chips or chips
                report = _provenance(
                    final_text,
                    assumption,
                    results,
                    sources,
                    repaired=True,
                    contexts=result_contexts,
                )
    except ProviderFailure as failure:
        reset_draft()
        if results:
            # Already executed evidence survives a provider outage without a second SQL run.
            answer = base(
                "I retained the CourtLens observations shown below before "
                + failure.kind.replace("_", " ")
                + " stopped the answer."
            )
            answer = answer.model_copy(
                update={
                    "mode": "limited",
                    "failure": failure.kind,
                    "retry_after": failure.retry_after,
                    "trace": trace,
                    "actions": [
                        AnswerAction(
                            kind="executed_operation",
                            label="Open equivalent analysis",
                            url=r.open_url,
                            operation_hash=r.operation_hash,
                        )
                        for r in results
                        if r.open_url
                    ],
                    "follow_ups": ["Review these observations", "Explain the metric methodology"],
                }
            )
            return finish(answer)
        return finish(
            run_limited(
                session,
                request,
                selections=selections,
                today=today,
                deadline=deadline,
                previous_plan=previous_plan,
                page_bindings=page_bindings,
                failure=failure,
                turn_id=turn_id,
            )
        )
    if stopped:
        final_text += "\n\nStopped at the " + stopped + " limit."
    report = _provenance(
        final_text, assumption, results, sources, repaired=report.repaired, contexts=result_contexts
    )
    if time.monotonic() < deadline and any(s.origin == "web" for s in sources):
        audit_start = time.monotonic()
        overrides, audits = audit_warehouse_coverage(
            session, final_text, sources, selections, today=today, deadline=deadline
        )
        if audits:
            report = report.model_copy(
                update={
                    "warehouse_override_missed": max(report.warehouse_override_missed, overrides)
                }
            )
            for audit in audits:
                tools_run.append({"provenance_coverage_audit": audit.full_payload})
                trace.append(
                    TraceStep(
                        tool="warehouse_coverage_audit",
                        status="error" if audit.result.is_error else "ok",
                        arguments=audit.warehouse_result.arguments
                        if audit.warehouse_result
                        else {},
                        elapsed_ms=(time.monotonic() - audit_start) * 1000,
                    )
                )
    if len(chips) < 2:
        chips = [*chips, "Show the warehouse evidence", "Explain the metric methodology"][:3]
    actions = [
        AnswerAction(
            kind="executed_operation",
            label="Open equivalent analysis",
            url=r.open_url,
            operation_hash=r.operation_hash,
        )
        for r in results
        if r.open_url
    ]
    status = "refused" if final_text.startswith("Refusal:") else "answered"
    answer = base(final_text, status).model_copy(
        update={
            "assumption": assumption,
            "follow_ups": chips,
            "results": [
                AgentResultBlock(result=r, context=result_contexts.get(r.operation_hash))
                for r in results
            ],
            "sources": sources,
            "actions": actions,
            "trace": trace,
            "provenance": report,
            "saveable": status == "answered" and bool(results),
        }
    )
    return finish(answer)
