import { TeamStatShiftView } from "@/components/team-stat-shift-view";
import { getWorkbenchCatalog } from "@/lib/workbench-api";
import { resolveStatsQuery } from "@/lib/stats-query";

export const dynamic = "force-dynamic";
export default async function StatLineShiftPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const catalog = await getWorkbenchCatalog(params.releaseId || params.release_id).catch(() => null);
  const scope = catalog ? resolveStatsQuery(params, catalog, "per_game") : params;
  return <TeamStatShiftView scope={{ release_id: scope.release_id ?? undefined, season: scope.season, phase: scope.phase, before_date: scope.before_date ?? undefined }} />;
}
