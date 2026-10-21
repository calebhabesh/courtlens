// Player Showcase (alignment row 9): Databallr's season card grid. One query shape serves the
// server render and the season slideshow, so both show the same cohort for a season.

import { DARKO_COLUMNS, STATS_PRESETS, usesImpactManifest, type ColumnDefinition, type CountingMode } from "./stats-presets";
import { normalizedColumn } from "./stats-query";
import type { EstimatedPosition, PlayerResearchItem, QuerySpec, StatsPresentation, WorkbenchCatalog } from "./types";

export type ShowcaseMode = Extract<CountingMode, "per_game" | "per_36" | "raw">;
export type ShowcaseView = "cards" | "list";

export const PAGE_SIZE = 24;
export const MAX_SHOWN = 96;
/** Rank changes compare with this many of the previous season's leaders (the API's page limit). */
export const COMPARE_DEPTH = 100;
export const CARD_EXTRAS = 3;
export const DEFAULT_SORT = "dpm";
export const DEFAULT_EXTRAS = ["pts", "ast", "ts_pct"];
/** Databallr's 400-minute floor for a regular season; playoffs are shorter, so 100. */
export const DEFAULT_MIN_MINUTES = { regular_season: 400, playoffs: 100 } as Record<string, number>;
export const MINUTE_FLOORS = [0, 100, 250, 400, 750, 1000, 1500, 2000];
export const GAME_FLOORS = [0, 10, 20, 41, 58, 65];
export const MODES: { value: ShowcaseMode; label: string }[] = [
  { value: "per_game", label: "Per Game" }, { value: "per_36", label: "Per 36" }, { value: "raw", label: "Totals" }
];
const POSITIONS: EstimatedPosition[] = ["PG", "SG", "SF", "PF", "C"];

/** Card stats come from the Stats Overview view: its curated groups, labels and formats. */
const OVERVIEW = STATS_PRESETS.find(preset => preset.id === "overview")!;
const GROUP_LABELS = OVERVIEW.groupLabels ?? {};
export const CARD_STATS: ColumnDefinition[] = OVERVIEW.columns.filter(column => !["gp", "min"].includes(column.key));
/** A card stat's URL id: the Overview key without its counting-mode suffix (pts_per_game → pts). */
export function statId(column: Pick<ColumnDefinition, "key">): string {
  return column.key.replace(/_per_game$/, "");
}
const BASE_KEYS = new Set(CARD_STATS.map(statId));

export function statGroups(): { label: string; stats: ColumnDefinition[] }[] {
  const groups = new Map<string, ColumnDefinition[]>();
  for (const column of CARD_STATS) {
    const label = GROUP_LABELS[column.group] ?? column.group;
    groups.set(label, [...(groups.get(label) ?? []), column]);
  }
  return [...groups].map(([label, stats]) => ({ label: label === "Eff" ? "Efficiency" : label, stats }));
}

export function baseStat(id: string): ColumnDefinition | undefined {
  return CARD_STATS.find(column => statId(column) === id);
}

/** The stat as shown under a counting mode (PTS → pts_per_game under Per Game). */
export function shownStat(key: string, mode: ShowcaseMode): ColumnDefinition {
  return normalizedColumn(baseStat(key) ?? CARD_STATS[0], mode);
}

export interface ShowcaseState {
  season: string;
  phase: string;
  mode: ShowcaseMode;
  minMinutes: number;
  minGames: number;
  team: string | null;
  positions: EstimatedPosition[];
  draftYear: number | null;
  sort: string;
  ascending: boolean;
  extras: string[];
  view: ShowcaseView;
  shown: number;
  player: string | null;
}

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function reader(params: Params) {
  return (key: string): string | null => {
    if (params instanceof URLSearchParams) return params.get(key);
    const value = params[key];
    return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? null : null;
  };
}

const intOr = (value: string | null, fallback: number) => {
  const parsed = value === null || value === "" ? NaN : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
};

export function phasesFor(catalog: WorkbenchCatalog | null, season: string): string[] {
  const phases = (catalog?.stats_scopes ?? []).filter(scope => scope.season === season).map(scope => scope.phase);
  return ["regular_season", "playoffs"].filter(phase => phases.includes(phase));
}

export function readShowcaseState(params: Params, catalog: WorkbenchCatalog | null): ShowcaseState {
  const get = reader(params);
  const seasons = catalog?.seasons ?? [];
  const season = get("season") && seasons.includes(get("season")!) ? get("season")! : catalog?.default_season ?? seasons.at(-1) ?? "";
  const phases = phasesFor(catalog, season);
  const phase = get("phase") && phases.includes(get("phase")!) ? get("phase")! : phases[0] ?? "regular_season";
  const mode = (MODES.find(entry => entry.value === get("mode"))?.value ?? "per_game") as ShowcaseMode;
  const sort = get("sort") && BASE_KEYS.has(get("sort")!) ? get("sort")! : DEFAULT_SORT;
  const extras = (get("stats") ?? "").split(",").filter(key => BASE_KEYS.has(key));
  const positions = (get("positions") ?? "").split(",").filter((value): value is EstimatedPosition => POSITIONS.includes(value as EstimatedPosition));
  return {
    season, phase, mode, sort, positions,
    minMinutes: intOr(get("minMinutes"), DEFAULT_MIN_MINUTES[phase] ?? 0),
    minGames: intOr(get("minGames"), 0),
    team: get("teamId") || null,
    draftYear: Number(get("draftYear")) || null,
    ascending: get("dir") === "asc",
    extras: extras.length ? [...new Set(extras)].slice(0, CARD_EXTRAS) : DEFAULT_EXTRAS,
    view: get("view") === "list" ? "list" : "cards",
    shown: Math.min(MAX_SHOWN, Math.max(PAGE_SIZE, Math.ceil(intOr(get("show"), PAGE_SIZE) / PAGE_SIZE) * PAGE_SIZE)),
    player: get("playerId") || null,
  };
}

