import { describe, expect, it } from "vitest";
import { gainText, gainTone, signed, verdictSentences, VERDICT_TEXT, type LineupModelPage } from "./lineup-model";

const gain = (g: number, low: number, high: number) => ({ gain: g, low, high });

function page(verdict: LineupModelPage["results"]["verdict"]): LineupModelPage {
  return {
    results: {
      verdict, test_seasons: ["2023-24", "2024-25", "2025-26"], seasons_lineup_lower: 1,
      gains: {
        lineup_over_ridge: { seasons: {}, pooled: gain(-0.012, -0.05, 0.02) },
        lineup_over_home_only: { seasons: {}, pooled: gain(0.3, 0.2, 0.4) },
        ridge_over_home_only: { seasons: {}, pooled: gain(0.31, 0.21, 0.41) },
      },
    },
  } as unknown as LineupModelPage;
}

describe("lineup model page helpers", () => {
  it("colours a gain only when its whole interval is on one side of zero", () => {
    expect(gainTone(gain(0.1, 0.01, 0.2))).toBe("positive");
    expect(gainTone(gain(-0.1, -0.2, -0.01))).toBe("negative");
    expect(gainTone(gain(0.1, -0.01, 0.2))).toBeUndefined();
  });

  it("states the served verdict and gains, never its own", () => {
    const text = verdictSentences(page("no_difference"));
    expect(text[0]).toBe(`${VERDICT_TEXT.no_difference} (registered rule).`);
    expect(text[1]).toContain(gainText(gain(-0.012, -0.05, 0.02)));
    expect(text[1]).toContain("1 of 3 seasons");
    expect(verdictSentences(page("ridge_better"))[0]).toContain("Ridge predicts held-out stints better");
  });

  it("signs numbers with a true minus", () => {
    expect(signed(-1.234)).toBe("−1.23");
    expect(signed(0)).toBe("+0.00");
  });
});

describe("tiny gains stay legible", () => {
  it("shows two significant figures of values far below the default decimals", async () => {
    const { digitsFor } = await import("./lineup-model");
    expect(digitsFor([-0.000011, -0.000014, -0.0000079])).toBe(6);
    expect(gainText(gain(-0.000011, -0.000014, -0.0000079))).toBe("−0.000011 (−0.000014 to −0.000008)");
    expect(gainText(gain(0.19, 0.12, 0.25))).toBe("+0.19 (+0.12 to +0.25)");
  });
});
