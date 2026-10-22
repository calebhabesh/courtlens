import type { Metadata } from "next";
import { PageShell } from "@/components/ui/page-shell";
import { getWorkbenchCatalog, getTeamDetail, getTeamFourFactors, getTeamSchedule, executeWorkbenchQuery, getTeamStarters } from "@/lib/workbench-api";
import { TeamComparison, type TeamSide } from "./team-comparison";
import { foldedTeams, franchiseOf, seasonTeamId } from "@/lib/team-era";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Team Comparison · CourtLens",
  description: "Side-by-side team rotations, verified starting lineups, team stats, and season series game history.",
};

export default async function TeamComparePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const requestedReleaseId = typeof sp.releaseId === "string" ? sp.releaseId : typeof sp.release_id === "string" ? sp.release_id : undefined;
  const catalog = await getWorkbenchCatalog(requestedReleaseId);
  const phase = sp.phase === "playoffs" ? "playoffs" : "regular_season";
  const load = async (key: "A" | "B"): Promise<TeamSide> => {
    const requestedSeason = sp[`season${key}`] ?? sp.season;
    const season = typeof requestedSeason === "string" && catalog.seasons.includes(requestedSeason) ? requestedSeason : catalog.default_season;
    // URLs carry franchise ids or era codes (Teams links for 2000-01 pass SEA). The franchise stays
    // the selection; that season's stored id (SEA for the Thunder) drives every read.
    const team = sp[`team${key}`];
    // A folded team (CHS) has no franchise: its code is its id.
    const teamId = (typeof team === "string" && (franchiseOf(team) ?? (/^\d+$/.test(team) || foldedTeams(typeof requestedSeason === "string" ? requestedSeason : "").some(era => era.code === team) ? team : null))) || (key === "A" ? "1610612760" : "1610612738");
    const dataTeamId = seasonTeamId(teamId, season);
    const requestedBefore = sp[`beforeDate${key}`] ?? sp.beforeDate ?? sp.before_date;
    const beforeDate = typeof requestedBefore === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requestedBefore)
      ? requestedBefore
      : catalog.stats_scopes?.find(scope => scope.season === season && scope.phase === phase)?.default_before_date ?? `${Number(season.slice(0, 4)) + 1}-07-01`;
    const scope = { season, phase, beforeDate, releaseId: catalog.release_id };
    const [detail, factors, schedule, players, observed] = await Promise.all([
      getTeamDetail(dataTeamId, scope).catch(() => null),
      getTeamFourFactors(dataTeamId, scope).catch(() => null),
      getTeamSchedule(dataTeamId, scope).catch(() => null),
      executeWorkbenchQuery({ release_id: catalog.release_id, season, phase, before_date: beforeDate, window: { kind: "season" },
        team_scope: { team_id: dataTeamId, participation_only: true },
        metric_selectors: [{ key: "dpm" }, { key: "o_dpm" }, { key: "d_dpm" }, { key: "pts_per_game" }, { key: "min_per_game" }],
        sort: [{ field: "dpm", direction: "desc" }], page: { limit: 100 } }).catch(() => null),
      // Read live against this release, so a new publication never switches By Position off.
      getTeamStarters(dataTeamId, scope).catch(() => null),
    ]);
    const starterEvidence = observed && observed.unit_players.every(player => players?.items.some(item => item.player_id === player.player_id)) ? observed : null;
    return { teamId, dataTeamId, season, beforeDate, detail, factors, schedule, players, starterEvidence };
  };
  const [a, b] = await Promise.all([load("A"), load("B")]);
  return <PageShell template="compare"><TeamComparison a={a} b={b} catalog={catalog} phase={phase} /></PageShell>;
}
