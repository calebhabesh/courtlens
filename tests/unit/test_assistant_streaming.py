"""AR05 SSE framing, forward-only phases and retained-text narrative slices; no network."""

import asyncio
import json
import threading
from unittest.mock import patch
from uuid import uuid4

from test_narrative_turn import Narrator, leader_text
from test_narrative_turn import run as run_recorded

from courtload.domain.assistant_agent import AgentStreamEvent, AgentTurnResponse
from courtload.domain.hybrid_assistant import (
    HybridTurnRequest,
    HybridTurnResponse,
    InabilityBlock,
)
from courtload.services.assistant import streaming
from courtload.services.assistant.history import ClaimedTurn


def parse(chunks: list[bytes]) -> list[dict]:
    events = []
    for raw in b"".join(chunks).decode().split("\n\n"):
        lines = [line for line in raw.split("\n") if line and not line.startswith(":")]
        if not lines:
            continue
        name = lines[0].removeprefix("event: ")
        data = json.loads(lines[1].removeprefix("data: "))
        # Every frame satisfies the generated wire contract and names its own event.
        assert AgentStreamEvent.model_validate(data).root.event == name == data["event"]
        events.append(data)
    return events


def collect(*args, **kwargs) -> list[bytes]:
    async def drain() -> list[bytes]:
        return [chunk async for chunk in streaming.stream_turn(*args, **kwargs)]

    return asyncio.run(drain())


def narrated(session) -> HybridTurnResponse:
    answer, _ = run_recorded(session, Narrator({"status": "answered", "text": leader_text()}))
    return answer


def claim_for(answer: HybridTurnResponse) -> tuple[HybridTurnRequest, ClaimedTurn]:
    request = HybridTurnRequest(
        request_id=answer.request_id, thread_id=answer.thread_id, message="Who led in assists?"
    )
    interrupted = answer.model_copy(
        update={
            "status": "failed",
            "intent": "inability",
            "blocks": [
                InabilityBlock(reason="backend_failure", text="Interrupted.", next_action="Retry.")
            ],
        }
    )
    return request, ClaimedTurn(answer.turn_id, answer.thread_id, None, None, interrupted)


def test_real_turn_reports_phases_in_order_before_narrative(session):
    phases: list[str] = []
    answer, _ = run_recorded(
        session, Narrator({"status": "answered", "text": leader_text()}), phases.append
    )
    assert answer.blocks[0].kind == "narrative"
    assert phases == ["understanding", "querying", "writing"]


def test_guidance_turn_never_claims_to_query_or_write(session):
    from courtload.services.assistant.hybrid import run_hybrid_turn

    phases: list[str] = []
    answer = run_hybrid_turn(
        session,
        HybridTurnRequest(request_id=uuid4(), message="Explain spacing on offense."),
        on_phase=phases.append,
    )
    assert answer.blocks[0].kind == "text"
    assert phases == ["understanding"]


def test_stream_orders_accepted_forward_phases_checked_slices_then_final(session):
    answer = narrated(session)
    request, claimed = claim_for(answer)
    seen_threads: list[str] = []

    def complete(session, request, claimed, *, provider, on_phase, **kwargs):
        seen_threads.append(threading.current_thread().name)
        # Mixed clauses revisit phases; only forward movement is streamed.
        for phase in ("understanding", "querying", "understanding", "querying", "writing"):
            on_phase(phase)
        return answer

    with patch.object(streaming, "complete_turn", complete):
        events = parse(collect(session, request, claimed))
    assert seen_threads == ["assistant-turn-stream"]
    assert [e["event"] for e in events[:4]] == ["accepted", "phase", "phase", "phase"]
    assert events[0]["turn_id"] == str(answer.turn_id)
    assert [e["phase"] for e in events[1:4]] == ["understanding", "querying", "writing"]
    slices = [e["text"] for e in events if e["event"] == "narrative"]
    assert len(slices) > 1 and "".join(slices) == leader_text()
    assert events[-1]["event"] == "final"
    assert HybridTurnResponse.model_validate(events[-1]["response"]) == answer


def test_retained_turn_replays_without_executing(session):
    answer = narrated(session)
    with patch.object(streaming, "complete_turn", side_effect=AssertionError("executed")):
        events = parse(collect(session, HybridTurnRequest(request_id=uuid4(), message="x"), answer))
    assert events[0]["event"] == "accepted" and events[0]["request_id"] == str(answer.request_id)
    assert all(e["event"] != "phase" for e in events)
    assert events[-1]["response"] == answer.model_dump(mode="json")


