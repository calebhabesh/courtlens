"""Frozen AG06 scoring against independent SQL, never model-authored expectations."""

from __future__ import annotations

import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path
from statistics import mean
from typing import Any

from sqlalchemy.orm import Session

from courtlens.domain.assistant_agent import MARKER, AgentTurnResponse
from courtlens.services.assistant.revamp_evaluation import expected_answer
from courtlens.services.workbench_analytics import ResolvedContext

CORPUS = Path("evaluation/assistant/ag-v3.json")
WAREHOUSE_CATEGORIES = {"leaders", "single_player", "compare", "follow_up", "forecast", "mixed"}


def load_corpus(path: Path = CORPUS) -> tuple[dict[str, Any], str]:
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != path.with_suffix(".sha256").read_text().strip():
        raise ValueError("Frozen AG06 corpus checksum mismatch")
    corpus: dict[str, Any] = json.loads(raw)
    ids: set[str] = set()
    inputs: dict[str, set[str]] = defaultdict(set)
    groups: dict[str, set[str]] = defaultdict(set)
    for case in corpus["cases"]:
        if case["id"] in ids:
            raise ValueError("Duplicate AG06 case ID")
        ids.add(case["id"])
        if case["split"] not in {"dev", "holdout"}:
            raise ValueError("Unknown AG06 split")
        groups[case["group"]].add(case["split"])
        for message in (case["message"], case.get("setup", {}).get("message", "")):
            if message:
                inputs[" ".join(message.casefold().split())].add(case["split"])
        if case["id"].startswith("ar02-") and case["split"] != "dev":
            raise ValueError("Exposed v2 case reused as v3 holdout")
    if any(len(splits) != 1 for splits in (*groups.values(), *inputs.values())):
        raise ValueError("AG06 dev/holdout leakage")
    if not {f"ar02-{i:03}" for i in range(1, 151)} <= ids:
        raise ValueError("AG06 must retain every v2 case ID")
    return corpus, digest


def oracle_answer(
    session: Session, context: ResolvedContext, case: dict[str, Any]
) -> dict[str, Any]:
    if case["oracle"]["kind"] in {"web", "refusal", "assumption", "position"}:
        return {"status": case["expected_status"], **case["oracle"]}
    expected = expected_answer(session, context, case)
    # Missing registered issuance remains a measured limitation in an answered v3 turn.
    expected["status"] = case["expected_status"]
    return expected


def _equal(actual: Any, expected: Any) -> bool:
    if isinstance(expected, dict):
        return (
            isinstance(actual, dict)
            and actual.keys() == expected.keys()
            and all(
                (actual[key] == value if key in {"n", "gp"} else _equal(actual[key], value))
                for key, value in expected.items()
            )
        )
    if isinstance(expected, list):
        return (
            isinstance(actual, list)
            and len(actual) == len(expected)
            and all(_equal(a, e) for a, e in zip(actual, expected, strict=True))
        )
    if isinstance(expected, (float, int)) and not isinstance(expected, bool):
        return isinstance(actual, (float, int)) and math.isclose(
            actual, expected, rel_tol=0, abs_tol=0.050000001
        )
    return bool(actual == expected)


