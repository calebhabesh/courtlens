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
import { WorkbenchPlayerProfile, type ProfileHeroStats } from "@/components/workbench-player-profile";
import { HERO_METRICS } from "@/lib/player-hero";
import { GatedNote } from "@/components/ui/gated-note";
import { Button, ButtonLink } from "@/components/ui/kit";
import { PageShell } from "@/components/ui/page-shell";
import { PageHeader } from "@/components/ui/panel";
import { formatDate } from "@/lib/format-date";
import type { GoodDirection } from "@/lib/percentile-display";
import { resolveStatsQuery } from "@/lib/stats-query";
import type { WorkbenchCatalog } from "@/lib/types";
import { executeWorkbenchQuery, getPlayerBio, getPlayerCareer, getPlayerProfile, getPlayerGameLog, getWorkbenchCatalog, getImpact } from "@/lib/workbench-api";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Player Profile" };

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

  const season = selected.season || catalog?.default_season || "2024-25";
  const phase = selected.phase || catalog?.default_phase || "regular_season";
  const beforeDate = selected.beforeDate || catalog?.default_before_date || "2026-06-30";
  const windowParam = selected.window || "season";

  let wbLoaded: { profile: PlayerProfile; log: PlayerGameLogResponse } | null = null;
  // The career table arrives with the page: one stored read, started beside the profile.
  const careerRequest = catalog
    ? getPlayerCareer(id, { phase, releaseId: catalog.release_id }).catch(() => null)
    : Promise.resolve(null);

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
    const [impact, hero, bio, career] = await Promise.all([
      getImpact({ season, phase, beforeDate, playerId: id, window: windowParam }).catch(() => null),
      catalog ? heroStats(id, selected, catalog) : null,
      getPlayerBio(id, { season, beforeDate }).catch(() => null),
      careerRequest,
    ]);

    return (
      <WorkbenchPlayerProfile
        profile={wbLoaded.profile}
        games={wbLoaded.log.games}
        catalog={catalog}
        bio={bio}
        impact={impact}
        hero={hero}
        career={career}
        filterBar={<ContextBar
          key="filter-bar"
          initialSeason={season}
          initialPhase={phase}
          initialBeforeDate={beforeDate}
          initialWindow={windowParam}
          // Games the player appeared in for the chosen window, not the game log's 50-row page.
          sampleSize={windowGames(wbLoaded.profile, windowParam)}
          lastIncludedDate={wbLoaded.profile.last_observed_date}
          detailRows={[{ label: "Player", value: id, mono: true }]}
        />}
      />
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

function windowGames(profile: PlayerProfile, window: string): number | undefined {
  const summary = window === "last_10" ? profile.summaries.last_10 : window === "last_5" ? profile.summaries.last_5 : profile.summaries.season;
  return summary?.gp ?? undefined;
}

/**
 * The player's season row from the Stats query with the same scope resolution and cohort as Stats
 * and Showcase (D16: no new formula). Season-to-date, as the hero shows season values.
 */
async function heroStats(id: string, params: Record<string, string | undefined>, catalog: WorkbenchCatalog): Promise<ProfileHeroStats | null> {
  try {
    const query = resolveStatsQuery(params, catalog, "per_game");
    query.window = { kind: "season" };
    query.view_state = { ...query.view_state, columns: HERO_METRICS.map(metric => metric.key) };
    if (catalog.darko?.manifest_sha256) query.darko_manifest_sha256 = catalog.darko.manifest_sha256;
    const result = await executeWorkbenchQuery({ ...query, page: { limit: 1 } }, { player_ids: [id] });
    return {
      item: result.items[0] ?? null,
      query,
      eligible: result.cohort?.eligible_players ?? result.total_eligible_players,
      goodDirections: (result.cohort?.good_directions ?? {}) as Record<string, GoodDirection>,
    };
  } catch {
    return null;
  }
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
    <PageShell template="profile" className="player-profile">
      <PageHeader
        title={profile.player.name}
        subtitle={`Historical replay · ${formatDate(profile.replay_date)} · ${profile.player.season} · last observed ${profile.last_observed?.date ? formatDate(profile.last_observed.date) : "not yet observed"}`}
        actions={<form className="replay-control" method="get">
          <input name="snapshotId" type="hidden" value={profile.snapshot_id} />
          <label htmlFor="replay-date">Replay date
            <select defaultValue={profile.replay_date} id="replay-date" name="date">
              {catalogDates.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <Button size="lg" type="submit">Change date</Button>
        </form>}
      />

      <GatedNote why={`Only games before ${formatDate(profile.replay_date)} are included. This is not a live profile.${profile.last_observed ? ` Last observed for team ${profile.last_observed.team_id}.` : ""}`}>
        Historical replay of a fixture snapshot.
      </GatedNote>

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
          <Link href="/evaluation">Read the evaluation</Link>
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
    </PageShell>
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
    <div className="game-log-scroll" role="region" tabIndex={0} aria-label="Player game log, scroll horizontally">
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
    <PageShell template="profile">
      <PageHeader title={unsupported ? "Replay date not supported" : apiError?.status === 404 ? "Player not found" : "Profile unavailable"} />
      <div className="empty-state tall" role="alert">
        <span className="empty-code">{apiError?.status ?? "ERROR"}</span>
        <p>{unsupported ? `${date ?? "This date"} is outside the available replay dates.` : `CourtLens could not open player ${id} from this snapshot.`}</p>
        {Array.isArray(detail?.nearest_supported_dates) && <p>Nearest dates: {(detail.nearest_supported_dates as string[]).join(" or ")}</p>}
        <ButtonLink size="lg" href="/players">Return to player search</ButtonLink>
      </div>
    </PageShell>
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
