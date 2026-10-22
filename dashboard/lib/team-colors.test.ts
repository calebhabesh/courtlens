import { describe, expect, it } from "vitest";
import catalog from "./team-branding.json";
import { contrastRatio, teamAccent, teamBrandColor } from "./team-colors";

describe("team accents", () => {
  it("covers every team in the branding catalog by ID and tricode", () => {
    for (const team of catalog.teams) {
      expect(teamAccent(team.team_id)).toMatch(/^#[0-9A-F]{6}$/);
      expect(teamAccent(team.tricode)).toBe(teamAccent(team.team_id));
    }
  });

  it("keeps every accent visible on the dark background (3:1)", () => {
    for (const team of catalog.teams) expect(contrastRatio(teamAccent(team.tricode)!, "#0C0D10")).toBeGreaterThanOrEqual(3);
  });

  it("keeps bright brand colors unchanged and lightens dark ones", () => {
    expect(teamAccent("NYK")).toBe(teamBrandColor("NYK"));
    expect(teamAccent("NOP")).not.toBe(teamBrandColor("NOP"));
  });

  it("returns null for unknown codes instead of guessing", () => {
    expect(teamAccent("XYZ")).toBeNull();
    expect(teamAccent(null)).toBeNull();
  });

  it("colors era codes and franchises by the identity they had that season", () => {
    expect(teamBrandColor("SEA")).toBe("#00653A");
    expect(teamBrandColor("1610612760", "2005-06")).toBe("#00653A");
    expect(teamBrandColor("1610612760", "2010-11")).toBe(teamBrandColor("OKC"));
    expect(teamBrandColor("CHA", "2008-09")).toBe("#1D5BA6");
    expect(teamBrandColor("CHA")).toBe(teamBrandColor("1610612766"));
    for (const era of catalog.eras as { code: string; last_season: string; asset?: string }[]) {
      if (era.asset) expect(contrastRatio(teamAccent(era.code, era.last_season)!, "#0C0D10")).toBeGreaterThanOrEqual(3);
    }
  });

  it("colors older identities by their logo and leaves logo-less folded teams uncolored", () => {
    expect(teamBrandColor("PHW")).toMatch(/^#[0-9A-F]{6}$/);
    expect(teamBrandColor("1610612737", "1960-61")).toBe(teamBrandColor("STL"));
    expect(teamBrandColor("WSC")).toBeNull();
  });
});
