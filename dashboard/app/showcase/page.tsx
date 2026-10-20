import type { Metadata } from "next";
import { PlayerShowcaseView } from "@/components/player-showcase-view";
import { EmptyState } from "@/components/ui/empty-state";
import { resolveStatsQuery } from "@/lib/stats-query";
import { executeWorkbenchQuery, getWorkbenchCatalog } from "@/lib/workbench-api";
import type { GoodDirection } from "@/lib/percentile-display";
import type { PlayerResearchItem, WorkbenchCatalog, WorkbenchQueryResponse } from "@/lib/types";
import { ButtonLink } from "@/components/ui/kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Showcase"
};

const ROSTER_SIZE = 25;

interface ShowcasePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ShowcasePage({ searchParams }: ShowcasePageProps) {
  const params = await searchParams;
  const releaseId = typeof params.releaseId === "string" ? params.releaseId : undefined;
  const requested = typeof params.playerId === "string" ? params.playerId : typeof params.id === "string" ? params.id : undefined;

  let catalog: WorkbenchCatalog | null = null;
  try {
    catalog = await getWorkbenchCatalog(releaseId);
  } catch {
    catalog = null;
  }

  let result: WorkbenchQueryResponse | null = null;
  let players: PlayerResearchItem[] = [];
  let query = null;
  if (catalog) {
    // Same scope resolution, eligibility and cohort percentiles as Stats (D16: no new formula).
    query = resolveStatsQuery(params, catalog, "per_game");
    // Season-to-date cards; the Window control is hidden on this page (D6), so a window inherited
    // from another page's URL must not silently change the cohort.
    query.window = { kind: "season" };
    query.sort = [{ field: "pts_per_game", direction: "desc", nulls_last: true }];
    query.page = { limit: ROSTER_SIZE };
    try {
      result = await executeWorkbenchQuery(query, { player_ids: null });
      players = result.items;
      if (requested && !players.some((player) => player.player_id === requested)) {
        // A searched player outside the top 25 joins the roster; the cohort is unchanged.
        const single = await executeWorkbenchQuery({ ...query, page: { limit: 1 } }, { player_ids: [requested] });
        players = [...single.items, ...players];
      }
    } catch {
      result = null;
    }
  }

  if (!query || !result || players.length === 0) {
    return (
      <div className="ui-page ui-page-board">
        <EmptyState
          icon="alert"
          title="No players to showcase for this scope."
          description="Try another season or phase in Stats."
          action={<ButtonLink size="sm" href="/stats">Open Stats</ButtonLink>}
        />
      </div>
    );
  }

  const initialIndex = Math.max(0, players.findIndex((player) => player.player_id === requested));
  const context = result.context as { last_included_date?: string | null };

  return (
    <PlayerShowcaseView
      players={players}
      initialIndex={initialIndex}
      query={query}
      catalog={catalog}
      eligiblePlayers={result.cohort?.eligible_players ?? result.total_eligible_players}
      goodDirections={(result.cohort?.good_directions ?? {}) as Record<string, GoodDirection>}
      lastIncludedDate={context.last_included_date ?? null}
    />
  );
}
