import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayerDashboardView } from "@/components/player-dashboard-view";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/kit";
import { PlayerSearch } from "@/components/player-search";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { getAnalyticsCatalog } from "@/lib/api";
import { executeWorkbenchQuery, getWorkbenchCatalog } from "@/lib/workbench-api";
import { carouselQuery, readDashboardState } from "@/lib/player-dashboard";
import type { AnalyticsCatalog } from "@/lib/types";

export const metadata: Metadata = { title: "Player Dashboard" };
export const dynamic = "force-dynamic";

interface PlayersPageProps {
  searchParams: Promise<{
    snapshotId?: string;
    season?: string;
    phase?: string;
    beforeDate?: string;
    before_date?: string;
    window?: string;
    teamId?: string;
    team_id?: string;
    name?: string;
    minGames?: string;
    min_games?: string;
    minMinutes?: string;
    min_minutes?: string;
    minAvgMinutes?: string;
    min_avg_minutes?: string;
    sortMetric?: string;
    sort_metric?: string;
    sortDirection?: string;
    sort_direction?: string;
    cursor?: string;
    releaseId?: string;
    release_id?: string;
    [key: string]: string | string[] | undefined;
  }>;
}

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  const params = await searchParams;

  let legacyCatalog: AnalyticsCatalog | null = null;

  // If testing with browser fixture snapshot explicitly, provide legacy player search
  if (params.snapshotId === "snapshot-browser-fixture") {
    try {
      legacyCatalog = await getAnalyticsCatalog(params.snapshotId);
    } catch {
      // Fall through to workbench explorer
    }
  }

  if (legacyCatalog) {
    return (
      <PageShell template="explorer">
        <PageHeader title="Player Directory" subtitle="Historical replay of a fixture snapshot." />
        <PlayerSearch catalog={legacyCatalog} />
      </PageShell>
    );
  }

  const catalog = await getWorkbenchCatalog(typeof params.releaseId === "string" ? params.releaseId : undefined).catch(() => null);
  if (!catalog) {
    return (
      <PageShell template="explorer">
        <EmptyState icon="alert" title="The Player Dashboard could not load." description="The Stats service did not answer. Try again, or open Stats."
          action={<ButtonLink size="sm" href="/stats">Open Stats</ButtonLink>} />
      </PageShell>
    );
  }
  const state = readDashboardState(params, catalog);
  const { query, presentation } = carouselQuery(catalog, state.season, state.team);
  const players = await executeWorkbenchQuery(query, presentation).then(result => result.items).catch(() => []);
  return (
    <PageShell template="explorer">
      <Suspense><PlayerDashboardView catalog={catalog} carousel={{ season: state.season, team: state.team, players }} /></Suspense>
    </PageShell>
  );
}
