import { browserApi, WorkbenchApiError } from "./workbench-api";

export type Context = { release_id?: string | null; season?: string | null; phase?: string; before_date?: string | null; window?: string };
export type Step = { step_id: string; operation: string; arguments: Record<string, unknown>; depends_on?: string[] };
export type Plan = { plan_version?: "courtload-analysis-plan-v1"; status?: "execute" | "clarification_required" | "unsupported"; clarification?: string | null; context_changes?: Context | null; steps: Step[]; output_kind?: "table" | "definition" | "comparison" };
export type Evidence = { evidence_id: string; result_hash: string; operation_hash: string; operation_version: string; context_fingerprint: string; entity_id: string; row_identity: string; path: string; metric: string; metric_version: string; unit: string; value: unknown; sample: Record<string, unknown>; input_identity: Record<string, unknown>; null_reason: string | null };
export type Result = { step_id: string; operation: string; operation_version: string; arguments: Record<string, unknown>; operation_hash: string; result_hash: string; data: Record<string, unknown>; rows: Record<string, unknown>[]; evidence: Evidence[]; open_url: string | null; eligible_count: number | null; limitations: string[] };
export type Turn = { schema_version: "courtload-conversation-v1"; status: "answered" | "clarification_required" | "unsupported" | "no_data" | "insufficient_sample" | "disabled" | "quota_exceeded" | "timeout" | "provider_error" | "busy"; conversation_id: string; turn_id: string; context: Record<string, unknown>; context_fingerprint: string; interpretation: string; plan: Plan | null; results: Result[]; choices: Record<string, string>[]; limitations: string[]; manifest: Record<string, unknown> | null; accounting: Record<string, unknown> };
export type TurnRequest = { schema_version?: "courtload-conversation-v1"; request_id: string; message: string; conversation_id?: string; context_fingerprint?: string; context?: Context; clarification_choice?: string; plan?: Plan };
export const statusLabels: Record<Turn["status"], string> = { answered: "Answered", clarification_required: "Choose a meaning or identity", unsupported: "Capability unavailable", no_data: "No admitted observations", insufficient_sample: "Too few observations", disabled: "AI is disabled", quota_exceeded: "AI quota reached", timeout: "Investigation timed out", provider_error: "AI temporarily unavailable", busy: "Another investigation is running" };
export function pinnedContext(context: Record<string, unknown>): Context {
  return Object.fromEntries(["release_id", "season", "phase", "before_date", "window"].filter(k => context[k] != null).map(k => [k, context[k]]));
}
export async function conversationRequest<T>(path: string, options: RequestInit): Promise<T> {
  const response = await fetch(`${browserApi}/api/workbench/assistant/${path}`, { cache: "no-store", ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new WorkbenchApiError(response.status, body?.detail ?? "Investigation request failed");
  return body as T;
}
export const sendTurn = (request: TurnRequest, signal?: AbortSignal) => conversationRequest<Turn>("turn", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(50000)]) : AbortSignal.timeout(50000) });
export const clearConversation = (id: string) => conversationRequest<{cleared: boolean}>(`conversations/${encodeURIComponent(id)}`, { method: "DELETE" });

export function researchDestination(step: Step, context: Context): string {
  const params = new URLSearchParams({ operation: step.operation, arguments: JSON.stringify(step.arguments) });
  for (const [key, value] of Object.entries(context)) if (value != null) params.set(key, value);
  return `/research/operation?${params}`;
}
export function readResearchDestination(params: URLSearchParams): { step: Step; context: Context } {
  const operation = params.get("operation");
  const raw = params.get("arguments") ?? "{}";
  if (!operation || !["query", "profile", "compare", "team", "forecast", "finance", "definition", "compare_periods", "distribution", "splits", "similarity", "workload_shifts"].includes(operation) || raw.length > 32768) throw new Error("Invalid Research operation link.");
  const args: unknown = JSON.parse(raw);
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Operation arguments must be an object.");
  const context = Object.fromEntries(["release_id", "season", "phase", "before_date", "window"].filter(k => params.has(k)).map(k => [k, params.get(k)]));
  if (!context.release_id || !context.before_date || !context.season) throw new Error("A retained release, season and cutoff are required.");
  return { step: {step_id: "research", operation, arguments: args as Record<string, unknown>}, context };
}
export function displayValue(value: unknown): string {
  if (value == null) return "Unknown";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function tableRow(row: Record<string, unknown>, prefix = ""): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).flatMap(([key, value]) => {
    const name = prefix ? `${prefix} · ${key.replaceAll("_", " ")}` : key.replaceAll("_", " ");
    return value != null && typeof value === "object" && !Array.isArray(value)
      ? Object.entries(tableRow(value as Record<string, unknown>, name))
      : [[name, value]];
  }));
}
