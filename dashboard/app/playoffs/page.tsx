import type { Metadata } from "next";
import { ContextBar } from "@/components/context-bar";
import { PlayoffsBracketView } from "@/components/playoffs-bracket-view";
import { getWorkbenchCatalog, getPlayoffBracket } from "@/lib/workbench-api";
import type { PlayoffBracketResponse } from "@/lib/types";

export const metadata: Metadata = {
  title: "Playoff Bracket & Series Explorer · CourtLens",
  description:
    "NBA postseason tournament bracket hierarchy, 7-game cards, Dean Oliver Four Factors, player series box scores, and explicit seed evidence."
};

export const dynamic = "force-dynamic";

interface PlayoffsPageProps {
  searchParams: Promise<{
    season?: string;
    cutoff_date?: string;
    cutoffDate?: string;
    beforeDate?: string;
    releaseId?: string;
  }>;
}

export default async function PlayoffsPage({ searchParams }: PlayoffsPageProps) {
  const params = await searchParams;
  const catalog = await getWorkbenchCatalog(params.releaseId).catch(() => null);
  const season = params.season || catalog?.default_season || "";
  const cutoffDate = params.cutoff_date || params.cutoffDate || params.beforeDate || catalog?.stats_scopes?.find(scope => scope.season === season && scope.phase === "playoffs")?.default_before_date;

  let bracketData: PlayoffBracketResponse | null = null;
  let loadError: string | null = null;

  try {
    bracketData = await getPlayoffBracket({
      season,
      cutoffDate,
      releaseId: params.releaseId
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load playoff bracket";
  }

  return (
    <>
      <ContextBar
        allowedPhases={["playoffs"]}
        catalog={catalog ?? undefined}
        initialReleaseId={params.releaseId || catalog?.release_id}
        sampleNoun="series"
        initialSeason={season}
        initialPhase="playoffs"
        initialBeforeDate={cutoffDate || "2026-06-30"}
        sampleSize={bracketData?.rounds?.reduce((acc, r) => acc + r.series.length, 0)}
      />

      <div className="workbench-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Playoff Bracket &amp; Series Explorer</h1>
            <p className="page-subtitle">
              Verified NBA postseason series outcomes, 2-2-1-1-1 host sequence, seed evidence, and Dean Oliver Four Factors for {season}.
            </p>
          </div>
        </div>

        {loadError && (
          <div className="notice-box error-notice" role="alert">
            <strong>Error:</strong> {loadError}
          </div>
        )}

        {bracketData && (
          <PlayoffsBracketView
            bracket={bracketData}
            season={season}
            cutoffDate={cutoffDate}
          />
        )}
      </div>
    </>
  );
}
