import type { Metadata } from "next";
import { ContextBar } from "@/components/context-bar";
import { PlayoffsSeriesView } from "@/components/playoffs-series-view";
import { GatedNote } from "@/components/ui/gated-note";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { getPlayoffSeriesDetail } from "@/lib/workbench-api";
import type { PlayoffSeriesDetailResponse } from "@/lib/types";
import { ButtonLink } from "@/components/ui/kit";

export const metadata: Metadata = {
  title: "Playoff Series",
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
  // The shared filter bar writes `beforeDate`; older links used `cutoff_date`.
  const cutoffDate = sp.beforeDate || sp.cutoff_date || sp.cutoffDate;

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
      <PageShell template="board">
        <PageHeader title="Playoff series" />
        <GatedNote
          tone="warning"
          why={loadError ?? undefined}
          action={<ButtonLink size="lg" href="/playoffs" icon="left">Playoffs</ButtonLink>}
        >
          This series could not be loaded.
        </GatedNote>
      </PageShell>
    );
  }

  return (
    <PageShell template="board">
      <PlayoffsSeriesView
        detail={detail}
        filterBar={<ContextBar
          key="filter-bar"
          allowedPhases={["playoffs"]}
          initialSeason={detail.season}
          initialPhase="playoffs"
          initialBeforeDate={cutoffDate || detail.cutoff_date || dayAfter(detail.game_cards.map(card => card.game_date).filter((value): value is string => Boolean(value)).sort().at(-1))}
          showWindow={false}
          sampleSize={detail.team1.games_played}
          detailRows={[{ label: "Series", value: detail.series_id, mono: true }]}
        />}
      />
    </PageShell>
  );
}

/** The day after a series' last game: its scope runs through that game. */
function dayAfter(day: string | undefined): string | undefined {
  if (!day) return undefined;
  const next = new Date(`${day}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}
