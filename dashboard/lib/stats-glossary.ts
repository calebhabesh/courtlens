import type { MetricDefinition } from "./types";

/**
 * Glossary copy: standard definitions in readable prose for the metric catalog. Presentation only: the catalog stays the
 * one source of formulas, validity and limitations, which the glossary shows on request.
 *
 * Every entry reads abbreviation → full name → definition. The full name spells the abbreviation out (3PR is
 * "Three-Point Attempt Rate"); the definition says what it measures and never restates the name.
 */

export type GlossaryGroup = "Counting Stats" | "Shooting" | "Rates" | "Impact Metrics" | "On-Off" | "Defense"
  | "Rebounding" | "Playmaking" | "Play Types" | "Team" | "Other";

export const GLOSSARY_GROUPS: GlossaryGroup[] = ["Counting Stats", "Shooting", "Rates", "Impact Metrics", "On-Off",
  "Defense", "Rebounding", "Playmaking", "Play Types", "Team", "Other"];

const PLAIN: Record<string, string> = {
  dpm: "DARKO's forecast of a player's contribution to scoring margin against an average player, in points per 100 possessions. Imported from darko.app at the phase's last admitted game date; not a season average.",
  o_dpm: "The offensive component of DARKO's forecast, in points added per 100 possessions against an average player. By Kostya Medvedovsky (darko.app); higher is better.",
  d_dpm: "The defensive component of DARKO's forecast, in points prevented per 100 possessions against an average player. By Kostya Medvedovsky (darko.app); higher is better.",
  gp: "Games in which the player recorded playing time.",
  min: "Minutes played.",
  min_per_game: "Minutes played per game appeared in.",
  pts: "Points scored from field goals and free throws.",
  oreb: "Rebounds of the team's own missed shots, extending the possession.",
  dreb: "Rebounds of the opponent's missed shots, ending their possession.",
  reb: "Offensive plus defensive rebounds.",
  reb_total: "Offensive plus defensive rebounds.",
  ast: "Passes that directly lead to a made basket by a teammate.",
  tov: "Possessions lost to the opponent through a steal, violation, offensive foul or ball out of bounds.",
  stl: "Defensive actions that cause a turnover by taking possession from the opponent.",
  blk: "Opponent field goal attempts deflected or stopped by the player.",
  pf: "Personal fouls committed.",
  fgm: "Two- and three-point field goals made (free throws excluded).",
  fga: "Two- and three-point field goals attempted (free throws excluded).",
  fg_pct: "Field goals made divided by field goals attempted.",
  fg3m: "Three-point field goals made.",
  fg3a: "Shot attempts from beyond the three-point line (23.75 feet, 22 feet in the corners).",
  fg3_pct: "Three-pointers made divided by three-pointers attempted.",
  ftm: "Free throws made.",
  fta: "Free throws attempted.",
  ft_pct: "Free throws made divided by free throws attempted.",
  ts_pct: "Points per shooting possession, accounting for the extra value of threes and free throws: PTS / (2 × (FGA + 0.44 × FTA)).",
  efg_pct: "Field goal percentage adjusted for three-pointers being worth 50% more than two-pointers.",
  ftr: "Free throw attempts per field goal attempt; how often a player gets to the line.",
  team_pace: "Possessions per 48 minutes, a measure of how fast a team plays.",
  team_possessions_estimated: "Possessions estimated from the box score: FGA + 0.44 × FTA − OREB + TOV.",
  team_off_rtg_estimated: "Points scored per 100 possessions.",
  team_def_rtg_estimated: "Points allowed per 100 possessions.",
  team_net_rtg_estimated: "Offensive rating minus defensive rating; point margin per 100 possessions.",
  team_efg_pct: "Team field goal percentage adjusted for the extra value of three-pointers (a Four Factors measure).",
  team_tov_pct: "Turnovers per 100 plays (a Four Factors measure).",
  team_oreb_pct: "Share of the team's missed shots it rebounds (a Four Factors measure).",
  team_ftr: "Free throw attempts per field goal attempt (a Four Factors measure).",
  legacy_fantasy_score: "Fantasy-style composite: PTS + 1.2 REB + 1.5 AST + 3 STL + 3 BLK − TOV.",
  legacy_fantasy_score_per_game: "Fantasy-style composite per game.",
  o_ts: "Estimated effect on the team's true shooting while the player is on the court, in percentage points, controlling for teammates and opponents (six-factor RAPM).",
  d_ts: "Estimated effect on opponents' true shooting while the player is on the court, in percentage points; positive means opponents shoot worse (six-factor RAPM).",
  o_tov: "Estimated effect on the team's turnover rate while the player is on the court; positive means fewer turnovers (six-factor RAPM).",
  d_tov: "Estimated effect on opponents' turnover rate while the player is on the court; positive means more forced turnovers (six-factor RAPM).",
  o_reb: "Estimated effect on the team's offensive rebounding rate while the player is on the court (six-factor RAPM).",
  d_reb: "Estimated effect on limiting opponents' offensive rebounding while the player is on the court (six-factor RAPM).",
  on_net_rating: "Team net rating (points per 100 possessions) while the player is on the court.",
  onoff_net_rating: "Team net rating with the player on the court minus with the player off the court.",
  on_offensive_rating: "Team points scored per 100 possessions while the player is on the court.",
  onoff_offensive_rating: "Team offensive rating with the player on minus with the player off.",
  on_defensive_rating: "Team points allowed per 100 possessions while the player is on the court.",
  onoff_defensive_rating: "Team defensive rating with the player on minus with the player off.",
  pbp_stl_per100: "Steals per 100 defensive possessions played.",
  pbp_blk_per100: "Blocks per 100 defensive possessions played.",
  pbp_foul_frequency: "Personal fouls relative to possessions played.",
  pbp_drb_pct: "Share of available defensive rebounds the player grabbed while on the court.",
  pbp_block_recovered_pct: "Share of the player's blocks after which the team recovered the ball.",
  matchup_fga_per100: "Field goal attempts by opponents the player was matched up against, per 100 defensive possessions.",
  impact_ts_pct: "True shooting percentage over the games in the play-by-play sample used for impact metrics.",
  impact_rts: "The player's true shooting percentage minus the league average, in percentage points.",
  impact_tsadd_per100: "Points added over a league-average shooter on the same shooting volume, per 100 possessions.",
  impact_three_point_rate: "Three-point attempts as a share of all field goal attempts (3PA / FGA).",
  impact_ftr: "Free throw attempts per field goal attempt over the games in the play-by-play sample.",
  impact_ast_per100: "Assists per 100 offensive possessions played.",
  pbp_bad_pass_tov: "Turnovers recorded as bad passes in play-by-play.",
  pbp_rim_assists: "Assists on made shots in the restricted area.",
  pbp_self_miss_orb_pct: "Share of the player's own missed shots that the player rebounds.",
  pbp_team_miss_orb_pct: "Share of teammates' missed shots, while the player is on the court, that the player rebounds.",
  pbp_charges_drawn: "Offensive fouls drawn by taking a charge.",
  pbp_credited_ftov_per100: "Steals plus charges drawn per 100 defensive possessions.",
  fg2m: "Two-point field goals made (all makes inside the three-point line).",
  fg2a: "Two-point field goal attempts.",
  fg2_pct: "Two-pointers made divided by two-pointers attempted.",
  rim_ast: "Assists on made shots in the restricted area.",
  rim_ast_per100: "Assists on made shots in the restricted area, per 100 offensive possessions played.",
  offensive_load: "How many of every 100 offensive possessions the player finishes or creates: shots, free-throw trips, shots set up for teammates and turnovers (Ben Taylor's formula).",
  ctov_pct: "Turnovers divided by Offensive Load, so players who run many plays are not penalised for their volume.",
  on_ball_pct: "Share of the player's court time spent holding the ball: NBA tracking time of possession divided by minutes played.",
  pts_created: "Points scored plus points produced by the player's assists (NBA tracking assist points).",
};

