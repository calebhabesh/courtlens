import { describe, expect, it } from "vitest";
import { deltaClass, evidenceRows, signed } from "./research-investigation";
import { contextLine } from "./saved-operation-library";

describe("FO12 research helpers", () => {
  it("keeps unknown changes unknown and documented zero as zero", () => {
    expect(signed(null)).toBe("—");
    expect(signed(undefined, "%")).toBe("—");
    expect(signed(0)).toBe("0");
    expect(signed(1.5, " pp")).toBe("+1.5 pp");
    expect(signed(-2)).toBe("-2");
    expect(deltaClass(null)).toBe("research-delta");
    expect(deltaClass(0)).toBe("research-delta");
    expect(deltaClass(3)).toContain("is-up");
    expect(deltaClass(-3)).toContain("is-down");
  });

  it("states a retained scope with the shared through-date format, never the raw cutoff", () => {
    const line = contextLine({ release_id: "r", season: "2024-25", phase: "regular_season", before_date: "2025-04-15" });
    expect(line).toBe("2024-25 · Regular Season · Through Apr 14, 2025");
    expect(line).not.toContain("2025-04-15");
    expect(contextLine({ season: "2024-25" })).toBe("2024-25");
  });

  it("moves operation versions and hashes into Data details rows", () => {
    expect(evidenceRows(null)).toEqual([]);
    expect(evidenceRows({ operation_version: "v1", evidence_hash: "abc" }, "Distribution")).toEqual([
      { label: "Distribution operation", value: "v1", mono: true },
      { label: "Distribution SHA-256", value: "abc", mono: true }
    ]);
  });
});
