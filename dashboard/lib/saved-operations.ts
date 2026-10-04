import { conversationRequest, type Plan, type Result, type Turn } from "./conversation";
import { browserApi } from "./workbench-api";

export type SavedSummary = { id: string; title: string; manifest_sha256: string; created_at: string; context: Record<string, unknown>; operations: string[]; question_saved: boolean };
export type SavedDetail = Omit<SavedSummary, "context" | "operations" | "question_saved"> & {
  metadata: { question_saved: boolean; question: string | null };
  manifest: { schema_version: "courtload-saved-operation-v1"; context: Record<string, unknown>; context_fingerprint: string; plan: Plan; origin_plan: Plan; origin_manifest_sha256: string; metric_version: string; result_scope: "complete_stats_cohort_and_declared_operation_bounds"; results: Result[]; limitations: string[] };
};
export type SaveRequest = { request_id: string; conversation_id: string; turn_id: string; context_fingerprint: string; title: string; include_question: boolean };
export type SavedReproduction = { id: string; manifest_sha256: string; match: boolean; reason: string | null; provider_calls: 0; operations: { step_id: string; operation: string; saved_result_sha256: string; recomputed_result_sha256: string; match: boolean }[] };
export function canSaveTurn(turn: Turn): boolean {
  return ["answered", "no_data", "insufficient_sample"].includes(turn.status) && !!turn.manifest && turn.results.length > 0;
}
export function makeSaveRequest(turn: Turn, title: string, includeQuestion: boolean, requestId: string): SaveRequest {
  return { request_id: requestId, conversation_id: turn.conversation_id, turn_id: turn.turn_id, context_fingerprint: turn.context_fingerprint, title, include_question: includeQuestion };
}
export const saveOperation = (request: SaveRequest) => conversationRequest<SavedDetail>("investigations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: AbortSignal.timeout(50000) });
export const listOperations = (offset = 0) => conversationRequest<SavedSummary[]>(`investigations?limit=50&offset=${offset}`, { signal: AbortSignal.timeout(10000) });
export const getSavedOperation = (id: string) => conversationRequest<SavedDetail>(`investigations/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(10000) });
export const reproduceOperation = (id: string) => conversationRequest<SavedReproduction>(`investigations/${encodeURIComponent(id)}/reproduce`, { signal: AbortSignal.timeout(50000) });
export const operationExportUrl = (id: string, format: "json" | "csv") => `${browserApi}/api/workbench/assistant/investigations/${encodeURIComponent(id)}/export?format=${format}`;
