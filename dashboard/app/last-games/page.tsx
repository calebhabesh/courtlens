import type { Metadata } from "next";
import Link from "next/link";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { RecentGamesView } from "@/components/recent-games-view";
import { getPlayerGameLog, getPlayerProfile, getWorkbenchCatalog } from "@/lib/workbench-api";
import type { PlayerGameLogResponse, PlayerProfile, WorkbenchCatalog } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Recent Games"
};

interface LastGamesPageProps {
  searchParams: Promise<{
    playerId?: string;
    id?: string;
    season?: string;
    phase?: string;
    beforeDate?: string;
    window?: string;
    releaseId?: string;
    [key: string]: string | string[] | undefined;
  }>;
}

export default async function LastGamesPage({ searchParams }: LastGamesPageProps) {
  const params = await searchParams;

  let catalog: WorkbenchCatalog | null = null;
  try {
    catalog = await getWorkbenchCatalog(params.releaseId);
  } catch {
    // Graceful fallback if catalog fetch fails
  }

  const season = params.season || catalog?.default_season || "2024-25";
  const phase = params.phase || catalog?.default_phase || "regular_season";
  const beforeDate = params.beforeDate || catalog?.default_before_date || "2026-06-30";
  const playerId = params.playerId || params.id || "1628389"; // Default to Bam Adebayo

  let profile: PlayerProfile | null = null;
  let gameLog: PlayerGameLogResponse | null = null;
  let loadError: string | null = null;

  try {
    const [p, l] = await Promise.all([
      getPlayerProfile(playerId, {
        season,
        phase,
        beforeDate,
        releaseId: params.releaseId
      }),
      getPlayerGameLog(playerId, {
        season,
        phase,
        beforeDate,
        releaseId: params.releaseId,
        limit: 50
      })
    ]);
    profile = p;
    gameLog = l;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load player game log";
  }

  if (!profile || !gameLog) {
    return (
      <PageShell template="profile">
        <PageHeader title="Recent Games" />
        <div className="empty-state tall" role="alert">
          <span className="empty-code">RECENT GAMES</span>
          <h2>Player not found in this snapshot</h2>
          <p>{loadError ?? `Could not find confirmed appearances for player ID ${playerId}.`}</p>
          <div className="empty-state-actions">
            <Link className="button button-dark" href="/players">
              Browse Players Directory
            </Link>
            <Link className="button button-small" href={`/last-games?playerId=1628389&season=${season}&phase=${phase}`}>
              View Featured (Bam Adebayo)
            </Link>
          </div>
        </div>
      </PageShell>
    );
  }

  return (
    <RecentGamesView
      initialProfile={profile}
      initialGames={gameLog.games}
    />
  );
}
