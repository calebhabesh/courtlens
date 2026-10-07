"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { AssistantPageContext } from "./assistant-v2.generated";

type DisplayedPage = { context: AssistantPageContext; label: string };
const PageContext = createContext<{ page: DisplayedPage | null; setPage: (page: DisplayedPage | null) => void }>({ page: null, setPage: () => {} });

export function AssistantPageProvider({ children }: { children: React.ReactNode }) {
  const [page, setPage] = useState<DisplayedPage | null>(null);
  return <PageContext.Provider value={{ page, setPage }}>{children}</PageContext.Provider>;
}

/** Register resolved, rendered entities, rather than guessing catalog defaults in the header. */
export function AssistantPageSelection({ route, playerIds = [], teamIds = [], scope, label }: { route: string; label: string; playerIds?: string[]; teamIds?: string[]; scope: Record<string, unknown> }) {
  const { setPage } = useContext(PageContext);
  const serialized = JSON.stringify({ route, player_ids: playerIds, team_ids: teamIds, selections: {
    release_id: scope.release_id, season: scope.season, phase: scope.phase,
    before_date: scope.before_date, window: scope.window ?? "season",
  } });
  useEffect(() => {
    setPage({ context: JSON.parse(serialized) as AssistantPageContext, label });
    return () => setPage(null);
  }, [serialized, label, setPage]);
  return null;
}

export function useAssistantPage() {
  const { page } = useContext(PageContext);
  const pathname = usePathname();
  return page?.context.route === pathname ? page : null;
}

export function pageContextLabel(page: AssistantPageContext, label = "This page"): string {
  return `${label} · ${page.selections.season} · ${page.selections.phase?.replaceAll("_", " ")}`;
}
