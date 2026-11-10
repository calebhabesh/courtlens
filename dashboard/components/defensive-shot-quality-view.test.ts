import { describe, expect, it } from "vitest";
import { matchupsHref } from "./defensive-shot-quality-view";

describe("matchupsHref (RD05 round 3)", () => {
  it("opens everyone a defender guarded in a season on Player Matchups", () => {
    expect(matchupsHref("2025-26", "203991")).toBe("/matchups?season=2025-26&side=defense&playerId=203991");
  });
  it("opens one head-to-head with the shooter as the opponent", () => {
    expect(matchupsHref("2019-20", "203991", "203076")).toBe("/matchups?season=2019-20&side=defense&playerId=203991&opponentId=203076");
  });
});
