"""V2 routing over canonical analytics, curated knowledge and bounded public reads."""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Callable
from datetime import date
from typing import Any
from uuid import uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.domain.conversation import AnalysisPlan, ConversationContext
from courtlens.domain.hybrid_assistant import (
    GENERAL_LABEL,
    AnswerAction,
    AnswerBlock,
    AnswerSource,
    ClarificationBlock,
    ExternalClaimBlock,
    Failure,
    HybridTurnRequest,
    HybridTurnResponse,
    InabilityBlock,
    Intent,
    InterpretedScope,
    LocalClaimBlock,
    LocalSummaryBlock,
    NarrativeBlock,
    ResultBlock,
    TextBlock,
    TurnAccounting,
    TurnPhase,
    claim_text,
    external_claim_text,
)
from courtlens.services.assistant.awards import AwardsUnavailable, award_source, match_award
from courtlens.services.assistant.awards import lookup as lookup_award
from courtlens.services.assistant.conversations import (
    DEADLINE_SECONDS,
    MAX_PROVIDER_BYTES,
    _bounded_provider,
)
from courtlens.services.assistant.defaults import (
    CalendarUnavailable,
    ScopeClarification,
    civil_today,
    resolve_scope,
)
from courtlens.services.assistant.execution import execute_bounded, query_deadline
from courtlens.services.assistant.knowledge import retrieve, runtime_guidance
from courtlens.services.assistant.legacy.narrative import NarrativeOutcome, compose_narrative
from courtlens.services.assistant.legacy.planner import (
    GeminiPlanProvider,
    GeneralKnowledgeDraft,
    PlanProvider,
    ProviderFailure,
)
from courtlens.services.assistant.legacy.retrieval import (
    RetrievalBudget,
    RetrievalFailure,
    retrieve_source,
    select_source,
)
from courtlens.services.assistant.operations import (
    EntityClarification,
    canonical_step,
    declarations,
)
from courtlens.services.assistant.page_context import bind_page_step, resolve_page_message
from courtlens.services.assistant.rendering import MAX_RESULT_BYTES, render_result
from courtlens.services.assistant.rule_planner import RulePlan, rule_plan
from courtlens.services.starting_positions import PositionEvidenceUnavailable
from courtlens.services.stats_catalog import stats_catalog_scope
from courtlens.services.workbench_analytics import canonical_hash, resolve_workbench_context

_FAILURES: dict[Failure, tuple[str, str]] = {
    "position_unavailable": (
        (
            "I cannot filter this scope by position: its box scores have no verifiable "
            "starting positions to group players by."
        ),
        "Ask for the same ranking without the position filter, or open Stats.",
    ),
    "qualification_unverified": (
        (
            "I cannot establish the official league leader from this local "
            "cohort. Official qualification and complete league ranking "
            "evidence have not been verified."
        ),
        "Use Stats to inspect the available cohort; research minimums are not NBA qualification.",
    ),
    "external_unavailable": (
        (
            "I cannot verify that external or current NBA fact because no "
            "registered public source supports this request. Live roster, injury and "
            "arbitrary web discovery are unavailable."
        ),
        "Consult an official dated NBA source, or ask about admitted local observations.",
    ),
    "external_stale": (
        "The supporting source cache expired and a fresh verified read failed.",
        (
            "Open the official source or retry later; "
            "expired evidence cannot establish a current fact."
        ),
    ),
    "external_conflict": (
        "The source contains conflicting values for the requested fact.",
        "Inspect the cited source; I cannot combine conflicting evidence into one answer.",
    ),
    "no_observations": (
        "There are no eligible observations for this request in the selected scope.",
        "Choose a covered season or broaden the filters in Stats.",
    ),
    "insufficient_sample": (
        "There are too few valid observations to compute the requested summary.",
        "Broaden the window or inspect the available games.",
    ),
    "unsupported_operation": (
        "This request needs an operation or filter that CourtLens cannot execute in this scope.",
        "Choose a supported metric or use the available research tools.",
    ),
    "provider_disabled": (
        ("The optional language provider is disabled; this question needs it to answer."),
        "Use the manual research tools or configure the assistant in Settings.",
    ),
    "provider_quota": (
        "The language provider has reached its quota.",
        "Retry after the provider quota resets, or use manual analysis.",
    ),
    "provider_busy": (
        "The language provider is busy with another request.",
        "Retry shortly; manual analysis remains available.",
    ),
    "provider_timeout": (
        "The request exceeded its time budget.",
        "Retry with a narrower question or use manual analysis.",
    ),
    "provider_error": (
        "The language provider could not return a usable response.",
        "Retry or inspect assistant configuration in Settings.",
    ),
    "malformed_output": (
        "The language planner returned an invalid or unsafe plan.",
        "Rephrase the question or use a manual research view.",
    ),
    "backend_failure": (
        "The local analytical service could not complete this request.",
        "Retry or inspect data status in Settings.",
    ),
    "context_unavailable": (
        "The selected local release or research context is unavailable.",
        "Choose an available release in Stats; earlier inputs have not been substituted.",
    ),
    "calendar_unavailable": (
        "The verified season calendar does not cover this date.",
        "Specify an explicit NBA season.",
    ),
    "prohibited_action": (
        (
            "I can explain or analyze basketball, but cannot execute code, "
            "access secrets or change data through chat."
        ),
        "Use a read-only basketball question or the appropriate manual settings action.",
    ),
}


