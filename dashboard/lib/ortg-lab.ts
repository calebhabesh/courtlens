/**
 * RD02 ORTG Lab: Poropudas and Halme's Eq. (11) on the page, after Databallr's ORTG Lab.
 *
 *   ORTG = 100 × xSHOT × xEFF × xPOSS
 *   xSHOT = 1 − TOV%                      xEFF = FTA/FGA × FT% + 2 eFG%   (= FTr + 2 eFG%)
 *   xPOSS = 1 / (1 − ORB%(1 − FG%) + μ FTA/FGA)   (= 1 / (1 − ORB%(1 − FG%) + μ FTr / FT%))
 *
 * The starting point is a served row (league or team, one season) rebuilt from its counts, so the lab
 * reproduces the served Eq. (11) rating. Offensive rebounding is split by the kind of miss (Databallr's
 * adaptation): ORB%(1 − FG%) is the sum of each miss kind's misses per FGA times its OREB%, which at the
 * starting point is exactly the served ORB/FGA. Whatever the sliders do, the rating is Eq. (11) evaluated on
 * the inputs the lab shows (eFG%, FTr, TOV%, ORB%, FG%, FT%); the split only decides how ORB% follows a
 * change in shooting. No server call: the arithmetic is the design phase's (R10).
 */
import type { FactorRow } from "./research-r10";

/** Every control on the lab. `efg`, `ts` and `orb` are master dials that write back to the others. */
export type LabKey = "efg" | "p2" | "p3" | "ft" | "ts" | "r3" | "fta" | "tov" | "orb" | "o2" | "o3" | "oft";
/** The independent inputs, as fractions. */
export interface LabState { p2: number; p3: number; ft: number; r3: number; fta: number; tov: number; o2: number; o3: number; oft: number }
export interface LabBase {
  state: LabState;
  mu: number;
  /** Rebounded share of each miss kind (a miss before any rebound is unrebounded); fixed at the start. */
  q2: number; q3: number; qft: number; qand: number;
  /** Final free throws and and-one free throws per FTA, and their make rates minus FT% (fixed gaps). */
  endShare: number; endGap: number; andShare: number; andGap: number;
  /** OREB% after a missed and-one free throw: held at the start (Databallr has no control for it). */
  oand: number;
}
export interface LabTerms {
  ortg: number; xshot: number; xeff: number; xposs: number; den: number;
  efg: number; fg: number; ts: number; orb: number; ftr: number;
  shotValue: number; ftValue: number; missRate: number; fgRecycle: number; ftRecycle: number; ftEnding: number;
}

export const LAB_LABELS: Record<LabKey, string> = {
  efg: "eFG%", p2: "2P%", p3: "3P%", ft: "FT%", ts: "TS%", r3: "3PA Rate", fta: "FT Rate", tov: "TOV%",
  orb: "ORB%", o2: "2P OREB%", o3: "3P OREB%", oft: "FT OREB%",
};
/** What each control is, for the slider's accessible description. */
export const LAB_HINTS: Record<LabKey, string> = {
  efg: "Effective field-goal percentage; moves 2P% by one point and 3P% by two thirds of a point per point",
  p2: "Two-point field-goal percentage", p3: "Three-point field-goal percentage", ft: "Free-throw percentage",
  ts: "True shooting percentage; moves 2P%, 3P% and FT% together", r3: "Share of field-goal attempts that are threes",
  fta: "Free-throw attempts per field-goal attempt", tov: "Turnovers per estimated possession (Eq. 10)",
  orb: "Offensive rebounds per missed field goal (Eq. 9); moves 2P and 3P OREB% together",
  o2: "Offensive rebound rate after a missed two", o3: "Offensive rebound rate after a missed three",
  oft: "Offensive rebound rate after a missed final free throw",
};
export const LAB_GROUPS: readonly { label: string; keys: readonly LabKey[] }[] = [
  { label: "Shooting", keys: ["efg", "p2", "p3", "ft", "ts"] },
  { label: "Volume / Mix", keys: ["r3", "fta", "tov"] },
  { label: "Rebounding", keys: ["orb", "o2", "o3", "oft"] },
];
/** The stepper board's order (Databallr's: the four factors first). */
export const BOARD_KEYS: readonly LabKey[] = ["efg", "tov", "orb", "fta", "ts", "p2", "p3", "ft", "r3", "o2", "o3", "oft"];
/** Half the slider's span around the starting value, in fractions. */
const SPAN: Record<LabKey, number> = { efg: 0.08, p2: 0.1, p3: 0.1, ft: 0.15, ts: 0.08, r3: 0.2, fta: 0.15, tov: 0.07, orb: 0.12, o2: 0.12, o3: 0.12, oft: 0.1 };
/** One point, the size of a stepper click and of the marginal (a turnover point is an improvement down). */
export const STEP = 0.01;
export const stepSign = (key: LabKey) => key === "tov" ? -1 : 1;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ratio = (a: number, b: number) => b > 0 ? a / b : 0;

