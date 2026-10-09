"""Read-only, checksum-frozen hybrid evaluation; real inference requires explicit opt-in."""

import argparse
import hashlib
import json
import time
from collections import Counter
from datetime import UTC, date, datetime
from importlib.metadata import version
from pathlib import Path
from uuid import uuid4

from sqlalchemy import text

from courtlens.config import get_settings
from courtlens.database import SessionLocal
from courtlens.domain.conversation import AnalysisPlan, ConversationContext
from courtlens.domain.hybrid_assistant import HybridTurnRequest
from courtlens.services.assistant.evaluation import score_case
from courtlens.services.assistant.legacy.hybrid import run_hybrid_turn
from courtlens.services.assistant.legacy.planner import (
    PLANNER_PROMPT,
    GeminiPlanProvider,
    PlanningOutput,
    ProviderFailure,
)
from courtlens.services.workbench_analytics import resolve_workbench_context

CORPUS = Path("tests/fixtures/assistant/pf07d-hybrid-v1.json")


class FixturePlanner:
    def __init__(self, plan):
        self.data = plan

    def plan(self, payload, *, timeout_seconds):
        if self.data is None:
            raise ProviderFailure("disabled")
        return PlanningOutput(self.data)


class MeteredProvider:
    def __init__(self, provider, limit=None):
        self.provider = provider
        self.limit = limit
        self.calls = []

    def plan(self, payload, *, timeout_seconds):
        if self.limit is not None and len(self.calls) >= self.limit:
            raise ProviderFailure("disabled")
        record = {"input_sha256": hashlib.sha256(payload.encode()).hexdigest()}
        self.calls.append(record)
        started = time.monotonic()
        try:
            result = self.provider.plan(payload, timeout_seconds=min(20, timeout_seconds))
            record.update(usage=result.usage, model_version=self.provider.observed_model_version)
            return result
        except ProviderFailure as exc:
            record["failure"] = exc.kind
            raise
        except TimeoutError:
            record["failure"] = "timeout"
            raise
        finally:
            record["elapsed_ms"] = round((time.monotonic() - started) * 1000, 3)


