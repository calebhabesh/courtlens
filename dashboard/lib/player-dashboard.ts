// Player Dashboard (alignment row 22): Databallr's /dashboard. A Top 50 DARKO DPM card carousel,
// compact player panels and a head-to-head panel. Panel cells come from the Stats query (box
// score, impact, DARKO) and the dashboard feeds endpoint (NBA tracking); both serve season
// percentiles, so nothing here ranks players. This module holds the URL state, the cell layout
// and the formatting the page and its tests share.

import type { PlayerDashboardFeeds, PlayerResearchItem, QuerySpec, StatsPresentation, WorkbenchCatalog } from "./types";

export type Phase = "regular_season" | "playoffs";
export type Rate = "per_36" | "per_game";

export interface PanelSpec {
  playerId: string;
  season: string;
  phase: Phase;
  /** Advanced (Databallr's default) or the Basic box-score view. */
  advanced: boolean;
  rate: Rate;
}

export interface DashboardState {
  season: string;
  team: string | null;
  panels: PanelSpec[];
  /** Indexes of the two panels in the head-to-head, in order (A, B). */
  versus: [number, number] | null;
}

export const MAX_PANELS = 4;
export const CAROUSEL_SIZE = 50;
/** Databallr's carousel floor: 400 regular-season minutes. */
export const CAROUSEL_MIN_MINUTES = 400;

const PHASE_CODES: Record<string, Phase> = { rs: "regular_season", po: "playoffs" };
const CODES: Record<Phase, string> = { regular_season: "rs", playoffs: "po" };
const SEASON = /^\d{4}-\d{2}$/;

type Params = Record<string, string | string[] | undefined> | URLSearchParams;

function reader(params: Params) {
  return (key: string): string | null => {
    if (params instanceof URLSearchParams) return params.get(key);
    const value = params[key];
    return typeof value === "string" ? value : Array.isArray(value) ? value[0] ?? null : null;
  };
}

/** `p=1641705.2024-25.rs_202695.2025-26.po.bg`: id, season, phase, then flags b (Basic) and g (Per Game).
 *  Dots and underscores survive URLSearchParams unencoded. */
export function parsePanels(value: string | null, fallbackSeason: string): PanelSpec[] {
  if (!value) return [];
  const panels = value.split("_").map(entry => entry.split(".")).filter(([id]) => /^\d{1,12}$/.test(id ?? "")).map(([playerId, season, phase, flags = ""]): PanelSpec => ({
    playerId,
    season: season && SEASON.test(season) ? season : fallbackSeason,
    phase: PHASE_CODES[phase ?? ""] ?? "regular_season",
    advanced: !flags.includes("b"),
    rate: flags.includes("g") ? "per_game" : "per_36",
  }));
  // A hand-edited or old link may repeat a card; the first copy wins.
  return panels.filter((panel, at) => findPanel(panels, panel) === at).slice(0, MAX_PANELS);
}

/** One card per player, season and phase: the same player in another season or phase is a new card. */
export function samePanel(a: Pick<PanelSpec, "playerId" | "season" | "phase">, b: Pick<PanelSpec, "playerId" | "season" | "phase">): boolean {
  return a.playerId === b.playerId && a.season === b.season && a.phase === b.phase;
}

/** The index of the card that `spec` would duplicate, ignoring the card at `except`; -1 if none. */
export function findPanel(panels: PanelSpec[], spec: Pick<PanelSpec, "playerId" | "season" | "phase">, except = -1): number {
  return panels.findIndex((panel, at) => at !== except && samePanel(panel, spec));
}

export function panelsParam(panels: PanelSpec[]): string | null {
  if (!panels.length) return null;
  return panels.map(panel => {
    const flags = `${panel.advanced ? "" : "b"}${panel.rate === "per_game" ? "g" : ""}`;
    return [panel.playerId, panel.season, CODES[panel.phase], ...(flags ? [flags] : [])].join(".");
  }).join("_");
}

/** A season opens with nobody past the carousel's minute floor, so default to the latest one with a
 *  month of regular-season games. */
export const SETTLED_DAYS = 30;

export function defaultSeason(catalog: WorkbenchCatalog | null): string {
  const seasons = catalog?.seasons ?? [];
  const days = (start?: string | null, end?: string | null) => start && end ? (Date.parse(end) - Date.parse(start)) / 86_400_000 : 0;
  const settled = [...seasons].reverse().find(season => {
    const scope = catalog?.stats_scopes?.find(entry => entry.season === season && entry.phase === "regular_season");
    return days(scope?.coverage_start, scope?.coverage_end) >= SETTLED_DAYS;
  });
  return settled ?? catalog?.default_season ?? seasons.at(-1) ?? "";
}

