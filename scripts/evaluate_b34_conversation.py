"""Bounded corpus evaluation. No real AI unless --real-provider --project-tier free.

Use a NEW output path. The original corpus is never rewritten. The sole incorrect
B33 player mapping is reported and corrected explicitly in this evaluation.
"""

import argparse
import hashlib
import json
import time
from collections import Counter
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path
from uuid import uuid4

from sqlalchemy.orm import Session

from courtload.config import get_settings
from courtload.database import engine
from courtload.domain.conversation import AnalysisPlan, ConversationTurnRequest
from courtload.services.assistant.conversations import clear_conversation, run_conversation_turn
from courtload.services.assistant.planner import GeminiPlanProvider, PlanningOutput
from courtload.services.workbench_analytics import resolve_workbench_context

CORPUS = Path("tests/fixtures/assistant/b33-corpus-v1.json")


class FixturePlanner:
    def __init__(self, plan):
        self.data = plan

    def plan(self, payload, *, timeout_seconds):
        return PlanningOutput(self.data)


def signatures(answer):
    return sorted(
        json.dumps({"operation": step.operation, "arguments": step.arguments}, sort_keys=True)
        for step in (answer.plan.steps if answer.plan else [])
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--real-provider", action="store_true")
    parser.add_argument("--project-tier", choices=["free"])
    parser.add_argument("--season", default="2024-25")
    parser.add_argument("--max-cases", type=int, default=45, choices=range(1, 46))
    parser.add_argument("--model", default=None, help="Provider model override")
    parser.add_argument("--corpus", type=Path, default=CORPUS, help="Checksum-frozen corpus path")
    parser.add_argument("--pause-seconds", type=float, default=4.5)
    parser.add_argument("--case-id", action="append", help="Explicit bounded case recheck")
    args = parser.parse_args()
    if not 2 <= args.pause_seconds <= 60:
        parser.error("Provider pacing must be between 2 and 60 seconds")
    if args.output.exists():
        parser.error("Refusing to overwrite retained evidence")
    settings = get_settings()
    if args.real_provider and (
        args.project_tier != "free"
        or not settings.gemini_api_key
        or not settings.gemini_api_key.get_secret_value().strip()
    ):
        parser.error(
            "Real evaluation requires an owner-configured key and explicit free-project declaration"
        )
    original = args.corpus.read_bytes()
    expected = args.corpus.with_suffix(".sha256").read_text().split()[0]
    actual = hashlib.sha256(original).hexdigest()
    if expected != actual:
        raise ValueError("Frozen corpus checksum mismatch")
    model = args.model or settings.gemini_model
    provider = (
        GeminiPlanProvider(settings.gemini_api_key.get_secret_value(), model)
        if args.real_provider and settings.gemini_api_key
        else None
    )
    cases = json.loads(original)["cases"]
    if args.case_id:
        if set(args.case_id) - {case["id"] for case in cases}:
            parser.error("Unknown frozen case ID")
        cases = [case for case in cases if case["id"] in args.case_id]
    cases = cases[: args.max_cases]
    report = {
        "started_at": datetime.now(UTC).isoformat(),
        "mode": "real_provider"
        if args.real_provider
        else "fixture_execution_not_language_accuracy",
        "model": model if args.real_provider else None,
        "sdk_version": version("google-genai") if args.real_provider else None,
        "project_tier": "owner_declared_free_not_independently_verified"
        if args.real_provider
        else None,
        "corpus_sha256": actual,
        "corpus_path": str(args.corpus),
        "corrections": [
            {
                "case": "b33-23",
                "field": "player_b",
                "original": "1628369",
                "corrected": "1629628",
                "reason": "Question names RJ Barrett; original fixture uses Jayson Tatum ID.",
            }
        ]
        if args.corpus == CORPUS
        else [],
        "limits": {
            "cases": args.max_cases,
            "calls_per_case": 1,
            "provider_seconds": 20,
            "turn_seconds": 45,
            "stop_on_quota_or_provider_failure": True,
            "pause_seconds": args.pause_seconds,
        },
        "cases": [],
    }
    with Session(engine) as session:
        resolved = resolve_workbench_context(session, requested_season=args.season)
        context = {
            k: resolved.to_dict()[k]
            for k in ("release_id", "season", "phase", "before_date", "window")
        }
        report["context"] = resolved.to_dict()
        for i, case in enumerate(cases):
            if i > 0 and args.real_provider:
                time.sleep(args.pause_seconds)
            plan = case["fixture_plan"]
            if args.corpus == CORPUS and case["id"] == "b33-23":
                plan = json.loads(json.dumps(plan))
                plan["steps"][0]["arguments"]["player_b"] = "1629628"
            ids = []
            try:
                baseline = run_conversation_turn(
                    session,
                    ConversationTurnRequest(
                        request_id=uuid4(),
                        message="Manual reference",
                        context=context,
                        plan=AnalysisPlan.model_validate(plan),
                    ),
                )
                ids.append(baseline.conversation_id)
                request = ConversationTurnRequest(
                    request_id=uuid4(), message=case["question"], context=context
                )
                # The referential question requires an actual prior canonical player selection.
                if case["id"] == "b33-20":
                    seed = run_conversation_turn(
                        session,
                        ConversationTurnRequest(
                            request_id=uuid4(),
                            message="Select Scottie Barnes",
                            context=context,
                            plan=AnalysisPlan(
                                steps=[
                                    {
                                        "step_id": "player",
                                        "operation": "profile",
                                        "arguments": {"player_id": "1630567"},
                                    }
                                ]
                            ),
                        ),
                    )
                    ids.append(seed.conversation_id)
                    request = request.model_copy(
                        update={
                            "conversation_id": seed.conversation_id,
                            "context_fingerprint": seed.context_fingerprint,
                        }
                    )
                start = time.monotonic()
                answer = run_conversation_turn(
                    session,
                    request,
                    provider=provider if args.real_provider else FixturePlanner(plan),
                )
                ids.append(answer.conversation_id)
                if case["category"] == "supported":
                    passed = (
                        signatures(answer) == signatures(baseline)
                        and answer.status == baseline.status
                        and sorted(r.result_hash for r in answer.results)
                        == sorted(r.result_hash for r in baseline.results)
                    )
                elif case["category"] == "clarification":
                    passed = answer.status == "clarification_required" and not answer.results
                else:
                    passed = answer.status == "unsupported" and not answer.results
                report["cases"].append(
                    {
                        "id": case["id"],
                        "split": case["split"],
                        "category": case["category"],
                        "status": answer.status,
                        "passed": passed,
                        "observed_model_version": provider.observed_model_version
                        if provider
                        else None,
                        "elapsed_ms": round((time.monotonic() - start) * 1000, 3),
                        "accounting": answer.accounting,
                        "canonical_plan": answer.plan.model_dump(mode="json")
                        if answer.plan
                        else None,
                        "result_hashes": [r.result_hash for r in answer.results],
                        "manual_result_hashes": [r.result_hash for r in baseline.results],
                    }
                )
                print(
                    json.dumps({"case": case["id"], "status": answer.status, "passed": passed}),
                    flush=True,
                )
                if args.real_provider and answer.status in (
                    "quota_exceeded",
                    "provider_error",
                    "timeout",
                    "disabled",
                ):
                    report["stopped_on"] = answer.status
                    break
            finally:
                for conversation_id in set(ids):
                    clear_conversation(conversation_id)
    report["counts"] = dict(
        Counter(f"{c['category']}:{'pass' if c['passed'] else 'fail'}" for c in report["cases"])
    )
    report["provider_calls"] = sum(
        c["accounting"].get("provider_calls", 0) for c in report["cases"]
    )
    report["real_provider_calls"] = report["provider_calls"] if args.real_provider else 0
    supported = [c for c in report["cases"] if c["category"] == "supported"]
    critical = [c for c in report["cases"] if c["category"] != "supported"]
    report["supported_accuracy"] = (
        sum(c["passed"] for c in supported) / len(supported) if supported else None
    )
    report["language_gate"] = (
        "not_run"
        if not args.real_provider
        else (
            "passed"
            if len(report["cases"]) == 45
            and report["supported_accuracy"] >= 0.9
            and all(c["passed"] for c in critical)
            else "unmet"
        )
    )
    if args.real_provider and args.corpus != CORPUS:
        report["language_gate"] = "supplemental_only"
    report["limitations"] = [
        (
            "Original 45-case language corpus has no finance or current empty-season cases; "
            "supplemental evaluation is required before full chatbot acceptance."
        ),
        "Fixture planner invocations are simulated; remote inference calls are counted separately.",
        (
            "Observed provider model version is reported only when returned by the SDK; "
            "unavailable metadata is null."
        ),
    ]
    args.output.write_text(json.dumps(report, indent=2, default=str) + "\n")
    print(json.dumps({k: report[k] for k in ("counts", "provider_calls", "language_gate")}))


if __name__ == "__main__":
    main()