/** The four card stats: the sort stat leads, then the chosen extras (never the sort stat twice). */
export function cardStats(state: Pick<ShowcaseState, "sort" | "extras" | "mode">): ColumnDefinition[] {
  const keys = [state.sort, ...state.extras.filter(key => key !== state.sort), ...DEFAULT_EXTRAS, "reb", "min"];
  return [...new Set(keys)].slice(0, CARD_EXTRAS + 1).map(key => shownStat(key, state.mode));
}

export function showcaseQuery(catalog: WorkbenchCatalog, state: ShowcaseState, season = state.season, limit = state.shown): { query: QuerySpec; presentation: StatsPresentation } {
  const stats = cardStats(state);
  const keys = stats.map(stat => stat.key);
  const phase = phasesFor(catalog, season).includes(state.phase) ? state.phase : "regular_season";
  const scope = catalog.stats_scopes?.find(entry => entry.season === season && entry.phase === phase);
  const sortKey = shownStat(state.sort, state.mode).key;
  const query: QuerySpec = {
    release_id: catalog.release_id,
    season,
    phase,
    before_date: scope?.default_before_date ?? catalog.default_before_date,
    window: { kind: "season" },
    sample_filters: { min_minutes: state.minMinutes || null, min_games: state.minGames || null },
    sort: [{ field: sortKey, direction: state.ascending ? "asc" : "desc", nulls_last: true }],
    page: { limit },
    view_state: { view_id: "showcase", columns: keys },
  };
  if (state.team) query.team_scope = { team_id: state.team };
  if (keys.some(key => key in DARKO_COLUMNS) && catalog.darko?.manifest_sha256) query.darko_manifest_sha256 = catalog.darko.manifest_sha256;
  if (keys.some(usesImpactManifest) && catalog.impact?.manifest_sha256) query.impact_manifest_sha256 = catalog.impact.manifest_sha256;
  return {
    query,
    presentation: { table_percentiles: true, positions: state.positions.length ? state.positions : null, draft_year: state.draftYear },
  };
}

export function previousSeason(seasons: string[], season: string): string | null {
  const index = seasons.indexOf(season);
  return index > 0 ? seasons[index - 1] : null;
}

/** The slideshow's order: the season shown, then wrap to the first season on file. */
export function nextSeason(seasons: string[], season: string): string {
  const index = seasons.indexOf(season);
  return seasons[(index + 1) % seasons.length] ?? season;
}

/** A card's rank against `season`'s leaders: `was` is the 1-based rank there. */
export type RankChange = { kind: "up" | "down" | "same"; by: number; was: number; season: string } | { kind: "new"; season: string } | null;

/** Rank change against the previous season's leaders (same filters, top COMPARE_DEPTH); absentees are new. */
export function rankChanges(current: PlayerResearchItem[], previous: PlayerResearchItem[] | null, season: string | null): Map<string, RankChange> {
  const changes = new Map<string, RankChange>();
  if (!previous || !season) return changes;
  const before = new Map(previous.map((player, index) => [player.player_id, index]));
  current.forEach((player, index) => {
    const was = before.get(player.player_id);
    if (was === undefined) changes.set(player.player_id, { kind: "new", season });
    else changes.set(player.player_id, { kind: was === index ? "same" : was > index ? "up" : "down", by: Math.abs(was - index), was: was + 1, season });
  });
  return changes;
}

const ordinal = (value: number) => {
  const mod100 = value % 100;
  return `${value}${mod100 >= 11 && mod100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[value % 10] ?? "th"}`;
};

/** The badge's full meaning, for its hover title and the card's accessible name. */
export function changeText(change: RankChange): string | null {
  if (!change) return null;
  if (change.kind === "new") return `New: outside the top ${COMPARE_DEPTH} in ${change.season}`;
  const was = `${ordinal(change.was)} in ${change.season}`;
  return change.kind === "same" ? `Same rank: ${was}` : `${change.kind === "up" ? "Up" : "Down"} ${change.by}: ${was}`;
}

/** "'26" for 2025-26, Databallr's card badge. */
export function seasonBadge(season: string): string {
  const end = season.split("-")[1];
  return end ? `'${end}` : season;
}

/** The team a card is coloured by: the latest team in the scope. */
export function cardTeam(player: Pick<PlayerResearchItem, "teams">): string | null {
  return player.teams.at(-1) ?? null;
}

/** URL updates for a state change; defaults are dropped so links stay short. */
export function stateParams(current: URLSearchParams, updates: Partial<Record<string, string | number | null>>): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") next.delete(key); else next.set(key, String(value));
  }
  return next;
}
