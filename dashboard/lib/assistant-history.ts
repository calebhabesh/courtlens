import type { DurableThreadHeader, DurableTurnRecord, HybridTurnRequest, HybridTurnResponse, ThreadHistoryPage, TurnHistoryPage } from "./assistant-v2.generated";
import { WorkbenchApiError } from "./workbench-api";

// PF08 uses this same-origin client. Transport retries retain request_id; intentional
// retries supply a new request_id and retry_of (the unsuccessful turn_id).
export const assistantPrivacyNotice = "History stays in this local installation until you delete it. Questions and context may be sent to the configured provider. Saved analytical findings are retained separately.";

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/assistant-v2/${path}`, { cache: "no-store", ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new WorkbenchApiError(response.status, body?.detail ?? "History request failed");
  return body as T;
}
export const newAssistantThread = () => request<DurableThreadHeader>("threads", { method: "POST" });
export const assistantThreads = (cursor?: string, limit = 20) => request<ThreadHistoryPage>(`threads?${new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) })}`);
export const assistantTurns = (threadId: string, cursor?: string, limit = 20) => request<TurnHistoryPage>(`threads/${encodeURIComponent(threadId)}/turns?${new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) })}`);
export const sendAssistantTurn = (turn: HybridTurnRequest, signal?: AbortSignal) => request<HybridTurnResponse>("turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(turn), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
export const stopAssistantTurn = (threadId: string, turnId: string) => request<DurableTurnRecord>(`threads/${encodeURIComponent(threadId)}/turns/${encodeURIComponent(turnId)}/cancel`, { method: "POST" });
export const deleteAssistantThread = (threadId: string) => request<{ cleared: boolean }>(`threads/${encodeURIComponent(threadId)}`, { method: "DELETE" });
export const clearAssistantHistory = () => request<{ cleared: boolean }>("threads", { method: "DELETE" });
