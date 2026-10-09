import type { Metadata } from "next";
import { RosterAllocationView } from "@/components/roster-allocation-view";
import { resolveStatsQuery } from "@/lib/stats-query";
import { getWorkbenchCatalog } from "@/lib/workbench-api";
import type { WorkbenchCatalog } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Roster Shapes · CourtLens"
};

interface RosterShapesPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RosterShapesPage({ searchParams }: RosterShapesPageProps) {
  const params = await searchParams;
  const releaseId = typeof params.releaseId === "string" ? params.releaseId : typeof params.release_id === "string" ? params.release_id : undefined;
  const team = typeof params.team === "string" ? params.team : typeof params.teamId === "string" ? params.teamId : null;

  let catalog: WorkbenchCatalog | null = null;
  try {
    catalog = await getWorkbenchCatalog(releaseId);
  } catch {
    catalog = null;
  }

  // The same scope defaults as Stats, so the filter bar shows exactly what the team request uses.
  const query = catalog ? resolveStatsQuery(params, catalog, "per_game") : null;
  const scope = {
    releaseId: releaseId ?? query?.release_id ?? undefined,
    season: query?.season ?? (typeof params.season === "string" ? params.season : undefined),
    phase: query?.phase ?? (typeof params.phase === "string" ? params.phase : undefined),
    beforeDate: query?.before_date ?? (typeof params.beforeDate === "string" ? params.beforeDate : undefined)
  };

  return <RosterAllocationView key={team ?? "none"} catalog={catalog} teamId={team} scope={scope} />;
}
