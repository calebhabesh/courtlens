import { describe, expect, it } from "vitest";
import { accoladeGroups, announcedBefore, completedSeasons } from "./compare-accolades";
import type { PlayerBio } from "./types";

const bio = (awards: Record<string, string[]>) => ({ reference: { awards } }) as unknown as PlayerBio;
const lebron = bio({ "2015-16": ["MVP-3", "AS", "NBA1"], "2016-17": ["MVP-4", "DPOY-5", "AS", "NBA1"], "2017-18": ["MVP-2", "AS", "NBA1"] });
const durant = bio({ "2015-16": ["MVP-5", "AS", "NBA2"], "2016-17": ["MVP-7", "AS", "NBA2"], "2017-18": ["AS", "NBA2"] });
const titles = (seasons: string[], complete = true) => ({ seasons, coverage_from: "2000-01", complete });

describe("comparison accolades", () => {
  it("dates honours to when they were announced", () => {
    expect(announcedBefore("2016-17", "AS", "2017-03-01")).toBe(true);
    expect(announcedBefore("2016-17", "NBA1", "2017-04-13")).toBe(false);
    expect(announcedBefore("2016-17", "NBA1", "2017-06-20")).toBe(true);
  });

  it("counts career honours through the cutoff and marks the leader", () => {
    const groups = accoladeGroups([durant, lebron], [titles(["2016-17"]), titles(["2015-16"])], "2016-17", "2017-06-20");
    const row = (key: string) => groups.career.find(entry => entry.key === key);
    expect(row("all_star")?.shown).toEqual(["2", "2"]);
    expect(row("all_star")?.leader).toBeNull();
    expect(row("all_nba")).toMatchObject({ a: 2, b: 2 });
    expect(row("titles")?.shown).toEqual(["1", "1"]);
    expect(row("mvp")).toBeUndefined();
  });

  it("holds back the compared season's awards until they were announced", () => {
    const groups = accoladeGroups([durant, lebron], [null, null], "2016-17", "2017-04-13");
    expect(groups.season[0].badges?.map(entry => entry.label)).toEqual(["All-Star"]);
    expect(groups.career.find(entry => entry.key === "all_nba")).toMatchObject({ a: 1, b: 1 });
  });

  it("shows season badges with full labels and retains voting finishes", () => {
    const groups = accoladeGroups([durant, lebron], [null, null], "2016-17", "2017-06-20");
    expect(groups.season[0].badges?.map(entry => entry.label)).toEqual(["All-NBA 2nd", "All-Star", "MVP 7th"]);
    expect(groups.season[1].badges?.map(entry => entry.label)).toEqual(["All-NBA 1st", "All-Star", "MVP 4th", "DPOY 5th"]);
  });

  it("keeps unknown sources unknown instead of zero", () => {
    const groups = accoladeGroups([null, lebron], [titles([], false), titles([])], "2016-17", "2017-06-20");
    expect(groups.career.find(entry => entry.key === "titles")?.shown).toEqual(["—", "0"]);
    expect(groups.career.find(entry => entry.key === "mvp")).toMatchObject({ shown: ["—", "0"], leader: null });
  });

  it("reads each player's honours from their own season and cutoff when seasons differ", () => {
    const groups = accoladeGroups([durant, lebron], [null, null], ["2015-16", "2017-18"], ["2016-06-20", "2018-04-12"]);
    expect(groups.season[0].season).toBe("2015-16");
    expect(groups.season[0].badges?.map(entry => entry.label)).toEqual(["All-NBA 2nd", "All-Star", "MVP 5th"]);
    expect(groups.season[1]).toMatchObject({ season: "2017-18", badges: [{ label: "All-Star" }] });
    expect(groups.career.find(entry => entry.key === "all_star")).toMatchObject({ a: 1, b: 3 });
  });
  it("includes the source's other awards and admitted championships, prioritizing wins", () => {
    const groups = accoladeGroups([bio({ "2024-25": ["MVP-1", "DPOY-1", "MIP-1", "ROY-1", "6MOY-1", "CPOY-1", "NBA1", "DEF2", "AS"] }), null], [titles(["2024-25"]), null], "2024-25", "2025-07-01");
    expect(groups.season[0].badges?.map(entry => entry.label)).toEqual(["NBA Champ", "MVP Winner", "DPOY Winner", "MIP Winner", "Rookie Winner", "6th Man Winner", "Clutch Winner", "All-NBA 1st", "All-Def 2nd", "All-Star"]);
    expect(groups.season[1].badges).toBeNull();
  });

  it("distinguishes unknown from no recorded honors and respects the strict award boundary", () => {
    expect(accoladeGroups([null, bio({})], [null, null], "2024-25", "2025-07-01").season.map(entry => entry.badges)).toEqual([null, []]);
    const winner = bio({ "2024-25": ["MVP-1", "AS"] });
    expect(accoladeGroups([winner, null], [null, null], "2024-25", "2025-06-01").season[0].badges?.map(entry => entry.code)).toEqual(["AS"]);
    expect(announcedBefore("2024-25", "AS", "2025-02-15")).toBe(false);
  });

});

describe("completed seasons (alignment row 3, 75)", () => {
  const scopes = [
    { season: "2025-26", phase: "regular_season", default_before_date: "2026-04-13" },
    { season: "2025-26", phase: "playoffs", default_before_date: "2026-06-14" },
    // A season still in progress has no play-in or playoffs yet: never complete.
    { season: "2026-27", phase: "regular_season", default_before_date: "2026-11-01" }
  ];
  it("knows a regular season is over only once its postseason exists", () => {
    expect(completedSeasons(scopes)).toEqual({ "2025-26": "2026-04-13" });
  });
  it("counts a finished season's awards at its end-of-season cutoff, never mid-season", () => {
    const ends = completedSeasons(scopes);
    expect(announcedBefore("2025-26", "MVP-1", "2026-04-13")).toBe(false);
    expect(announcedBefore("2025-26", "MVP-1", "2026-04-13", ends)).toBe(true);
    expect(announcedBefore("2025-26", "MVP-1", "2026-03-01", ends)).toBe(false);
    expect(announcedBefore("2026-27", "MVP-1", "2026-11-01", ends)).toBe(false);
    const shai = bio({ "2024-25": ["MVP-1", "AS"], "2025-26": ["MVP-1", "AS", "NBA1"] });
    const groups = accoladeGroups([shai, null], [null, null], "2025-26", "2026-04-13", ends);
    expect(groups.career.find(row => row.key === "mvp")?.a).toBe(2);
    expect(groups.season[0].badges?.map(entry => entry.code)).toContain("MVP-1");
  });
});
