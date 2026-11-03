import { describe, expect, it } from "vitest";
import { currentSeason, gamesBehind, seedLines, sortValue, standingsSeasons, standingsTables, type StandingsDivision } from "./standings";

const row = (id: string, w: number, l: number, seed?: number, extra: Record<string, string> = {}) => ({ team_source_id: id, name: id, wins: String(w), losses: String(l), seed: seed != null ? String(seed) : null, ...extra });
const divisions: StandingsDivision[] = [
  { division: "Atlantic", conference: "Eastern Conference", entries: [row("BOS", 3, 1, 2), row("BKN", 0, 4, 15)] },
  { division: "Central", conference: "Eastern Conference", entries: [row("DET", 4, 1, 1)] },
  { division: "Northwest", conference: "Western Conference", entries: [row("POR", 3, 0, 1)] },
];

describe("standings", () => {
  it("groups the league, conferences and divisions in ESPN's order", () => {
    expect(standingsTables(divisions, "league")[0].rows.map(r => r.team_source_id)).toEqual(["POR", "DET", "BOS", "BKN"]);
    const east = standingsTables(divisions, "conference")[0];
    expect(east.title).toBe("Eastern Conference");
    expect(east.rows.map(r => r.team_source_id)).toEqual(["DET", "BOS", "BKN"]);
    expect(standingsTables(divisions, "division").map(t => t.title)).toEqual(["Atlantic", "Central", "Northwest"]);
  });
  it("computes games behind the group's leader", () => {
    const east = standingsTables(divisions, "conference")[0].rows;
    expect(east.map(r => gamesBehind(r, east))).toEqual(["-", "0.5", "3.5"]);
  });
  it("draws the play-in lines from 2020-21, eight playoff teams before", () => {
    expect(seedLines("2026-27")).toEqual([6, 10]);
    expect(seedLines("2018-19")).toEqual([8]);
  });
  it("sorts streaks and differentials as numbers", () => {
    const r = row("X", 1, 1, 1, { streak: "L3", diff: "+4.5" });
    expect(sortValue(r, "strk", [r])).toBe(-3);
    expect(sortValue(r, "diff", [r])).toBe(4.5);
  });
  it("lists seasons back to 1984-85 and knows the current one", () => {
    const seasons = standingsSeasons("2026-27");
    expect(seasons[0]).toBe("2026-27");
    expect(seasons.at(-1)).toBe("1984-85");
    expect(currentSeason(new Date("2026-10-29T12:00:00Z"))).toBe("2026-27");
    expect(currentSeason(new Date("2026-05-01T12:00:00Z"))).toBe("2025-26");
  });
});
