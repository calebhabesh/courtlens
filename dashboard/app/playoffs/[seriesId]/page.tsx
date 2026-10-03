import type { Metadata } from "next";
import Link from "next/link";
import { ContextBar } from "@/components/context-bar";
import { PlayoffsSeriesView } from "@/components/playoffs-series-view";
import { getPlayoffSeriesDetail } from "@/lib/workbench-api";
import type { PlayoffSeriesDetailResponse } from "@/lib/types";

export const metadata: Metadata = {
  title: "Playoff Series Detail · CourtLoad",
  description:
    "Postseason 7-game cards, Dean Oliver Four Factors, player box-score averages, and matchup breakdown."
};

export const dynamic = "force-dynamic";

interface PlayoffSeriesDetailPageProps {
  params: Promise<{ seriesId: string }>;
  searchParams: Promise<{
    cutoff_date?: string;
    cutoffDate?: string;
    beforeDate?: string;
    releaseId?: string;
  }>;
}

export default async function PlayoffSeriesDetailPage({
  params,
  searchParams
}: PlayoffSeriesDetailPageProps) {
  const [{ seriesId }, sp] = await Promise.all([params, searchParams]);
  const cutoffDate = sp.cutoff_date || sp.cutoffDate || sp.beforeDate;

  let detail: PlayoffSeriesDetailResponse | null = null;
  let loadError: string | null = null;

  try {
    detail = await getPlayoffSeriesDetail(seriesId, {
      cutoffDate,
      releaseId: sp.releaseId
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load playoff series detail";
  }

  if (loadError || !detail) {
    return (
      <div className="workbench-content">
        <div className="notice-box" style={{ borderLeftColor: "var(--negative)", marginBottom: "1rem" }}>
          <strong>Error loading playoff series:</strong> {loadError || "Series not found."}
        </div>
        <Link href="/playoffs" className="button button-small">
          ← Return to Playoff Bracket
        </Link>
      </div>
    );
  }

  return (
    <>
      <ContextBar
        initialSeason={detail.season}
        initialPhase="playoffs"
        initialBeforeDate={cutoffDate || "2026-06-30"}
        sampleSize={detail.team1.games_played}
      />

      <div className="workbench-content">
        <PlayoffsSeriesView detail={detail} cutoffDate={cutoffDate} />
      </div>
    </>
  );
}
