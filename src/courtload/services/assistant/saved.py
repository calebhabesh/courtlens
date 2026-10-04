"""Explicit durable saving and provider-free reproduction of verified operation results."""

from __future__ import annotations

import csv
import io
import json
import time
from dataclasses import replace
from datetime import date
from typing import Any, Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.orm import Session

from courtload.conversation_models import SavedConversationAnalysis, SavedConversationInput
from courtload.domain.conversation import AnalysisPlan, OperationResult, SaveConversationRequest
from courtload.domain.metrics import METRIC_CATALOG_VERSION
from courtload.services.assistant.conversations import retained_turn
from courtload.services.assistant.execution import execute_bounded, query_deadline
from courtload.services.assistant.operations import REGISTRY, canonical_step
from courtload.services.assistant.rendering import render_result
from courtload.services.workbench_analytics import (
    ResolvedContext,
    canonical_hash,
    resolve_workbench_context,
)

SCHEMA_VERSION = "courtload-saved-operation-v1"
MAX_MANIFEST_BYTES = 32 * 1024 * 1024


def _context(session: Session, saved: dict[str, Any]) -> ResolvedContext:
    context = resolve_workbench_context(
        session,
        release_id=saved["release_id"],
        requested_season=saved["season"],
        requested_phase=saved["phase"],
        requested_before_date=date.fromisoformat(saved["before_date"]),
        requested_window=saved["window"],
    )
    # Publication time describes the pointer observed by the original turn, not
    # immutable release identity. Explicit release resolution has no pointer time.
    # Preserve that provenance without requiring today's pointer to match it.
    context = replace(context, published_at=saved.get("published_at"))
    if context.to_dict() != saved:
        raise HTTPException(409, "Retained input context or metric version is unavailable.")
    return context


def _existing(
    session: Session, request: SaveConversationRequest
) -> SavedConversationAnalysis | None:
    existing = session.scalar(
        select(SavedConversationAnalysis).where(
            SavedConversationAnalysis.request_id == str(request.request_id)
        )
    )
    if existing and existing.request_sha256 != canonical_hash(request.model_dump(mode="json")):
        raise HTTPException(409, "Save request identity was reused with different content.")
    return existing


