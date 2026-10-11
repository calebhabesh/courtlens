import type { DurableThreadHeader } from "./assistant-v2.generated";
import { tableRow, type Context } from "./conversation";
import { humanLabel } from "./route-availability";
import { throughLabel } from "./format-date";

// AR06 presentation helpers for the /ask chat layout. Values are never altered here: compact
// views only choose which returned cells to show first; the full result stays in "How I got this".

export const examplePrompts = [
  { label: "Impact", prompt: "What was Victor Wembanyama's RAPM last season?" },
  { label: "Defense", prompt: "Who is the best defender in the NBA?" },
  { label: "Awards", prompt: "Who won MVP last season?" },
  { label: "League leaders", prompt: "Who led the league in assists per game last season?" },
  { label: "Forecast", prompt: "Show the registered points forecast for Nikola Jokić." },
  { label: "Compare", prompt: "Compare Nikola Jokić and Victor Wembanyama last season." },
  { label: "Concepts", prompt: "Explain pick and roll" },
  { label: "Using CourtLens", prompt: "How do I compare two players here?" },
] as const;

/** Enter sends; Shift+Enter and IME composition keep editing. */
export function composerKeyAction(event: { key: string; shiftKey: boolean; isComposing?: boolean }): "send" | null {
  return event.key === "Enter" && !event.shiftKey && !event.isComposing ? "send" : null;
}

const windowLabels: Record<string, string> = { season: "Season to date", last_10: "Last 10", last_5: "Last 5" };
export function scopeChipLabel(context: Context): string {
  const parts = [
    context.season,
    context.phase ? humanLabel(context.phase) : null,
    context.window ? windowLabels[context.window] ?? humanLabel(context.window) : null,
    context.before_date ? throughLabel(context.before_date) || "Through date unavailable" : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Default scope";
}

export type ThreadGroup = { label: string; threads: DurableThreadHeader[] };
/** Newest first, grouped by local calendar day of the last update. */
export function groupThreads(threads: DurableThreadHeader[], now = new Date()): ThreadGroup[] {
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const today = day(now);
  const groups: ThreadGroup[] = [{ label: "Today", threads: [] }, { label: "Previous 7 days", threads: [] }, { label: "Older", threads: [] }];
  for (const thread of [...threads].sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
    const age = (today - day(new Date(thread.updated_at))) / 86_400_000;
    groups[age < 1 ? 0 : age <= 7 ? 1 : 2].threads.push(thread);
  }
  return groups.filter(group => group.threads.length > 0);
}

/** Splits the server-required general-knowledge label from its prose without changing the text. */
export function generalKnowledgeParts(text: string): { label: string; body: string } | null {
  const label = "General knowledge, not from CourtLens data";
  return text.startsWith(`${label}\n`) ? { label, body: text.slice(label.length + 1) } : null;
}

export type CompactView =
  | { kind: "facts"; entries: [string, unknown][]; hidden: number }
  | { kind: "table"; columns: string[]; rows: Record<string, unknown>[]; total: number };

const hiddenKey = /(^| )id$|hash|sha256|json|dataset|evidence|disclosures|url|^context ·/;
const leadKeys = ["player name", "team name", "team tricode", "split", "metric", "game date", "value"];
const factPriorities: Record<string, string[]> = {
  profile: ["player · name", "summaries · season · gp", "summaries · season · pts per game", "summaries · season · reb total per game", "summaries · season · ast per game", "summaries · season · min per game"],
  team: ["team · name", "record · games played", "record · wins", "record · losses", "record · win pct", "production · pts per game", "production · reb per game", "production · ast per game"],
  forecast: ["player name", "point estimate", "interval lower", "interval upper", "target game date", "target opponent tricode", "issued at utc", "policy id", "issuance status"],
};
const tableRows = 10;
const tableColumns = 6;
const factLimit = 8;

export function compactResult(operation: string, rows: Record<string, unknown>[]): CompactView | null {
  // Distribution and similarity lead with a summary/target row that the full result renders separately.
  const body = (operation === "distribution" || operation === "similarity" ? rows.slice(1) : rows).map(row => tableRow(row));
  if (body.length === 0) return null;
  const keys = [...new Set(body.flatMap(row => Object.keys(row)))];
  if (body.length === 1) {
    const priority = factPriorities[operation] ?? leadKeys;
    const ordered = [...priority.filter(key => keys.includes(key)), ...keys.filter(key => !priority.includes(key) && !hiddenKey.test(key))];
    return { kind: "facts", entries: ordered.slice(0, factLimit).map(key => [key, body[0][key]]), hidden: keys.length - Math.min(ordered.length, factLimit) };
  }
  const visible = keys.filter(key => !hiddenKey.test(key));
  const columns = [...leadKeys.filter(key => visible.includes(key)), ...visible.filter(key => !leadKeys.includes(key))].slice(0, tableColumns);
  return { kind: "table", columns, rows: body.slice(0, tableRows), total: body.length };
}

export const cellText = (value: unknown) => value == null ? "Unknown" : typeof value === "number" ? value.toLocaleString("en-US", { maximumFractionDigits: 4 }) : typeof value === "object" ? JSON.stringify(value) : String(value);
