import { getSharedCatalog } from "./route-availability";
import { queryPlayerResearch } from "./workbench-api";
import { resolveStatsQuery } from "./stats-query";
import type { PlayerResearchItem } from "./types";

export type ExampleKind = "player" | "duo" | "shift";
export type ExampleSubject = {
  players: PlayerResearchItem[];
  scope: { releaseId: string; season: string; phase: string; beforeDate: string };
  team?: string;
};

/** Stable server ordering: season minutes descending, canonical ID breaks ties. No roster inference. */
export async function loadExampleSubject(params: URLSearchParams, kind: ExampleKind): Promise<ExampleSubject | null> {
  const catalog = await getSharedCatalog(params.get("releaseId") || params.get("release_id") || undefined);
  const query = resolveStatsQuery(Object.fromEntries(params), catalog, "raw");
  const scope = { releaseId: query.release_id!, season: query.season, phase: query.phase, beforeDate: query.before_date! };
  const researchScope = { release_id: scope.releaseId, season: scope.season, phase: scope.phase, before_date: scope.beforeDate };
  const ranked = await queryPlayerResearch({ ...researchScope, window: "season", sort_metric: "min", sort_direction: "desc", min_games: 1, min_minutes: 1, limit: 2,
    team_id: params.get("team_id") || undefined });
  const leader = ranked.items[0];
  if (!leader) return null;
  if (kind === "player") return { players: [leader], scope };
  const team = params.get("team_id") || leader.teams[0];
  if (!team) return null;
  const teammates = params.get("team_id") ? ranked : await queryPlayerResearch({ ...researchScope, team_id: team, window: "season", sort_metric: "min", sort_direction: "desc", min_games: 1, min_minutes: 1, limit: 2 });
  if (teammates.items.length < 2) return null;
  return { players: teammates.items.slice(0, 2), scope, team };
}

export function exampleParams(source: URLSearchParams, example: ExampleSubject, parameter: string, kind: ExampleKind) {
  const next = new URLSearchParams(source);
  for (const [key, value] of Object.entries(example.scope)) if (!next.get(key)) next.set(key, value);
  const ids = example.players.map(player => player.player_id);
  next.set(parameter, kind === "duo" ? [...ids].sort().join(",") : ids[0]);
  if (kind !== "player") {
    next.set("team_id", example.team!);
    if (kind === "shift") next.set("together", ids[1]);
  }
  next.set("exampleSubject", next.get(parameter)!);
  return next;
}

/** Keep the visible example label only while the selected subject remains exact. */
export function preserveExample(url: string, source: string) {
  const marker = new URLSearchParams(source).get("exampleSubject");
  if (!marker) return url;
  const [path, search] = url.split("?");
  const next = new URLSearchParams(search);
  if (["player_id", "playerId", "together"].some(key => next.get(key) === marker)) next.set("exampleSubject", marker);
  return `${path}?${next}`;
}