const RAPM: Record<string, string> = {
  orapm: "Estimated points per 100 possessions the player adds on offense relative to an average player, controlling for teammates and opponents.",
  drapm: "Estimated points per 100 possessions the player saves on defense relative to an average player, controlling for teammates and opponents.",
  rapm: "Estimated points per 100 possessions the player adds relative to an average player, from ridge regression on play-by-play stints that controls for teammates and opponents.",
  obpr: "Offensive RAPM shrunk toward a prior-season box-score estimate rather than toward zero, which steadies small samples.",
  dbpr: "Defensive RAPM shrunk toward a prior-season box-score estimate rather than toward zero, which steadies small samples.",
  bpr: "Offensive plus defensive RAPM, each shrunk toward a prior-season box-score estimate rather than toward zero.",
};

const RAPM_NAMES: Record<string, string> = {
  orapm: "Offensive Regularized Adjusted Plus-Minus", drapm: "Defensive Regularized Adjusted Plus-Minus",
  rapm: "Regularized Adjusted Plus-Minus", obpr: "Offensive Box Prior RAPM", dbpr: "Defensive Box Prior RAPM",
  bpr: "Box Prior RAPM",
};

const SPAN: Record<string, string> = { "": "Fit on one season.", "_2y": "Fit on two seasons.", "_3y": "Fit on three seasons." };
const SPAN_NAME: Record<string, string> = { "": "1 season", "_2y": "2 seasons", "_3y": "3 seasons" };

