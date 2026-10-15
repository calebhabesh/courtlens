"use client";

import { Icon, type IconName } from "./ui/icon";
import { Button, IconButton, MenuTrigger, Segmented } from "./ui/kit";
import { Menu, MenuItem } from "./ui/menu";
import { PageShell, ProfileLayout } from "./ui/page-shell";
import { ordinal } from "./ui/stat-tile";
import { TeamLogoStack } from "./team-logo";
import { Tabs, TabsContent, TabsList, TabTrigger } from "./ui/tabs";
import { PlayerCombinePanel, PlayerTrackingPanel } from "./player-feed-panels";
import { Tooltip } from "./ui/tooltip";
import { ControlScope } from "./ui/control-scope";
import catalogBranding from "@/lib/team-branding.json";
import { CourtLensWordmark } from "./courtlens-wordmark";
import { ImpactPlayerCard } from "./impact-player-card";

import { AssistantPageSelection } from "@/lib/assistant-page-context";
import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatDate } from "@/lib/format-date";
import { orientedPercentile, type GoodDirection } from "@/lib/percentile-display";
import { scopeContextLine } from "@/lib/scope-labels";
import { RANK_PAGE_LIMIT, useCohortRanks } from "@/lib/use-cohort-ranks";
import { PlayerBioHeader } from "./player-bio-header";
import { PlayerCareerTable } from "./player-career-table";
import { ResearchTrendCharts } from "./research-trend-charts";
import { LineageDrawer } from "./lineage-drawer";
import { useWorkspace } from "@/lib/workspace-context";
import { exportSvgAsPng, exportSvgFile } from "@/lib/image-export";
import { formatPercent, scaleToPer36, type CountingExposureMode } from "@/lib/player-pages";
import { HERO_METRICS } from "@/lib/player-hero";
import type {
  PlayerBio,
  PlayerCareerResponse,
  PlayerResearchItem,
  QuerySpec,
  PlayerGameLogItem,
  PlayerProfile,
  WorkbenchCatalog
} from "@/lib/types";
import type { ImpactResponse } from "@/lib/types";

type ProfileTab = "overview" | "games" | "tracking" | "combine";
const PROFILE_TABS: ProfileTab[] = ["overview", "games", "tracking", "combine"];
/** Placeholder for useCohortRanks when no Stats row is available; with no metrics it never queries. */
const EMPTY_QUERY = {} as QuerySpec;

/** The player's row in the Stats query (same scope and cohort), for hero percentiles (D16). */
export interface ProfileHeroStats {
  item: PlayerResearchItem | null;
  query: QuerySpec;
  eligible: number;
  goodDirections: Record<string, GoodDirection>;
}

type FormKey = "min_per_game" | "pts_per_game" | "reb_total_per_game" | "ast_per_game" | "ts_pct" | "efg_pct";
const FORM_COLUMNS: { key: FormKey; format: (value: number | null) => string }[] = [
  { key: "min_per_game", format: value => value?.toFixed(1) ?? "—" },
  { key: "pts_per_game", format: value => value?.toFixed(1) ?? "—" },
  { key: "reb_total_per_game", format: value => value?.toFixed(1) ?? "—" },
  { key: "ast_per_game", format: value => value?.toFixed(1) ?? "—" },
  { key: "ts_pct", format: value => formatPercent(value) },
  { key: "efg_pct", format: value => formatPercent(value) },
];

/** Up or down against the season, ignoring differences that round away at the shown precision. */
function formTrend(value: number | null, season: number | null): "up" | "down" | null {
  if (value == null || season == null) return null;
  const scale = Math.abs(season) < 1 ? 1000 : 10;
  const delta = Math.round(value * scale) - Math.round(season * scale);
  return delta > 0 ? "up" : delta < 0 ? "down" : null;
}

function teamName(tricode: string): string {
  return catalogBranding.teams.find(entry => entry.tricode === tricode)?.artwork_name ?? tricode;
}

/** The summary's career figure: the Career row's value, or the best season for season-only DPM. */
function careerLine(metric: (typeof HERO_METRICS)[number], career: PlayerCareerResponse | null): { label: string; value: string; note?: string } | null {
  // A one-season career would only repeat the season's value.
  if (!career || career.seasons.length < 2) return null;
  if (metric.key === "dpm") {
    let best: { season: string; value: number } | null = null;
    for (const entry of career.seasons) {
      const value = entry.item?.metrics.dpm;
      if (value != null && (best == null || value > best.value)) best = { season: entry.season, value };
    }
    return best ? { label: "Best", value: metric.format(best.value), note: best.season } : null;
  }
  const value = career.career?.metrics[metric.key];
  return value == null ? null : { label: "Career", value: metric.format(value) };
}

