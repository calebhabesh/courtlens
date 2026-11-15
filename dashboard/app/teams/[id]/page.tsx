import type { Metadata } from "next";
import { AssistantPageSelection } from "@/lib/assistant-page-context";
import { resolveStatsQuery } from "@/lib/stats-query";
import { franchiseOf, seasonTeamId, teamArtwork } from "@/lib/team-era";
import { redirect } from "next/navigation";
import TeamNotFound from "./not-found";
import { teamHref } from "@/lib/entity-links";
import { askedNote, resolveTeamScope, rewrittenUrl, teamSeasons } from "@/lib/link-scope";
import { ScopeFallbackNote } from "@/components/scope-fallback-note";
import { RelatedRow } from "@/components/related-row";
import { availableRelated, teamRelated } from "@/lib/related-links";
import { WorkbenchApiError, getDraftClasses, getMetricCatalog, getTeamDetail, getTeamPeers, getTeamSchedule, getTeamsSixFactors, getWorkbenchCatalog } from "@/lib/workbench-api";
import { getWorkspace } from "@/lib/workspace-client";
import { ALL_COLUMNS, columnRanks, standingGroup, withStandings } from "@/lib/team-six-factors";
import { FIRST_GAME_LOG_SEASON, isTotalsSeason } from "@/lib/season-basis";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { GatedNote } from "@/components/ui/gated-note";
import { ButtonLink } from "@/components/ui/kit";
import { StatsWorkspace, preloadStatsWorkspace } from "@/components/stats-workspace";
import { TeamDivisionStandings } from "@/components/team-division-standings";
import { TeamScheduleSection } from "@/components/team-schedule";
import { TeamDepthSection, TeamGameLogSection, TeamPeersSection, TeamProfileHeader, TeamRankStrip, TeamSixFactorsSection, TeamStandingSection, TeamTrendSection, TeamVenueSection } from "@/components/team-profile";

export const metadata: Metadata = { title: "Team Profile · CourtLens" };
export const dynamic = "force-dynamic";

/**
 * Team profile (alignment row 4): the season's logo and era name with its league ranks, over the
 * Stats table fixed to the team, then its standing, six factors, home/away split, trend, game log
 * and similar teams.
 */
