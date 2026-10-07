"""Supplemental language evaluation covering finance and empty-season (2026-27) cases.

Evaluates:
- Cross-season query to 2026-27 under 2024-25 context -> clarification_required (context)
- Query in empty 2026-27 season -> no_data (truthful zero box scores)
- Profile in empty 2026-27 season -> answered (0 games in 2026-27)
- Unpinned contract question -> unsupported (contracts capability / requires admitted book)
- Unpinned payroll question -> unsupported (contracts capability / requires admitted book)
- Manual finance query with admitted book -> answered (exact cents, independent context)
"""

from __future__ import annotations

import argparse
import json
import time
from datetime import UTC, datetime
from importlib.metadata import version
from pathlib import Path
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtlens.config import get_settings
from courtlens.database import engine
from courtlens.domain.conversation import AnalysisPlan, ConversationTurnRequest, OperationStep
from courtlens.finance_models import FinanceRelease
from courtlens.services.assistant.conversations import clear_conversation, run_conversation_turn
from courtlens.services.assistant.planner import GeminiPlanProvider
from courtlens.services.workbench_analytics import resolve_workbench_context


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--real-provider", action="store_true")
    parser.add_argument("--project-tier", choices=["free"])
    parser.add_argument("--model", default=None, help="Provider model override")
    args = parser.parse_args()

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

    model = args.model or settings.gemini_model
    provider = (
        GeminiPlanProvider(settings.gemini_api_key.get_secret_value(), model)
        if args.real_provider and settings.gemini_api_key
        else None
    )

    with Session(engine) as session:
        res_24 = resolve_workbench_context(session, requested_season="2024-25")
        ctx_24 = {
            k: res_24.to_dict()[k]
            for k in ("release_id", "season", "phase", "before_date", "window")
        }

        res_26 = resolve_workbench_context(session, requested_season="2026-27")
        ctx_26 = {
            k: res_26.to_dict()[k]
            for k in ("release_id", "season", "phase", "before_date", "window")
        }

        admitted_book = (
            session.scalar(select(FinanceRelease.id).limit(1))
            or "96b89635-82b4-47c7-b4f6-52ab85c0f0bc"
        )

        cases = [
            {
                "id": "b34-supp-01",
                "category": "empty_season_cross_context",
                "description": (
                    "Cross-season query asking for 2026-27 scoring leaders from 2024-25 context"
                ),
                "question": "Show scoring leaders in 2026-27",
                "context": ctx_24,
                "expected_status": "clarification_required",
                "manual_plan": None,
            },
            {
                "id": "b34-supp-02",
                "category": "empty_season_query",
                "description": (
                    "Scoring leaders query executed under pinned 2026-27 empty season context"
                ),
                "question": "Show points per game leaders",
                "context": ctx_26,
                "expected_status": "no_data",
                "manual_plan": None,
            },
            {
                "id": "b34-supp-03",
                "category": "empty_season_profile",
                "description": "Player profile executed under pinned 2026-27 empty season context",
                "question": "Profile Scottie Barnes",
                "context": ctx_26,
                "expected_status": "answered",
                "manual_plan": None,
            },
            {
                "id": "b34-supp-04",
                "category": "finance_unpinned_contract",
                "description": "Natural language contract question without pinned contract book ID",
                "question": "What is Scottie Barnes contract?",
                "context": ctx_24,
                "expected_status": "unsupported",
                "manual_plan": None,
            },
            {
                "id": "b34-supp-05",
                "category": "finance_unpinned_payroll",
                "description": "Natural language payroll question without pinned contract book ID",
                "question": "Show Toronto Raptors payroll for 2024-25",
                "context": ctx_24,
                "expected_status": "unsupported",
                "manual_plan": None,
            },
            {
                "id": "b34-supp-06",
                "category": "finance_admitted_book",
                "description": "Explicit finance operation using admitted contract book ID",
                "question": "Inspect admitted 2024-25 contracts",
                "context": ctx_24,
                "expected_status": "answered",
                "manual_plan": AnalysisPlan(
                    steps=[
                        OperationStep(
                            step_id="fin_book",
                            operation="finance",
                            arguments={
                                "book_id": str(admitted_book),
                                "financial_season": "2024-25",
                                "known_at": "2026-10-04T00:00:00+00:00",
                                "effective_on": "2025-02-12",
                            },
                        )
                    ]
                ),
            },
        ]

        report = {
            "started_at": datetime.now(UTC).isoformat(),
            "mode": "real_provider" if args.real_provider else "fixture_simulation",
            "model": model if args.real_provider else None,
            "sdk_version": version("google-genai") if args.real_provider else None,
            "project_tier": "owner_declared_free_not_independently_verified"
            if args.real_provider
            else None,
            "total_cases": len(cases),
            "cases": [],
        }

        for i, case in enumerate(cases):
            if i > 0 and args.real_provider and not case["manual_plan"]:
                time.sleep(4.5)

            ids: list[UUID] = []
            try:
                start = time.monotonic()
                req = ConversationTurnRequest(
                    request_id=uuid4(),
                    message=case["question"],
                    context=case["context"],
                    plan=case["manual_plan"],
                )
                ans = run_conversation_turn(
                    session,
                    req,
                    provider=None if case["manual_plan"] else provider,
                )
                ids.append(ans.conversation_id)
                elapsed_ms = round((time.monotonic() - start) * 1000, 3)

                passed = ans.status == case["expected_status"]
                report["cases"].append(
                    {
                        "id": case["id"],
                        "category": case["category"],
                        "description": case["description"],
                        "question": case["question"],
                        "context_season": case["context"]["season"],
                        "status": ans.status,
                        "expected_status": case["expected_status"],
                        "passed": passed,
                        "elapsed_ms": elapsed_ms,
                        "observed_model_version": provider.observed_model_version
                        if provider and not case["manual_plan"]
                        else None,
                        "accounting": ans.accounting,
                        "canonical_plan": ans.plan.model_dump(mode="json") if ans.plan else None,
                        "results_count": len(ans.results),
                        "result_hashes": [r.result_hash for r in ans.results],
                    }
                )
            finally:
                for cid in set(ids):
                    clear_conversation(cid)

        passed_count = sum(1 for c in report["cases"] if c["passed"])
        report["passed_count"] = passed_count
        report["accuracy"] = round(passed_count / len(cases), 3)
        report["all_passed"] = passed_count == len(cases)

        args.output.write_text(json.dumps(report, indent=2, default=str) + "\n")
        print(
            json.dumps(
                {
                    "passed": f"{passed_count}/{len(cases)}",
                    "accuracy": report["accuracy"],
                    "all_passed": report["all_passed"],
                }
            )
        )


if __name__ == "__main__":
    main()
