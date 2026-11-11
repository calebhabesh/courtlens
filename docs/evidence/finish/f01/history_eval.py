"""F01: v2 vs v3 prompt on history questions, demo configuration (no web search, flash-lite)."""

import json
import os
import sys
import time
import uuid
from datetime import date

QUESTIONS = [
    "Who won the 2016 NBA Finals, and what made it historic?",
    "Who won MVP in 1998?",
    "Which team won the 1986 NBA championship?",
    "What was the Malice at the Palace?",
    "When was the three-point line introduced in the NBA?",
    "Who holds the record for most points in a single NBA game?",
]


def main():
    os.environ["COURTLENS_ASSISTANT_MAX_WEB_SEARCHES"] = "0"
    os.environ["COURTLENS_GEMINI_MODEL"] = "gemini-3.5-flash-lite"
    os.environ["COURTLENS_ASSISTANT_TURN_TIMEOUT_SECONDS"] = "45"
    from sqlalchemy import create_engine
    from sqlalchemy.orm import Session

    from courtlens.config import get_settings

    get_settings.cache_clear()
    from courtlens.domain.hybrid_assistant import HybridTurnRequest
    from courtlens.services.assistant.agent import loop
    from courtlens.services.assistant.agent import prompt as P

    version = sys.argv[1]
    loop.PROMPT_VERSION = P.PROMPT_V2 if version == "v2" else P.PROMPT_VERSION
    engine = create_engine(get_settings().database_url)
    out = []
    for q in QUESTIONS:
        with Session(engine) as s:
            t = time.time()
            run = loop.run_turn(
                s, HybridTurnRequest(request_id=uuid.uuid4(), message=q), today=date(2026, 11, 11)
            )
            s.rollback()
        r = run.response if hasattr(run, "response") else run
        d = r.model_dump(mode="json")
        acc = d.get("accounting") or {}
        tools = [f"{x.get('tool')}:{x.get('status')}" for x in d.get("trace") or []]
        out.append(
            {
                "q": q,
                "secs": round(time.time() - t, 1),
                "calls": acc.get("provider_calls"),
                "prompt": acc.get("prompt_version"),
                "failure": d.get("failure"),
                "tools": tools,
                "answer": (d.get("answer") or {}).get("text", "")[:600],
            }
        )
        print(json.dumps(out[-1], ensure_ascii=False), flush=True)
    with open(os.path.expanduser(f"~/.cache/courtlens-tmp/f01-{version}.json"), "w") as handle:
        json.dump(out, handle, indent=1)


if __name__ == "__main__":
    main()
