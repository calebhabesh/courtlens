"""AR05 server-sent events over the durable turn.

The stream is a view of the same accept/claim/publish lifecycle as the request/response
endpoint. Phase events report progress; narrative slices are cut from the checked and already
retained narrative, so streamed prose never outruns what history replays. The final event carries
the retained typed response. A client that loses the stream replays the same request_id over
`POST /v2/turn` or polls history.
"""

import asyncio
import logging
import re
import threading
from collections.abc import AsyncIterator, Iterator
from typing import Literal

import anyio
from sqlalchemy.orm import Session

from courtload.domain.assistant_agent import AgentTurnResponse, TurnResponse
from courtload.domain.conversation import StrictModel
from courtload.domain.hybrid_assistant import (
    HybridTurnRequest,
    HybridTurnResponse,
    NarrativeBlock,
    StreamAcceptedEvent,
    StreamNarrativeEvent,
    StreamPhaseEvent,
    TurnPhase,
)
from courtload.services.assistant.history import ClaimedTurn, complete_turn
from courtload.services.assistant.planner import PlanProvider

logger = logging.getLogger(__name__)


class StreamFinalEvent(StrictModel):
    event: Literal["final"] = "final"
    response: TurnResponse


PHASES: tuple[TurnPhase, ...] = ("understanding", "querying", "writing")
HEARTBEAT_SECONDS = 10.0
StreamEvent = StreamAcceptedEvent | StreamPhaseEvent | StreamNarrativeEvent | StreamFinalEvent


def frame(event: StreamEvent) -> bytes:
    # Pydantic JSON never contains a raw newline, so one data line per event is safe.
    return f"event: {event.event}\ndata: {event.model_dump_json()}\n\n".encode()


def retained_events(answer: TurnResponse) -> Iterator[StreamEvent]:
    for block in answer.blocks if isinstance(answer, HybridTurnResponse) else []:
        if isinstance(block, NarrativeBlock):
            for piece in re.findall(r"\S+\s*", block.text):
                yield StreamNarrativeEvent(text=piece)
    yield StreamFinalEvent(response=answer)


async def stream_turn(
    session: Session,
    request: HybridTurnRequest,
    claimed: TurnResponse | ClaimedTurn,
    *,
    provider: PlanProvider | None = None,
    heartbeat_seconds: float = HEARTBEAT_SECONDS,
) -> AsyncIterator[bytes]:
    if isinstance(claimed, (HybridTurnResponse, AgentTurnResponse)):
        # Transport retry of a retained turn: replay without executing again.
        yield frame(
            StreamAcceptedEvent(
                request_id=claimed.request_id, thread_id=claimed.thread_id, turn_id=claimed.turn_id
            )
        )
        for event in retained_events(claimed):
            yield frame(event)
        return
    loop = asyncio.get_running_loop()
    queue: asyncio.Queue[StreamPhaseEvent | TurnResponse | BaseException] = asyncio.Queue()
    reached = -1

    def on_phase(phase: TurnPhase) -> None:
        # Mixed turns revisit phases per clause; the stream only moves forward.
        nonlocal reached
        index = PHASES.index(phase)
        if index > reached:
            reached = index
            loop.call_soon_threadsafe(queue.put_nowait, StreamPhaseEvent(phase=phase))

    def work() -> None:
        result: TurnResponse | BaseException
        try:
            result = complete_turn(session, request, claimed, provider=provider, on_phase=on_phase)
        except BaseException as exc:
            result = exc
        loop.call_soon_threadsafe(queue.put_nowait, result)

    worker = threading.Thread(target=work, name="assistant-turn-stream", daemon=True)
    worker.start()
    try:
        yield frame(
            StreamAcceptedEvent(
                request_id=request.request_id, thread_id=claimed.thread_id, turn_id=claimed.turn_id
            )
        )
        while True:
            try:
                item = await asyncio.wait_for(queue.get(), heartbeat_seconds)
            except TimeoutError:
                yield b": keep-alive\n\n"
                continue
            if isinstance(item, StreamPhaseEvent):
                yield frame(item)
            elif isinstance(item, (HybridTurnResponse, AgentTurnResponse)):
                for event in retained_events(item):
                    yield frame(event)
                return
            else:
                # No final event: the client falls back to replaying the request_id.
                logger.warning("streamed turn ended without a retained response: %r", item)
                return
    finally:
        # A disconnected client must not orphan the request session mid-publication.
        with anyio.CancelScope(shield=True):
            await anyio.to_thread.run_sync(worker.join)
