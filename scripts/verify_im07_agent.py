"""Read-only IM07 capture/replay against real SQL and sealed original rating oracles.

Authored transport replay is not language accuracy. --live attempts only the owner's
development RAPM example with the configured provider and stops on its first failure.
"""

from __future__ import annotations

import argparse
import gzip
import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from uuid import UUID

from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from courtlens.config import Settings, get_settings
from courtlens.domain.conversation import ConversationContext
from courtlens.domain.hybrid_assistant import HybridTurnRequest
from courtlens.services.assistant.agent.evaluation import (
    load_corpus,
    oracle_answer,
    score_answer,
    summarize,
)
from courtlens.services.assistant.agent.loop import run_turn
from courtlens.services.assistant.agent.providers import create_provider
from courtlens.services.assistant.agent.providers.base import AgentStep, ToolCall
from courtlens.services.assistant.agent.providers.replay import RecordedStep, ReplayProvider
from courtlens.services.workbench_analytics import resolve_workbench_context
from courtlens.workbench_models import WorkbenchIdentity


class AuthoredProvider:
    model = "synthetic-im07-not-language-accuracy"

    def __init__(self, case: dict[str, Any], name: str | None):
        self.case, self.name, self.stage = case, name, 0

    def step(self, prompt: str, messages: Any, tools: Any, **kwargs: Any) -> AgentStep:
        self.stage += 1
        metric = self.case["oracle"]["metric"]
        if self.stage == 1:
            return AgentStep(
                tool_calls=[ToolCall(id="catalog", name="list_metrics", arguments={"key": metric})]
            )
        if self.stage == 2:
            args = {
                "window": {"kind": "season"},
                "metric_selectors": [{"key": metric}],
                "sort": [{"field": metric, "direction": "desc"}],
                "page": {"limit": self.case["oracle"]["limit"]},
            }
            if self.name:
                args["name"] = self.name
            return AgentStep(
                tool_calls=[
                    ToolCall(
                        id="stats",
                        name="query_stats",
                        arguments={
                            "operation": "query",
                            "season": "last_season",
                            "arguments": args,
                        },
                    )
                ]
            )
        payload = messages[-1].tool_results[0].payload
        row = payload["data"]["items"][0]
        value = row["metrics"][metric]
        label = metric.replace("_", " ").upper()
        # Window labels do not add unsupported quantities to authored prose.
        label = label.removesuffix(" 2Y").removesuffix(" 3Y")
        marker = payload["answer_sources"][0]["source_id"]
        answer = (
            f"{row['player_name']} had a CourtLens {label} of {value:+.4f} in 2025-26.[^{marker}]"
        )
        if self.case.get("require_assumption"):
            answer = (
                "Assumption: Best defender means the highest CourtLens DRAPM "
                "in the regular season.\n" + answer
            )
        return AgentStep(
            text=answer + "\nThese are descriptive estimates under lineup confounding."
        )


