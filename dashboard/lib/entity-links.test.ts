import { describe, expect, it } from "vitest";
import { gameHref, isSelfLink, playerHref, seriesHref, teamHref, teamLinkId } from "./entity-links";

const THUNDER = "1610612760";
const PELICANS = "1610612740";

describe("playerHref", () => {
  it("carries the season, and the phase only for the playoffs (D5)", () => {
    expect(playerHref("2544", { season: "2012-13" })).toBe("/players/2544?season=2012-13");
    expect(playerHref("2544", { season: "2012-13", phase: "playoffs" })).toBe("/players/2544?season=2012-13&phase=playoffs");
    expect(playerHref("2544", { season: "2012-13", phase: "regular_season" })).toBe("/players/2544?season=2012-13");
    expect(playerHref(2544)).toBe("/players/2544");
  });
  it("keeps beforeDate, releaseId and tab only when given", () => {
    expect(playerHref("1", { season: "2024-25", beforeDate: "2025-01-15", releaseId: "rel-1", tab: "tracking" }))
      .toBe("/players/1?season=2024-25&beforeDate=2025-01-15&releaseId=rel-1&tab=tracking");
    expect(playerHref("1", { season: null, beforeDate: "" })).toBe("/players/1");
  });
  it("is null without an id", () => {
    expect(playerHref(null)).toBeNull();
    expect(playerHref(undefined, { season: "2024-25" })).toBeNull();
    expect(playerHref("  ")).toBeNull();
  });
  it("encodes the id", () => {
    expect(playerHref("a/b")).toBe("/players/a%2Fb");
  });
  it("ends with a section of the page when asked (SL05)", () => {
    expect(playerHref("2544", { season: "2024-25", section: "games" })).toBe("/players/2544?season=2024-25#games");
  });
});

describe("teamHref (D6: franchise id plus season)", () => {
  it("names the franchise for the Thunder in 2005-06, whichever id the row holds", () => {
    expect(teamHref(THUNDER, { season: "2005-06" })).toBe(`/teams/${THUNDER}?season=2005-06`);
    expect(teamHref("SEA", { season: "2005-06" })).toBe(`/teams/${THUNDER}?season=2005-06`);
    expect(teamHref("OKC", { season: "2005-06" })).toBe(`/teams/${THUNDER}?season=2005-06`);
    expect(teamHref("SEA")).toBe(`/teams/${THUNDER}`);
  });
  it("turns current tricodes and era codes into the franchise id", () => {
    expect(teamLinkId("NOK", "2005-06")).toBe(PELICANS);
    expect(teamLinkId("NOP")).toBe(PELICANS);
    expect(teamLinkId("VAN", "1999-00")).toBe("1610612763");
    expect(teamLinkId("SFW")).toBe("1610612744");
  });
  it("keeps a folded team's code as its id", () => {
    expect(teamHref("CHS", { season: "1947-48" })).toBe("/teams/CHS?season=1947-48");
    expect(teamHref("chs")).toBe("/teams/CHS");
    expect(teamLinkId("BLB", "1950-51")).toBe("BLB");
  });
  it("passes an unknown id through and is null without one", () => {
    expect(teamHref("XYZ", { season: "2024-25" })).toBe("/teams/XYZ?season=2024-25");
    expect(teamHref(null)).toBeNull();
    expect(teamHref("")).toBeNull();
  });
  it("leaves a season the franchise did not play for the team page to resolve (SL02)", () => {
    expect(teamHref(PELICANS, { season: "1999-00" })).toBe(`/teams/${PELICANS}?season=1999-00`);
  });
});

describe("gameHref (two id spaces)", () => {
  it("opens a Live game by ESPN's id", () => {
    expect(gameHref({ espnId: "401705000", date: "2025-01-15" })).toBe("/live/games/401705000?date=2025-01-15");
    expect(gameHref({ espnId: 401705000, date: "2025-01-15T00:00:00Z" }, { tab: "box" })).toBe("/live/games/401705000?date=2025-01-15&tab=box");
    expect(gameHref({ espnId: "401705000" })).toBe("/live/games/401705000");
  });
  it("opens a warehouse game through /live/open with its date and both teams", () => {
    const href = gameHref({ gameId: "0022400500", date: "2025-01-15T00:00:00", teams: [{ id: THUNDER, tricode: "OKC" }, { id: null, tricode: "LAL" }] });
    expect(href).toBe("/live/open?date=2025-01-15&game=0022400500&teams=1610612760%3AOKC%2C%3ALAL");
    expect(new URL(href!, "http://x").searchParams.get("teams")).toBe("1610612760:OKC,:LAL");
  });
  it("is null without an id or a warehouse date", () => {
    expect(gameHref(null)).toBeNull();
    expect(gameHref({ espnId: null, date: "2025-01-15" })).toBeNull();
    expect(gameHref({ gameId: "1", date: null, teams: [{}, {}] })).toBeNull();
  });
});

describe("seriesHref", () => {
  it("opens the series slug; the slug names the season, so no season is added", () => {
    expect(seriesHref("2024-25-west-r1-okc-mem")).toBe("/playoffs/2024-25-west-r1-okc-mem");
    expect(seriesHref("s", { beforeDate: "2025-05-01", releaseId: "r" })).toBe("/playoffs/s?beforeDate=2025-05-01&releaseId=r");
    expect(seriesHref(null)).toBeNull();
  });
});

describe("isSelfLink", () => {
  it("matches the entity page the link sits on, whatever the query", () => {
    expect(isSelfLink("/players/2544?season=2012-13", "/players/2544")).toBe(true);
    expect(isSelfLink(`/teams/${THUNDER}?season=2005-06`, `/teams/${THUNDER}/`)).toBe(true);
    expect(isSelfLink("/players/2544", "/players/201939")).toBe(false);
    expect(isSelfLink("/players/2544", null)).toBe(false);
  });
});

describe("scope helpers", () => {
  it("reads a page's season and phase and drops the rest (D5)", async () => {
    const { scopeFromQuery } = await import("./entity-links");
    expect(playerHref("1", scopeFromQuery("season=2024-25&phase=playoffs&beforeDate=2025-05-01&window=last10"))).toBe("/players/1?season=2024-25&phase=playoffs");
    expect(playerHref("1", scopeFromQuery(new URLSearchParams({ season: "2024-25", phase: "regular_season" })))).toBe("/players/1?season=2024-25");
    expect(playerHref("1", scopeFromQuery(""))).toBe("/players/1");
  });
  it("appends navigation markers last", () => {
    expect(playerHref("1", { season: "2024-25", params: { from: "stats", empty: null } })).toBe("/players/1?season=2024-25&from=stats");
  });
});
