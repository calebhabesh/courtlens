/**
 * Measured Research numbers quoted in prose (Learning and the README).
 *
 * Each fact keeps the displayed value beside the committed file and field it comes from.
 * `research-facts.test.ts` reads every source file and fails if a value no longer equals its
 * source, so a quoted number can't drift from the frozen result it cites. Pages read the values
 * here and never parse result files at runtime.
 */

/** A step into a JSON file: an object key, an array index, or the array element whose fields match. */
export type FactStep = string | number | Readonly<Record<string, string>>;

interface FactBase {
  /** Repository-relative path of the committed result file. */
  file: string;
}

export interface NumberFact extends FactBase {
  kind: "number";
  path: readonly FactStep[];
  /** The value as displayed, already rounded (after `scale`). */
  value: number;
  digits: number;
  /** Multiplier before rounding (100 for a share shown as a percentage). */
  scale?: number;
  /** Show the absolute value (the sign is stated in words). */
  abs?: boolean;
  /** Show "+" before positive values. */
  sign?: boolean;
}

/** One minus the ratio of two fields, shown as a percentage: the share of error removed. */
export interface ReductionFact extends FactBase {
  kind: "reduction";
  before: readonly FactStep[];
  after: readonly FactStep[];
  /** Percentage, rounded to whole points. */
  value: number;
}

/** Seasons (an array, or an object keyed by season), displayed as "A and B" (two) or "A to B" (more). */
export interface SeasonsFact extends FactBase {
  kind: "seasons";
  path: readonly FactStep[];
  value: string;
}

export type ResearchFact = NumberFact | ReductionFact | SeasonsFact;

const FROZEN = "evaluation/research/frozen/";
const WP_CARD = `${FROZEN}courtlens-win-probability-v2-card.json`;
const BACKTEST = `${FROZEN}courtlens-metric-backtest-v1.json`;
const PI_CARD = `${FROZEN}courtlens-projected-impact-v1-card.json`;
const SHOTS = `${FROZEN}courtlens-expected-shot-v2.json`;
const SIGNAL = `${FROZEN}courtlens-signal-noise-v1.json`;
const SIX = `${FROZEN}courtlens-six-factor-reconstruction-v1.json`;
const DECOMP = `${FROZEN}courtlens-shot-decomposition-v1.json`;
const ZTS = `${FROZEN}courtlens-zts-validation-v1.json`;
const LINEUP = `${FROZEN}courtlens-lineup-model-v1.json`;
const DRAFT = `${FROZEN}courtlens-draft-value-v1.json`;
const WINGSPAN = `${FROZEN}courtlens-wingspan-ddpm-v1.json`;

const TD_PAIR = { candidate: "time_decay", reference: "team_net" };
const LEVEL = (key: string) => ["stabilization", "stats", { key }, "levels", "0.5"];
const BRIER = ["test", "pooled", "versus_baseline", "lightgbm_31", "relative_brier"];
const PICK_1_2 = { band: "pick_1_vs_2", era: "all", measure: "ws" };
const SPAN = { x: "diff", y: "d_dpm", population: "analysis" };

