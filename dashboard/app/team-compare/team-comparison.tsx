"use client";

import { Fragment, useEffect, useRef, useState, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { HistoricalSlate, LivePlayer } from "@/lib/live";
import { liveRequest } from "@/lib/live";
import type { PlayerResearchItem, TeamDetailResponse, TeamFourFactorsResponse, TeamScheduleGameItem, TeamScheduleResponse, WorkbenchCatalog, WorkbenchQueryResponse } from "@/lib/types";
import { formatDate, throughDateFromBefore } from "@/lib/format-date";
import { teamAccent, teamBrandColor } from "@/lib/team-colors";
import { TeamLogo } from "@/components/team-logo";
import { TeamGrid } from "@/components/team-grid";
import { PlayerPortrait } from "@/components/player-portrait";
import { BrandMark } from "@/components/brand";
import { CourtLensWordmark } from "@/components/courtlens-wordmark";
import { PageHeader } from "@/components/ui/panel";
import { FilterBar } from "@/components/ui/filter-bar";
import { DataDetails } from "@/components/ui/data-details";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchField } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { Button, IconButton, Select, Segmented } from "@/components/ui/kit";
import type starterSnapshot from "./starter-evidence.bf09e1d964030a116b25996df57e53b051f5f45500e0343781a9d7784bc3d563.json";

type StarterEvidence = (typeof starterSnapshot.scopes)[number];

export type TeamSide = {
  /** Franchise id: the selection the URL, picker and swap keep. */
  teamId: string;
  /** The id this season's games are stored under (SEA for the Thunder in 2005-06). */
  dataTeamId: string;
  season: string;
  beforeDate: string;
  detail: TeamDetailResponse | null;
  factors: TeamFourFactorsResponse | null;
  schedule: TeamScheduleResponse | null;
  players: WorkbenchQueryResponse | null;
  starterEvidence: StarterEvidence | null;
};

type RotationMetricSpec = {
  value: string;
  label: string;
  title: string;
  group: string;
  signed?: boolean;
  unit?: "pct" | "int";
  lowBetter?: boolean;
};

const ROTATION_METRICS: RotationMetricSpec[] = [
  { value: "dpm", label: "DARKO", title: "Daily Plus-Minus", group: "Impact", signed: true },
  { value: "o_dpm", label: "ODPM", title: "Offensive Daily Plus-Minus", group: "Impact", signed: true },
  { value: "d_dpm", label: "DDPM", title: "Defensive Daily Plus-Minus", group: "Impact", signed: true },
  { value: "pts_per_game", label: "PPG", title: "Points Per Game", group: "Counting" },
  { value: "reb_per_game", label: "RPG", title: "Rebounds Per Game", group: "Counting" },
  { value: "ast_per_game", label: "APG", title: "Assists Per Game", group: "Counting" },
  { value: "stl_per_game", label: "SPG", title: "Steals Per Game", group: "Counting" },
  { value: "blk_per_game", label: "BPG", title: "Blocks Per Game", group: "Counting" },
  { value: "tov_per_game", label: "TOV", title: "Turnovers Per Game", group: "Counting", lowBetter: true },
  { value: "oreb_per_game", label: "OREB", title: "Offensive Rebounds Per Game", group: "Counting" },
  { value: "dreb_per_game", label: "DREB", title: "Defensive Rebounds Per Game", group: "Counting" },
  { value: "ts_pct", label: "TS%", title: "True Shooting Percentage", group: "Shooting & Efficiency", unit: "pct" },
  { value: "efg_pct", label: "eFG%", title: "Effective Field Goal Percentage", group: "Shooting & Efficiency", unit: "pct" },
  { value: "fg_pct", label: "FG%", title: "Field Goal Percentage", group: "Shooting & Efficiency", unit: "pct" },
  { value: "fg2_pct", label: "2P%", title: "Two-Point Percentage", group: "Shooting & Efficiency", unit: "pct" },
  { value: "fg3_pct", label: "3P%", title: "Three-Point Percentage", group: "Shooting & Efficiency", unit: "pct" },
  { value: "ft_pct", label: "FT%", title: "Free Throw Percentage", group: "Shooting & Efficiency", unit: "pct" },
  { value: "ftr", label: "FTR", title: "Free Throw Rate", group: "Shooting & Efficiency", unit: "pct" },
  { value: "min_per_game", label: "MPG", title: "Minutes Per Game", group: "Exposure" },
  { value: "gp", label: "GP", title: "Games Played", group: "Exposure", unit: "int" },
];
const DEFAULT_ROTATION_KEYS = ["dpm", "o_dpm", "d_dpm", "pts_per_game", "min_per_game"];
const ROTATION_LIMIT = 8;

type TeamMetricSpec = {
  key: string;
  short: string;
  label: string;
  group: string;
  lowBetter?: boolean;
  neutral?: boolean;
  read: (side: TeamSide) => { num: number | null; text: string };
};

const number = (n: number | null | undefined, signed = false) => n == null ? "—" : `${signed && n > 0 ? "+" : ""}${n.toFixed(1)}`;
const percentage = (n: number | null | undefined) => n == null ? "—" : `${(n * 100).toFixed(1)}%`;
const splitRecord = (split: { wins: number; losses: number; win_pct: number | null } | null | undefined) =>
  split ? { num: split.win_pct ?? (split.wins + split.losses > 0 ? split.wins / (split.wins + split.losses) : null), text: `${split.wins}–${split.losses}` } : { num: null, text: "—" };
const factorVal = (side: TeamSide, list: "offense_factors" | "defense_factors", key: string) => {
  const item = side.factors?.[list]?.find(m => m.key === key);
  const v = item?.value ?? null;
  return { num: v, text: item?.unit === "percentage" ? percentage(v) : key.endsWith("ftr") ? v?.toFixed(3) ?? "—" : number(v) };
};

