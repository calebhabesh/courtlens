import type { MetricDefinition } from "./types";

/**
 * Glossary copy: standard definitions in readable prose for the metric catalog. Presentation only: the catalog stays the
 * one source of formulas, validity and limitations, which the glossary shows on request.
 */

export type GlossaryGroup = "Counting Stats" | "Shooting" | "Rates" | "Impact Metrics" | "On-Off" | "Defense"
  | "Rebounding" | "Playmaking" | "Play Types" | "Team" | "Other";

export const GLOSSARY_GROUPS: GlossaryGroup[] = ["Counting Stats", "Shooting", "Rates", "Impact Metrics", "On-Off",
  "Defense", "Rebounding", "Playmaking", "Play Types", "Team", "Other"];

const PLAIN: Record<string, string> = {
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
  o_ts: "Six-factor RAPM: the player's estimated effect on the team's true shooting, controlling for teammates and opponents.",
  d_ts: "Six-factor RAPM: the player's estimated effect on opponents' true shooting, controlling for teammates and opponents.",
  o_tov: "Six-factor RAPM: the player's estimated effect on the team's turnover rate (positive means fewer turnovers).",
  d_tov: "Six-factor RAPM: the player's estimated effect on opponents' turnover rate (positive means more forced turnovers).",
  o_reb: "Six-factor RAPM: the player's estimated effect on the team's offensive rebounding rate.",
  d_reb: "Six-factor RAPM: the player's estimated effect on limiting opponents' offensive rebounding rate.",
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
  impact_ts_pct: "Points per shooting possession, accounting for the extra value of threes and free throws.",
  impact_rts: "Relative True Shooting: the player's TS% minus the league-average TS%.",
  impact_tsadd_per100: "Points added over a league-average shooter on the same shooting volume, per 100 possessions.",
  impact_three_point_rate: "Three-point attempts as a share of all field goal attempts (3PA / FGA).",
  impact_ftr: "Free throw attempts per field goal attempt.",
  impact_ast_per100: "Assists per 100 offensive possessions played.",
  pbp_bad_pass_tov: "Turnovers recorded as bad passes in play-by-play.",
  pbp_rim_assists: "Assists on made shots in the restricted area.",
  pbp_self_miss_orb_pct: "Share of the player's own missed shots that the player rebounds.",
  pbp_team_miss_orb_pct: "Share of teammates' missed shots, while the player is on the court, that the player rebounds.",
  pbp_charges_drawn: "Offensive fouls drawn by taking a charge.",
  pbp_credited_ftov_per100: "Steals plus charges drawn per 100 defensive possessions.",
};

const RAPM: Record<string, string> = {
  orapm: "Offensive Regularized Adjusted Plus-Minus: estimated points per 100 possessions the player adds on offense relative to an average player, controlling for teammates and opponents.",
  drapm: "Defensive Regularized Adjusted Plus-Minus: estimated points per 100 possessions the player saves on defense relative to an average player, controlling for teammates and opponents.",
  rapm: "Regularized Adjusted Plus-Minus: estimated points per 100 possessions the player adds relative to an average player, from ridge regression on play-by-play stints controlling for teammates and opponents.",
  obpr: "Offensive Box Prior RAPM: offensive RAPM shrunk toward a prior-season box-score estimate rather than zero, which stabilises small samples.",
  dbpr: "Defensive Box Prior RAPM: defensive RAPM shrunk toward a prior-season box-score estimate rather than zero, which stabilises small samples.",
  bpr: "Box Prior RAPM: offensive plus defensive RAPM, each shrunk toward a prior-season box-score estimate.",
};

const SPAN: Record<string, string> = { "": "Fit on one season.", "_2y": "Fit on two seasons.", "_3y": "Fit on three seasons." };

const PER_36: Record<string, string> = {
  pts: "Points", reb: "Rebounds", ast: "Assists", stl: "Steals", blk: "Blocks", tov: "Turnovers", pf: "Personal fouls",
  oreb: "Offensive rebounds", dreb: "Defensive rebounds", fga: "Field goal attempts", fg3a: "Three-point attempts", fta: "Free throw attempts",
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
};

const BUCKET_SHORT: Record<string, string> = { create: "Create", space: "Space", trans: "Transition", finish: "Rim", unknown: "Unclassified" };
const BUCKET_STAT_SHORT: Record<string, string> = { tsa: "TSA", frequency: "Freq", ts: "TS%", rts: "rTS" };

export function glossaryShortName(metric: MetricDefinition): string {
  const bucket = metric.key.match(/^pbp_(create|space|trans|finish|unknown)_(tsa|frequency|ts|rts)$/);
  if (bucket) return `${BUCKET_SHORT[bucket[1]]} ${BUCKET_STAT_SHORT[bucket[2]]}`;
  return SHORT[metric.key] ?? metric.short_name;
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
    case "efficiency": return ["fgm", "fga", "fg3m", "fg3a", "ftm", "fta"].includes(key) ? "Counting Stats" : "Shooting";
    case "impact": return "Impact Metrics";
    case "on_off": return "On-Off";
    case "team_factors": return "Team";
    case "impact_extras":
      if (["o_ts", "d_ts", "o_tov", "d_tov", "o_reb", "d_reb"].includes(key)) return "Impact Metrics";
      if (key.startsWith("impact_") && key !== "impact_ast_per100") return "Shooting";
      if (/stl|blk|foul|block|matchup|charges|ftov/.test(key)) return "Defense";
      if (/orb|drb/.test(key)) return "Rebounding";
      if (/ast|pass/.test(key)) return "Playmaking";
      return "Other";
    default: return "Other";
  }
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
    return [{ key: metric.key, short: glossaryShortName(metric), name: metric.display_name, plain: glossaryPlain(metric), group: glossaryGroup(metric), metric }];
  }).sort((a, b) => a.short.localeCompare(b.short, "en", { numeric: true, sensitivity: "base" }));
}
