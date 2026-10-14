"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useRecentSearches } from "@/lib/recent-searches";
import type { PlayerResearchItem } from "@/lib/types";
import { CompareIdentityCard } from "./compare-identity-card";
import { CompareLayout } from "./ui/page-shell";
import type { ReactNode } from "react";
import { Button } from "./ui/kit";

export function CompareSuggestions({ leaders, selector, scope }: { leaders: PlayerResearchItem[]; selector: ReactNode; scope: {season:string;phase:string;before_date:string;release_id?:string;window:string} }) {
  const params = useSearchParams(), router = useRouter();
  const recents = useRecentSearches().filter(item => item.kind === "player");
  function select(ids: string[]) {
    if (ids.length < 2) return;
    const next = new URLSearchParams(params.toString());next.set("playerA", ids[0]);next.set("playerB", ids[1]);next.delete("players");
    for (const [key,value] of Object.entries({season:scope.season,phase:scope.phase,beforeDate:scope.before_date,releaseId:scope.release_id,window:scope.window})) if (value && !next.get(key)) next.set(key,value);
    router.push(`/compare?${next}`);
  }
  return <CompareLayout sidePanels={false} className="pc04-compare" sides={[<CompareIdentityCard key="a" side="a" />, <CompareIdentityCard key="b" side="b" />]}>
    <section className="pc04-suggestions" aria-label="Suggested matchups"><h2>Suggested Matchups</h2>
      <Button size="lg" disabled={leaders.length < 2} onClick={() => select(leaders.map(player => player.player_id))}>Top 2 by minutes</Button>
      <Button size="lg" disabled title="Requires observed position metadata for this scope">Position leaders</Button>
      <Button size="lg" disabled={recents.length < 2} onClick={() => select(recents.map(item => item.canonical_id))}>Recently viewed</Button>
      <p className="chart-provenance">{leaders.length >= 2 ? `${leaders[0].player_name} · ${leaders[1].player_name} · ${leaders[0].games_played} / ${leaders[1].games_played} GP · Source: published box scores` : "No observed minutes leaders in this scope."} · Position metadata pending; recently viewed uses your local selections.</p>
    </section>
    {selector}
  </CompareLayout>;
}