export function readDashboardState(params: Params, catalog: WorkbenchCatalog | null): DashboardState {
  const get = reader(params);
  const seasons = catalog?.seasons ?? [];
  const season = get("season") && seasons.includes(get("season")!) ? get("season")! : defaultSeason(catalog);
  const panels = parsePanels(get("p"), season);
  const [a, b] = (get("vs") ?? "").split(".").map(Number);
  const valid = (index: number | undefined) => Number.isInteger(index) && index! >= 0 && index! < panels.length;
  return { season, team: get("teamId") || null, panels, versus: valid(a) && valid(b) && a !== b ? [a!, b!] : null };
}

/** URL updates; empty values are dropped so links stay short. */
export function stateParams(current: URLSearchParams, updates: Partial<Record<string, string | null>>): URLSearchParams {
  const next = new URLSearchParams(current.toString());
  for (const [key, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === "") next.delete(key); else next.set(key, value);
  }
  return next;
}

/** The head-to-head pair after a panel at `removed` closes: indexes above it shift down. */
export function versusAfterRemove(versus: [number, number] | null, removed: number): [number, number] | null {
  if (!versus || versus.includes(removed)) return null;
  return versus.map(index => index > removed ? index - 1 : index) as [number, number];
}

/** Swap toggles a panel in or out of the head-to-head; a third press replaces the older pick. */
export function toggleVersus(versus: [number, number] | null, pending: number | null, index: number): { versus: [number, number] | null; pending: number | null } {
  if (versus?.includes(index)) return { versus: null, pending: versus.find(other => other !== index) ?? null };
  if (pending === index) return { versus, pending: null };
  if (pending !== null) return { versus: [pending, index], pending: null };
  if (versus) return { versus: [versus[1], index], pending: null };
  return { versus: null, pending: index };
}

// --- Cells ------------------------------------------------------------------------------------

export type CellFormat = "signed1" | "thousands" | "pct1" | "signedPct1" | "rate2" | "num1" | "int";

export interface CellDef {
  id: string;
  label: string;
  /** Stats query key, or a key under the feeds response (`feed:`). Per-mode keys for counting stats. */
  key: string | Record<Rate, string>;
  format: CellFormat;
  /** Lower is better. Feed and catalog percentiles arrive oriented, except catalog keys with no
   *  declared direction, which rank ascending; `invert` flips those. */
  lower?: boolean;
  invert?: boolean;
  tip: string;
}

export interface CellGroup { label: string; cells: CellDef[][] }

const q = (id: string, label: string, key: CellDef["key"], format: CellFormat, tip: string, extra: Partial<CellDef> = {}): CellDef => ({ id, label, key, format, tip, ...extra });
const rate = (stem: string): Record<Rate, string> => ({ per_36: `${stem}_per_36`, per_game: `${stem}_per_game` });
const feed = (key: string): Record<Rate, string> => ({ per_36: `feed:per_36:${key}`, per_game: `feed:per_game:${key}` });

export type RapmYears = 1 | 2 | 3;

/** RAPM over the longest window on file; Databallr shows three years, ours start in 2023-24. */
export function rapmGroup(years: RapmYears): CellGroup {
  const suffix = years === 1 ? "" : `_${years}y`;
  const span = years === 1 ? "this season" : `the ${years} seasons ending this season`;
  return { label: `${years} Year RAPM`, cells: [[
    q("orapm", "ORAPM", `orapm${suffix}`, "signed1", `Offensive RAPM over ${span}, per 100 possessions.`),
    q("drapm", "DRAPM", `drapm${suffix}`, "signed1", `Defensive RAPM over ${span}.`),
    q("rapm", "RAPM", `rapm${suffix}`, "signed1", `RAPM over ${span}.`),
  ]] };
}

/** The longest RAPM window every given player has. */
export function rapmYears(...players: (PlayerResearchItem | null | undefined)[]): RapmYears {
  const has = (key: string) => players.every(player => typeof player?.metrics[key] === "number");
  return has("rapm_3y") ? 3 : has("rapm_2y") ? 2 : 1;
}

