"""Smoke test runner for CourtLens tool-backed assistant benchmarks."""

from __future__ import annotations

import time

from courtlens.config import get_settings
from courtlens.database import SessionLocal
from courtlens.services.assistant.curated_questions import CURATED_QUESTIONS
from courtlens.services.assistant.provider import (
    GeminiAssistantProvider,
    OfflinePlanFixtureProvider,
)
from courtlens.services.assistant.service import (
    run_assistant_query,
)
from courtlens.services.assistant.status import get_assistant_status


def run_assistant_smoke(live: bool = False) -> int:
    settings = get_settings()
    status = get_assistant_status()

    print("=" * 80)
    print("COURTLENS ANALYTICAL ASSISTANT SMOKE TEST")
    print("=" * 80)
    print(f"Configured:      {status.configured}")
    print(f"Model:           {status.model}")
    print(f"Allowed Tools:   {len(status.allowed_tools)} allowlisted tools")
    print(f"Mode:            {'Live API' if live else 'Deterministic Offline Fixture'}")
    print("-" * 80)

    provider: GeminiAssistantProvider | OfflinePlanFixtureProvider
    if live:
        if not settings.gemini_api_key:
            print("ERROR: --live requested but COURTLENS_GEMINI_API_KEY is not set.")
            print("Provide the key in .env or environment before running live smoke.")
            return 1
        provider = GeminiAssistantProvider(
            api_key=settings.gemini_api_key.get_secret_value(),
            model=settings.gemini_model,
        )
    else:
        provider = OfflinePlanFixtureProvider()

    failures = 0
    passed_count = 0

    with SessionLocal() as session:
        for idx, spec in enumerate(CURATED_QUESTIONS, 1):
            t0 = time.perf_counter()
            print(f"\n[{idx}/{len(CURATED_QUESTIONS)}] {spec.id}: '{spec.question}'")

            try:
                answer = run_assistant_query(
                    session=session,
                    question=spec.question,
                    provider=provider,
                )
                elapsed = (time.perf_counter() - t0) * 1000.0

                passed, message = spec.verify(answer)

                tools_called = [t.tool_name for t in answer.tool_trace]
                print(f"  Status:          {answer.status}")
                called_summary = ", ".join(tools_called) or "none"
                print(f"  Tool Calls:      {len(answer.tool_trace)} calls ({called_summary})")
                print(f"  Evidence Cells:  {len(answer.evidence_refs)} cells registered")
                print(f"  Verified Claims: {len(answer.supported_claims)}")
                print(f"  Result Tables:   {len(answer.result_tables)}")
                print(f"  Limitations:     {len(answer.limitations)}")
                if answer.explorer_query:
                    print(f"  Explorer URL:    {answer.explorer_query.target_url}")

                if passed:
                    print(f"  Verification:    PASS - {message}")
                    passed_count += 1
                else:
                    print(f"  Verification:    FAIL - {message}")
                    failures += 1

            except Exception as err:
                elapsed = (time.perf_counter() - t0) * 1000.0
                print(f"  Execution Time:  {elapsed:.1f}ms")
                print(f"  Verification:    ERROR - {err}")
                failures += 1

    print("\n" + "=" * 80)
    total_q = len(CURATED_QUESTIONS)
    print(f"SUMMARY: {passed_count} passed, {failures} failed out of {total_q} benchmarks.")
    print("=" * 80)

    return 1 if failures > 0 else 0