def validate_free_project_evidence(eligibility):
    """Account-tier evidence is separate from provider quota and evaluation call counts."""
    if (
        eligibility.get("verified_free") is not True
        or not eligibility.get("checked_at")
        or not eligibility.get("verification_method")
    ):
        raise ValueError(
            "Dated confirmation of the configured project's Free billing tier is required"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--real-provider", action="store_true")
    parser.add_argument("--free-project-evidence", type=Path)
    parser.add_argument(
        "--max-calls",
        type=int,
        help=(
            "Optional early stop for a smoke test; omitted runs the finite corpus "
            "until completion or provider failure"
        ),
    )
    args = parser.parse_args()
    if args.max_calls is not None and args.max_calls < 1:
        parser.error("--max-calls must be positive when supplied")
    if args.output.exists():
        parser.error("Refusing to overwrite evidence; choose a new output path")
    raw = args.corpus.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if digest != args.corpus.with_suffix(".sha256").read_text().split()[0]:
        parser.error("Frozen corpus checksum mismatch")
    corpus = json.loads(raw)
    settings = get_settings()
    provider = None
    if args.real_provider:
        if not args.free_project_evidence or not settings.gemini_api_key:
            parser.error("Real inference needs configured credentials and free-project evidence")
        eligibility = json.loads(args.free_project_evidence.read_text())
        try:
            validate_free_project_evidence(eligibility)
        except ValueError as exc:
            parser.error(str(exc))
        provider = MeteredProvider(
            GeminiPlanProvider(settings.gemini_api_key.get_secret_value(), settings.gemini_model),
            args.max_calls,
        )
    report = {
        "started_at": datetime.now(UTC).isoformat(),
        "mode": "real_provider" if provider else "fixture_execution_not_language_accuracy",
        "corpus_sha256": digest,
        "corpus_version": corpus["version"],
        "evidence_role": corpus.get("evidence_role", "observed_regression_corpus"),
        "planner_prompt_sha256": hashlib.sha256(PLANNER_PROMPT.encode()).hexdigest(),
        "clock": corpus["as_of"],
        "model": settings.gemini_model if provider else None,
        "sdk_version": version("google-genai") if provider else None,
        "project_evidence_sha256": hashlib.sha256(
            args.free_project_evidence.read_bytes()
        ).hexdigest()
        if provider
        else None,
        "max_calls": args.max_calls if provider else 0,
        "quota_policy": "provider_project_limits" if provider else "no_inference",
        "cases": [],
    }
    with SessionLocal() as session:
        session.execute(text("SET TRANSACTION READ ONLY"))
        resolved = resolve_workbench_context(session, requested_season=corpus["context_season"])
        report["context"] = resolved.to_dict()
        context = ConversationContext(
            **{
                k: resolved.to_dict()[k]
                for k in ("release_id", "season", "phase", "before_date", "window")
            }
        )
        for case in corpus["cases"]:
            if case["category"] == "empty_scope":
                # This case asserts an empty synthetic PostgreSQL fixture. Retained
                # installations can have outcomes there; do not relabel that as failure.
                report.setdefault("not_applicable", []).append(
                    {"id": case["id"], "reason": "synthetic empty-scope input required"}
                )
                continue
            if provider and args.max_calls is not None and len(provider.calls) >= args.max_calls:
                report["stopped"] = "optional_call_limit"
                break
            if provider and provider.calls:
                time.sleep(4.5)
            request = HybridTurnRequest(
                request_id=uuid4(), message=case["message"], context=context
            )
            manual = None
            clock = lambda: date.fromisoformat(corpus["as_of"])  # noqa: E731
            if case.get("fixture_plan"):
                manual = run_hybrid_turn(
                    session,
                    request.model_copy(
                        update={"plan": AnalysisPlan.model_validate(case["fixture_plan"])}
                    ),
                    clock=clock,
                )
            selected_provider = provider or FixturePlanner(case.get("fixture_plan"))
            # Deterministic nonlocal corpus never requires inference. The injected provider
            # supplies only declared local fixture plans, not answers or source facts.
            answer = run_hybrid_turn(session, request, clock=clock, provider=selected_provider)
            score = score_case(case, answer, manual)
            score.update(
                message=case["message"],
                response=answer.model_dump(mode="json"),
                model_evaluated=bool(provider and answer.accounting.provider_calls),
            )
            report["cases"].append(score)
            if provider:
                report["provider_calls"] = provider.calls
            args.output.write_text(json.dumps(report, indent=2) + "\n")
            if provider and any(c.get("failure") for c in provider.calls):
                report["stopped"] = "provider_failure_no_retry"
                break
        session.rollback()
    outcomes = report["cases"]
    model_cases = [c for c in outcomes if c["model_evaluated"]]
    critical = [c for c in outcomes if c["category"] in ("critical_inability", "clarification")]
    status_counts = Counter(c["response"]["status"] for c in outcomes)
    report["summary"] = {
        "evaluated": len(outcomes),
        "correct": sum(c["correct"] for c in outcomes),
        "complete": sum(c["response_complete"] for c in outcomes),
        "safety_pass": sum(c["safety_pass"] for c in outcomes),
        "factual_required": sum(c["factual_answer_correct"] is not None for c in outcomes),
        "factual_correct": sum(c["factual_answer_correct"] is True for c in outcomes),
        "categories": dict(Counter(c["category"] for c in outcomes)),
        "held_out_correct": sum(c["held_out"] and c["correct"] for c in outcomes),
        "held_out_total": sum(c["held_out"] for c in outcomes),
        "terminal_statuses": dict(status_counts),
        "critical_correct": sum(c["correct"] for c in critical),
        "critical_total": len(critical),
        "model_evaluated_correct": sum(c["correct"] for c in model_cases),
        "model_evaluated_total": len(model_cases),
        "language_gate": "not_evaluated"
        if not provider
        else (
            "passed_bounded_corpus"
            if (
                model_cases
                and sum(c["correct"] for c in model_cases) / len(model_cases) >= 0.9
                and all(c["correct"] for c in critical)
                and all(c["safety_pass"] and c["response_complete"] for c in outcomes)
                and len(outcomes) == len(corpus["cases"]) - len(report.get("not_applicable", []))
                and all(c["factual_answer_correct"] is not False for c in outcomes)
            )
            else "unmet"
        ),
    }
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report["summary"]))
    if any(not c["correct"] for c in outcomes):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