logger = logging.getLogger(__name__)

# One planner call plus one repair attempt that receives the validation error.
MAX_PLAN_ATTEMPTS = 2


def _apply_server_scope(
    plan: AnalysisPlan, selected: ConversationContext, scope: InterpretedScope
) -> AnalysisPlan:
    """Server-resolved scope wins; a conflicting planner proposal is recorded, never executed."""
    if not plan.context_changes:
        return plan
    changes = plan.context_changes.model_dump(exclude_unset=True)
    current = selected.model_dump()
    conflicts = {
        key: value
        for key, value in changes.items()
        if value is not None and current.get(key) != value
    }
    if conflicts:
        proposal = ", ".join(f"{key} {value}" for key, value in sorted(conflicts.items()))
        scope.assumptions.append(
            f"Kept the server-resolved scope; ignored the planner's proposed {proposal}."[:500]
        )
    return plan.model_copy(update={"context_changes": None})


def _rejection_summary(exc: Exception) -> str:
    if isinstance(exc, ValidationError):
        return "; ".join(
            f"{'.'.join(str(part) for part in error['loc'])}: {error['msg']}"
            for error in exc.errors()[:5]
        )[:800]
    return str(exc)[:800]


def plan_position(plan: AnalysisPlan | None) -> str:
    for step in plan.steps if plan else []:
        if step.operation == "position_query":
            return f"{step.arguments['position']}s"
    return "position"


def route_intent(message: str, has_plan: bool = False) -> Intent:
    """Server routing precedes planner work; current facts never become model knowledge."""
    # A leading "Now ..." is a follow-up discourse marker, not a request for current facts.
    text = re.sub(r"^\s*now\b[,:]?\s*", "", message.lower())
    if re.search(
        r"\b(sql|shell|execute code|api key|credentials|train model|refresh(?: the)? data|"
        r"delete history|search the (?:web|internet))\b",
        text,
    ):
        return "inability"
    guidance = bool(re.search(r"\b(how do i|how to|here|settings|save a|saved findings)\b", text))
    conceptual = bool(
        re.search(
            r"^(explain|what is|what are|what does|what do|define|why|how|tell me about|"
            r"who invented|who created|who founded)\b",
            text.strip(),
        )
    )
    # Official award/championship results are sourced facts, not local analysis.
    if not has_plan and match_award(text) and not (conceptual and not re.search(r"\bwho\b", text)):
        return "external"
    # Roster/trade/injury facts are unavailable even with a supplied analytical plan.
    if re.search(
        r"\b(news|rosters?|injur(?:y|ies|ed)|trades?|traded|internet|web|plays? for|"
        r"signed with|available tonight)\b",
        text,
    ):
        return "external"
    if (
        re.search(r"\b(current|today|now)\b", text)
        and not re.search(
            r"\b(season|scope|window|cutoff|observations|stats|scoring|points|assists|rebounds)\b",
            text,
        )
        and not guidance
    ):
        return "external"
    if re.search(r"\bregular season\b.*\b(start|begin|tip off)\b|\bstart date\b", text):
        return "external"
    if "according to" in text and select_source(message, None) is not None:
        return "external"
    if has_plan:
        return "local_analysis"
    if guidance:
        return "site_guidance"
    # Questions asking for an observation/forecast remain data questions even when
    # prefixed with "explain" or "what is". Concept definitions require no release.
    if re.search(
        r"\bhow (?:did|has|have|was|were) (?!a |an |the rule)|"
        r"\b(show|rank|ranked|top|led|leads?|leader|highest|most assists|most consistent|"
        r"best defender|better defender|how many|how variable|average|averaged|averaging)\b",
        text,
    ) or re.search(
        r"\b(forecast|profile|scoring|points|assists|rebounds|minutes|shooting)\b.*"
        r"\b(for|of|by)\b|[\u2019']s\s+(points|assists|rebounds|minutes|stats|scoring)\b",
        text,
    ):
        return "local_analysis"
    if re.search(r"\b(opinion|what do you think)\b", text):
        return "discussion"
    if conceptual:
        return "explanation"
    return "local_analysis"


