"use client";

import { useState } from "react";
import { executeWorkbenchQuery } from "./workbench-api";
import impactDefinitions from "./impact-metrics.json";
import { DARKO_COLUMNS, TRACKING_COLUMNS, usesImpactManifest } from "./stats-presets";
import type { PlayerResearchItem, QuerySpec } from "./types";

/**
 * One row per team a player played for in a split season, each a full Stats row.
 *
 * Each row is the player's row in the same scope filtered to one team. Stats ranks a team-filtered
 * value against the unfiltered league reference, so the percentiles mean what they mean on any
 * other row. Name, predicate and sample filters are dropped so a team row is never hidden by
 * a filter its season row passed.
 *
 * Play-by-play extras and on/off come back as the player's games with that team, so a team row
 * asks for them whenever the impact bundle is known.
 */
export function teamStintQuery(base: QuerySpec, team: string, impactManifest?: string | null): QuerySpec {
  return {
    release_id: base.release_id, season: base.season, phase: base.phase, before_date: base.before_date,
    ...(base.window ? { window: base.window } : {}),
    ...(base.season_scope ? { season_scope: base.season_scope } : {}),
    team_scope: { team_id: team },
    ...(impactManifest ? { impact_manifest_sha256: impactManifest, view_state: { columns: TEAM_IMPACT_COLUMNS } } : {}),
    sort: [{ field: "pts_per_game", direction: "desc" }],
    page: { limit: 1 }
  };
}

/** Model ratings (RAPM, BPR, six-factor): one league fit per player-season, never per team. */
const RATING_COLUMNS = new Set(impactDefinitions.metrics.filter(metric => metric.category === "impact").map(metric => metric.key));

/** Impact columns a team filter splits by team: play-by-play extras, their v4 rates, on/off. */
export const TEAM_IMPACT_COLUMNS = [
  ...impactDefinitions.metrics.filter(metric => metric.category !== "impact").map(metric => metric.key),
  "rim_ast_per_game", "rim_ast_per_36", "rim_ast_per100", "offensive_load", "ctov_pct"
].filter(key => usesImpactManifest(key));

/**
 * DARKO, model ratings and NBA tracking totals are one value per player-season (tracking has no
 * free per-team source), so a team row leaves them unknown instead of repeating the season's value.
 */
export function seasonOnlyColumn(key: string): boolean {
  return key in DARKO_COLUMNS || key in TRACKING_COLUMNS || RATING_COLUMNS.has(key);
}

function teamRow(item: PlayerResearchItem): PlayerResearchItem {
  const blank = (record: Record<string, number | null> | null | undefined) => record
    && Object.fromEntries(Object.entries(record).map(([key, value]) => [key, seasonOnlyColumn(key) ? null : value]));
  return { ...item, metrics: blank(item.metrics) ?? {}, table_percentiles: blank(item.table_percentiles) ?? null };
}

export async function getTeamStints(base: QuerySpec, playerId: string, teams: string[], impactManifest?: string | null): Promise<PlayerResearchItem[]> {
  const rows = await Promise.all([...new Set(teams)].sort().map(team =>
    executeWorkbenchQuery(teamStintQuery(base, team, impactManifest), { player_ids: [playerId], table_percentiles: true })
      .then(response => response.items[0] ?? null)));
  return rows.filter((row): row is PlayerResearchItem => row !== null).map(teamRow);
}

export type StintState = PlayerResearchItem[] | "loading" | "failed";

/** Expanded split seasons by key; a second toggle collapses and forgets the rows. */
export function useTeamStints() {
  const [expanded, setExpanded] = useState<Record<string, StintState>>({});
  const toggle = (key: string, load: () => Promise<PlayerResearchItem[]>) => {
    if (expanded[key]) {
      setExpanded(state => Object.fromEntries(Object.entries(state).filter(([entry]) => entry !== key)));
      return;
    }
    setExpanded(state => ({ ...state, [key]: "loading" }));
    // A row collapsed while loading stays collapsed.
    const settle = (value: StintState) => setExpanded(state => key in state ? { ...state, [key]: value } : state);
    load().then(settle, () => settle("failed"));
  };
  return { expanded, toggle };
}
