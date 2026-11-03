import { describe, expect, it } from "vitest";
import type { LiveGame } from "@/lib/live";
import { monthGrid, scheduleMonths, teamSide } from "./team-schedule";

const game = (day: string, home: string, away: string, scores: [number | null, number | null] = [null, null], status: LiveGame["status"] = "scheduled"): LiveGame => ({
  source_id: day, canonical_id: null, identity_status: "unmapped", slate_date: day, event_time: `${day}T23:30:00Z`, status, period: null, clock: null,
  teams: [
    { source_id: "h", canonical_id: null, identity_status: "verified", tricode: home, name: home, side: "home", score: scores[0] },
    { source_id: "a", canonical_id: null, identity_status: "verified", tricode: away, name: away, side: "away", score: scores[1] },
  ],
});

describe("team schedule calendar", () => {
  it("pages every month from the first game to the last, empty months included", () => {
    expect(scheduleMonths([game("2027-01-03", "TOR", "BOS"), game("2026-10-21", "TOR", "CHI")])).toEqual(["2026-10", "2026-11", "2026-12", "2027-01"]);
    expect(scheduleMonths([])).toEqual([]);
  });

  it("lays a month out in Sunday-first weeks", () => {
    const weeks = monthGrid("2026-11");
    // November 1, 2026 is a Sunday; 30 days fill five weeks.
    expect(weeks[0][0]).toBe("2026-11-01");
    expect(weeks).toHaveLength(5);
    expect(weeks.at(-1)).toEqual(["2026-11-29", "2026-11-30", null, null, null, null, null]);
    expect(monthGrid("2026-10")[0].slice(0, 4)).toEqual([null, null, null, null]);
  });

  it("reads each game from the team's side, era codes included", () => {
    const won = teamSide(game("2026-10-21", "TOR", "CHI", [135, 92], "final"), "1610612761");
    expect(won.home).toBe(true);
    expect(won.won).toBe(true);
    expect(won.opponent?.tricode).toBe("CHI");
    const lost = teamSide(game("2026-11-01", "LAL", "TOR", [131, 125], "final"), "1610612761");
    expect([lost.home, lost.won]).toEqual([false, false]);
    // An upcoming game has no result, never a loss.
    expect(teamSide(game("2026-11-04", "DEN", "TOR"), "1610612761").won).toBeNull();
  });
});
