"""Read-only reproduction of every retained conversation, without provider calls."""

import json
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from courtload.conversation_models import SavedConversationAnalysis
from courtload.database import engine
from courtload.services.assistant.saved import reproduce_saved


def main():
    output = Path(sys.argv[1])
    if output.exists():
        raise ValueError("Refusing to overwrite retained evidence")
    with Session(engine) as session:
        ids = list(
            session.scalars(
                select(SavedConversationAnalysis.id).order_by(SavedConversationAnalysis.id)
            )
        )
        results = [reproduce_saved(session, str(identity)) for identity in ids]
    report = {
        "records": len(results),
        "matched": sum(r["match"] for r in results),
        "provider_calls": 0,
        "results": results,
    }
    output.write_text(json.dumps(report, indent=2, default=str) + "\n")
    print(json.dumps({k: report[k] for k in ("records", "matched", "provider_calls")}))
    if not results or not all(r["match"] for r in results):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
