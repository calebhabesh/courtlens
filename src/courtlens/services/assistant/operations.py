"""Schema-derived read-only registry, canonical execution, and equivalent navigation."""

from __future__ import annotations

import json
import time
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal
from urllib.parse import urlencode

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.domain.analytical_ops import (
    INITIAL_SIMILARITY_DIMENSIONS,
    ComparePeriodsRequest,
    DistributionRequest,
    SplitProfileRequest,
    StatisticalPeersRequest,
)
from courtlens.domain.conversation import OperationStep, StrictModel
from courtlens.domain.entity_lookup import (
    IndexedEntity,
    generate_player_aliases,
    normalize_lookup_text,
    score_entity_match,
    tokenize_lookup_text,
)
from courtlens.domain.finance_query import FinanceQuery
from courtlens.domain.impact_catalog import SERVING_CATALOG as METRIC_CATALOG
from courtlens.domain.metrics import METRIC_CATALOG_VERSION
from courtlens.domain.query_spec import QuerySpec
from courtlens.domain.query_url import serialize_query_to_url_string
from courtlens.services import analytical_ops
from courtlens.services.finance_query import finance_query
from courtlens.services.stats_engine import execute_stats_query
from courtlens.services.workbench_analytics import (
    ResolvedContext,
    _load_player_games,
    canonical_hash,
    compare_players,
    get_player_profile,
    get_team_detail,
)
from courtlens.services.workbench_forecasts import (
    get_forecast_issuance_detail,
)
from courtlens.workbench_models import ForecastIssuance, WorkbenchIdentity


class DefinitionArgs(StrictModel):
    metric: str


class PlayerArgs(StrictModel):
    player_id: str


class CompareArgs(StrictModel):
    player_a: str
    player_b: str


class TeamArgs(StrictModel):
    team_id: str = Field(pattern=r"^[0-9]{10}$")


class ForecastArgs(StrictModel):
    player_id: str
    issuance_id: str | None = Field(None, pattern=r"^[a-f0-9-]{36}$")


class ShiftsArgs(StrictModel):
    period_n: int = Field(10, ge=5, le=41)
    min_minutes: float = Field(0, ge=0, le=10000)
    limit: int = Field(20, ge=1, le=100)
    # Position evidence is not admitted by this operation; never infer it from a name/role.


class PositionQueryArgs(StrictModel):
    position: Literal["guard", "forward", "center"]
    query: QuerySpec


@dataclass(frozen=True)
class Operation:
    schema: type[BaseModel]
    description: str
    entity_fields: tuple[str, ...] = ()
    version: str = "courtload-assistant-operations-v1"


REGISTRY = {
    "finance": Operation(
        FinanceQuery,
        (
            "Explicit immutable contract book and financial year, effective date and known-at. "
            "Separate from basketball context. Unknown money stays unknown; no inferred cap room."
        ),
    ),
    "profile": Operation(
        PlayerArgs,
        "Historical player summaries under the pinned cutoff; no future outcomes.",
        ("player_id",),
    ),
    "compare": Operation(
        CompareArgs,
        "Aligned descriptive comparison without a forced winner.",
        ("player_a", "player_b"),
    ),
    "team": Operation(
        TeamArgs, "Observed team outcomes and participation, not current roster or seed evidence."
    ),
    "forecast": Operation(
        ForecastArgs,
        "Registered prospective points issuance with separate actual "
        "inputs; conditional on appearance.",
        ("player_id",),
    ),
    "query": Operation(
        QuerySpec, "SQL Stats ranking; named metrics and valid samples, nulls preserved."
    ),
    "position_query": Operation(
        PositionQueryArgs,
        (
            "Stats ranking restricted to guards, forwards or centers by release-bound starting "
            "position: the G/F/C box-score position in most of a player's starts this season "
            "before the cutoff. Bench-only players are unlabelled. No PG/SG distinction."
        ),
    ),
    "definition": Operation(
        DefinitionArgs, "Catalog metric definition/formula/unit; no statistical query."
    ),
    "compare_periods": Operation(
        ComparePeriodsRequest, "Disjoint recent/previous appearances, with samples.", ("player_id",)
    ),
    "distribution": Operation(
        DistributionRequest,
        "Historical distribution, type-7 quantiles and population SD; n >= 5.",
        ("player_id",),
    ),
    "splits": Operation(
        SplitProfileRequest,
        "Historical venue/rest/opponent splits; descriptive, not causal.",
        ("player_id",),
    ),
    "similarity": Operation(
        StatisticalPeersRequest,
        "Statistical production/workload peers; standardized dimensions, not projected playstyle.",
        ("target_player_id",),
    ),
    "workload_shifts": Operation(
        ShiftsArgs,
        "Last N versus previous N appearances; minutes/game increased and "
        "points/game did not increase, both periods complete. No position "
        "filter.",
    ),
}

