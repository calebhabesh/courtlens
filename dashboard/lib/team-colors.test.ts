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

  it("returns null for unknown or historical codes instead of guessing", () => {
    expect(teamAccent("SEA")).toBeNull();
    expect(teamAccent(null)).toBeNull();
  });
});