/** Full names where the catalog's display name is only an abbreviation or reads like a field name. */
const NAME: Record<string, string> = {
  o_ts: "Offensive True Shooting Impact", d_ts: "Defensive True Shooting Impact",
  o_tov: "Offensive Turnover Impact", d_tov: "Defensive Turnover Impact",
  o_reb: "Offensive Rebounding Impact", d_reb: "Defensive Rebounding Impact",
  on_net_rating: "Net Rating On Court", onoff_net_rating: "Net Rating On-Off Difference",
  on_offensive_rating: "Offensive Rating On Court", onoff_offensive_rating: "Offensive Rating On-Off Difference",
  on_defensive_rating: "Defensive Rating On Court", onoff_defensive_rating: "Defensive Rating On-Off Difference",
  pbp_stl_per100: "Steals Per 100 Possessions", pbp_blk_per100: "Blocks Per 100 Possessions",
  pbp_foul_frequency: "Foul Rate", pbp_drb_pct: "Defensive Rebound Percentage",
  pbp_block_recovered_pct: "Block Recovery Percentage", matchup_fga_per100: "Matchup Shots Faced Per 100 Possessions",
  impact_ts_pct: "True Shooting Percentage (Play-by-Play Sample)", impact_rts: "Relative True Shooting",
  impact_tsadd_per100: "True Shooting Points Added Per 100 Possessions", impact_three_point_rate: "Three-Point Attempt Rate",
  impact_ftr: "Free Throw Rate (Play-by-Play Sample)", impact_ast_per100: "Assists Per 100 Possessions",
  pbp_bad_pass_tov: "Bad-Pass Turnovers", pbp_rim_assists: "Rim Assists",
  pbp_self_miss_orb_pct: "Own-Miss Offensive Rebound Percentage", pbp_team_miss_orb_pct: "Teammate-Miss Offensive Rebound Percentage",
  pbp_charges_drawn: "Charges Drawn", pbp_credited_ftov_per100: "Turnovers Forced Per 100 Possessions",
  rim_ast_per100: "Rim Assists Per 100 Possessions",
};

const BUCKET_NAMES: Record<string, string> = { create: "Self-Created", space: "Spacing", trans: "Transition", finish: "Rim Finishing", unknown: "Unclassified" };
const BUCKET_STAT_NAMES: Record<string, string> = { tsa: "True Shooting Attempts", frequency: "Shot Frequency", ts: "True Shooting Percentage", rts: "Relative True Shooting" };

