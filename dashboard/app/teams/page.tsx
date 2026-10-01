import type { Metadata } from "next";
import Link from "next/link";
import { ContextBar } from "@/components/context-bar";
import { getTeamsResearch } from "@/lib/workbench-api";
import type { TeamResearchResponse } from "@/lib/types";

export const metadata: Metadata = { title: "Team Research · CourtLoad" };
export const dynamic = "force-dynamic";

interface TeamsPageProps {
  searchParams: Promise<{
    season?: string;
    phase?: string;
    beforeDate?: string;
    releaseId?: string;
  }>;
}

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  const params = await searchParams;
  const season = params.season || "2025-26";
  const phase = params.phase || "regular_season";
  const beforeDate = params.beforeDate || "2026-06-30";

  let teamsData: TeamResearchResponse | null = null;
  let loadError: string | null = null;

  try {
    teamsData = await getTeamsResearch({
      season,
      phase,
      beforeDate,
      releaseId: params.releaseId
    });
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load team research";
  }

  return (
    <>
      <ContextBar
        initialSeason={season}
        initialPhase={phase}
        initialBeforeDate={beforeDate}
        sampleSize={teamsData?.teams?.length}
      />

      <div className="workbench-content">
        <div className="page-header">
          <div>
            <h1 className="page-title">Team Research</h1>
            <p className="page-subtitle">
              Final outcomes, scoring margins, and defensive allowances for all 30 NBA teams across {season} {phase.replace("_", " ")}.
            </p>
          </div>
        </div>

        {/* Official Placement Disclaimer Notice */}
        <div className="notice-box">
          <strong>Official standings notice:</strong> {teamsData?.order_notice || "Ties in record ordering do not establish official conference placement. Standings are presented by win percentage without tiebreaker resolution."}
        </div>

        {loadError && (
          <div className="notice-box" style={{ borderLeftColor: "var(--negative)" }}>
            <strong>Error:</strong> {loadError}
          </div>
        )}

        {teamsData && (
          <div className="table-wrapper">
            <table className="data-table" aria-label="Team research overview">
              <thead>
                <tr>
                  <th style={{ width: "40px" }}>#</th>
                  <th>Team</th>
                  <th className="num">GP</th>
                  <th className="num">W</th>
                  <th className="num">L</th>
                  <th className="num">Win%</th>
                  <th className="num">PPG</th>
                  <th className="num">Opp PPG</th>
                  <th className="num">Net Margin</th>
                  <th className="num">FG%</th>
                  <th className="num">Opp FG%</th>
                  <th className="num">3P%</th>
                  <th className="num">Observed</th>
                  <th className="num">Exclusions</th>
                  <th style={{ textAlign: "right" }}>Cohort</th>
                </tr>
              </thead>
              <tbody>
                {teamsData.teams.map((t, idx) => {
                  const ppg = t.production?.pts_per_game ?? null;
                  const oppPpg = t.allowance?.pts_allowed_per_game ?? null;
                  const netDiff = ppg !== null && oppPpg !== null ? (ppg - oppPpg).toFixed(1) : "—";
                  const netNum = ppg !== null && oppPpg !== null ? ppg - oppPpg : 0;

                  return (
                    <tr key={t.team_id}>
                      <td className="font-mono text-muted text-xs">{idx + 1}</td>
                      <td>
                        <Link
                          href={`/teams/${t.team_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                          className="font-semibold text-accent"
                        >
                          <span className="font-mono" style={{ marginRight: "0.4rem" }}>
                            {t.tricode}
                          </span>
                          {t.name}
                        </Link>
                      </td>
                      <td className="num font-mono">{t.games_played}</td>
                      <td className="num font-mono">{t.wins}</td>
                      <td className="num font-mono">{t.losses}</td>
                      <td className="num font-mono font-semibold">
                        {t.win_pct !== null ? t.win_pct.toFixed(3) : "—"}
                      </td>
                      <td className="num font-mono">{ppg !== null ? ppg.toFixed(1) : "—"}</td>
                      <td className="num font-mono">{oppPpg !== null ? oppPpg.toFixed(1) : "—"}</td>
                      <td className={`num font-mono font-semibold ${netNum > 0 ? "text-positive" : netNum < 0 ? "text-negative" : ""}`}>
                        {netNum > 0 ? `+${netDiff}` : netDiff}
                      </td>
                      <td className="num font-mono">
                        {t.production?.fg_pct !== null && t.production?.fg_pct !== undefined
                          ? `${(t.production.fg_pct * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="num font-mono">
                        {t.allowance?.fg_pct_allowed !== null && t.allowance?.fg_pct_allowed !== undefined
                          ? `${(t.allowance.fg_pct_allowed * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="num font-mono">
                        {t.production?.fg3_pct !== null && t.production?.fg3_pct !== undefined
                          ? `${(t.production.fg3_pct * 100).toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="num font-mono text-muted">{t.observed_games}</td>
                      <td className="num font-mono text-muted">{t.exclusions}</td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          href={`/teams/${t.team_id}?season=${season}&phase=${phase}&beforeDate=${beforeDate}`}
                          className="button button-small button-primary"
                        >
                          Cohort →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
