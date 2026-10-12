import type { Metadata } from "next";
import { Suspense } from "react";
import { RosterShapesTeam } from "@/components/roster-shapes-view";
import { resolveStatsQuery } from "@/lib/stats-query";
import { getWorkbenchCatalog } from "@/lib/workbench-api";
import type { WorkbenchCatalog } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Roster Shapes · CourtLens"
};

interface RosterShapesTeamPageProps {
  params: Promise<{ team: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RosterShapesTeamPage({ params, searchParams }: RosterShapesTeamPageProps) {
  const [{ team }, query] = await Promise.all([params, searchParams]);
  const view = query.view === "depth" ? "depth" : "shape";
  const releaseId = typeof query.releaseId === "string" ? query.releaseId : typeof query.release_id === "string" ? query.release_id : undefined;

  // The depth chart keeps the Stats scope defaults, so its filter bar shows what the team request uses.
  let catalog: WorkbenchCatalog | null = null;
  if (view === "depth") {
    try {
      catalog = await getWorkbenchCatalog(releaseId);
    } catch {
      catalog = null;
    }
  }
  const resolved = catalog ? resolveStatsQuery(query, catalog, "per_game") : null;
  const scope = {
    releaseId: releaseId ?? resolved?.release_id ?? undefined,
    season: resolved?.season ?? (typeof query.season === "string" ? query.season : undefined),
    phase: resolved?.phase ?? (typeof query.phase === "string" ? query.phase : undefined),
    beforeDate: resolved?.before_date ?? (typeof query.beforeDate === "string" ? query.beforeDate : undefined)
  };

  return <Suspense fallback={null}><RosterShapesTeam key={`${team}:${view}`} team={decodeURIComponent(team)} view={view} depth={{ catalog, scope }} /></Suspense>;
}
