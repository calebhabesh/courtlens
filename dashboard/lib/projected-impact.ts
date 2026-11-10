/** Research → Projected Impact: types, reads and copy for `courtlens-projected-impact-v1`. */

import { browserApi } from "./workbench-api";

export interface Gap { gap: number; low: number; high: number; units: number; level: number }
export interface PlayerModel { rmse: number; correlation: number }
export interface GameRating { rmse: number; winner_accuracy: number | null }
export interface PlayerTable { players: number; minutes: number; models: Record<string, PlayerModel>; gaps: Record<string, Gap> }
export interface GameTable { games: number; ratings: Record<string, GameRating>; gaps: Record<string, Gap>; unprojected_minutes_share?: number }
export interface CoverageRow { coverage: number | null; players: number; half_width?: number }
export interface CoverageTable { nominal: number; mean_width: number; overall: { coverage: number; players: number }; by_prior_minutes: Record<string, CoverageRow>; by_target_minutes_diagnostic: Record<string, CoverageRow> }
export interface GroupTable { players: number; minutes: number; group_mean_rule_rmse: number; models: Record<string, { rmse: number; gap_over_group_mean: Gap }> }

export interface ProjectedPlayer {
  player_id: string; name: string; team_id: string | null; tricode: string | null; last_tricode: string | null; on_roster: boolean;
  group: "prior" | "rookie" | "returner"; bucket: string; age: number | null; years_in_league: number | null; minutes_last_season: number | null;
  projection: number; low: number; high: number; ratings: Record<string, number>;
}
export interface Contribution { feature: string; value: number | null; contribution: number }
export interface PlayerDetail { season: string; selected: string; base: number; player: ProjectedPlayer & { contributions: { blocks: Record<string, number>; top: Contribution[] } } }

export interface ScoreGroup { games: number; ratings?: Record<string, GameRating>; gaps?: Record<string, Gap>; unprojected_minutes_share?: number }
export interface WeeklyPoint extends ScoreGroup { through: string }
export interface ProjectedScorecard { frozen_at: string; scored_through: string | null; written_at: string; prospective: ScoreGroup; hindsight: ScoreGroup; prospective_by_week: WeeklyPoint[] }

export interface ProjectedImpactPage {
  model: { version: string; registration: string; registration_sha256: string; frozen_at: string; selected: string; projections_sha256: string; manifest_sha256: string; trained_through: string; calibrated_on: string; feature_cutoff: string; f1_waiver: string | null; fallback_rating: number; conformal: Record<string, number> };
  card: {
    selection: { season: string; players: number; selected: string; learned_candidate: string; weighted_mse: Record<string, number>; gaps_over_carry_forward_90: Record<string, Gap> };
    ridge_alpha: number;
    lightgbm: { sha256: string; num_leaves: number; min_data_in_leaf: number; rounds: number };
    test: {
      selected: string; read_at: string;
      seasons: Record<string, { player: PlayerTable; game: GameTable; coverage: CoverageTable }>;
      pooled: { player: PlayerTable; game: GameTable; coverage: CoverageTable; groups: Record<string, GroupTable> };
      gates: { A1_player: Gap & { passed: boolean }; A2_game: Gap & { passed: boolean }; F1_coverage: { passed: boolean } };
    };
    aging: { ages: number[]; delta_method_relative_to_27: number[]; delta_method_yearly_change: number[]; partial_dependence: Record<string, number[]> };
    coverage: { by_season: Record<string, Record<string, number | Record<string, number>>>; birth_date_sources: Record<string, number> };
  };
  scorecard: ProjectedScorecard | null;
  players: ProjectedPlayer[];
}

export const RATING_LABELS: Record<string, string> = {
  lightgbm: "LightGBM",
  ridge: "Ridge",
  age_curve: "Age curve",
  time_decay: "Time-decay RAPM",
  carry_forward: "Carry-forward",
};
export const RATING_ORDER = ["lightgbm", "ridge", "time_decay", "age_curve", "carry_forward"];

export const BLOCK_LABELS: Record<string, string> = {
  prior_rapm: "Last season's RAPM, six factors",
  older_rapm: "Two seasons ago",
  time_decay_rapm: "Time-decay RAPM",
  box_rates: "Box-score rates",
  minutes: "Minutes",
  play_type_offense: "Offensive play types",
  play_type_defense: "Defensive play types",
  shot_profile: "Shot profile",
  age_experience: "Age and experience",
};

export const BUCKET_LABELS: Record<string, string> = {
  "1500_plus": "1,500+ minutes last season",
  "500_to_1499": "500 to 1,499 minutes last season",
  under_500: "Under 500 minutes last season",
  no_prior: "No RAPM last season (rookies, returners)",
};

/** Target-season minute bands of the served diagnostic; each key is its band's lower bound, and the bands don't overlap. */
export const TARGET_MINUTE_LABELS: Record<string, string> = { "500+": "500 to 999", "1000+": "1,000 to 1,999", "2000+": "2,000 or more" };