export const RESEARCH_FACTS = {
  // R15a: Win Probability final test (log loss over the in-game states of the test games).
  "wp.logLoss": { kind: "number", file: WP_CARD, path: ["models", "selected", "log_loss", "mean"], value: 0.4028, digits: 4 },
  "wp.baselineLogLoss": { kind: "number", file: WP_CARD, path: ["models", "S0", "log_loss", "mean"], value: 0.4157, digits: 4 },
  "wp.calibration": { kind: "number", file: WP_CARD, path: ["gates", "A2", "ece"], value: 0.0083, digits: 4 },
  "wp.games": { kind: "number", file: WP_CARD, path: ["test_games"], value: 2439, digits: 0 },
  "wp.seasons": { kind: "seasons", file: WP_CARD, path: ["test_seasons"], value: "2024-25 and 2025-26" },
  // R08: Metric Backtest, game margin RMSE with ratings fixed before each game.
  "bt.timeDecayRmse": { kind: "number", file: BACKTEST, path: ["candidates", "time_decay", "pooled", "rmse"], value: 13.52, digits: 2 },
  "bt.teamNetRmse": { kind: "number", file: BACKTEST, path: ["candidates", "team_net", "pooled", "rmse"], value: 14.32, digits: 2 },
  "bt.gain": { kind: "number", file: BACKTEST, path: ["pairs", TD_PAIR, "pooled", "rmse", "gain"], value: 0.8, digits: 2, sign: true },
  "bt.gainLow": { kind: "number", file: BACKTEST, path: ["pairs", TD_PAIR, "pooled", "rmse", "low"], value: 0.72, digits: 2, sign: true },
  "bt.gainHigh": { kind: "number", file: BACKTEST, path: ["pairs", TD_PAIR, "pooled", "rmse", "high"], value: 0.88, digits: 2, sign: true },
  "bt.games": { kind: "number", file: BACKTEST, path: ["pairs", TD_PAIR, "games"], value: 11979, digits: 0 },
  "bt.seasons": { kind: "seasons", file: BACKTEST, path: ["pairs", TD_PAIR, "seasons"], value: "2016-17 to 2025-26" },
  // R07: Projected Impact against carry-forward (minutes-weighted squared-error gap, players).
  "pi.gain": { kind: "number", file: PI_CARD, path: ["test", "gates", "A1_player", "gap"], value: 4.38, digits: 2, sign: true },
  "pi.gainLow": { kind: "number", file: PI_CARD, path: ["test", "gates", "A1_player", "low"], value: 3.25, digits: 2, sign: true },
  "pi.gainHigh": { kind: "number", file: PI_CARD, path: ["test", "gates", "A1_player", "high"], value: 5.5, digits: 2, sign: true },
  "pi.seasons": { kind: "seasons", file: PI_CARD, path: ["test", "seasons"], value: "2024-25 and 2025-26" },
  // R05: Shot Quality v2, relative Brier improvement over league zone × distance rates.
  "sq.brier": { kind: "number", file: SHOTS, path: [...BRIER, "value"], value: 2.56, digits: 2, scale: 100 },
  "sq.brierLow": { kind: "number", file: SHOTS, path: [...BRIER, "interval", 0], value: 2.44, digits: 2, scale: 100 },
  "sq.brierHigh": { kind: "number", file: SHOTS, path: [...BRIER, "interval", 1], value: 2.67, digits: 2, scale: 100 },
  "sq.seasons": { kind: "seasons", file: SHOTS, path: ["test", "seasons"], value: "2024-25 and 2025-26" },
  // R03: Signal vs Noise, attempts until half of the spread is skill (reliability 0.5).
  "sn.ftAttempts": { kind: "number", file: SIGNAL, path: [...LEVEL("ft_pct"), "n"], value: 27, digits: 0 },
  "sn.tsAttempts": { kind: "number", file: SIGNAL, path: [...LEVEL("ts_pct"), "n"], value: 169, digits: 0 },
  "sn.threeLargestRho": { kind: "number", file: SIGNAL, path: [...LEVEL("fg3_pct"), "largest_rho"], value: 0.486, digits: 3 },
  "sn.threeLargestN": { kind: "number", file: SIGNAL, path: [...LEVEL("fg3_pct"), "largest_n"], value: 480, digits: 0 },
  "sn.threeShrinkCut": { kind: "reduction", file: SIGNAL, before: ["validation", "fg3_pct", "pooled", "mse", "raw"], after: ["validation", "fg3_pct", "pooled", "mse", "shrunk"], value: 53 },
  "sn.ftShrinkCut": { kind: "reduction", file: SIGNAL, before: ["validation", "ft_pct", "pooled", "mse", "raw"], after: ["validation", "ft_pct", "pooled", "mse", "shrunk"], value: 32 },
  // R02: six factors reconstruct RAPM (R², cross-validated, latest season).
  "sf.r2": { kind: "number", file: SIX, path: ["seasons", "2025-26", "rapm_on_six", "cross_validated", "value"], value: 0.952, digits: 3 },
  // R06: next-season persistence of shot quality and shot making (offense).
  "sd.sqR": { kind: "number", file: DECOMP, path: ["persistence", "correlations", "offense:sq", "r"], value: 0.451, digits: 3 },
  "sd.makeR": { kind: "number", file: DECOMP, path: ["persistence", "correlations", "offense:make", "r"], value: 0.349, digits: 3 },
  "sd.diff": { kind: "number", file: DECOMP, path: ["persistence", "correlations", "offense:sq_minus_make", "r"], value: 0.1, digits: 2, sign: true },
  "sd.diffLow": { kind: "number", file: DECOMP, path: ["persistence", "correlations", "offense:sq_minus_make", "interval", 0], value: -0.02, digits: 2, sign: true },
  "sd.diffHigh": { kind: "number", file: DECOMP, path: ["persistence", "correlations", "offense:sq_minus_make", "interval", 1], value: 0.21, digits: 2, sign: true },
  // R04: zTS against rTS on the test seasons.
  "zts.trackingGain": { kind: "number", file: ZTS, path: ["validation", "tracking", "test", "pooled", "metrics", "delta_r", "value"], value: 0.135, digits: 3, sign: true },
  "zts.predictiveGain": { kind: "number", file: ZTS, path: ["validation", "predictive", "test", "pooled", "metrics", "delta_r", "value"], value: -0.134, digits: 3, sign: true },
  // R14: the lineup model against ridge RAPM (weighted RMSE per 100 possessions, held-out stints).
  "lm.ridgeEdge": { kind: "number", file: LINEUP, path: ["gains", "lineup_over_ridge", "pooled", "gain"], value: -0.000011, digits: 6, abs: true },
  // R09: first-four-season win shares at picks 1 and 2.
  "dv.pick1": { kind: "number", file: DRAFT, path: ["bands", PICK_1_2, "mean_a"], value: 24.8, digits: 1 },
  "dv.pick2": { kind: "number", file: DRAFT, path: ["bands", PICK_1_2, "mean_b"], value: 17.5, digits: 1 },
  // R10: wingspan minus height against career D-DPM.
  "ws.r": { kind: "number", file: WINGSPAN, path: ["correlations", SPAN, "r"], value: 0.21, digits: 2, sign: true },
  "ws.n": { kind: "number", file: WINGSPAN, path: ["correlations", SPAN, "n"], value: 822, digits: 0 },
} as const satisfies Record<string, ResearchFact>;

export type FactId = keyof typeof RESEARCH_FACTS;

const grouped = new Intl.NumberFormat("en-US", { useGrouping: true });

/** The fact as displayed: rounded, signed or unsigned, with thousands separators. */
export function formatFact(fact: ResearchFact): string {
  if (fact.kind === "seasons") return fact.value;
  if (fact.kind === "reduction") return `${fact.value}%`;
  const value = fact.abs ? Math.abs(fact.value) : fact.value;
  const text = fact.digits === 0 ? grouped.format(Math.abs(value)) : Math.abs(value).toFixed(fact.digits);
  const sign = value < 0 ? "−" : fact.sign && value > 0 ? "+" : "";
  return `${sign}${text}`;
}

/** Display text of a fact by id. */
export const fact = (id: FactId): string => formatFact(RESEARCH_FACTS[id]);

/** The repository's public source, for links to committed evidence. */
export const REPO_URL = "https://github.com/calebhabesh/courtlens";
export const evidenceUrl = (path: string): string => `${REPO_URL}/blob/main/${path}`;
