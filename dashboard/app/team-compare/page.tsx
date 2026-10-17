import type { Metadata } from "next";
import { PageShell } from "@/components/ui/page-shell";
import { getWorkbenchCatalog, getTeamDetail, getTeamFourFactors, getTeamSchedule, executeWorkbenchQuery } from "@/lib/workbench-api";
import { TeamComparisonPrototype, type DraftSide } from "./team-comparison-prototype";
import starterSnapshot from "./starter-evidence.bf09e1d964030a116b25996df57e53b051f5f45500e0343781a9d7784bc3d563.json";

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
  const load = async (key: "A" | "B"): Promise<DraftSide> => {
    const requestedSeason = sp[`season${key}`] ?? sp.season;
    const season = typeof requestedSeason === "string" && catalog.seasons.includes(requestedSeason) ? requestedSeason : catalog.default_season;
    const team = sp[`team${key}`];
    const teamId = typeof team === "string" && /^\d+$/.test(team) ? team : key === "A" ? "1610612760" : "1610612738";
    const requestedBefore = sp[`beforeDate${key}`] ?? sp.beforeDate ?? sp.before_date;
    const beforeDate = typeof requestedBefore === "string" && /^\d{4}-\d{2}-\d{2}$/.test(requestedBefore)
      ? requestedBefore
      : catalog.stats_scopes?.find(scope => scope.season === season && scope.phase === phase)?.default_before_date ?? `${Number(season.slice(0, 4)) + 1}-07-01`;
    const scope = { season, phase, beforeDate, releaseId: catalog.release_id };
    const [detail, factors, schedule, players] = await Promise.all([
      getTeamDetail(teamId, scope).catch(() => null),
      getTeamFourFactors(teamId, scope).catch(() => null),
      getTeamSchedule(teamId, scope).catch(() => null),
      executeWorkbenchQuery({ release_id: catalog.release_id, season, phase, before_date: beforeDate, window: { kind: "season" },
        team_scope: { team_id: teamId, participation_only: true },
        metric_selectors: [{ key: "dpm" }, { key: "o_dpm" }, { key: "d_dpm" }, { key: "pts_per_game" }, { key: "min_per_game" }],
        sort: [{ field: "dpm", direction: "desc" }], page: { limit: 100 } }).catch(() => null),
    ]);
    const observed = starterSnapshot.release_id === catalog.release_id && starterSnapshot.dataset_id === catalog.dataset_id
      ? starterSnapshot.scopes.find(scope => scope.team === detail?.team.tricode && scope.season === season && scope.phase === phase && scope.before_date === beforeDate) : null;
    const starterEvidence = observed && observed.unit_players.every(player => players?.items.some(item => item.player_id === player.player_id)) ? observed : null;
    return { teamId, season, beforeDate, detail, factors, schedule, players, starterEvidence };
  };
  const [a, b] = await Promise.all([load("A"), load("B")]);
  return <PageShell template="compare"><TeamComparisonPrototype a={a} b={b} catalog={catalog} phase={phase} /></PageShell>;
}
