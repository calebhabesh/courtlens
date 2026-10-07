"""Bounded local conversation state, pinned plans, strict renderer and request budgets."""

from __future__ import annotations

import json
import queue
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.domain.conversation import (
    AnalysisPlan,
    ConversationTurnRequest,
    ConversationTurnResponse,
    OperationResult,
    SaveConversationRequest,
)
from courtlens.domain.metrics import METRIC_CATALOG, METRIC_CATALOG_VERSION
from courtlens.domain.teams import NBA_TEAMS
from courtlens.services.assistant.execution import execute_bounded, query_deadline
from courtlens.services.assistant.operations import (
    EntityClarification,
    canonical_step,
    declarations,
    operation_hash,
)
from courtlens.services.assistant.planner import (
    PLANNER_PROMPT,
    GeminiPlanProvider,
    PlanningOutput,
    PlanProvider,
    ProviderFailure,
)
from courtlens.services.assistant.rendering import MAX_RESULT_BYTES, render_result
from courtlens.services.workbench_analytics import (
    ResolvedContext,
    canonical_hash,
    resolve_workbench_context,
)

TTL_SECONDS = 1800
MAX_CONVERSATIONS = 64
MAX_PROVIDER_BYTES = 64 * 1024
MAX_CACHE_BYTES = 8 * 1024 * 1024
MAX_TURN_BYTES = 3 * 1024 * 1024
DEADLINE_SECONDS = 45.0
PROVIDER_TIMEOUT_SECONDS = 20.0


@dataclass
class Conversation:
    context: ResolvedContext
    fingerprint: str
    touched: float
    lock: threading.Lock = field(default_factory=threading.Lock)
    exchanges: list[dict[str, Any]] = field(default_factory=list)
    requests: OrderedDict[str, tuple[str, ConversationTurnResponse]] = field(
        default_factory=OrderedDict
    )
    previous_plan: AnalysisPlan | None = None
    pending: tuple[AnalysisPlan, str, str, list[dict[str, str]]] | None = None


_state_lock = threading.Lock()
_provider_lock = threading.Lock()
_ai_turn_lock = threading.Lock()
_turns: OrderedDict[UUID, Conversation] = OrderedDict()
_initial_requests: OrderedDict[UUID, tuple[str, UUID]] = OrderedDict()
_cache: OrderedDict[str, OperationResult] = OrderedDict()
_cache_bytes = 0
_quota_until = 0.0


def clear_conversation(conversation_id: UUID) -> bool:
    """Remove local active state; saved analytical evidence is a separate explicit action."""
    with _state_lock:
        state = _turns.get(conversation_id)
        if state and state.lock.locked():
            raise HTTPException(409, "Conversation has an active turn.")
        return _turns.pop(conversation_id, None) is not None


def reset_local_state() -> None:
    """Test/process lifecycle cleanup; never resets an in-flight provider lock."""
    global _cache_bytes, _quota_until
    with _state_lock:
        _turns.clear()
        _initial_requests.clear()
        _cache.clear()
        _cache_bytes = 0
        _quota_until = 0


def retained_turn(request: SaveConversationRequest) -> tuple[ConversationTurnResponse, str | None]:
    """Copy verified state under its turn lock; saving never accepts client evidence."""
    with _state_lock:
        state = _turns.get(request.conversation_id)
        if state is None or time.monotonic() - state.touched >= TTL_SECONDS:
            raise HTTPException(410, "Active result expired or was cleared; execute it again.")
        if not state.lock.acquire(blocking=False):
            raise HTTPException(409, "A turn is running; save after it finishes.")
    try:
        if state.fingerprint != request.context_fingerprint:
            raise HTTPException(409, "The selected result context changed.")
        answer = next(
            (v[1] for v in state.requests.values() if v[1].turn_id == request.turn_id), None
        )
        if answer is None:
            raise HTTPException(410, "Selected turn is no longer retained; execute it again.")
        if (
            answer.status not in ("answered", "no_data", "insufficient_sample")
            or not answer.manifest
        ):
            raise HTTPException(422, "Only verified executed results can be saved.")
        question = next(
            (e["message"] for e in state.exchanges if e.get("turn_id") == str(request.turn_id)),
            None,
        )
        if request.include_question and question is None:
            raise HTTPException(410, "Selected question is no longer retained.")
        return answer.model_copy(deep=True), question if request.include_question else None
    finally:
        state.lock.release()


def _serialize(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)


