import { describe, expect, it } from "vitest";
import { bestColumns, duelParams, gridFromDuel, gridParams, parseGrid } from "./compare-grid";

describe("compare grid URL (alignment row 3, 64)", () => {
  it("keeps unique columns, at most five, each with its own valid season", () => {
    const params = new URLSearchParams("layout=grid&players=1,2,2,3,4,5,6&seasons=,2016-17,x,,bad,");
    expect(parseGrid(params)).toEqual({ ids: ["1", "2", "3", "4", "5"], seasons: [null, "2016-17", null, null, null] });
  });
  it("round-trips between the duel and the grid, carrying each player's season", () => {
    const duel = new URLSearchParams("playerA=1&playerB=2&seasonB=2016-17&preset=offense&empty=1");
    const grid = gridParams(duel, gridFromDuel(duel, "1", "2", ["3"]));
    expect(grid.get("layout")).toBe("grid");
    expect(grid.get("players")).toBe("1,2,3");
    expect(grid.get("seasons")).toBe(",2016-17,");
    expect(grid.get("playerA")).toBeNull();
    expect(grid.get("empty")).toBeNull();
    expect(grid.get("preset")).toBe("offense");
    const back = duelParams(grid, { ids: ["1", "2"], seasons: [null, "2016-17"] });
    expect([back.get("playerA"), back.get("playerB"), back.get("seasonB"), back.get("layout"), back.get("players")]).toEqual(["1", "2", "2016-17", null, null]);
  });
  it("drops the seasons list when every column follows the page season", () => {
    expect(gridParams(new URLSearchParams("seasons=,x"), { ids: ["1", "2", "3"], seasons: [null, null, null] }).get("seasons")).toBeNull();
  });
});

describe("bestColumns", () => {
  it("marks the best known value by direction at the shown precision", () => {
    expect(bestColumns([21.5, 28.2, null, 24.4], "high", 1)).toEqual([1]);
    expect(bestColumns([3.6, 1.9, 2.2], "low", 1)).toEqual([1]);
    // 28.24 and 28.21 both show 28.2: they tie for best.
    expect(bestColumns([28.24, 28.21, 20], "high", 1)).toEqual([0, 1]);
  });
  it("has no best for an all-way tie, a single known value or no direction", () => {
    expect(bestColumns([5, 5, 5], "high", 0)).toEqual([]);
    expect(bestColumns([5, null, null], "high", 0)).toEqual([]);
    expect(bestColumns([1, 2, 3], null, 0)).toEqual([]);
  });
});
