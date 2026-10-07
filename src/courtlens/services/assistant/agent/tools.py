"""Typed, read-only agent tools; compact provider payloads and retained exact evidence."""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from datetime import date
from functools import lru_cache, reduce
from operator import or_
from typing import Annotated, Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field, TypeAdapter, create_model, field_validator
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session

from courtlens.domain.conversation import (
    ConversationContext,
    OperationResult,
    OperationStep,
    StrictModel,
)
from courtlens.domain.finance_query import FinanceQuery
from courtlens.domain.metrics import METRIC_CATALOG, METRIC_CATALOG_VERSION
from courtlens.services.assistant import awards, knowledge, operations
from courtlens.services.assistant.agent.providers.base import ToolCall, ToolDeclaration, ToolResult
from courtlens.services.assistant.defaults import civil_today, last_completed_season
from courtlens.services.assistant.execution import execute_bounded, query_deadline
from courtlens.services.assistant.rendering import render_result
from courtlens.services.assistant.tools import resolve_player_identifier
from courtlens.services.starting_positions import PositionEvidenceUnavailable
from courtlens.services.stats_catalog import stats_catalog_scope
from courtlens.services.stats_engine import COLUMN_MAP
from courtlens.services.workbench_analytics import (
    ResolvedContext,
    canonical_hash,
    resolve_workbench_context,
)

MAX_ARGUMENT_BYTES = 16 * 1024
MAX_PAYLOAD_BYTES = 64 * 1024
MAX_ROWS = 25


class StatsScope(StrictModel):
    season: str | None = None
    phase: (
        Literal["regular_season", "playoffs", "preseason", "play_in", "cup_final", "summer_league"]
        | None
    ) = None
    before_date: date | None = None

    @field_validator("season")
    @classmethod
    def valid_season(cls, value: str | None) -> str | None:
        if value in (None, "last_season", "last season"):
            return value
        # Reuse the canonical season syntax, then reject nonconsecutive years.
        ConversationContext(season=value)
        assert value is not None
        if int(value[-2:]) != (int(value[:4]) + 1) % 100:
            raise ValueError("season must be consecutive")
        return value


@lru_cache(maxsize=1)
def _stats_adapter() -> TypeAdapter[Any]:
    # Keep the registry's argument types and validators rather than a second schema list.
    variants = [
        create_model(
            "AgentStats" + name.title().replace("_", ""),
            __base__=StatsScope,
            operation=(Literal[name], ...),
            arguments=(operation.schema, ...),
        )
        for name, operation in operations.REGISTRY.items()
        if name != "finance"
    ]
    variant_union = reduce(or_, variants)
    return TypeAdapter(Annotated[variant_union, Field(discriminator="operation")])


class LookupArgs(StrictModel):
    query: str = Field(min_length=1, max_length=100, pattern=r"^[\w\s.'\u2019\-]+$")


class MetricsArgs(StrictModel):
    key: str | None = Field(None, max_length=80)
    category: str | None = Field(None, max_length=80)
    offset: int = Field(0, ge=0, le=1000)


class AwardsArgs(StrictModel):
    award: Literal["mvp", "dpoy", "finals_mvp", "roy", "smoy", "mip", "clutch", "coy", "champion"]
    season: str | None = None

    @field_validator("season")
    @classmethod
    def valid_season(cls, value: str | None) -> str | None:
        return StatsScope.valid_season(value)


class HelpArgs(StrictModel):
    topic: str | None = Field(None, max_length=100)


_MODELS: dict[str, type[BaseModel]] = {
    "lookup_entity": LookupArgs,
    "list_metrics": MetricsArgs,
    "awards": AwardsArgs,
    "finance": FinanceQuery,
    "site_help": HelpArgs,
}
_DESCRIPTIONS = {
    "query_stats": (
        "Execute a registered warehouse operation. Supply operation and its arguments. "
        "The server pins the release; optional season, phase and before_date select scope. "
        "last_season means the latest completed season. Errors are recoverable. "
        "Numbers, units, samples and equivalent-analysis links come from exact evidence."
    ),
    "lookup_entity": (
        "Resolve a player name, typo or NBA ID. Returns close candidates; choose an ID "
        "and state the assumed identity instead of asking the user."
    ),
    "list_metrics": (
        "List catalog definitions, units and observed season/phase coverage. Optional key "
        "or category filters; paginate with offset. Coverage does not certify complete seasons."
    ),
    "awards": "Look up a season award or champion in the hashed NBA.com registry; no web fetch.",
    "finance": (
        "Read an immutable contract book. Requires book_id, financial_season, known_at and "
        "effective_on. Independent of basketball scope. Unknown money stays unknown."
    ),
    "site_help": "CourtLens guide and routes. Omit topic for a topic index; pass its key for text.",
}


