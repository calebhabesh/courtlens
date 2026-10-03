import type { Metadata } from "next";
import { ContextBar } from "@/components/context-bar";
import { PlayerSearch } from "@/components/player-search";
import { WorkbenchPlayerExplorer } from "@/components/workbench-player-explorer";
import { getAnalyticsCatalog } from "@/lib/api";
import { queryPlayerResearch } from "@/lib/workbench-api";
import { decodeSearchParamsToQuery, querySpecToLegacyQuery } from "@/lib/query-url";
import type { AnalyticsCatalog, PlayerResearchResponse } from "@/lib/types";

export const metadata: Metadata = { title: "Player Explorer · CourtLoad" };
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

  const querySpec = decodeSearchParamsToQuery(params);
  const researchQuery = querySpecToLegacyQuery(querySpec);

  let researchData: PlayerResearchResponse | null = null;
  let loadError: string | null = null;

  try {
    researchData = await queryPlayerResearch(researchQuery);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load players";
  }

  // Fallback to legacy player search if workbench is unreachable (e.g. mock server in test)
  if (!researchData && loadError) {
    try {
      legacyCatalog = await getAnalyticsCatalog(params.snapshotId);
    } catch {
      // Return error state below
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
  }

  return (
    <>
      <ContextBar
        initialReleaseId={querySpec.release_id ?? undefined}
        initialSeason={researchQuery.season}
        initialPhase={researchQuery.phase}
        initialBeforeDate={researchQuery.before_date}
        initialWindow={researchQuery.window}
        sampleSize={researchData?.total_eligible_players}
        lastIncludedDate={researchData?.context?.last_included_date}
      />

      <div className="workbench-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Player Explorer</h1>
            <p className="page-subtitle">
              Browse, filter, and compare production metrics without required search inputs. Single-formula definitions from metric catalog v1.
            </p>
          </div>
        </div>

        {loadError && (
          <div className="notice-box" style={{ borderLeftColor: "var(--negative)" }}>
            <strong>Error:</strong> {loadError}
          </div>
        )}

        {researchData && (
          <WorkbenchPlayerExplorer
            data={researchData}
            currentSortMetric={researchQuery.sort_metric}
            currentSortDirection={researchQuery.sort_direction}
          />
        )}
      </div>
    </>
  );
}
