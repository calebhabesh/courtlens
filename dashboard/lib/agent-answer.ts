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
  if (source.origin === "reference") return `reference · as of ${source.as_of ?? "date unavailable"}`;
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
  const rows = (result.operation === "distribution" || result.operation === "similarity" ? result.rows.slice(1) : result.rows).map(row => tableRow(row));
  // Facts keep their whole row too, so a shown name can find its hidden id (SL06).
  if (view?.kind !== "table") return view && { ...view, row: rows[0] ?? {} };
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

// Site links SL06 (docs/site-links-plan.md): names in Ask answers link only through ids the turn's
// own results carry. Names are matched exactly, never by similarity.
export type AnswerEntity = { kind: "player" | "team"; id: string };

/** The entity a flattened result cell names, when the same row carries its id: `player name` with
 * `player id` (query, position, similarity, workload rows), `player · name` with `player · id`
 * (profile), `latest team · tricode` with `latest team · id`, `team · name` with `team · id`. */
export function entityOfCell(row: Record<string, unknown>, key: string): AnswerEntity | null {
  const match = /^(.*?)(player|team)( · | )(name|tricode)$/.exec(key);
  if (!match) return null;
  const id = row[`${match[1]}${match[2]}${match[3]}id`];
  const text = row[key];
  if (typeof text !== "string" || !text.trim() || (typeof id !== "string" && typeof id !== "number") || !String(id).trim()) return null;
  return { kind: match[2] as AnswerEntity["kind"], id: String(id).trim() };
}

/** A result's own scope for its links (D5): its season, and the phase when it is the playoffs. */
export function resultScope(block: AgentResultBlock): { season?: string; phase?: string } {
  const context = pinnedContext(block.context ?? {});
  return { ...(context.season ? { season: context.season } : {}), ...(context.phase === "playoffs" ? { phase: "playoffs" } : {}) };
}

const entityKey = (entity: AnswerEntity) => `${entity.kind}:${entity.id}`;

/**
 * Full names a prose answer may link: every player or team name with its id in this turn's
 * results (all returned rows, not only the ten shown), kept only when the name maps to exactly one
 * id. Codes are not names. A season travels only when every result naming that id agrees on it.
 */
export function answerEntityNames(results: AgentResultBlock[]): Map<string, { entity: AnswerEntity; scope: { season?: string; phase?: string } }> {
  const found = new Map<string, Map<string, { entity: AnswerEntity; scopes: Set<string> }>>();
  for (const block of results) {
    const scope = JSON.stringify(resultScope(block));
    for (const raw of block.result.rows ?? []) {
      const row = tableRow(raw);
      for (const key of Object.keys(row)) {
        if (!/name$/.test(key)) continue;
        const entity = entityOfCell(row, key);
        if (!entity) continue;
        const name = String(row[key]).trim();
        const ids = found.get(name) ?? new Map();
        const seen = ids.get(entityKey(entity)) ?? { entity, scopes: new Set<string>() };
        seen.scopes.add(scope);
        ids.set(entityKey(entity), seen);
        found.set(name, ids);
      }
    }
  }
  const names = new Map<string, { entity: AnswerEntity; scope: { season?: string; phase?: string } }>();
  for (const [name, ids] of found) {
    if (ids.size !== 1) continue;
    const [{ entity, scopes }] = ids.values();
    names.set(name, { entity, scope: scopes.size === 1 ? JSON.parse([...scopes][0]) : {} });
  }
  return names;
}

export type ProseSegment = { text: string; positions: number[]; literal: boolean };
export type ProseLink = { length: number; entity: AnswerEntity; scope: { season?: string; phase?: string } };
type Flag = { start: number; end: number };
export const flagAt = (flags: Flag[], position: number | undefined) => position == null ? undefined : flags.find(flag => flag.start <= position && position < flag.end);

/**
 * The first exact full-name mention of each linkable name, in reading order, keyed by the
 * mention's first position in the original answer text. A mention counts only as a whole word,
 * outside code and inline code, and inside one unverified-marking state (a name the marking would
 * split stays plain, and the next mention may link instead).
 */
export function proseLinks(segments: ProseSegment[], names: ReturnType<typeof answerEntityNames>, flags: Flag[]): Map<number, ProseLink> {
  const links = new Map<number, ProseLink>();
  if (!names.size) return links;
  const pending = new Set(names.keys());
  const word = /[\p{L}\p{N}]/u;
  for (const segment of segments) {
    if (segment.literal || !pending.size) continue;
    const characters = Array.from(segment.text);
    const code: Array<[number, number]> = [];
    for (const match of segment.text.matchAll(/`[^`]+`/gu)) {
      const start = Array.from(segment.text.slice(0, match.index)).length;
      code.push([start, start + Array.from(match[0]).length]);
    }
    const mentions: Array<{ at: number; name: string }> = [];
    for (const name of pending) {
      const target = Array.from(name);
      for (let at = 0; at + target.length <= characters.length; at++) {
        if (!target.every((char, n) => characters[at + n] === char)) continue;
        const end = at + target.length;
        if ((at > 0 && word.test(characters[at - 1])) || (end < characters.length && word.test(characters[end]))) continue;
        if (code.some(([from, to]) => at < to && end > from)) continue;
        const flag = flagAt(flags, segment.positions[at]);
        if (segment.positions.slice(at, end).some(position => flagAt(flags, position) !== flag)) continue;
        mentions.push({ at, name });
        break;
      }
    }
    // Longer names first at the same spot, then drop any mention overlapping one already taken.
    mentions.sort((a, b) => a.at - b.at || b.name.length - a.name.length);
    let taken = -1;
    for (const { at, name } of mentions) {
      if (at < taken) continue;
      const { entity, scope } = names.get(name)!;
      links.set(segment.positions[at], { length: Array.from(name).length, entity, scope });
      pending.delete(name);
      taken = at + Array.from(name).length;
    }
  }
  return links;
}