CONTEXT_FIELDS = ("release_id", "season", "phase", "before_date")


class EntityClarification(ValueError):
    def __init__(self, field: str, choices: list[dict[str, str]]) -> None:
        super().__init__("Choose a canonical player identity.")
        self.field = field
        self.choices = choices


def reject_unknown_fields(
    schema: dict[str, Any], value: Any, root: dict[str, Any], depth: int = 0
) -> None:
    """Reject ignored nested fields before calling older permissive query/operation schemas."""
    if depth > 12:
        raise ValueError("argument nesting exceeds the planning limit")
    if "$ref" in schema:
        schema = root["$defs"][schema["$ref"].rsplit("/", 1)[-1]]
    if "anyOf" in schema:
        for variant in schema["anyOf"]:
            if variant.get("type") == "null":
                if value is None:
                    return
                continue
            try:
                reject_unknown_fields(variant, value, root, depth + 1)
                return
            except ValueError:
                continue
        raise ValueError("unknown fields in all argument schema alternatives")
    if isinstance(value, dict) and "properties" in schema:
        properties = schema["properties"]
        if set(value) - set(properties):
            raise ValueError("unknown operation argument")
        for key, item in value.items():
            reject_unknown_fields(properties[key], item, root, depth + 1)
    elif isinstance(value, list):
        for item in value:
            reject_unknown_fields(schema.get("items", {}), item, root, depth + 1)


def resolve_entity(
    session: Session,
    context: ResolvedContext | None,
    value: str,
    field: str,
    *,
    max_typo_distance: int | None = None,
) -> str:
    if len(value) > 100 or not value.strip():
        raise ValueError("invalid player selection")
    identities = list(
        session.scalars(
            select(WorkbenchIdentity)
            .where(WorkbenchIdentity.namespace == "nba", WorkbenchIdentity.kind == "player")
            .limit(10001)
        )
    )
    if len(identities) > 10000:
        raise ValueError("identity catalog budget exceeded")
    if value.isdigit():
        matches = [i for i in identities if i.external_id == value]
        if len(matches) != 1:
            raise ValueError("unknown canonical NBA player identity")
        return value
    normalized = normalize_lookup_text(value)
    candidates = []
    for identity in identities:
        entity = IndexedEntity(
            id=identity.external_id,
            kind="player",
            canonical_id=identity.external_id,
            display_name=identity.display_name,
            display_name_norm=normalize_lookup_text(identity.display_name),
            aliases_norm=tuple(
                generate_player_aliases(
                    identity.display_name, identity.metadata_json.get("aliases", [])
                )
            ),
            tokens=tuple(tokenize_lookup_text(identity.display_name)),
            subtitle=None,
            portrait_url=None,
            portrait_fallback=None,
            base_destination="",
        )
        match = score_entity_match(
            entity, normalized, tokenize_lookup_text(value), max_typo_distance=max_typo_distance
        )
        if match:
            candidates.append((match[0], match[1], entity))
    exact = [entity for basis, _, entity in candidates if basis == "exact"]
    if len(exact) == 1:
        return exact[0].canonical_id
    if not candidates:
        raise ValueError("no matching canonical NBA player identity")
    candidates.sort(key=lambda item: (-item[1], item[2].display_name_norm, item[2].id))
    raise EntityClarification(
        field,
        [
            {"value": entity.canonical_id, "label": entity.display_name}
            for _, _, entity in candidates[:20]
        ],
    )