def _resolve(session: Session, request: ConversationTurnRequest) -> tuple[UUID, Conversation]:
    now = time.monotonic()
    initial_hash = canonical_hash(
        request.model_dump(mode="json", exclude={"conversation_id", "context_fingerprint"})
    )
    with _state_lock:
        for key, item in list(_turns.items()):
            if now - item.touched >= TTL_SECONDS and not item.lock.locked():
                del _turns[key]
        for rid, (_, cid) in list(_initial_requests.items()):
            if cid not in _turns:
                del _initial_requests[rid]
        if request.conversation_id is None and request.request_id in _initial_requests:
            known_hash, known_cid = _initial_requests[request.request_id]
            if known_hash != initial_hash:
                raise HTTPException(409, "Request identity was reused with different content.")
            return known_cid, _turns[known_cid]
        if request.conversation_id:
            state = _turns.get(request.conversation_id)
            if state is None:
                raise HTTPException(
                    410, "Active conversation expired or was cleared; start a new conversation."
                )
            if request.context_fingerprint != state.fingerprint:
                raise HTTPException(
                    409, "Conversation context changed; use the returned fingerprint."
                )
            if request.context:
                requested_context = request.context.model_dump(mode="json", exclude_unset=True)
                for dimension, value in requested_context.items():
                    actual = state.context.to_dict().get(dimension)
                    if value is not None and value != actual:
                        raise HTTPException(
                            409, "Start a new conversation for an explicit context change."
                        )
            state.touched = now
            _turns.move_to_end(request.conversation_id)
            return request.conversation_id, state
    args = request.context.model_dump() if request.context else {}
    context = resolve_workbench_context(
        session,
        release_id=args.get("release_id"),
        requested_season=args.get("season"),
        requested_phase=args.get("phase"),
        requested_before_date=args.get("before_date"),
        requested_window=args.get("window"),
    )
    fingerprint = canonical_hash(context.to_dict())
    if request.context_fingerprint and request.context_fingerprint != fingerprint:
        raise HTTPException(409, "Requested context fingerprint does not match resolved inputs.")
    state = Conversation(context, fingerprint, now)
    conversation_id = uuid4()
    with _state_lock:
        if request.request_id in _initial_requests:
            known_hash, known_cid = _initial_requests[request.request_id]
            if known_hash != initial_hash:
                raise HTTPException(409, "Request identity was reused with different content.")
            if known_cid in _turns:
                return known_cid, _turns[known_cid]
        if len(_turns) >= MAX_CONVERSATIONS:
            idle = next((k for k, s in _turns.items() if not s.lock.locked()), None)
            if idle is None:
                raise HTTPException(429, "Local conversation capacity reached.")
            del _turns[idle]
        _turns[conversation_id] = state
        _initial_requests[request.request_id] = (initial_hash, conversation_id)
        while len(_initial_requests) > MAX_CONVERSATIONS:
            _initial_requests.popitem(last=False)
    return conversation_id, state


def _bounded_provider(provider: PlanProvider, payload: str, remaining: float) -> PlanningOutput:
    """Hard caller deadline, including faulty adapters. Keep the slot until transport exits."""
    if not _provider_lock.acquire(blocking=False):
        raise ProviderFailure("busy")
    output: queue.Queue[PlanningOutput | Exception] = queue.Queue(maxsize=1)
    timeout = min(PROVIDER_TIMEOUT_SECONDS, remaining)

    def call() -> None:
        try:
            output.put(provider.plan(payload, timeout_seconds=timeout))
        except Exception as exc:
            output.put(exc)
        finally:
            _provider_lock.release()

    threading.Thread(target=call, daemon=True, name="courtlens-planner").start()
    try:
        result = output.get(timeout=max(0.001, timeout))
    except queue.Empty:
        raise TimeoutError("provider deadline") from None
    if isinstance(result, Exception):
        raise result
    return result


def _get_result(key: str) -> OperationResult | None:
    with _state_lock:
        result = _cache.get(key)
        if result:
            _cache.move_to_end(key)
            return result.model_copy(deep=True)
        return None


def _put_result(key: str, result: OperationResult) -> None:
    global _cache_bytes
    size = len(result.model_dump_json().encode())
    if size > MAX_RESULT_BYTES:
        raise ValueError("analytical result byte budget exceeded")
    with _state_lock:
        if key in _cache:
            return
        while _cache and (len(_cache) >= 128 or _cache_bytes + size > MAX_CACHE_BYTES):
            _, previous = _cache.popitem(last=False)
            _cache_bytes -= len(previous.model_dump_json().encode())
        _cache[key] = result.model_copy(deep=True)
        _cache_bytes += size


