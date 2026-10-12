"use client";

import { Icon, type IconName } from "./ui/icon";
import { IconButton } from "./ui/button";
import { GatedNote } from "./ui/gated-note";
import { TeamIdentity, teamStyle } from "./ui/identity";
import { Menu, MenuItem } from "./ui/menu";
import { PageShell, ProfileLayout } from "./ui/page-shell";
import { PageHeader } from "./ui/panel";
import { StatTile } from "./ui/stat-tile";
import { Tabs, TabsContent, TabsList, TabTrigger } from "./ui/tabs";
import { PlayerCombinePanel, PlayerTrackingPanel } from "./player-feed-panels";
import { Tooltip } from "./ui/tooltip";
import { SegmentedControl } from "./ui/segmented-control";
import { humanLabel } from "@/lib/route-availability";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { ImpactPlayerCard } from "./impact-player-card";

import Link from "next/link";
import { AssistantPageSelection } from "@/lib/assistant-page-context";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import { orientedPercentile, type GoodDirection } from "@/lib/percentile-display";
import { scopeContextLine } from "@/lib/scope-labels";
import { RANK_PAGE_LIMIT, useCohortRanks } from "@/lib/use-cohort-ranks";
import { PlayerPortrait } from "./player-portrait";
import { ResearchTrendCharts } from "./research-trend-charts";
import { LineageDrawer } from "./lineage-drawer";
import { useWorkspace } from "@/lib/workspace-context";
import { exportSvgAsPng, exportSvgFile } from "@/lib/image-export";
import {
  formatPercent,
  scaleToPer36,
  SHOWCASE_PRESETS,
  type CareerRollup,
  type CountingExposureMode,
  type SeasonCareerRow
} from "@/lib/player-pages";
import type {
  PlayerResearchItem,
  QuerySpec,
  PlayerGameLogItem,
  PlayerProfile
} from "@/lib/types";
import type { ImpactResponse } from "@/lib/types";

type ProfileTab = "overview" | "games" | "tracking" | "measurements";
const PROFILE_TABS: ProfileTab[] = ["overview", "games", "tracking", "measurements"];
/** Placeholder for useCohortRanks when no Stats row is available; with no metrics it never queries. */
const EMPTY_QUERY = {} as QuerySpec;
const HERO_METRICS = SHOWCASE_PRESETS[0].metrics.filter((metric) => metric.key !== "legacy_fantasy_score_per_game");

/** The player's row in the Stats query (same scope and cohort), for hero percentiles (D16). */
export interface ProfileHeroStats {
  item: PlayerResearchItem | null;
  query: QuerySpec;
  eligible: number;
  goodDirections: Record<string, GoodDirection>;
}

interface WorkbenchPlayerProfileProps {
  profile: PlayerProfile;
  games: PlayerGameLogItem[];
  careerRows?: SeasonCareerRow[];
  careerRollup?: CareerRollup;
  impact?: ImpactResponse | null;
  hero?: ProfileHeroStats | null;
  /** The shared filter bar, placed directly under the page header. */
  filterBar?: ReactNode;
}

