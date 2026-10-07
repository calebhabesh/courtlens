import type { HybridTurnRequest, HybridTurnResponse, StreamPhaseEvent, TurnStreamEvent } from "./assistant-v2.generated";
import { sendAssistantTurn } from "./assistant-history";
import { WorkbenchApiError } from "./workbench-api";

// AR05 streaming over the same durable turn. Narrative slices are checked server-side before
// they are sent; the final event's typed response is authoritative. Whenever the stream is
// unavailable or ends early, the request/response endpoint replays the same request_id.
export type TurnPhase = StreamPhaseEvent["phase"];
export const phaseLabels: Record<TurnPhase, string> = { understanding: "Understanding the question…", querying: "Querying CourtLens data…", writing: "Writing the answer…" };

export function parseSseFrames(buffer: string): { events: TurnStreamEvent[]; rest: string } {
  const frames = buffer.replace(/\r\n/g, "\n").split("\n\n");
  const rest = frames.pop() ?? "";
  const events: TurnStreamEvent[] = [];
  for (const frame of frames) {
    const data = frame.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    // Comment-only frames are keep-alives.
    if (data) events.push(JSON.parse(data) as TurnStreamEvent);
  }
  return { events, rest };
}

const replayInterval = 1500;
async function replay(turn: HybridTurnRequest, accepted: boolean, signal: AbortSignal): Promise<HybridTurnResponse> {
  while (true) {
    try { return await sendAssistantTurn(turn, signal); }
    catch (cause) {
      // After acceptance the only 409 for this request_id is "still running"; wait for publication.
      if (!accepted || !(cause instanceof WorkbenchApiError) || cause.status !== 409) throw cause;
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, replayInterval);
        signal.addEventListener("abort", () => { clearTimeout(timer); reject(signal.reason); }, { once: true });
      });
    }
  }
}

export async function streamAssistantTurn(turn: HybridTurnRequest, onEvent: (event: TurnStreamEvent) => void, signal?: AbortSignal): Promise<HybridTurnResponse> {
  const bounded = signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000);
  let accepted = false;
  let response: Response;
  try {
    response = await fetch("/api/assistant-v2/turn/stream", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", Accept: "text/event-stream" }, body: JSON.stringify(turn), signal: bounded });
  } catch (cause) {
    if (bounded.aborted) throw cause;
    return replay(turn, accepted, bounded);
  }
  if (!response.ok) {
    // A missing route or an unavailable stream falls back; acceptance decisions do not.
    if (response.status === 404 || response.status >= 500) return replay(turn, accepted, bounded);
    const body = await response.json().catch(() => null);
    throw new WorkbenchApiError(response.status, body?.detail ?? "Assistant request failed");
  }
  if (!response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) return replay(turn, accepted, bounded);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const parsed = parseSseFrames(buffer + value);
      buffer = parsed.rest;
      for (const event of parsed.events) {
        if (event.event === "accepted") accepted = true;
        onEvent(event);
        // The server closes right after final; cancelling would abort a completed request.
        if (event.event === "final") return event.response;
      }
    }
  } catch (cause) {
    if (bounded.aborted) throw cause;
  }
  return replay(turn, accepted, bounded);
}