CLARIFICATIONS = {
    "consistency": "Choose scoring variability, minutes variability, or threshold frequency.",
    "defense_metric": "Choose a named admitted defensive metric and its sample definition.",
    "floor_or_game": "Choose on-court exposure or observed whole-game participation.",
    "context": "Confirm the requested context by starting a new conversation with those inputs.",
    "identity": "Choose a canonical player identity.",
    "capability": "This request needs a capability or filter absent from the registered operation.",
}


def run_conversation_turn(
    session: Session, request: ConversationTurnRequest, provider: PlanProvider | None = None
) -> ConversationTurnResponse:
    start = time.monotonic()
    with query_deadline(session, start + DEADLINE_SECONDS):
        return _resolved_turn(session, request, provider, start)


def _resolved_turn(
    session: Session, request: ConversationTurnRequest, provider: PlanProvider | None, start: float
) -> ConversationTurnResponse:
    cid, state = _resolve(session, request)
    if not state.lock.acquire(blocking=False):
        return ConversationTurnResponse(
            status="busy",
            conversation_id=cid,
            turn_id=uuid4(),
            context=state.context.to_dict(),
            context_fingerprint=state.fingerprint,
            interpretation="A turn is already running in this conversation.",
        )
    ai_slot = request.plan is None and request.clarification_choice is None
    if ai_slot and not _ai_turn_lock.acquire(blocking=False):
        state.lock.release()
        return ConversationTurnResponse(
            status="busy",
            conversation_id=cid,
            turn_id=uuid4(),
            context=state.context.to_dict(),
            context_fingerprint=state.fingerprint,
            interpretation="Another AI investigation is running. Manual tools remain available.",
        )
    try:
        return _run_conversation_turn(session, request, provider, cid, state, start)
    finally:
        if ai_slot:
            _ai_turn_lock.release()
        state.lock.release()