export function WorkbenchPlayerProfile({
  profile,
  games,
  careerRows = [],
  careerRollup,
  impact = null,
  hero = null,
  filterBar
}: WorkbenchPlayerProfileProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") as ProfileTab | null;
  const [tab, setTab] = useState<ProfileTab>(requestedTab && PROFILE_TABS.includes(requestedTab) ? requestedTab : "overview");
  const [selectedFact, setSelectedFact] = useState<string | null>(null);
  const [exposureMode, setExposureMode] = useState<CountingExposureMode>("per_game");
  const [exporting, setExporting] = useState(false);

  const cardSvgRef = useRef<SVGSVGElement | null>(null);

  const { favorites, toggleFavorite, compareTray, toggleCompare } =
    useWorkspace();

  const { player, context, summaries, stints, latest_team, last_observed_date, forecast_status } =
    profile;

  const heroQuery = hero?.query ?? null;
  const heroKeys = useMemo(() => HERO_METRICS.map((metric) => metric.key), []);
  const { ranks } = useCohortRanks(heroQuery ?? EMPTY_QUERY, heroQuery ? heroKeys : [], hero?.goodDirections ?? {});
  // Values come from the profile's own season summary; percentiles and ranks from the Stats cohort.
  const heroStats = HERO_METRICS.map((metric) => {
    const value = (profile.summaries.season as Record<string, number | null | undefined> | null)?.[metric.key];
    return {
      key: metric.key,
      label: metric.label,
      value: metric.format(value ?? null),
      percentile: hero?.item ? orientedPercentile(hero.item.percentiles?.[metric.key], hero.goodDirections[metric.key]) : null,
      rank: hero?.item ? ranks[metric.key]?.[player.id] ?? null : null,
    };
  });

  const isFavorite = favorites.includes(player.id);
  const inTray = compareTray.includes(player.id);

  const seasonSummary = summaries.season;
  const last10Summary = summaries.last_10;
  const last5Summary = summaries.last_5;

  const handleExportPng = async () => {
    if (!cardSvgRef.current) return;
    setExporting(true);
    try {
      await exportSvgAsPng(cardSvgRef.current, {
        title: `${player.name} — Research Profile Summary`,
        subtitle: `${context.season} ${context.phase.replace("_", " ")} · ${latest_team?.tricode ?? "NBA"} · Cutoff: ${context.before_date}`,
        context: {
          season: context.season,
          phase: context.phase,
          before_date: context.before_date,
          release_id: context.release_id
        },
        filename: `${player.name.toLowerCase().replace(/\s+/g, "_")}-profile-card.png`
      });
    } finally {
      setExporting(false);
    }
  };

  const handleExportSvg = () => {
    if (!cardSvgRef.current) return;
    exportSvgFile(
      cardSvgRef.current,
      `${player.name.toLowerCase().replace(/\s+/g, "_")}-profile-card.svg`,
      {
        title: `${player.name} — Profile Summary`,
        context: {
          season: context.season,
          phase: context.phase,
          before_date: context.before_date,
          release_id: context.release_id
        },
        filename: `${player.name.toLowerCase().replace(/\s+/g, "_")}-profile-card.svg`
      }
    );
  };

  const scopeParams = `season=${context.season}&phase=${context.phase}&beforeDate=${context.before_date}`;
  const contextLine = scopeContextLine(context.season, context.phase, context.before_date);
  const explore: { label: string; href: string; icon: IconName }[] = [
    { label: "Recent games", href: `/last-games?playerId=${player.id}&${scopeParams}`, icon: "history" },
    { label: "Workload trends", href: `/research/trends?playerId=${player.id}&${scopeParams}`, icon: "trend" },
    { label: "Distributions", href: `/research/distributions?playerId=${player.id}&${scopeParams}`, icon: "chart" },
    { label: "Similar players", href: `/similar-players?playerId=${player.id}&${scopeParams}`, icon: "person" },
    { label: "Shot profile", href: `/similar-players/shot-profile?player_id=${player.id}&release_id=${context.release_id}&season=${context.season}&phase=${context.phase}&before_date=${context.before_date}`, icon: "scatter" },
    { label: "Compare head to head", href: `/compare?playerA=${player.id}&${scopeParams}`, icon: "swap" },
    { label: "Wingspan", href: `/wingspan?playerId=${player.id}`, icon: "scale" },
  ];

  const selectTab = (next: string) => {
    setTab(next as ProfileTab);
    const params = new URLSearchParams(searchParams.toString());
    if (next === "overview") params.delete("tab"); else params.set("tab", next);
    router.replace(`${pathname}${params.size ? `?${params}` : ""}`, { scroll: false });
  };

  return (
    <PageShell template="profile" className="player-detail-container">
      <AssistantPageSelection route={`/players/${player.id}`} playerIds={[player.id]} scope={context} label={player.name} />
      <PageHeader
        title={player.name}
        subtitle={[latest_team?.name, contextLine, last_observed_date ? `Last game ${formatDate(last_observed_date)}` : null].filter(Boolean).join(" · ")}
        actions={<>
          <Tooltip content={isFavorite ? "Remove from favorites" : "Add to favorites"}>
            <IconButton icon="star" label={isFavorite ? "Remove from favorites" : "Add to favorites"} variant="secondary"
              aria-pressed={isFavorite} className={isFavorite ? "is-active" : ""} onClick={() => toggleFavorite(player.id)} />
          </Tooltip>
          <Tooltip content={inTray ? "Remove from compare tray" : "Add to compare tray"}>
            <IconButton icon={inTray ? "check" : "plus"} label={inTray ? "Remove from compare tray" : "Add to compare tray"} variant="secondary"
              aria-pressed={inTray} className={inTray ? "is-active" : ""} onClick={() => toggleCompare(player.id)} />
          </Tooltip>
          <Menu align="right" trigger={<span className="ui-button ui-button-secondary ui-button-md">Explore<Icon name="chevron-down" size={14} /></span>}>
            {explore.map(item => <MenuItem key={item.href} icon={item.icon} label={item.label} onClick={() => router.push(item.href)} />)}
          </Menu>
          <Menu align="right" trigger={<span className="ui-button ui-button-primary ui-button-md">
            <Icon name="download" size={16} />{exporting ? "Exporting…" : "Export"}<Icon name="chevron-down" size={14} />
          </span>}>
            <MenuItem icon="download" label="Export PNG" disabled={exporting} onClick={() => void handleExportPng()} />
            <MenuItem icon="page" label="Export SVG" disabled={exporting} onClick={handleExportSvg} />
          </Menu>
        </>}
      />
      {filterBar}

      <Tabs value={tab} onChange={selectTab}>
      <ProfileLayout
        hero={<div className="player-hero" style={teamStyle(latest_team?.id)}>
          <div className="player-hero-identity">
            <PlayerPortrait playerId={player.id} name={player.name} portraitUrl={player.portrait_url} size="lg" />
            {latest_team
              ? <TeamIdentity team={latest_team.id} name={latest_team.name} subtitle={`${seasonSummary?.gp ?? 0} games · ${context.season}`} size="sm" />
              : <span className="player-hero-team">Team unknown in this scope</span>}
          </div>
          <div className="player-hero-tiles" role="group" aria-label="Season summary">
            {heroStats.map(stat => <StatTile key={stat.key} label={stat.label} value={stat.value} percentile={stat.percentile} rank={stat.rank} rankOf={stat.rank != null ? RANK_PAGE_LIMIT : null} />)}
          </div>
          {hero && <p className="player-hero-note">Percentile among {hero.eligible.toLocaleString("en-US")} eligible players (the Stats cohort); ranks within the top {RANK_PAGE_LIMIT}.</p>}
        </div>}
        tabs={<TabsList aria-label="Profile sections">
          <TabTrigger value="overview">Overview</TabTrigger>
          <TabTrigger value="games">Game Log</TabTrigger>
          <TabTrigger value="tracking">Tracking</TabTrigger>
          <TabTrigger value="measurements">Measurements</TabTrigger>
        </TabsList>}
      >
        <TabsContent value="overview" className="player-tab-body">
      <ImpactPlayerCard data={impact} />
      {/* Season, last 10 and last 5 in one comparable table. */}
      <section className="panel" aria-label="Production splits">
        <h2 className="panel-title">Production Splits</h2>
        <div className="table-wrapper" role="region" aria-label="Production splits table" tabIndex={0}>
          <table className="data-table">
            <thead><tr><th>Window</th><th className="num">GP</th><th className="num">MPG</th><th className="num">PPG</th><th className="num">RPG</th><th className="num">APG</th><th className="num">TS%</th><th className="num">eFG%</th></tr></thead>
            <tbody>
              {([["Season", seasonSummary], ["Last 10", last10Summary], ["Last 5", last5Summary]] as const).map(([label, sum]) => (
                <tr key={label}>
                  <th scope="row">{label}</th>
                  <td className="num">{sum?.gp ?? "—"}</td>
                  <td className="num">{sum?.min_per_game?.toFixed(1) ?? "—"}</td>
                  <td className="num">{sum?.pts_per_game?.toFixed(1) ?? "—"}</td>
                  <td className="num">{sum?.reb_total_per_game?.toFixed(1) ?? "—"}</td>
                  <td className="num">{sum?.ast_per_game?.toFixed(1) ?? "—"}</td>
                  <td className="num">{formatPercent(sum?.ts_pct)}</td>
                  <td className="num">{formatPercent(sum?.efg_pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {stints && stints.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Participation Stints</h2>
              <p className="text-muted text-xs panel-subtitle-margin">
                Observed participation per team stint for {context.season}. Traded players have explicit team affiliations.
              </p>
            </div>
          </div>
          <div className="table-wrapper" role="region" aria-label="Participation stints table" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Team</th>
                  <th className="num">Games</th>
                  <th className="num">Minutes</th>
                  <th className="num">PPG</th>
                  <th className="num">RPG</th>
                  <th className="num">APG</th>
                  <th className="num">FG%</th>
                  <th className="num">3P%</th>
                  <th className="num">TS%</th>
                </tr>
              </thead>
              <tbody>
                {stints.map((stint) => (
                  <tr key={stint.team_id}>
                    <td>
                      <strong>{stint.team_tricode}</strong> ({stint.team_name})
                    </td>
                    <td className="num font-mono">{stint.games_played}</td>
                    <td className="num font-mono">{stint.metrics.min?.toFixed(0) ?? "—"}</td>
                    <td className="num font-mono font-semibold">{stint.metrics.pts_per_game?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">{stint.metrics.reb_total_per_game?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">{stint.metrics.ast_per_game?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">
                      {stint.metrics.fg_pct !== null ? `${(stint.metrics.fg_pct * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="num font-mono">
                      {stint.metrics.fg3_pct !== null ? `${(stint.metrics.fg3_pct * 100).toFixed(1)}%` : "—"}
                    </td>
                    <td className="num font-mono">
                      {stint.metrics.ts_pct !== null ? `${(stint.metrics.ts_pct * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Multi-Season Career View (F13) */}
      {careerRows.length > 0 && (
        <div className="panel mb-5">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Multi-Season Career History</h2>
              <p className="text-muted text-xs panel-subtitle-margin">
                Observed participation across admitted snapshot seasons. Click any season row to switch active context.
              </p>
            </div>
            <span className="badge font-mono">{careerRows.length} admitted seasons</span>
          </div>

          <div className="table-wrapper" role="region" aria-label="Career history table" tabIndex={0}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Season</th>
                  <th>Team(s)</th>
                  <th className="num">GP</th>
                  <th className="num">MIN</th>
                  <th className="num">MPG</th>
                  <th className="num">PPG</th>
                  <th className="num">RPG</th>
                  <th className="num">APG</th>
                  <th className="num">FG%</th>
                  <th className="num">3P%</th>
                  <th className="num">FT%</th>
                  <th className="num">TS%</th>
                  <th className="num">eFG%</th>
                  <th className="num">Fantasy/G</th>
                </tr>
              </thead>
              <tbody>
                {careerRows.map((r) => {
                  const isCurrent = r.season === context.season;
                  return (
                    <tr
                      key={r.season}
                      className={isCurrent ? "is-current-season" : undefined}
                    >
                      <td>
                        <Link
                          href={`/players/${player.id}?season=${r.season}&phase=${context.phase}&beforeDate=${context.before_date}`}
                          className={`font-mono ${isCurrent ? "font-bold text-accent" : ""}`}
                          title={`Switch view to ${r.season}`}
                        >
                          {r.season} {isCurrent && <><Icon name="left" size={14} /><span className="sr-only">Current season</span></>}
                        </Link>
                      </td>
                      <td><strong>{r.teams}</strong></td>
                      <td className="num font-mono">{r.gamesPlayed}</td>
                      <td className="num font-mono">{r.minutes?.toFixed(0) ?? "—"}</td>
                      <td className="num font-mono">{r.minPerGame?.toFixed(1) ?? "—"}</td>
                      <td className="num font-mono font-bold">{r.ptsPerGame?.toFixed(1) ?? "—"}</td>
                      <td className="num font-mono">{r.rebPerGame?.toFixed(1) ?? "—"}</td>
                      <td className="num font-mono">{r.astPerGame?.toFixed(1) ?? "—"}</td>
                      <td className="num font-mono">{formatPercent(r.fgPct)}</td>
                      <td className="num font-mono">{formatPercent(r.fg3Pct)}</td>
                      <td className="num font-mono">{formatPercent(r.ftPct)}</td>
                      <td className="num font-mono font-semibold">{formatPercent(r.tsPct)}</td>
                      <td className="num font-mono">{formatPercent(r.efgPct)}</td>
                      <td className="num font-mono">{r.fantasyPerGame?.toFixed(1) ?? "—"}</td>
                    </tr>
                  );
                })}

                {/* Career Admitted Totals / Rollup Row */}
                {careerRollup && (
                  <tr className="career-rollup-row">
                    <td colSpan={2}>
                      <span className="font-mono text-xs uppercase text-accent">
                        Admitted Career
                      </span>
                    </td>
                    <td className="num font-mono">{careerRollup.totalGames}</td>
                    <td className="num font-mono">{careerRollup.totalMinutes.toFixed(0)}</td>
                    <td className="num font-mono">{careerRollup.avgMinutes?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono text-accent font-bold">{careerRollup.careerPtsPerGame?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">{careerRollup.careerRebPerGame?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">{careerRollup.careerAstPerGame?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono">—</td>
                    <td className="num font-mono">—</td>
                    <td className="num font-mono">—</td>
                    <td className="num font-mono">{formatPercent(careerRollup.careerTsPct)}</td>
                    <td className="num font-mono">{formatPercent(careerRollup.careerEfgPct)}</td>
                    <td className="num font-mono">—</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Strict Incomplete Career Guardrail Notice */}
          <GatedNote why={careerRollup?.disclaimer ?? "Career data is strictly scoped to admitted dataset seasons. Historical seasons outside admitted coverage are not silently completed or inferred."}>
            Career totals cover admitted seasons only.
          </GatedNote>
        </div>
      )}

      {/* Small-Multiple Trend Charts */}
      <ResearchTrendCharts games={games} playerName={player.name} />

      {/* Forecast Status Card */}
      <div className="panel forecast-status-panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Prospective Forecast Status</h2>
            <p className="text-muted text-xs panel-subtitle-margin">
              Next scheduled game points estimation under active policy conditional on appearance.
            </p>
          </div>
          <span className={`badge ${forecast_status.status === "forecast_issued" ? "badge-positive" : "badge-accent"}`}>
            {humanLabel(forecast_status.status)}
          </span>
        </div>

        {forecast_status.status === "forecast_issued" && forecast_status.point_estimate !== undefined ? (
          <div>
            <div className="forecast-estimates-row">
              <div>
                <span className="text-xs text-muted uppercase font-mono">Point Estimate</span>
                <div className="font-mono text-2xl font-bold text-accent">
                  {forecast_status.point_estimate.toFixed(1)} <span className="text-sm font-normal text-muted">PTS</span>
                </div>
              </div>
              <div>
                <span className="text-xs text-muted uppercase font-mono">80% Empirical Interval</span>
                <div className="font-mono text-lg font-semibold">
                  [{forecast_status.interval_lower?.toFixed(1)}, {forecast_status.interval_upper?.toFixed(1)}] <span className="text-xs font-normal text-muted">PTS</span>
                </div>
              </div>
              {forecast_status.target_opponent && (
                <div>
                  <span className="text-xs text-muted uppercase font-mono">Target Game</span>
                  <div className="font-mono text-sm">
                    {formatDate(forecast_status.target_game_date)} vs {forecast_status.target_opponent}
                  </div>
                </div>
              )}
            </div>
            <p className="text-sm text-muted">
              {forecast_status.message}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {forecast_status.message}
          </p>
        )}

        <GatedNote why="Empirical prediction intervals are conditional on player appearance; an absent box score row is unknown, not an injury confirmation.">
          Forecasts assume the player appears.
        </GatedNote>
      </div>

        </TabsContent>
        <TabsContent value="games" className="player-tab-body">
      {/* Reverse-Chronological Game Log with Per-Game / Per-36 Toggle */}
      <div className="panel mb-5">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Prior Appearance Game Log</h2>
            <p className="text-muted text-xs panel-subtitle-margin">
              {contextLine}. Lineage shows each game&apos;s source observations.
            </p>
          </div>

          <div className="profile-toolbar-row">
            <SegmentedControl<CountingExposureMode> name="Game log exposure" size="sm" value={exposureMode} onChange={setExposureMode}
              options={[{ value: "per_game", label: "Per Game" }, { value: "per_36", label: "Per 36 Min" }]} />
            <span className="badge font-mono">{games.length} games</span>
          </div>
        </div>

        <div className="table-wrapper" role="region" aria-label="Player game log table" tabIndex={0}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Team</th>
                <th>Opponent</th>
                <th>Status</th>
                <th className="num">MIN</th>
                <th className="num">{exposureMode === "per_36" ? "PTS/36" : "PTS"}</th>
                <th className="num">{exposureMode === "per_36" ? "REB/36" : "REB"}</th>
                <th className="num">{exposureMode === "per_36" ? "AST/36" : "AST"}</th>
                <th className="num">{exposureMode === "per_36" ? "STL/36" : "STL"}</th>
                <th className="num">{exposureMode === "per_36" ? "BLK/36" : "BLK"}</th>
                <th className="num">FGM/A</th>
                <th className="num">3PM/A</th>
                <th className="num">FTM/A</th>
                <th className="num">Fantasy</th>
                <th className="text-right">Provenance</th>
              </tr>
            </thead>
            <tbody>
              {games.map((g) => {
                const mins = g.minutes;
                const pts = exposureMode === "per_36" ? scaleToPer36(g.points, mins) : g.points;
                const reb = exposureMode === "per_36" ? scaleToPer36(g.stats?.rebounds_total, mins) : g.stats?.rebounds_total;
                const ast = exposureMode === "per_36" ? scaleToPer36(g.stats?.assists, mins) : g.stats?.assists;
                const stl = exposureMode === "per_36" ? scaleToPer36(g.stats?.steals, mins) : g.stats?.steals;
                const blk = exposureMode === "per_36" ? scaleToPer36(g.stats?.blocks, mins) : g.stats?.blocks;

                return (
                  <tr key={g.game_id}>
                    <td className="font-mono">{formatDate(g.game_date)}</td>
                    <td><strong>{g.team_tricode}</strong></td>
                    <td>{g.side === "home" ? "vs" : "@"} {g.opponent_tricode}</td>
                    <td>
                      <span className={`badge ${g.appearance === "appeared" ? "badge-positive" : ""}`}>
                        {g.appearance}
                      </span>
                    </td>
                    <td className="num font-mono">{mins?.toFixed(1) ?? "—"}</td>
                    <td className="num font-mono font-bold">{pts !== null ? pts : "—"}</td>
                    <td className="num font-mono">{reb !== null ? reb : "—"}</td>
                    <td className="num font-mono">{ast !== null ? ast : "—"}</td>
                    <td className="num font-mono">{stl !== null ? stl : "—"}</td>
                    <td className="num font-mono">{blk !== null ? blk : "—"}</td>
                    <td className="num font-mono text-xs">
                      {g.stats?.field_goals_made ?? 0}/{g.stats?.field_goals_attempted ?? 0}
                    </td>
                    <td className="num font-mono text-xs">
                      {g.stats?.three_pointers_made ?? 0}/{g.stats?.three_pointers_attempted ?? 0}
                    </td>
                    <td className="num font-mono text-xs">
                      {g.stats?.free_throws_made ?? 0}/{g.stats?.free_throws_attempted ?? 0}
                    </td>
                    <td className="num font-mono">{g.legacy_fantasy_score?.toFixed(1) ?? "—"}</td>
                    <td className="text-right">
                      <button
                        type="button"
                        className="button button-small"
                        onClick={() => setSelectedFact(g.game_id)}
                        title="Inspect raw cryptographic lineage"
                      >
                        Lineage
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

        </TabsContent>
        <TabsContent value="tracking" className="player-tab-body">
          {tab === "tracking" && <PlayerTrackingPanel playerId={player.id} name={player.name} season={context.season} phase={context.phase} />}
        </TabsContent>
        <TabsContent value="measurements" className="player-tab-body">
          {tab === "measurements" && <PlayerCombinePanel playerId={player.id} name={player.name} />}
        </TabsContent>
      </ProfileLayout>
      </Tabs>

      {/* Hidden Renderable SVG Card for Export */}
      <div className="hidden">
        <svg
          ref={cardSvgRef}
          viewBox="0 0 460 520"
          width="460"
          height="520"
          role="img"
          aria-hidden="true"
        >
          <rect width="460" height="520" fill="#282f3b" rx="8" />
          <rect width="460" height="520" fill="none" stroke="#465160" strokeWidth="1.5" rx="8" />
          <path d="M 0 8 Q 0 0 8 0 L 452 0 Q 460 0 460 8 L 460 85 L 0 85 Z" fill="#20252e" />
          <line x1="0" y1="85" x2="460" y2="85" stroke="#ffd166" strokeWidth="2" />
          <CourtLensWordmark x={24} y={14} height={12} color="#ffd166" />
          <text x="130" y="26" fill="#b4bdca" fontSize="10" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">PLAYER PROFILE · {context.season}</text>
          <text x="24" y="55" fill="#f1f3f6" fontSize="20" fontWeight="bold" fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif">{player.name}</text>
          <text x="24" y="74" fill="#ffd166" fontSize="11" fontFamily="monospace" fontWeight="bold">{latest_team?.tricode ?? "NBA"} · ID: {player.id}</text>
          <text x="436" y="55" fill="#b4bdca" fontSize="11" fontFamily="monospace" textAnchor="end">{seasonSummary?.gp ?? 0} GP</text>

          {/* 4 Stat Boxes */}
          <rect x="24" y="105" width="95" height="70" fill="#20252e" rx="4" stroke="#323b49" strokeWidth="1" />
          <text x="36" y="125" fill="#b4bdca" fontSize="9" fontFamily="monospace">PPG</text>
          <text x="36" y="155" fill="#f1f3f6" fontSize="20" fontWeight="bold" fontFamily="monospace">{seasonSummary?.pts_per_game?.toFixed(1) ?? "—"}</text>

          <rect x="130" y="105" width="95" height="70" fill="#20252e" rx="4" stroke="#323b49" strokeWidth="1" />
          <text x="142" y="125" fill="#b4bdca" fontSize="9" fontFamily="monospace">RPG</text>
          <text x="142" y="155" fill="#f1f3f6" fontSize="20" fontWeight="bold" fontFamily="monospace">{seasonSummary?.reb_total_per_game?.toFixed(1) ?? "—"}</text>

          <rect x="236" y="105" width="95" height="70" fill="#20252e" rx="4" stroke="#323b49" strokeWidth="1" />
          <text x="248" y="125" fill="#b4bdca" fontSize="9" fontFamily="monospace">APG</text>
          <text x="248" y="155" fill="#f1f3f6" fontSize="20" fontWeight="bold" fontFamily="monospace">{seasonSummary?.ast_per_game?.toFixed(1) ?? "—"}</text>

          <rect x="342" y="105" width="95" height="70" fill="#20252e" rx="4" stroke="#323b49" strokeWidth="1" />
          <text x="354" y="125" fill="#b4bdca" fontSize="9" fontFamily="monospace">TS%</text>
          <text x="354" y="155" fill="#ffd166" fontSize="18" fontWeight="bold" fontFamily="monospace">{formatPercent(seasonSummary?.ts_pct)}</text>

          {/* Forecast Box */}
          <rect x="24" y="195" width="412" height="75" fill="#20252e" rx="4" stroke="#323b49" strokeWidth="1" />
          <text x="36" y="218" fill="#b4bdca" fontSize="10" fontFamily="monospace">PROSPECTIVE FORECAST STATUS</text>
          <text x="36" y="242" fill="#ffd166" fontSize="14" fontWeight="bold" fontFamily="monospace">
            {forecast_status.status === "forecast_issued" && forecast_status.point_estimate !== undefined
              ? `Estimated ${forecast_status.point_estimate.toFixed(1)} PTS [${forecast_status.interval_lower?.toFixed(1)}, ${forecast_status.interval_upper?.toFixed(1)}]`
              : forecast_status.status.replace("_", " ").toUpperCase()}
          </text>
          <text x="36" y="258" fill="#7b8798" fontSize="9" fontFamily="monospace">
            {forecast_status.target_opponent ? `Target: vs ${forecast_status.target_opponent}` : forecast_status.message.slice(0, 50)}
          </text>

          {/* Temporal Guarantee */}
          <line x1="24" y1="460" x2="436" y2="460" stroke="#323b49" strokeWidth="1" />
          {/* D16/D20: the export carries the same context line as the screen. */}
          <text x="24" y="485" fill="#7b8798" fontSize="10" fontFamily="monospace">{contextLine}</text>
        </svg>
      </div>

      {/* Lineage Modal Drawer */}
      {selectedFact && (
        <LineageDrawer
          factType="player_game"
          factId={selectedFact}
          releaseId={context.release_id}
          onClose={() => setSelectedFact(null)}
        />
      )}
    </PageShell>
  );
}
