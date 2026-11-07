/**
 * RD01 length formats after Databallr's Wingspan page. The combine measures to the quarter inch, so
 * feet-inches use ¼ ½ ¾ where a value lands on a quarter and two decimals otherwise (averages).
 * Unknown is always "—", never zero. The exact served number stays on each cell's `data-value`.
 */
export type Units = "ftin" | "in";

const QUARTERS: Record<number, string> = { 0: "", 1: "¼", 2: "½", 3: "¾" };
const known = (value: number | null | undefined): value is number => typeof value === "number" && Number.isFinite(value);

/** Inches with quarter glyphs when exact to a quarter, else two decimals (trailing zeros kept). */
function inchPart(value: number): string {
  const quarters = Math.round(value * 4);
  if (Math.abs(quarters / 4 - value) < 1e-9) {
    const whole = Math.floor(quarters / 4), rest = quarters - whole * 4;
    return `${whole}${QUARTERS[rest]}`;
  }
  return value.toFixed(2);
}

/** A length: 7′3¾″ in feet-inches, 87.75″ in inches. */
export function lengthText(value: number | null | undefined, units: Units): string {
  if (!known(value)) return "—";
  if (units === "in") return `${value.toFixed(2)}″`;
  let feet = Math.floor(value / 12), inches = value - feet * 12;
  // 11.999 rounds to 12.00: carry it into the feet.
  if (Math.round(inches * 100) >= 1200) { feet += 1; inches = 0; }
  return `${feet}′${inchPart(inches)}″`;
}

/** A signed difference in inches: +10¾ in feet-inches mode, +10.75 in inches mode. */
export function diffText(value: number | null | undefined, units: Units): string {
  if (!known(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const size = Math.abs(value);
  return `${sign}${units === "in" ? size.toFixed(2) : inchPart(size)}″`;
}

/** A percentile under a value: p99. */
export const percentileText = (value: number | null | undefined): string | null => known(value) ? `p${Math.round(value)}` : null;

/** Identity tone for a sign: gold above zero, blue below, none at zero or unknown. */
export const signIdentity = (value: number | null | undefined): "a" | "b" | undefined => !known(value) || value === 0 ? undefined : value > 0 ? "a" : "b";