/** Databallr's top block: DARKO and minutes; `rapmGroup` completes it. */
export const RATING_GROUPS: CellGroup[] = [
  { label: "DARKO", cells: [[
    q("o_dpm", "O-DPM", "o_dpm", "signed1", "DARKO offensive Daily Plus-Minus: points per 100 possessions above average."),
    q("d_dpm", "D-DPM", "d_dpm", "signed1", "DARKO defensive Daily Plus-Minus."),
    q("dpm", "DPM", "dpm", "signed1", "DARKO Daily Plus-Minus, offense plus defense."),
  ]] },
  { label: "MP", cells: [[q("min", "MIN", "min", "thousands", "Minutes played in the season and phase.")]] },
];

/** Six-factor RAPM (docs/design/impact-ratings-v1.md): three rate regressions, offence and defence.
 *  Values are percentage points of the team's rate with the player on court; positive is favourable. */
export interface SixFactorDef { id: string; label: string; key: string; name: string; tip: string; about: string; rate: string }

export const SIX_FACTORS: { offense: SixFactorDef[]; defense: SixFactorDef[] } = {
  offense: [
    { id: "o_ts", label: "OTS", key: "o_ts", name: "Offensive shooting impact", rate: "true-shooting rate",
      tip: "How much the team's true shooting rises with the player on offense.",
      about: "The true-shooting rate of his lineups on offense, estimated jointly with the other nine players on the floor. It describes the shots his lineups take, not only his own." },
    { id: "o_tov", label: "OTOV", key: "o_tov", name: "Offensive turnover impact", rate: "turnover share",
      tip: "How much the team's turnover share falls with the player on offense.",
      about: "Turnovers per shooting possession in his offensive stints, estimated jointly with the other nine players. Positive means his lineups turned it over less." },
    { id: "o_reb", label: "OREB", key: "o_reb", name: "Offensive rebounding impact", rate: "offensive-rebound share",
      tip: "How much the team's offensive-rebound share rises with the player on offense.",
      about: "The share of their own misses his lineups rebound, estimated jointly with the other nine players: a lineup-level measure, not his own rebound count." },
  ],
  defense: [
    { id: "d_ts", label: "DTS", key: "d_ts", name: "Defensive shooting impact", rate: "opponent true-shooting rate",
      tip: "How much opponents' true shooting falls with the player on defense.",
      about: "Opponents' true-shooting rate in his defensive stints, estimated jointly with the other nine players. Positive means opponents shot worse with him on the floor." },
    { id: "d_tov", label: "DTOV", key: "d_tov", name: "Defensive turnover impact", rate: "opponent turnover share",
      tip: "How much opponents' turnover share rises with the player on defense.",
      about: "Opponent turnovers per shooting possession in his defensive stints, estimated jointly with the other nine players. Positive means opponents turned it over more." },
    { id: "d_reb", label: "DREB", key: "d_reb", name: "Defensive rebounding impact", rate: "opponent offensive-rebound share",
      tip: "How much opponents' offensive-rebound share falls with the player on defense.",
      about: "The share of their misses opponents rebound in his defensive stints, estimated jointly with the other nine players. Positive means opponents got fewer second chances." },
  ],
};

/** The method line under every six-factor card. */
export const SIX_FACTOR_METHOD = "CourtLens one-season ridge fit over every stint; shown from 20 games and 1,000 opportunities on each end. Not additive to RAPM. A descriptive estimate under lineup confounding, not a causal effect.";

/** Play-type families as Databallr groups Synergy's play types. */
export const PLAY_FAMILY_ABOUT: Record<string, string> = {
  creation: "Isolation, pick-and-roll ball handler and post-ups: possessions the player creates for himself.",
  spacing: "Spot-ups, off-screen and handoffs: shots created by movement and the defense's attention elsewhere.",
  transition: "Possessions finished before the defense is set.",
  finishing: "Cuts, pick-and-roll roll man and putbacks: finishing what teammates or misses create.",
};

