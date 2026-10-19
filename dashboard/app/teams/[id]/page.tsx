import type { Metadata } from "next";
import { AssistantPageSelection } from "@/lib/assistant-page-context";
import { resolveStatsQuery } from "@/lib/stats-query";
import { franchiseOf, seasonTeamId, teamArtwork } from "@/lib/team-era";
import { getTeamDetail, getTeamPeers, getTeamSchedule, getTeamsSixFactors, getWorkbenchCatalog } from "@/lib/workbench-api";
import { ALL_COLUMNS, columnRanks, withStandings } from "@/lib/team-six-factors";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { GatedNote } from "@/components/ui/gated-note";
import { ButtonLink } from "@/components/ui/kit";
import { StatsWorkspace } from "@/components/stats-workspace";
import { TeamDepthSection, TeamGameLogSection, TeamPeersSection, TeamProfileHeader, TeamSixFactorsSection, TeamStandingSection, TeamTrendSection, TeamVenueSection } from "@/components/team-profile";

export const metadata: Metadata = { title: "Team Profile · CourtLens" };
export const dynamic = "force-dynamic";

/**
 * Team profile (alignment row 4): the season's logo and era name over the Stats table fixed to the
 * team, then its standing, six factors, home/away split, trend, game log and similar teams.
 */
export default async function TeamDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, raw] = await Promise.all([params, searchParams]);
  const sp = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  const catalog = await getWorkbenchCatalog(sp.releaseId || sp.release_id).catch(() => null);
  const query = catalog ? resolveStatsQuery(sp, catalog, "per_game") : null;
  const season = query?.season || sp.season || "";
  const phase = query?.phase || sp.phase || "regular_season";
  const beforeDate = query?.before_date || sp.beforeDate || sp.before_date || "";
  const releaseId = query?.release_id || sp.releaseId || sp.release_id;
  // Links carry franchise ids or era codes; the season's stored id (SEA for the 2000-01 Thunder) drives every read.
  const dataTeamId = seasonTeamId(franchiseOf(id) ?? id, season);
  const scope = { season, phase, beforeDate, releaseId };
  const [detail, schedule, peers, factors, home, away] = await Promise.all([
    getTeamDetail(dataTeamId, scope).catch((error: unknown) => error instanceof Error ? error : new Error("Failed to load team details")),
    getTeamSchedule(dataTeamId, scope).catch(() => null),
    getTeamPeers(dataTeamId, { ...scope, limit: 6 }).catch(() => null),
    getTeamsSixFactors(scope).catch(() => null),
    getTeamsSixFactors({ ...scope, venue: "home" }).catch(() => null),
    getTeamsSixFactors({ ...scope, venue: "away" }).catch(() => null),
  ]);
  if (detail instanceof Error) return <PageShell template="profile"><PageHeader title="Team Profile" />
    <GatedNote why={detail.message || "Team not found in this release."} action={<ButtonLink size="lg" href="/teams">Return to All Teams</ButtonLink>}>Team details are unavailable.</GatedNote></PageShell>;

  const { team } = detail;
  const artwork = teamArtwork(team.tricode, season);
  const name = artwork?.artwork_name ?? team.name;
  const found = factors?.teams.find(entry => entry.tricode === team.tricode || entry.team_id === team.id);
  // Seed and games back within the team's conference.
  const factorTeam = found && factors ? withStandings(factors.teams.filter(entry => entry.conference === found.conference)).find(entry => entry.team_id === found.team_id) ?? found : null;
  const netRank = factors && factorTeam ? columnRanks(factors.teams, ALL_COLUMNS.find(entry => entry.key === "net")!, "per_100").get(factorTeam.team_id) : undefined;
  const scopeParams = new URLSearchParams({ season, phase, ...(beforeDate ? { beforeDate } : {}), ...(releaseId ? { releaseId } : {}) }).toString();
  const header = <TeamProfileHeader name={name} tricode={team.tricode} season={season} phaseLabel={phase === "playoffs" ? "Playoffs" : "Regular Season"}
    team={factorTeam} netRank={netRank} compareHref={`/team-compare?teamA=${franchiseOf(id) ?? id}&season=${season}&phase=${phase}`} teamsHref={`/teams?season=${season}${phase === "playoffs" ? "&phase=playoffs" : ""}`} />;

  return <PageShell template="profile" className="team-profile-page">
    <AssistantPageSelection route={`/teams/${team.id}`} teamIds={[team.id]} scope={detail.context} label={name} />
    <StatsWorkspace params={raw} basePath={`/teams/${id}`} team={{ id: dataTeamId, header }} />
    <div className="team-profile-sections">
      {factors && factorTeam && <TeamStandingSection data={factors} team={factorTeam} />}
      {factors && factorTeam && <TeamSixFactorsSection data={factors} team={factorTeam} />}
      {factors && factorTeam && <TeamVenueSection all={factors} home={home} away={away} team={factorTeam} />}
      {factorTeam && <TeamTrendSection team={factorTeam} />}
      {schedule && <TeamGameLogSection games={schedule.games} season={season} scopeParams={scopeParams} />}
      <TeamDepthSection catalog={catalog} teamId={dataTeamId} scope={{ releaseId, season, phase, beforeDate: beforeDate || undefined }} />
      {peers && <TeamPeersSection peers={peers} season={season} scopeParams={scopeParams} />}
    </div>
  </PageShell>;
}
