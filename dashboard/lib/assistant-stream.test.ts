import { afterEach, describe, expect, it, vi } from "vitest";
import type { HybridTurnRequest, HybridTurnResponse } from "./assistant-v2.generated";
import type { AgentTurnResponse } from "./assistant-v3.generated";
import { parseSseFrames, streamAssistantTurn, streamProgress, type TurnStreamEvent } from "./assistant-stream";

const ids = { request_id: "11111111-1111-4111-8111-111111111111", thread_id: "22222222-2222-4222-8222-222222222222", turn_id: "33333333-3333-4333-8333-333333333333" };
const turn: HybridTurnRequest = { request_id: ids.request_id, thread_id: ids.thread_id, message: "Who led the league in assists?" };
const answer = { schema_version: "courtload-assistant-v2", ...ids, status: "answered", intent: "local_analysis", blocks: [] } as unknown as HybridTurnResponse;
const agentAnswer: AgentTurnResponse = { schema_version: "courtlens-assistant-v3", ...ids, status: "answered", answer: { text: "The retained answer.[^s1]" }, accounting: { provider: "replay", model: "synthetic", prompt_version: "fixture" } };
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

describe("AG04 live agent transport", () => {
  it("parses all v3 events at every possible chunk boundary, including CRLF and multiline data", () => {
    const wire = [frame({ event: "accepted", ...ids }), frame({ event: "step", kind: "thinking", label: "Considering sources" }), frame({ event: "delta", text: "Jokić 🏀\n" }), frame({ event: "reset" }), frame({ event: "step", kind: "search", label: "Web search completed" }), frame({ event: "final", response: agentAnswer })].join("").replaceAll("\n", "\r\n");
    const expected = parseSseFrames(wire).events;
    for (let index = 0; index <= wire.length; index++) {
      const first = parseSseFrames(wire.slice(0, index));
      const last = parseSseFrames(first.rest + wire.slice(index));
      expect([...first.events, ...last.events]).toEqual(expected);
      expect(last.rest).toBe("");
    }
    expect(parseSseFrames('event: delta\ndata: {"event":"delta",\ndata: "text":"Hi"}\n\n').events).toEqual([{ event: "delta", text: "Hi" }]);
  });
  it("ignores unknown events but rejects malformed known payloads and conflicting frame names", () => {
    expect(parseSseFrames('event: future\ndata: {"event":"future"}\n\n').events).toEqual([]);
    for (const event of [{ event: "delta", text: null }, { event: "step", kind: "unknown", label: "test" }, { event: "phase", phase: "toString" }, { event: "final", response: { schema_version: "courtlens-assistant-v3" } }]) {
      expect(parseSseFrames(`data: ${JSON.stringify(event)}\n\n`).error).toBeInstanceOf(Error);
    }
    expect(parseSseFrames('event: reset\ndata: {"event":"delta","text":"x"}\n\n').error).toBeInstanceOf(Error);
  });
  it("shows deltas before final, clears the draft on reset and replaces it with authoritative prose", async () => {
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let index = 0;
    const chunks = [frame({ event: "accepted", ...ids }), frame({ event: "step", kind: "tool", label: "Querying CourtLens" }), frame({ event: "delta", text: "Unsupported draft" }), frame({ event: "reset" }), frame({ event: "delta", text: "Repaired draft" }), frame({ event: "final", response: agentAnswer })];
    const body = new ReadableStream<Uint8Array>({ async pull(controller) { if (index === 5) await gate; if (index < chunks.length) controller.enqueue(new TextEncoder().encode(chunks[index++])); else controller.close(); } });
    const fetch = vi.fn().mockResolvedValue(new Response(body, { headers: { "Content-Type": "text/event-stream" } })); vi.stubGlobal("fetch", fetch);
    let progress = { text: "" }; const texts: string[] = [];
    const result = streamAssistantTurn(turn, event => { progress = streamProgress(progress, event); texts.push(progress.text); });
    await vi.waitFor(() => expect(progress.text).toBe("Repaired draft"));
    expect(texts).toContain("Unsupported draft"); expect(texts.filter(text => text === "").length).toBeGreaterThan(1);
    release(); expect(await result).toEqual(agentAnswer); expect(progress.text).toBe(agentAnswer.answer.text);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("replaces a partial v3 draft with the same-ID fallback final after a network break", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(sse([frame({ event: "accepted", ...ids }), frame({ event: "delta", text: "Partial" })], { close: false })).mockResolvedValueOnce(Response.json(agentAnswer)); vi.stubGlobal("fetch", fetch);
    let progress = { text: "" };
    expect(await streamAssistantTurn(turn, event => { progress = streamProgress(progress, event); })).toEqual(agentAnswer);
    expect(progress.text).toBe(agentAnswer.answer.text);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual(turn);
  });
  it("falls back after a malformed stream and never treats the partial draft as final", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(sse([frame({ event: "delta", text: "Partial" }), 'data: {"event":"final"}\n\n'])).mockResolvedValueOnce(Response.json(agentAnswer)); vi.stubGlobal("fetch", fetch);
    expect(await streamAssistantTurn(turn, () => undefined)).toEqual(agentAnswer); expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not replay an explicitly aborted stream", async () => {
    const controller = new AbortController(); controller.abort(new DOMException("Stopped", "AbortError"));
    const fetch = vi.fn().mockRejectedValue(controller.signal.reason); vi.stubGlobal("fetch", fetch);
    await expect(streamAssistantTurn(turn, () => undefined, controller.signal)).rejects.toThrow("Stopped"); expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("preserves acceptance when a malformed frame shares a chunk and waits for same-ID publication", async () => {
    vi.useFakeTimers();
    const fetch = vi.fn()
      .mockResolvedValueOnce(sse([frame({ event: "accepted", ...ids }) + 'data: {"event":"delta","text":null}\n\n']))
      .mockResolvedValueOnce(Response.json({ detail: "Still running" }, { status: 409 }))
      .mockResolvedValueOnce(Response.json(agentAnswer)); vi.stubGlobal("fetch", fetch);
    const seen: TurnStreamEvent[] = [];
    const result = streamAssistantTurn(turn, event => seen.push(event));
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toEqual(agentAnswer);
    expect(seen.map(event => event.event)).toEqual(["accepted", "final"]);
    expect(fetch.mock.calls.slice(1).every(call => JSON.parse(call[1].body).request_id === turn.request_id)).toBe(true);
  });
  it("decodes multibyte text when the network splits every UTF-8 byte", async () => {
    const bytes = new TextEncoder().encode(frame({ event: "delta", text: "Jokić 🏀" }) + frame({ event: "final", response: agentAnswer }));
    let index = 0;
    const body = new ReadableStream<Uint8Array>({ pull(controller) { if (index < bytes.length) controller.enqueue(bytes.slice(index, ++index)); else controller.close(); } });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { headers: { "Content-Type": "text/event-stream" } })));
    const seen: TurnStreamEvent[] = [];
    expect(await streamAssistantTurn(turn, event => seen.push(event))).toEqual(agentAnswer);
    expect(seen[0]).toEqual({ event: "delta", text: "Jokić 🏀" });
  });
});
