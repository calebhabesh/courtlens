import type { AgentResultBlock, AgentSource, OperationResult } from "./assistant-v3.generated";
import { compactResult } from "./assistant-chat";
import { pinnedContext, researchDestination, tableRow } from "./conversation";

export function safeAgentUrl(value?: string | null): string | null {
  if (!value || /[\\\u0000- ]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password ? value : null; } catch { return null; }
}

export function sourceLabel(source: AgentSource): string {
  if (source.origin === "warehouse") return "CourtLens";
  if (source.origin === "databallr") return `databallr · as of ${source.as_of ?? "date unavailable"}`;
  const href = safeAgentUrl(source.url);
  return href?.startsWith("https:") ? new URL(href).hostname.replace(/^www\./, "") : source.publisher;
}

export const sourceDetails = (source: AgentSource) => `${source.title} · ${source.publisher} · retrieved ${source.retrieved_at ?? "date unavailable"}${source.as_of ? ` · as of ${source.as_of}` : ""}`;
export const resultAnchor = (turn: string, hash: string) => `answer-${turn}-result-${hash}`;

export function sourceDestination(source: AgentSource, results: AgentResultBlock[], turn: string): string | null {
  if (source.origin !== "warehouse") return safeAgentUrl(source.url);
  const result = results.find(block => block.result.operation_hash === source.operation_hash);
  return result ? `#${resultAnchor(turn, result.result.operation_hash)}` : null;
}

/** Save from this result's retained scope, never from a later answer or the composer. */
export function reviewDestination(block: AgentResultBlock): string | null {
  const context = pinnedContext(block.context ?? {});
  if (!context.release_id || !context.season || !context.before_date) return null;
  return researchDestination(block.result, context);
}

export function agentCellText(value: unknown): string {
  if (Array.isArray(value)) return value.length ? value.map(agentCellText).join(", ") : "Unknown";
  if (value == null) return "Unknown";
  if (typeof value === "number") return value.toLocaleString("en-US", { maximumFractionDigits: 4 });
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function agentResultView(result: OperationResult) {
  const view = compactResult(result.operation, result.rows);
  if (view?.kind !== "table") return view;
  const rows = (result.operation === "distribution" || result.operation === "similarity" ? result.rows.slice(1) : result.rows).map(row => tableRow(row));
  return { ...view, columns: view.columns.includes("rank") ? ["rank", ...view.columns.filter(key => key !== "rank")] : view.columns, rows };
}

/** Prefer recorded units; explicitly disclose missing units rather than guess them. */
export function resultColumnLabel(key: string, result: OperationResult): string {
  const pathKey = (path: string) => path.replace(/^\/?(?:(?:rows|items)[/.])?\d+[/.]/, "").replace(/^\//, "").replaceAll("/", " · ").replaceAll(".", " · ").replaceAll("_", " ");
  const cell = result.evidence.find(cell => pathKey(cell.path) === key) ?? result.evidence.find(cell => cell.metric.replaceAll("_", " ") === key);
  const units = cell?.unit ?? (key === "rank" ? "ordinal" : result.rows.some(row => typeof tableRow(row)[key] === "number") ? "unit not supplied" : "label");
  const labels: Record<string, string> = { rank: "Rank", "player name": "Player", "team tricode": "Team", "team tricodes": "Team", "blk per game": "Blocks" };
  const label = labels[key] ?? key.replace(/^./, char => char.toUpperCase());
  return `${label} (${units})`;
}