const TEAM_METRICS: TeamMetricSpec[] = [
  { key: "record", short: "REC", label: "Record", group: "Overview & Record",
    read: s => s.detail ? { num: s.detail.record.win_pct ?? s.detail.record.wins, text: `${s.detail.record.wins}–${s.detail.record.losses}` } : { num: null, text: "—" } },
  { key: "win_pct", short: "WIN%", label: "Win Percentage", group: "Overview & Record",
    read: s => ({ num: s.detail?.record.win_pct ?? null, text: percentage(s.detail?.record.win_pct) }) },
  { key: "mov", short: "MOV", label: "Net Scoring Margin", group: "Overview & Record",
    read: s => {
      const v = s.detail?.production.pts_per_game != null && s.detail.allowance.pts_allowed_per_game != null
        ? s.detail.production.pts_per_game - s.detail.allowance.pts_allowed_per_game : null;
      return { num: v, text: number(v, true) };
    } },
  { key: "home", short: "HOME", label: "Home Record", group: "Overview & Record", read: s => splitRecord(s.detail?.home_split ?? s.schedule?.home_split) },
  { key: "away", short: "AWAY", label: "Away Record", group: "Overview & Record", read: s => splitRecord(s.detail?.away_split ?? s.schedule?.away_split) },
  { key: "off_rating", short: "ORTG", label: "Offensive Rating", group: "Pace & Efficiency", read: s => ({ num: s.factors?.off_rating ?? null, text: number(s.factors?.off_rating) }) },
  { key: "def_rating", short: "DRTG", label: "Defensive Rating", group: "Pace & Efficiency", lowBetter: true, read: s => ({ num: s.factors?.def_rating ?? null, text: number(s.factors?.def_rating) }) },
  { key: "net_rating", short: "NET", label: "Net Rating", group: "Pace & Efficiency", read: s => ({ num: s.factors?.net_rating ?? null, text: number(s.factors?.net_rating, true) }) },
  { key: "pace", short: "PACE", label: "Pace", group: "Pace & Efficiency", neutral: true, read: s => ({ num: s.factors?.pace ?? null, text: number(s.factors?.pace) }) },
  { key: "ppg", short: "PPG", label: "Points Per Game", group: "Scoring & Shooting", read: s => ({ num: s.detail?.production.pts_per_game ?? null, text: number(s.detail?.production.pts_per_game) }) },
  { key: "opp_ppg", short: "OPPG", label: "Opponent PPG Allowed", group: "Scoring & Shooting", lowBetter: true, read: s => ({ num: s.detail?.allowance.pts_allowed_per_game ?? null, text: number(s.detail?.allowance.pts_allowed_per_game) }) },
  { key: "fg_pct", short: "FG%", label: "Field Goal %", group: "Scoring & Shooting", read: s => ({ num: s.detail?.production.fg_pct ?? null, text: percentage(s.detail?.production.fg_pct) }) },
  { key: "fg3_pct", short: "3P%", label: "Three-Point %", group: "Scoring & Shooting", read: s => ({ num: s.detail?.production.fg3_pct ?? null, text: percentage(s.detail?.production.fg3_pct) }) },
  { key: "ft_pct", short: "FT%", label: "Free Throw %", group: "Scoring & Shooting", read: s => ({ num: s.detail?.production.ft_pct ?? null, text: percentage(s.detail?.production.ft_pct) }) },
  { key: "opp_fg_pct", short: "OFG%", label: "Opponent FG % Allowed", group: "Scoring & Shooting", lowBetter: true,
    read: s => ({ num: s.factors?.shooting_percentages.opp_fg_pct ?? null, text: percentage(s.factors?.shooting_percentages.opp_fg_pct) }) },
  { key: "opp_fg3_pct", short: "O3P%", label: "Opponent 3P % Allowed", group: "Scoring & Shooting", lowBetter: true,
    read: s => ({ num: s.factors?.shooting_percentages.opp_fg3_pct ?? null, text: percentage(s.factors?.shooting_percentages.opp_fg3_pct) }) },
  { key: "efg_pct", short: "eFG%", label: "Effective FG %", group: "Four Factors (Offense)", read: s => factorVal(s, "offense_factors", "efg_pct") },
  { key: "tov_pct", short: "TOV%", label: "Turnover %", group: "Four Factors (Offense)", lowBetter: true, read: s => factorVal(s, "offense_factors", "tov_pct") },
  { key: "oreb_pct", short: "ORB%", label: "Offensive Rebound %", group: "Four Factors (Offense)", read: s => factorVal(s, "offense_factors", "oreb_pct") },
  { key: "ftr", short: "FTR", label: "Free Throw Rate", group: "Four Factors (Offense)", read: s => factorVal(s, "offense_factors", "ftr") },
  { key: "opp_efg_pct", short: "OeFG%", label: "Opponent Effective FG %", group: "Four Factors (Defense)", lowBetter: true, read: s => factorVal(s, "defense_factors", "opp_efg_pct") },
  { key: "opp_tov_pct", short: "OTOV%", label: "Opponent Turnover % Forced", group: "Four Factors (Defense)", read: s => factorVal(s, "defense_factors", "opp_tov_pct") },
  { key: "dreb_pct", short: "DRB%", label: "Defensive Rebound %", group: "Four Factors (Defense)", read: s => factorVal(s, "defense_factors", "dreb_pct") },
  { key: "opp_oreb_pct", short: "OORB%", label: "Opponent Offensive Rebound %", group: "Four Factors (Defense)", lowBetter: true, read: s => factorVal(s, "defense_factors", "opp_oreb_pct") },
  { key: "opp_ftr", short: "OFTR", label: "Opponent Free Throw Rate", group: "Four Factors (Defense)", lowBetter: true, read: s => factorVal(s, "defense_factors", "opp_ftr") },
];
const DEFAULT_TEAM_KEYS = ["record", "ppg", "opp_ppg", "off_rating", "def_rating", "net_rating", "pace", "efg_pct", "tov_pct", "oreb_pct", "ftr"];
const TEAM_LIMIT = 25;

const tricode = (side: TeamSide) => side.detail?.team.tricode ?? "—";
/** The season's own code (SEA, or CHA for the Bobcats with the season) for artwork and colours. */
const brandKey = (side: TeamSide) => side.detail?.team.tricode ?? side.teamId;
const teamName = (side: TeamSide) => side.detail?.team.name ?? "Team unavailable";
const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
type TeamTheme = CSSProperties & { "--tc-team-a": string; "--tc-team-b": string; "--tc-brand-a": string; "--tc-brand-b": string };

function formatPlayerMetric(spec: RotationMetricSpec, value: number | null | undefined) {
  if (value == null) return "—";
  if (spec.unit === "pct") return `${(value * 100).toFixed(1)}%`;
  if (spec.unit === "int") return `${Math.round(value)}`;
  return number(value, spec.signed);
}

type SeriesSummary = {
  label: string;
  winsA: number;
  winsB: number;
  winner: "a" | "b" | null;
  text: string;
  detail: string;
  games: TeamScheduleGameItem[];
};