/** Scoring, offensive rebounding and playmaking: two rows of seven, as Databallr lays them out. */
export const OFFENSE_GROUPS: CellGroup[] = [
  { label: "Scoring", cells: [
    [
      q("load", "LOAD", "offensive_load", "num1", "Offensive Load: of every 100 offensive possessions, how many the player finishes or creates (shots, free-throw trips, shots set up and turnovers). Stands in for Databallr's SHOTS."),
      q("rts", "rTS%", "impact_rts", "signedPct1", "True shooting minus the league average, in percentage points."),
      q("ctov", "cTOV%", "ctov_pct", "pct1", "Turnovers divided by Offensive Load. Stands in for Databallr's sTOV%.", { lower: true }),
    ],
    [
      q("3pr", "3PR", "impact_three_point_rate", "rate2", "Three-point attempts as a share of field-goal attempts."),
      q("3p", "3P%", "fg3_pct", "pct1", "Three-point percentage."),
      q("ftr", "FTR", "ftr", "rate2", "Free-throw attempts per field-goal attempt."),
    ],
  ] },
  { label: "ORB", cells: [
    [q("own_miss", "OwnMiss", "pbp_self_miss_orb_pct", "pct1", "Share of the player's own missed shots that the player rebounds.")],
    [q("team_miss", "TeamMiss", "pbp_team_miss_orb_pct", "pct1", "Share of teammates' misses, with the player on court, that the player rebounds.")],
  ] },
  { label: "Playmaking", cells: [
    [
      q("potast", "POTAST", feed("potential_ast"), "num1", "Potential assists: passes to a teammate who shot within one dribble, made or missed (NBA tracking)."),
      q("astefg", "ASTEFG", "feed:ratio:ast_efg", "pct1", "CourtLens formula: points created by the player's assists divided by twice the potential assists, an eFG%-style rate for the shots the player's passes set up."),
      q("ast", "AST", rate("ast"), "num1", "Assists. Stands in for Databallr's PASSTOV, which has no published definition."),
    ],
    [
      q("onball", "ONBALL", "on_ball_pct", "pct1", "Share of court time holding the ball: NBA tracking time of possession over minutes."),
      q("pa1m", "PA/1M", "feed:ratio:potential_ast_per_min", "num1", "CourtLens formula: potential assists per minute of ball possession."),
      q("rimast", "RimAST", "rim_ast_per100", "num1", "Assists on made shots at the rim, per 100 offensive possessions."),
    ],
  ] },
];

/** Contesting, defensive rebounding and defensive playmaking. */
export const DEFENSE_GROUPS: CellGroup[] = [
  { label: "Contesting", cells: [
    [
      q("d_dpm_def", "D-DPM", "d_dpm", "signed1", "DARKO defensive Daily Plus-Minus."),
      q("dfga", "DFGA", feed("defended_fga"), "num1", "Shots attempted with the player as the closest defender (NBA tracking)."),
      q("diff", "DIFF", "feed:ratio:defended_diff", "signedPct1", "Opponents' FG% with the player closest minus their normal FG% on those shots. Negative is better.", { lower: true }),
    ],
    [
      q("foul", "FOUL%", "pbp_foul_frequency", "pct1", "Personal fouls per possession played.", { lower: true, invert: true }),
      q("rimdfga", "RIMDFGA", feed("rim_defended_fga"), "num1", "Shots within 6 feet with the player as the closest defender."),
      q("rimdiff", "DIFF", "feed:ratio:rim_defended_diff", "signedPct1", "Opponents' FG% within 6 feet with the player closest, minus their normal FG% there. Negative is better.", { lower: true }),
    ],
  ] },
  { label: "DRB", cells: [
    [q("drb", "DRB%", "pbp_drb_pct", "pct1", "Share of available defensive rebounds the player grabbed while on court.")],
    [q("dreb", "DREB", rate("dreb"), "num1", "Defensive rebounds.")],
  ] },
  { label: "D-Playmaking", cells: [
    [
      q("stl", "STL", rate("stl"), "num1", "Steals."),
      q("blk", "BLK", rate("blk"), "num1", "Blocks."),
      q("defl", "DEFL", feed("deflections"), "num1", "Passes or dribbles deflected (NBA hustle)."),
    ],
    [
      q("contest", "CONTEST", feed("contested_shots"), "num1", "Shots contested (NBA hustle)."),
      q("offd", "OFFD", feed("charges_drawn"), "num1", "Charges drawn (NBA hustle)."),
      q("lballs", "LBALLS", feed("loose_balls"), "num1", "Loose balls recovered (NBA hustle)."),
    ],
  ] },
];

