"""AR02 development baseline; holdout inference requires the AR08 opt-in flag."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import time
from datetime import UTC, date, datetime
from importlib.metadata import version
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy import text

from courtload.config import get_settings
from courtload.database import SessionLocal
from courtload.domain.conversation import ConversationContext
from courtload.domain.hybrid_assistant import HybridTurnRequest, HybridTurnResponse
from courtload.services.assistant.hybrid import run_hybrid_turn
from courtload.services.assistant.planner import (
    PLANNER_PROMPT,
    GeminiPlanProvider,
    PlanningOutput,
    ProviderFailure,
)
from courtload.services.assistant.revamp_evaluation import (
    CORPUS,
    canonical_plan,
    expected_answer,
    load_corpus,
    score_answer,
    sql_rows,
    summarize,
)
from courtload.services.workbench_analytics import canonical_hash, resolve_workbench_context

FREE_EVIDENCE = Path("docs/evidence/pf07d-quota-policy/free-project.json")


class FixtureProvider:
    """Authored golden plans, explicitly not recorded inference or language accuracy."""

    def __init__(self, plan: dict[str, Any] | None) -> None:
        self.data = plan

    def plan(self, payload: str, *, timeout_seconds: float) -> PlanningOutput:
        if self.data is None:
            raise ProviderFailure("disabled")
        return PlanningOutput(self.data)


class RecordingProvider:
    def __init__(
        self, provider: GeminiPlanProvider, interval: float, max_calls: int | None
    ) -> None:
        self.provider = provider
        self.interval = interval
        self.max_calls = max_calls
        self.calls: list[dict[str, Any]] = []
        self.last_started = 0.0
        self.stopped: str | None = None

    def observe_terminal(self, answer: HybridTurnResponse) -> None:
        # The hard caller deadline/lock can fail before the SDK thread reports its result.
        for block in answer.blocks:
            if block.kind == "inability" and block.reason in (
                "provider_quota",
                "provider_timeout",
                "provider_busy",
                "provider_error",
            ):
                self.stopped = self.stopped or block.reason

    def plan(self, payload: str, *, timeout_seconds: float) -> PlanningOutput:
        if self.stopped:
            raise ProviderFailure("disabled")
        if self.max_calls is not None and len(self.calls) >= self.max_calls:
            self.stopped = "optional_call_limit"
            raise ProviderFailure("disabled")
        pause = max(0.0, self.last_started + self.interval - time.monotonic())
        if pause >= timeout_seconds:
            self.stopped = "pacing_exceeds_turn_deadline"
            raise TimeoutError("pacing exceeds turn deadline")
        time.sleep(pause)
        self.last_started = time.monotonic()
        body = json.loads(payload)
        operations = body.pop("operations")
        record: dict[str, Any] = {
            "input_sha256": hashlib.sha256(payload.encode()).hexdigest(),
            "input": body,
            "operations_sha256": canonical_hash(operations),
        }
        self.calls.append(record)
        try:
            output = self.provider.plan(payload, timeout_seconds=timeout_seconds - pause)
            record.update(
                data=output.data,
                usage=output.usage,
                model_version=self.provider.observed_model_version,
            )
            return output
        except ProviderFailure as exc:
            record.update(failure=exc.kind, retry_after=exc.retry_after)
            self.stopped = exc.kind
            raise
        except TimeoutError:
            record["failure"] = "timeout"
            self.stopped = "timeout"
            raise
        finally:
            record["elapsed_ms"] = round((time.monotonic() - self.last_started) * 1000, 3)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--mode", choices=("live", "fixture"), default="live")
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--split", choices=("dev", "holdout"), default="dev")
    parser.add_argument("--open-holdout", action="store_true", help="AR08 only; no holdout tuning")
    parser.add_argument("--free-project-evidence", type=Path, default=FREE_EVIDENCE)
    parser.add_argument("--interval-seconds", type=float, default=5.0)
    parser.add_argument("--max-calls", type=int)
    parser.add_argument("--release-id", help="Pin a retained published snapshot")
    args = parser.parse_args()
    if args.split == "holdout" and not args.open_holdout:
        parser.error("Holdout is sealed until AR08; use --open-holdout only for final acceptance")
    if args.interval_seconds < 0 or (args.max_calls is not None and args.max_calls < 1):
        parser.error("Interval must be nonnegative; optional max calls must be positive")
    output = args.output or Path(
        "data/artifacts/assistant-eval/"
        + datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
        + f"-{args.mode}-{args.split}.json"
    )
    if output.exists():
        parser.error("Refusing to overwrite evidence; choose a new output")
    corpus, digest = load_corpus(args.corpus)
    cases = [c for c in corpus["cases"] if c["split"] == args.split]
    settings = get_settings()
    provider = None
    eligibility_digest = None
    if args.mode == "live":
        if not settings.gemini_api_key:
            parser.error("Configure Gemini credentials for live evaluation")
        eligibility = json.loads(args.free_project_evidence.read_text())
        if (
            not all(
                eligibility.get(k)
                for k in (
                    "verified_free",
                    "checked_at",
                    "verification_method",
                    "configured_key_matches_screenshot",
                )
            )
            or eligibility["verified_free"] is not True
        ):
            parser.error("Configured project requires the retained dated Free-tier evidence")
        eligibility_digest = hashlib.sha256(args.free_project_evidence.read_bytes()).hexdigest()
        provider = RecordingProvider(
            GeminiPlanProvider(settings.gemini_api_key.get_secret_value(), settings.gemini_model),
            args.interval_seconds,
            args.max_calls,
        )
    report: dict[str, Any] = {
        "version": "courtlens-assistant-ar02-report-v1",
        "started_at": datetime.now(UTC).isoformat(),
        "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
        "mode": "live" if provider else "authored_fixture_not_language_accuracy",
        "corpus_sha256": digest,
        "corpus_file": str(args.corpus),
        "corpus_version": corpus["version"],
        "split": args.split,
        "runs": corpus["runs"],
        "clock": corpus["as_of"],
        "planner_prompt_sha256": hashlib.sha256(PLANNER_PROMPT.encode()).hexdigest(),
        "model": settings.gemini_model if provider else None,
        "sdk_version": version("google-genai") if provider else None,
        "evaluator_sha256": {
            str(path): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in (
                Path(__file__),
                Path("src/courtload/services/assistant/revamp_evaluation.py"),
            )
        },
        "free_project_evidence_sha256": eligibility_digest,
        "records": [],
        "provider_calls": [],
        "stopped": None,
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    # Reserve the chosen path atomically; concurrent runs cannot replace each other's evidence.
    with output.open("x"):
        pass

    def checkpoint() -> None:
        report["summary"] = summarize(report["records"], len(cases), corpus["runs"])
        if provider:
            report["provider_calls"] = provider.calls
        temporary = output.with_suffix(".tmp")
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
        temporary.replace(output)

    checkpoint()

    with SessionLocal() as session:
        # Worker operations also have read-only transactions.
        # No histories or publications are written.
        session.execute(text("SET TRANSACTION READ ONLY"))
        root_context = resolve_workbench_context(
            session,
            release_id=args.release_id,
            requested_season=corpus["context_season"],
            requested_before_date=date.fromisoformat(corpus["before_date"]),
        )
        report["context"] = root_context.to_dict()
        rows_cache: dict[str, list[dict[str, Any]]] = {}
        checkpoint()
        for case in cases:
            context = resolve_workbench_context(
                session,
                release_id=root_context.release_id,
                requested_season=case.get("season", corpus["context_season"]),
                requested_phase=case.get("phase", "regular_season"),
                requested_before_date=date.fromisoformat(
                    case.get("before_date", corpus["before_date"])
                ),
            )
            context_key = canonical_hash(context.to_dict())
            if context_key not in rows_cache:
                rows_cache[context_key] = sql_rows(session, context)
            expected = expected_answer(session, context, case, rows_cache[context_key])
            golden_plan = canonical_plan(session, context, case["expected_plan"])
            pinned = ConversationContext(
                **expected.get(
                    "scope",
                    {
                        "release_id": context.release_id,
                        "season": context.season,
                        "phase": context.phase,
                        "before_date": context.before_date,
                    },
                )
            )
            for repetition in range(1, corpus["runs"] + 1):
                if provider and (
                    provider.stopped
                    or (args.max_calls is not None and len(provider.calls) >= args.max_calls)
                ):
                    report["stopped"] = provider.stopped or "optional_call_limit"
                    break
                start_call = len(provider.calls) if provider else 0
                previous_plan = None
                setup_response = None
                clock = lambda: date.fromisoformat(corpus["as_of"])  # noqa: E731
                started = time.monotonic()
                if case.get("setup"):
                    setup = case["setup"]
                    setup_response = run_hybrid_turn(
                        session,
                        HybridTurnRequest(
                            request_id=uuid4(), message=setup["message"], context=pinned
                        ),
                        provider=provider or FixtureProvider(setup["expected_plan"]),
                        clock=clock,
                    )
                    previous_plan = setup_response.plan
                    if provider:
                        provider.observe_terminal(setup_response)
                before_turn = len(provider.calls) if provider else 0
                answer = run_hybrid_turn(
                    session,
                    HybridTurnRequest(request_id=uuid4(), message=case["message"], context=pinned),
                    previous_plan=previous_plan,
                    inherited_context=pinned,
                    provider=provider or FixtureProvider(case["expected_plan"]),
                    clock=clock,
                )
                if provider:
                    provider.observe_terminal(answer)
                scored = score_answer(case, expected, golden_plan, answer)
                if setup_response is not None and setup_response.status != "answered":
                    scored["exact_answer"] = False
                    scored["failures"].append("setup_failed")
                scored.update(
                    repetition=repetition,
                    message=case["message"],
                    expected=expected,
                    expected_plan=golden_plan,
                    response=answer.model_dump(mode="json"),
                    setup_response=setup_response.model_dump(mode="json")
                    if setup_response
                    else None,
                    calls=provider.calls[before_turn:] if provider else [],
                    setup_calls=provider.calls[start_call:before_turn] if provider else [],
                    provider_calls=answer.accounting.provider_calls,
                    setup_provider_calls=setup_response.accounting.provider_calls
                    if setup_response
                    else 0,
                    analytical_calls=answer.accounting.analytical_calls,
                    elapsed_ms=round((time.monotonic() - started) * 1000, 3),
                    answer_signature=canonical_hash(
                        {
                            "status": answer.status,
                            "scope": answer.scope.selections.model_dump(mode="json")
                            if answer.scope
                            else None,
                            "results": [b.result.data for b in answer.blocks if b.kind == "result"],
                            "text": [getattr(b, "text", "") for b in answer.blocks],
                        }
                    ),
                )
                report["records"].append(scored)
                checkpoint()
                print(
                    f"{case['id']} run {repetition}: answer={scored['exact_answer']} "
                    f"plan={scored['plan_correct']} {scored['failures']}",
                    flush=True,
                )
                if provider and provider.stopped:
                    report["stopped"] = provider.stopped
                    break
            if report["stopped"]:
                break
        session.rollback()
    report["finished_at"] = datetime.now(UTC).isoformat()
    checkpoint()
    print(f"Report: {output}")
    print(json.dumps(report["summary"], indent=2))
    # Model mistakes are measurements, not a threshold gate. Incomplete acquisition is distinct.
    if report["stopped"]:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
