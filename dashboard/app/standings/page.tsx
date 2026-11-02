import type { Metadata } from "next";
import { PageShell } from "@/components/ui/page-shell";
import { StandingsView } from "@/components/standings-view";
import { currentSeason, standingsSeasons, STANDINGS_GROUPS, type StandingsGroup } from "@/lib/standings";

export const metadata: Metadata = {
  title: "Standings · Teams",
  description: "ESPN's NBA standings by league, conference and division, with home, away, division, conference, scoring and streak records.",
};

export const dynamic = "force-dynamic";

/** ESPN's NBA Standings (alignment row 23), read on demand through the Live cache. */
export default async function StandingsPage({ searchParams }: { searchParams: Promise<{ season?: string; group?: string }> }) {
  const params = await searchParams;
  const current = currentSeason();
  const season = params.season && standingsSeasons(current).includes(params.season) ? params.season : current;
  const group: StandingsGroup = STANDINGS_GROUPS.some(g => g.value === params.group) ? params.group as StandingsGroup : "conference";
  return <PageShell template="explorer" className="standings-page">
    <StandingsView season={season} current={current} group={group} />
  </PageShell>;
}
