import type { GoodDirection } from "./percentile-display";

/**
 * Compare's grid (alignment row 3, 64): three to five players, one column each, under one
 * scope. ``layout=grid`` selects it; ``players`` lists the columns in order and ``seasons``
 * the season of each column (empty when it follows the page season). Two players can stay in
 * the grid; the duel card keeps its own ``playerA``/``playerB``/``seasonA``/``seasonB``.
 */
export const MAX_GRID_PLAYERS = 5;

export type GridSelection = { ids: string[]; seasons: (string | null)[] };

const SEASON = /^\d{4}-\d{2}$/;
const DUEL_KEYS = ["playerA", "playerB", "seasonA", "seasonB", "empty"];

export function isGrid(params: URLSearchParams | { get(key: string): string | null }) {
  return params.get("layout") === "grid";
}

/** The grid's columns from the URL: unique IDs (at most five) and each one's own season. */
export function parseGrid(params: { get(key: string): string | null }): GridSelection {
  const ids = (params.get("players") ?? "").split(",").map(id => id.trim());
  const seasons = (params.get("seasons") ?? "").split(",");
  const kept: GridSelection = { ids: [], seasons: [] };
  ids.forEach((id, index) => {
    if (!id || kept.ids.includes(id) || kept.ids.length >= MAX_GRID_PLAYERS) return;
    kept.ids.push(id);
    const season = seasons[index]?.trim();
    kept.seasons.push(season && SEASON.test(season) ? season : null);
  });
  return kept;
}

/** Write a grid selection, keeping the scope, preset and counting mode. */
export function gridParams(params: URLSearchParams, selection: GridSelection): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  for (const key of DUEL_KEYS) next.delete(key);
  next.set("layout", "grid");
  if (selection.ids.length) next.set("players", selection.ids.join(",")); else next.delete("players");
  if (selection.seasons.some(Boolean)) next.set("seasons", selection.seasons.map(season => season ?? "").join(","));
  else next.delete("seasons");
  return next;
}

/** The duel card for exactly two grid columns: their own seasons become seasonA / seasonB. */
export function duelParams(params: URLSearchParams, selection: GridSelection): URLSearchParams {
  const next = new URLSearchParams(params.toString());
  for (const key of ["layout", "players", "seasons", "empty", "playerA", "playerB"]) next.delete(key);
  const [a, b] = selection.ids;
  // No players is the cleared card, which must not reload the default pair.
  if (!a) next.set("empty", "1");
  if (a) next.set("playerA", a);
  if (b) next.set("playerB", b);
  const [seasonA, seasonB] = selection.seasons;
  if (seasonA) next.set("seasonA", seasonA); else next.delete("seasonA");
  if (seasonB) next.set("seasonB", seasonB); else next.delete("seasonB");
  return next;
}

/** The duel's pair (and any extra trend-line players) as grid columns, seasons carried over. */
export function gridFromDuel(params: URLSearchParams, a: string, b: string, extra: string[] = []): GridSelection {
  const ids = [...new Set([a, b, ...extra])].slice(0, MAX_GRID_PLAYERS);
  const own = (key: string) => { const season = params.get(key); return season && SEASON.test(season) ? season : null; };
  return { ids, seasons: ids.map((_, index) => index === 0 ? own("seasonA") : index === 1 ? own("seasonB") : null) };
}

/**
 * The columns holding a row's best value, compared at the precision the grid shows. Unknown
 * values never lead; a row where every known value ties, or with fewer than two known values,
 * has no best. A best value is a description of the row, never an overall verdict.
 */
export function bestColumns(values: (number | null)[], direction: GoodDirection, digits: number): number[] {
  const known = values.map((value, index) => ({ value: value == null ? null : Number(value.toFixed(digits)), index }))
    .filter((entry): entry is { value: number; index: number } => entry.value != null);
  if (known.length < 2 || !direction) return [];
  const best = direction === "low" ? Math.min(...known.map(entry => entry.value)) : Math.max(...known.map(entry => entry.value));
  const leaders = known.filter(entry => entry.value === best).map(entry => entry.index);
  return leaders.length === known.length ? [] : leaders;
}