const PER_36: Record<string, string> = {
  pts: "Points", reb: "Rebounds", ast: "Assists", stl: "Steals", blk: "Blocks", tov: "Turnovers", pf: "Personal fouls",
  oreb: "Offensive rebounds", dreb: "Defensive rebounds", fga: "Field goal attempts", fg3a: "Three-point attempts", fta: "Free throw attempts",
  rim_ast: "Rim assists", pts_created: "Points created",
};

const BUCKETS: Record<string, string> = {
  create: "unassisted shots outside the restricted area (self-created)",
  space: "assisted shots outside the restricted area (spacing)",
  trans: "shots within 6 seconds of an opponent turnover or defensive rebound (transition)",
  finish: "half-court shots in the restricted area (finishing)",
  unknown: "shots without a usable location or assist record",
};

const BUCKET_STAT: Record<string, (bucket: string) => string> = {
  tsa: bucket => `True shooting attempts (FGA + 0.44 × FTA) on ${bucket}.`,
  frequency: bucket => `Share of the player's true shooting attempts that were ${bucket}.`,
  ts: bucket => `True shooting percentage on ${bucket}.`,
  rts: bucket => `True shooting percentage on ${bucket}, relative to the league average on the same shot type.`,
};

/** Friendlier short forms where the catalog's own short name reads like a field name. */
const SHORT: Record<string, string> = {
  team_possessions_estimated: "POSS", team_off_rtg_estimated: "ORTG", team_def_rtg_estimated: "DRTG",
  team_net_rtg_estimated: "NET RTG", team_efg_pct: "Team eFG%", team_tov_pct: "Team TOV%",
  team_oreb_pct: "Team OREB%", team_ftr: "Team FTR", pbp_foul_frequency: "Foul rate",
  pbp_block_recovered_pct: "BLK REC%", matchup_fga_per100: "Matchup FGA/100",
  pbp_credited_ftov_per100: "Forced TOV/100", pbp_charges_drawn: "Charges",
  impact_ts_pct: "PBP TS%", impact_ftr: "PBP FTR", pbp_rim_assists: "Rim AST", pbp_bad_pass_tov: "Bad-pass TOV",
  fgm_per_game: "FGM/G", fga_per_game: "FGA/G", fg3m_per_game: "3PM/G", fg3a_per_game: "3PA/G", ftm_per_game: "FTM/G",
  fta_per_game: "FTA/G", rim_ast_per_36: "Rim AST/36", pts_created_per_36: "PTS Created/36",
};

const BUCKET_SHORT: Record<string, string> = { create: "Create", space: "Space", trans: "Transition", finish: "Rim", unknown: "Unclassified" };
const BUCKET_STAT_SHORT: Record<string, string> = { tsa: "TSA", frequency: "Freq", ts: "TS%", rts: "rTS" };

export function glossaryShortName(metric: MetricDefinition): string {
  const bucket = metric.key.match(/^pbp_(create|space|trans|finish|unknown)_(tsa|frequency|ts|rts)$/);
  if (bucket) return `${BUCKET_SHORT[bucket[1]]} ${BUCKET_STAT_SHORT[bucket[2]]}`;
  return SHORT[metric.key] ?? metric.short_name;
}

/** The full name: spells the abbreviation out, never repeats it. */
export function glossaryName(metric: MetricDefinition): string {
  if (NAME[metric.key]) return NAME[metric.key];
  const rapm = metric.key.match(/^(orapm|drapm|rapm|obpr|dbpr|bpr)(_2y|_3y)?$/);
  if (rapm) return `${RAPM_NAMES[rapm[1]]} (${SPAN_NAME[rapm[2] ?? ""]})`;
  const bucket = metric.key.match(/^pbp_(create|space|trans|finish|unknown)_(tsa|frequency|ts|rts)$/);
  if (bucket) return `${BUCKET_NAMES[bucket[1]]} ${BUCKET_STAT_NAMES[bucket[2]]}`;
  return metric.display_name;
}

