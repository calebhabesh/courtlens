import type { HybridTurnRequest, StreamPhaseEvent } from "./assistant-v2.generated";
import type { AgentStreamEvent, StreamStepEvent } from "./assistant-v3.generated";
import { sendAssistantTurn, type AssistantTurnResponse } from "./assistant-history";
import { WorkbenchApiError } from "./workbench-api";

// V3 streams provisional text live; v2 narrative slices remain checked server-side.
// The final response replaces the draft. Whenever the stream is
// unavailable or ends early, the request/response endpoint replays the same request_id.
export type TurnPhase = StreamPhaseEvent["phase"];
export type TurnStreamEvent = AgentStreamEvent;
export const phaseLabels: Record<TurnPhase, string> = { understanding: "Understanding the question…", querying: "Querying CourtLens data…", writing: "Writing the answer…" };

export type StreamProgress = { text: string; phase?: TurnPhase; step?: StreamStepEvent };
export function streamProgress(current: StreamProgress, event: TurnStreamEvent): StreamProgress {
  switch (event.event) {
    case "phase": return { ...current, phase: event.phase, step: undefined };
    case "step": return { ...current, step: event };
    case "delta": case "narrative": return { ...current, text: current.text + event.text };
    case "reset": return { ...current, text: "" };
    case "final": return { ...current, text: "answer" in event.response ? event.response.answer.text : event.response.blocks.flatMap(block => block.kind === "narrative" && "text" in block ? [block.text] : []).join("\n\n") };
    default: return current;
  }
}

export function parseSseFrames(buffer: string): { events: TurnStreamEvent[]; rest: string; error?: Error } {
  const frames = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = frames.pop() ?? "";
  const events: TurnStreamEvent[] = [];
  for (const frame of frames) {
    const data = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    // Comment-only frames are keep-alives.
    if (!data) continue;
    try {
      const event = JSON.parse(data);
      const name = frame.split("\n").find(line => line.startsWith("event:"))?.slice(6).trim();
      if (!event || typeof event !== "object" || (name && name !== event.event)) throw new Error("Invalid assistant stream event");
      // Ignore additive future events. Reject malformed known payloads so the caller replays.
      switch (event.event) {
        case "accepted":
          if (![event.request_id, event.thread_id, event.turn_id].every(id => typeof id === "string")) throw new Error("Invalid acceptance event");
          break;
        case "phase":
          if (!Object.hasOwn(phaseLabels, event.phase)) throw new Error("Invalid phase event");
          break;
        case "step":
          if (!["thinking", "tool", "search", "writing"].includes(event.kind) || typeof event.label !== "string") throw new Error("Invalid step event");
          break;
        case "delta": case "narrative":
          if (typeof event.text !== "string") throw new Error("Invalid text event");
          break;
        case "reset": break;
        case "final":
          if (!["courtload-assistant-v2", "courtlens-assistant-v3"].includes(event.response?.schema_version)) throw new Error("Invalid final event");
          if (event.response.schema_version === "courtlens-assistant-v3" && typeof event.response.answer?.text !== "string") throw new Error("Invalid final answer");
          break;
        default: continue;
      }
      events.push(event as TurnStreamEvent);
    } catch (cause) {
      // Deliver earlier valid frames (especially accepted) before falling back on corruption.
      return { events, rest, error: cause instanceof Error ? cause : new Error("Invalid stream") };
    }
  }
  return { events, rest };
}

const replayInterval = 1500;
async function replay(turn: HybridTurnRequest, accepted: boolean, signal: AbortSignal): Promise<AssistantTurnResponse> {
  while (true) {
    try { return await sendAssistantTurn(turn, signal); }
    catch (cause) {
      // After acceptance the only 409 for this request_id is "still running"; wait for publication.
      if (!accepted || !(cause instanceof WorkbenchApiError) || cause.status !== 409) throw cause;
      await new Promise<void>((resolve, reject) => {
        signal.throwIfAborted();
        const abort = () => { clearTimeout(timer); reject(signal.reason); };
        const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, replayInterval);
        signal.addEventListener("abort", abort, { once: true });
      });
    }
  }
}

export async function streamAssistantTurn(turn: HybridTurnRequest, onEvent: (event: TurnStreamEvent) => void, signal?: AbortSignal): Promise<AssistantTurnResponse> {
  const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
  let accepted = false;
  const fallback = async () => {
    const answer = await replay(turn, accepted, bounded);
    onEvent({ event: "final", response: answer });
    return answer;
  };
  let response: Response;
  try {
    response = await fetch("/api/assistant-v2/turn/stream", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(turn), signal: bounded });
  } catch (cause) {
    if (bounded.aborted) throw cause;
    return fallback();
  }
  if (!response.ok) {
    // A missing route or an unavailable stream falls back; acceptance decisions do not.
    if (response.status === 404 || response.status >= 500) return fallback();
    const body = await response.json().catch(() => null);
    throw new WorkbenchApiError(response.status, body?.detail ?? "Assistant request failed");
  }
  if (!response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) return fallback();
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const parsed = parseSseFrames(buffer + value);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if ((event.event === "accepted" && event.request_id !== turn.request_id) || (event.event === "final" && event.response.request_id !== turn.request_id)) throw new Error("Stream request identity mismatch");
        if (event.event === "accepted") accepted = true;
        onEvent(event);
        // The server closes right after final; cancelling would abort a completed request.
        if (event.event === "final") return event.response;
      }
      if (parsed.error) throw parsed.error;
    }
  } catch (cause) {
    if (bounded.aborted) throw cause;
  } finally {
    reader.releaseLock();
  }
  return fallback();
}
