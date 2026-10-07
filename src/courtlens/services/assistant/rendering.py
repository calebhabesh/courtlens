"""Render only executed canonical results; exact evidence paths replace value matching."""

from __future__ import annotations

from typing import Any

from courtlens.domain.conversation import EvidenceCell, OperationResult, OperationStep
from courtlens.domain.metrics import METRIC_CATALOG, METRIC_CATALOG_VERSION
from courtlens.services.assistant.operations import REGISTRY, open_url, operation_hash
from courtlens.services.workbench_analytics import ResolvedContext, canonical_hash

MAX_RESULT_BYTES = 2 * 1024 * 1024


def result_rows(operation: str, data: dict[str, Any]) -> list[dict[str, Any]]:
    if operation == "finance":
        return list(data["contracts"])
    if operation == "compare":
        return list(data["aligned_metrics"])
    if operation in ("query", "position_query", "workload_shifts"):
        return list(data["items"])
    if operation == "distribution":
        return [{"summary": data["summary"]}, *list(data["samples"])]
    if operation == "compare_periods":
        return list(data["deltas"])
    if operation == "similarity":
        return [{"target": data["target"], "cohort": data["cohort"]}, *list(data["peers"])]
    if operation == "splits":
        return [
            {"split": kind, **row}
            for kind in ("venue_splits", "rest_splits", "opponent_splits")
            for row in data[kind]
        ]
    return [data]


def render_result(
    step: OperationStep, context: ResolvedContext | None, data: dict[str, Any], fingerprint: str
) -> OperationResult:
    result_hash = canonical_hash(data)
    op_hash = operation_hash(step, context)
    cells: list[EvidenceCell] = []
    inputs = context.to_dict() if context else {}
    if step.operation == "forecast":
        inputs = {
            **inputs,
            "issuance_inputs": {
                k: data.get(k)
                for k in (
                    "id",
                    "dataset_id",
                    "features_hash",
                    "policy_id",
                    "issued_at_utc",
                    "target_game_id",
                    "target_game_date",
                )
            },
        }
    if step.operation == "finance":
        inputs = {
            **inputs,
            "financial_context": data["context"],
            "book_sha256": data["book_sha256"],
            "analytical_content_sha256": data["analytical_content_sha256"],
        }
    default_entity = str(
        data.get("player_id")
        or step.arguments.get("target_player_id")
        or step.arguments.get("player_id")
        or "cohort"
    )

    def visit(
        value: Any, path: str, entity: str, row: str, metric: str, sample: dict[str, Any]
    ) -> None:
        if isinstance(value, dict):
            entity = str(value.get("player_id", value.get("game_id", entity)))
            if step.operation == "compare" and path in ("/player_a", "/player_b"):
                entity = str(value["id"])
            metric = str(value.get("metric_key", value.get("metric", metric)))
            row = path
            local_sample = {
                k: value[k]
                for k in (
                    "n",
                    "games_played",
                    "total_minutes",
                    "sample_counts",
                    "sample_sizes",
                    "period_a_n",
                    "period_b_n",
                    "n_a",
                    "n_b",
                    "overlapping_dimensions_count",
                )
                if k in value
            }
            sample = {**sample, **local_sample}
            for key, child in value.items():
                next_metric = key if key in METRIC_CATALOG else metric
                child_entity = entity
                if step.operation == "compare" and path.startswith("/aligned_metrics/"):
                    if key in ("value_a", "n_a"):
                        child_entity = step.arguments["player_a"]
                    elif key in ("value_b", "n_b"):
                        child_entity = step.arguments["player_b"]
                    elif key == "diff":
                        child_entity = (
                            step.arguments["player_a"] + "_vs_" + step.arguments["player_b"]
                        )
                visit(child, path + "/" + key, child_entity, row, next_metric, sample)
        elif isinstance(value, list):
            for index, child in enumerate(value):
                visit(
                    child, path + "/" + str(index), entity, path + "/" + str(index), metric, sample
                )
        elif (
            value is None
            or (isinstance(value, (int, float)) and not isinstance(value, bool))
            or (
                step.operation == "finance"
                and isinstance(value, str)
                and (
                    path.endswith("_cents")
                    or path.endswith("/derived_aav_usd")
                    or path.endswith("/terms/value")
                )
            )
        ):
            key = path.rsplit("/", 1)[-1]
            definition = METRIC_CATALOG.get(metric)
            # Scalar metadata has its own unit; it cannot inherit a points label.
            unit = definition.unit if definition else "dimensionless"
            if (
                "/sample_sizes/" in path
                or "/sample_counts/" in path
                or key
                in (
                    "n",
                    "games_played",
                    "total_eligible",
                    "total_matches",
                    "cohort_size",
                    "period_a_n",
                    "period_b_n",
                    "n_a",
                    "n_b",
                )
            ):
                unit = "observations"
            elif key in ("minutes", "total_minutes", "delta_minutes"):
                unit = "minutes"
            elif key in ("points", "delta_points"):
                unit = "points"
            elif key in ("percentage_delta",):
                unit = "percent change"
            if step.operation == "forecast" and key in (
                "point_estimate",
                "interval_lower",
                "interval_upper",
            ):
                unit = "points"
            if step.operation == "finance" and (
                key.endswith("_cents") or key in ("derived_aav_usd", "value")
            ):
                unit = "USD cents" if key.endswith("_cents") else "USD"
            cell_metric = metric or key
            if key in (
                "n",
                "games_played",
                "total_eligible",
                "total_matches",
                "cohort_size",
                "period_a_n",
                "period_b_n",
                "total_minutes",
            ):
                cell_metric = key
            elif key == "minutes":
                cell_metric = "min_per_game"
            elif key in ("points", "delta_points", "delta_minutes"):
                cell_metric = (
                    "min_per_game_delta"
                    if key == "delta_minutes"
                    else "pts_per_game_delta"
                    if key == "delta_points"
                    else "pts"
                )
            if "/standardized_values/" in path:
                unit = "z-score"
            elif "/dimension_contributions/" in path:
                unit = "squared z-score distance"
            elif "/sample_sizes/" in path or "/sample_counts/" in path:
                cell_metric = key + "_valid_observations"
            identity = {
                "operation": op_hash,
                "result": result_hash,
                "path": path,
                "entity": entity,
                "metric": cell_metric,
                "unit": unit,
                "context": fingerprint,
            }
            cells.append(
                EvidenceCell(
                    evidence_id=canonical_hash(identity),
                    result_hash=result_hash,
                    operation_hash=op_hash,
                    operation_version=REGISTRY[step.operation].version,
                    context_fingerprint=fingerprint,
                    entity_id=entity,
                    row_identity=row,
                    path=path,
                    metric=cell_metric,
                    metric_version=METRIC_CATALOG_VERSION,
                    unit=unit,
                    value=value,
                    sample=sample,
                    input_identity=inputs,
                    null_reason=(
                        "Unrecorded or unsupported denominator/sample; see result disclosures."
                    )
                    if value is None
                    else None,
                )
            )

    visit(data, "", default_entity, "", "", {})
    return OperationResult(
        step_id=step.step_id,
        operation=step.operation,
        operation_version=REGISTRY[step.operation].version,
        arguments=step.arguments,
        operation_hash=op_hash,
        result_hash=result_hash,
        data=data,
        rows=result_rows(step.operation, data),
        evidence=cells,
        open_url=open_url(step, context),
        eligible_count=data.get("total_eligible"),
        limitations=data.get("disclosures", data.get("limitations", [])),
    )