export function glossaryPlain(metric: MetricDefinition): string {
  if (PLAIN[metric.key]) return PLAIN[metric.key];
  const perGame = metric.key.match(/^(\w+)_per_game$/);
  const base = perGame && (PLAIN[perGame[1]] ?? PLAIN[perGame[1].replace("_total", "")]);
  if (base) return `${base.replace(/\.$/, "")}, averaged per game.`;
  const rapm = metric.key.match(/^(orapm|drapm|rapm|obpr|dbpr|bpr)(_2y|_3y)?$/);
  if (rapm) return `${RAPM[rapm[1]]} ${SPAN[rapm[2] ?? ""]}`;
  const per36 = metric.key.match(/^(\w+)_per_36$/);
  if (per36 && PER_36[per36[1]]) return `${PER_36[per36[1]]} per 36 minutes played, putting players with different minutes on the same scale.`;
  const bucket = metric.key.match(/^pbp_(create|space|trans|finish|unknown)_(tsa|frequency|ts|rts)$/);
  if (bucket) return BUCKET_STAT[bucket[2]](BUCKETS[bucket[1]]);
  return metric.display_name;
}

export function glossaryGroup(metric: MetricDefinition): GlossaryGroup {
  const key = metric.key;
  if (/^pbp_(create|space|trans|finish|unknown)_/.test(key)) return "Play Types";
  if (key.endsWith("_per_36")) return "Rates";
  switch (metric.category) {
    case "participation": case "scoring": return "Counting Stats";
    case "rebounding": return key.startsWith("pbp_") ? "Rebounding" : "Counting Stats";
    case "playmaking": return "Counting Stats";
    case "defense": return "Counting Stats";
    case "efficiency": return ["fgm", "fga", "fg3m", "fg3a", "ftm", "fta"].includes(key.replace(/_per_game$/, "")) ? "Counting Stats" : "Shooting";
    case "impact": return "Impact Metrics";
    case "external_impact": return "Impact Metrics";
    case "on_off": return "On-Off";
    case "team_factors": return "Team";
    case "tracking": return key.startsWith("pts_created") ? "Counting Stats" : "Playmaking";
    case "impact_extras":
      if (["o_ts", "d_ts", "o_tov", "d_tov", "o_reb", "d_reb"].includes(key)) return "Impact Metrics";
      if (key.startsWith("impact_") && key !== "impact_ast_per100") return "Shooting";
      if (/stl|blk|foul|block|matchup|charges|ftov/.test(key)) return "Defense";
      if (/orb|drb/.test(key)) return "Rebounding";
      if (/ast|pass|load|ctov/.test(key)) return "Playmaking";
      return "Other";
    default: return "Other";
  }
}

export type MetricHint = { name: string; description: string };

/** Header hover text for every catalog metric: full name and the glossary definition. */
export function metricHints(metrics: MetricDefinition[]): Record<string, MetricHint> {
  return Object.fromEntries(metrics.map(metric => [metric.key, { name: glossaryName(metric), description: glossaryPlain(metric) }]));
}

export type GlossaryEntry = {
  key: string;
  short: string;
  name: string;
  plain: string;
  group: GlossaryGroup;
  metric: MetricDefinition;
};

/** One card per distinct statistic; catalog aliases with identical meaning collapse. */
export function glossaryEntries(metrics: MetricDefinition[]): GlossaryEntry[] {
  const seen = new Set<string>();
  return metrics.flatMap(metric => {
    const signature = `${metric.display_name}|${metric.formula}`;
    if (seen.has(signature)) return [];
    seen.add(signature);
    return [{ key: metric.key, short: glossaryShortName(metric), name: glossaryName(metric), plain: glossaryPlain(metric), group: glossaryGroup(metric), metric }];
  }).sort((a, b) => a.short.localeCompare(b.short, "en", { numeric: true, sensitivity: "base" }));
}