def save_conversation(session: Session, request: SaveConversationRequest) -> dict[str, Any]:
    previous = _existing(session, request)
    if previous:
        return get_saved(session, previous.id)
    answer, question = retained_turn(request)
    assert answer.plan is not None and answer.manifest is not None
    deadline = time.monotonic() + 45
    try:
        with query_deadline(session, deadline):
            context = _context(session, answer.context)
            results = []
            steps = []
            for step, original in zip(answer.plan.steps, answer.results, strict=True):
                # Confirm the visible result before expanding or pinning its durable execution.
                data = execute_bounded(session, context, step, deadline)
                if canonical_hash(data) != original.result_hash:
                    raise HTTPException(
                        409, "Selected result changed; execute it again before saving."
                    )
                if step.operation == "forecast" and data.get("id"):
                    step = step.model_copy(
                        update={"arguments": {**step.arguments, "issuance_id": data["id"]}}
                    )
                if step.operation == "query":
                    data = execute_bounded(session, context, step, deadline, full_result=True)
                results.append(render_result(step, context, data, answer.context_fingerprint))
                steps.append(step)
            plan = answer.plan.model_copy(update={"steps": steps})
            manifest = {
                "schema_version": SCHEMA_VERSION,
                "context": context.to_dict(),
                "context_fingerprint": answer.context_fingerprint,
                "plan": plan.model_dump(mode="json"),
                "origin_plan": answer.plan.model_dump(mode="json"),
                "origin_manifest_sha256": answer.manifest["manifest_sha256"],
                "metric_version": METRIC_CATALOG_VERSION,
                "result_scope": "complete_stats_cohort_and_declared_operation_bounds",
                "results": [r.model_dump(mode="json") for r in results],
                "limitations": list(
                    dict.fromkeys(
                        [
                            *answer.limitations,
                            "Stats retains the complete eligible cohort up to 2,000 rows. "
                            "Other operations "
                            "retain their declared windows/top-k; "
                            "these are not full career exports.",
                            "Returned source precision is retained; "
                            "upstream rounded aggregates are not recovered.",
                            "Local links require the same retained inputs and application.",
                        ]
                    )
                ),
            }
            if len(json.dumps(manifest, allow_nan=False).encode()) > MAX_MANIFEST_BYTES:
                raise HTTPException(
                    413, "Saved evidence exceeds 32 MiB; narrow the query or selected operations."
                )
            if time.monotonic() >= deadline:
                raise TimeoutError("save deadline")
            record = SavedConversationAnalysis(
                request_id=str(request.request_id),
                request_sha256=canonical_hash(request.model_dump(mode="json")),
                workbench_dataset_id=context.dataset_id
                if context.dataset_type == "workbench"
                else None,
                archive_dataset_id=context.dataset_id
                if context.dataset_type == "archive"
                else None,
                title=request.title,
                manifest_sha256=canonical_hash(manifest),
                manifest_json=manifest,
                metadata_json={"question_saved": request.include_question, "question": question},
            )
            session.add(record)
            session.flush()
            for step in steps:
                session.add(
                    SavedConversationInput(
                        analysis_id=record.id,
                        step_id=step.step_id,
                        finance_release_id=step.arguments["book_id"]
                        if step.operation == "finance"
                        else None,
                        issuance_id=step.arguments.get("issuance_id")
                        if step.operation == "forecast"
                        else None,
                    )
                )
        # Leave the read deadline context before committing the explicit evidence write.
        session.commit()
    except IntegrityError:
        session.rollback()
        previous = _existing(session, request)
        if previous:
            return get_saved(session, previous.id)
        raise HTTPException(409, "Saved evidence references unavailable retained inputs.") from None
    except TimeoutError:
        session.rollback()
        raise HTTPException(
            408, "Saving exceeded its deadline; narrow the query and retry."
        ) from None
    except (DBAPIError, ValueError):
        session.rollback()
        raise HTTPException(
            422, "Saving could not verify the retained inputs or result bounds."
        ) from None
    return get_saved(session, record.id)


def _record(session: Session, analysis_id: str) -> SavedConversationAnalysis:
    record = session.get(SavedConversationAnalysis, analysis_id)
    if record is None:
        raise HTTPException(404, "Saved conversational investigation not found.")
    if canonical_hash(record.manifest_json) != record.manifest_sha256:
        raise HTTPException(409, "Saved manifest integrity check failed.")
    for raw in record.manifest_json["results"]:
        result = OperationResult.model_validate(raw)
        if canonical_hash(result.data) != result.result_hash:
            raise HTTPException(409, "Saved result integrity check failed.")
    return record


def get_saved(session: Session, analysis_id: str) -> dict[str, Any]:
    record = _record(session, analysis_id)
    return {
        "id": record.id,
        "title": record.title,
        "manifest_sha256": record.manifest_sha256,
        "manifest": record.manifest_json,
        "metadata": record.metadata_json,
        "created_at": record.created_at.isoformat(),
    }


def list_saved(session: Session, limit: int = 50, offset: int = 0) -> list[dict[str, Any]]:
    return [
        {
            "id": record.id,
            "title": record.title,
            "manifest_sha256": record.manifest_sha256,
            "created_at": record.created_at.isoformat(),
            "context": record.manifest_json["context"],
            "operations": [s["operation"] for s in record.manifest_json["plan"]["steps"]],
            "question_saved": record.metadata_json["question_saved"],
        }
        for record in session.scalars(
            select(SavedConversationAnalysis)
            .order_by(SavedConversationAnalysis.created_at.desc(), SavedConversationAnalysis.id)
            .offset(offset)
            .limit(limit)
        )
    ]