def declarations() -> list[ToolDeclaration]:
    # Native SDKs expect a JSON object at the function-parameters root. The generated
    # discriminated union still validates each operation and its own argument model.
    stats_schema = {"type": "object", **_stats_adapter().json_schema()}
    return [
        ToolDeclaration(
            name=name,
            description=description,
            parameters=stats_schema if name == "query_stats" else _MODELS[name].model_json_schema(),
        )
        for name, description in _DESCRIPTIONS.items()
    ]


@dataclass(frozen=True)
class DispatchedTool:
    result: ToolResult
    full_payload: dict[str, Any]
    warehouse_result: OperationResult | None = None
    context: ResolvedContext | None = None


class ToolError(ValueError):
    def __init__(self, code: str, message: str, **details: Any) -> None:
        super().__init__(message)
        self.code = code
        self.details = details


def _compact(value: Any, path: str, truncated: dict[str, int]) -> Any:
    if isinstance(value, dict):
        return {key: _compact(item, path + "/" + key, truncated) for key, item in value.items()}
    if isinstance(value, list):
        if len(value) > MAX_ROWS:
            truncated[path] = len(value)
        return [_compact(item, path + "/" + str(i), truncated) for i, item in enumerate(value[:25])]
    if isinstance(value, float):
        return round(value, 4)
    return value


def _error(call: ToolCall, code: str, message: str, **details: Any) -> DispatchedTool:
    payload = {"error": {"code": code, "message": message, "recoverable": True, **details}}
    truncated: dict[str, int] = {}
    compact = _compact(payload, "", truncated)
    if truncated:
        compact["truncated_lists"] = truncated
    return DispatchedTool(
        ToolResult(call_id=call.id, name=call.name, payload=compact, is_error=True), payload
    )


def _scope(
    session: Session, args: StatsScope, selections: ConversationContext | None, as_of: date
) -> ResolvedContext:
    inherited = selections or ConversationContext()
    season = args.season or inherited.season or last_completed_season(as_of)
    if season in ("last_season", "last season"):
        season = last_completed_season(as_of)
    context = resolve_workbench_context(
        session,
        release_id=inherited.release_id,
        requested_season=season,
        requested_phase=args.phase or inherited.phase,
        requested_before_date=args.before_date
        or (inherited.before_date if inherited.season == season else None),
        requested_window=inherited.window,
    )
    available = stats_catalog_scope(session, context)["stats_scopes"]
    if not any(
        row["season"] == context.season and row["phase"] == context.phase for row in available
    ):
        raise ToolError(
            "unsupported_scope",
            "The requested season/phase has no observed warehouse coverage.",
            requested={"season": context.season, "phase": context.phase},
            available_scopes=available,
        )
    return context


def _empty_error(operation: str, data: dict[str, Any]) -> None:
    if operation in ("query", "position_query") and not data["items"]:
        raise ToolError("no_observations", "No observations match this query before the cutoff.")
    if operation == "profile" and not data["summaries"]["season"].get("gp"):
        raise ToolError("no_observations", "No confirmed appearances before the cutoff.")
    if operation == "team" and not data["record"]["games_played"]:
        raise ToolError("no_observations", "No observed team games before the cutoff.")
    if operation == "forecast" and data.get("status") == "no_issuance":
        raise ToolError("no_issuance", "No registered forecast issuance for this scope.")
    if operation == "distribution" and not data["summary"]["summary_available"]:
        raise ToolError(
            "insufficient_sample",
            "A distribution requires five valid observations.",
            sample=data["summary"],
        )


def _warehouse_payload(result: OperationResult, context: ResolvedContext | None) -> dict[str, Any]:
    units = {cell.metric: cell.unit for cell in result.evidence}
    return {
        "operation": result.operation,
        "arguments": result.arguments,
        "operation_hash": result.operation_hash,
        "result_hash": result.result_hash,
        "context_fingerprint": result.evidence[0].context_fingerprint
        if result.evidence
        else canonical_hash(context.to_dict() if context else result.data["context"]),
        "scope": context.to_dict() if context else result.data["context"],
        "units": units,
        "data": result.data,
        "open_url": result.open_url,
        "limitations": result.limitations,
    }