def canonical_step(
    session: Session, context: ResolvedContext, step: OperationStep
) -> OperationStep:
    operation = REGISTRY.get(step.operation)
    if operation is None:
        raise ValueError("operation is unavailable in this registry")
    args = dict(step.arguments)
    if step.operation == "position_query":
        if set(args) - {"position", "query"}:
            raise ValueError("unknown operation argument")
        # The nested ranking passes exactly the same validation as a plain query step.
        inner = canonical_step(
            session,
            context,
            OperationStep(
                step_id=step.step_id, operation="query", arguments=dict(args.get("query") or {})
            ),
        )
        parsed_position = PositionQueryArgs.model_validate(
            {"position": args.get("position"), "query": inner.arguments}
        )
        return step.model_copy(update={"arguments": parsed_position.model_dump(mode="json")})
    schema = operation.schema.model_json_schema()
    validation_args = dict(args)
    if step.operation == "query":
        validation_args.pop("impact_manifest_sha256", None)
    reject_unknown_fields(schema, validation_args, schema)
    if len(json.dumps(args).encode()) > 16 * 1024:
        raise ValueError("operation argument payload exceeds limit")
    for field in CONTEXT_FIELDS:
        if field not in operation.schema.model_fields:
            continue
        pinned = (
            context.before_date.isoformat() if field == "before_date" else getattr(context, field)
        )
        if args.get(field) is not None and str(args[field]) != str(pinned):
            raise ValueError("operation cannot silently change pinned context")
        args[field] = pinned
    for field in operation.entity_fields:
        if field in args:
            args[field] = resolve_entity(session, context, str(args[field]), field)
    if step.operation == "query" and args.get("entity_kind") == "player_season":
        args["entity_kind"] = "player"
    if step.operation == "distribution" and args.get("metric") == "min":
        args["metric"] = "min_per_game"
    parsed = operation.schema.model_validate(args)
    canonical = parsed.model_dump(mode="json")
    if step.operation == "query":
        query = QuerySpec.model_validate(canonical)
        if (
            query.entity_kind != "player"
            or query.season_scope.seasons
            or query.team_scope.current_roster_only
            or query.page.cursor
            or query.window.kind
            not in ("season", "last_5", "last_10", "last_n_appearances", "date_range")
            or query.sample_filters.min_possessions is not None
            or query.sample_filters.min_attempts is not None
        ):
            raise ValueError("unsupported Stats planning scope")
        if any(
            m.version not in (None, METRIC_CATALOG[m.key].version) or m.normalization != "raw"
            for m in query.metric_selectors
        ):
            raise ValueError("use actual catalog metric keys and current versions")
        if len(query.metric_selectors) > 12:
            raise ValueError("too many selected metrics")
        if not query.metric_selectors:
            canonical["metric_selectors"] = [{"key": "pts_per_game"}, {"key": "min_per_game"}]
        from courtlens.services.impact_serving import impact_for_query, query_uses_impact

        if query_uses_impact(query) and query.impact_manifest_sha256 is None:
            impact = impact_for_query(query, context.before_date.isoformat())
            if impact["manifest_sha256"]:
                canonical["impact_manifest_sha256"] = impact["manifest_sha256"]
        if query.team_scope.team_id:
            from courtlens.domain.teams import get_team_info

            if get_team_info(query.team_scope.team_id) is None:
                raise ValueError("unknown canonical team identity")
    metric_keys = []
    if "metric" in canonical:
        metric_keys.append(canonical["metric"])
    metric_keys.extend(canonical.get("metrics") or [])
    if any(m not in METRIC_CATALOG for m in metric_keys):
        raise ValueError("unknown metric")
    if step.operation == "distribution" and canonical["metric"] not in (
        "pts",
        "reb",
        "ast",
        "stl",
        "blk",
        "tov",
        "min_per_game",
    ):
        raise ValueError("distribution requires a supported per-appearance metric")
    if step.operation == "similarity":
        dims = canonical.get("dimensions") or INITIAL_SIMILARITY_DIMENSIONS
        if len(dims) > 8 or not dims or any(d not in INITIAL_SIMILARITY_DIMENSIONS for d in dims):
            raise ValueError("unsupported statistical similarity dimensions")
    if step.operation == "compare_periods":
        if canonical["mode"] != "appearances":
            dates = [
                canonical.get(k)
                for k in ("period_a_from", "period_a_to", "period_b_from", "period_b_to")
            ]
            if any(d is None for d in dates):
                raise ValueError("period dates are required")
            a, b, c, d = (str(v) for v in dates)
            if (
                a >= b
                or c >= d
                or min(b, d) > max(a, c)
                or max(b, d) > context.before_date.isoformat()
            ):
                raise ValueError("periods must be disjoint, ordered and prior to cutoff")
        if len(canonical.get("metrics") or []) > 24:
            raise ValueError("too many period metrics")
    for lower, upper in (("from_date", "to_date"),):
        lower_date, upper_date = canonical.get(lower), canonical.get(upper)
        if bool(lower_date) != bool(upper_date) or (
            lower_date
            and upper_date
            and (lower_date >= upper_date or upper_date > context.before_date.isoformat())
        ):
            raise ValueError("date window must be ordered and prior to cutoff")
    if step.operation == "query":
        # Default selectors must be canonical too, so saved plans validate idempotently.
        canonical = QuerySpec.model_validate(canonical).model_dump(mode="json")
    return step.model_copy(update={"arguments": canonical})


