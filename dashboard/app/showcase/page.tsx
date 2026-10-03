import type { Metadata } from "next";
import Link from "next/link";
import { ContextBar } from "@/components/context-bar";
import { PlayerShowcaseView } from "@/components/player-showcase-view";
import { getWorkbenchCatalog, queryPlayerResearch } from "@/lib/workbench-api";
import type { PlayerResearchResponse, WorkbenchCatalog } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Player Showcase & Cards · CourtLoad"
};

interface ShowcasePageProps {
  searchParams: Promise<{
    playerId?: string;
    id?: string;
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
    [key: string]: string | string[] | undefined;
  }>;
}

export default async function ShowcasePage({ searchParams }: ShowcasePageProps) {
  const params = await searchParams;

  let catalog: WorkbenchCatalog | null = null;
  try {
    catalog = await getWorkbenchCatalog(params.releaseId);
  } catch {
    // Graceful fallback
  }

  const season = params.season || catalog?.default_season || "2024-25";
  const phase = params.phase || catalog?.default_phase || "regular_season";
  const beforeDate = params.beforeDate || catalog?.default_before_date || "2026-06-30";

  let researchData: PlayerResearchResponse | null = null;
  let loadError: string | null = null;

  try {
    researchData = await queryPlayerResearch({
      season,
      phase,
      before_date: beforeDate,
      release_id: params.releaseId,
      sort_metric: "pts",
      sort_direction: "desc",
      limit: 25
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load players for showcase";
  }

  if (!researchData || researchData.items.length === 0) {
    return (
      <section className="page shell">
        <div className="empty-state tall" role="alert">
          <span className="empty-code">SHOWCASE CARDS</span>
          <h1>Showcase players unavailable</h1>
          <p>{loadError ?? `Could not find confirmed player performances for ${season} before ${beforeDate}.`}</p>
          <Link className="button button-dark" href="/players">
            Browse Players Directory
          </Link>
        </div>
      </section>
    );
  }

  return (
    <>
      <ContextBar
        initialSeason={season}
        initialPhase={phase}
        initialBeforeDate={beforeDate}
        initialReleaseId={params.releaseId}
        sampleSize={researchData.total_eligible_players}
        lastIncludedDate={researchData.context?.last_included_date}
      />

      <div className="workbench-content">
        <PlayerShowcaseView
          initialPlayers={researchData.items}
          season={season}
          phase={phase}
          beforeDate={beforeDate}
          releaseId={params.releaseId}
        />
      </div>
    </>
  );
}