export default async function TeamDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, raw] = await Promise.all([params, searchParams]);
  const sp = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]));
  // Two waves (speed plan SP04): the catalog, with the roster table's reads that need nothing
  // from it; then the team reads and the roster table's query together.
  const catalogRequest = getWorkbenchCatalog(sp.releaseId || sp.release_id);
  for (const early of [getWorkspace(), getDraftClasses(), getMetricCatalog()]) void early.catch(() => undefined);
  const catalog = await catalogRequest.catch(() => null);
  const query = catalog ? resolveStatsQuery(sp, catalog, "per_game") : null;
  const season = query?.season || sp.season || "";
  const phase = query?.phase || sp.phase || "regular_season";
  const beforeDate = query?.before_date || sp.beforeDate || sp.before_date || "";
  const releaseId = query?.release_id || sp.releaseId || sp.release_id;
  const franchise = franchiseOf(id);
  // A link names the season it was shown in; a franchise with no team then (New Orleans before
  // 2002-03, a folded team after it folded) opens the closest season it played and says so once.
  const releaseSeasons = [...new Set((catalog?.stats_scopes ?? []).map(entry => entry.season))];
  const pathname = teamHref(id);
  if (sp.season && season && releaseSeasons.length) {
    const asked = { season, phase };
    const shown = resolveTeamScope(asked, teamSeasons(franchise ?? id.toUpperCase(), releaseSeasons));
    if (shown) redirect(rewrittenUrl(pathname, sp, asked, shown));
  }
  // Links carry franchise ids or era codes; the season's stored id (SEA for the 2000-01 Thunder) drives every read.
  const dataTeamId = seasonTeamId(franchise ?? id, season);
  const scope = { season, phase, beforeDate, releaseId };
  preloadStatsWorkspace(raw, pathname, dataTeamId);
  const [detail, schedule, peers, factors, home, away] = await Promise.all([
    getTeamDetail(dataTeamId, scope).catch((error: unknown) => error instanceof Error ? error : new Error("Failed to load team details")),
    getTeamSchedule(dataTeamId, scope).catch(() => null),
    getTeamPeers(dataTeamId, { ...scope, limit: 6 }).catch(() => null),
    getTeamsSixFactors(scope).catch(() => null),
    getTeamsSixFactors({ ...scope, venue: "home" }).catch(() => null),
    getTeamsSixFactors({ ...scope, venue: "away" }).catch(() => null),
  ]);
  // An id the release does not know reaches the not-found page (site links SL02). The API decides:
  // a release may hold team ids the branding catalog does not list.
  // Rendered directly: `notFound()` inside this streamed route leaves a stale hidden staging copy.
  if (detail instanceof WorkbenchApiError && detail.status === 404) return <TeamNotFound />;
  if (detail instanceof Error) return <PageShell template="profile"><PageHeader title="Team Profile" />
    <GatedNote why={detail.message || "Team not found in this release."} action={<ButtonLink size="lg" href="/teams">Return to All Teams</ButtonLink>}>Team details are unavailable.</GatedNote></PageShell>;

  const { team } = detail;
  const artwork = teamArtwork(team.tricode, season);
  const name = artwork?.artwork_name ?? team.name;
  const found = factors?.teams.find(entry => entry.tricode === team.tricode || entry.team_id === team.id);
  // Playoffs the team missed open its regular season (the playoff table lists every team that played).
  if (sp.season && phase === "playoffs" && factors && !found) {
    const asked = { season, phase };
    const shown = resolveTeamScope(asked, [season], false);
    if (shown) redirect(rewrittenUrl(pathname, sp, asked, shown));
  }
  // Seed and games back within the team's conference (its division before 1970-71).
  const group = found ? standingGroup(found)?.key : undefined;
  const factorTeam = found && factors ? withStandings(factors.teams.filter(entry => standingGroup(entry)?.key === group)).find(entry => entry.team_id === found.team_id) ?? found : null;
  // Before the game logs a season is whole-season totals: no games, so no trend or game log.
  const totals = isTotalsSeason(catalog, season);
  const netRank = factors && factorTeam ? columnRanks(factors.teams, ALL_COLUMNS.find(entry => entry.key === "net")!, "per_100").get(factorTeam.team_id) : undefined;
  const scopeParams = new URLSearchParams({ season, phase, ...(beforeDate ? { beforeDate } : {}), ...(releaseId ? { releaseId } : {}) }).toString();
  const header = <TeamProfileHeader name={name} tricode={team.tricode} season={season} phaseLabel={phase === "playoffs" ? "Playoffs" : "Regular Season"}
    team={factorTeam} netRank={netRank} compareHref={`/team-compare?teamA=${franchiseOf(id) ?? id}&season=${season}&phase=${phase}`} teamsHref={`/teams?season=${season}${phase === "playoffs" ? "&phase=playoffs" : ""}`}>
    {factors && found && <TeamRankStrip data={factors} team={found} teamsHref={`/teams?${scopeParams}`} />}
    <ScopeFallbackNote note={askedNote(sp.asked, { season, phase }, name)} />
  </TeamProfileHeader>;

  return <PageShell template="profile" className="team-profile-page">
    <AssistantPageSelection route={teamHref(team.id)} teamIds={[team.id]} scope={detail.context} label={name} />
    <StatsWorkspace params={raw} basePath={pathname} team={{ id: dataTeamId, header }} />
    <div className="team-profile-sections">
      {factors && factorTeam && <TeamStandingSection data={factors} team={factorTeam} season={season} />}
      {phase !== "playoffs" && <TeamDivisionStandings tricode={team.tricode} season={season} />}
      {factors && factorTeam && <TeamSixFactorsSection data={factors} team={factorTeam} />}
      {factors && factorTeam && <TeamVenueSection all={factors} home={home} away={away} team={factorTeam} />}
      {factorTeam && factorTeam.trend.length > 0 && <TeamTrendSection team={factorTeam} />}
      {/* The season calendar (ESPN's schedule) with the admitted Game Log as its other view. */}
      <TeamScheduleSection teamId={dataTeamId} tricode={team.tricode} season={season} phase={phase}
        log={schedule ? <TeamGameLogSection embedded games={schedule.games} season={season} scopeParams={scopeParams} teamId={dataTeamId} tricode={team.tricode}
          empty={totals ? `Game logs start in ${FIRST_GAME_LOG_SEASON}; ${season} has season totals only.` : undefined} /> : <p className="player-open-empty">The game log is unavailable.</p>} />
      <TeamDepthSection catalog={catalog} teamId={dataTeamId} scope={{ releaseId, season, phase, beforeDate: beforeDate || undefined }} initial={detail} />
      {peers && <TeamPeersSection peers={peers} season={season} scopeParams={scopeParams} />}
    </div>
    {/* Site links SL05: the hub's Related row, from data this page already has. */}
    <RelatedRow checked links={availableRelated(teamRelated({ teamId: franchise ?? id, season, phase,
      playoffSeasons: (catalog?.stats_scopes ?? []).filter(entry => entry.phase === "playoffs").map(entry => entry.season) }), catalog)} />
  </PageShell>;
}
