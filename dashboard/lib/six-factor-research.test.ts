import { describe, expect, it } from "vitest";
import { FACTORS, factorMeta, intervalDomain, intervalText, signTone, signed, sortPlayers, unknownReason, type ImpactNode, type NodeKey, type SixFactorPlayer } from "./six-factor-research";

const node = (value: number | null, low: number | null = null, high: number | null = null): ImpactNode =>
  ({ value, low, high, replicates: low == null ? null : 200, percentile: null, status: value == null ? "below_qualification" : low == null ? "no_interval" : "estimate" });
const player = (id: string, rapm: number | null): SixFactorPlayer => ({
  player_id: id, player_name: id, team: null, games: 1, minutes: 1,
  metrics: Object.fromEntries((["rapm", "orapm", "drapm", ...FACTORS.map(f => f.key)] as NodeKey[]).map(key => [key, node(key === "rapm" ? rapm : null)])) as Record<NodeKey, ImpactNode>,
  composites: { net_efficiency: null, possession_control: null, reconstructed_rapm: null },
});

describe("six-factor research", () => {
  it("writes unknown as an em dash or Unknown, never zero", () => {
    expect(signed(null)).toBe("—");
    expect(intervalText(node(1.5))).toBe("Unknown");
    expect(intervalText(node(1.5, null, 2))).toBe("Unknown");
    expect(signTone(null)).toBeUndefined();
  });

  it("uses a real minus sign and marks plus-minus tones", () => {
    expect(signed(-1.234)).toBe("−1.23");
    expect(signed(1.234)).toBe("+1.23");
    expect(intervalText(node(1, -0.5, 2.25))).toBe("−0.50 to +2.25");
    expect(signTone(2)).toBe("up");
    expect(signTone(-2)).toBe("down");
  });

  it("sorts unknowns last whichever way the column runs", () => {
    const rows = [player("a", 1), player("b", null), player("c", 3)];
    expect(sortPlayers(rows, "rapm", "desc").map(p => p.player_id)).toEqual(["c", "a", "b"]);
    expect(sortPlayers(rows, "rapm", "asc").map(p => p.player_id)).toEqual(["a", "c", "b"]);
  });

  it("explains each unknown state and none for a full estimate", () => {
    expect(unknownReason("estimate")).toBeNull();
    for (const status of ["no_interval", "below_qualification", "not_in_fit"] as const) expect(unknownReason(status)).toBeTruthy();
  });

  it("keeps zero on the interval axis and ignores unknowns", () => {
    expect(intervalDomain([node(2.2, 1.1, 3.4), node(null)])).toEqual([0, 4]);
    expect(intervalDomain([node(-2.2, -3.4, -1.1)])).toEqual([-4, 1]);
    expect(intervalDomain([node(null)])).toEqual([0, 1]);
  });

  it("names six favorable-sign factors, three per side", () => {
    expect(FACTORS.filter(f => f.side === "offense").map(f => f.short)).toEqual(["oTS", "oTOV", "oREB"]);
    expect(FACTORS.filter(f => f.side === "defense").map(f => f.short)).toEqual(["dTS", "dTOV", "dREB"]);
    expect(factorMeta("d_tov").family).toBe("Turnovers");
  });
});
