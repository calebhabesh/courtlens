import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import * as route from "../app/api/live/[[...path]]/route";
import { gameStatus, lineFavourite, madeAttempted, nearestGameDate, periodLabel, seasonOf, shiftSlate, shootingTone, trueShooting, twoPoint, validSlate, type LiveGame, type LiveTeam } from "./live";

const context = (path: string[] = []) => ({ params: Promise.resolve({ path }) });
const request = (path: string) => new NextRequest(`http://localhost:3000/api/live${path}`);
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Live proxy", () => {
  it("is read-only: GET only, fixed routes and query keys", async () => {
    expect(Object.keys(route).sort()).toEqual(["GET"]);
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: null })); vi.stubGlobal("fetch", fetch);
    expect((await route.GET(request("/jobs"), context(["jobs"]))).status).toBe(404);
    expect((await route.GET(request("/subscriptions"), context(["subscriptions"]))).status).toBe(404);
    const read = await route.GET(request("?slate_date=2026-10-03&target=http://other.test"), context());
    expect(read.headers.get("cache-control")).toBe("no-store");
    expect(fetch.mock.calls[0][0].pathname).toBe("/api/live");
    expect(fetch.mock.calls[0][0].search).toBe("?slate_date=2026-10-03");
    await route.GET(request("/games/401909869?slate_date=2026-10-26"), context(["games", "401909869"]));
    expect(fetch.mock.calls[1][0].pathname).toBe("/api/live/games/401909869");
  });
  it("passes status codes without upstream bodies and fails closed on network errors", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ detail: "private upstream payload" }, { status: 422 })); vi.stubGlobal("fetch", fetch);
    const response = await route.GET(request("?slate_date=2026-10-03"), context());
    expect(response.status).toBe(422); expect(await response.text()).not.toContain("private");
    fetch.mockRejectedValue(new Error("secret"));
    expect((await route.GET(request("?slate_date=2026-10-03"), context())).status).toBe(502);
  });
});

const game = (over: Partial<LiveGame>): LiveGame => ({ source_id: "1", canonical_id: null, identity_status: "unmapped", slate_date: "2026-10-26", event_time: "2026-10-26T23:00:00Z", status: "scheduled", period: null, clock: null, teams: [], ...over });

describe("Live formatting", () => {
  it("labels status as Databallr does", () => {
    expect(gameStatus(game({ status: "scheduled" }))).toBe("7:00 PM EDT");
    expect(gameStatus(game({ status: "in_progress", period: 3, clock: "4:21" }))).toBe("Q3 4:21");
    expect(gameStatus(game({ status: "in_progress", period: 5, clock: "1:02" }))).toBe("OT1 1:02");
    expect(gameStatus(game({ status: "in_progress", period: 2, clock: "0.0", status_detail: "Halftime" }))).toBe("Halftime");
    expect(gameStatus(game({ status: "final", status_detail: "Final" }))).toBe("Final");
    expect(gameStatus(game({ status: "final", status_detail: "Final/OT" }))).toBe("Final/OT");
    expect(gameStatus(game({ status: "postponed" }))).toBe("Postponed");
    expect(periodLabel(4)).toBe("Q4"); expect(periodLabel(6)).toBe("OT2");
  });
  it("computes TS% and 2P from the box, unknown without attempts", () => {
    const edwards = { points: "47", "fieldGoalsMade-fieldGoalsAttempted": "19-33", "threePointFieldGoalsMade-threePointFieldGoalsAttempted": "5-15", "freeThrowsMade-freeThrowsAttempted": "4-6" };
    expect(trueShooting(edwards)!.toFixed(1)).toBe("65.9");
    expect(twoPoint(edwards)).toBe("14/18");
    expect(trueShooting({ points: "0", "fieldGoalsMade-fieldGoalsAttempted": "0-0", "freeThrowsMade-freeThrowsAttempted": "0-0" })).toBeNull();
    expect(trueShooting({ points: null })).toBeNull();
    expect(madeAttempted("--")).toBeNull();
    expect([shootingTone(65.9), shootingTone(56.8), shootingTone(50.6), shootingTone(null)]).toEqual(["high", undefined, "low", undefined]);
  });
  it("lands an empty day on the latest earlier game date, else the next", () => {
    const calendar = ["2026-10-20", "2026-10-22", "2026-10-25"];
    expect(nearestGameDate(calendar, "2026-10-24")).toBe("2026-10-22");
    expect(nearestGameDate(calendar, "2026-10-01")).toBe("2026-10-20");
    expect(nearestGameDate(null, "2026-10-24")).toBeNull();
  });
  it("dates and seasons", () => {
    expect(validSlate("2026-02-30")).toBe(false); expect(validSlate("2026-10-26")).toBe(true);
    expect(shiftSlate("2026-10-31", 1)).toBe("2026-11-01");
    expect(seasonOf("2026-10-26")).toBe("2026-27"); expect(seasonOf("2027-04-10")).toBe("2026-27");
  });
});

describe("line favourite (follow-up 8)", () => {
  const team = (tricode: string, side: "home" | "away"): LiveTeam => ({ source_id: tricode, canonical_id: null, tricode, identity_status: "verified", name: tricode, side, score: null });
  const teams = [team("DET", "away"), team("NYK", "home")];
  it("reads ESPN's spread as the home team's line", () => {
    // ESPN writes "NY -4.5"; the favourite comes from the sign and our own codes.
    expect(lineFavourite({ spread: -4.5 }, teams)).toEqual({ team: teams[1], points: 4.5 });
    expect(lineFavourite({ spread: 3 }, teams)).toEqual({ team: teams[0], points: 3 });
    expect(lineFavourite({ spread: 0 }, teams)).toBe("even");
    expect(lineFavourite({ spread: null }, teams)).toBeNull();
    expect(lineFavourite(null, teams)).toBeNull();
  });
});
