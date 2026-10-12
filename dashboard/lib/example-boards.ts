import { executeWorkbenchQuery } from "./workbench-api";
import { resolveStatsQuery } from "./stats-query";
import { scopeContextLine } from "./scope-labels";
import type { WorkbenchCatalog, WorkbenchQueryResponse } from "./types";

export const EXAMPLE_BOARD_ID = "__minutes_example__";

/** Read-only, bounded league order. Display filters cannot redefine the example or cohort. */
export async function loadExampleBoard(catalog: WorkbenchCatalog, params: Record<string, string | string[] | undefined>) {
  const query = resolveStatsQuery({
    releaseId: params.releaseId ?? params.release_id,
    season: params.season,
    phase: params.phase,
    beforeDate: params.beforeDate ?? params.before_date,
    window: "season"
  }, catalog, "raw");
  query.sort = [{ field: "min", direction: "desc", nulls_last: true }];
  query.sample_filters = { min_games: 1, min_minutes: 1 };
  query.view_state = { columns: ["gp", "min", "min_per_game", "pts_per_game"] };
  query.page = { limit: 15 };
  return executeWorkbenchQuery(query, { table_percentiles: true });
}

export function exampleBoardScope(data: WorkbenchQueryResponse) {
  return scopeContextLine(data.query.season, data.query.phase, data.query.before_date!);
}

export function exampleRankingCopy(data: WorkbenchQueryResponse) {
  return {
    title: `${data.query.season} Minutes Leaders`,
    board_type: "custom" as const,
    scope: { release_id: data.query.release_id, season: data.query.season, phase: data.query.phase, before_date: data.query.before_date, window: "season" },
    notes: `Copied from the top 15 by observed season minutes. ${exampleBoardScope(data)}. Edits are personal judgments.`,
    entries: data.items.map((player, index) => ({ rank: index + 1, player_id: player.player_id, player_name: player.player_name, notes: null, tags: [] }))
  };
}

export function exampleTierGroups(data: WorkbenchQueryResponse) {
  return [0, 1, 2].map(index => ({
    tier_id: `minutes-${index + 1}`,
    label: `Minutes ranks ${index * 5 + 1}–${index * 5 + 5}`,
    color: `var(--color-category-${index + 1})`,
    player_ids: data.items.slice(index * 5, index * 5 + 5).map(player => player.player_id)
  }));
}

export function exampleTierCopy(data: WorkbenchQueryResponse) {
  return {
    title: `${data.query.season} Minutes Groups`,
    description: `Copied from the top 15 by observed season minutes, in groups of five. ${exampleBoardScope(data)}. Edits are personal judgments.`,
    tiers: exampleTierGroups(data)
  };
}
