import type { Metadata } from "next";
import { Suspense } from "react";
import { PageShell } from "@/components/ui/page-shell";
import { LastGamesView, type LastGamesScope } from "@/components/last-games-view";
import { executeWorkbenchQuery, getWorkbenchCatalog } from "@/lib/workbench-api";
import { resolveStatsQuery } from "@/lib/stats-query";
import type { WorkbenchCatalog } from "@/lib/types";
import { loadExampleSubject } from "@/lib/example-subject";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Last X Games"
};

interface LastGamesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

type Example = { id: string; name: string; season: string; rule: string };

/** The first row of the Stats table as it opens (Overview, by DARKO DPM), for the season in scope. */
async function statsLeader(params: Record<string, string>, catalog: WorkbenchCatalog): Promise<Example | null> {
  if (!catalog.darko?.manifest_sha256) return null;
  const query = resolveStatsQuery(params, catalog, "per_game", "dpm");
  query.page = { limit: 1 };
  query.darko_manifest_sha256 = catalog.darko.manifest_sha256;
  const leader = (await executeWorkbenchQuery(query)).items[0];
  return leader ? { id: leader.player_id, name: leader.player_name, season: query.season, rule: `Top of the Stats table (DPM) in ${query.season}.` } : null;
}

/**
 * Last X Games (alignment row 6). The server resolves only the defaults: the season scopes and,
 * without a player, the example subject: the Stats table's top player (follow-up 9), else the
 * season's minutes leader. The view loads the games itself.
 */
export default async function LastGamesPage({ searchParams }: LastGamesPageProps) {
  const params = await searchParams;
  const text = (name: string) => typeof params[name] === "string" ? params[name] as string : undefined;
  const releaseId = text("releaseId");
  const catalog = await getWorkbenchCatalog(releaseId).catch(() => null);
  const scopes: LastGamesScope[] = (catalog?.stats_scopes ?? [])
    .filter(scope => scope.phase === "regular_season" || scope.phase === "playoffs")
    .map(scope => ({ season: scope.season, phase: scope.phase, beforeDate: scope.default_before_date }));
  const explicit = text("playerId") || text("id");
  const strings = Object.fromEntries(Object.entries(params).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  let example: Example | null = null;
  if (!explicit && catalog) example = await statsLeader(strings, catalog).catch(() => null);
  if (!explicit && !example) {
    const busiest = await loadExampleSubject(new URLSearchParams(strings), "player").catch(() => null);
    const leader = busiest?.players[0];
    if (busiest && leader) example = { id: leader.player_id, name: leader.player_name, season: busiest.scope.season, rule: `Most minutes in ${busiest.scope.season}.` };
  }
  return <PageShell template="explorer"><Suspense fallback={null}><LastGamesView scopes={scopes}
    defaultSeason={example?.season || catalog?.default_season || scopes.at(-1)?.season || ""} example={example} /></Suspense></PageShell>;
}
