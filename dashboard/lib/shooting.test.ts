import { describe, expect, it } from "vitest";
import { courtPosition, resolvedShooting, shootingCsv, shootingNumber, shootingPercent, shootingUrl, validateShooting } from "./shooting";
import type { ShootingInput, ShootingResponse, ShotFact } from "./shooting-types";
import { readFileSync } from "node:fs";
const response: ShootingResponse = JSON.parse(readFileSync("../docs/evidence/b23-api-smoke.json", "utf8")).operations["shot-profile"].response;
const request: ShootingInput = { player_id: "1", min_attempts: 100, min_games: 5, limit: 10 };
const shot: ShotFact = { game_id: "g", game_date: "2024-01-01", player_id: "1", team_id: "TOR", period: 1, seconds_remaining: 0, shot_value: 2, made: false, points: 0, x_feet: 0, y_feet: 0, distance_feet: 0, zone: "Restricted Area" };
describe("B24 shooting evidence semantics", () => {
  it("preserves zero, absent rates and percent units", () => {
    expect(shootingNumber(0)).toBe("0"); expect(shootingNumber(null)).toBe("—");
    expect(shootingPercent(0)).toBe("0.0%"); expect(shootingPercent(null)).toBe("—"); expect(shootingPercent(.5)).toBe("50.0%");
  });
  it("normalizes court orientation and retains valid zero coordinates", () => {
    expect(courtPosition(shot)).toEqual({ x: 25, y: 88.75 });
    expect(courtPosition({ ...shot, x_feet: -25, y_feet: 88.75 })).toEqual({ x: 0, y: 0 });
    expect(courtPosition({ ...shot, x_feet: 25, y_feet: -5.25 })).toEqual({ x: 50, y: 94 });
  });
  it("does not place unknown, nonfinite or off-court attempts at the basket", () => {
    for (const s of [{ ...shot, x_feet: null }, { ...shot, y_feet: null }, { ...shot, y_feet: Infinity }, { ...shot, x_feet: 26 }, { ...shot, y_feet: 89 }]) expect(courtPosition(s)).toBeNull();
  });
  it("validates canonical identity, gates and exclusive dates", () => {
    expect(validateShooting(request)).toBeNull();
    for (const change of [{ player_id: "" }, { defender_id: "a b" }, { min_attempts: 0 }, { min_games: 101 }, { limit: 26 }, { limit: 1.5 }, { lower_date: "2024-01-01", before_date: "2024-01-01" }]) expect(validateShooting({ ...request, ...change })).not.toBeNull();
    expect(validateShooting({ ...request, min_attempts: 10000, min_games: 100, limit: 25 })).toBeNull();
  });
  it("resolved URLs pin release, phase, bounds and sample controls", () => {
    const resolved = resolvedShooting({ ...response, request: { ...response.request, lower_date: "2024-01-01", release_id: null } });
    const url = new URL(shootingUrl("/similar-players/shot-profile", "shot-profile-peers", resolved), "http://localhost");
    expect(url.searchParams.get("release_id")).toBe(response.context.release_id);
    expect(url.searchParams.get("phase")).toBe("regular_season"); expect(url.searchParams.get("lower_date")).toBe("2024-01-01"); expect(url.searchParams.get("before_date")).toBe("2024-04-15"); expect(url.searchParams.get("min_attempts")).toBe("100");
  });
  it("exports full facts, fractional exposure, zero and null samples with identity", () => {
    const csv = shootingCsv({ ...response, shots: [{ ...shot, x_feet: null }], assignments: [{ offensive_player_id: "1", defensive_player_id: "2", games: 1, seconds: 0, fractional_possessions: .125, attempts: 0, makes: 0, player_points: 0, team_points: 0, fg_pct: null }], anchors: [{ game_id: "g", possession_number: null, branch: "unknown", shot_points: 0, first_chance_points: null, continued_points: null, next_opponent_points: null, next_status: "missing", reason: 'unmapped "candidate"' }] });
    expect(csv).toContain(response.evidence_hash); expect(csv).toContain('""fractional_possessions"":0.125'); expect(csv).toContain('""fg_pct"":null'); expect(csv).toContain('""first_chance_points"":null'); expect(csv).toContain('""x_feet"":null'); expect(csv).toContain('""points"":0'); expect(csv).toContain('"coverage"'); expect(csv).toContain('"context"');
  });
});
