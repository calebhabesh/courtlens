"""AG06 live development evaluation; fresh holdout inference belongs to AG08."""

from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from courtlens.config import get_settings
from courtlens.database import SessionLocal
from courtlens.domain.assistant_agent import StoredTurnRecord
from courtlens.domain.conversation import ConversationContext
from courtlens.domain.hybrid_assistant import HybridTurnRequest
from courtlens.services.assistant.agent.evaluation import (
    CORPUS,
    load_corpus,
    oracle_answer,
    score_answer,
    summarize,
)
from courtlens.services.assistant.agent.loop import run_turn
from courtlens.services.assistant.agent.providers import create_provider
from courtlens.services.assistant.agent.providers.base import ProviderFailure
from courtlens.services.workbench_analytics import canonical_hash, resolve_workbench_context


def write_new(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("x") as handle:
        json.dump(value, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--provider", choices=("gemini", "anthropic", "openai"))
    parser.add_argument("--model")
    parser.add_argument("--corpus", type=Path, default=CORPUS)
    parser.add_argument("--output", type=Path)
    parser.add_argument(
        "--transcripts", type=Path, default=Path("evaluation/assistant/transcripts/ag-v3-im07")
    )
    parser.add_argument("--split", choices=("dev", "holdout"), default="dev")
    parser.add_argument("--open-holdout", action="store_true")
    parser.add_argument("--release-id")
    parser.add_argument("--case-id", action="append", help="Dev-only bounded measurement")
    args = parser.parse_args()
    if args.split == "holdout" and not args.open_holdout:
        parser.error("Fresh v3 holdout is sealed until AG08; no holdout tuning")
    if args.case_id and args.split != "dev":
        parser.error("Case selection is development-only; frozen holdout stays sealed")
    corpus, digest = load_corpus(args.corpus)
    settings = get_settings()
    updates = {}
    if args.provider:
        updates["assistant_provider"] = args.provider
    if args.model:
        updates["assistant_model"] = args.model
    settings = settings.model_copy(update=updates)
    provider_name = settings.resolved_assistant_provider
    model = settings.resolved_assistant_model
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ")
    output = args.output or Path(f"data/artifacts/assistant-eval/ag06-{provider_name}-{stamp}.json")
    if output.exists():
        parser.error("Refusing to overwrite evaluation evidence")
    cases = [c for c in corpus["cases"] if c["split"] == args.split]
    if args.case_id:
        known = {c["id"] for c in cases}
        if set(args.case_id) - known:
            parser.error("Unknown development case ID")
        cases = [c for c in cases if c["id"] in args.case_id]
    report: dict[str, Any] = {
        "version": "courtlens-ag06-report-v1",
        "started_at": datetime.now(UTC).isoformat(),
        "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
        "provider": provider_name,
        "model": model,
        "mode": "live",
        "split": args.split,
        "corpus_sha256": digest,
        "corpus_version": corpus["version"],
        "selected_case_ids": [case["id"] for case in cases],
        "runs": corpus["runs"],
        "complete": False,
        "records": [],
        "stopped": None,
        "implementation_sha256": {
            str(p): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in (
                Path(__file__),
                Path("src/courtlens/services/assistant/agent/prompt.py"),
                Path("src/courtlens/services/assistant/agent/evaluation.py"),
                Path("src/courtlens/services/assistant/agent/loop.py"),
            )
        },
    }
    records = report["records"]
    try:
        provider = create_provider(settings)
    except ProviderFailure as exc:
        report["stopped"] = {"reason": exc.kind, "retry_after": exc.retry_after}
    else:
        with SessionLocal() as session:
            release = resolve_workbench_context(session, release_id=args.release_id)
            report["release_id"] = release.release_id
            report["dataset_id"] = release.dataset_id
            for repetition in range(1, corpus["runs"] + 1):
                if report["stopped"]:
                    break
                for case in cases:
                    selections = ConversationContext(
                        release_id=release.release_id,
                        season=case.get("season", corpus["context_season"]),
                        phase=case.get("phase", "regular_season"),
                        before_date=date.fromisoformat(
                            case.get("before_date", corpus["before_date"])
                        ),
                    )
                    context = resolve_workbench_context(
                        session,
                        release_id=selections.release_id,
                        requested_season=selections.season,
                        requested_phase=selections.phase,
                        requested_before_date=selections.before_date,
                    )
                    expected = oracle_answer(session, context, case)
                    thread_id = uuid4()
                    previous = []
                    setup_accounting = None
                    for stage, message in (
                        *(([("setup", case["setup"]["message"])]) if case.get("setup") else []),
                        ("answer", case["message"]),
                    ):
                        request = HybridTurnRequest(
                            request_id=uuid4(),
                            thread_id=thread_id,
                            message=message,
                            context=selections,
                        )
                        run = run_turn(
                            session,
                            request,
                            provider=provider,
                            settings=settings,
                            today=date.fromisoformat(corpus["as_of"]),
                            history=previous,
                        )
                        transcript_path = (
                            args.transcripts / stamp / f"{case['id']}-r{repetition}-{stage}.json"
                        )
                        write_new(
                            transcript_path,
                            {
                                **run.transcript,
                                "request": request.model_dump(mode="json"),
                                "answer": run.response.model_dump(mode="json"),
                                "case_id": case["id"],
                                "run": repetition,
                                "corpus_sha256": digest,
                                "capture_mode": "live",
                            },
                        )
                        if run.response.failure or run.response.mode == "limited":
                            report["stopped"] = {
                                "reason": run.response.failure or "limited",
                                "retry_after": run.response.retry_after,
                                "case_id": case["id"],
                                "stage": stage,
                                "run": repetition,
                            }
                        if stage == "setup":
                            setup_accounting = run.response.accounting.model_dump(mode="json")
                            if report["stopped"]:
                                break
                            previous.append(
                                StoredTurnRecord(
                                    thread_id=thread_id,
                                    turn_id=run.response.turn_id,
                                    request=request,
                                    request_sha256=canonical_hash(request.model_dump(mode="json")),
                                    accepted_at=datetime.now(UTC),
                                    state="completed",
                                    response=run.response,
                                    response_sha256=canonical_hash(
                                        run.response.model_dump(mode="json")
                                    ),
                                )
                            )
                        else:
                            records.append(
                                {
                                    **score_answer(case, expected, run.response, run.transcript),
                                    "run": repetition,
                                    "transcript": str(transcript_path),
                                    "setup_accounting": setup_accounting,
                                }
                            )
                    report["summary"] = summarize(records, len(cases), corpus["runs"])
                    if report["stopped"]:
                        break
            report["complete"] = (
                len(records) == len(cases) * corpus["runs"] and not report["stopped"]
            )
    report["summary"] = summarize(records, len(cases), corpus["runs"])
    report["finished_at"] = datetime.now(UTC).isoformat()
    write_new(output, report)
    print(
        json.dumps(
            {
                "output": str(output),
                "complete": report["complete"],
                "stopped": report["stopped"],
                "coverage": report["summary"]["coverage"],
            }
        )
    )


if __name__ == "__main__":
    main()
