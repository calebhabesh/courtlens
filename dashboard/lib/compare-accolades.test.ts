import { describe, expect, it } from "vitest";
import { accoladeGroups, announcedBefore } from "./compare-accolades";
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
    expect(groups.seasonPending).toBe(true);
    expect(groups.season.map(entry => entry.key)).toEqual(["season_all_star"]);
    expect(groups.career.find(entry => entry.key === "all_nba")).toMatchObject({ a: 1, b: 1 });
  });

  it("shows the season's finishes with the better place leading", () => {
    const groups = accoladeGroups([durant, lebron], [null, null], "2016-17", "2017-06-20");
    expect(groups.season.find(entry => entry.key === "season_mvp")).toMatchObject({ shown: ["7th", "4th"], leader: "b" });
    expect(groups.season.find(entry => entry.key === "season_all_nba")).toMatchObject({ shown: ["2nd Team", "1st Team"], leader: "b" });
    expect(groups.season.find(entry => entry.key === "season_dpoy")).toMatchObject({ shown: ["—", "5th"], leader: "b" });
  });

  it("keeps unknown sources unknown instead of zero", () => {
    const groups = accoladeGroups([null, lebron], [titles([], false), titles([])], "2016-17", "2017-06-20");
    expect(groups.career.find(entry => entry.key === "titles")?.shown).toEqual(["—", "0"]);
    expect(groups.career.find(entry => entry.key === "mvp")).toMatchObject({ shown: ["—", "0"], leader: null });
  });
});