function seriesSummary(a: TeamSide, b: TeamSide, phase: string): SeriesSummary | null {
  if (a.season !== b.season || a.teamId === b.teamId || !a.schedule) return null;
  const codeA = tricode(a), codeB = tricode(b);
  const games = a.schedule.games.filter(g => g.opponent_id === b.dataTeamId || (codeB !== "—" && g.opponent_tricode === codeB));
  const winsA = games.filter(g => g.is_win === true).length;
  const winsB = games.filter(g => g.is_win === false).length;
  const winner: "a" | "b" | null = winsA > winsB ? "a" : winsB > winsA ? "b" : null;
  const label = phase === "playoffs" ? "Playoff Series" : "Season Series";
  const detail = games.length === 0
    ? `No head-to-head ${phase === "playoffs" ? "playoff" : "regular-season"} games observed in ${a.season}.`
    : games.map(g => `${formatDate(g.game_date)}: ${codeA} ${g.team_points ?? "—"}–${g.opponent_points ?? "—"} ${codeB}`).join(" · ");
  return { label, winsA, winsB, winner, text: `${codeA} ${winsA}–${winsB} ${codeB}`, detail, games };
}

export function TeamComparison({ a, b, catalog, phase }: { a: TeamSide; b: TeamSide; catalog: WorkbenchCatalog; phase: string }) {
  const router = useRouter(), params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const view = params.get("view") === "stats" || params.get("tab") === "factors" ? "stats" : "rotations";
  // Verified starters exist only at a phase's end; without them on both sides, order by rank.
  const observedUnit = [a, b].every(side => side.starterEvidence?.unit_players.length === 5);
  const order = params.get("order") === "rank" || !observedUnit ? "rank" : "position";
  const depth = params.get("depth") === "8" ? "8" : params.get("depth") === "all" ? "all" : "12";
  const parsedRotKeys = (params.get("rotMetrics")?.split(",") ?? []).filter(k => ROTATION_METRICS.some(m => m.value === k));
  const rotKeys = parsedRotKeys.length > 0 ? parsedRotKeys : DEFAULT_ROTATION_KEYS;
  // DARKO is its forecast at the phase's last game date, so an earlier Through has none to show.
  const darkoOff = [a, b].some(side => side.players?.darko?.status === "unavailable");
  const rotOptions = ROTATION_METRICS.filter(m => rotKeys.includes(m.value)).map(m => {
    const disabled = darkoOff && m.group === "Impact";
    return { ...m, disabled, title: disabled ? `${m.title}: published for the end of the ${phase === "playoffs" ? "playoffs" : "regular season"} only` : m.title };
  });
  const requestedMetric = params.get("metric");
  const activeSpec = rotOptions.find(m => m.value === requestedMetric && !m.disabled) ?? rotOptions.find(m => !m.disabled) ?? ROTATION_METRICS.find(m => m.value === "pts_per_game")!;
  const metric = activeSpec.value;
  const parsedTeamKeys = (params.get("teamMetrics")?.split(",") ?? []).filter(k => TEAM_METRICS.some(m => m.key === k));
  const teamKeys = parsedTeamKeys.length > 0 ? parsedTeamKeys : DEFAULT_TEAM_KEYS;
  const [picker, setPicker] = useState<"a" | "b" | null>(null);
  const [details, setDetails] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drawerScope, setDrawerScope] = useState<"rotations" | "stats">("rotations");
  const [metricQuery, setMetricQuery] = useState("");
  const metricLabel = activeSpec.label;
  const series = seriesSummary(a, b, phase);
  const theme: TeamTheme = {
    "--tc-team-a": teamAccent(brandKey(a), a.season) ?? "var(--color-identity-a)",
    "--tc-team-b": teamAccent(brandKey(b), b.season) ?? "var(--color-identity-b)",
    "--tc-brand-a": teamBrandColor(brandKey(a), a.season) ?? "var(--color-surface-3)",
    "--tc-brand-b": teamBrandColor(brandKey(b), b.season) ?? "var(--color-surface-3)",
  };
  const presentation = (values: Record<string, string>) => {
    const url = new URL(window.location.href);
    Object.entries(values).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    });
    window.history.replaceState(null, "", url);
  };
  const change = (values: Record<string, string>) => {
    const next = new URLSearchParams(params);
    next.set("teamA", a.teamId); next.set("teamB", b.teamId);
    next.set("seasonA", a.season); next.set("seasonB", b.season); next.set("phase", phase);
    Object.entries(values).forEach(([key, value]) => next.set(key, value));
    startTransition(() => router.push(`/team-compare?${next}`, { scroll: false }));
  };
  function rows(side: TeamSide) {
    // Membership, box scores and minutes come from the team's actual participation cohort.
    // DARKO remains a player-season model value, never a team-stint estimate.
    const ranked = (side.players?.items ?? []).map<PlayerResearchItem>(player => {
      const stint = side.detail?.player_cohort.find(row => row.player_id === player.player_id);
      const gp = stint?.games_played ?? player.games_played;
      return { ...player, games_played: gp,
        metrics: { ...player.metrics, gp, pts_per_game: stint?.pts_per_game ?? player.metrics.pts_per_game ?? null,
          min_per_game: stint?.total_minutes != null && gp > 0 ? stint.total_minutes / gp : player.metrics.min_per_game ?? null } };
    }).sort((x, y) => {
      const vx = x.metrics[metric], vy = y.metrics[metric];
      if (vx == null && vy == null) return 0;
      if (vx == null) return 1;
      if (vy == null) return -1;
      return activeSpec.lowBetter ? vx - vy : vy - vx;
    });
    const limited = depth === "all" ? ranked : ranked.slice(0, Number(depth));
    if (order === "rank") return limited;
    const evidence = side.starterEvidence;
    if (!evidence?.unit_players.length) return limited;
    const unit = new Set(evidence.unit_players.map(player => player.player_id));
    const observedPosition = (player: PlayerResearchItem) => evidence.unit_players.find(entry => entry.player_id === player.player_id)?.position ?? "";
    const positionOrder = (code: string) => code === "G" ? 0 : code === "F" ? 1 : code === "C" ? 2 : 3;
    const firstFive = ranked.filter(player => unit.has(player.player_id)).sort((x, y) => positionOrder(observedPosition(x)) - positionOrder(observedPosition(y)) || (x.position ? POSITIONS.indexOf(x.position) : 5) - (y.position ? POSITIONS.indexOf(y.position) : 5) || x.player_id.localeCompare(y.player_id));
    const rest = ranked.filter(player => !unit.has(player.player_id)).sort((x, y) => (side.detail?.player_cohort.find(row => row.player_id === y.player_id)?.total_minutes ?? -Infinity) - (side.detail?.player_cohort.find(row => row.player_id === x.player_id)?.total_minutes ?? -Infinity) || x.player_id.localeCompare(y.player_id));
    return depth === "all" ? [...firstFive, ...rest] : [...firstFive, ...rest].slice(0, Number(depth));
  }
  const playersA = rows(a), playersB = rows(b);
  const count = Math.max(playersA.length, playersB.length);
  const startsLabel = (side: TeamSide, player: PlayerResearchItem) => {
    const entry = side.starterEvidence?.players.find(row => row.player_id === player.player_id);
    return entry?.starts == null ? "— GS" : `${entry.starts}${entry.unknown_appearances ? "+" : ""} GS`;
  };
  const unitRole = (side: TeamSide, player: PlayerResearchItem | undefined) => side.starterEvidence?.unit_players.find(row => row.player_id === player?.player_id)?.position ?? "—";
  const seasonPicker = (side: TeamSide, key: "a" | "b") => <Select size="sm" aria-label={`Team ${key.toUpperCase()} season`} value={side.season}
    onChange={e => change({ [key === "a" ? "seasonA" : "seasonB"]: e.target.value })}>
    {[...catalog.seasons].reverse().map(season => <option key={season}>{season}</option>)}
  </Select>;
  const teamSlot = (side: TeamSide, key: "a" | "b") => <div className="tc-team" data-side={key}>
    <div className="tc-team-art"><TeamLogo team={brandKey(side)} season={side.season} size={144} />
      <span className="tc-team-edit"><IconButton size="sm" variant="ghost" icon="search" label={`Choose ${key === "a" ? "left" : "right"} team`} onClick={() => setPicker(key)} /></span>
    </div>
    <h2>{teamName(side)}</h2>
    <div className="tc-team-controls"><Button size="xs" variant="ghost" iconAfter="chevron-down" aria-label={`Change Team ${key.toUpperCase()}: ${teamName(side)}`} onClick={() => setPicker(key)}>{tricode(side)}</Button>{seasonPicker(side, key)}</div>
    <p>{side.detail ? `${side.detail.record.wins}–${side.detail.record.losses} · ${side.detail.record.games_played} GP` : "No games in this scope"}</p>
  </div>;
  const playerCell = (player: PlayerResearchItem | undefined, side: TeamSide, key: "a" | "b", leading: boolean, gap: number | null) => <td className="tc-player-cell" data-side={key} data-leading={leading || undefined}>
    {player ? <div className="tc-player">
      <PlayerPortrait playerId={player.player_id} name={player.player_name} portraitUrl={player.portrait_url} era={{ season: side.season, team: tricode(side) }} size="md" />
      <div className="tc-player-name"><Link href={`/players/${player.player_id}?season=${side.season}&phase=${phase}&beforeDate=${side.beforeDate}`} title={player.player_name}><span className="tc-player-label">{player.player_name}</span></Link>
        <span><span title="Estimated position">{player.position ?? "Position unknown"}</span><span className="tc-games"> · {player.games_played} GP</span><span className="tc-starts" title="Verified starts in games with a complete starting five. A plus means additional appearances have unknown start status.">{startsLabel(side, player)}</span></span>
        {leading && gap != null && <span className="sr-only">{activeSpec.lowBetter ? "Lower" : "Higher"} {metricLabel} in this pair by {gap.toFixed(1)}.</span>}</div>
      <strong className="tc-rating" title={`${player.player_name}: ${metricLabel}`}>{formatPlayerMetric(activeSpec, player.metrics[metric])}</strong>
    </div> : <span className="tc-unknown">—</span>}
  </td>;

  const needle = metricQuery.trim().toLowerCase();
  const rotGroups = [...new Set(ROTATION_METRICS.map(m => m.group))].map(group => ({
    label: group,
    items: ROTATION_METRICS.filter(m => m.group === group && (!needle || [m.label, m.title, m.value].some(t => t.toLowerCase().includes(needle)))),
  })).filter(g => g.items.length > 0);
  const teamGroups = [...new Set(TEAM_METRICS.map(m => m.group))].map(group => ({
    label: group,
    items: TEAM_METRICS.filter(m => m.group === group && (!needle || [m.short, m.label, m.key].some(t => t.toLowerCase().includes(needle)))),
  })).filter(g => g.items.length > 0);

  return <div className="tc-page" aria-busy={pending} style={theme}>
    <PageHeader icon="swap" title="Team Comparison" subtitle="Two team seasons. One side-by-side view." />
    <div className="tc-console"><FilterBar label="Team comparison controls" summary={phase === "playoffs" ? "Playoffs" : "Regular Season"}
      scope={<Segmented size="sm" label="Season phase" value={phase} options={[{ value: "regular_season", label: "Regular Season" }, { value: "playoffs", label: "Playoffs" }]} onChange={value => change({ phase: value })} />}
      modes={<div className="tc-modes">
        <Segmented size="sm" label="Comparison view" value={view} onChange={value => presentation({ view: value })} options={[{ value: "rotations", label: "Rotations" }, { value: "stats", label: "Team Stats" }]} />
        <Button size="sm" variant="primary" icon="sliders" onClick={() => { setDrawerScope(view); setEditing(true); }}>Edit Metrics</Button>
      </div>}
      details={<Button size="sm" variant="ghost" icon="info" onClick={() => setDetails(true)}>Data details</Button>} />
    </div>
    <div className="tc-column">
      <div className="tc-stack">
        <section className="tc-card" aria-label="Team comparison" data-pending={pending || undefined}>
          <div className="tc-teams">{teamSlot(a, "a")}
            <div className="tc-versus">
              {series && <div className="tc-series" title={series.detail}>
                <span className="sr-only">{series.label}: {series.text}</span>
                <strong className="tc-series-num" data-side="a" data-leading={series.winner === "a" || undefined} aria-hidden="true">{series.winsA}</strong>
                <span className="tc-series-sep" aria-hidden="true">-</span>
                <strong className="tc-series-num" data-side="b" data-leading={series.winner === "b" || undefined} aria-hidden="true">{series.winsB}</strong>
              </div>}
              <span>vs</span>
              <IconButton icon="swap" label="Swap teams and seasons" size="sm" onClick={() => change({ teamA: b.teamId, teamB: a.teamId, seasonA: b.season, seasonB: a.season })} />
            </div>
            {teamSlot(b, "b")}
          </div>
          {view === "rotations" ? <>
            <div className="tc-options"><Segmented size="sm" dense label="Rotation metric" value={metric} onChange={value => presentation({ metric: value })} options={rotOptions} />
              <div className="tc-order"><Segmented size="sm" dense label="Rotation order" value={order} onChange={value => presentation({ order: value })} options={[{ value: "rank", label: "By Rank" }, { value: "position", label: "By Position", disabled: !observedUnit, title: observedUnit ? undefined : "Verified starting fives are only available at the end of a phase" }]} />
                <Select size="sm" aria-label="Rotation depth" value={depth} onChange={e => presentation({ depth: e.target.value })}><option value="8">Top 8</option><option value="12">Top 12</option><option value="all">All Players</option></Select></div>
            </div>
            <table className="tc-rotations" aria-label="Paired player rotations"><colgroup><col /><col className="tc-rank-col" /><col /></colgroup>
              <thead><tr><th scope="col" aria-label={teamName(a)} /><th scope="col">{metricLabel === "DARKO" ? "DPM" : metricLabel}<br />{order === "rank" ? "Rank" : "Role"}</th><th scope="col" aria-label={teamName(b)} /></tr></thead>
              <tbody key={`${a.teamId}-${b.teamId}-${a.season}-${b.season}-${metric}-${order}-${depth}`} className="tc-fade">
                {Array.from({ length: count }, (_, i) => {
                  const first = playersA[i]?.metrics[metric], second = playersB[i]?.metrics[metric];
                  const scale = activeSpec.unit === "pct" ? 100 : 1;
                  const x = first == null ? null : Number((first * scale).toFixed(activeSpec.unit === "int" ? 0 : 1));
                  const y = second == null ? null : Number((second * scale).toFixed(activeSpec.unit === "int" ? 0 : 1));
                  const leader = x != null && y != null && x !== y ? (activeSpec.lowBetter ? x < y : x > y) ? "a" : "b" : null;
                  const gap = x != null && y != null ? Math.abs(x - y) : null;
                  return <Fragment key={i}>
                    {order === "position" && observedUnit && (i === 0 || i === 5) && <tr className="tc-section"><th colSpan={3} scope="colgroup"><span>{i === 0 ? "Most-used Starting Five" : "Bench & Alternate Starters"}</span></th></tr>}
                    <tr className="tc-matchup">{playerCell(playersA[i], a, "a", leader === "a", gap)}<th scope="row"><span>{order === "position" && observedUnit && i < 5 ? unitRole(a, playersA[i]) === unitRole(b, playersB[i]) ? unitRole(a, playersA[i]) : `${unitRole(a, playersA[i])}/${unitRole(b, playersB[i])}` : `#${i + 1}`}</span></th>{playerCell(playersB[i], b, "b", leader === "b", gap)}</tr>
                  </Fragment>;
                })}
                {!count && <tr><td colSpan={3}>No player data in this scope. Try another season or phase.</td></tr>}
              </tbody>
            </table>
          </> : <TeamStats a={a} b={b} selectedKeys={teamKeys} />}
          {view === "rotations" && <p className="tc-coverage">Verified starting lineups: {tricode(a)} {a.starterEvidence?.verified_games ?? "—"}/{a.starterEvidence?.team_games ?? a.detail?.record.games_played ?? "—"} games · {tricode(b)} {b.starterEvidence?.verified_games ?? "—"}/{b.starterEvidence?.team_games ?? b.detail?.record.games_played ?? "—"} games{!observedUnit ? " · Starting unit unavailable in this scope." : ""}{darkoOff ? " · DARKO is published for the end of the phase only." : ""}</p>}
          <footer className="tc-footer"><BrandMark size={20} framed={false} /><CourtLensWordmark height={16} /></footer>
        </section>
        <TeamGameHistoryTray a={a} b={b} phase={phase} releaseId={catalog.release_id} series={series} onUrlChange={presentation} />
      </div>
    </div>
    <Drawer isOpen={editing} onClose={() => setEditing(false)} title="Edit Metrics" className="pvp-drawer">
      <div className="pvp-drawer-body">
        <Segmented size="sm" dense label="Metric target" value={drawerScope} onChange={value => setDrawerScope(value)}
          options={[{ value: "rotations", label: "Rotation Metrics" }, { value: "stats", label: "Team Stats" }]} />
        <SearchField aria-label="Search metrics" placeholder="Search metrics (DARKO, PPG, ORTG, eFG%…)" value={metricQuery}
          onChange={e => setMetricQuery(e.target.value)} onClear={() => setMetricQuery("")} />
        {drawerScope === "rotations" ? <>
          <div className="pvp-drawer-tools">
            <span className="pvp-drawer-count" role="status">{rotKeys.length} / {ROTATION_LIMIT} selected</span>
            <Button size="sm" icon="reset" onClick={() => presentation({ rotMetrics: "", metric: "dpm" })}>Reset metrics</Button>
          </div>
          {rotGroups.map(group => <fieldset key={group.label} className="pvp-drawer-group">
            <legend>{group.label}</legend>
            {group.items.map(item => {
              const checked = rotKeys.includes(item.value);
              return <Checkbox key={item.value} id={`tc-rot-metric-${item.value}`} checked={checked}
                disabled={(!checked && rotKeys.length >= ROTATION_LIMIT) || (checked && rotKeys.length <= 1)}
                className="pvp-drawer-metric" aria-label={item.title}
                label={<span className="pvp-drawer-term"><abbr title={item.title}>{item.label}</abbr><span>{item.title}</span></span>}
                onChange={next => {
                  const updated = next ? [...rotKeys, item.value] : rotKeys.filter(k => k !== item.value);
                  const nextMetric = next ? item.value : updated.includes(metric) ? metric : updated[0] ?? "dpm";
                  presentation({ rotMetrics: updated.join(","), metric: nextMetric, view: "rotations" });
                }} />;
            })}
          </fieldset>)}
          {rotGroups.length === 0 && <p className="pvp-drawer-empty">No metric matches “{metricQuery.trim()}”.</p>}
        </> : <>
          <div className="pvp-drawer-tools">
            <span className="pvp-drawer-count" role="status">{teamKeys.length} / {TEAM_LIMIT} selected</span>
            <Button size="sm" icon="reset" onClick={() => presentation({ teamMetrics: "" })}>Reset metrics</Button>
          </div>
          {teamGroups.map(group => <fieldset key={group.label} className="pvp-drawer-group">
            <legend>{group.label}</legend>
            {group.items.map(item => {
              const checked = teamKeys.includes(item.key);
              return <Checkbox key={item.key} id={`tc-team-metric-${item.key}`} checked={checked}
                disabled={(!checked && teamKeys.length >= TEAM_LIMIT) || (checked && teamKeys.length <= 1)}
                className="pvp-drawer-metric" aria-label={item.label}
                label={<span className="pvp-drawer-term"><abbr title={item.label}>{item.short}</abbr><span>{item.label}</span></span>}
                onChange={next => {
                  const updated = next ? [...teamKeys, item.key] : teamKeys.filter(k => k !== item.key);
                  presentation({ teamMetrics: updated.join(","), view: "stats" });
                }} />;
            })}
          </fieldset>)}
          {teamGroups.length === 0 && <p className="pvp-drawer-empty">No metric matches “{metricQuery.trim()}”.</p>}
        </>}
      </div>
    </Drawer>
    <Modal className="roster-picker-modal" isOpen={picker !== null} onClose={() => setPicker(null)} title={`Choose Team ${picker?.toUpperCase() ?? ""}`} description="Choose a franchise, then set its season on the card.">
      <TeamGrid edgeHighlights={false} season={picker === "b" ? b.season : a.season} selected={picker === "a" ? a.teamId : b.teamId} onSelect={teamId => { if (picker) change({ [picker === "a" ? "teamA" : "teamB"]: teamId }); setPicker(null); }} />
    </Modal>
    <DataDetails open={details} onClose={() => setDetails(false)} scope={{ releaseId: catalog.release_id, phase }} rows={[
      { label: "Team A", value: `${teamName(a)} · ${a.season} · Through ${formatDate(throughDateFromBefore(a.beforeDate))}` },
      { label: "Team B", value: `${teamName(b)} · ${b.season} · Through ${formatDate(throughDateFromBefore(b.beforeDate))}` },
      ...(series ? [{ label: series.label, value: `${series.text} (${series.detail})` }] : []),
      { label: "Sources", value: "Retained sportsdataverse box scores; DARKO Daily Plus-Minus by Kostya Medvedovsky (darko.app). No illustrative fixture data." },
      { label: "DARKO dates", value: `${tricode(a)}: ${a.players?.darko?.data_date ? formatDate(a.players.darko.data_date) : "Unknown"}; ${tricode(b)}: ${b.players?.darko?.data_date ? formatDate(b.players.darko.data_date) : "Unknown"}` },
      { label: "DARKO interpretation", value: a.players?.darko?.limitations.join(" ") ?? "Unavailable" },
      { label: "Membership", value: "Team detail player_cohort; traded participants remain included. Counting and shooting rates use team-specific box scores; model ratings remain player-season values." },
      { label: "Starting unit method", value: "Most frequent actual five-player starting unit from admitted box scores in the selected team/season/phase and before the cutoff; ties use the most recently observed unit. Model ratings do not select starters. Remaining participants are sorted by team minutes." },
      { label: "Verified starting coverage", value: `${tricode(a)} ${a.starterEvidence?.verified_games ?? "Unknown"}/${a.starterEvidence?.team_games ?? "Unknown"} games; ${tricode(b)} ${b.starterEvidence?.verified_games ?? "Unknown"}/${b.starterEvidence?.team_games ?? "Unknown"} games. GS excludes games without complete starter evidence; + marks unknown appearances.` },
      { label: "Starting evidence source", value: "Retained sportsdataverse NBA box scores, raw position field, joined to immutable admitted player-game and team-game memberships. Exported offline with a read-only database transaction; visitor requests never fetch new data." },
      { label: "Team A context", value: JSON.stringify(a.players?.context ?? a.detail?.context), mono: true },
      { label: "Team B context", value: JSON.stringify(b.players?.context ?? b.detail?.context), mono: true },
      ...[...(a.players?.warnings ?? []), ...(b.players?.warnings ?? [])].map(value => ({ label: "Source warning", value })),
    ]} />
  </div>;
}