def _run(
    session: Session,
    call: ToolCall,
    selections: ConversationContext | None,
    as_of: date,
    deadline: float,
) -> tuple[dict[str, Any], OperationResult | None, ResolvedContext | None]:
    arguments = call.arguments
    if call.name == "query_stats":
        # Older nested Pydantic models ignore extras. Reject them before parsing, recursively.
        name = arguments.get("operation")
        if name not in operations.REGISTRY or name == "finance":
            raise ToolError(
                "unknown_operation", "Use a declared stats operation; finance is separate."
            )
        schema = operations.REGISTRY[name].schema.model_json_schema()
        operations.reject_unknown_fields(schema, arguments.get("arguments", {}), schema)
        parsed = _stats_adapter().validate_python(arguments)
        scope = StatsScope.model_validate(parsed.model_dump(exclude={"operation", "arguments"}))
        context = _scope(session, scope, selections, as_of)
        args = parsed.arguments.model_dump(mode="json", exclude_unset=True)
        if name == "query" and "window" not in args:
            args["window"] = {"kind": context.window}
        if name == "position_query" and "window" not in args["query"]:
            args["query"]["window"] = {"kind": context.window}
        step = operations.canonical_step(
            session, context, OperationStep(step_id="agent_tool", operation=name, arguments=args)
        )
        data = execute_bounded(session, context, step, deadline)
        _empty_error(name, data)
        result = render_result(step, context, data, canonical_hash(context.to_dict()))
        return _warehouse_payload(result, context), result, context
    if call.name not in _MODELS:
        raise ToolError("unknown_tool", "This tool is not available.")
    schema = _MODELS[call.name].model_json_schema()
    operations.reject_unknown_fields(schema, arguments, schema)
    parsed = _MODELS[call.name].model_validate(arguments)
    if isinstance(parsed, LookupArgs):
        try:
            player_id, label = resolve_player_identifier(
                session,
                parsed.query,
                max_typo_distance=3 if len(parsed.query.strip()) >= 7 else None,
            )
            candidates = [{"player_id": player_id, "name": label}]
        except operations.EntityClarification as exc:
            candidates = [{"player_id": c["value"], "name": c["label"]} for c in exc.choices]
        except ValueError:
            raise ToolError(
                "unknown_entity", "No close NBA player identity matches this query."
            ) from None
        return {"query": parsed.query, "candidates": candidates}, None, None
    if isinstance(parsed, MetricsArgs):
        context = resolve_workbench_context(
            session, release_id=selections.release_id if selections else None
        )
        scopes = stats_catalog_scope(session, context)["stats_scopes"]
        entries = [
            {
                **metric.to_dict(),
                "queryable": metric.key in COLUMN_MAP
                and metric.capability_requirement == "core_stats",
                "observed_scopes": [row for row in scopes if row["phase"] in metric.phase_scope]
                if metric.key in COLUMN_MAP and metric.capability_requirement == "core_stats"
                else [],
            }
            for metric in METRIC_CATALOG.values()
            if (parsed.key is None or metric.key == parsed.key)
            and (parsed.category is None or metric.category == parsed.category)
        ]
        if not entries:
            raise ToolError("unknown_metric", "No catalog metrics match this selection.")
        rows = entries[parsed.offset : parsed.offset + MAX_ROWS]
        return (
            {
                "catalog_version": METRIC_CATALOG_VERSION,
                "release_id": context.release_id,
                "metrics": rows,
                "total_metrics": len(entries),
                "next_offset": parsed.offset + MAX_ROWS
                if parsed.offset + MAX_ROWS < len(entries)
                else None,
                "coverage_note": (
                    "Observed scopes, not complete-season or per-cell validity certification."
                ),
            },
            None,
            context,
        )
    if isinstance(parsed, AwardsArgs):
        season = parsed.season or last_completed_season(as_of)
        if season in ("last_season", "last season"):
            season = last_completed_season(as_of)
        labels = {
            "roy": "rookie of the year",
            "smoy": "sixth man",
            "mip": "most improved",
            "clutch": "clutch player",
            "coy": "coach of the year",
            "finals_mvp": "finals mvp",
        }
        answer = awards.lookup(f"{labels.get(parsed.award, parsed.award)} {season}", as_of)
        if answer is None or answer.record is None:
            raise ToolError(
                "source_unavailable", "The pinned award registry does not cover this season/award."
            )
        source, fact = awards.award_source(answer)
        return (
            {
                "record": answer.record,
                "source": source.model_dump(mode="json"),
                "fact": fact.model_dump(mode="json"),
            },
            None,
            None,
        )
    if isinstance(parsed, FinanceQuery):
        step = OperationStep(
            step_id="agent_tool", operation="finance", arguments=parsed.model_dump(mode="json")
        )
        data = execute_bounded(session, None, step, deadline)
        result = render_result(step, None, data, canonical_hash(data["context"]))
        return _warehouse_payload(result, None), result, None
    assert isinstance(parsed, HelpArgs)
    guide_entries = knowledge.registry()
    if parsed.topic is None:
        return (
            {
                "version": knowledge.REGISTRY_VERSION,
                "topics": [
                    {"key": entry.key, "title": entry.title, "routes": list(entry.routes)}
                    for entry in guide_entries
                ],
            },
            None,
            None,
        )
    entry = next(
        (item for item in guide_entries if item.key == parsed.topic), None
    ) or knowledge.retrieve(parsed.topic)
    if entry is None:
        raise ToolError(
            "unknown_topic", "No guide topic matches. Call site_help without a topic for the index."
        )
    return (
        {
            "key": entry.key,
            "text": entry.text,
            "routes": list(entry.routes),
            "source": entry.source().model_dump(mode="json"),
        },
        None,
        None,
    )


