"""Bounded provider memory from retained server turns, including sealed v2 history."""

import json
from collections.abc import Sequence

from courtload.domain.assistant_agent import AgentTurnResponse, StoredTurnRecord
from courtload.services.assistant.agent.providers.base import AgentMessage

MAX_TURNS = 8
MAX_HISTORY_CHARS = 24000


def compact_history(turns: Sequence[StoredTurnRecord]) -> list[AgentMessage]:
    pairs: list[list[AgentMessage]] = []
    size = 0
    for turn in reversed(turns[-MAX_TURNS:]):
        answer = turn.response
        if answer is None:
            continue
        if isinstance(answer, AgentTurnResponse):
            prose = answer.answer.text
            if answer.assumption:
                prose += "\nAssumption: " + answer.assumption
            results = [b.result for b in answer.results]
        else:
            prose = "\n".join(b.text for b in answer.blocks if hasattr(b, "text"))
            results = [b.result for b in answer.blocks if b.kind == "result"]
        summary = [
            {
                "operation": r.operation,
                "arguments": r.arguments,
                "scope": r.data.get("context", {}),
                "top_rows": r.rows[:3],
                "operation_hash": r.operation_hash,
            }
            for r in results
        ]
        # These are memories, not current-turn evidence or tool messages.
        text = (
            prose[:4000]
            + "\nPrior tool summary (not current evidence): "
            + json.dumps(summary, default=str)[:6000]
        )
        pair = [
            AgentMessage(role="user", text=turn.request.message),
            AgentMessage(role="assistant", text=text),
        ]
        pair_size = sum(len(m.text) for m in pair)
        if size + pair_size > MAX_HISTORY_CHARS:
            break
        pairs.append(pair)
        size += pair_size
    return [m for pair in reversed(pairs) for m in pair]
