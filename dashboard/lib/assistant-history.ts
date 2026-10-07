import { storageKeys } from "./storage-keys";
import type { DurableThreadHeader, HybridTurnRequest, ThreadHistoryPage } from "./assistant-v2.generated";
import type { AgentHistoryPage, StoredTurnRecord } from "./assistant-v3.generated";
export type AssistantTurnResponse = NonNullable<StoredTurnRecord["response"]>;
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
export const assistantTurns = (threadId: string, cursor?: string, limit = 20) => request<AgentHistoryPage>(`threads/${encodeURIComponent(threadId)}/turns?${new URLSearchParams({ limit: String(limit), ...(cursor ? { cursor } : {}) })}`);
export const sendAssistantTurn = (turn: HybridTurnRequest, signal?: AbortSignal) => request<AssistantTurnResponse>("turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(turn), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
export const stopAssistantTurn = (threadId: string, turnId: string) => request<StoredTurnRecord>(`threads/${encodeURIComponent(threadId)}/turns/${encodeURIComponent(turnId)}/cancel`, { method: "POST" });
export const deleteAssistantThread = (threadId: string) => request<{ cleared: boolean }>(`threads/${encodeURIComponent(threadId)}`, { method: "DELETE" });
export const clearAssistantHistory = () => request<{ cleared: boolean }>("threads", { method: "DELETE" });

// Open chats (page, drawer, other tabs) re-read history when any of them announces a change.
export const historyChangeKey = storageKeys.historyChange;
export const historyChangeEvent = "courtlens-assistant-history-change";
export const activeThreadKey = storageKeys.activeThread;
export function announceHistoryChange(source: string, thread: string | null) {
  const change = { source, thread, nonce: crypto.randomUUID() };
  window.dispatchEvent(new CustomEvent(historyChangeEvent, { detail: change }));
  try { localStorage.setItem(historyChangeKey, JSON.stringify(change)); } catch { /* Same-page synchronization still works. */ }
}