interface WorkbenchPlayerProfileProps {
  profile: PlayerProfile;
  games: PlayerGameLogItem[];
  catalog?: WorkbenchCatalog | null;
  bio?: PlayerBio | null;
  impact?: ImpactResponse | null;
  hero?: ProfileHeroStats | null;
  /** The career table's rows, read with the page; null fetches them in the browser. */
  career?: PlayerCareerResponse | null;
  /** The shared filter bar, placed directly under the page header. */
  filterBar?: ReactNode;
}

export function WorkbenchPlayerProfile({
  profile,
  games,
  catalog = null,
  bio = null,
  impact = null,
  hero = null,
  career = null,
  filterBar
}: WorkbenchPlayerProfileProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Old links name the Combine tab "measurements".
  const requestedTab = (searchParams.get("tab") === "measurements" ? "combine" : searchParams.get("tab")) as ProfileTab | null;
  const [tab, setTab] = useState<ProfileTab>(requestedTab && PROFILE_TABS.includes(requestedTab) ? requestedTab : "overview");
  const [selectedFact, setSelectedFact] = useState<string | null>(null);
  const [exposureMode, setExposureMode] = useState<CountingExposureMode>("per_game");
  const [exporting, setExporting] = useState(false);

  const cardSvgRef = useRef<SVGSVGElement | null>(null);

  const { favorites, toggleFavorite, compareTray, toggleCompare } =
    useWorkspace();

  const { player, context, summaries, latest_team, forecast_status } = profile;

  const heroQuery = hero?.query ?? null;
  const heroKeys = useMemo(() => HERO_METRICS.map((metric) => metric.key), []);
  const { ranks } = useCohortRanks(heroQuery ?? EMPTY_QUERY, heroQuery ? heroKeys : [], hero?.goodDirections ?? {});
  // Values, percentiles and ranks all come from the player's Stats row and cohort.
  const careerItem = career?.player_id === player.id && career.phase === context.phase ? career : null;
  const heroStats = HERO_METRICS.map((metric) => {
    const value = hero?.item?.metrics[metric.key];
    return {
      key: metric.key,
      label: metric.label,
      value: metric.format(value ?? null),
      percentile: hero?.item ? orientedPercentile(hero.item.percentiles?.[metric.key], hero.goodDirections[metric.key]) : null,
      rank: hero?.item ? ranks[metric.key]?.[player.id] ?? null : null,
      career: careerLine(metric, careerItem),
    };
  });
  // Who the season's games were played for, named when the header shows another (current) team.
  const seasonTeams = careerItem?.seasons.find(entry => entry.season === context.season)?.item?.teams
    ?? (latest_team ? [latest_team.tricode] : []);
  const headerTeam = bio?.current_team?.team_tricode ?? latest_team?.tricode ?? null;
  const showSeasonTeam = seasonTeams.length > 0 && (seasonTeams.length > 1 || seasonTeams[0] !== headerTeam);

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
      <PlayerBioHeader name={player.name} playerId={player.id} portraitUrl={player.portrait_url}
        team={latest_team ? { id: latest_team.id, tricode: latest_team.tricode, name: latest_team.name } : null}
        bio={bio} currentSeason={catalog?.default_season ?? null}
        actions={<>
          <IconButton size="sm" variant="secondary" icon="star" filled={isFavorite} pressed={isFavorite}
            label={isFavorite ? "Remove from favorites" : "Add to favorites"} onClick={() => toggleFavorite(player.id)} />
          <IconButton size="sm" variant="secondary" icon={inTray ? "check" : "plus"} pressed={inTray}
            label={inTray ? "Remove from compare tray" : "Add to compare tray"} onClick={() => toggleCompare(player.id)} />
          <Menu align="right" renderTrigger={props => <IconButton {...props} size="sm" variant="secondary" icon="download"
            label={exporting ? "Exporting…" : "Export"} loading={exporting} />}>
            <MenuItem icon="download" label="Export PNG" disabled={exporting} onClick={() => void handleExportPng()} />
            <MenuItem icon="page" label="Export SVG" disabled={exporting} onClick={handleExportSvg} />
          </Menu>
          <Menu align="right" renderTrigger={props => <MenuTrigger {...props} size="sm">Explore</MenuTrigger>}>
            {explore.map(item => <MenuItem key={item.href} icon={item.icon} label={item.label} onClick={() => router.push(item.href)} />)}
          </Menu>
        </>}
      />
      {/* Scope controls take the console grey of the table's view tabs, as on Stats (row 2, 37). */}
      <ControlScope tone="console">{filterBar}</ControlScope>

      <Tabs value={tab} onChange={selectTab}>
      <ProfileLayout
        hero={<section className="player-season-summary" aria-label="Season summary">
          <div className="player-season-summary-heading">
            <h2>{contextLine}</h2>
            {hero && <Tooltip content={`Bars are percentiles among ${hero.eligible.toLocaleString("en-US")} eligible players (the Stats cohort); ranks are within the top ${RANK_PAGE_LIMIT}.`}>
              <span className="player-season-summary-info" tabIndex={0} role="img" aria-label="How percentiles are ranked"><Icon name="info" size={14} /></span>
            </Tooltip>}
            {showSeasonTeam && <span className="player-season-team">
              {seasonSummary?.gp != null ? `${seasonSummary.gp} games with` : "Played for"}
              <TeamLogoStack teams={seasonTeams} size={18} decorative />
              {seasonTeams.map(teamName).join(" / ")}
            </span>}
          </div>
          <dl className="player-summary-strip" role="group" aria-label="Season summary">
            {heroStats.map(stat => <div key={stat.key} className="player-summary-stat">
              <dt>{stat.label}{stat.rank != null && <span className="player-summary-rank" title={`${ordinal(stat.rank)} of the top ${RANK_PAGE_LIMIT}`}>{ordinal(stat.rank)}</span>}</dt>
              <dd>
                <span className="player-summary-value">{stat.value}</span>
                {stat.percentile != null && <span className="player-summary-bar" role="meter" aria-label={`${stat.label} percentile`}
                  aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(stat.percentile)}
                  aria-valuetext={`${ordinal(Math.round(stat.percentile))} percentile`}
                  style={{ "--pct": `${Math.max(0, Math.min(100, stat.percentile))}%` } as CSSProperties} />}
                {stat.career && <span className="player-summary-career">{stat.career.label} <strong>{stat.career.value}</strong>{stat.career.note && ` (${stat.career.note})`}</span>}
              </dd>
            </div>)}
          </dl>
        </section>}
        tabs={<TabsList aria-label="Profile sections">
          <TabTrigger value="overview">Overview</TabTrigger>
          <TabTrigger value="games">Game Log</TabTrigger>
          <TabTrigger value="tracking">Tracking</TabTrigger>
          {bio?.combine && <TabTrigger value="combine">Combine</TabTrigger>}
        </TabsList>}
      >
        <TabsContent value="overview" className="player-tab-body">
      {catalog && <PlayerCareerTable playerId={player.id} catalog={catalog} season={context.season} phase={context.phase}
        firstCoveredSeason={catalog.stats_scopes?.filter(scope => scope.phase === context.phase).map(scope => scope.season).sort()[0] ?? null}
        draftYear={bio?.draft?.year ?? null} initialCareer={career}
        awards={bio?.reference ? { bySeason: bio.reference.awards, allStarSeasons: bio.reference.all_star_seasons, source: bio.reference.source } : null} />}
      <div className="player-overview-duo">
        <ImpactPlayerCard data={impact} compact />
        <section className="player-open-section" aria-label="Recent form">
          <header className="player-open-heading"><h2>Recent form</h2><span>Last 10 and last 5 against the season</span></header>
          <div className="player-form-table" role="region" aria-label="Recent form table" tabIndex={0}>
            <table>
              <thead><tr><th>Window</th><th className="num">GP</th><th className="num">MPG</th><th className="num">PTS</th><th className="num">REB</th><th className="num">AST</th><th className="num">TS%</th><th className="num">eFG%</th></tr></thead>
              <tbody>
                {([["Season", seasonSummary], ["Last 10", last10Summary], ["Last 5", last5Summary]] as const).map(([label, sum]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    <td className="num">{sum?.gp ?? "—"}</td>
                    {FORM_COLUMNS.map(column => {
                      const value = sum?.[column.key] ?? null;
                      const trend = label === "Season" ? null : formTrend(value, seasonSummary?.[column.key] ?? null);
                      return <td key={column.key} className={`num ${trend ? `player-form-${trend}` : ""}`}
                        title={trend ? `${trend === "up" ? "Above" : "Below"} the season` : undefined}>{column.format(value)}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
        </TabsContent>
        <TabsContent value="games" className="player-tab-body">
      {tab === "games" && <section className="pc12-profile-trajectory" aria-label="Headline result"><ResearchTrendCharts games={games} playerName={player.name} /></section>}
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
            <Segmented<CountingExposureMode> label="Game log exposure" size="sm" value={exposureMode} onChange={setExposureMode}
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
                      <Button size="lg" onClick={() => setSelectedFact(g.game_id)} title="Inspect raw cryptographic lineage">
                        Lineage
                      </Button>
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
        {bio?.combine && <TabsContent value="combine" className="player-tab-body">
          {tab === "combine" && <PlayerCombinePanel playerId={player.id} name={player.name} />}
        </TabsContent>}
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
