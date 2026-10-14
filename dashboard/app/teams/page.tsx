import { resolveStatsQuery } from "@/lib/stats-query";
import { getWorkbenchCatalog } from "@/lib/workbench-api";
import type { Metadata } from "next";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { GatedNote } from "@/components/ui/gated-note";
import { TeamExplorerView } from "@/components/team-explorer-view";
import { getTeamsResearch } from "@/lib/workbench-api";
import type { TeamResearchResponse } from "@/lib/types";
import { ButtonLink } from "@/components/ui/kit";

export const metadata: Metadata = {
  title: "Team Explorer & Four Factors · CourtLens",
  description: "Standings, conference & division grouping, Dean Oliver Four Factors, ratings, and tempo distributions for all 30 NBA franchises.",
};
export const dynamic = "force-dynamic";

interface TeamsPageProps {
  searchParams: Promise<{
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
    release_id?: string;
    before_date?: string;
  }>;
}

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  const params = await searchParams;
  const catalog = await getWorkbenchCatalog(params.releaseId || params.release_id).catch(() => null);
  const query = catalog ? resolveStatsQuery(params, catalog, "per_game") : null;
  const season = query?.season || params.season || "";
  const phase = query?.phase || params.phase || "";
  const beforeDate = query?.before_date || params.beforeDate || params.before_date || "";
  const resolvedReleaseId = query?.release_id || params.releaseId || params.release_id;

  let teamsData: TeamResearchResponse | null = null;
  let loadError: string | null = null;

  try {
    if (!catalog && !season) throw new Error("Context catalog unavailable. Retry this page or provide an explicit scope.");
    teamsData = await getTeamsResearch({
      season,
      phase,
      beforeDate,
      releaseId: resolvedReleaseId,
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load team research";
  }

  return (
    <PageShell template="explorer" className="teams-page">
      {loadError && <><PageHeader title="Team Stats & Cohorts" subtitle="Standings, scoring and Four Factors." /><GatedNote action={<ButtonLink size="lg" href="/teams">Retry</ButtonLink>} why={loadError}>Team research is unavailable.</GatedNote></>}
      {teamsData && <TeamExplorerView
        initialTeams={teamsData.teams} catalog={catalog ?? undefined} releaseId={resolvedReleaseId}
        season={season} phase={phase} beforeDate={beforeDate}
        orderNotice={teamsData.order_notice} leagueAverages={teamsData.league_averages}
      />}
    </PageShell>
  );
}
