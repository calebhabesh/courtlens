import { fact, type FactId } from "./research-facts";

/**
 * Research landing (R12): one card per headline result, with one number, its test seasons and the
 * evidence. Numbers come from `research-facts.ts` (checked against the frozen results by Vitest and
 * against the served APIs by the real-data check). R16 has no number until its evaluation finishes.
 */

export interface HeadlineCard {
  id: string;
  block: string;
  title: string;
  /** The one number, or null while the evaluation is in progress. */
  headline: { fact: FactId; suffix?: string } | null;
  /** One sentence. */
  sentence: string;
  /** Test seasons, or the state of an unfinished evaluation. */
  tested: string;
  page: string;
  evidence: string | null;
}

export const HEADLINE_CARDS: readonly HeadlineCard[] = [
  {
    id: "win-probability", block: "R15", title: "Win Probability",
    headline: { fact: "wp.logLoss" },
    sentence: `Log loss over the in-game states of ${fact("wp.games")} test games, against ${fact("wp.baselineLogLoss")} for the baseline, with calibration error ${fact("wp.calibration")}.`,
    tested: `Tested on ${fact("wp.seasons")}; scored nightly on 2026-27`,
    page: "/research/win-probability", evidence: "docs/evidence/research/r15a/README.md",
  },
  {
    id: "metric-backtest", block: "R08", title: "Metric Backtest",
    headline: { fact: "bt.gain" },
    sentence: `Monthly time-decay RAPM predicts game margins ${fact("bt.gain")} points better in RMSE (${fact("bt.gainLow")} to ${fact("bt.gainHigh")}) than team net rating, the only metric ranked above every other.`,
    tested: `Tested on ${fact("bt.games")} games, ${fact("bt.seasons")}`,
    page: "/research/backtest", evidence: "docs/evidence/research/r08/README.md",
  },
  {
    id: "projected-impact", block: "R07", title: "Projected Impact",
    headline: { fact: "pi.gain" },
    sentence: `CourtLens's own player rating beats carrying last season forward by ${fact("pi.gain")} (${fact("pi.gainLow")} to ${fact("pi.gainHigh")}) in minutes-weighted squared error.`,
    tested: `Tested on ${fact("pi.seasons")}; 2026-27 projections frozen before the games they are scored on`,
    page: "/research/projected-impact", evidence: "docs/evidence/research/r07/README.md",
  },
  {
    id: "shot-quality", block: "R05", title: "Shot Quality v2",
    headline: { fact: "sq.brier", suffix: "%" },
    sentence: `The expected-points shot model's Brier score is ${fact("sq.brier")}% better (${fact("sq.brierLow")}% to ${fact("sq.brierHigh")}%) than league zone and distance rates.`,
    tested: `Tested on ${fact("sq.seasons")}`,
    page: "/research/shot-quality", evidence: "docs/evidence/research/r05/README.md",
  },
  {
    id: "ask-evaluation", block: "R16", title: "Ask Evaluation",
    headline: null,
    sentence: "The assistant's held-out evaluation is running on the free provider tier; its accuracy will appear here when it finishes.",
    tested: "Holdout not yet run",
    page: "/research/ask", evidence: null,
  },
];