/** Rebuild a served row's inputs from its counts (exact, not the rounded rates). */
export function labBase(row: FactorRow, mu: number): LabBase | null {
  const c = row.counts, r = row.rebounds_by_miss;
  const { fga, fgm, fg3a, fg3m, fta, ftm, tov } = c;
  if (!(fga > 0) || !(fta > 0) || !(fg3a > 0) || !(fga - fg3a > 0)) return null;
  const orbCount = r.two.offensive + r.three.offensive + r.ft_end.offensive + r.and_one.offensive;
  const poss = fga + tov - orbCount + mu * fta;
  const ft = ftm / fta;
  const rate = (k: keyof typeof r) => ratio(r[k].offensive, r[k].offensive + r[k].defensive);
  const rebounded = (k: keyof typeof r) => ratio(r[k].offensive + r[k].defensive, r[k].misses);
  return {
    state: { p2: (fgm - fg3m) / (fga - fg3a), p3: fg3m / fg3a, ft, r3: fg3a / fga, fta: fta / fga, tov: ratio(tov, poss), o2: rate("two"), o3: rate("three"), oft: rate("ft_end") },
    mu,
    q2: rebounded("two"), q3: rebounded("three"), qft: rebounded("ft_end"), qand: rebounded("and_one"),
    endShare: c.ft_end / fta, endGap: ratio(c.ft_end_made, c.ft_end) - ft,
    andShare: c.ft_and_one / fta, andGap: (1 - ratio(c.miss_and_one, c.ft_and_one)) - ft,
    oand: rate("and_one"),
  };
}

export function labTerms(base: LabBase, s: LabState): LabTerms {
  const miss2 = (1 - s.r3) * (1 - s.p2), miss3 = s.r3 * (1 - s.p3);
  const fgRecycle = s.o2 * base.q2 * miss2 + s.o3 * base.q3 * miss3;
  const missEnd = base.endShare * s.fta * (1 - clamp01(s.ft + base.endGap));
  const missAnd = base.andShare * s.fta * (1 - clamp01(s.ft + base.andGap));
  const ftRecycle = s.oft * base.qft * missEnd + base.oand * base.qand * missAnd;
  const ftEnding = base.mu * s.fta;
  const den = 1 - fgRecycle - ftRecycle + ftEnding;
  const efg = (1 - s.r3) * s.p2 + 1.5 * s.r3 * s.p3;
  const fg = (1 - s.r3) * s.p2 + s.r3 * s.p3;
  const ftr = s.fta * s.ft;
  const xshot = 1 - s.tov, xeff = ftr + 2 * efg, xposs = den > 0 ? 1 / den : Number.NaN;
  return {
    ortg: 100 * xshot * xeff * xposs, xshot, xeff, xposs, den, efg, fg, ftr,
    ts: xeff / (2 * (1 + 0.44 * s.fta)),
    orb: ratio(fgRecycle + ftRecycle, 1 - fg),
    shotValue: 2 * efg, ftValue: ftr, missRate: 1 - fg, fgRecycle, ftRecycle, ftEnding,
  };
}

/** Eq. (11) as the paper writes it, on its six inputs: the check the lab must always pass. */
export function eq11(efg: number, ftr: number, tov: number, orb: number, fg: number, ft: number, mu: number) {
  return 100 * (1 - tov) * (ftr + 2 * efg) / (1 - orb * (1 - fg) + mu * ftr / ft);
}

export function labValue(base: LabBase, s: LabState, key: LabKey): number {
  if (key === "efg" || key === "ts" || key === "orb") return labTerms(base, s)[key];
  return s[key];
}

/** Set one control. Master dials write back: eFG +1 = 2P +1 and 3P +⅔ (exactly +1 eFG); TS moves 2P, 3P (⅔) and
 *  FT by the amount that moves TS exactly; ORB% moves 2P and 3P OREB% by the same amount. */
export function labSet(base: LabBase, s: LabState, key: LabKey, value: number): LabState {
  const next = { ...s };
  if (key === "efg" || key === "ts" || key === "orb") {
    const t = labTerms(base, s);
    const delta = value - t[key];
    if (key === "efg") { next.p2 += delta; next.p3 += delta * 2 / 3; }
    else if (key === "ts") { const k = delta * 2 * (1 + 0.44 * s.fta) / (2 + s.fta); next.p2 += k; next.p3 += k * 2 / 3; next.ft += k; }
    else {
      const per = base.q2 * (1 - s.r3) * (1 - s.p2) + base.q3 * s.r3 * (1 - s.p3);
      const c = per > 0 ? delta * (1 - t.fg) / per : 0;
      next.o2 += c; next.o3 += c;
    }
  } else next[key] = value;
  for (const k of Object.keys(next) as (keyof LabState)[]) next[k] = clamp01(next[k]);
  return next;
}

/** ORTG change for a one-point improvement in this control from the current state (TOV% one point down). */
export function labMarginal(base: LabBase, s: LabState, key: LabKey): number {
  const now = labTerms(base, s).ortg;
  return labTerms(base, labSet(base, s, key, labValue(base, s, key) + stepSign(key) * STEP)).ortg - now;
}

/** The slider's range: the starting value ± its span, inside 0–100%, on a 0.1-point grid. */
export function labRange(base: LabBase, key: LabKey): { min: number; max: number } {
  const v = labValue(base, base.state, key);
  return { min: Math.max(0, Math.floor((v - SPAN[key]) * 1000) / 1000), max: Math.min(1, Math.ceil((v + SPAN[key]) * 1000) / 1000) };
}
