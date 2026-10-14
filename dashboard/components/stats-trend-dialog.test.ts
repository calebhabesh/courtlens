import { describe, expect, it } from "vitest";
import { careerSeasons, settleLimited } from "./stats-trend-dialog";

describe("careerSeasons", () => {
  const loaded = ["2013-14", "2014-15", "2015-16", "2016-17", "2017-18"];
  it("keeps the first to last season played, gaps included", () => {
    expect(careerSeasons(loaded, ["2016-17", "2014-15"])).toEqual(["2014-15", "2015-16", "2016-17"]);
  });
  it("is empty when no loaded season was played", () => {
    expect(careerSeasons(loaded, ["1999-00"])).toEqual([]);
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