def declarations() -> list[dict[str, Any]]:
    return [
        {"name": name, "description": op.description, "parameters": op.schema.model_json_schema()}
        for name, op in REGISTRY.items()
    ]


def execute_operation(
    session: Session,
    context: ResolvedContext | None,
    step: OperationStep,
    deadline: float,
    *,
    full_result: bool = False,
    legacy_nonappearance: bool = False,
) -> dict[str, Any]:
    args = step.arguments
    if time.monotonic() >= deadline:
        raise TimeoutError("analytical deadline")
    if step.operation == "finance":
        return finance_query(session, FinanceQuery.model_validate(args)).model_dump(mode="json")
    if context is None:
        raise ValueError("basketball operations require a resolved context")
    if step.operation == "query":
        rows, count, cursor, more = execute_stats_query(
            session,
            context,
            QuerySpec.model_validate(args),
            is_export=full_result,
            max_export_rows=2000,
            legacy_nonappearance=legacy_nonappearance,
        )
        if full_result and count > 2000:
            raise HTTPException(413, "Full Stats result exceeds 2,000 rows; narrow the query.")
        keys = [m["key"] for m in args["metric_selectors"]]
        for row in rows:
            row["metrics"] = {k: row["metrics"].get(k) for k in keys}
            row["sample_sizes"] = {k: row["sample_sizes"].get(k) for k in keys}
            if "impact_support" in row:
                row["impact_support"] = {
                    k: v for k, v in row["impact_support"].items() if k in keys
                }
        result = {"items": rows, "total_eligible": count, "next_cursor": cursor, "has_more": more}
        from courtlens.services.impact_serving import impact_for_query, query_uses_impact

        query = QuerySpec.model_validate(args)
        if query_uses_impact(query):
            impact = impact_for_query(query, context.before_date.isoformat())
            result["impact"] = {k: v for k, v in impact.items() if k != "players"}
            result["disclosures"] = impact["limitations"]
        return result
    if step.operation == "position_query":
        from courtlens.services.starting_positions import POSITION_CODES, starting_positions

        cohort = starting_positions(session, context)
        query = QuerySpec.model_validate(args["query"])
        rows, count, _, _ = execute_stats_query(
            session,
            context,
            query,
            is_export=True,
            max_export_rows=2000,
            legacy_nonappearance=legacy_nonappearance,
        )
        if count > 2000:
            raise ValueError("position cohort exceeds the ranking budget")
        code = POSITION_CODES[args["position"]]
        matched = [row for row in rows if cohort.labels.get(str(row["player_id"])) == code]
        keys = [m["key"] for m in args["query"]["metric_selectors"]]
        for row in matched:
            row["metrics"] = {k: row["metrics"].get(k) for k in keys}
            row["sample_sizes"] = {k: row["sample_sizes"].get(k) for k in keys}
            if "impact_support" in row:
                row["impact_support"] = {
                    k: v for k, v in row["impact_support"].items() if k in keys
                }
            row["starting_position"] = code
            row["starts"] = cohort.starts[str(row["player_id"])]
        limit = query.page.limit
        return {
            "items": matched if full_result else matched[:limit],
            "total_eligible": len(matched),
            "next_cursor": None,
            "has_more": not full_result and len(matched) > limit,
            "position": {"policy": cohort.policy, "position": args["position"], "code": code},
            "limitations": [cohort.limitation(args["position"])],
        }
    if step.operation == "profile":
        data = get_player_profile(session, context, args["player_id"])
        data.pop("forecast_status", None)
        return data
    if step.operation == "compare":
        data = compare_players(session, context, args["player_a"], args["player_b"])
        for field in ("player_a", "player_b"):
            data[field].pop("forecast_status", None)
        return data
    if step.operation == "team":
        return get_team_detail(session, context, args["team_id"])
    if step.operation == "forecast":
        if args["issuance_id"]:
            issuance = get_forecast_issuance_detail(session, args["issuance_id"])
            if issuance is None or issuance["player_id"] != args["player_id"]:
                raise HTTPException(404, "Issuance not found for the selected player.")
            if datetime.fromisoformat(issuance["issued_at_utc"]) >= datetime.fromisoformat(
                context.cutoff_utc
            ):
                raise ValueError("forecast issuance is later than the requested cutoff")
            # Outcome observations carry later knowledge; this read exposes issuance only.
            issuance.pop("scores", None)
            return {
                **issuance,
                "disclosures": [
                    "Conditional on appearance; empirical calibrated dispersion.",
                    "Issuance inputs are separate from the current research context.",
                ],
            }
        issuance_id = session.scalar(
            select(ForecastIssuance.id)
            .where(
                ForecastIssuance.player_id == args["player_id"],
                ForecastIssuance.dataset_id == context.dataset_id,
                ForecastIssuance.issued_at_utc < datetime.fromisoformat(context.cutoff_utc),
                ForecastIssuance.target_game_date >= context.before_date,
                ForecastIssuance.target_game_date < context.before_date + timedelta(days=7),
            )
            .order_by(
                ForecastIssuance.target_game_date,
                ForecastIssuance.issued_at_utc.desc(),
                ForecastIssuance.id,
            )
            .limit(1)
        )
        if issuance_id is None:
            return {
                "status": "no_issuance",
                "player_id": args["player_id"],
                "disclosures": ["No registered issuance available for these inputs and cutoff."],
            }
        selected = step.model_copy(update={"arguments": {**args, "issuance_id": issuance_id}})
        return execute_operation(
            session,
            context,
            selected,
            deadline,
            full_result=full_result,
            legacy_nonappearance=legacy_nonappearance,
        )
    if step.operation == "definition":
        metric = METRIC_CATALOG[args["metric"]]
        return {"metric": args["metric"], "definition": metric.to_dict()}
    if step.operation == "compare_periods":
        return analytical_ops.compare_periods_service(
            session, ComparePeriodsRequest.model_validate(args)
        ).model_dump(mode="json")
    if step.operation == "distribution":
        return analytical_ops.distribution_service(
            session, DistributionRequest.model_validate(args)
        ).model_dump(mode="json")
    if step.operation == "splits":
        return analytical_ops.split_profile_service(
            session, SplitProfileRequest.model_validate(args)
        ).model_dump(mode="json")
    if step.operation == "similarity":
        return analytical_ops.statistical_peers_service(
            session, StatisticalPeersRequest.model_validate(args)
        ).model_dump(mode="json")
    if step.operation == "workload_shifts":
        games = _load_player_games(session, context)
        if len(games) > 100000:
            raise ValueError("workload comparison fact budget exceeded")
        by_player: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for game in games:
            if game.get("appearance") == "appeared" and game["game_date"] < context.before_date:
                by_player[game["player_id"]].append(game)
        n = args["period_n"]
        rows = []
        eligible = 0
        for pid, appearances in by_player.items():
            if time.monotonic() >= deadline:
                raise TimeoutError("analytical deadline")
            appearances.sort(key=lambda g: (g["game_date"], g["game_id"]), reverse=True)
            periods = (appearances[:n], appearances[n : 2 * n])
            if any(
                len(p) != n
                or any(g.get("minutes_seconds") is None or g.get("points") is None for g in p)
                for p in periods
            ):
                continue
            recent, prior = [
                {
                    "points": sum(g["points"] for g in p) / n,
                    "minutes": sum(g["minutes_seconds"] for g in p) / 60 / n,
                    "n": n,
                    "from": p[-1]["game_date"].isoformat(),
                    "through": p[0]["game_date"].isoformat(),
                }
                for p in periods
            ]
            total_minutes = (recent["minutes"] + prior["minutes"]) * n
            if total_minutes < args["min_minutes"]:
                continue
            eligible += 1
            delta_minutes = recent["minutes"] - prior["minutes"]
            delta_points = recent["points"] - prior["points"]
            if delta_minutes > 0 and delta_points <= 0:
                rows.append(
                    {
                        "player_id": pid,
                        "player_name": appearances[0]["player_name"],
                        "recent": recent,
                        "prior": prior,
                        "delta_minutes": delta_minutes,
                        "delta_points": delta_points,
                        "total_minutes": total_minutes,
                    }
                )
        rows.sort(key=lambda r: (-r["delta_minutes"], r["player_id"]))
        return {
            "items": rows[: args["limit"]],
            "total_eligible": eligible,
            "total_matches": len(rows),
            "disclosures": [
                "Complete paired points/minutes samples in both disjoint appearance windows.",
                "Minimum minutes applies to both periods combined; no inferred positions.",
                "Descriptive changes do not establish significance or future outcomes.",
            ],
        }
    raise HTTPException(422, "unavailable analytical operation")


