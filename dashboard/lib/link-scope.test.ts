import { describe, expect, it } from "vitest";
import { applyScopeChange } from "./scope-url";
import { askedNote, closestSeason, resolvePlayerScope, resolveTeamScope, rewrittenUrl, teamSeasons } from "./link-scope";

const KOBE = ["1996-97", "2005-06", "2015-16"];
const RELEASE = ["1946-47", "1947-48", "1949-50", "1950-51", "1999-00", "2001-02", "2002-03", "2005-06", "2024-25", "2026-27"];

describe("closestSeason", () => {
  it("takes the season, else the latest before it, else the earliest", () => {
    expect(closestSeason("2005-06", KOBE)).toBe("2005-06");
    expect(closestSeason("2026-27", KOBE)).toBe("2015-16");
    expect(closestSeason("2010-11", KOBE)).toBe("2005-06");
    expect(closestSeason("1990-91", KOBE)).toBe("1996-97");
    expect(closestSeason("2024-25", [])).toBeNull();
  });
});

describe("resolvePlayerScope", () => {
  it("opens a retired player's last season for a 2026-27 link", () => {
    expect(resolvePlayerScope({ season: "2026-27", phase: "regular_season" }, { regular: KOBE })).toEqual({ season: "2015-16", phase: "regular_season" });
  });
  it("opens the regular season of playoffs he missed", () => {
    expect(resolvePlayerScope({ season: "2021-22", phase: "playoffs" }, { regular: ["2021-22", "2022-23"], playoffs: ["2022-23"] }))
      .toEqual({ season: "2021-22", phase: "regular_season" });
  });
  it("keeps a scope he has, and keeps the bio-only page for a player with no seasons", () => {
    expect(resolvePlayerScope({ season: "2005-06", phase: "regular_season" }, { regular: KOBE })).toBeNull();
    expect(resolvePlayerScope({ season: "2022-23", phase: "playoffs" }, { regular: null, playoffs: ["2022-23"] })).toBeNull();
    expect(resolvePlayerScope({ season: "2024-25", phase: "regular_season" }, { regular: [] })).toBeNull();
    expect(resolvePlayerScope({ season: "2024-25", phase: "playoffs" }, { regular: null, playoffs: [] })).toBeNull();
  });
});

describe("team seasons and resolveTeamScope", () => {
  it("opens New Orleans's first season for a pre-2002-03 link", () => {
    const pelicans = teamSeasons("1610612740", RELEASE);
    expect(pelicans[0]).toBe("2002-03");
    expect(resolveTeamScope({ season: "1999-00", phase: "regular_season" }, pelicans)).toEqual({ season: "2002-03", phase: "regular_season" });
  });
  it("keeps the Thunder franchise in 2005-06 (the page shows the Sonics)", () => {
    expect(resolveTeamScope({ season: "2005-06", phase: "regular_season" }, teamSeasons("1610612760", RELEASE))).toBeNull();
  });
  it("keeps a folded team inside its own seasons", () => {
    const stags = teamSeasons("CHS", RELEASE);
    expect(stags).toEqual(["1946-47", "1947-48", "1949-50"]);
    expect(resolveTeamScope({ season: "1947-48", phase: "regular_season" }, stags)).toBeNull();
    expect(resolveTeamScope({ season: "2024-25", phase: "regular_season" }, stags)).toEqual({ season: "1949-50", phase: "regular_season" });
  });
  it("opens the regular season of playoffs the team missed, or of a different season", () => {
    expect(resolveTeamScope({ season: "2024-25", phase: "playoffs" }, ["2024-25"], false)).toEqual({ season: "2024-25", phase: "regular_season" });
    expect(resolveTeamScope({ season: "2024-25", phase: "playoffs" }, ["2024-25"], true)).toBeNull();
    expect(resolveTeamScope({ season: "2024-25", phase: "playoffs" }, ["2024-25"])).toBeNull();
    expect(resolveTeamScope({ season: "1990-91", phase: "playoffs" }, ["2002-03"])).toEqual({ season: "2002-03", phase: "regular_season" });
  });
});

describe("the rewritten URL and its note", () => {
  it("names the shown scope, records what was asked and drops the old cutoff", () => {
    const url = rewrittenUrl("/players/977", { season: "2026-27", beforeDate: "2027-01-01", releaseId: "r1", tab: "career" }, { season: "2026-27", phase: "regular_season" }, { season: "2015-16", phase: "regular_season" });
    expect(url).toBe("/players/977?releaseId=r1&tab=career&season=2015-16&asked=2026-27");
    expect(rewrittenUrl("/players/2544", { season: "2021-22", phase: "playoffs" }, { season: "2021-22", phase: "playoffs" }, { season: "2021-22", phase: "regular_season" }))
      .toBe("/players/2544?season=2021-22&asked=2021-22%3Aplayoffs");
  });
  it("says once what was asked and what is shown", () => {
    expect(askedNote("2026-27", { season: "2015-16", phase: "regular_season" }, "Kobe Bryant"))
      .toBe("Kobe Bryant has no 2026-27 games; showing the 2015-16 regular season.");
    expect(askedNote("2021-22:playoffs", { season: "2021-22", phase: "regular_season" }, "LeBron James"))
      .toBe("LeBron James has no 2021-22 playoffs games; showing the 2021-22 regular season.");
    expect(askedNote("2015-16", { season: "2015-16", phase: "regular_season" }, "Kobe Bryant")).toBeNull();
    expect(askedNote(undefined, { season: "2015-16", phase: "regular_season" }, "x")).toBeNull();
    expect(askedNote("<script>", { season: "2015-16", phase: "regular_season" }, "x")).toBeNull();
  });
  it("is cleared by any scope change, so the note never outlives the scope it describes", () => {
    expect(applyScopeChange("season=2015-16&asked=2026-27", "window", "last10", { season: "2015-16", phase: "regular_season" }).has("asked")).toBe(false);
  });
});
