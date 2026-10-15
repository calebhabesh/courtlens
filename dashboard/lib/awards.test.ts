import { describe, expect, it } from "vitest";
import { honours, isAwardWin, seasonAwardChips } from "./awards";

describe("season award codes", () => {
  it("highlights won major awards, not vote finishes or team selections", () => {
    expect(isAwardWin("DPOY-1")).toBe(true);
    expect(isAwardWin("MVP-2")).toBe(false);
    expect(isAwardWin("NBA1")).toBe(false);
  });
  it("leaves All-Star to the star beside the year", () => {
    expect(seasonAwardChips(["MVP-2", "DPOY-1", "AS", "NBA1"])).toEqual([
      { code: "MVP-2", win: false }, { code: "DPOY-1", win: true }, { code: "NBA1", win: false },
    ]);
    expect(seasonAwardChips(undefined)).toEqual([]);
  });
});

describe("career honours", () => {
  it("tidies the source's wording and puts titles and major awards first", () => {
    expect(honours(["7x All Star", "2014-15 STL Champ", "2x NBA Champ", "2x Finals MVP", "2x Def. POY", "2019-20 AS MVP"])).toEqual([
      { label: "2× NBA Champ", top: true }, { label: "2× Finals MVP", top: true }, { label: "2× Def. POY", top: true },
      { label: "7× All-Star", top: false }, { label: "2014-15 STL Champ", top: false }, { label: "2019-20 AS MVP", top: false },
    ]);
    expect(honours(["2015-16 MVP"])[0].top).toBe(true);
  });
});