def score_answer(
    case: dict[str, Any],
    expected: dict[str, Any],
    answer: AgentTurnResponse,
    transcript: dict[str, Any],
) -> dict[str, Any]:
    failures: list[str] = []
    kind = expected["kind"]
    if answer.status != expected["status"]:
        failures.append("status")
    if answer.mode != "agent" or answer.failure:
        failures.append("provider_unavailable_or_limited")
    if answer.provenance.unsupported_numbers:
        failures.append("unsupported_numbers")
    if case.get("require_assumption") and not answer.assumption:
        failures.append("missing_assumption")
    results = [block.result.data for block in answer.results]
    if "scope" in expected:
        selections = answer.selections
        scope = selections.model_dump(mode="json") if selections else {}
        if any(scope.get(k) != v for k, v in expected["scope"].items()):
            failures.append("scope")
        for block in answer.results:
            context = block.context or {}
            if any(context.get(k) != v for k, v in expected["scope"].items()):
                failures.append("executed_scope")
                break
    if kind in {"ranking", "single", "mixed"}:
        metric = expected["metric"]
        actual_rows = [
            {
                "player_id": row["player_id"],
                "value": row["metrics"].get(metric),
                "n": row["sample_sizes"].get(metric),
            }
            for result in results
            for row in result.get("items", [])
        ]
        if not _equal(actual_rows, expected["rows"]):
            failures.append("sql_cells_or_order")
    elif kind == "compare":
        players = [
            {
                "player_id": result[key]["id"],
                **{
                    k: result[key]["metrics"].get(k)
                    for k in expected["players"][0]
                    if k != "player_id"
                },
            }
            for result in results
            for key in ("player_a", "player_b")
            if key in result
        ]
        if not _equal(players, expected["players"]):
            failures.append("sql_comparison")
    elif kind == "forecast":
        data = results[0] if len(results) == 1 else {}
        if expected["data"].get("status") == "no_issuance":
            errors = [
                tool["result"]["payload"].get("error", {}).get("code")
                for tool in transcript.get("tools", [])
                if tool.get("call", {}).get("arguments", {}).get("operation") == "forecast"
            ]
            if results or "no_issuance" not in errors:
                failures.append("sql_issuance_unavailability")
        elif not _equal({k: data.get(k) for k in expected["data"]}, expected["data"]):
            failures.append("sql_issuance")
        elif not any("Conditional on appearance" in d for d in data.get("disclosures", [])):
            failures.append("forecast_disclosure")
    elif kind == "position":
        if not any(
            t.arguments.get("operation") == "position_query" and t.status == "ok"
            for t in answer.trace
        ):
            failures.append("position_query_missing_or_unavailable")
    if kind in {"general", "mixed"} and not all(
        term.casefold() in answer.answer.text.casefold() for term in case["oracle"]["terms"]
    ):
        failures.append("general_keywords")
    web_ids = {s.source_id for s in answer.sources if s.origin == "web" and s.url}
    web_cited = bool(web_ids.intersection(MARKER.findall(answer.answer.text)))
    if kind == "web" and not web_cited:
        failures.append("web_citation_missing")
    if case["category"] == "conflict" and answer.provenance.warehouse_override_missed:
        failures.append("warehouse_override_missed")
    return {
        "id": case["id"],
        "category": case["category"],
        "exact_answer": not failures,
        "failures": failures,
        "answered": answer.status == "answered",
        "refused": answer.status == "refused",
        "expected_refusal": case["expected_status"] == "refused",
        "web_cited": web_cited,
        "unsupported_numbers": answer.provenance.unsupported_numbers,
        "warehouse_override_missed": answer.provenance.warehouse_override_missed,
        "accounting": answer.accounting.model_dump(mode="json"),
    }


def summarize(records: list[dict[str, Any]], planned: int, runs: int = 3) -> dict[str, Any]:
    def rate(values: list[bool]) -> dict[str, Any]:
        return {
            "correct": sum(values),
            "total": len(values),
            "rate": mean(values) if values else None,
        }

    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        groups[record["id"]].append(record)
    completed = [group for group in groups.values() if len(group) == runs]
    latency = sorted(r["accounting"]["elapsed_ms"] for r in records)
    costs = [r["accounting"]["est_cost_usd"] for r in records]
    return {
        "coverage": {
            "completed_runs": len(records),
            "planned_runs": planned * runs,
            "completed_questions": len(completed),
            "planned_questions": planned,
        },
        "exact_answer_warehouse": rate(
            [r["exact_answer"] for r in records if r["category"] in WAREHOUSE_CATEGORIES]
        ),
        "answered_rate": rate([r["answered"] for r in records]),
        "refusal_precision": rate([r["expected_refusal"] for r in records if r["refused"]]),
        "refusal_recall": rate([r["refused"] for r in records if r["expected_refusal"]]),
        "web_citation_presence": rate([r["web_cited"] for r in records if r["category"] == "web"]),
        "unsupported_number_rate": rate([bool(r["unsupported_numbers"]) for r in records]),
        "warehouse_override_missed": sum(r["warehouse_override_missed"] for r in records),
        "flakiness": rate([len({r["exact_answer"] for r in group}) > 1 for group in completed]),
        "latency_ms": {
            p: latency[math.ceil(len(latency) * q) - 1] if latency else None
            for p, q in (("p50", 0.5), ("p95", 0.95))
        },
        "per_turn": {
            k: mean(r["accounting"][k] for r in records) if records else None
            for k in ("steps", "web_searches", "input_tokens", "output_tokens")
        },
        "estimated_cost_usd": {
            "total": sum(c for c in costs if c is not None)
            if any(c is not None for c in costs)
            else None,
            "mean_known_per_turn": mean(c for c in costs if c is not None)
            if any(c is not None for c in costs)
            else None,
            "known_turns": sum(c is not None for c in costs),
            "unknown_turns": sum(c is None for c in costs),
        },
        "categories": {
            category: rate([r["exact_answer"] for r in records if r["category"] == category])
            for category in sorted({r["category"] for r in records})
        },
    }