def open_url(step: OperationStep, context: ResolvedContext | None = None) -> str | None:
    """Generate links solely from executed arguments; never inspect the question."""
    if context is not None and step.operation in ("compare", "profile", "team"):
        params = {
            "releaseId": context.release_id,
            "season": context.season,
            "phase": context.phase,
            "beforeDate": context.before_date.isoformat(),
            "window": context.window,
        }
        if step.operation == "compare":
            params.update(
                {"playerA": step.arguments["player_a"], "playerB": step.arguments["player_b"]}
            )
            return "/compare?" + urlencode(params)
        route = (
            f"/players/{step.arguments['player_id']}"
            if step.operation == "profile"
            else f"/teams/{step.arguments['team_id']}"
        )
        return route + "?" + urlencode(params)
    if step.operation == "finance":
        params = {
            "finance_" + k: ",".join(v) if isinstance(v, list) else str(v)
            for k, v in step.arguments.items()
            if v is not None and v != []
        }
        if context:
            params.update(
                {
                    "releaseId": context.release_id,
                    "season": context.season,
                    "phase": context.phase,
                    "beforeDate": context.before_date.isoformat(),
                    "window": context.window,
                }
            )
        return "/contracts?" + urlencode(params)
    if step.operation == "query":
        return "/stats?" + serialize_query_to_url_string(QuerySpec.model_validate(step.arguments))
    if context is None or step.operation not in (
        "compare_periods",
        "distribution",
        "splits",
        "similarity",
        "workload_shifts",
    ):
        return None
    params = {
        "operation": step.operation,
        "arguments": json.dumps(step.arguments, sort_keys=True, separators=(",", ":")),
        **{
            key: str(context.to_dict()[key])
            for key in ("release_id", "season", "phase", "before_date", "window")
        },
    }
    return "/research/operation?" + urlencode(params)


def operation_hash(step: OperationStep, context: ResolvedContext | None) -> str:
    if context is None and step.operation != "finance":
        raise ValueError("basketball operations require a resolved context")
    return canonical_hash(
        {
            "operation": step.operation,
            "arguments": step.arguments,
            "version": REGISTRY[step.operation].version,
            "inputs": context.to_dict() if context else None,
            "metric_version": METRIC_CATALOG_VERSION,
        }
    )
