import type { Metadata } from "next";
import { ContextBar } from "@/components/context-bar";
import { TeamExplorerView } from "@/components/team-explorer-view";
import { getTeamsResearch } from "@/lib/workbench-api";
import type { TeamResearchResponse } from "@/lib/types";

export const metadata: Metadata = {
  title: "Team Explorer & Four Factors · CourtLoad",
  description: "Standings, conference & division grouping, Dean Oliver Four Factors, ratings, and tempo distributions for all 30 NBA franchises.",
};
export const dynamic = "force-dynamic";

interface TeamsPageProps {
  searchParams: Promise<{
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
  }>;
}

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  const params = await searchParams;
  const season = params.season || "2023-24";
  const phase = params.phase || "regular_season";
  const beforeDate = params.beforeDate || "2026-06-30";

  let teamsData: TeamResearchResponse | null = null;
  let loadError: string | null = null;

  try {
    teamsData = await getTeamsResearch({
      season,
      phase,
      beforeDate,
      releaseId: params.releaseId,
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load team research";
  }

  return (
    <>
      <ContextBar
        initialSeason={season}
        initialPhase={phase}
        initialBeforeDate={beforeDate}
        sampleSize={teamsData?.teams?.length}
      />

      <div className="workbench-content">
        <div className="page-header" style={{ marginBottom: "1rem" }}>
          <div>
            <h1 className="page-title">Team Explorer</h1>
            <p className="page-subtitle">
              Verified franchise standings, Dean Oliver Four Factors, offensive/defensive ratings, and pace distributions across {season} {phase.replace("_", " ")}.
            </p>
          </div>
        </div>

        {loadError && (
          <div className="notice-box" style={{ borderLeftColor: "var(--negative)", marginBottom: "1rem" }}>
            <strong>Error:</strong> {loadError}
          </div>
        )}

        {teamsData && (
          <TeamExplorerView
            initialTeams={teamsData.teams}
            season={season}
            phase={phase}
            beforeDate={beforeDate}
            orderNotice={teamsData.order_notice}
            leagueAverages={teamsData.league_averages}
          />
        )}
      </div>
    </>
  );
}
