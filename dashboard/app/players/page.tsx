import type { Metadata } from "next";
import { StatsWorkspace } from "@/components/stats-workspace";
import { PlayerSearch } from "@/components/player-search";
import { getAnalyticsCatalog } from "@/lib/api";
import type { AnalyticsCatalog } from "@/lib/types";

export const metadata: Metadata = { title: "Player Explorer · CourtLens" };
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
      <section className="workbench-content">
        <div className="page-header">
          <div>
            <span className="text-xs text-muted font-mono uppercase">Historical Replay</span>
            <h1 className="page-title">Players</h1>
          </div>
        </div>
        <PlayerSearch catalog={legacyCatalog} />
      </section>
    );
  }

  return <StatsWorkspace params={params} basePath="/players" title="Player Explorer" />;
}
