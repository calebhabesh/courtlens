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
      { code: "MVP-2", label: "MVP 2nd", description: "2nd in Most Valuable Player voting", win: false },
      { code: "DPOY-1", label: "DPOY Winner", description: "Defensive Player of the Year winner", win: true },
      { code: "NBA1", label: "All-NBA 1st", description: "All-NBA First Team", win: false },
    ]);
    expect(seasonAwardChips(undefined)).toEqual([]);
  });
  it("distinguishes team selections, voting places and winners without losing unknown codes", () => {
    expect(seasonAwardChips(["NBA2", "NBA3", "DEF1", "DEF2", "CPOY-10", "MVP-11", "MVP-12", "MVP-13", "MVP-21", "ROY-1", "6MOY-3", "NEW"]).map(({ label }) => label)).toEqual([
      "All-NBA 2nd", "All-NBA 3rd", "All-Def 1st", "All-Def 2nd", "Clutch 10th", "MVP 11th", "MVP 12th", "MVP 13th", "MVP 21st", "Rookie Winner", "6th Man 3rd", "NEW",
    ]);
    expect(seasonAwardChips(["DEF2"])[0].description).toBe("All-Defensive Second Team");
    expect(seasonAwardChips(["NEW-1"])[0]).toEqual({ code: "NEW-1", label: "NEW-1", description: "NEW-1", win: false });
  });
});

describe("career honours", () => {
  it("tidies the source's wording and puts titles and major awards first", () => {
    expect(honours(["7x All Star", "2014-15 STL Champ", "2x NBA Champ", "2x Finals MVP", "2x Def. POY", "2019-20 AS MVP"])).toEqual([
      { label: "2× NBA Champ", top: true }, { label: "2× Finals MVP", top: true }, { label: "2× DPOY", top: true },
      { label: "7× All-Star", top: false }, { label: "2014-15 STL Champ", top: false }, { label: "2019-20 AS MVP", top: false },
    ]);
    expect(honours(["2015-16 MVP"])[0].top).toBe(true);
  });
});
