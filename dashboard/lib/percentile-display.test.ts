import { describe, expect, it } from "vitest";
import { bestFirst, favorablePercentile, orientedPercentile, rankInSortedPage } from "./percentile-display";
import { phaseLabel, scopeContextLine } from "./scope-labels";

describe("percentile presentation (no new formula)", () => {
  it("orients low-is-good metrics and keeps unoriented ones", () => {
    expect(orientedPercentile(90, "high")).toBe(90);
    expect(orientedPercentile(90, "low")).toBe(10);
    expect(orientedPercentile(90, null)).toBe(90);
    expect(orientedPercentile(null, "high")).toBeNull();
  });

  it("keeps Stats' favorable rule: none without a declared direction", () => {
    expect(favorablePercentile(70, "high")).toBe(70);
    expect(favorablePercentile(70, "low")).toBe(30);
    expect(favorablePercentile(70, null)).toBeNull();
  });

  it("reads ranks from a best-first page; ties share a rank", () => {
    const page = [
      { playerId: "a", value: 30 }, { playerId: "b", value: 28 }, { playerId: "c", value: 28 },
      { playerId: "d", value: 25 }, { playerId: "e", value: null }
    ];
    expect(bestFirst("high")).toBe("desc");
    expect(rankInSortedPage(page, "a", "high")).toBe(1);
    expect(rankInSortedPage(page, "c", "high")).toBe(2);
    expect(rankInSortedPage(page, "d", "high")).toBe(4);
    expect(rankInSortedPage(page, "e", "high")).toBeNull();
    expect(rankInSortedPage(page, "missing", "high")).toBeNull();
    const turnovers = [{ playerId: "x", value: 0.5 }, { playerId: "y", value: 0.5 }, { playerId: "z", value: 1.2 }];
    expect(bestFirst("low")).toBe("asc");
    expect(rankInSortedPage(turnovers, "z", "low")).toBe(3);
  });
});

describe("scope context line (D16, D20)", () => {
  it("names the last included day, never the exclusive cutoff", () => {
    expect(scopeContextLine("2025-26", "regular_season", "2026-04-13")).toBe("2025-26 Regular Season · Through Apr 12, 2026");
    expect(scopeContextLine("2025-26", "playoffs")).toBe("2025-26 Playoffs");
    expect(phaseLabel("summer_league")).toBe("summer league");
  });
});
