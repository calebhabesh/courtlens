import { describe, it, expect, vi } from "vitest";
import { formatContextBanner, copyCanonicalQueryUrl } from "./image-export";

describe("image-export utility (F46)", () => {
  it("formats context banner with all analytical parameters", () => {
    const banner = formatContextBanner({
      season: "2024-25",
      phase: "regular_season",
      before_date: "2024-12-01",
      window: "season",
      release_id: "rel-0123456789abcdef"
    });

    expect(banner).toBe(
      "Season: 2024-25 · Phase: regular season · Cutoff: 2024-12-01 · Window: season · Release: rel-01234567…"
    );
  });

  it("handles partial context metadata gracefully", () => {
    const banner = formatContextBanner({
      season: "2024-25",
      snapshot_id: "snap-123"
    });

    expect(banner).toBe("Season: 2024-25 · Snapshot: snap-123");
  });

  it("constructs canonical query url omitting null/undefined params", async () => {
    // Mock navigator.clipboard
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: {
        writeText: writeTextMock
      }
    });

    const success = await copyCanonicalQueryUrl("/stats", {
      season: "2024-25",
      phase: "regular_season",
      emptyParam: "",
      nullParam: null,
      undefinedParam: undefined,
      xMetric: "usg_pct",
      yMetric: "ts_pct"
    });

    expect(success).toBe(true);
    expect(writeTextMock).toHaveBeenCalledTimes(1);
    const calledUrl = writeTextMock.mock.calls[0][0];
    expect(calledUrl).toContain("/stats?");
    expect(calledUrl).toContain("season=2024-25");
    expect(calledUrl).toContain("phase=regular_season");
    expect(calledUrl).toContain("xMetric=usg_pct");
    expect(calledUrl).toContain("yMetric=ts_pct");
    expect(calledUrl).not.toContain("emptyParam");
    expect(calledUrl).not.toContain("nullParam");
    expect(calledUrl).not.toContain("undefinedParam");
  });
});