/** Basic view: the box score. */
export const BASIC_GROUPS: CellGroup[] = [
  { label: "Production", cells: [
    [q("pts", "PTS", rate("pts"), "num1", "Points."), q("reb", "REB", rate("reb"), "num1", "Rebounds."), q("b_ast", "AST", rate("ast"), "num1", "Assists.")],
    [q("fg", "FG%", "fg_pct", "pct1", "Field-goal percentage."), q("b_3p", "3P%", "fg3_pct", "pct1", "Three-point percentage."), q("ft", "FT%", "ft_pct", "pct1", "Free-throw percentage.")],
  ] },
  { label: "Games", cells: [
    [q("gp", "GP", "gp", "int", "Games played.")],
    [q("b_min", "MIN", "min", "thousands", "Minutes played.")],
  ] },
  { label: "Defense & Ball Security", cells: [
    [q("b_stl", "STL", rate("stl"), "num1", "Steals."), q("b_blk", "BLK", rate("blk"), "num1", "Blocks."), q("tov", "TOV", rate("tov"), "num1", "Turnovers.", { lower: true })],
    [q("ts", "TS%", "ts_pct", "pct1", "True shooting percentage."), q("efg", "eFG%", "efg_pct", "pct1", "Effective field-goal percentage."), q("b_ftr", "FTR", "ftr", "rate2", "Free-throw attempts per field-goal attempt.")],
  ] },
];

const ALL_GROUPS = [...RATING_GROUPS, rapmGroup(1), rapmGroup(2), rapmGroup(3), ...OFFENSE_GROUPS, ...DEFENSE_GROUPS, ...BASIC_GROUPS];

/** Every Stats query column a panel reads, both rates included. */
export const QUERY_KEYS: string[] = [...new Set([
  ...ALL_GROUPS.flatMap(group => group.cells.flat()).flatMap(cell => typeof cell.key === "string" ? [cell.key] : Object.values(cell.key)).filter(key => !key.startsWith("feed:")),
  ...SIX_FACTORS.offense.map(cell => cell.key), ...SIX_FACTORS.defense.map(cell => cell.key),
])];

export interface CellValue {
  value: number | null;
  percentile: number | null;
  /** How the percentile's cohort is described in the tooltip. */
  cohort: string;
}

/** One cell's value and oriented percentile from the two responses. */
export function cellValue(cell: CellDef, rate: Rate, player: PlayerResearchItem | null, feeds: PlayerDashboardFeeds | null): CellValue {
  const key = typeof cell.key === "string" ? cell.key : cell.key[rate];
  if (key.startsWith("feed:")) {
    const [, mode, metric] = key.split(":");
    const source = feeds?.player;
    const cohort = feeds ? `${feeds.cohort.qualified_players} players with ${feeds.cohort.rule}` : "NBA tracking players";
    if (!source || !metric) return { value: null, percentile: null, cohort };
    const scope = mode === "ratio" ? rate : (mode as Rate);
    return { value: source[scope]?.[metric] ?? null, percentile: source.percentiles?.[scope]?.[metric] ?? null, cohort };
  }
  const value = player?.metrics[key] ?? null;
  const raw = player?.table_qualified ? player.table_percentiles?.[key] ?? null : null;
  const size = player?.table_cohort_sample_sizes?.[key];
  const cohort = `${size ?? "the"} qualified players${size ? "" : "'s pool"} (500+ season minutes)`;
  return { value: typeof value === "number" ? value : null, percentile: raw === null ? null : cell.invert ? 100 - raw : raw, cohort };
}

export function formatCell(value: number | null, format: CellFormat): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const sign = (text: string, number: number) => number > 0 ? `+${text}` : number < 0 ? `−${text.replace("-", "")}` : text;
  switch (format) {
    case "signed1": return sign(value.toFixed(1), Number(value.toFixed(1)));
    case "thousands": return value >= 1000 ? `${(value / 1000).toFixed(1)}k` : value.toFixed(0);
    case "pct1": return `${(100 * value).toFixed(1)}%`;
    case "signedPct1": return `${sign((100 * value).toFixed(1), Number((100 * value).toFixed(1)))}%`;
    case "rate2": return value.toFixed(2).replace(/^0(?=\.)/, "");
    case "int": return value.toFixed(0);
    default: return value.toFixed(1);
  }
}

/** Databallr's six-factor dots: one per point of impact, at least one, at most five. */
export function factorDots(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.min(5, Math.max(1, Math.round(Math.abs(value))));
}

// --- Head-to-head -----------------------------------------------------------------------------

export interface VersusCell { difference: number | null; leader: "a" | "b" | null }

/** A minus B, and who leads on this measure (lower wins where lower is better). */
export function versusCell(a: number | null, b: number | null, lower = false): VersusCell {
  if (a === null || b === null) return { difference: null, leader: null };
  const difference = a - b;
  if (difference === 0) return { difference, leader: null };
  return { difference, leader: (difference > 0) !== lower ? "a" : "b" };
}