def _run_single_turn(
    session: Session,
    request: HybridTurnRequest,
    *,
    clock: Callable[[], date] = civil_today,
    inherited_context: ConversationContext | None = None,
    previous_plan: AnalysisPlan | None = None,
    provider: PlanProvider | None = None,
    _started: float | None = None,
    _retrieval_budget: RetrievalBudget | None = None,
    _mixed_sentence: bool = False,
    on_narrative: Callable[[NarrativeOutcome], None] | None = None,
    on_phase: Callable[[TurnPhase], None] | None = None,
) -> HybridTurnResponse:
    """PF07a execution seam. PF07b wraps this with server-owned durable state/idempotency."""
    started = _started if _started is not None else time.monotonic()
    deadline = started + DEADLINE_SECONDS
    retrieval_budget = _retrieval_budget or RetrievalBudget(deadline)
    source_requests_before = retrieval_budget.requests
    thread_id = request.thread_id or uuid4()
    turn_id = uuid4()
    intent = route_intent(request.message, request.plan is not None)
    scope: InterpretedScope | None = None
    blocks: list[AnswerBlock] = []
    sources: list[AnswerSource] = []
    actions: list[AnswerAction] = []
    status: Any = "answered"
    plan = None
    provider_calls = calls = rows = 0
    planning = True

    def unable(reason: Failure, *, failed: bool = False) -> None:
        nonlocal status
        text, next_action = _FAILURES[reason]
        blocks.clear()
        sources.clear()
        actions.clear()
        blocks.append(InabilityBlock(reason=reason, text=text, next_action=next_action))
        status = "failed" if failed else "unable"
        actions.append(AnswerAction(kind="navigation", label="Open Stats", url="/stats"))

    def general_block() -> TextBlock | None:
        """Labelled, number-free general knowledge; None when the provider declines."""
        nonlocal provider, provider_calls
        if provider is None:
            settings = get_settings()
            key = (
                settings.gemini_api_key.get_secret_value().strip()
                if settings.gemini_api_key
                else ""
            )
            if not key:
                raise ProviderFailure("disabled")
            provider = GeminiPlanProvider(key, settings.gemini_model)
        payload = json.dumps(
            {
                "purpose": "general_knowledge",
                "message": request.message,
                "today": clock().isoformat(),
                "mixed_sentence": _mixed_sentence,
                "curated_entry": None,
            },
            separators=(",", ":"),
        )
        provider_calls += 1
        output = _bounded_provider(provider, payload, deadline - time.monotonic())
        draft = GeneralKnowledgeDraft.model_validate(output.data)
        if draft.status == "unavailable":
            return None
        if _mixed_sentence and len(re.split(r"[.!?]\s+", draft.text.strip())) > 1:
            raise ValueError("mixed knowledge requires a single sentence")
        return TextBlock(origin="general_knowledge", text=GENERAL_LABEL + "\n" + draft.text)

    try:
        if intent == "inability":
            unable("prohibited_action")
        elif intent in ("site_guidance", "explanation", "discussion"):
            entry = retrieve(request.message if intent != "discussion" else "defender defense")
            if entry is None:
                general = general_block()
                if general is None:
                    unable("unsupported_operation")
                else:
                    blocks.append(general)
            else:
                source = entry.source()
                sources.append(source)
                prose = (
                    entry.text.split(". ", 1)[0].rstrip(".") + "."
                    if _mixed_sentence
                    else entry.text
                )
                blocks.append(
                    TextBlock(
                        origin="general_knowledge",
                        text=GENERAL_LABEL + "\n" + prose,
                        source_ids=[source.source_id],
                        criteria=["role", "screen navigation", "help positioning", "rim protection"]
                        if intent == "discussion"
                        else [],
                    )
                )
                if intent == "site_guidance":
                    with query_deadline(session, deadline):
                        runtime = runtime_guidance(
                            session, entry, request.context or inherited_context
                        )
                    if runtime:
                        sources.append(runtime)
                        # Runtime scope/availability remains separately sourced site guidance.
                        blocks.append(
                            TextBlock(
                                origin="knowledge",
                                text=runtime.excerpt,
                                source_ids=[runtime.source_id],
                            )
                        )
                actions.extend(
                    AnswerAction(kind="navigation", label=entry.title, url=route)
                    for route in entry.routes
                )

        elif intent == "external" and (award := lookup_award(request.message, clock())):
            # Official results come from the pinned, sourced registry; never model memory.
            if award.record is not None:
                source, fact = award_source(award)
                sources.append(source)
                blocks.append(
                    ExternalClaimBlock(
                        source_id=source.source_id,
                        text=external_claim_text(fact),
                        **fact.model_dump(),
                    )
                )
                if source.url:
                    actions.append(
                        AnswerAction(kind="source", label="Open NBA source", url=source.url)
                    )
            else:
                status = "unable"
                blocks.append(
                    InabilityBlock(
                        reason="external_unavailable",
                        text=(
                            f"I don't have an official {award.label} result for "
                            f"{award.season}. {award.interpretation} Either it has not been "
                            "awarded yet, or that season is outside the verified awards "
                            "registry (most awards from 2023-24, MVPs from 2018-19, champions "
                            "from 2019-20)."
                        ),
                        next_action="Name another season, or check NBA.com for older results.",
                    )
                )
        else:
            merged = inherited_context.model_dump() if inherited_context else {}
            if request.page_context:
                merged.update(request.page_context.selections.model_dump(exclude_unset=True))
            if request.context:
                merged.update(request.context.model_dump(exclude_unset=True))
            scope = resolve_scope(
                request.message,
                ConversationContext.model_validate(merged) if merged else None,
                as_of=clock(),
            )
            if intent == "external":
                spec = select_source(request.message, scope.selections.season)
                if spec:
                    if on_phase:
                        on_phase("querying")
                    source = retrieve_source(spec, retrieval_budget)
                    sources.append(source)
                    for fact in source.facts:
                        blocks.append(
                            ExternalClaimBlock(
                                source_id=source.source_id,
                                text=external_claim_text(fact),
                                **fact.model_dump(),
                            )
                        )
                    actions.append(
                        AnswerAction(kind="source", label="Open NBA source", url=source.url)
                    )
                else:
                    unable(
                        "qualification_unverified"
                        if re.search(
                            r"\b(leader|leads?|most assists|highest apg)\b", request.message.lower()
                        )
                        else "external_unavailable"
                    )
            else:
                with query_deadline(session, deadline):
                    selections = scope.selections
                    context = resolve_workbench_context(
                        session,
                        release_id=selections.release_id,
                        requested_season=selections.season,
                        requested_phase=selections.phase,
                        requested_before_date=selections.before_date,
                        requested_window=selections.window,
                    )
                    catalog = stats_catalog_scope(session, context)
                    if selections.season is None:
                        context = resolve_workbench_context(
                            session,
                            release_id=context.release_id,
                            requested_season=catalog["default_season"],
                            requested_phase=selections.phase,
                            requested_before_date=selections.before_date,
                            requested_window=selections.window,
                        )
                    selected = ConversationContext(
                        release_id=context.release_id,
                        season=context.season,
                        phase=context.phase,
                        before_date=context.before_date,
                        window=context.window,
                    )
                    scope = scope.model_copy(
                        update={
                            "selections": selected,
                            "local_context": context.to_dict(),
                            "context_fingerprint": canonical_hash(context.to_dict()),
                            "label": (
                                f"{context.season} · {context.phase.replace('_', ' ')} · "
                                f"{context.window.replace('_', ' ')} · before {context.before_date}"
                            ),
                        }
                    )
                    if not any(
                        s["season"] == context.season and s["phase"] == context.phase
                        for s in catalog["stats_scopes"]
                    ):
                        unable("no_observations")
                    else:
                        planner_message, page_bindings = resolve_page_message(
                            session, context, request.message, request.page_context
                        )
                        if page_bindings:
                            scope.assumptions.append(
                                "Resolved page reference: "
                                + ", ".join(
                                    f"{key}={value}" for key, value in page_bindings.items()
                                )
                            )
                        plan = request.plan
                        rejection: str | None = None
                        attempts = 0
                        ruled: RulePlan | None = None
                        provider_failure: Exception | None = None
                        while True:
                            if request.plan is None and ruled is None:
                                try:
                                    if provider is None:
                                        settings = get_settings()
                                        key = (
                                            settings.gemini_api_key.get_secret_value().strip()
                                            if settings.gemini_api_key
                                            else ""
                                        )
                                        if not key:
                                            raise ProviderFailure("disabled")
                                        provider = GeminiPlanProvider(key, settings.gemini_model)
                                    payload = json.dumps(
                                        {
                                            "message": planner_message,
                                            **(
                                                {"page_referents": page_bindings}
                                                if page_bindings
                                                else {}
                                            ),
                                            "today": clock().isoformat(),
                                            "context": context.to_dict(),
                                            "previous_plan": previous_plan.model_dump(mode="json")
                                            if previous_plan
                                            else None,
                                            "rejected_previous_attempt": rejection,
                                            "operations": declarations(),
                                        },
                                        separators=(",", ":"),
                                    )
                                    # Reserve prompt/schema room in the legacy 64KiB budget.
                                    if len(payload.encode()) > MAX_PROVIDER_BYTES - 24000:
                                        raise ValueError("provider input budget")
                                    if time.monotonic() >= deadline:
                                        raise TimeoutError("turn deadline")
                                    provider_calls += 1
                                    attempts += 1
                                    output = _bounded_provider(
                                        provider, payload, deadline - time.monotonic()
                                    )
                                except (ProviderFailure, TimeoutError) as exc:
                                    # Answer-first: common shapes still plan without the model.
                                    ruled = rule_plan(
                                        session,
                                        planner_message,
                                        previous_plan,
                                        page_bindings,
                                        context.dataset_id,
                                    )
                                    if ruled is None:
                                        raise
                                    provider_failure = exc
                                    plan = ruled.plan
                            try:
                                if request.plan is None and ruled is None:
                                    if len(json.dumps(output.data).encode()) > 32 * 1024:
                                        raise ValueError("provider output budget")
                                    # The v2 adapter rejects wrong versions.
                                    if output.data.get("plan_version") != (
                                        "courtload-analysis-plan-v1"
                                    ):
                                        raise ValueError("unrecognized plan version")
                                    plan = AnalysisPlan.model_validate(output.data)
                                assert plan is not None
                                plan = _apply_server_scope(plan, selected, scope)
                                if plan.status == "execute":
                                    steps = [
                                        canonical_step(
                                            session, context, bind_page_step(step, page_bindings)
                                        )
                                        for step in plan.steps
                                    ]
                                    plan = plan.model_copy(update={"steps": steps})
                                break
                            except (ValueError, ValidationError) as exc:
                                if provider_failure is not None:
                                    # A rule plan never repairs; report the real failure.
                                    raise provider_failure from None
                                # Only a provider plan earns one repair attempt.
                                if request.plan is not None or attempts >= MAX_PLAN_ATTEMPTS:
                                    raise
                                rejection = _rejection_summary(exc)
                                logger.warning(
                                    "planner output rejected (attempt %d): %s; plan=%s",
                                    attempts,
                                    rejection,
                                    json.dumps(output.data)[:4000],
                                )
                        planning = False
                        if ruled is not None:
                            scope.assumptions.extend(ruled.notes)
                            # The provider just failed; template text replaces its narrative.
                            provider = None
                        if plan.status == "clarification_required":
                            status = "clarification_required"
                            messages = {
                                "identity": "Which named player do you mean?",
                                "floor_or_game": (
                                    "Do you mean shared court time or whole-game participation?"
                                ),
                                "consistency": (
                                    "Do you mean scoring spread, minutes spread "
                                    "or threshold frequency?"
                                ),
                                "defense_metric": "Which named defensive metric should I rank?",
                            }
                            blocks.append(
                                ClarificationBlock(
                                    text=messages.get(
                                        plan.clarification or "",
                                        "Which metric or scope should I use?",
                                    )
                                )
                            )
                        elif plan.status == "unsupported":
                            # Answer-first: a labelled general answer beats a bare refusal.
                            general = None
                            if request.plan is None and not _mixed_sentence and ruled is None:
                                try:
                                    general = general_block()
                                except (
                                    ProviderFailure,
                                    TimeoutError,
                                    ValueError,
                                    ValidationError,
                                ):
                                    general = None
                            if general is None:
                                unable("unsupported_operation")
                            else:
                                blocks.append(general)
                                blocks.append(
                                    InabilityBlock(
                                        reason="unsupported_operation",
                                        text=(
                                            "CourtLens data cannot compute this exact request, "
                                            "so the answer above is general knowledge."
                                        ),
                                        next_action=(
                                            "Rephrase with a metric and scope to get a "
                                            "data answer, or open Stats."
                                        ),
                                    )
                                )
                        else:
                            if on_phase:
                                on_phase("querying")
                            steps = plan.steps
                            for step in steps:
                                calls += 1
                                try:
                                    data = execute_bounded(session, context, step, deadline)
                                except PositionEvidenceUnavailable:
                                    if step.operation != "position_query":
                                        raise
                                    # Answer-first: run the unfiltered ranking and say so.
                                    step = step.model_copy(
                                        update={
                                            "operation": "query",
                                            "arguments": step.arguments["query"],
                                        }
                                    )
                                    calls += 1
                                    data = execute_bounded(session, context, step, deadline)
                                    data["limitations"] = [
                                        f"Position filter ({plan_position(plan)}) not applied: "
                                        "this scope's box scores have no verifiable starting "
                                        "positions, so all players are ranked."
                                    ]
                                    scope.assumptions.append(data["limitations"][0])
                                    # The retained plan names what actually executed.
                                    plan = plan.model_copy(
                                        update={
                                            "steps": [
                                                step if s.step_id == step.step_id else s
                                                for s in plan.steps
                                            ]
                                        }
                                    )
                                if ruled is not None:
                                    data["limitations"] = [
                                        *ruled.notes,
                                        *data.get("limitations", data.get("disclosures", [])),
                                    ]
                                if step.operation == "position_query" and re.search(
                                    r"\b(point|shooting|combo) guards?\b|\b(pg|sg)s?\b|"
                                    r"\bwings?\b|\b(small|power) forwards?\b|\b(sf|pf)s?\b",
                                    request.message.lower(),
                                ):
                                    note = (
                                        "Box scores record only G, F or C, so this answers "
                                        f"for all {step.arguments['position']}s, not the "
                                        "narrower position you named."
                                    )
                                    data["limitations"] = [note, *data.get("limitations", [])]
                                    scope.assumptions.append(note)
                                result = render_result(
                                    step, context, data, scope.context_fingerprint or ""
                                )

                                def count_rows(value: Any) -> int:
                                    if isinstance(value, list):
                                        return sum(isinstance(item, dict) for item in value) + sum(
                                            count_rows(item) for item in value
                                        )
                                    if isinstance(value, dict):
                                        return sum(count_rows(item) for item in value.values())
                                    return 0

                                result_rows = max(len(result.rows), count_rows(result.data))
                                rows += result_rows
                                if rows > 200 or result_rows > 100:
                                    raise ValueError("row budget")
                                if (
                                    data.get("total_eligible") == 0
                                    or not result.rows
                                    or data.get("status") == "no_issuance"
                                ):
                                    unable("no_observations")
                                    break
                                if (
                                    step.operation == "distribution"
                                    and not data["summary"]["summary_available"]
                                ):
                                    unable("insufficient_sample")
                                    break
                                # Exact ordered cells retain identity/path.
                                claims = [
                                    cell
                                    for cell in result.evidence
                                    if cell.value is not None
                                    and (
                                        "/metrics/" in cell.path
                                        or cell.path.endswith(
                                            (
                                                "/value_a",
                                                "/value_b",
                                                "/delta_minutes",
                                                "/delta_points",
                                            )
                                        )
                                    )
                                    and cell.unit != "observations"
                                ][:2]
                                for cell in claims:
                                    blocks.append(
                                        LocalClaimBlock(
                                            text=claim_text(cell, result),
                                            cell=cell,
                                        )
                                    )
                                blocks.append(ResultBlock(result=result))
                                if result.open_url:
                                    actions.append(
                                        AnswerAction(
                                            kind="executed_operation",
                                            label="Open equivalent analysis",
                                            url=result.open_url,
                                            operation_hash=result.operation_hash,
                                        )
                                    )
    except RetrievalFailure as exc:
        unable(exc.kind)
        if exc.source:
            sources.append(exc.source)
            actions.append(
                AnswerAction(kind="source", label="Inspect NBA source", url=exc.source.url)
            )
    except ScopeClarification as exc:
        status = "clarification_required"
        blocks = [ClarificationBlock(text=str(exc))]
    except PositionEvidenceUnavailable:
        unable("position_unavailable")
    except AwardsUnavailable:
        unable("external_unavailable")
    except CalendarUnavailable:
        unable("calendar_unavailable")
    except EntityClarification as exc:
        status = "clarification_required"
        blocks = [
            ClarificationBlock(text=str(exc), choices=[item["label"] for item in exc.choices])
        ]
        actions.clear()
    except ProviderFailure as exc:
        reason: Failure = {
            "disabled": "provider_disabled",
            "quota_exceeded": "provider_quota",
            "busy": "provider_busy",
        }.get(exc.kind, "provider_error")  # type: ignore[assignment]
        unable(reason, failed=True)
    except TimeoutError:
        unable("provider_timeout", failed=True)
    except HTTPException as exc:
        unable(
            "context_unavailable"
            if exc.status_code in (404, 410, 503)
            else "unsupported_operation",
            failed=exc.status_code >= 500,
        )
    except (ValueError, ValidationError) as exc:
        if planning and provider_calls:
            logger.warning("planner output rejected after repair: %s", _rejection_summary(exc))
            unable("malformed_output")
            if intent in ("explanation", "site_guidance", "discussion"):
                blocks[0] = InabilityBlock(
                    reason="malformed_output",
                    text="The provider returned a general answer that did not pass validation.",
                    next_action="Ask about a basketball concept or open Definitions.",
                )
        else:
            unable("unsupported_operation")
    except Exception:
        unable("backend_failure", failed=True)
    results = [b.result for b in blocks if isinstance(b, ResultBlock)]
    if status == "answered" and intent == "local_analysis" and results and scope is not None:
        if on_phase:
            on_phase("writing")
        outcome = compose_narrative(
            provider,
            request.message,
            results,
            scope.model_dump(mode="json"),
            deadline,
            _bounded_provider,
        )
        provider_calls += outcome.provider_called
        if outcome.outcome == "accepted" and outcome.text:
            # Checked prose replaces template claims; the result cells stay attached.
            position = next(
                i for i, b in enumerate(blocks) if isinstance(b, (LocalClaimBlock, ResultBlock))
            )
            blocks[:] = [b for b in blocks if not isinstance(b, LocalClaimBlock)]
            blocks.insert(
                position,
                NarrativeBlock(
                    text=outcome.text, operation_hashes=[r.operation_hash for r in results]
                ),
            )
        if on_narrative:
            on_narrative(outcome)
    if status == "answered" and not any(
        isinstance(b, (TextBlock, LocalClaimBlock, NarrativeBlock, ExternalClaimBlock))
        for b in blocks
    ):
        first = next(b for b in blocks if isinstance(b, ResultBlock))
        blocks.insert(0, LocalSummaryBlock(operation_hash=first.result.operation_hash))
    if sum(len(b.model_dump_json().encode()) for b in blocks) > MAX_RESULT_BYTES:
        unable("unsupported_operation")
    return HybridTurnResponse(
        request_id=request.request_id,
        thread_id=thread_id,
        turn_id=turn_id,
        status=status,
        intent=intent,
        scope=scope,
        blocks=blocks,
        sources=sources,
        actions=actions,
        plan=plan,
        saveable=status == "answered" and any(isinstance(b, ResultBlock) for b in blocks),
        accounting=TurnAccounting(
            provider_calls=provider_calls,
            analytical_calls=calls,
            source_requests=retrieval_budget.requests - source_requests_before,
            rows=min(rows, 200),
            elapsed_ms=round((time.monotonic() - started) * 1000, 3),
        ),
    )


