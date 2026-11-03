import { describe, expect, it } from "vitest";
import { landing, previousSeason } from "./landing-season";

const jordan = ["1984-85", "1987-88", "1997-98", "2001-02", "2002-03"];
const magic = ["1979-80", "1986-87", "1987-88", "1990-91", "1995-96"];
const fox = ["2017-18", "2021-22", "2022-23", "2025-26", "2026-27"];
const now = { page: "2026-27", newest: "2026-27" };

describe("landing", () => {
  it("matches the other player's season when the new player played it", () => {
    expect(landing(magic, { ...now, other: "1987-88", best: "1986-87" })).toEqual({ season: "1987-88", kind: "kept" });
  });
  it("keeps the page season when the other player's season is not theirs", () => {
    expect(landing(fox, { ...now, other: "1987-88", best: "2022-23", active: true })).toEqual({ season: "2026-27", kind: "kept" });
  });
  it("puts an active player in their latest season, not their best", () => {
    expect(landing(fox.slice(0, -1), { ...now, best: "2022-23", active: true })).toEqual({ season: "2025-26", kind: "latest" });
  });
  it("puts a retired player in their best season", () => {
    expect(landing(jordan, { ...now, best: "1987-88", active: null })).toEqual({ season: "1987-88", kind: "best" });
  });
  it("treats a player off every roster as retired, even after a recent season", () => {
    // Played last season, now on no roster: their best season, not their final one.
    expect(landing(["2008-09", "2025-26"], { ...now, best: "2008-09", active: false })).toEqual({ season: "2008-09", kind: "best" });
  });
  it("without roster evidence, counts recent seasons as active", () => {
    expect(landing(fox.slice(0, -1), { ...now, best: "2022-23" })).toEqual({ season: "2025-26", kind: "latest" });
  });
  it("falls back to the latest season without a best one", () => {
    expect(landing(jordan, { ...now, best: null })).toEqual({ season: "2002-03", kind: "latest" });
  });
  it("leaves the season alone when the player's seasons are unknown", () => {
    expect(landing([], { ...now, best: "1987-88" })).toBeNull();
  });
});

describe("previousSeason", () => {
  it("steps back one season across the century", () => {
    expect(previousSeason("2026-27")).toBe("2025-26");
    expect(previousSeason("2000-01")).toBe("1999-00");
  });
});
