import { describe, expect, it } from "vitest";
import { isLimitRefusal, limitLine, refusalMessage, resetTime } from "./public-ask";

const resets = "2026-11-11T08:00:00+00:00"; // midnight Pacific

describe("public Ask limit wording", () => {
  it("says how many questions are left, or when Ask reopens", () => {
    expect(limitLine({ enabled: false })).toBeNull();
    expect(limitLine({ enabled: true, per_visitor: 3, remaining: 2, site_open: true, resets_at: resets })).toBe("2 of 3 questions left today on this demo.");
    expect(limitLine({ enabled: true, per_visitor: 3, remaining: 0, site_open: true, resets_at: resets }, "America/New_York")).toBe("You've used today's 3 questions. More at 3:00 AM EST.");
    expect(limitLine({ enabled: true, per_visitor: 3, remaining: 3, site_open: false, resets_at: resets }, "America/New_York")).toBe("Today's shared demo limit is used up. Ask opens again at 3:00 AM EST.");
  });

  it("turns a 429 detail into plain words", () => {
    const visitor = { code: "visitor_limit" as const, message: "x", per_visitor: 3, resets_at: resets, enabled: true };
    expect(isLimitRefusal(visitor)).toBe(true);
    expect(isLimitRefusal({ detail: "Thread not found." })).toBe(false);
    expect(refusalMessage(visitor, "America/Los_Angeles")).toBe("You've used today's 3 questions on the CourtLens demo. You can ask more at 12:00 AM PST.");
    expect(refusalMessage({ ...visitor, code: "site_limit" }, "America/Los_Angeles")).toBe("Today's shared question limit for the CourtLens demo is used up. Ask opens again at 12:00 AM PST.");
    expect(resetTime(undefined)).toBe("tomorrow");
  });
});
