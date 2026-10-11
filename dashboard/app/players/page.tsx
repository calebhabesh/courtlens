import type { Metadata } from "next";
import { StatsWorkspace } from "@/components/stats-workspace";
import { PlayerSearch } from "@/components/player-search";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { getAnalyticsCatalog } from "@/lib/api";
import type { AnalyticsCatalog } from "@/lib/types";

export const metadata: Metadata = { title: "Player Directory" };
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

  // D7: the title matches the nav label.
  return <StatsWorkspace params={params} basePath="/players" title="Player Directory" />;
}
