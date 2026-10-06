import { resolveStatsQuery } from "@/lib/stats-query";
import { getWorkbenchCatalog } from "@/lib/workbench-api";
import type { Metadata } from "next";
import { ContextBar } from "@/components/context-bar";
import { TeamCompareView } from "@/components/team-compare-view";
import {
  getTeamsResearch,
  getTeamDetail,
  getTeamFourFactors,
  getTeamSchedule,
  getTeamPeers,
} from "@/lib/workbench-api";
import type {
  TeamDetailResponse,
  TeamFourFactorsResponse,
  TeamScheduleResponse,
  TeamPeersResponse,
  TeamResearchResponse,
} from "@/lib/types";

export const metadata: Metadata = {
  title: "Team Comparison & Four Factors Analysis · CourtLoad",
  description:
    "Head-to-head records, Dean Oliver Four Factors comparison, Feature F18 three-point variation modeling, and rotation participation cohorts.",
};
export const dynamic = "force-dynamic";

interface TeamComparePageProps {
  searchParams: Promise<{
    teamA?: string;
    teamB?: string;
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
    release_id?: string;
    before_date?: string;
  }>;
}

export default async function TeamComparePage({ searchParams }: TeamComparePageProps) {
  const sp = await searchParams;
  const catalog = await getWorkbenchCatalog(sp.releaseId || sp.release_id).catch(() => null);
  const query = catalog ? resolveStatsQuery(sp, catalog, "per_game") : null;
  const season = query?.season || sp.season || "";
  const phase = query?.phase || sp.phase || "";
  const beforeDate = query?.before_date || sp.beforeDate || sp.before_date || "";
  const resolvedReleaseId = query?.release_id || sp.releaseId || sp.release_id;
  const releaseId = resolvedReleaseId;

  // Default to Boston Celtics (1610612738) and Dallas Mavericks (1610612742)
  const teamAId = sp.teamA || "1610612738";
  const teamBId = sp.teamB || "1610612742";

  let teamsData: TeamResearchResponse | null = null;
  let teamADetail: TeamDetailResponse | null = null;
  let teamAFourFactors: TeamFourFactorsResponse | null = null;
  let teamASchedule: TeamScheduleResponse | null = null;
  let teamAPeers: TeamPeersResponse | null = null;

  let teamBDetail: TeamDetailResponse | null = null;
  let teamBFourFactors: TeamFourFactorsResponse | null = null;
  let teamBSchedule: TeamScheduleResponse | null = null;
  let teamBPeers: TeamPeersResponse | null = null;

  let loadError: string | null = null;

  try {
    const [
      teamsRes,
      detailARes,
      ffARes,
      schedARes,
      peersARes,
      detailBRes,
      ffBRes,
      schedBRes,
      peersBRes,
    ] = await Promise.allSettled([
      getTeamsResearch({ season, phase, beforeDate, releaseId }),
      getTeamDetail(teamAId, { season, phase, beforeDate, releaseId }),
      getTeamFourFactors(teamAId, { season, phase, beforeDate, releaseId }),
      getTeamSchedule(teamAId, { season, phase, beforeDate, releaseId }),
      getTeamPeers(teamAId, { season, phase, beforeDate, releaseId, limit: 5 }),
      getTeamDetail(teamBId, { season, phase, beforeDate, releaseId }),
      getTeamFourFactors(teamBId, { season, phase, beforeDate, releaseId }),
      getTeamSchedule(teamBId, { season, phase, beforeDate, releaseId }),
      getTeamPeers(teamBId, { season, phase, beforeDate, releaseId, limit: 5 }),
    ]);

    if (teamsRes.status === "fulfilled") teamsData = teamsRes.value;
    if (detailARes.status === "fulfilled") teamADetail = detailARes.value;
    if (ffARes.status === "fulfilled") teamAFourFactors = ffARes.value;
    if (schedARes.status === "fulfilled") teamASchedule = schedARes.value;
    if (peersARes.status === "fulfilled") teamAPeers = peersARes.value;

    if (detailBRes.status === "fulfilled") teamBDetail = detailBRes.value;
    if (ffBRes.status === "fulfilled") teamBFourFactors = ffBRes.value;
    if (schedBRes.status === "fulfilled") teamBSchedule = schedBRes.value;
    if (peersBRes.status === "fulfilled") teamBPeers = peersBRes.value;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load comparison data";
  }

  return (
    <>
      <ContextBar
        catalog={catalog ?? undefined}
        initialReleaseId={resolvedReleaseId}
        sampleNoun="teams"
        initialSeason={season}
        initialPhase={phase}
        initialBeforeDate={beforeDate}
        sampleSize={teamsData?.teams?.length}
      />

      <div className="workbench-content">
        <div className="page-header" style={{ marginBottom: "1rem" }}>
          <div>
            <h1 className="page-title">Team Comparison & Four Factors Analysis</h1>
            <p className="page-subtitle">
              Head-to-head encounters, Dean Oliver Four Factors, Feature F18 3-point variation scenario, and rotation participation cohorts for {season} {phase.replaceAll("_", " ")}.
            </p>
          </div>
        </div>

        {loadError && (
          <div className="notice-box" style={{ borderLeftColor: "var(--negative)", marginBottom: "1rem" }}>
            <strong>Error:</strong> {loadError}
          </div>
        )}

        <TeamCompareView
          teamsList={teamsData?.teams ?? []}
          teamAId={teamAId}
          teamBId={teamBId}
          teamADetail={teamADetail}
          teamAFourFactors={teamAFourFactors}
          teamASchedule={teamASchedule}
          teamAPeers={teamAPeers}
          teamBDetail={teamBDetail}
          teamBFourFactors={teamBFourFactors}
          teamBSchedule={teamBSchedule}
          teamBPeers={teamBPeers}
          season={season}
          phase={phase}
          beforeDate={beforeDate}
        />
      </div>
    </>
  );
}
