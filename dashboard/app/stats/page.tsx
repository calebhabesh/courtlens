import { Suspense } from "react";
import { SharedFloorView } from "@/components/shared-floor-view";
import type { Metadata } from "next";
import { ContextBar } from "@/components/context-bar";
import { WorkbenchPlayerExplorer } from "@/components/workbench-player-explorer";
import { queryPlayerResearch } from "@/lib/workbench-api";
import { decodeSearchParamsToQuery, querySpecToLegacyQuery } from "@/lib/query-url";
import type { PlayerResearchResponse } from "@/lib/types";

export const metadata: Metadata = {
  title: "Stats Explorer · CourtLoad",
  description: "Dense player statistics explorer with SQL-backed analytical windowing and metric integrity."
};

export const dynamic = "force-dynamic";

interface StatsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function StatsPage({ searchParams }: StatsPageProps) {
  const params = await searchParams;
  if (params.preset === "onoff" || params.viewId === "onoff" || params.view_id === "onoff") return <Suspense fallback={<p>Loading on/off…</p>}><SharedFloorView initialOperation="on-off" statsPreset /></Suspense>;
  const querySpec = decodeSearchParamsToQuery(params);
  const researchQuery = querySpecToLegacyQuery(querySpec);

  let researchData: PlayerResearchResponse | null = null;
  let loadError: string | null = null;

  try {
    researchData = await queryPlayerResearch(researchQuery);
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load player stats from workbench";
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
            <h1 className="page-title">Stats Explorer</h1>
            <p className="page-subtitle">
              Dense player statistics explorer with deterministic analytical windowing, verified percentages, and sample constraints.
            </p>
          </div>
        </div>

        {loadError && (
          <div className="notice-box" style={{ borderLeftColor: "var(--negative)", marginBottom: "1rem" }}>
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
