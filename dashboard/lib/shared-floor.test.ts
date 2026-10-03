import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { comparableFloorResults, floorCsv, floorInterval, floorNumber, floorUrl, resolvedFloorRequest, validateFloorRequest } from "./shared-floor";
import type { FloorResponse } from "./shared-floor";
const empty = JSON.parse(readFileSync(new URL("../../docs/evidence/b21-api-smoke.json", import.meta.url), "utf8")).response as FloorResponse;
const req = { ...empty.request };
describe("shared-floor presentation semantics", () => {
  it("keeps missing distinct from observed zero", () => {
    expect(floorNumber(null)).toBe("—"); expect(floorNumber(0)).toBe("0.00");
    expect(floorInterval(empty.shifts[0].interval)).toBe(empty.shifts[0].interval.reason);
  });
  it("accepts small and full units but rejects contradictory conditions", () => {
    expect(validateFloorRequest("wowy", { ...req, together: [], exact_unit: ["1", "2"] })).toBeNull();
    expect(validateFloorRequest("wowy", { ...req, together: [], exact_unit: ["1", "2", "3", "4", "5"] })).toBeNull();
    expect(validateFloorRequest("wowy", { ...req, apart: req.together })).toContain("distinct");
    expect(validateFloorRequest("wowy", { ...req, exact_unit: ["1", "2"] })).toContain("cannot mix");
  });
  it("requires one on/off player and a distinct focal player for stat shift", () => {
    expect(validateFloorRequest("on-off", req)).toBeNull();
    expect(validateFloorRequest("on-off", { ...req, together: ["1", "2"] })).toContain("one together");
    expect(validateFloorRequest("stat-shift", { ...req, player_id: req.together[0] })).toContain("separate");
    expect(validateFloorRequest("stat-shift", { ...req, player_id: "other" })).toBeNull();
  });
  it("rejects invalid gates and date bounds", () => {
    for (const value of [NaN, 0, 10001]) expect(validateFloorRequest("on-off", { ...req, min_possessions: value })).toContain("Possessions");
    expect(validateFloorRequest("on-off", { ...req, min_games: 1.5 })).toContain("integer");
    expect(validateFloorRequest("on-off", { ...req, lower_date: req.before_date })).toContain("precede");
  });
  it("pins resolved context in reproducible links without truncating sets", () => {
    const result = { ...empty, request: { ...req, release_id: null, season: null } };
    const url = new URL(floorUrl("/wowy", "wowy", { ...resolvedFloorRequest(result), exact_unit: ["1", "2", "3", "4", "5"] }), "http://localhost");
    expect(url.searchParams.get("release_id")).toBe(empty.context.release_id);
    expect(url.searchParams.get("season")).toBe("2023-24");
    expect(url.searchParams.get("exact_unit")).toBe("1,2,3,4,5");
  });
  it("allows changed predicates only within matching analytical scopes", () => {
    expect(comparableFloorResults(empty, { ...empty, request: { ...req, together: ["other"] } })).toBe(true);
    for (const key of ["release_id", "season", "phase", "before_date"]) expect(comparableFloorResults(empty, { ...empty, context: { ...empty.context, [key]: "changed" } })).toBe(false);
    expect(comparableFloorResults(empty, { ...empty, request: { ...req, min_games: 10 } })).toBe(false);
  });
  it("exports exact observed denominators and empty nulls with evidence identity", () => {
    const csv = floorCsv([empty]);
    expect(csv).toContain(empty.evidence_hash);
    expect(csv).toContain('"source_blocked"');
    expect(csv).toContain('"empty","offensive_rating","","0"');
    expect(csv.split("\n").length).toBeGreaterThan(empty.cells.length);
  });
});
