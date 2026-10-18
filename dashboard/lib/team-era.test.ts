import { describe, expect, it } from "vitest";
import catalog from "./team-branding.json";
import { franchiseActive, franchiseOf, seasonTeamId, teamArtwork, teamEra } from "./team-era";

const THUNDER = "1610612760", CHARLOTTE = "1610612766", PELICANS = "1610612740";

describe("team eras", () => {
  it("swaps a franchise for the team it was in an earlier season", () => {
    expect(seasonTeamId(THUNDER, "2000-01")).toBe("SEA");
    expect(seasonTeamId(THUNDER, "2008-09")).toBe(THUNDER);
    expect(seasonTeamId(PELICANS, "2005-06")).toBe("NOK");
    expect(seasonTeamId(CHARLOTTE, "2001-02")).toBe("CHH");
    expect(seasonTeamId(CHARLOTTE, "2006-07")).toBe(CHARLOTTE);
    expect(teamEra(CHARLOTTE, "2006-07")?.artwork_name).toBe("Charlotte Bobcats");
    expect(teamEra(THUNDER, "2005-06")?.artwork_name).toBe("Seattle SuperSonics");
  });

  it("keeps current ids and codes meaning the current team without a season", () => {
    expect(teamEra(THUNDER)).toBeNull();
    expect(teamEra("CHA")).toBeNull();
    expect(teamEra("SEA")?.franchise_id).toBe(THUNDER);
    expect(teamEra("SEA", "2015-16")).toBeNull();
  });

  it("maps codes back to franchises and knows seasons without a team", () => {
    expect(franchiseOf("SEA")).toBe(THUNDER);
    expect(franchiseOf("OKC")).toBe(THUNDER);
    expect(franchiseOf("NJN")).toBe("1610612751");
    expect(franchiseOf("XYZ")).toBeNull();
    expect(franchiseActive(PELICANS, "2001-02")).toBe(false);
    expect(franchiseActive(CHARLOTTE, "2003-04")).toBe(false);
    expect(franchiseActive(CHARLOTTE, "2004-05")).toBe(true);
  });
});

describe("team artwork by season", () => {
  const current = (id: string) => catalog.teams.find(team => team.team_id === id)!.asset;

  it("names and draws a franchise as it was that season", () => {
    const sonics = teamArtwork("OKC", "2007-08")!;
    expect([sonics.tricode, sonics.artwork_name]).toEqual(["SEA", "Seattle SuperSonics"]);
    expect(teamArtwork(THUNDER, "2007-08")).toEqual(sonics);
    expect(teamArtwork("SEA", "2007-08")).toEqual(sonics);
    expect(teamArtwork("CHA", "2006-07")?.artwork_name).toBe("Charlotte Bobcats");
    expect(teamArtwork("CHA", "2001-02")?.artwork_name).toBe("Charlotte Hornets");
  });

  it("uses an older logo for seasons before a redesign and the current one after", () => {
    expect(teamArtwork("TOR", "2000-01")!.asset).not.toBe(current("1610612761"));
    expect(teamArtwork("TOR", "2025-26")!.asset).toBe(current("1610612761"));
    expect(teamArtwork("TOR")!.asset).toBe(current("1610612761"));
  });

  it("covers every active franchise-season with one span and no overlaps", () => {
    for (const team of catalog.teams) for (let start = 2000; start <= 2025; start++) {
      const season = `${start}-${String(start + 1).slice(-2)}`;
      const spans = (catalog as { season_logos?: { franchise_id: string; first_season: string; last_season: string }[] }).season_logos!.filter(span => span.franchise_id === team.team_id
        && Number(span.first_season.slice(0, 4)) <= start && start <= Number(span.last_season.slice(0, 4)));
      expect(spans.length).toBe(franchiseActive(team.team_id, season) ? 1 : 0);
    }
  });
});