def test_slow_turn_sends_heartbeats_and_failure_ends_without_final(session):
    answer = narrated(session)
    request, claimed = claim_for(answer)

    def complete(*_, on_phase, **__):
        on_phase("understanding")
        threading.Event().wait(0.05)
        raise RuntimeError("thread deleted")

    with patch.object(streaming, "complete_turn", complete):
        chunks = collect(session, request, claimed, heartbeat_seconds=0.01)
    assert b": keep-alive\n\n" in chunks
    events = parse(chunks)
    assert [e["event"] for e in events] == ["accepted", "phase"]


def test_disconnect_waits_for_the_worker_to_publish(session):
    answer = narrated(session)
    request, claimed = claim_for(answer)
    release = threading.Event()
    published: list[bool] = []

    def complete(*_, on_phase, **__):
        on_phase("understanding")
        release.wait(5)
        published.append(True)
        return answer

    async def disconnect_after_first_phase() -> None:
        stream = streaming.stream_turn(session, request, claimed)
        assert b"accepted" in await anext(stream)
        assert b"understanding" in await anext(stream)
        asyncio.get_running_loop().call_later(0.05, release.set)
        await stream.aclose()

    with patch.object(streaming, "complete_turn", complete):
        asyncio.run(disconnect_after_first_phase())
    # The request session is only released after publication finished.
    assert published == [True]


def agent_answer(answer):
    return AgentTurnResponse(
        request_id=answer.request_id,
        thread_id=answer.thread_id,
        turn_id=answer.turn_id,
        status="answered",
        answer={"text": "Retained answer."},
        accounting={"provider": "replay", "model": "synthetic", "prompt_version": "fixture"},
    )


def test_agent_events_arrive_before_publication_then_authoritative_final(session):
    old = narrated(session)
    request, claimed = claim_for(old)
    answer = agent_answer(old)
    release = threading.Event()
    published = threading.Event()

    def complete(*args, on_step, on_delta, on_reset, **kwargs):
        on_step("thinking", "Considering sources")
        on_step("tool", "Querying CourtLens")
        on_delta("Draft 🏀\n")
        on_reset()
        on_step("search", "Web search completed")
        on_step("writing", "Writing the answer")
        on_delta("Repaired draft")
        assert release.wait(5)
        published.set()
        return answer

    async def drain():
        stream = streaming.stream_turn(session, request, claimed)
        chunks = [await anext(stream) for _ in range(8)]
        try:
            assert not published.is_set()
            events = parse(chunks)
            assert [e["event"] for e in events] == [
                "accepted",
                "step",
                "step",
                "delta",
                "reset",
                "step",
                "step",
                "delta",
            ]
            assert events[3]["text"] == "Draft 🏀\n"
        finally:
            release.set()
        chunks.extend([chunk async for chunk in stream])
        return chunks

    with patch.object(streaming, "complete_turn", complete):
        events = parse(asyncio.run(drain()))
    assert published.is_set()
    assert events[-1]["response"] == answer.model_dump(mode="json")
    assert not any(e["event"] in {"phase", "narrative"} for e in events)


def test_retained_agent_only_replays_accepted_and_final(session):
    answer = agent_answer(narrated(session))
    with patch.object(streaming, "complete_turn", side_effect=AssertionError("executed")):
        events = parse(collect(session, HybridTurnRequest(request_id=uuid4(), message="x"), answer))
    assert [e["event"] for e in events] == ["accepted", "final"]
    assert events[-1]["response"] == answer.model_dump(mode="json")


def test_agent_disconnect_waits_for_publication_after_live_delta(session):
    old = narrated(session)
    request, claimed = claim_for(old)
    release = threading.Event()
    published = threading.Event()

    def complete(*args, on_delta, **kwargs):
        on_delta("Live draft")
        assert release.wait(5)
        published.set()
        return agent_answer(old)

    async def disconnect():
        stream = streaming.stream_turn(session, request, claimed)
        assert b"accepted" in await anext(stream)
        assert b"Live draft" in await anext(stream)
        asyncio.get_running_loop().call_later(0.01, release.set)
        await stream.aclose()

    with patch.object(streaming, "complete_turn", complete):
        asyncio.run(disconnect())
    assert published.is_set()
