// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { RESEARCH_FACTS, formatFact, type FactStep, type ResearchFact } from "./research-facts";

const ROOT = path.resolve(__dirname, "../..");
const cache = new Map<string, unknown>();
const load = (file: string) => {
  if (!cache.has(file)) cache.set(file, JSON.parse(readFileSync(path.join(ROOT, file), "utf8")));
  return cache.get(file);
};

function resolve(source: unknown, steps: readonly FactStep[]): unknown {
  return steps.reduce<unknown>((node, step) => {
    if (typeof step === "string" || typeof step === "number") return (node as Record<string | number, unknown>)?.[step];
    const matches = (node as Record<string, unknown>[]).filter(item => Object.entries(step).every(([key, value]) => item[key] === value));
    expect(matches, JSON.stringify(step)).toHaveLength(1);
    return matches[0];
  }, source);
}

function sourceValue(fact: ResearchFact): number | string {
  const data = load(fact.file);
  if (fact.kind === "seasons") {
    const node = resolve(data, fact.path) as string[] | Record<string, unknown>;
    const seasons = Array.isArray(node) ? node : Object.keys(node).sort();
    return seasons.length === 2 ? seasons.join(" and ") : `${seasons[0]} to ${seasons[seasons.length - 1]}`;
  }
  if (fact.kind === "reduction") return Math.round(100 * (1 - (resolve(data, fact.after) as number) / (resolve(data, fact.before) as number)));
  const raw = (resolve(data, fact.path) as number) * (fact.scale ?? 1);
  return Number(raw.toFixed(fact.digits));
}

describe("research facts", () => {
  it.each(Object.entries(RESEARCH_FACTS))("%s equals its committed source", (_id, fact) => {
    expect(sourceValue(fact)).toBe(fact.value);
  });

  it("formats signs, separators and percentages", () => {
    expect(formatFact(RESEARCH_FACTS["bt.gain"])).toBe("+0.80");
    expect(formatFact(RESEARCH_FACTS["bt.games"])).toBe("11,979");
    expect(formatFact(RESEARCH_FACTS["zts.predictiveGain"])).toBe("−0.134");
    expect(formatFact(RESEARCH_FACTS["lm.ridgeEdge"])).toBe("0.000011");
    expect(formatFact(RESEARCH_FACTS["sn.threeShrinkCut"])).toBe("53%");
  });
});

// R12: the README's Results section quotes the same numbers; it must not drift either.
describe("README results", () => {
  const readme = readFileSync(path.join(ROOT, "README.md"), "utf8").replace(/\s+/g, " ");
  it.each([
    "wp.logLoss", "wp.baselineLogLoss", "wp.calibration", "wp.games", "wp.seasons",
    "bt.games", "bt.seasons", "bt.gain", "bt.gainLow", "bt.gainHigh",
    "pi.gain", "pi.gainLow", "pi.gainHigh", "pi.seasons",
    "sq.brier", "sq.brierLow", "sq.brierHigh", "sq.seasons",
  ] as const)("quotes %s as checked", id => {
    expect(readme).toContain(formatFact(RESEARCH_FACTS[id]));
  });
  it("gives R16 no number while its evaluation is in progress", () => {
    expect(readme).toContain("**Ask evaluation (R16):** evaluation in progress; no number yet.");
  });
});
