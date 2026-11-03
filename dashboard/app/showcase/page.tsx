import type { Metadata } from "next";
import { PlayerShowcaseView, type ShowcaseBoard } from "@/components/player-showcase-view";
import { EmptyState } from "@/components/ui/empty-state";
import { executeWorkbenchQuery, getDraftClasses, getWorkbenchCatalog } from "@/lib/workbench-api";
import { COMPARE_DEPTH, previousSeason, readShowcaseState, showcaseQuery } from "@/lib/showcase";
import type { WorkbenchCatalog } from "@/lib/types";
import { ButtonLink } from "@/components/ui/kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Player Showcase"
};

interface ShowcasePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ShowcasePage({ searchParams }: ShowcasePageProps) {
  const params = await searchParams;
  const releaseId = typeof params.releaseId === "string" ? params.releaseId : undefined;

  let catalog: WorkbenchCatalog | null = null;
  try {
    catalog = await getWorkbenchCatalog(releaseId);
  } catch {
    catalog = null;
  }
  const state = readShowcaseState(params, catalog);

  let board: ShowcaseBoard | null = null;
  let previous: ShowcaseBoard["players"] | null = null;
  let draftClasses: { year: number; players: number }[] = [];
  if (catalog) {
    const { query, presentation } = showcaseQuery(catalog, state);
    const prior = previousSeason(catalog.seasons ?? [], state.season);
    // The previous season's leaders (same filters, top COMPARE_DEPTH) give each card its rank change.
    const before = prior ? showcaseQuery(catalog, state, prior, COMPARE_DEPTH) : null;
    const [current, earlier, classes] = await Promise.allSettled([
      executeWorkbenchQuery(query, presentation),
      before ? executeWorkbenchQuery(before.query, before.presentation) : Promise.resolve(null),
      getDraftClasses(),
    ]);
    if (current.status === "fulfilled") {
      board = {
        season: query.season, phase: query.phase, beforeDate: query.before_date ?? null,
        players: current.value.items, eligible: current.value.total_eligible_players, hasMore: current.value.has_more,
      };
    }
    if (earlier.status === "fulfilled" && earlier.value) previous = earlier.value.items;
    if (classes.status === "fulfilled") draftClasses = classes.value.classes;
  }

  if (!catalog || !board) {
    return (
      <div className="ui-page ui-page-board">
        <EmptyState
          icon="alert"
          title="The Player Showcase could not load."
          description="The Stats service did not answer for this season. Try again, or open Stats."
          action={<ButtonLink size="sm" href="/stats">Open Stats</ButtonLink>}
        />
      </div>
    );
  }

  return <PlayerShowcaseView catalog={catalog} state={state} board={board} previous={previous} draftClasses={draftClasses} />;
}