const STAT_LABELS: Record<string, string> = {
  pts: "Points", fga: "Field-goal attempts", fg3a: "Three-point attempts", fta: "Free-throw attempts", oreb: "Offensive rebounds",
  dreb: "Defensive rebounds", ast: "Assists", stl: "Steals", blk: "Blocks", tov: "Turnovers", pf: "Fouls",
};
const TYPE_LABELS: Record<string, string> = {
  cut: "cuts", handoff: "handoffs", isolation: "isolation", misc: "miscellaneous", offrebound: "putbacks", offscreen: "off screens",
  postup: "post-ups", prballhandler: "pick-and-roll handler", prrollman: "roll man", spotup: "spot-ups", transition: "transition",
};
const SIMPLE: Record<string, string> = {
  rapm_total_1: "RAPM last season", rapm_off_1: "ORAPM last season", rapm_def_1: "DRAPM last season",
  rapm_total_2: "RAPM two seasons ago", rapm_off_2: "ORAPM two seasons ago", rapm_def_2: "DRAPM two seasons ago", minutes_2: "Minutes two seasons ago",
  minutes_1: "Minutes last season", games_1: "Games last season", mpg_1: "Minutes per game",
  ts_1: "True shooting", three_rate_1: "Three-point rate", ft_rate_1: "Free-throw rate",
  td_rapm: "Time-decay RAPM", td_orapm: "Time-decay ORAPM", td_drapm: "Time-decay DRAPM", td_decayed_seconds: "Time-decay sample",
  age: "Age at the opener", age_squared: "Age squared", years_in_league: "Years in the league",
  shot_rim_share_1: "Share of shots at the rim", shot_short_mid_share_1: "Share of short mid-range", shot_long_mid_share_1: "Share of long mid-range", shot_three_share_1: "Share of threes",
  shot_rim_pct_1: "Rim FG%", shot_mid_pct_1: "Mid-range FG%", shot_three_pct_1: "Three-point FG%",
};

/** Plain words for a registered feature name; an unknown name is shown as stored, not guessed. */
export function featureLabel(name: string): string {
  if (SIMPLE[name]) return SIMPLE[name];
  const per36 = name.match(/^per36_(.+)_1$/);
  if (per36) return `${STAT_LABELS[per36[1]] ?? per36[1]} per 36`;
  const type = name.match(/^pt_(off|def)_(.+)_1$/);
  if (type) return `${type[1] === "off" ? "Offense" : "Defense"}: ${TYPE_LABELS[type[2]] ?? type[2]}`;
  const six = name.match(/^six_(ts|tov|reb)_(off|def)_1$/);
  if (six) return `${{ ts: "Shooting", tov: "Turnovers", reb: "Rebounding" }[six[1]]} factor, ${six[2] === "off" ? "offense" : "defense"}`;
  return name;
}

export const fixed = (value: number | null | undefined, digits = 2) => value == null ? "—" : value.toFixed(digits);
export function signed(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const text = Math.abs(value).toFixed(digits);
  return Number(text) === 0 ? text : `${value > 0 ? "+" : "−"}${text}`;
}
export const percent = (value: number | null | undefined, digits = 1) => value == null ? "—" : `${(value * 100).toFixed(digits)}%`;
export const gapBand = (gap: { low: number; high: number } | undefined, digits = 2) => gap ? `${signed(gap.low, digits)} to ${signed(gap.high, digits)}` : "—";
export const gapText = (gap: Gap | undefined, digits = 2) => gap ? `${signed(gap.gap, digits)} (${gapBand(gap, digits)})` : "—";
/** Green or red only where the served interval excludes zero. Never read as a verdict on players. */
export const intervalTone = (gap: { low: number; high: number } | undefined): "good" | "bad" | undefined => !gap ? undefined : gap.low > 0 ? "good" : gap.high < 0 ? "bad" : undefined;
/** Gold above zero and blue below, for a value with no interval or one that includes zero. A value that rounds to zero has no sign. */
export const signTone = (value: number | null | undefined, digits = 2): "a" | "b" | undefined => value == null || Number(Math.abs(value).toFixed(digits)) === 0 ? undefined : value > 0 ? "a" : "b";

async function readJson<T>(path: string, signal: AbortSignal | undefined, what: string): Promise<T> {
  const response = await fetch(`${browserApi}${path}`, { signal });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { detail?: string } | null;
    throw new Error(typeof body?.detail === "string" ? body.detail : `${what} request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export const getProjectedImpactPage = (signal?: AbortSignal) => readJson<ProjectedImpactPage>("/api/projected-impact", signal, "Projected impact");
export const getProjectedImpactPlayer = (playerId: string, signal?: AbortSignal) => readJson<PlayerDetail>(`/api/projected-impact/players/${encodeURIComponent(playerId)}`, signal, "Projected impact player");

/** Every source, largest first, so the sources add up to the projection on the page. */
export const blockRows = (blocks: Record<string, number>) => Object.entries(blocks).map(([key, value]) => ({ key, label: BLOCK_LABELS[key] ?? key, value })).sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
export const featureRows = (top: Contribution[]) => top.map(entry => ({ key: entry.feature, label: `${featureLabel(entry.feature)}${entry.value == null ? "" : ` (${fixed(entry.value)})`}`, value: entry.contribution }));
