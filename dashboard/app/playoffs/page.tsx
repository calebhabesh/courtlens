import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/panel";
import { PlayoffsBracketView } from "@/components/playoffs-bracket-view";
import { PageShell } from "@/components/ui/page-shell";
import { getWorkbenchCatalog, getPlayoffBracket } from "@/lib/workbench-api";
import type { PlayoffBracketResponse } from "@/lib/types";

export const metadata: Metadata = {
  title: "Playoffs · Live",
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
  // The shared filter bar writes `beforeDate`; older links used `cutoff_date`.
  const cutoffDate = params.beforeDate || params.cutoff_date || params.cutoffDate || catalog?.stats_scopes?.find(scope => scope.season === season && scope.phase === "playoffs")?.default_before_date;

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
    <PageShell template="board">
      <PageHeader title="Playoffs" subtitle={`Postseason series for ${season || "the selected season"}.`} />
      <PlayoffsBracketView
        bracket={bracketData}
        season={season}
        cutoffDate={cutoffDate}
        catalog={catalog ?? undefined}
        releaseId={params.releaseId || catalog?.release_id}
        loadError={loadError}
      />
    </PageShell>
  );
}
