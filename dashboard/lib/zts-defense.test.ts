import { describe, expect, it } from "vitest";
import { DEFAULT_SORT, defensePattern, leaguePointsPerPossession, playTypeLabel, scopeLabel, signedPoints, sortDefenders } from "./zts-defense";
import type { PlayTypePlayer } from "./stats-feeds";

const player = (id: string, adjusted: number | null, qualified = true, possessions = 300): PlayTypePlayer => ({
  player_id: id, player_name: `Player ${id}`, team_tricodes: ["BOS"], games: 50, possessions, points: 280,
  points_per_possession: 0.9, expected_points_per_possession: 0.95, adjusted_per_100: adjusted, top_play_type: "spotup", qualified, percentiles: {},
});

describe("zTS Defense (RD17)", () => {
  it("sorts qualified defenders first, thin samples last, unknown values last within each group", () => {
    const rows = [player("a", 3), player("thin", -30, false), player("b", -12), player("x", null), player("c", 0)];
    expect(sortDefenders(rows, DEFAULT_SORT).map(p => p.player_id)).toEqual(["b", "c", "a", "x", "thin"]);
    expect(sortDefenders(rows, { key: "adjusted_per_100", direction: "desc" }).map(p => p.player_id)).toEqual(["a", "c", "b", "x", "thin"]);
  });

  it("names the lowest and highest qualified defender, never a thin sample", () => {
    const pattern = defensePattern([player("thin", -40, false), player("a", -5), player("b", 8), player("c", 1)]);
    expect(pattern?.lowest.player_id).toBe("a");
    expect(pattern?.highest.player_id).toBe("b");
    expect(pattern?.qualified).toBe(3);
    expect(defensePattern([player("a", -5), player("thin", 3, false)])).toBeNull();
  });

  it("writes signs with a true minus and no negative zero", () => {
    expect(signedPoints(-19.3456)).toBe("−19.3");
    expect(signedPoints(4)).toBe("+4.0");
    expect(signedPoints(-0.01)).toBe("0.0");
    expect(signedPoints(null)).toBe("—");
  });

  it("labels scopes and play types from the feed, and pools league points per possession", () => {
    expect(scopeLabel({ season: "2025-26", phase: "playoffs" })).toBe("2025-26 playoffs");
    expect(scopeLabel({ season: "2025-26", phase: "regular_season" })).toBe("2025-26 regular season");
    const league = [{ play_type: "spotup", label: "Spot-up", possessions: 100, points: 105, points_per_possession: 1.05 }, { play_type: "postup", label: "Post-up", possessions: 300, points: 270, points_per_possession: 0.9 }];
    expect(playTypeLabel({ league }, "postup")).toBe("Post-up");
    expect(playTypeLabel({ league }, "cut")).toBe("cut");
    expect(leaguePointsPerPossession({ league })).toBeCloseTo(375 / 400, 12);
    expect(leaguePointsPerPossession({ league: [] })).toBeNull();
  });
});
