import { describe, expect, it } from "vitest";
import { availableRelated, currentTricode, gameRelated, playerRelated, seriesRelated, teamRelated } from "./related-links";
import type { WorkbenchCatalog } from "./types";

const THUNDER = "1610612760";
const LAKERS = "1610612747";
const cap = (seasons: string[], phases: string[]) => ({ status: "available", seasons, phases, limitations: [] });
const catalog = {
  default_season: "2024-25", default_phase: "regular_season",
  capabilities: { core_stats: cap(["2024-25"], ["regular_season", "playoffs"]), matchups: cap(["2024-25"], ["regular_season"]) },
} as unknown as WorkbenchCatalog;
const keys = (links: { key: string }[]) => links.map(link => link.key);

describe("playerRelated", () => {
  const links = playerRelated({ playerId: "2544", season: "2024-25", phase: "regular_season", beforeDate: "2025-04-14",
    seasonTeams: ["LAL"], draftYear: 2003, currentTeam: "LAL" });
  it("lists his team that season, the tools, his draft class and his team's contracts, in the plan's order", () => {
    expect(keys(links)).toEqual(["team-LAL", "compare", "similar", "last-games", "matchups", "draft", "contracts"]);
    expect(links[0]).toMatchObject({ label: "Los Angeles Lakers", href: `/teams/${LAKERS}?season=2024-25` });
    expect(links.find(link => link.key === "compare")?.href).toBe("/compare?playerA=2544&season=2024-25&phase=regular_season&beforeDate=2025-04-14");
    expect(links.find(link => link.key === "draft")).toMatchObject({ label: "2003 Draft Class", href: "/draft?year=2003&tab=classes" });
    expect(links.find(link => link.key === "contracts")).toMatchObject({ label: "LAL Contracts", href: "/contracts?team=LAL" });
  });
  it("names each team of a traded season and leaves out what the data does not have", () => {
    const traded = playerRelated({ playerId: "1", season: "2005-06", phase: "playoffs", seasonTeams: ["SEA", "BOS"] });
    expect(keys(traded)).toEqual(["team-SEA", "team-BOS", "compare", "similar", "last-games", "matchups"]);
    expect(traded[0]).toMatchObject({ label: "Seattle SuperSonics", href: `/teams/${THUNDER}?season=2005-06&phase=playoffs` });
  });
});

describe("teamRelated", () => {
  it("lists Standings, the schedule section, Roster Shapes, Contracts, Team Compare and the season's bracket", () => {
    const links = teamRelated({ teamId: THUNDER, season: "2005-06", phase: "regular_season", playoffSeasons: ["2005-06"] });
    expect(keys(links)).toEqual(["standings", "schedule", "roster-shapes", "contracts", "team-compare", "playoffs"]);
    expect(links.map(link => link.href)).toEqual([
      "/standings?season=2005-06", "#schedule", "/roster-shapes?team=OKC&season=2005-06", "/contracts?team=OKC",
      `/team-compare?teamA=${THUNDER}&season=2005-06&phase=regular_season`, "/playoffs?season=2005-06",
    ]);
  });
  it("has no bracket without playoffs that season, and no Contracts or Roster Shapes for a folded team", () => {
    const folded = teamRelated({ teamId: "CHS", season: "1947-48", phase: "regular_season", playoffSeasons: [] });
    expect(keys(folded)).toEqual(["standings", "schedule", "team-compare"]);
    expect(currentTricode("CHS")).toBeNull();
  });
});

describe("gameRelated", () => {
  it("links both teams and each team's schedule section; a team without an id is left out", () => {
    const links = gameRelated({ season: "2026-27", teams: [{ id: "IND", name: "Indiana Pacers" }, { id: null, name: "Unknown" }, { id: "1610612752", name: "New York Knicks" }] });
    expect(links.map(link => [link.label, link.href])).toEqual([
      ["Indiana Pacers", "/teams/1610612754?season=2026-27"],
      ["New York Knicks", "/teams/1610612752?season=2026-27"],
      ["IND Schedule", "/teams/1610612754?season=2026-27#schedule"],
      ["NYK Schedule", "/teams/1610612752?season=2026-27#schedule"],
    ]);
  });
});

describe("seriesRelated", () => {
  const game = (n: number, status = "final") => ({ game_id: `004240040${n}`, game_number: n, game_date: status === "final" ? `2025-06-0${n}` : null,
    home_team_id: THUNDER, home_team_tricode: "OKC", away_team_id: "1610612754", away_team_tricode: "IND", status });
  it("links both teams in the playoffs, the bracket at the series' cutoff (D12) and each played game in order", () => {
    const links = seriesRelated({ season: "2024-25", teams: [{ id: THUNDER, name: "Oklahoma City Thunder" }, { id: "1610612754", name: "Indiana Pacers" }],
      games: [game(2), game(1), game(3, "unplayed_placeholder")], beforeDate: "2025-06-23", releaseId: "r1" });
    expect(keys(links)).toEqual([`team-${THUNDER}`, "team-1610612754", "bracket", "game-0042400401", "game-0042400402"]);
    expect(links[0].href).toBe(`/teams/${THUNDER}?season=2024-25&phase=playoffs`);
    expect(links[2].href).toBe("/playoffs?season=2024-25&beforeDate=2025-06-23&releaseId=r1");
    expect(links[3]).toMatchObject({ label: "Game 1", href: `/live/open?date=2025-06-01&game=0042400401&teams=1610612754%3AIND%2C${THUNDER}%3AOKC` });
  });
});

describe("availableRelated", () => {
  const links = playerRelated({ playerId: "2544", season: "2024-25", phase: "playoffs", seasonTeams: ["LAL"], draftYear: 2003 });
  it("leaves out a destination the release cannot serve in that scope, never shows it disabled", () => {
    // Matchups covers the regular season only.
    expect(keys(availableRelated(links, catalog))).toEqual(["team-LAL", "compare", "similar", "last-games", "draft"]);
  });
  it("shows only routes without a release-bound source until the catalog is known", () => {
    expect(keys(availableRelated(links, null))).toEqual(["team-LAL", "draft"]);
  });
});
