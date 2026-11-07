/**
 * RD01 length formats after Databallr's Wingspan page. The combine measures to the quarter inch, so
 * feet-inches use ¼ ½ ¾ where a value lands on a quarter and two decimals otherwise (averages).
 * Unknown is always "—", never zero. The exact served number stays on each cell's `data-value`.
 */
export type Units = "ftin" | "in" | "m" | "cm";
export const UNIT_LABELS: Record<Units, string> = { ftin: "Ft-In", in: "Inches", m: "m", cm: "cm" };
const CM_PER_INCH = 2.54;

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

/** A length: 7′3¾″ in feet-inches, 87.75″ in inches, 2.23 m, 222.9 cm. */
export function lengthText(value: number | null | undefined, units: Units): string {
  if (!known(value)) return "—";
  if (units === "in") return `${value.toFixed(2)}″`;
  if (units === "m") return `${(value * CM_PER_INCH / 100).toFixed(2)} m`;
  if (units === "cm") return `${(value * CM_PER_INCH).toFixed(1)} cm`;
  let feet = Math.floor(value / 12), inches = value - feet * 12;
  // 11.999 rounds to 12.00: carry it into the feet.
  if (Math.round(inches * 100) >= 1200) { feet += 1; inches = 0; }
  return `${feet}′${inchPart(inches)}″`;
}

/** A signed difference: +10¾″ (feet-inches), +10.75″ (inches), +27.3 cm in both metric modes. */
export function diffText(value: number | null | undefined, units: Units): string {
  if (!known(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const size = Math.abs(value);
  if (units === "m" || units === "cm") return `${sign}${(size * CM_PER_INCH).toFixed(1)} cm`;
  return `${sign}${units === "in" ? size.toFixed(2) : inchPart(size)}″`;
}

/** Axis ticks in inches and their labels: every foot, 24″, 0.5 m or 50 cm from zero to the top. */
export function lengthTicks(top: number, units: Units): { value: number; label: string }[] {
  const step = units === "ftin" ? 12 : units === "in" ? 24 : 50 / CM_PER_INCH;
  const ticks: { value: number; label: string }[] = [];
  for (let i = 0; i * step <= top + 1e-9; i++) {
    const v = i * step;
    ticks.push({ value: v, label: units === "ftin" ? `${i}′` : units === "in" ? `${Math.round(v)}″` : units === "m" ? `${(i * 0.5).toFixed(1)} m` : `${i * 50} cm` });
  }
  return ticks;
}

/** A percentile under a value: p99. */
export const percentileText = (value: number | null | undefined): string | null => known(value) ? `p${Math.round(value)}` : null;

/** Identity tone for a sign: gold above zero, blue below, none at zero or unknown. */
export const signIdentity = (value: number | null | undefined): "a" | "b" | undefined => !known(value) || value === 0 ? undefined : value > 0 ? "a" : "b";
