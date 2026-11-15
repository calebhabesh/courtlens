import { describe, expect, it } from "vitest";
import { reachable, rememberScroll } from "./scroll-memory";

describe("scroll memory", () => {
  it("keeps one position per URL, the latest last, and at most 60", () => {
    let positions = rememberScroll({}, "/standings?season=2018-19", 243.4);
    positions = rememberScroll(positions, "/live/2026-11-13", 120);
    positions = rememberScroll(positions, "/standings?season=2018-19", 300);
    expect(positions).toEqual({ "/live/2026-11-13": 120, "/standings?season=2018-19": 300 });
    expect(Object.keys(positions).at(-1)).toBe("/standings?season=2018-19");
    for (let i = 0; i < 80; i++) positions = rememberScroll(positions, `/stats?page=${i}`, i);
    expect(Object.keys(positions)).toHaveLength(60);
    expect(positions["/stats?page=79"]).toBe(79);
  });
  it("restores only once the page can reach the saved position", () => {
    expect(reachable(243, 100)).toBeNull();
    expect(reachable(243, 243)).toBe(243);
    expect(reachable(0, 500)).toBeNull();
    expect(reachable(undefined, 500)).toBeNull();
  });
});
