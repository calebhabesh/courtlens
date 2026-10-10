import { describe, expect, it } from "vitest";
import { addDays, beforeDateFromThrough, formatDate, formatTimestamp, parseIsoDate, throughDateFromBefore, throughLabel } from "./format-date";

describe("formatDate", () => {
  it("uses one display format, long and compact", () => {
    expect(formatDate("2026-04-12")).toBe("Apr 12, 2026");
    expect(formatDate("2026-10-08", "compact")).toBe("Oct 8");
  });

  it("never shifts a calendar day by time zone", () => {
    expect(formatDate("2026-01-01")).toBe("Jan 1, 2026");
    expect(formatDate("2025-12-31T23:30:00-05:00")).toBe("Dec 31, 2025");
  });

  it("returns unparseable input unchanged and rejects impossible dates", () => {
    expect(formatDate("cutoff")).toBe("cutoff");
    expect(formatDate(null)).toBe("");
    expect(parseIsoDate("2026-02-30")).toBeNull();
  });
});

describe("through date and exclusive cutoff", () => {
  it("converts both ways across month and year boundaries", () => {
    expect(throughDateFromBefore("2026-04-13")).toBe("2026-04-12");
    expect(throughDateFromBefore("2026-03-01")).toBe("2026-02-28");
    expect(beforeDateFromThrough("2025-12-31")).toBe("2026-01-01");
    expect(beforeDateFromThrough(throughDateFromBefore("2024-03-01"))).toBe("2024-03-01");
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
  });

  it("labels an exclusive cutoff with the last included day (D20)", () => {
    expect(throughLabel("2026-04-13")).toBe("Through Apr 12, 2026");
    expect(throughLabel("")).toBe("");
  });
});

describe("formatTimestamp", () => {
  it("shows an ISO timestamp as a formatted UTC date and time", () => {
    expect(formatTimestamp("2026-10-07T07:01:57.571195+00:00")).toBe("Oct 7, 2026 · 07:01 UTC");
    expect(formatTimestamp("2026-10-07T23:30:00-04:00")).toBe("Oct 8, 2026 · 03:30 UTC");
  });
  it("leaves missing or unparseable input readable", () => {
    expect(formatTimestamp(null)).toBe("");
    expect(formatTimestamp("not a time")).toBe("not a time");
  });
});
