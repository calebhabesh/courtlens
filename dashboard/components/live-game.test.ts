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

describe("ESPN game extras", () => {
  it("places plays on the game clock, overtimes at five minutes", async () => {
    const { elapsed } = await import("./live-game-extras");
    expect(elapsed({ period: 1, clock: "12:00" })).toBe(0);
    expect(elapsed({ period: 2, clock: "6:00" })).toBe(1080);
    expect(elapsed({ period: 4, clock: "0.0" })).toBe(2880);
    expect(elapsed({ period: 5, clock: "2:30" })).toBe(3030);
    expect(elapsed({ period: null, clock: "1:00" })).toBeNull();
  });
  it("counts lead changes, not ties", async () => {
    const { leadChanges } = await import("./live-game-extras");
    const s = (away: number, home: number) => ({ away_score: away, home_score: home });
    expect(leadChanges([s(2, 0), s(2, 2), s(2, 4), s(5, 4), s(5, 5), s(7, 5)])).toBe(2);
  });
  it("writes ESPN's leader lines from the box", async () => {
    const { leaderLine } = await import("./live-game");
    const stats = { "fieldGoalsMade-fieldGoalsAttempted": "12-20", "freeThrowsMade-freeThrowsAttempted": "3-3", defensiveRebounds: "10", offensiveRebounds: "4", turnovers: "3", minutes: "29" };
    expect(leaderLine("points", stats)).toBe("12/20 FG, 3/3 FT");
    expect(leaderLine("rebounds", stats)).toBe("10 DREB, 4 OREB");
    expect(leaderLine("assists", stats)).toBe("3 TO, 29 MIN");
    expect(leaderLine("points", undefined)).toBeNull();
  });
});