const smoothScroll = (): ScrollBehavior => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

type BoxTotals = {
  fgm: number | null; fga: number | null; fg3m: number | null; fg3a: number | null; ftm: number | null; fta: number | null;
  reb: number | null; ast: number | null; tov: number | null;
};

function sumTeamBox(players: LivePlayer[]): BoxTotals {
  const sum = (field: keyof LivePlayer["statistics"]): number | null => {
    if (!players.length) return null;
    let total = 0;
    for (const player of players) {
      const value = player.statistics[field];
      if (value == null || value.trim() === "" || !Number.isFinite(Number(value))) return null;
      total += Number(value);
    }
    return total;
  };
  return {
    fgm: sum("field_goals_made"), fga: sum("field_goals_attempted"),
    fg3m: sum("three_pointers_made"), fg3a: sum("three_pointers_attempted"),
    ftm: sum("free_throws_made"), fta: sum("free_throws_attempted"),
    reb: sum("rebounds_total"), ast: sum("assists"), tov: sum("turnovers"),
  };
}

function sortBoxPlayers(players: LivePlayer[], code: string): LivePlayer[] {
  const num = (v: string | null | undefined) => Number.isFinite(Number(v)) ? Number(v) : -1;
  return players
    .filter(p => p.team_source_id === code && p.reported_nonappearance !== true && num(p.statistics.minutes_seconds) > 0)
    .sort((x, y) => num(y.statistics.points) - num(x.statistics.points) || num(y.statistics.minutes_seconds) - num(x.statistics.minutes_seconds) || x.name.localeCompare(y.name));
}