def _run_conversation_turn(
    session: Session,
    request: ConversationTurnRequest,
    provider: PlanProvider | None,
    cid: UUID,
    state: Conversation,
    start: float,
) -> ConversationTurnResponse:
    global _quota_until
    deadline = start + DEADLINE_SECONDS
    if not request.message.strip():
        raise HTTPException(422, "Message must contain text.")
    answer = ConversationTurnResponse(
        status="unsupported",
        conversation_id=cid,
        turn_id=uuid4(),
        context=state.context.to_dict(),
        context_fingerprint=state.fingerprint,
        interpretation="The request could not be executed against the pinned inputs.",
    )
    request_hash = canonical_hash(
        request.model_dump(mode="json", exclude={"conversation_id", "context_fingerprint"})
    )
    provider_calls = 0
    calls = 0
    cache_hits = 0
    rows = 0
    usage: dict[str, int] = {}
    try:
        previous = state.requests.get(str(request.request_id))
        if previous:
            if previous[0] != request_hash:
                raise HTTPException(409, "Request identity was reused with different content.")
            return previous[1].model_copy(deep=True)
        plan = request.plan
        if request.clarification_choice:
            if state.pending is None:
                raise HTTPException(422, "No pending clarification.")
            pending, step_id, arg_field, choices = state.pending
            if request.clarification_choice not in {c["value"] for c in choices}:
                raise HTTPException(422, "Choice does not match a retained clarification.")
            plan = pending.model_copy(
                update={
                    "steps": [
                        s.model_copy(
                            update={
                                "arguments": {
                                    **s.arguments,
                                    arg_field: request.clarification_choice,
                                }
                            }
                        )
                        if s.step_id == step_id
                        else s
                        for s in pending.steps
                    ]
                }
            )
        if plan is None:
            if time.monotonic() < _quota_until:
                raise ProviderFailure(
                    "quota_exceeded", max(1, int(_quota_until - time.monotonic()))
                )
            if provider is None:
                settings = get_settings()
                key = (
                    settings.gemini_api_key.get_secret_value().strip()
                    if settings.gemini_api_key
                    else ""
                )
                if not key:
                    answer = answer.model_copy(
                        update={
                            "status": "disabled",
                            "interpretation": (
                                "Optional AI is disabled. Manual analytical tools remain available."
                            ),
                        }
                    )
                    return _finish(
                        state,
                        request,
                        request_hash,
                        answer,
                        start,
                        provider_calls,
                        calls,
                        rows,
                        cache_hits,
                        usage,
                    )
                provider = GeminiPlanProvider(key, settings.gemini_model)
            payload = _serialize(
                {
                    "message": request.message,
                    "context": state.context.to_dict(),
                    "context_fingerprint": state.fingerprint,
                    "previous_plan": state.previous_plan.model_dump(mode="json")
                    if state.previous_plan
                    else None,
                    "recent_exchanges": state.exchanges[-8:],
                    "operations": declarations(),
                    "teams": [
                        {
                            "team_id": team.team_id,
                            "name": team.name,
                            "city": team.city,
                            "tricode": team.tricode,
                        }
                        for team in NBA_TEAMS.values()
                    ],
                    "metrics": [
                        {"key": m.key, "unit": m.unit, "formula": m.formula, "version": m.version}
                        for m in METRIC_CATALOG.values()
                    ],
                }
            )
            if (
                len(payload.encode())
                + len(PLANNER_PROMPT.encode())
                + len(_serialize(AnalysisPlan.model_json_schema()).encode())
                > MAX_PROVIDER_BYTES
            ):
                raise ValueError("provider payload budget exceeded")
            provider_calls = 1
            planned = _bounded_provider(provider, payload, deadline - time.monotonic())
            if len(_serialize(planned.data).encode()) > 32 * 1024:
                raise ValueError("provider plan output budget exceeded")
            plan = AnalysisPlan.model_validate(planned.data)
            usage = {
                key: value
                for key, value in planned.usage.items()
                if key in ("prompt_token_count", "candidates_token_count", "total_token_count")
                and isinstance(value, int)
                and 0 <= value <= 10000000
            }
        answer = answer.model_copy(update={"plan": plan})
        cc = plan.context_changes
        has_context_change = cc is not None and any(
            [
                cc.season is not None and cc.season != state.context.season,
                cc.phase is not None and cc.phase != state.context.phase,
                cc.before_date is not None and cc.before_date != state.context.before_date,
                cc.window is not None and cc.window != state.context.window,
                cc.release_id is not None and cc.release_id != state.context.release_id,
            ]
        )
        if has_context_change:
            answer = answer.model_copy(
                update={
                    "status": "clarification_required",
                    "interpretation": CLARIFICATIONS["context"],
                }
            )
        elif plan.status != "execute":
            answer = answer.model_copy(
                update={
                    "status": plan.status,
                    "interpretation": CLARIFICATIONS.get(
                        plan.clarification or "capability", CLARIFICATIONS["capability"]
                    ),
                }
            )
        else:
            canonical = []
            for step in plan.steps:
                try:
                    canonical.append(canonical_step(session, state.context, step))
                except EntityClarification as exc:
                    state.pending = (plan, step.step_id, exc.field, exc.choices)
                    answer = answer.model_copy(
                        update={
                            "status": "clarification_required",
                            "interpretation": str(exc),
                            "choices": exc.choices,
                        }
                    )
                    return _finish(
                        state,
                        request,
                        request_hash,
                        answer,
                        start,
                        provider_calls,
                        calls,
                        rows,
                        cache_hits,
                        usage,
                    )
            plan = plan.model_copy(update={"steps": canonical})
            maximum_rows = sum(
                s.arguments.get("page", {}).get("limit", 50)
                if s.operation == "query"
                else s.arguments.get("window_n", 20) + 1
                if s.operation == "distribution"
                else s.arguments.get("limit", 20)
                if s.operation == "workload_shifts"
                else s.arguments.get("top_k", 5) + 1
                if s.operation == "similarity"
                else 1
                for s in plan.steps
            )
            if maximum_rows > 200:
                raise ValueError("planned row budget exceeded")
            results = []
            for step in plan.steps:
                if time.monotonic() >= deadline:
                    raise TimeoutError("turn deadline")
                key = operation_hash(step, state.context)
                result = _get_result(key)
                if result:
                    cache_hits += 1
                    result = result.model_copy(update={"step_id": step.step_id})
                else:
                    calls += 1
                    data = execute_bounded(session, state.context, step, deadline)
                    result = render_result(step, state.context, data, state.fingerprint)

                def count_rows(value: Any) -> int:
                    if isinstance(value, list):
                        return sum(isinstance(v, dict) for v in value) + sum(
                            count_rows(v) for v in value
                        )
                    if isinstance(value, dict):
                        return sum(count_rows(v) for v in value.values())
                    return 0

                result_row_count = max(len(result.rows), count_rows(result.data))
                if result_row_count > 100 or rows + result_row_count > 200:
                    raise ValueError("cumulative analytical row budget exceeded")
                if time.monotonic() >= deadline:
                    raise TimeoutError("turn deadline")
                rows += result_row_count
                _put_result(key, result)
                results.append(result)
            state.previous_plan = plan
            state.pending = None
            status = "answered"
            if all(
                not r.rows
                or r.data.get("total_eligible") == 0
                or r.data.get("status") == "no_issuance"
                for r in results
            ):
                status = "no_data"
            if any(
                r.operation == "distribution" and not r.data["summary"]["summary_available"]
                for r in results
            ):
                status = "insufficient_sample"
            if sum(len(r.model_dump_json().encode()) for r in results) > MAX_RESULT_BYTES:
                raise ValueError("cumulative result byte budget exceeded")
            manifest = {
                "schema_version": "courtload-conversation-result-v1",
                "context": state.context.to_dict(),
                "plan": plan.model_dump(mode="json"),
                "metric_version": METRIC_CATALOG_VERSION,
                "results": [
                    {
                        "operation_hash": r.operation_hash,
                        "result_hash": r.result_hash,
                        "evidence_ids": [e.evidence_id for e in r.evidence],
                    }
                    for r in results
                ],
            }
            manifest["manifest_sha256"] = canonical_hash(manifest)
            answer = answer.model_copy(
                update={
                    "status": status,
                    "plan": plan,
                    "results": results,
                    "interpretation": "Executed "
                    + ", ".join(s.operation for s in plan.steps)
                    + " against the displayed pinned context.",
                    "manifest": manifest,
                    "limitations": list(
                        dict.fromkeys(lim for r in results for lim in r.limitations)
                    ),
                }
            )
    except ProviderFailure as exc:
        if exc.kind == "quota_exceeded":
            _quota_until = time.monotonic() + (exc.retry_after or 60)
        answer = answer.model_copy(
            update={
                "status": exc.kind if exc.kind in ("quota_exceeded", "busy") else "provider_error",
                "interpretation": (
                    "Optional AI is unavailable; manual analytical tools remain available."
                ),
                "accounting": {"retry_after_seconds": exc.retry_after},
            }
        )
    except TimeoutError:
        answer = answer.model_copy(
            update={
                "status": "timeout",
                "interpretation": "The analytical request exceeded its deadline.",
            }
        )
    except HTTPException as exc:
        if exc.status_code in (404, 422):
            answer = answer.model_copy(
                update={
                    "status": "no_data",
                    "interpretation": (
                        "The operation has no eligible observations under the pinned context."
                    ),
                }
            )
        else:
            raise
    except ValueError:
        answer = answer.model_copy(
            update={
                "status": "unsupported",
                "interpretation": (
                    "The plan contains an unavailable operation, invalid scope, "
                    "or unsupported argument."
                ),
            }
        )
    except Exception:
        # Provider/database errors can contain secrets or source payloads. Never return their text.
        answer = answer.model_copy(
            update={
                "status": "provider_error",
                "interpretation": (
                    "The request could not be completed. Manual tools remain available."
                ),
            }
        )
    return _finish(
        state, request, request_hash, answer, start, provider_calls, calls, rows, cache_hits, usage
    )