/** The magnitude of a difference, formatted like the cell (always signed toward the leader). */
export function formatDifference(difference: number | null, format: CellFormat): string {
  if (difference === null) return "—";
  const magnitude = Math.abs(difference);
  const text = format === "thousands" ? formatCell(magnitude, "thousands") : formatCell(magnitude, format === "signed1" ? "num1" : format === "signedPct1" ? "pct1" : format);
  return `+${text}`;
}

/** Player Comparison for the given panels, in the first panel's season and phase. */
export function compareLink(panels: PanelSpec[]): string {
  const [a, b] = panels;
  const params = new URLSearchParams({ season: a.season, phase: a.phase, playerA: a.playerId });
  if (b) params.set("playerB", b.playerId);
  return `/compare?${params}`;
}

/** The head-to-head's leader labels: surnames, plus the season when both sides share one
 *  (Tatum 2024-25 against Tatum 2025-26), plus the phase when even that matches. */
export function versusLabels(a: { name: string; season: string; phase: Phase }, b: { name: string; season: string; phase: Phase }): { a: string; b: string } {
  const one = surname(a.name);
  const two = surname(b.name);
  if (one !== two) return { a: one, b: two };
  if (a.season !== b.season) return { a: `${one} ${a.season.slice(2)}`, b: `${two} ${b.season.slice(2)}` };
  return { a: `${one} ${CODES[a.phase].toUpperCase()}`, b: `${two} ${CODES[b.phase].toUpperCase()}` };
}

export function surname(name: string): string {
  const parts = name.trim().split(/\s+/);
  const last = parts.at(-1) ?? name;
  return /^(Jr\.?|Sr\.?|II|III|IV)$/.test(last) && parts.length > 2 ? parts.at(-2)! : last;
}

// --- Queries ----------------------------------------------------------------------------------

function scope(catalog: WorkbenchCatalog, season: string, phase: string) {
  return catalog.stats_scopes?.find(entry => entry.season === season && entry.phase === phase);
}

/** Seasons the play-by-play impact model (RAPM, six factors, LOAD, rTS …) covers. */
export const IMPACT_FIRST_SEASON = "2023-24";

export function hasScope(catalog: WorkbenchCatalog, season: string, phase: string): boolean {
  return Boolean(scope(catalog, season, phase));
}

/** One player's panel row: every panel column, ranked against the whole season (presentation filter). */
export function panelQuery(catalog: WorkbenchCatalog, panel: PanelSpec): { query: QuerySpec; presentation: StatsPresentation } {
  const query: QuerySpec = {
    release_id: catalog.release_id,
    season: panel.season,
    phase: panel.phase,
    before_date: scope(catalog, panel.season, panel.phase)?.default_before_date ?? catalog.default_before_date,
    window: { kind: "season" },
    sort: [{ field: "min", direction: "desc", nulls_last: true }],
    page: { limit: 1 },
    view_state: { view_id: "player-dashboard", columns: QUERY_KEYS },
  };
  if (catalog.darko?.manifest_sha256) query.darko_manifest_sha256 = catalog.darko.manifest_sha256;
  if (catalog.impact?.manifest_sha256) query.impact_manifest_sha256 = catalog.impact.manifest_sha256;
  return { query, presentation: { table_percentiles: true, player_ids: [panel.playerId] } };
}

/** The carousel: the season's Top 50 by DARKO DPM over 400 minutes, optionally one team's. */
export function carouselQuery(catalog: WorkbenchCatalog, season: string, team: string | null): { query: QuerySpec; presentation: StatsPresentation } {
  const query: QuerySpec = {
    release_id: catalog.release_id,
    season,
    phase: "regular_season",
    before_date: scope(catalog, season, "regular_season")?.default_before_date ?? catalog.default_before_date,
    window: { kind: "season" },
    sample_filters: { min_minutes: team ? null : CAROUSEL_MIN_MINUTES },
    sort: [{ field: "dpm", direction: "desc", nulls_last: true }],
    page: { limit: CAROUSEL_SIZE },
    view_state: { view_id: "player-dashboard-carousel", columns: ["dpm"] },
  };
  if (team) query.team_scope = { team_id: team };
  if (catalog.darko?.manifest_sha256) query.darko_manifest_sha256 = catalog.darko.manifest_sha256;
  return { query, presentation: { table_percentiles: false } };
}