def reproduce_saved(session: Session, analysis_id: str) -> dict[str, Any]:
    record = _record(session, analysis_id)
    manifest = record.manifest_json
    report: dict[str, Any] = {
        "id": record.id,
        "manifest_sha256": record.manifest_sha256,
        "match": False,
        "reason": None,
        "operations": [],
        "provider_calls": 0,
    }
    if manifest["metric_version"] != METRIC_CATALOG_VERSION or any(
        r["operation"] not in REGISTRY or r["operation_version"] != REGISTRY[r["operation"]].version
        for r in manifest["results"]
    ):
        report["reason"] = (
            "Retained operation/metric version is unavailable; stored export remains readable."
        )
        return report
    deadline = time.monotonic() + 45
    try:
        with query_deadline(session, deadline):
            context = _context(session, manifest["context"])
            plan = AnalysisPlan.model_validate(manifest["plan"])
            for step, raw in zip(plan.steps, manifest["results"], strict=True):
                canonical = canonical_step(session, context, step)
                if canonical != step:
                    raise HTTPException(409, "Retained canonical operation schema changed.")
                data = execute_bounded(
                    session, context, step, deadline, full_result=step.operation == "query"
                )
                result = render_result(step, context, data, manifest["context_fingerprint"])
                # Includes exact evidence binding, versions, rows, and canonical destinations.
                matches = result.model_dump(mode="json") == raw
                report["operations"].append(
                    {
                        "step_id": step.step_id,
                        "operation": step.operation,
                        "saved_result_sha256": raw["result_hash"],
                        "recomputed_result_sha256": result.result_hash,
                        "match": matches,
                    }
                )
            report["match"] = all(r["match"] for r in report["operations"])
            if not report["match"]:
                report["reason"] = "Recomputed result/evidence differs from retained evidence."
    except (HTTPException, ValueError):
        report["reason"] = (
            "Retained inputs or canonical operation are unavailable; "
            "stored export remains readable."
        )
    except TimeoutError:
        report["reason"] = "Reproduction exceeded its deadline."
    except DBAPIError:
        session.rollback()
        report["reason"] = "Retained inputs could not be queried; stored export remains readable."
    return report


def _csv_cell(value: Any) -> str:
    if value is None:
        return "null"
    if isinstance(value, (dict, list)):
        text = json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False)
    else:
        text = str(value)
    return (
        "'" + text
        if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r", "\n"))
        else text
    )


def export_saved(
    session: Session, analysis_id: str, format: Literal["json", "csv"]
) -> tuple[str, str, str]:
    saved = get_saved(session, analysis_id)
    filename = "courtload-investigation-" + saved["id"]
    if format == "json":
        return json.dumps(saved, indent=2, allow_nan=False), "application/json", filename + ".json"
    output = io.StringIO()
    writer = csv.writer(output)
    # Self-contained manifest plus a normalized exact-cell table; null has a literal representation.
    writer.writerow(["manifest_sha256", saved["manifest_sha256"]])
    writer.writerow(["title", _csv_cell(saved["title"])])
    writer.writerow(["metadata_json", _csv_cell(saved["metadata"])])
    manifest_json = json.dumps(saved["manifest"], sort_keys=True, separators=(",", ":"))
    # JSON string chunks stay below spreadsheet cell limits and cannot execute formulas.
    for index, start in enumerate(range(0, len(manifest_json), 16000)):
        writer.writerow(
            ["manifest_json_part", index, json.dumps(manifest_json[start : start + 16000])]
        )
    writer.writerow(
        [
            "step_id",
            "operation",
            "result_hash",
            "evidence_id",
            "entity_id",
            "path",
            "metric",
            "unit",
            "value",
            "null_reason",
            "sample",
            "input_identity",
        ]
    )
    for result in saved["manifest"]["results"]:
        for cell in result["evidence"]:
            writer.writerow(
                [
                    _csv_cell(v)
                    for v in [
                        result["step_id"],
                        result["operation"],
                        result["result_hash"],
                        cell["evidence_id"],
                        cell["entity_id"],
                        cell["path"],
                        cell["metric"],
                        cell["unit"],
                        cell["value"],
                        cell["null_reason"],
                        cell["sample"],
                        cell["input_identity"],
                    ]
                ]
            )
    return output.getvalue(), "text/csv", filename + ".csv"


def saved_inventory(session: Session) -> list[dict[str, str]]:
    """Recovery manifest verifies retained analytical contents rather than only row counts."""
    inventory = []
    for record in session.scalars(
        select(SavedConversationAnalysis).order_by(SavedConversationAnalysis.id)
    ):
        _record(session, record.id)
        inventory.append({"id": record.id, "manifest_sha256": record.manifest_sha256})
    return inventory
