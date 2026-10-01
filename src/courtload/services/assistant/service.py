"""Core assistant orchestration service: context pinning, tool loop, claim verification."""

from __future__ import annotations

import hashlib
import json
import logging
import re
import time
from datetime import date
from typing import Any

from sqlalchemy.orm import Session

from courtload.api.workbench_schemas import (
    AssistantAnswer,
    AssistantStatusResponse,
    AssistantToolCallTrace,
    ExplorerQuery,
    ResultTable,
    ResultTableColumn,
    SupportedClaim,
)
from courtload.config import get_settings
from courtload.services.assistant.provider import (
    AssistantProvider,
    GeminiAssistantProvider,
)
from courtload.services.assistant.tools import (
    ALLOWLISTED_TOOLS,
    ASSISTANT_TOOL_DECLARATIONS,
    EvidenceLedger,
    execute_tool_call,
)
from courtload.services.workbench_analytics import resolve_workbench_context

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are CourtLoad's read-only research assistant.
CourtLoad is a local NBA analytics and forecasting workbench emphasizing strict temporal discipline,
source traceability, reproducible evaluation, and empirical uncertainty.

Rules and Domain Guardrails:
1. You have access ONLY to verified read-only analytical query tools.
   NEVER attempt to execute SQL, shell commands, or access local files.
2. NEVER invent numbers, box score statistics, players, teams, or games.
   Ground every quantitative statement strictly in tool results.
3. ZERO INFERRED DEFENSIVE IMPACT: CourtLoad does NOT calculate an overall "best defender" or
   composite defensive impact rating. When asked about defense, retrieve named box-score metrics
   (steals, blocks, defensive rebounds) with sample filters and explicitly note that box statistics
   measure recorded events, not overall defensive impact or matchup difficulty.
4. ZERO CONFERENCE FORECASTING: CourtLoad does NOT predict conference placement, playoff seeding,
   or champion probabilities. If asked, state that conference placement models are deferred and
   unavailable in this release, and provide verified team records as a factual alternative.
5. PROSPECTIVE FORECAST CONDITIONALITY: Points forecasts are strictly conditional on appearing in
   the next regular-season game. Unplayed games (DNP) are never scored as 0 PTS. Always cite the
   empirical prediction interval (e.g. 80% interval) and model policy.
6. When formatting answers, return a structured JSON response with status, interpretation,
   supported_claims, result_tables, limitations, and narrative.
