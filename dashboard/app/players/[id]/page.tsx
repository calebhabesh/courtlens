import type { Metadata } from "next";
import Link from "next/link";
import { TrendChart } from "@/components/trend-chart";
import {
  AnalyticsApiError,
  browserApi,
  getAnalyticsCatalog,
  getAnalyticsGames,
  getAnalyticsProfile
} from "@/lib/api";
import type { AnalyticsGame, AnalyticsProfile, AnalyticsSummary, PlayerGameLogResponse, PlayerProfile } from "@/lib/types";

import { ContextBar } from "@/components/context-bar";
import { WorkbenchPlayerProfile } from "@/components/workbench-player-profile";
import { getPlayerProfile, getPlayerGameLog, getWorkbenchCatalog } from "@/lib/workbench-api";
import { aggregateCareerStats, type SeasonCareerRow } from "@/lib/player-pages";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Player Research Profile" };

export default async function PlayerPage({
  params,
  searchParams
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    date?: string;
    snapshotId?: string;
    season?: string;
    phase?: string;
    beforeDate?: string;
    window?: string;
    releaseId?: string;
  }>;
}) {
  const [{ id }, selected] = await Promise.all([params, searchParams]);
  let legacyData: { profile: AnalyticsProfile; games: AnalyticsGame[]; dates: string[] } | null = null;
  let loadError: unknown = null;

  // If explicitly requested with fixture snapshot or only date without workbench context
  if (selected.snapshotId === "snapshot-browser-fixture" || (selected.date && !selected.season)) {
    try {
      const catalog = await getAnalyticsCatalog(selected.snapshotId);
      const replayDate = selected.date ?? catalog.default_replay_date;
      const profile = await getAnalyticsProfile(id, replayDate, catalog.snapshot_id);
      const log = await getAnalyticsGames(id, replayDate, catalog.snapshot_id, 20);
      legacyData = { profile, games: log.games, dates: catalog.supported_replay_dates };
    } catch (err) {
      loadError = err;
    }

    if (legacyData) {
      return (
        <ProfileView
          profile={legacyData.profile}
          games={legacyData.games}
          catalogDates={legacyData.dates}
        />
      );
    }
    return <PlayerError error={loadError} id={id} date={selected.date} />;
  }

  // Modern Workbench Research Mode
  const catalog = await getWorkbenchCatalog(selected.releaseId).catch(() => null);
  const admittedSeasons = catalog?.seasons || ["2023-24", "2024-25", "2025-26"];

  const season = selected.season || catalog?.default_season || "2024-25";
  const phase = selected.phase || catalog?.default_phase || "regular_season";
  const beforeDate = selected.beforeDate || catalog?.default_before_date || "2026-06-30";
  const windowParam = selected.window || "season";

  let wbLoaded: { profile: PlayerProfile; log: PlayerGameLogResponse } | null = null;

  try {
    const [profile, log] = await Promise.all([
      getPlayerProfile(id, {
        season,
        phase,
        beforeDate,
        window: windowParam,
        releaseId: selected.releaseId
      }),
      getPlayerGameLog(id, {
        season,
        phase,
        beforeDate,
        releaseId: selected.releaseId,
        limit: 50
      })
    ]);
    wbLoaded = { profile, log };
  } catch (err) {
    loadError = err;
  }

  if (wbLoaded) {
    // Fetch profiles for other admitted seasons in parallel to assemble career overview
    const otherSeasons = admittedSeasons.filter((s) => s !== season);
    const otherResults = await Promise.allSettled(
      otherSeasons.map((s) =>
        getPlayerProfile(id, {
          season: s,
          phase,
          beforeDate,
          releaseId: selected.releaseId
        })
      )
    );

    const careerRows: SeasonCareerRow[] = [];

    // Helper to convert profile to SeasonCareerRow
    const profileToCareerRow = (p: PlayerProfile, s: string): SeasonCareerRow => {
      const sum = p.summaries.season;
      const teamList = p.stints && p.stints.length > 0
        ? p.stints.map((st) => st.team_tricode).join(" / ")
        : p.latest_team?.tricode ?? "NBA";

      return {
        season: s,
        teams: teamList,
        gamesPlayed: sum?.gp ?? 0,
        minutes: sum?.min ?? null,
        minPerGame: sum?.min_per_game ?? null,
        ptsPerGame: sum?.pts_per_game ?? null,
        rebPerGame: sum?.reb_total_per_game ?? null,
        astPerGame: sum?.ast_per_game ?? null,
        stlPerGame: sum?.stl_per_game ?? null,
        blkPerGame: sum?.blk_per_game ?? null,
        fgPct: sum?.fg_pct ?? null,
        fg3Pct: sum?.fg3_pct ?? null,
        ftPct: sum?.ft_pct ?? null,
        tsPct: sum?.ts_pct ?? null,
        efgPct: sum?.efg_pct ?? null,
        fantasyPerGame: sum?.legacy_fantasy_score_per_game ?? null
      };
    };

    // Add current season row
    careerRows.push(profileToCareerRow(wbLoaded.profile, season));

    // Add successfully retrieved other seasons
    for (let i = 0; i < otherResults.length; i++) {
      const res = otherResults[i];
      if (res.status === "fulfilled" && res.value) {
        careerRows.push(profileToCareerRow(res.value, otherSeasons[i]));
      }
    }

    // Sort seasons chronologically
    careerRows.sort((a, b) => a.season.localeCompare(b.season));

    // Compute aggregated career rollup with explicit incomplete career disclosures
    const careerRollup = aggregateCareerStats(careerRows, admittedSeasons);

    return (
      <>
        <ContextBar
          initialSeason={season}
          initialPhase={phase}
          initialBeforeDate={beforeDate}
          initialWindow={windowParam}
          sampleSize={wbLoaded.log.games.length}
          lastIncludedDate={wbLoaded.profile.last_observed_date}
        />
        <div className="workbench-content">
          <WorkbenchPlayerProfile
            profile={wbLoaded.profile}
            games={wbLoaded.log.games}
            careerRows={careerRows}
            careerRollup={careerRollup}
          />
        </div>
      </>
    );
  }

  // Fallback to legacy profile if workbench failed
  try {
    const catalog = await getAnalyticsCatalog(selected.snapshotId);
    const replayDate = selected.date ?? catalog.default_replay_date;
    const profile = await getAnalyticsProfile(id, replayDate, catalog.snapshot_id);
    const log = await getAnalyticsGames(id, replayDate, catalog.snapshot_id, 20);
    legacyData = { profile, games: log.games, dates: catalog.supported_replay_dates };
  } catch (err) {
    loadError = err;
  }

  if (legacyData) {
    return (
      <ProfileView
        profile={legacyData.profile}
        games={legacyData.games}
        catalogDates={legacyData.dates}
      />
    );
  }

  return <PlayerError error={loadError} id={id} date={selected.date} />;
}

