"""Bounded single-call Gemini planning; no tools, grounding, or provider-written findings."""

from __future__ import annotations

import json
import math
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from typing import Any, Protocol

from courtload.domain.conversation import AnalysisPlan

PLANNER_PROMPT = """Plan a CourtLoad read-only investigation using the AnalysisPlan JSON schema.
Apply these decisions in order:
1. Requests for SQL (including SELECT), shell/code, keys, writes, refresh, training,
or web/internet access are unsupported with capability and no steps. Do not reinterpret
them as a database question even if a similar read-only operation exists.
2. Incomplete teammate-absence and with/without questions require clarification_required
with floor_or_game: ask whether the user means game attendance or shared court time.
Clarify this meaning before deciding whether the required source/operation is available.
3. A best-defender or best-defensive-player question with no explicitly selected metric
requires clarification_required with defense_metric and no steps. This applies even when
the team or player identity is known. Never choose steals, blocks or a composite for them.
A consistency question without a selected dispersion/frequency definition similarly
requires clarification_required with consistency. A known cohort does not resolve meaning.
An explicit question about how variable a named player's scoring and/or minutes have
been is different: use historical distribution for the named metric(s), with defaults.
Scoring-only variability requires one distribution step with metric pts; minutes-only
variability requires one with metric min_per_game. Do not add an unrequested metric.
Scoring and minutes together require two independent distribution steps, metrics pts
and min_per_game. Return the full descriptive summaries; no extra definition choice.
4. Unsupported capabilities or filters, including guard/forward/center position filters,
are unsupported with capability. Do not drop the restriction or ask which player.
5. Resolve analytical ambiguity, then choose registered operations and minimal arguments.
Use only the supplied registry and catalog metric keys. The server executes all arithmetic.
Do not produce prose findings, tables, SQL, URLs, web/source requests, writes, or credentials.
Context is pinned and already resolved by the server from the message, including relative
phrases such as "last season" or "this season", using the supplied today date. Your own
notion of the current NBA season may be outdated: never recompute the season from memory.
Set context_changes to null; never hide a season/phase/date in operation arguments either.
Return clarification_required for material ambiguity. Do not infer unavailable outcomes or
refuse supported research from the season label: the server checks coverage.
If rejected_previous_attempt is present, your previous plan failed server validation for
that reason; return a corrected complete plan.
Recent means last 10 appearances versus previous 10 for change. Similar means the registered
statistical/workload profile, never projected or tactical similarity. Consistent needs a
choice of scoring spread, workload spread, or threshold frequency.
Best defender needs a
named admitted metric. With/without needs game attendance versus on-court clarification.
Follow-ups transform previous_plan into a complete new validated plan, retaining canonical
entity IDs, filters, metrics and scope unless explicitly changed. Unsupported filters (such
as positions without admitted dated metadata), unavailable overall ratings, causal claims,
team winner forecasts or source-dependent operations return unsupported with capability.
Missing rows are unknown, not zeros, injuries or confirmed absence. The registry explicitly
defines valid samples. Do not imply that a limited result page covers every eligible row.
For ALL query operations, set page to {"limit": 10} unless a different count is requested.
This overrides the general QuerySpec schema's page default of 50.
For a table, list or ranking about a named metric, metric_selectors contains ONLY the
requested metric(s), and sort uses the primary requested metric descending unless the
user requests another order. "Scoring" means pts_per_game unless totals or another
scoring definition are explicit. "Show scoring" and "show the scoring table" therefore
select only pts_per_game and sort by pts_per_game descending; they do not request minutes.
Select min_per_game alongside scoring only when the user explicitly requests both metrics.
A games/minutes eligibility threshold is a sample filter, not a displayed metric.
These rules also apply to the analytical clause of a mixed knowledge/analysis question.
All query metric selectors use normalization 'raw', even keys ending in _per_game:
the metric key already defines the unit and must not be normalized a second time.
Only supply arguments explicitly requested; omit optional defaults rather than inventing
columns, sort orders, filters or result limits. Only a query with no requested metric uses
the generic defaults: omitted metric_selectors become pts_per_game and min_per_game,
and omitted sort is pts descending. Named-metric requests must set selectors and sort
explicitly as above rather than relying on these generic defaults. A minutes sample
threshold changes sample_filters.min_minutes, not the sort or displayed metrics.
For other operations retain their registry defaults unless the question requests a change.
In particular similarity defaults to top_k 5 and workload_shifts defaults to limit 20;
the query page limit 10 does not apply to these operations. Prefer omitting these fields.
For player profile summaries, use operation 'profile' with player_id (pass the player name if
numeric ID is unknown; entity resolution is handled server-side).
The same server-side name resolution applies to every player selection argument. Pass
the supplied full name without inventing an ID or asking the user for a numeric ID.
For ambiguous partial names, return clarification_required with identity; do not replace
identity resolution with a name-filter query. Referents use the prior canonical selection.
For player comparisons, use operation 'compare' with player_a and player_b.
For statistical similarity to a player, use operation 'similarity' with target_player_id.
For recent versus previous player windows, use operation 'compare_periods' with player_id.
For registered prospective forecasts, use operation 'forecast' with player_id.
For observed team outcomes, use operation 'team' with team_id from the supplied teams
catalog. Team participation queries use query.team_scope.team_id from that catalog.
Requests to execute SQL, read credentials/keys, or refresh data return unsupported with capability.
Requests for internet/web search, arbitrary code, training or writes also return unsupported
with capability. Never translate a prohibited request into a different permitted query.
Contracts, payroll, and salary queries without an admitted contract book ID return unsupported
with capability.
Always include the steps array with the operation step(s) when status is execute.
Set plan_version to 'courtload-analysis-plan-v1'.
"""