def bind_evidence(
    cell: EvidenceCell,
    *,
    evidence_id: str,
    entity_id: str,
    metric: str,
    unit: str,
    context_fingerprint: str,
    result_hash: str,
) -> Any:
    """Exact attribution check for future approved claim templates; no numeric search."""
    if (
        cell.evidence_id,
        cell.entity_id,
        cell.metric,
        cell.unit,
        cell.context_fingerprint,
        cell.result_hash,
    ) != (evidence_id, entity_id, metric, unit, context_fingerprint, result_hash):
        raise ValueError("evidence attribution mismatch")
    return cell.value


def observed_claims(result: OperationResult) -> list[dict[str, Any]]:
    """Approved observation template with exact cell references and no model-written prose."""
    candidates = [
        c
        for c in result.evidence
        if c.value is not None
        and c.metric in METRIC_CATALOG
        and c.unit != "observations"
        and ("/metrics/" in c.path or c.path.endswith(("/value_a", "/value_b")))
    ]
    return [
        {
            "statement": (
                f"{cell.entity_id}: {METRIC_CATALOG[cell.metric].display_name} "
                f"= {cell.value} {cell.unit} in the selected observation window."
            ),
            "evidence_id": cell.evidence_id,
            "entity_id": cell.entity_id,
            "metric": cell.metric,
            "value": cell.value,
            "unit": cell.unit,
            "context_fingerprint": cell.context_fingerprint,
            "result_hash": cell.result_hash,
            "template": "observed_cell_v1",
        }
        for cell in candidates[:5]
    ]
