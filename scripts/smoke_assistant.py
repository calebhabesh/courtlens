#!/usr/bin/env python3
"""Smoke test script for CourtLens tool-backed assistant (Milestone P8).

Verifies allowlisted analytical tools, multi-turn loop, evidence ledger verification,
and domain boundary handling against curated benchmark queries.

By default, operates completely offline using OfflineFixtureAssistantProvider (no API key needed).
Pass `--live` to test against the real Gemini API with COURTLENS_GEMINI_API_KEY.

Usage:
    python scripts/smoke_assistant.py [--live]
"""

from __future__ import annotations

import argparse
import sys

from courtlens.services.assistant.smoke import run_assistant_smoke


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test for CourtLens research assistant.")
    parser.add_argument(
        "--live",
        action="store_true",
        help="Run live verification against Gemini API using COURTLENS_GEMINI_API_KEY.",
    )
    args = parser.parse_args()
    return run_assistant_smoke(live=args.live)


if __name__ == "__main__":
    sys.exit(main())