@dataclass(frozen=True)
class PlanningOutput:
    data: dict[str, Any]
    usage: dict[str, int] = field(default_factory=dict)


class PlanProvider(Protocol):
    def plan(self, payload: str, *, timeout_seconds: float) -> PlanningOutput: ...


class ProviderFailure(RuntimeError):
    def __init__(self, kind: str, retry_after: int | None = None) -> None:
        super().__init__(kind)
        self.kind = kind
        self.retry_after = retry_after


class GeminiPlanProvider:
    def __init__(self, api_key: str, model: str) -> None:
        self._key = api_key
        self.model = model
        self.observed_model_version: str | None = None

    def plan(self, payload: str, *, timeout_seconds: float) -> PlanningOutput:
        self.observed_model_version = None
        from google import genai
        from google.genai import types

        # SDK retries are disabled: quota/errors never silently multiply user-turn calls.
        schema = dict(AnalysisPlan.model_json_schema())
        schema["required"] = ["plan_version", "status", "steps", "output_kind"]
        with genai.Client(
            api_key=self._key,
            http_options=types.HttpOptions(
                timeout=max(1, math.floor(timeout_seconds * 1000)),
                retry_options=types.HttpRetryOptions(attempts=1),
            ),
        ) as client:
            try:
                response = client.models.generate_content(
                    model=self.model,
                    contents=payload,
                    config=types.GenerateContentConfig(
                        system_instruction=PLANNER_PROMPT,
                        automatic_function_calling=types.AutomaticFunctionCallingConfig(
                            disable=True
                        ),
                        temperature=0,
                        max_output_tokens=2000,
                        response_mime_type="application/json",
                        response_json_schema=schema,
                    ),
                )
            except Exception as exc:
                code = getattr(exc, "code", None)
                if code == 429:
                    headers = getattr(getattr(exc, "response", None), "headers", {})
                    try:
                        retry = max(1, min(86400, int(headers.get("Retry-After", "60"))))
                    except (TypeError, ValueError):
                        try:
                            retry_at = parsedate_to_datetime(headers.get("Retry-After", ""))
                            retry = max(
                                1,
                                min(
                                    86400, math.ceil((retry_at - datetime.now(UTC)).total_seconds())
                                ),
                            )
                        except (TypeError, ValueError):
                            retry = 60
                    raise ProviderFailure("quota_exceeded", retry) from None
                if code == 503:
                    raise ProviderFailure("busy") from None
                if "timeout" in type(exc).__name__.lower():
                    raise TimeoutError("provider timeout") from None
                raise ProviderFailure("provider_error") from None
        version = getattr(response, "model_version", None)
        self.observed_model_version = version[:128] if isinstance(version, str) else None
        raw = response.text or ""
        if len(raw.encode()) > 32 * 1024:
            raise ProviderFailure("provider_error")
        try:
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError("expected plan object")
            if data.get("plan_version") != "courtload-analysis-plan-v1":
                data["plan_version"] = "courtload-analysis-plan-v1"
        except (ValueError, TypeError):
            raise ProviderFailure("provider_error") from None
        usage = {}
        if response.usage_metadata:
            for key in ("prompt_token_count", "candidates_token_count", "total_token_count"):
                value = getattr(response.usage_metadata, key, None)
                if isinstance(value, int):
                    usage[key] = value
        return PlanningOutput(data=data, usage=usage)