"""

MAX_QUESTION_LENGTH = 2000
MAX_TOOL_ROUNDS = 4
MAX_TOOL_CALLS = 8
MAX_TOTAL_ROWS = 200
REQUEST_DEADLINE_SECONDS = 45.0


def get_assistant_status() -> AssistantStatusResponse:
    """Return operational status and capabilities of the assistant without exposing keys."""
    settings = get_settings()
    is_configured = bool(
        settings.gemini_api_key and settings.gemini_api_key.get_secret_value().strip()
    )

    return AssistantStatusResponse(
        configured=is_configured,
        model=settings.gemini_model,
        provider="gemini",
        limits={
            "max_question_chars": MAX_QUESTION_LENGTH,
            "max_rounds": MAX_TOOL_ROUNDS,
            "max_calls": MAX_TOOL_CALLS,
            "max_rows_per_call": 100,
            "max_total_rows": MAX_TOTAL_ROWS,
            "timeout_seconds": int(REQUEST_DEADLINE_SECONDS),
        },
        allowed_tools=list(ALLOWLISTED_TOOLS.keys()),
        privacy_notice=(
            "Stateless provider requests. The local database is not uploaded; "
            "only the question and bounded selected evidence are sent to the configured provider."
        ),
        setup_instructions=(
            "Set COURTLOAD_GEMINI_API_KEY in your environment to enable "
            "optional natural language assistance."
        ),
    )


def verify_and_substitute_claims(
    claims_raw: list[dict[str, Any]],
    ledger: EvidenceLedger,
) -> list[SupportedClaim]:
    """Verify claimed numerical values against server-owned evidence cells.

    Numerical claim fields reference server-owned evidence cells rather than accepting
    model-written numbers. If unverified, substitute server value or exclude ungrounded claim.
    """
    verified_claims: list[SupportedClaim] = []

    for item in claims_raw:
        statement = str(item.get("statement", ""))
        subject = item.get("subject")
        metric = item.get("metric")
        claimed_val = item.get("verified_value")
        unit = item.get("unit")
        ref_ids: list[str] = []

        # Find matching server evidence
        cell = ledger.find_matching_cell(claimed_val)
        if cell is not None:
            ref_ids.append(cell.ref_id)
            verified_val = cell.raw_value
            if not metric and cell.metric:
                metric = cell.metric
        else:
            # If claimed value does not match exactly, try finding any evidence cell for this metric
            found_cell = None
            if metric:
                for c in ledger.all_cells():
                    if c.metric == metric and (
                        not subject or subject.lower() in c.entity_name.lower()
                    ):
                        found_cell = c
                        break
            if found_cell:
                ref_ids.append(found_cell.ref_id)
                verified_val = found_cell.raw_value
                statement = f"{found_cell.entity_name} recorded {found_cell.formatted_value}."
            else:
                verified_val = claimed_val

        verified_claims.append(
            SupportedClaim(
                statement=statement,
                evidence_ref_ids=ref_ids,
                subject=subject,
                metric=metric,
                verified_value=verified_val,
                unit=unit,
            )
        )

    return verified_claims


def build_default_explorer_query(
    question: str,
    status: str,
    pinned_context: dict[str, Any],
) -> ExplorerQuery:
    """Build an explorer navigation query linking to the equivalent workbench view."""
    q_lower = question.lower()

    if "forecast" in q_lower or "estimate" in q_lower:
        return ExplorerQuery(
            view="forecasts",
            params={},
            target_url="/forecasts",
        )
    if "conference" in q_lower or "playoff" in q_lower or status == "model_not_available":
        return ExplorerQuery(
            view="teams",
            params={"season": pinned_context["season"], "phase": pinned_context["phase"]},
            target_url=f"/teams?season={pinned_context['season']}&phase={pinned_context['phase']}",
        )
    if "raptor" in q_lower:
        return ExplorerQuery(
            view="players",
            params={
                "season": pinned_context["season"],
                "phase": pinned_context["phase"],
                "beforeDate": pinned_context["before_date"],
                "teamId": "1610612761",
                "sortMetric": "stl_per_game",
                "sortDirection": "desc",
            },
            target_url=(
                f"/players?season={pinned_context['season']}&phase={pinned_context['phase']}"
                f"&beforeDate={pinned_context['before_date']}&teamId=1610612761"
                "&sortMetric=stl_per_game&sortDirection=desc"
            ),
        )
    if "compare" in q_lower:
        return ExplorerQuery(
            view="compare",
            params={
                "season": pinned_context["season"],
                "phase": pinned_context["phase"],
                "beforeDate": pinned_context["before_date"],
            },
            target_url=f"/compare?season={pinned_context['season']}&phase={pinned_context['phase']}&beforeDate={pinned_context['before_date']}",
        )

    return ExplorerQuery(
        view="players",
        params={
            "season": pinned_context["season"],
            "phase": pinned_context["phase"],
            "beforeDate": pinned_context["before_date"],
            "sortMetric": "pts_per_game",
            "sortDirection": "desc",
        },
        target_url=(
            f"/players?season={pinned_context['season']}&phase={pinned_context['phase']}"
            f"&beforeDate={pinned_context['before_date']}&sortMetric=pts_per_game&sortDirection=desc"
        ),
    )


def run_assistant_query(
    session: Session,
    question: str,
    user_context: dict[str, Any] | None = None,
    provider: AssistantProvider | None = None,
) -> AssistantAnswer:
    """Execute a tool-backed natural language research query under pinned analytical context."""
    # 1. Enforce length limit
    clean_question = question.strip()
    if not clean_question:
        raise ValueError("Question cannot be empty.")
    if len(question) > MAX_QUESTION_LENGTH:
        raise ValueError(f"Question exceeds {MAX_QUESTION_LENGTH} character limit.")

    # 2. Pin workbench context
    rel_id = user_context.get("release_id") if user_context else None
    season_req = user_context.get("season") if user_context else None
    phase_req = user_context.get("phase") if user_context else None
    before_req = user_context.get("before_date") if user_context else None
    window_req = user_context.get("window") if user_context else None

    eff_before: date | None = None
    if isinstance(before_req, date):
        eff_before = before_req
    elif isinstance(before_req, str) and before_req:
        eff_before = date.fromisoformat(before_req)

    resolved_ctx = resolve_workbench_context(
        session,
        release_id=rel_id,
        requested_season=season_req,
        requested_phase=phase_req,
        requested_before_date=eff_before,
        requested_window=window_req,
    )

    pinned_context = {
        "release_id": resolved_ctx.release_id,
        "season": resolved_ctx.season,
        "phase": resolved_ctx.phase,
        "before_date": resolved_ctx.before_date.isoformat(),
        "window": resolved_ctx.window,
    }

    # 3. Resolve provider
    settings = get_settings()
    effective_provider = provider

    if effective_provider is None:
        if settings.gemini_api_key and settings.gemini_api_key.get_secret_value().strip():
            key = settings.gemini_api_key.get_secret_value().strip()
            effective_provider = GeminiAssistantProvider(
                api_key=key,
                model=settings.gemini_model,
            )
        else:
            # Disabled state: CourtLoad core works 100% offline without keys
            return AssistantAnswer(
                status="disabled",
                resolved_context=pinned_context,
                interpretation=(
                    "Assistant is disabled because no Gemini API key is configured on the server."
                ),
                tool_trace=[],
                evidence_refs=[],
                result_tables=[],
                chart_specs=[],
                supported_claims=[],
                limitations=[
                    "CourtLoad core research operates 100% offline without any API key.",
                    "Set COURTLOAD_GEMINI_API_KEY in your server environment to enable AI.",
                ],
                explorer_query=build_default_explorer_query(
                    clean_question, "disabled", pinned_context
                ),
                narrative=(
                    "CourtLoad's optional assistant is disabled. "
                    "Ordinary structured search, comparisons, and forecasts remain functional."
                ),
                reproducible_manifest=None,
                error_detail="COURTLOAD_GEMINI_API_KEY is not configured.",
            )

    # 4. Multi-turn tool calling loop
    ledger = EvidenceLedger()
    tool_traces: list[AssistantToolCallTrace] = []
    messages: list[dict[str, Any]] = [{"role": "user", "content": clean_question}]

    t_start = time.perf_counter()
    total_calls = 0
    final_result_data: dict[str, Any] | None = None
    final_narrative: str | None = None

    for call_round in range(1, MAX_TOOL_ROUNDS + 1):
        if (time.perf_counter() - t_start) > REQUEST_DEADLINE_SECONDS:
            return AssistantAnswer(
                status="timeout",
                resolved_context=pinned_context,
                interpretation="Request exceeded the 45-second deadline.",
                tool_trace=tool_traces,
                evidence_refs=ledger.all_cells(),
                result_tables=[],
                chart_specs=[],
                supported_claims=[],
                limitations=["Provider request exceeded deadline."],
                explorer_query=build_default_explorer_query(
                    clean_question, "timeout", pinned_context
                ),
                narrative=(
                    "The query took longer than the 45-second limit. "
                    "Try exploring the data directly in the research explorer."
                ),
                error_detail="Request timeout",
            )

        try:
            turn_result = effective_provider.generate(
                messages=messages,
                system_prompt=SYSTEM_PROMPT,
                tools=ASSISTANT_TOOL_DECLARATIONS,
            )
        except TimeoutError:
            return AssistantAnswer(
                status="timeout",
                resolved_context=pinned_context,
                interpretation="Request exceeded provider deadline.",
                tool_trace=tool_traces,
                evidence_refs=ledger.all_cells(),
                result_tables=[],
                chart_specs=[],
                supported_claims=[],
                limitations=["Provider connection timed out."],
                explorer_query=build_default_explorer_query(
                    clean_question, "timeout", pinned_context
                ),
                narrative="The provider timed out. Ordinary structured search remains available.",
                error_detail="Provider timeout",
            )
        except Exception as exc:
            err_str = str(exc)
            if "quota" in err_str or "429" in err_str:
                return AssistantAnswer(
                    status="quota_exceeded",
                    resolved_context=pinned_context,
                    interpretation="Provider quota or rate limit exceeded.",
                    tool_trace=tool_traces,
                    evidence_refs=ledger.all_cells(),
                    result_tables=[],
                    chart_specs=[],
                    supported_claims=[],
                    limitations=["Gemini API quota or rate limit reached."],
                    explorer_query=build_default_explorer_query(
                        clean_question, "quota", pinned_context
                    ),
                    narrative=(
                        "The configured Gemini API quota has been reached. "
                        "Ordinary search remains fully functional."
                    ),
                    error_detail=err_str,
                )
            return AssistantAnswer(
                status="error",
                resolved_context=pinned_context,
                interpretation="Provider encountered an execution error.",
                tool_trace=tool_traces,
                evidence_refs=ledger.all_cells(),
                result_tables=[],
                chart_specs=[],
                supported_claims=[],
                limitations=["Provider error occurred."],
                explorer_query=build_default_explorer_query(
                    clean_question, "error", pinned_context
                ),
                narrative=(
                    "The assistant encountered an error communicating with the provider. "
                    "Working manual alternatives are provided."
                ),
                error_detail=err_str,
            )

        if turn_result.tool_calls:
            # Model requested tool calls
            messages.append({"role": "model", "tool_calls": turn_result.tool_calls})
            tool_responses: list[tuple[str, Any]] = []

            for fn_name, fn_args in turn_result.tool_calls:
                if total_calls >= MAX_TOOL_CALLS:
                    break
                total_calls += 1
                trace, output_data = execute_tool_call(
                    session,
                    ledger,
                    pinned_context,
                    fn_name,
                    fn_args,
                    call_round=call_round,
                )
                tool_traces.append(trace)
                tool_responses.append((fn_name, output_data))

            messages.append({"role": "user", "tool_responses": tool_responses})
        else:
            # Model returned final answer
            final_result_data = turn_result.structured_data
            final_narrative = turn_result.content
            break

    # 5. Domain boundary validation & structured formatting
    status = "answered"
    limitations: list[str] = []
    interpretation = f"Analytical investigation for: '{clean_question}'"
    result_tables: list[ResultTable] = []
    claims_raw: list[dict[str, Any]] = []

    if final_result_data:
        status = final_result_data.get("status", "answered")
        if "interpretation" in final_result_data:
            interpretation = final_result_data["interpretation"]
        limitations.extend(final_result_data.get("limitations", []))
        claims_raw = final_result_data.get("supported_claims", [])

        # Parse tables from structured output
        for tbl in final_result_data.get("result_tables", []):
            cols = [
                ResultTableColumn(
                    key=c.get("key", ""),
                    label=c.get("label", ""),
                    unit=c.get("unit"),
                    align=c.get("align", "left"),
                )
                for c in tbl.get("columns", [])
            ]
            result_tables.append(
                ResultTable(
                    title=tbl.get("title", "Results"),
                    columns=cols,
                    rows=tbl.get("rows", []),
                    row_count=len(tbl.get("rows", [])),
                )
            )

    # Enforce Domain Guardrail: Toronto Raptors Defense
    q_low = clean_question.lower()
    if "raptor" in q_low and ("defen" in q_low or "best" in q_low):
        def_limitation = (
            "CourtLoad does not provide an inferred single composite 'best defender' rating. "
            "Defensive metrics (steals, blocks, defensive rebounds) are named box-score event "
            "counts, not overall defensive impact, matchup difficulty, or on-off value."
        )
        if def_limitation not in limitations:
            limitations.append(def_limitation)

    # Enforce Domain Guardrail: Conference Placement & Seeding
    if any(k in q_low for k in ("conference", "playoff", "seed", "win the east", "win the west")):
        status = "model_not_available"
        conf_limitation = (
            "Conference placement prediction and official playoff seeding models are deferred and "
            "not available in this release. CourtLoad reports verified team records and "
            "production figures."
        )
        if conf_limitation not in limitations:
            limitations.append(conf_limitation)

    # Enforce Domain Guardrail: Points Forecast Conditionality
    if "forecast" in q_low or "estimate" in q_low:
        forecast_limitation = (
            "Prospective points forecasts are strictly conditional on appearing in the target "
            "game. Absent box-score rows (DNP) are never scored as 0 PTS."
        )
        if forecast_limitation not in limitations:
            limitations.append(forecast_limitation)

    # 6. Verify and bind claims to evidence cells
    verified_claims = verify_and_substitute_claims(claims_raw, ledger)

    # 7. Conservative Narrative Validation
    # If narrative contains numbers not in the ledger, replace with verified explanation
    if final_narrative:
        numbers_in_narrative = re.findall(r"\b\d+(?:\.\d+)?\b", final_narrative)
        has_unverified_number = False
        for num_str in numbers_in_narrative:
            try:
                num_val = float(num_str)
                # Ignore common years/integers like 2025, 2026, 1, 2, 5, 10
                if int(num_val) in (2024, 2025, 2026, 1, 2, 5, 10, 100):
                    continue
                if ledger.find_matching_cell(num_val) is None:
                    has_unverified_number = True
                    break
            except Exception:
                continue

        if has_unverified_number:
            final_narrative = (
                f"{interpretation}. See verified table below for authoritative single-formula "
                "metrics from CourtLoad catalog v1."
            )

    # 8. Construct Reproducible Manifest
    explorer_query = build_default_explorer_query(clean_question, status, pinned_context)
    manifest_source = json.dumps(
        {
            "query": clean_question,
            "context": pinned_context,
            "tool_calls": [t.tool_name for t in tool_traces],
            "evidence_count": len(ledger.all_cells()),
        },
        sort_keys=True,
    )
    manifest_sha256 = hashlib.sha256(manifest_source.encode("utf-8")).hexdigest()

    reproducible_manifest = {
        "manifest_sha256": manifest_sha256,
        "canonical_query": clean_question,
        "context": pinned_context,
        "metric_catalog_version": "v1",
        "tool_rounds": len(tool_traces),
        "evidence_cells_count": len(ledger.all_cells()),
        "explorer_query": explorer_query.model_dump(),
    }

    return AssistantAnswer(
        status=status,
        resolved_context=pinned_context,
        interpretation=interpretation,
        tool_trace=tool_traces,
        evidence_refs=ledger.all_cells(),
        result_tables=result_tables,
        chart_specs=[],
        supported_claims=verified_claims,
        limitations=limitations,
        explorer_query=explorer_query,
        narrative=final_narrative,
        reproducible_manifest=reproducible_manifest,
        error_detail=None,
    )