def run_hybrid_turn(
    session: Session,
    request: HybridTurnRequest,
    *,
    clock: Callable[[], date] = civil_today,
    inherited_context: ConversationContext | None = None,
    previous_plan: AnalysisPlan | None = None,
    provider: PlanProvider | None = None,
    on_narrative: Callable[[NarrativeOutcome], None] | None = None,
    on_phase: Callable[[TurnPhase], None] | None = None,
) -> HybridTurnResponse:
    """Bounded mixed routing: at most one local plan and four independently typed clauses."""
    started = time.monotonic()
    if on_phase:
        on_phase("understanding")
    clauses = [
        part.strip()
        for part in re.split(
            r";|\?\s+|\band also\b|\band\s+(?=(?:show|explain|what|who|why|how|compare|rank)\b)",
            request.message,
            flags=re.I,
        )
        if part.strip()
    ]
    if len(clauses) <= 1 or route_intent(request.message) == "inability":
        return _run_single_turn(
            session,
            request,
            clock=clock,
            inherited_context=inherited_context,
            previous_plan=previous_plan,
            provider=provider,
            on_narrative=on_narrative,
            on_phase=on_phase,
        )
    as_of = clock()
    retrieval_budget = RetrievalBudget(started + DEADLINE_SECONDS)
    local = [i for i, part in enumerate(clauses) if route_intent(part) == "local_analysis"]
    general = [
        i
        for i, part in enumerate(clauses)
        if route_intent(part) in ("explanation", "site_guidance", "discussion")
    ]
    if len(clauses) > 4 or len(local) > 1 or (local and len(general) > 1):
        return HybridTurnResponse(
            request_id=request.request_id,
            thread_id=request.thread_id or uuid4(),
            turn_id=uuid4(),
            status="clarification_required",
            intent="clarification",
            blocks=[ClarificationBlock(text="Which analytical question should I answer first?")],
        )
    thread_id = request.thread_id or uuid4()
    answers = []
    for index, clause in enumerate(clauses):
        part = request.model_copy(
            update={
                "message": clause,
                "thread_id": thread_id,
                "plan": request.plan if index in local else None,
            }
        )
        answers.append(
            _run_single_turn(
                session,
                part,
                clock=lambda: as_of,
                inherited_context=inherited_context,
                previous_plan=previous_plan,
                provider=provider,
                _started=started,
                _retrieval_budget=retrieval_budget,
                _mixed_sentence=bool(local),
                on_narrative=on_narrative,
                on_phase=on_phase,
            )
        )
    primary = next(
        (answer for answer in answers if answer.intent == "local_analysis"),
        next((answer for answer in answers if answer.scope is not None), answers[0]),
    )
    blocks = [block for answer in answers for block in answer.blocks]
    if len(blocks) > 24:
        return HybridTurnResponse(
            request_id=request.request_id,
            thread_id=thread_id,
            turn_id=uuid4(),
            status="unable",
            intent="inability",
            blocks=[
                InabilityBlock(
                    reason="unsupported_operation",
                    text="The combined answer exceeds the response budget.",
                    next_action="Ask the analytical question separately.",
                )
            ],
        )
    statuses = {answer.status for answer in answers}
    status = next(
        item
        for item in ("failed", "unable", "clarification_required", "answered")
        if item in statuses
    )
    return HybridTurnResponse(
        request_id=request.request_id,
        thread_id=thread_id,
        turn_id=uuid4(),
        status=status,
        intent=primary.intent,
        scope=primary.scope,
        blocks=blocks,
        sources=list(
            {source.source_id: source for answer in answers for source in answer.sources}.values()
        ),
        actions=[action for answer in answers for action in answer.actions],
        plan=primary.plan,
        saveable=status == "answered" and primary.saveable,
        accounting=TurnAccounting(
            provider_calls=sum(a.accounting.provider_calls for a in answers),
            analytical_calls=sum(a.accounting.analytical_calls for a in answers),
            source_requests=retrieval_budget.requests,
            rows=sum(a.accounting.rows for a in answers),
            elapsed_ms=round((time.monotonic() - started) * 1000, 3),
        ),
    )