def write_new(path: Path, body: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    raw = (json.dumps(body, indent=2, ensure_ascii=False) + "\n").encode()
    with path.open("xb") as handle:
        handle.write(gzip.compress(raw, mtime=0) if path.suffix == ".gz" else raw)


def verify(output: Path, *, live: bool = False, recordings: Path | None = None) -> None:
    corpus, digest = load_corpus()
    cases = [c for c in corpus["cases"] if c["split"] == "dev" and c.get("require_warehouse")]
    settings = get_settings()
    # This URL also reaches supervised spawned SQL workers, enforcing read-only at PostgreSQL.
    url = make_url(settings.database_url).update_query_dict(
        {"options": "-cdefault_transaction_read_only=on"}
    )
    engine = create_engine(url)
    records = []
    transcripts = recordings or output.parent / "transcripts"
    report: dict[str, Any] = {
        "version": "courtlens-im07-agent-verification-v1",
        "corpus_sha256": digest,
        "capture_mode": "authored_transport_not_language_accuracy",
        "holdout_inferred": False,
        "records": records,
        "live": None,
    }
    with Session(engine) as session:
        assert session.scalar(text("SHOW default_transaction_read_only")) == "on"
        context = resolve_workbench_context(
            session, requested_season="2025-26", requested_before_date=date(2026, 10, 7)
        )
        selections = ConversationContext(
            release_id=context.release_id, season="2025-26", before_date=context.before_date
        )
        report["publication"] = {
            "release_id": context.release_id,
            "snapshot_id": context.snapshot_id,
            "dataset_id": context.dataset_id,
            "semantic_signature": context.semantic_signature,
        }
        for index, case in enumerate(cases):
            expected = oracle_answer(session, context, case)
            name = (
                session.scalar(
                    select(WorkbenchIdentity.display_name).where(
                        WorkbenchIdentity.namespace == "nba",
                        WorkbenchIdentity.kind == "player",
                        WorkbenchIdentity.external_id == case["oracle"].get("player_id"),
                    )
                )
                if case["oracle"].get("player_id")
                else None
            )
            request = HybridTurnRequest(
                request_id=UUID(int=7000 + index),
                thread_id=UUID(int=7100 + index),
                message=case["message"],
                context=selections,
            )
            kwargs = {
                "today": date(2026, 10, 7),
                "turn_id": UUID(int=7200 + index),
                "settings": Settings(_env_file=None, assistant_provider="none"),
            }
            path = transcripts / f"{case['id']}.json.gz"
            if recordings is not None:
                record = json.loads(gzip.decompress(path.read_bytes()))
                assert record["corpus_sha256"] == digest
                assert record["request"] == request.model_dump(mode="json")
                assert record["capture_mode"] == report["capture_mode"]
            else:
                captured = run_turn(
                    session, request, provider=AuthoredProvider(case, name), **kwargs
                )
                record = {
                    **captured.transcript,
                    "request": request.model_dump(mode="json"),
                    "response": captured.response.model_dump(mode="json"),
                    "corpus_sha256": digest,
                    "capture_mode": report["capture_mode"],
                }
                write_new(path, record)
            for repetition in range(corpus["runs"]):
                provider = ReplayProvider(
                    record["model"],
                    [RecordedStep.model_validate(s) for s in record["steps"]],
                    expected_tools=record["tools"],
                )
                replay = run_turn(session, request, provider=provider, **kwargs)
                assert provider.exhausted
                score = score_answer(case, expected, replay.response, replay.transcript)
                records.append({**score, "run": repetition, "transcript": str(path)})
                assert score["exact_answer"], score
            print(
                f"{case['id']}: exact original-artifact/SQL match, replayed {corpus['runs']} times",
                flush=True,
            )
        if live:
            live_records: list[dict[str, Any]] = []
            result: dict[str, Any] = {
                "provider": settings.resolved_assistant_provider,
                "model": settings.resolved_assistant_model,
                "stopped": None,
                "records": live_records,
                "complete": False,
            }
            report["live"] = result
            case = next(c for c in cases if c["id"] == "ag06-web-01")
            expected = oracle_answer(session, context, case)
            provider = create_provider(settings)
            for repetition in range(corpus["runs"]):
                request = HybridTurnRequest(
                    request_id=UUID(int=7300 + repetition),
                    thread_id=UUID(int=7400 + repetition),
                    message=case["message"],
                    context=selections,
                )
                run = run_turn(
                    session, request, provider=provider, settings=settings, today=date(2026, 10, 7)
                )
                path = transcripts / f"live-{case['id']}-{repetition}.json.gz"
                write_new(
                    path,
                    {
                        **run.transcript,
                        "request": request.model_dump(mode="json"),
                        "response": run.response.model_dump(mode="json"),
                        "capture_mode": "live",
                        "corpus_sha256": digest,
                    },
                )
                live_records.append(
                    {
                        **score_answer(case, expected, run.response, run.transcript),
                        "run": repetition,
                        "transcript": str(path),
                    }
                )
                if run.response.failure:
                    result["stopped"] = {
                        "reason": run.response.failure,
                        "retry_after": run.response.retry_after,
                    }
                    break
            result["complete"] = len(live_records) == corpus["runs"] and result["stopped"] is None
            result["summary"] = summarize(live_records, 1, corpus["runs"])
        after = resolve_workbench_context(session, requested_season="2025-26")
        assert (
            after.release_id == context.release_id
            and after.semantic_signature == context.semantic_signature
        )
    engine.dispose()
    report["summary"] = summarize(records, len(cases), corpus["runs"])
    report["finished_at"] = datetime.now(UTC).isoformat()
    write_new(output, report)
    print(
        json.dumps(
            {
                "output": str(output),
                "replay": report["summary"]["coverage"],
                "override_missed": report["summary"]["warehouse_override_missed"],
                "live": report["live"]["stopped"] if report["live"] else None,
            }
        )
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--live", action="store_true")
    parser.add_argument(
        "--recordings", type=Path, help="Replay existing authored transcripts without recapture"
    )
    args = parser.parse_args()
    verify(args.output, live=args.live, recordings=args.recordings)
