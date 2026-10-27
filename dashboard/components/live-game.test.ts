import { describe, expect, it } from "vitest";
import { teamAccent, teamBrandColor } from "@/lib/team-colors";
import type { LiveTeam } from "@/lib/live";
import { teamColors } from "./live-game";

const team = (tricode: string, side: "home" | "away"): LiveTeam => ({ source_id: tricode, canonical_id: null, tricode, identity_status: "verified", name: tricode, side, score: null });
const vars = (away: string, home: string) => teamColors([team(away, "away"), team(home, "home")], "2026-27") as Record<string, string>;

describe("Live team colours (follow-up 5)", () => {
  it("keeps each team's own colour: Celtics green beside the Nets, black brand bar for Brooklyn", () => {
    const v = vars("BKN", "BOS");
    expect(v["--live-home"]).toBe(teamAccent("BOS", "2026-27"));
    expect(v["--live-home-brand"]).toBe("#007A33");
    expect(v["--live-away-brand"]).toBe("#000000");
    expect(Object.values(v).join(" ")).not.toContain("identity");
  });
  it("tints only the away team's own colour when two are near-identical", () => {
    const v = vars("CHI", "DET");
    expect(v["--live-home"]).toBe(teamAccent("DET", "2026-27"));
    expect(v["--live-away"]).toContain(teamAccent("CHI", "2026-27")!);
    expect(v["--live-away"]).toContain("white");
    expect(v["--live-away-brand"]).toBe(teamBrandColor("CHI", "2026-27"));
  });
  it("leaves distinct colours alone", () => {
    const v = vars("MIN", "CLE");
    expect([v["--live-away"], v["--live-home"]]).toEqual([teamAccent("MIN", "2026-27"), teamAccent("CLE", "2026-27")]);
  });
});
