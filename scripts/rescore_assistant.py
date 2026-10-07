"""Rescore immutable captures against the retained SQL snapshot, with zero inference.

The original acquisition report is never overwritten. This scores saved responses;
it does not measure a changed planner/router or claim a fresh live evaluation.
"""

import argparse
import gzip
import hashlib
import json
from datetime import UTC, date, datetime
from pathlib import Path

from sqlalchemy import text

from courtlens.database import SessionLocal
from courtlens.domain.hybrid_assistant import HybridTurnResponse
from courtlens.services.assistant.revamp_evaluation import (
    CORPUS,
    canonical_plan,
    expected_answer,
    load_corpus,
    score_answer,
    sql_rows,
    summarize,
)
from courtlens.services.workbench_analytics import resolve_workbench_context


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--corpus", type=Path)
    parser.add_argument("--open-holdout", action="store_true", help="AR08 only")
    args = parser.parse_args()
    if args.output.exists():
        parser.error("Refusing to overwrite evidence")
    raw = args.capture.read_bytes()
    report = json.loads(gzip.decompress(raw) if args.capture.suffix == ".gz" else raw)
    if report["split"] == "holdout" and not args.open_holdout:
        parser.error("Holdout is sealed until AR08")
    corpus_path = args.corpus or next(
        (
            p
            for p in CORPUS.parent.glob("ar02-v*.json")
            if p.with_suffix(".sha256").read_text().strip() == report["corpus_sha256"]
        ),
        None,
    )
    if corpus_path is None:
        parser.error("No retained frozen corpus matches the capture")
    corpus, digest = load_corpus(corpus_path)
    if report["corpus_sha256"] != digest:
        parser.error("Capture belongs to a different frozen corpus")
    cases = {c["id"]: c for c in corpus["cases"] if c["split"] == report["split"]}
    scope_cache = {}
    changes = []
    with SessionLocal() as session:
        session.execute(text("SET TRANSACTION READ ONLY"))
        for record in report["records"]:
            case = cases[record["id"]]
            cutoff = case.get("before_date", corpus["before_date"])
            season = case.get("season", corpus["context_season"])
            phase = case.get("phase", "regular_season")
            scope_key = (season, phase, cutoff)
            if scope_key not in scope_cache:
                context = resolve_workbench_context(
                    session,
                    release_id=report["context"]["release_id"],
                    requested_season=season,
                    requested_phase=phase,
                    requested_before_date=date.fromisoformat(cutoff),
                )
                if context.dataset_id != report["context"]["dataset_id"] or (
                    context.semantic_signature != report["context"]["semantic_signature"]
                ):
                    parser.error("Retained input identity changed")
                scope_cache[scope_key] = context, sql_rows(session, context)
            context, rows = scope_cache[scope_key]
            expected = expected_answer(session, context, case, rows)
            plan = canonical_plan(session, context, case["expected_plan"])
            answer = HybridTurnResponse.model_validate(record["response"])
            score = score_answer(case, expected, plan, answer)
            if record.get("setup_response") and record["setup_response"]["status"] != "answered":
                score["exact_answer"] = False
                score["failures"].append("setup_failed")
            if record["failures"] != score["failures"]:
                changes.append(
                    {
                        "id": record["id"],
                        "repetition": record["repetition"],
                        "before": record["failures"],
                        "after": score["failures"],
                    }
                )
            record.update(score, expected=expected, expected_plan=plan)
        session.rollback()
    report["summary"] = summarize(report["records"], len(cases), corpus["runs"])
    report["summary"]["forecast_issuance_coverage"] = {
        "available": sum(
            r["expected"]["data"].get("status") != "no_issuance"
            for r in report["records"]
            if r["category"] == "forecast"
        ),
        "total": sum(r["category"] == "forecast" for r in report["records"]),
    }
    report["rescoring"] = {
        "at": datetime.now(UTC).isoformat(),
        "inference_calls": 0,
        "capture_sha256": hashlib.sha256(raw).hexdigest(),
        "changes": changes,
        "scorer_sha256": hashlib.sha256(
            Path("src/courtlens/services/assistant/revamp_evaluation.py").read_bytes()
        ).hexdigest(),
        "corpus_file": str(corpus_path),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(report["summary"], indent=2))


if __name__ == "__main__":
    main()
