import type { Metadata } from "next";
import { ContextBar } from "@/components/context-bar";
import { PlayerSearch } from "@/components/player-search";
import { WorkbenchPlayerExplorer } from "@/components/workbench-player-explorer";
import { getAnalyticsCatalog } from "@/lib/api";
import { queryPlayerResearch } from "@/lib/workbench-api";
import type { AnalyticsCatalog, PlayerResearchResponse } from "@/lib/types";

export const metadata: Metadata = { title: "Player Explorer · CourtLoad" };
export const dynamic = "force-dynamic";

interface PlayersPageProps {
  searchParams: Promise<{
    snapshotId?: string;
    season?: string;
    phase?: string;
    beforeDate?: string;
    window?: string;
    teamId?: string;
    name?: string;
    minGames?: string;
    minMinutes?: string;
    minAvgMinutes?: string;
    sortMetric?: string;
    sortDirection?: string;
    cursor?: string;
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

  const season = params.season || "2025-26";
  const phase = params.phase || "regular_season";
  const beforeDate = params.beforeDate || "2026-06-30";
  const windowParam = params.window || "season";
  const sortMetric = params.sortMetric || "pts";
  const sortDirection = params.sortDirection || "desc";

  let researchData: PlayerResearchResponse | null = null;
  let loadError: string | null = null;

  try {
    researchData = await queryPlayerResearch({
      season,
      phase,
      before_date: beforeDate,
      window: windowParam,
      name: params.name,
      team_id: params.teamId,
      min_games: params.minGames ? parseInt(params.minGames, 10) : undefined,
      min_minutes: params.minMinutes ? parseFloat(params.minMinutes) : undefined,
      min_avg_minutes: params.minAvgMinutes ? parseFloat(params.minAvgMinutes) : undefined,
      sort_metric: sortMetric,
      sort_direction: sortDirection,
      limit: 50
    });
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
        initialSeason={season}
        initialPhase={phase}
        initialBeforeDate={beforeDate}
        initialWindow={windowParam}
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
            currentSortMetric={sortMetric}
            currentSortDirection={sortDirection}
          />
        )}
      </div>
    </>
  );
}
