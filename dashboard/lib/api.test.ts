import { describe, expect, it } from "vitest";
import { mondayFor } from "./api";

describe("mondayFor", () => {
  it("returns the same date for Monday", () => {
    expect(mondayFor(new Date("2026-08-24T23:00:00Z"))).toBe("2026-08-24");
  });

  it("returns the previous Monday for Sunday", () => {
    expect(mondayFor(new Date("2026-08-30T03:00:00Z"))).toBe("2026-08-24");
  });
});