def dispatch(
    session: Session,
    call: ToolCall,
    *,
    selections: ConversationContext | None = None,
    as_of: date | None = None,
    deadline: float | None = None,
) -> DispatchedTool:
    """The sole dispatch seam. Validation/execution failures are data for the next agent step."""
    deadline = min(
        deadline if deadline is not None else time.monotonic() + 20, time.monotonic() + 20
    )
    try:
        if time.monotonic() >= deadline:
            raise TimeoutError("tool deadline")
        if len(json.dumps(call.arguments, allow_nan=False).encode()) > MAX_ARGUMENT_BYTES:
            raise ToolError("invalid_arguments", "Tool arguments exceed the payload limit.")
        # A failed parent resolution query must not poison the next tool call's transaction.
        with session.begin_nested(), query_deadline(session, deadline):
            payload, warehouse, context = _run(
                session, call, selections, as_of or civil_today(), deadline
            )
        if time.monotonic() >= deadline:
            raise TimeoutError("tool deadline")
        truncated: dict[str, int] = {}
        compact = _compact(payload, "", truncated)
        if truncated:
            compact["truncated_lists"] = truncated
        if len(json.dumps(compact, allow_nan=False).encode()) > MAX_PAYLOAD_BYTES:
            raise ToolError("result_too_large", "Narrow the operation or selected metrics.")
        return DispatchedTool(
            ToolResult(call_id=call.id, name=call.name, payload=compact),
            payload,
            warehouse,
            context,
        )
    except ToolError as exc:
        return _error(call, exc.code, str(exc), **exc.details)
    except operations.EntityClarification as exc:
        return _error(
            call,
            "ambiguous_entity",
            "Choose a returned player ID and state the assumption.",
            field=exc.field,
            candidates=exc.choices,
        )
    except PositionEvidenceUnavailable:
        return _error(
            call, "source_unavailable", "Release-bound starting-position evidence is unavailable."
        )
    except awards.AwardsUnavailable:
        return _error(call, "source_unavailable", "The awards registry failed its integrity check.")
    except TimeoutError:
        return _error(call, "timeout", "The read-only tool exceeded its execution deadline.")
    except HTTPException as exc:
        code = {404: "no_observations", 413: "result_too_large", 503: "source_unavailable"}.get(
            exc.status_code, "invalid_arguments"
        )
        return _error(call, code, "The requested data or scope is unavailable.")
    except (ValueError, TypeError, RecursionError):
        return _error(
            call,
            "invalid_arguments",
            "Arguments must match the declared tool schema and pinned scope.",
        )
    except (DBAPIError, RuntimeError, EOFError, OSError):
        return _error(call, "execution_failed", "The read-only tool could not complete.")
