"""AR02 frozen evaluation: independent SQL oracles and separate answer/plan metrics.

This module does not change the assistant, consult the model for expected answers,
or execute its plan to construct an oracle. Old PF07d scoring stays sealed.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from statistics import mean
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

from courtload.domain.conversation import AnalysisPlan
from courtload.domain.hybrid_assistant import HybridTurnResponse
from courtload.services.assistant.operations import canonical_step
from courtload.services.workbench_analytics import ResolvedContext

CORPUS = Path("evaluation/assistant/ar02-v2.json")
GENERAL_LABEL = "General knowledge, not from CourtLens data"
METRIC_EXPRESSIONS = {
    "pts": "points::numeric",
    "reb": "(stats_json->>'rebounds_total')::numeric",
    "ast": "(stats_json->>'assists')::numeric",
    "stl": "(stats_json->>'steals')::numeric",
    "blk": "(stats_json->>'blocks')::numeric",
    "min": "minutes_seconds::numeric / 60",
}


def load_corpus(path: Path = CORPUS) -> tuple[dict[str, Any], str]:
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != path.with_suffix(".sha256").read_text().strip():
        raise ValueError("Frozen corpus checksum mismatch")
    corpus: dict[str, Any] = json.loads(raw)
    cases = corpus["cases"]
    if len({c["id"] for c in cases}) != len(cases):
        raise ValueError("Duplicate case ID")
    groups: dict[str, set[str]] = defaultdict(set)
    inputs: dict[tuple[str, str, str], set[str]] = defaultdict(set)
    for case in cases:
        if case["split"] not in ("dev", "holdout"):
            raise ValueError("Unknown split")
        groups[case["group"]].add(case["split"])
        context_key = (
            ""
            if case["category"] == "general"
            else json.dumps(
                {
                    "season": case.get("season", corpus["context_season"]),
                    "phase": case.get("phase", "regular_season"),
                    "before_date": case.get("before_date", corpus["before_date"]),
                },
                sort_keys=True,
            )
        )
        for index, message in enumerate(
            (case["message"], case.get("setup", {}).get("message", ""))
        ):
            if message:
                previous = (
                    json.dumps(case["setup"]["expected_plan"], sort_keys=True)
                    if (index == 0 and case.get("setup"))
                    else ""
                )
                inputs[(" ".join(re.findall(r"\w+", message.lower())), context_key, previous)].add(
                    case["split"]
                )
    if any(len(splits) != 1 for splits in groups.values()):
        raise ValueError("Semantic family leaked across dev/holdout")
    if corpus.get("final_holdout") and any(len(splits) > 1 for splits in inputs.values()):
        raise ValueError("Primary/setup input leaked across dev/holdout")
    return corpus, digest


def canonical_plan(
    session: Session, context: ResolvedContext, data: dict[str, Any] | None
) -> list[dict[str, Any]] | None:
    if data is None:
        return None
    plan = AnalysisPlan.model_validate(data)
    return [
        {"operation": step.operation, "arguments": step.arguments}
        for step in (canonical_step(session, context, s) for s in plan.steps)
    ]


def sql_rows(session: Session, context: ResolvedContext) -> list[dict[str, Any]]:
    """Independent workbench oracle, valid appearances and per-metric denominators.

    Only internal allowlisted expressions are interpolated. Everything identifying
    a snapshot or temporal scope is a bound parameter. Nulls remain unknown.
    """
    if context.dataset_type != "workbench" or session.get_bind().dialect.name != "postgresql":
        raise ValueError("AR02 oracle requires a published workbench snapshot on PostgreSQL")
    aggregates = ["count(*) AS gp"]
    for metric, expression in METRIC_EXPRESSIONS.items():
        aggregates.extend(
            (
                f"sum({expression}) AS {metric}",
                f"count({expression}) AS n_{metric}",
                f"round(avg({expression}), 1) AS {metric}_per_game",
            )
        )
    statement = (
        "SELECT player_id, "
        + ", ".join(aggregates)
        + " FROM workbench_player_games WHERE dataset_id = :dataset_id"
        " AND season = :season AND phase = :phase AND game_date < :before_date"
        " AND appearance = 'appeared' GROUP BY player_id ORDER BY player_id"
    )
    return [
        {k: float(v) if v is not None and k != "player_id" else v for k, v in row.items()}
        for row in session.execute(
            text(statement),
            {
                "dataset_id": context.dataset_id,
                "season": context.season,
                "phase": context.phase,
                "before_date": context.before_date,
            },
        ).mappings()
    ]


def expected_answer(
    session: Session,
    context: ResolvedContext,
    case: dict[str, Any],
    rows: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    oracle = case["oracle"]
    kind = oracle["kind"]
    expected: dict[str, Any] = {"status": case["expected_status"], "kind": kind}
    if kind in ("general", "terminal"):
        return {**expected, **oracle}
    if kind == "forecast":
        issuance = (
            session.execute(
                text(
                    "SELECT id, player_id, policy_id, features_hash, point_estimate,"
                    " interval_lower,"
                    " interval_upper, issued_at_utc, target_game_date FROM forecast_issuances"
                    " WHERE dataset_id = :dataset_id AND player_id = :player_id"
                    " AND issued_at_utc < :cutoff AND target_game_date >= :before_date"
                    " AND target_game_date < :horizon ORDER BY target_game_date,"
                    " issued_at_utc DESC, id LIMIT 1"
                ),
                {
                    "dataset_id": context.dataset_id,
                    "player_id": oracle["player_id"],
                    "cutoff": datetime.fromisoformat(context.cutoff_utc),
                    "before_date": context.before_date,
                    "horizon": context.before_date + timedelta(days=7),
                },
            )
            .mappings()
            .first()
        )
        expected["data"] = (
            {
                k: v.isoformat() if isinstance(v, (date, datetime)) else v
                for k, v in issuance.items()
            }
            if issuance
            else {"status": "no_issuance", "player_id": oracle["player_id"]}
        )
        if issuance is None:
            # Missing issuance is known unavailability, not a model mistake or a zero forecast.
            expected["status"] = "unable"
            expected["reason"] = "no_observations"
    else:
        rows = sql_rows(session, context) if rows is None else rows
        if kind == "compare":
            keys = ("gp", "pts_per_game", "reb_per_game", "ast_per_game", "min_per_game")
            expected["players"] = [
                {"player_id": pid, **{key: row[key] for key in keys}}
                for pid in oracle["player_ids"]
                for row in rows
                if row["player_id"] == pid
            ]
            if len(expected["players"]) != 2:
                raise ValueError(f"Comparison oracle has missing player: {case['id']}")
        else:
            metric = oracle["metric"]
            selected = [
                row for row in rows if kind != "single" or row["player_id"] == oracle["player_id"]
            ]
            selected.sort(key=lambda r: (r[metric] is None, -(r[metric] or 0), r["player_id"]))
            sample_key = "gp" if metric == "gp" else "n_" + metric.removesuffix("_per_game")
            expected["rows"] = [
                {"player_id": r["player_id"], "value": r[metric], "n": r[sample_key]}
                for r in selected[: oracle["limit"]]
            ]
            expected["metric"] = metric
            if not expected["rows"]:
                raise ValueError(f"Ranking oracle has no observations: {case['id']}")
    expected["scope"] = {
        "release_id": context.release_id,
        "season": context.season,
        "phase": context.phase,
        "before_date": context.before_date.isoformat(),
        "window": context.window,
    }
    return expected


def _general_correct(answer: HybridTurnResponse, terms: list[str]) -> bool:
    texts = [b.text for b in answer.blocks if b.kind == "text"]
    # No analytical number may hide inside the general block. Data cells are scored separately.
    prose = " ".join(texts)
    return bool(
        GENERAL_LABEL.lower() in prose.lower()
        and not re.search(
            r"\d|\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|"
            r"thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|"
            r"forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|percent)\b",
            prose,
            re.I,
        )
        and all(term.lower() in prose.lower() for term in terms)
    )


def score_answer(
    case: dict[str, Any],
    expected: dict[str, Any],
    expected_plan: list[dict[str, Any]] | None,
    answer: HybridTurnResponse,
) -> dict[str, Any]:
    failures: list[str] = []
    if answer.status != expected["status"]:
        failures.append("status")
    if "scope" in expected and (
        answer.scope is None or answer.scope.selections.model_dump(mode="json") != expected["scope"]
    ):
        failures.append("scope")
    actual_plan = (
        [{"operation": s.operation, "arguments": s.arguments} for s in answer.plan.steps]
        if answer.plan
        else None
    )
    plan_correct = actual_plan == expected_plan if expected_plan is not None else None
    results = [b.result.data for b in answer.blocks if b.kind == "result"]
    kind = expected["kind"]
    if kind in ("ranking", "single", "mixed"):
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
        if actual_rows != expected["rows"]:
            failures.append("sql_cells_or_order")
    elif kind == "compare":
        players = []
        for result in results:
            for key in ("player_a", "player_b"):
                if key in result:
                    row = result[key]
                    players.append(
                        {
                            "player_id": row["id"],
                            **{
                                k: row["metrics"].get(k)
                                for k in (
                                    "gp",
                                    "pts_per_game",
                                    "reb_per_game",
                                    "ast_per_game",
                                    "min_per_game",
                                )
                            },
                        }
                    )
        if players != expected["players"]:
            failures.append("sql_comparison")
    elif kind == "forecast":
        data = results[0] if len(results) == 1 else {}
        if expected["data"].get("status") == "no_issuance":
            reasons = [b.reason for b in answer.blocks if b.kind == "inability"]
            if results or expected["reason"] not in reasons:
                failures.append("sql_issuance_unavailability")
        else:
            if {k: data.get(k) for k in expected["data"]} != expected["data"]:
                failures.append("sql_issuance")
            if not any("Conditional on appearance" in d for d in data.get("disclosures", [])):
                failures.append("forecast_disclosure")
    elif kind == "terminal" and expected.get("reason"):
        if expected["reason"] not in [b.reason for b in answer.blocks if b.kind == "inability"]:
            failures.append("refusal_reason")
    if kind in ("mixed", "general") and not _general_correct(answer, case["oracle"]["terms"]):
        failures.append("general_label_content_or_numbers")
    readable = any(getattr(b, "text", "").strip() for b in answer.blocks)
    if not readable:
        failures.append("no_readable_answer")
    return {
        "id": case["id"],
        "category": case["category"],
        "split": case["split"],
        "exact_answer": not failures,
        "plan_correct": plan_correct,
        "failures": failures,
        "refused": answer.status == "unable",
        "expected_refusal": expected["status"] == "unable",
        "readable": readable,
    }


def summarize(records: list[dict[str, Any]], planned_questions: int, runs: int) -> dict[str, Any]:
    def rate(values: list[bool]) -> dict[str, Any]:
        return {
            "correct": sum(values),
            "total": len(values),
            "rate": mean(values) if values else None,
        }

    questions: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        questions[record["id"]].append(record)
    # Flakiness means correctness changes across all repetitions of a question.
    completed = [group for group in questions.values() if len(group) == runs]
    latency = sorted(r["elapsed_ms"] for r in records)
    recorded_calls = [
        call for r in records for call in (*r.get("calls", []), *r.get("setup_calls", []))
    ]
    categories = Counter(r["category"] for r in records)
    return {
        "coverage": {
            "completed_runs": len(records),
            "planned_runs": planned_questions * runs,
            "completed_questions": len(completed),
            "planned_questions": planned_questions,
        },
        "exact_answer": rate([r["exact_answer"] for r in records]),
        "plan_accuracy": rate(
            [r["plan_correct"] for r in records if r["plan_correct"] is not None]
        ),
        "refusal_precision": rate([r["expected_refusal"] for r in records if r["refused"]]),
        "refusal_recall": rate([r["refused"] for r in records if r["expected_refusal"]]),
        "flakiness": {
            "flaky": sum(len({r["exact_answer"] for r in g}) > 1 for g in completed),
            "total": len(completed),
            "rate": mean(len({r["exact_answer"] for r in g}) > 1 for g in completed)
            if completed
            else None,
        },
        "answer_variation": {
            "varied": sum(len({r["answer_signature"] for r in g}) > 1 for g in completed),
            "total": len(completed),
            "rate": mean(len({r["answer_signature"] for r in g}) > 1 for g in completed)
            if completed
            else None,
        },
        "latency_ms": {
            "mean": mean(latency) if latency else None,
            "p95": latency[math.ceil(len(latency) * 0.95) - 1] if latency else None,
        },
        "provider_calls": sum(r["provider_calls"] for r in records),
        "setup_provider_calls": sum(r.get("setup_provider_calls", 0) for r in records),
        "recorded_provider_calls": len(recorded_calls),
        "token_usage": {
            "calls_with_usage": sum(bool(c.get("usage")) for c in recorded_calls),
            "calls_without_usage": sum(not c.get("usage") for c in recorded_calls),
            "reported_tokens": {
                key: sum(c.get("usage", {}).get(key, 0) for c in recorded_calls)
                for key in ("prompt_token_count", "candidates_token_count", "total_token_count")
            },
        },
        "analytical_calls": sum(r["analytical_calls"] for r in records),
        "categories": {
            category: rate([r["exact_answer"] for r in records if r["category"] == category])
            for category in categories
        },
    }
