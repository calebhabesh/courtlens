import { describe, expect, it } from "vitest";
import type { PlayerResearchItem } from "@/lib/types";
import { careerRows, careerSeasons, dodgeColumn, nearestColumn, settleLimited } from "./stats-trend-dialog";

describe("careerSeasons", () => {
  const loaded = ["2013-14", "2014-15", "2015-16", "2016-17", "2017-18"];
  it("keeps the first to last season played, gaps included", () => {
    expect(careerSeasons(loaded, ["2016-17", "2014-15"])).toEqual(["2014-15", "2015-16", "2016-17"]);
  });
  it("is empty when no loaded season was played", () => {
    expect(careerSeasons(loaded, ["1999-00"])).toEqual([]);
  });
});

describe("careerRows", () => {
  const loaded = ["2013-14", "2014-15", "2015-16", "2016-17", "2017-18"];
  const row = (id: string) => ({ player_id: id, metrics: {} }) as unknown as PlayerResearchItem;
  it("groups each season's rows across players over the shared career span, gaps included", () => {
    const rows = careerRows(loaded, [
      { player_id: "a", seasons: [{ season: "2016-17", item: row("a") }, { season: "2014-15", item: row("a") }] },
      { player_id: "b", seasons: [{ season: "2016-17", item: row("b") }, { season: "2015-16", item: null }] }
    ]);
    expect(rows.map(entry => [entry.season, entry.items.map(item => item.player_id)])).toEqual([
      ["2014-15", ["a"]], ["2015-16", []], ["2016-17", ["a", "b"]]
    ]);
    expect(rows.every(entry => entry.failed === undefined)).toBe(true);
  });
  it("marks a failed read's player unavailable without hiding the others", () => {
    const rows = careerRows(loaded, [{ player_id: "a", seasons: [{ season: "2017-18", item: row("a") }] }, { player_id: "b" }]);
    expect(rows).toEqual([{ season: "2017-18", items: [row("a")], failed: ["b"] }]);
  });
});

describe("settleLimited", () => {
  it("never runs more than the limit at once and keeps order and failures", async () => {
    let running = 0, peak = 0;
    const settled = await settleLimited([1, 2, 3, 4, 5, 6, 7], 3, async n => {
      running++; peak = Math.max(peak, running);
      await new Promise(resolve => setTimeout(resolve, 5));
      running--;
      if (n === 4) throw new Error("boom");
      return n * 10;
    });
    expect(peak).toBe(3);
    expect(settled.map(entry => entry.status === "fulfilled" ? entry.value : "failed")).toEqual([10, 20, 30, "failed", 50, 60, 70]);
  });
});

describe("nearestColumn", () => {
  // Five seasons from x 100 to 500: columns 100 apart.
  it("snaps to the nearest season column", () => {
    expect(nearestColumn(140, 5, 100, 500, 50, 550)).toBe(0);
    expect(nearestColumn(160, 5, 100, 500, 50, 550)).toBe(1);
    expect(nearestColumn(530, 5, 100, 500, 50, 550)).toBe(4);
  });
  it("is null outside the plot and 0 for a single season", () => {
    expect(nearestColumn(20, 5, 100, 500, 50, 550)).toBeNull();
    expect(nearestColumn(600, 5, 100, 500, 50, 550)).toBeNull();
    expect(nearestColumn(300, 1, 100, 500, 50, 550)).toBe(0);
  });
});

describe("dodgeColumn", () => {
  it("leaves dots that are a diameter apart in place", () => {
    expect(dodgeColumn([100, 140, null], 16)).toEqual([0, 0, 0]);
  });
  it("puts overlapping dots side by side in series order, centred on the season", () => {
    // Series 0 sits lower but still comes first (left); series 2 has no value.
    expect(dodgeColumn([110, 100, null], 16)).toEqual([-17, 17, 0]);
  });
  it("chains a dot that touches either neighbour into one cluster", () => {
    expect(dodgeColumn([100, 125, 150], 16)).toEqual([-34, 0, 34]);
  });
});