function ProfileView({
  profile,
  games,
  catalogDates
}: {
  profile: AnalyticsProfile;
  games: Awaited<ReturnType<typeof getAnalyticsGames>>["games"];
  catalogDates: string[];
}) {
  const opponent = profile.opponent_context;
  return (
    <article className="player-profile shell">
      <header className="profile-hero">
        <div>
          <p className="kicker">Historical replay · {profile.replay_date}</p>
          <h1>{profile.player.name}</h1>
          <p className="profile-subtitle">
            {profile.player.season} · last observed {profile.last_observed?.date ?? "not yet observed"}
            {profile.last_observed ? ` for team ${profile.last_observed.team_id}` : ""}
          </p>
        </div>
        <form className="replay-control" method="get">
          <input name="snapshotId" type="hidden" value={profile.snapshot_id} />
          <label htmlFor="replay-date">Replay date
            <select defaultValue={profile.replay_date} id="replay-date" name="date">
              {catalogDates.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <button className="button button-dark" type="submit">Change date</button>
        </form>
      </header>

      <div className="replay-banner">
        <strong>Historical replay</strong>
        <span>Only games before {profile.replay_date} are included. This is not a live profile.</span>
      </div>

      <section aria-labelledby="summary-title">
        <div className="profile-section-heading"><p className="kicker">At the cutoff</p><h2 id="summary-title">Production and role</h2></div>
        <div className="summary-grid">
          <SummaryCard label="Last 5" summary={profile.summaries.last_5} />
          <SummaryCard label="Last 10" summary={profile.summaries.last_10} />
          <SummaryCard label="Season to date" summary={profile.summaries.season} />
        </div>
      </section>

      {games.length > 0 ? (
        <section aria-labelledby="trends-title" className="profile-section">
          <div className="profile-section-heading"><p className="kicker">Prior appearances</p><h2 id="trends-title">Role and form trends</h2></div>
          <div className="trend-grid">
            <TrendChart title="Minutes" unit="minutes" games={games} series={[{ label: "MIN", value: (game) => game.minutes, className: "series-primary" }]} />
            <TrendChart title="Shot volume" unit="attempts" games={games} series={[
              { label: "FGA", value: (game) => game.stats.fieldGoalsAttempted ?? null, className: "series-primary" },
              { label: "FTA", value: (game) => game.stats.freeThrowsAttempted ?? null, className: "series-secondary" }
            ]} />
            <TrendChart title="Reference production" unit="CourtLens points" games={games} series={[{ label: "REF", value: (game) => game.reference_points, className: "series-primary" }]} />
          </div>
        </section>
      ) : <EmptyHistory />}

      <section aria-labelledby="matchup-title" className="profile-section matchup-panel">
        <div className="profile-section-heading"><p className="kicker">Reconstructed schedule</p><h2 id="matchup-title">Next matchup</h2></div>
        {profile.target ? (
          <div className="matchup-grid">
            <div className="matchup-main">
              <span>{profile.target.team ?? profile.target.team_id}</span>
              <strong>{profile.target.side === "home" ? "vs" : "at"} {profile.target.opponent ?? profile.target.opponent_id}</strong>
              <time>{profile.target.date}</time>
            </div>
            <dl className="context-list">
              <div><dt>Lead time</dt><dd>{profile.target.lead_days} day{profile.target.lead_days === 1 ? "" : "s"}</dd></div>
              <div><dt>Rest before game</dt><dd>{formatNumber(profile.target.rest_days, " days")}</dd></div>
              <div><dt>Opponent sample</dt><dd>{opponent ? `${opponent.eligible_games} games` : "Insufficient coverage"}</dd></div>
              <div><dt>Points allowed</dt><dd>{formatNumber(opponent?.values.points_allowed_per_game, " / game")}</dd></div>
              <div><dt>Rebounds allowed</dt><dd>{formatNumber(opponent?.values.rebounds_allowed_per_game, " / game")}</dd></div>
              <div><dt>Assists allowed</dt><dd>{formatNumber(opponent?.values.assists_allowed_per_game, " / game")}</dd></div>
            </dl>
          </div>
        ) : <p>No target game can be reconstructed at this cutoff.</p>}
        <p className="method-note compact">Team association uses the player&apos;s last observed team. It is not a verified historical roster claim.</p>
      </section>

      <section aria-labelledby="estimate-title" className="profile-section estimate-card">
        <div><p className="kicker">Next team-game estimate</p><h2 id="estimate-title">{profile.estimate.point == null ? "Estimate unavailable" : `${profile.estimate.point.toFixed(1)} points`}</h2></div>
        <div><p>{estimateDescription(profile.estimate.status)}</p>
          {profile.estimate.interval && <p>80% empirical interval: {profile.estimate.interval.lower.toFixed(1)}–{profile.estimate.interval.upper.toFixed(1)} CourtLens points.</p>}
          {profile.estimate.point != null && <p>Conditional on appearance in the reconstructed next team game. Based on {profile.estimate.history_n} valid same-season appearances.</p>}
          <Link href="/evaluation">Read the evaluation →</Link>
        </div>
      </section>

      <section aria-labelledby="games-title" className="profile-section">
        <div className="profile-section-heading"><p className="kicker">Numeric chart alternative</p><h2 id="games-title">Game log</h2></div>
        {games.length ? <GameLog games={games} /> : <EmptyHistory />}
      </section>

      <details className="calculation-details">
        <summary>How this was calculated</summary>
        <dl className="context-list">
          <div><dt>Snapshot</dt><dd>{profile.snapshot_id}</dd></div>
          <div><dt>Dataset</dt><dd>{profile.dataset_id}</dd></div>
          <div><dt>Metric version</dt><dd>{profile.metric_version}</dd></div>
          <div><dt>Source</dt><dd>{profile.source}</dd></div>
        </dl>
        {profile.warnings.map((warning) => <p key={warning}>{warning}</p>)}
      </details>
    </article>
  );
}

function SummaryCard({ label, summary }: { label: string; summary: AnalyticsSummary | null }) {
  return (
    <article className="summary-card">
      <div><span>{label}</span><small>n={summary?.n ?? 0}</small></div>
      <strong>{formatNumber(summary?.reference_points_per_game)}</strong>
      <span>CourtLens points / game</span>
      <dl>
        <div><dt>Minutes</dt><dd>{formatNumber(summary?.minutes_per_game)}</dd></div>
        <div><dt>Per minute</dt><dd>{formatNumber(summary?.reference_points_per_minute)}</dd></div>
        <div><dt>FG</dt><dd>{formatPercent(summary?.fg_pct)}</dd></div>
        <div><dt>3PT</dt><dd>{formatPercent(summary?.fg3_pct)}</dd></div>
        <div><dt>FT</dt><dd>{formatPercent(summary?.ft_pct)}</dd></div>
      </dl>
    </article>
  );
}

function GameLog({ games }: { games: Awaited<ReturnType<typeof getAnalyticsGames>>["games"] }) {
  return (
    <div className="game-log-scroll" tabIndex={0} aria-label="Player game log, scroll horizontally">
      <table className="analytics-game-log">
        <thead><tr><th>Date</th><th>Matchup</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>FGA</th><th>FTA</th><th>Reference</th><th>Source</th></tr></thead>
        <tbody>{games.map((game) => (
          <tr key={game.game_id}>
            <td><time>{game.date}</time></td>
            <td>{game.team ?? game.team_id} / {game.opponent ?? game.opponent_id}</td>
            <td>{formatNumber(game.minutes)}</td>
            <td>{formatNumber(game.stats.points, "", 0)}</td>
            <td>{formatNumber(game.stats.reboundsTotal, "", 0)}</td>
            <td>{formatNumber(game.stats.assists, "", 0)}</td>
            <td>{formatNumber(game.stats.fieldGoalsAttempted, "", 0)}</td>
            <td>{formatNumber(game.stats.freeThrowsAttempted, "", 0)}</td>
            <td>{formatNumber(game.reference_points)}</td>
            <td><a href={`${browserApi}${game.lineage_url}`} rel="noreferrer" target="_blank">Trace<span className="sr-only"> for {game.date}</span></a></td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function EmptyHistory() {
  return <div className="empty-state" role="status"><span className="empty-code">NO PRIOR GAMES</span><h3>No history before this cutoff</h3><p>Choose a later supported replay date to inspect prior appearances.</p></div>;
}

function PlayerError({ error, id, date }: { error: unknown; id: string; date?: string }) {
  const apiError = error instanceof AnalyticsApiError ? error : null;
  const detail = apiError?.detail && typeof apiError.detail === "object" ? apiError.detail as Record<string, unknown> : null;
  const unsupported = apiError?.status === 422;
  return (
    <section className="page shell">
      <div className="empty-state tall" role="alert">
        <span className="empty-code">{apiError?.status ?? "ERROR"}</span>
        <h1>{unsupported ? "Replay date not supported" : apiError?.status === 404 ? "Player not found" : "Profile unavailable"}</h1>
        <p>{unsupported ? `${date ?? "This date"} is outside the available replay dates.` : `CourtLens could not open player ${id} from this snapshot.`}</p>
        {Array.isArray(detail?.nearest_supported_dates) && <p>Nearest dates: {(detail.nearest_supported_dates as string[]).join(" or ")}</p>}
        <Link className="button button-dark" href="/players">Return to player search</Link>
      </div>
    </section>
  );
}

function formatNumber(value: number | null | undefined, suffix = "", digits = 1) {
  return value === null || value === undefined ? "Not available" : `${value.toFixed(digits)}${suffix}`;
}

function formatPercent(value: number | null | undefined) {
  return value === null || value === undefined ? "Not available" : `${(value * 100).toFixed(1)}%`;
}

function estimateDescription(status: string) {
  switch (status) {
    case "available": return "EWMA-20 is the validation-selected historical replay baseline. The challenger was not promoted.";
    case "limited_history_baseline": return "Limited-history mean from 5–9 valid appearances. A calibrated interval is unavailable.";
    case "insufficient_history": return "Fewer than five valid prior appearances; descriptive form remains available.";
    case "no_reconstructed_target": return "No target game can be reconstructed at this cutoff.";
    default: return "A cutoff-safe estimate artifact is unavailable here; descriptive form remains available.";
  }
}
