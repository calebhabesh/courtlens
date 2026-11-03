import { Suspense } from "react";
import type { Metadata } from "next";
import branding from "@/lib/team-branding.json";
import { ContractsView } from "@/components/contracts-view";
import { StatsWorkspace } from "@/components/stats-workspace";
import { PageShell } from "@/components/ui/page-shell";

export const metadata: Metadata = { title: "Contracts · CourtLens" };
export const dynamic = "force-dynamic";

/** Contracts (alignment row 14): the team's book, with its roster in the Stats table under Overview. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  // The roster's Stats table reads its own keys and keeps Contracts' (team, year, tab, split) in its URLs.
  const raw = await searchParams;
  const code = typeof raw.team === "string" ? raw.team.toUpperCase() : null;
  const team = code ? branding.teams.find(entry => entry.tricode === code) : undefined;
  const overview = raw.tab !== "small-big";
  const stats = team && overview
    ? <StatsWorkspace params={raw} basePath="/contracts"
        team={{ id: team.team_id, header: <h2 className="ctr-section-title">Roster Stats</h2> }} />
    : null;
  return <PageShell template="explorer" className="ctr-shell">
    <Suspense fallback={null}><ContractsView statsTable={stats} /></Suspense>
  </PageShell>;
}