def _finish(
    state: Conversation,
    request: ConversationTurnRequest,
    request_hash: str,
    answer: ConversationTurnResponse,
    start: float,
    provider_calls: int,
    calls: int,
    rows: int,
    cache_hits: int,
    usage: dict[str, int],
) -> ConversationTurnResponse:
    answer = answer.model_copy(
        update={
            "accounting": {
                **answer.accounting,
                "provider_calls": provider_calls,
                "tool_calls": calls,
                "rows": rows,
                "cache_hits": cache_hits,
                "elapsed_ms": round((time.monotonic() - start) * 1000, 3),
                "provider_usage": usage,
                "usage_basis": "provider metadata" if usage else "unavailable",
            }
        }
    )
    if len(answer.model_dump_json().encode()) > MAX_TURN_BYTES:
        answer = answer.model_copy(
            update={
                "status": "unsupported",
                "results": [],
                "manifest": None,
                "interpretation": "The result exceeds the bounded response size.",
            }
        )
    state.touched = time.monotonic()
    state.exchanges.append(
        {
            "turn_id": str(answer.turn_id),
            "status": answer.status,
            "message": request.message,
            "clarification": answer.plan.clarification if answer.plan else None,
            "manifest_sha256": answer.manifest.get("manifest_sha256") if answer.manifest else None,
        }
    )
    state.exchanges = state.exchanges[-8:]
    state.requests[str(request.request_id)] = (request_hash, answer.model_copy(deep=True))
    while len(state.requests) > 1 and (
        len(state.requests) > 8
        or sum(len(value[1].model_dump_json().encode()) for value in state.requests.values())
        > MAX_RESULT_BYTES
    ):
        state.requests.popitem(last=False)
    return answer