function TeamGameHistoryTray({ a, b, phase, releaseId, series, onUrlChange }: {
  a: TeamSide; b: TeamSide; phase: string; releaseId: string; series: SeriesSummary | null;
  onUrlChange: (values: Record<string, string>) => void;
}) {
  const params = useSearchParams();
  const open = params.get("history") === "1";
  const [kept, setKept] = useState(open);
  if (open && !kept) setKept(true);
  const drawerRef = useRef<HTMLDivElement>(null), returnTo = useRef<number | null>(null);
  const games = series?.games ?? [];
  const [selectedId, setSelectedId] = useState<string>("");
  const [boxDepth, setBoxDepth] = useState<"top5" | "all">("top5");
  const [slates, setSlates] = useState<Record<string, HistoricalSlate | null>>({});

  const activeGame = games.find(g => g.game_id === selectedId) ?? games[0] ?? null;
  const activeKey = activeGame ? `${a.season}:${phase}:${activeGame.game_id}` : "";

  useEffect(() => {
    const drawer = drawerRef.current;
    if (!open || !drawer || returnTo.current == null) return;
    const follow = () => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" });
    follow();
    const observer = new ResizeObserver(follow);
    observer.observe(drawer);
    const stop = window.setTimeout(() => observer.disconnect(), 1200);
    return () => { observer.disconnect(); window.clearTimeout(stop); };
  }, [open]);

  useEffect(() => {
    if (!open || !activeGame || !activeKey || activeKey in slates) return;
    let alive = true;
    const sp = new URLSearchParams({
      slate_date: activeGame.game_date,
      game_id: activeGame.game_id,
      season: a.season,
      phase,
      beforeDate: a.beforeDate,
      releaseId,
    });
    liveRequest<HistoricalSlate>(`/historical?${sp}`)
      .then(res => { if (alive) setSlates(prev => ({ ...prev, [activeKey]: res })); })
      .catch(() => { if (alive) setSlates(prev => ({ ...prev, [activeKey]: null })); });
    return () => { alive = false; };
  }, [open, activeGame, activeKey, a.season, a.beforeDate, phase, releaseId, slates]);

  function toggle() {
    if (!open) {
      returnTo.current = window.scrollY;
      onUrlChange({ history: "1" });
      return;
    }
    const top = returnTo.current ?? window.scrollY;
    returnTo.current = null;
    onUrlChange({ history: "" });
    window.scrollTo({ top, behavior: smoothScroll() });
  }

  const codeA = tricode(a), codeB = tricode(b);
  const isLoading = open && activeGame !== null && !(activeKey in slates);
  const activeSlate = activeKey ? slates[activeKey] : null;
  const boxA = activeSlate?.players ? sortBoxPlayers(activeSlate.players, codeA) : [];
  const boxB = activeSlate?.players ? sortBoxPlayers(activeSlate.players, codeB) : [];
  const totalsA = sumTeamBox(boxA), totalsB = sumTeamBox(boxB);
  const shownA = boxDepth === "top5" ? boxA.slice(0, 5) : boxA;
  const shownB = boxDepth === "top5" ? boxB.slice(0, 5) : boxB;

  const shooting = (made: number | null, attempted: number | null) => ({
    text: made != null && attempted != null ? `${made}-${attempted}` : "—",
    percentage: made != null && attempted != null && attempted > 0 ? `(${((made / attempted) * 100).toFixed(0)}%)` : null,
    num: made != null && attempted != null && attempted > 0 ? made / attempted : null,
  });
  const total = (value: number | null) => ({ text: value?.toString() ?? "—", percentage: null, num: value });
  const totalSpecs = [
    { key: "fg", label: "FG", a: shooting(totalsA.fgm, totalsA.fga), b: shooting(totalsB.fgm, totalsB.fga) },
    { key: "3p", label: "3P", a: shooting(totalsA.fg3m, totalsA.fg3a), b: shooting(totalsB.fg3m, totalsB.fg3a) },
    { key: "ft", label: "FT", a: shooting(totalsA.ftm, totalsA.fta), b: shooting(totalsB.ftm, totalsB.fta) },
    { key: "reb", label: "REB", a: total(totalsA.reb), b: total(totalsB.reb) },
    { key: "ast", label: "AST", a: total(totalsA.ast), b: total(totalsB.ast) },
    { key: "tov", label: "TOV", a: total(totalsA.tov), b: total(totalsB.tov), lowBetter: true },
  ];

  const renderPlayerBox = (players: LivePlayer[], side: TeamSide, sideKey: "a" | "b") => <div className="tc-history-box-side" data-side={sideKey}>
    <table className="tc-history-box-table" aria-label={`${teamName(side)} game box score`}>
      <thead>
        <tr>
          <th scope="col"><span className="tc-history-box-team"><TeamLogo team={tricode(side)} season={side.season} size={16} /><span>{tricode(side)}</span></span></th>
          <th scope="col">MIN</th>
          <th scope="col">PTS</th>
          <th scope="col">REB</th>
          <th scope="col">AST</th>
          <th scope="col">FG</th>
          <th scope="col">3P</th>
        </tr>
      </thead>
      <tbody>
        {players.map(p => {
          const mins = Number.isFinite(Number(p.statistics.minutes_seconds)) ? Math.round(Number(p.statistics.minutes_seconds) / 60) : "—";
          return <tr key={p.source_id}>
            <th scope="row">
              {p.canonical_id
                ? <Link href={`/players/${p.canonical_id}?season=${side.season}&phase=${phase}&beforeDate=${side.beforeDate}`} title={p.name}>{p.name}</Link>
                : <span title={p.name}>{p.name}</span>}
            </th>
            <td>{mins}</td>
            <td className="tc-history-pts">{p.statistics.points ?? "—"}</td>
            <td>{p.statistics.rebounds_total ?? "—"}</td>
            <td>{p.statistics.assists ?? "—"}</td>
            <td>{p.statistics.field_goals_made ?? "—"}-{p.statistics.field_goals_attempted ?? "—"}</td>
            <td>{p.statistics.three_pointers_made ?? "—"}-{p.statistics.three_pointers_attempted ?? "—"}</td>
          </tr>;
        })}
      </tbody>
    </table>
  </div>;

  return <div className="tc-tray">
    {kept && <div className="tc-tray-drawer" data-open={open || undefined} ref={drawerRef} inert={!open}>
      <div className="tc-tray-clip">
        <div className="tc-tray-body" id="tc-history-drawer">
          {series ? games.length > 0 ? <>
            <div className="tc-history-scores" role="group" aria-label={`${series.label} game scores`}>
                {games.map((g, idx) => {
                  const winA = g.is_win === true, winB = g.is_win === false;
                  const margin = (winA || winB) && g.team_points != null && g.opponent_points != null ? Math.abs(g.team_points - g.opponent_points) : null;
                  const venue = g.side === "home" ? `at ${codeA}` : `at ${codeB}`;
                  return <Button key={g.game_id} size="lg" variant="ghost" pressed={activeGame?.game_id === g.game_id}
                    aria-label={`G${idx + 1} · ${formatDate(g.game_date)} · ${codeA} ${g.team_points ?? "—"}, ${codeB} ${g.opponent_points ?? "—"} · ${venue}${g.is_win === null ? " · Unknown" : ""}`}
                    onClick={() => setSelectedId(g.game_id)}>
                    <span className="tc-history-score-layout">
                      <span className="tc-history-score-side" data-side="a" data-leading={winA || undefined}>
                        <span className="tc-history-score-result">
                          {winA && margin != null && <span className="tc-history-margin" data-side="a">+{margin}</span>}
                          <strong className="tc-history-pts-val">{g.team_points ?? "—"}</strong>
                        </span>
                        <span className="tc-history-team-tag"><TeamLogo team={codeA} season={a.season} size={18} /><span>{codeA}</span></span>
                      </span>
                      <span className="tc-history-game-meta"><span>G{idx + 1} · {formatDate(g.game_date)}</span><span>{venue}{g.is_win === null ? " · Unknown" : ""}</span></span>
                      <span className="tc-history-score-side" data-side="b" data-leading={winB || undefined}>
                        <span className="tc-history-team-tag"><TeamLogo team={codeB} season={b.season} size={18} /><span>{codeB}</span></span>
                        <span className="tc-history-score-result">
                          <strong className="tc-history-pts-val">{g.opponent_points ?? "—"}</strong>
                          {winB && margin != null && <span className="tc-history-margin" data-side="b">+{margin}</span>}
                        </span>
                      </span>
                    </span>
                  </Button>;
                })}
            </div>
            <div className="tc-history-controls">
              <Segmented size="sm" dense label="Box score depth" value={boxDepth} onChange={value => setBoxDepth(value)}
                options={[{ value: "top5", label: "Top 5" }, { value: "all", label: "Full Box" }]} />
            </div>
            {isLoading ? <p className="tc-history-empty" role="status">Loading game box score…</p>
              : boxA.length > 0 || boxB.length > 0 ? <>
                <div className="tc-history-totals" role="group" aria-label="Selected game team totals">
                  {[{ label: "Shooting team totals", items: totalSpecs.slice(0, 3) }, { label: "Rebounds, assists and turnovers", items: totalSpecs.slice(3) }].map(group =>
                    <table key={group.label} className="tc-history-team-totals" aria-label={group.label}>
                      <colgroup><col className="tc-history-team-col" /><col /><col /><col /></colgroup>
                      <thead><tr><th scope="col">Team</th>{group.items.map(item => <th key={item.key} scope="col">{item.label}</th>)}</tr></thead>
                      <tbody>{[{ key: "a", code: codeA, season: a.season }, { key: "b", code: codeB, season: b.season }].map(side =>
                        <tr key={side.key}>
                          <th scope="row"><span className="tc-history-total-team"><TeamLogo team={side.code} season={side.season} size={16} /><span>{side.code}</span></span></th>
                          {group.items.map(item => {
                            const value = side.key === "a" ? item.a : item.b;
                            const lead = item.a.num != null && item.b.num != null && item.a.num !== item.b.num
                              ? (item.lowBetter ? item.a.num < item.b.num : item.a.num > item.b.num) ? "a" : "b" : null;
                            return <td key={item.key} aria-label={`${side.code} ${item.label}: ${value.text}${value.percentage ? ` ${value.percentage}` : ""}`}>
                              <span className="tc-history-total-value" data-leading={lead === side.key || undefined}>{value.text}{value.percentage && <span>{value.percentage}</span>}</span>
                            </td>;
                          })}
                        </tr>)}
                      </tbody>
                    </table>)}
                </div>
                <div className="tc-history-boxes">
                  {renderPlayerBox(shownA, a, "a")}
                  {renderPlayerBox(shownB, b, "b")}
                </div>
              </> : <p className="tc-history-empty">Player box score unavailable for this game.</p>}
          </> : <p className="tc-history-empty">No head-to-head {phase === "playoffs" ? "playoff" : "regular-season"} games observed between {teamName(a)} and {teamName(b)} in {a.season}.</p>
          : <div className="tc-history-cross">
            <p className="tc-history-empty">Head-to-head series requires the same season ({a.season} vs {b.season}). Recent {phase === "playoffs" ? "playoff" : "regular-season"} games in each selected season:</p>
            <div className="tc-history-boxes">
              {[a, b].map((side, idx) => <div key={idx} className="tc-history-box-side">
                <table className="tc-history-box-table" aria-label={`${teamName(side)} recent games`}>
                  <thead><tr><th scope="col">{side.season} {tricode(side)}</th><th scope="col">Date</th><th scope="col">Result</th></tr></thead>
                  <tbody>
                    {(side.schedule?.games.slice(-5).reverse() ?? []).map(g => <tr key={g.game_id}>
                      <th scope="row">{g.side === "home" ? "vs" : "@"} {g.opponent_tricode}</th>
                      <td>{formatDate(g.game_date)}</td>
                      <td className="tc-history-pts">{g.result ?? "—"} {g.team_points ?? "—"}–{g.opponent_points ?? "—"}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>)}
            </div>
          </div>}
        </div>
      </div>
    </div>}
    <div className="tc-tray-tab">
      <Button size="sm" variant="ghost" icon="history" iconAfter={open ? "chevron-up" : "chevron-down"} aria-expanded={open} aria-controls="tc-history-drawer" onClick={toggle}>
        Game History
      </Button>
    </div>
  </div>;
}

function TeamStats({ a, b, selectedKeys }: { a: TeamSide; b: TeamSide; selectedKeys: string[] }) {
  const specs = TEAM_METRICS.filter(m => selectedKeys.includes(m.key));
  return <table className="tc-stats" aria-label="Team statistics">
    <thead className="sr-only"><tr><th>{teamName(a)}</th><th>Metric</th><th>{teamName(b)}</th></tr></thead>
    <tbody className="tc-fade">
      {specs.map((spec, index) => {
        const showGroup = index === 0 || specs[index - 1].group !== spec.group;
        const valA = spec.read(a), valB = spec.read(b);
        const x = valA.num == null ? null : Number(valA.num.toFixed(4));
        const y = valB.num == null ? null : Number(valB.num.toFixed(4));
        const leader = !spec.neutral && x != null && y != null && x !== y ? (spec.lowBetter ? x < y : x > y) ? "a" : "b" : null;
        return <Fragment key={spec.key}>
          {showGroup && <tr className="tc-stats-group"><th colSpan={3} scope="colgroup">{spec.group}</th></tr>}
          <tr>
            <td data-leading={leader === "a" || undefined}>{valA.text}</td>
            <th scope="row">{spec.label}</th>
            <td data-leading={leader === "b" || undefined}>{valB.text}</td>
          </tr>
        </Fragment>;
      })}
    </tbody>
  </table>;
}

