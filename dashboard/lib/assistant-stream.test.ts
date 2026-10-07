import { afterEach, describe, expect, it, vi } from "vitest";
import type { HybridTurnRequest, HybridTurnResponse, TurnStreamEvent } from "./assistant-v2.generated";
import { parseSseFrames, streamAssistantTurn } from "./assistant-stream";

const ids = { request_id: "11111111-1111-4111-8111-111111111111", thread_id: "22222222-2222-4222-8222-222222222222", turn_id: "33333333-3333-4333-8333-333333333333" };
const turn: HybridTurnRequest = { request_id: ids.request_id, thread_id: ids.thread_id, message: "Who led the league in assists?" };
const answer = { schema_version: "courtload-assistant-v2", ...ids, status: "answered", intent: "local_analysis", blocks: [] } as unknown as HybridTurnResponse;
const frame = (event: TurnStreamEvent) => `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`;
function sse(chunks: string[], { close = true } = {}) {
  // Pull-based so queued chunks are read before a simulated network break.
  let index = 0;
  const body = new ReadableStream<Uint8Array>({ pull(controller) { if (index < chunks.length) controller.enqueue(new TextEncoder().encode(chunks[index++])); else if (close) controller.close(); else controller.error(new TypeError("network")); } });
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("AR05 event-stream parsing", () => {
  it("splits complete frames, keeps partial input and skips keep-alives", () => {
    const text = frame({ event: "phase", phase: "querying" }) + ": keep-alive\n\n" + 'event: narrative\ndata: {"event":"narr';
    const { events, rest } = parseSseFrames(text);
    expect(events).toEqual([{ event: "phase", phase: "querying" }]);
    expect(rest).toBe('event: narrative\ndata: {"event":"narr');
    expect(parseSseFrames(rest + 'ative","text":"Jokić "}\n\n').events).toEqual([{ event: "narrative", text: "Jokić " }]);
  });
});

describe("AR05 streamed turn with request/response fallback", () => {
  it("reports phases and narrative slices split across chunks, then returns the final response", async () => {
    const all = [frame({ event: "accepted", ...ids }), frame({ event: "phase", phase: "understanding" }), frame({ event: "phase", phase: "querying" }), frame({ event: "phase", phase: "writing" }), frame({ event: "narrative", text: "Jokić " }), frame({ event: "narrative", text: "led." }), frame({ event: "final", response: answer })].join("");
    const fetch = vi.fn().mockResolvedValue(sse([all.slice(0, 50), all.slice(50, 333), all.slice(333)])); vi.stubGlobal("fetch", fetch);
    const seen: TurnStreamEvent[] = [];
    expect(await streamAssistantTurn(turn, event => seen.push(event))).toEqual(answer);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/assistant-v2/turn/stream");
    expect(seen.map(event => event.event === "phase" ? event.phase : event.event)).toEqual(["accepted", "understanding", "querying", "writing", "narrative", "narrative", "final"]);
  });
  it("falls back to the same request_id when the stream route is unavailable", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ detail: "Unknown assistant route" }, { status: 404 })).mockResolvedValueOnce(Response.json(answer)); vi.stubGlobal("fetch", fetch);
    expect(await streamAssistantTurn(turn, () => undefined)).toEqual(answer);
    expect(fetch.mock.calls[1][0]).toBe("/api/assistant-v2/turn");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(turn);
  });
  it("falls back when the response is not an event stream or the network fails", async () => {
    for (const first of [() => Promise.resolve(Response.json(answer)), () => Promise.reject(new TypeError("offline"))]) {
      const fetch = vi.fn().mockImplementationOnce(first).mockResolvedValueOnce(Response.json(answer)); vi.stubGlobal("fetch", fetch);
      expect(await streamAssistantTurn(turn, () => undefined)).toEqual(answer);
      expect(fetch).toHaveBeenCalledTimes(2);
    }
  });
  it("replays after an accepted stream breaks, waiting while the turn still runs", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn()
      .mockResolvedValueOnce(sse([frame({ event: "accepted", ...ids }), frame({ event: "phase", phase: "understanding" })], { close: false }))
      .mockResolvedValueOnce(Response.json({ detail: "Request is running; poll its retained turn." }, { status: 409 }))
      .mockResolvedValueOnce(Response.json(answer));
    vi.stubGlobal("fetch", fetch);
    const result = streamAssistantTurn(turn, () => undefined);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toEqual(answer);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls.slice(1).every(call => JSON.parse(call[1].body).request_id === ids.request_id)).toBe(true);
  });
  it("surfaces acceptance decisions instead of retrying them", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ detail: "A turn is already running in this thread." }, { status: 409 })); vi.stubGlobal("fetch", fetch);
    await expect(streamAssistantTurn(turn, () => undefined)).rejects.toMatchObject({ status: 409 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
