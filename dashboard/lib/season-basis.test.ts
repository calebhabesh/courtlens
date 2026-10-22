import { describe, expect, it } from "vitest";
import { seasonOptionLabel } from "./season-basis";

describe("season option labels", () => {
  it("marks the three Basketball Association of America seasons", () => {
    expect(seasonOptionLabel("1946-47")).toBe("1946-47 · BAA");
    expect(seasonOptionLabel("1948-49")).toBe("1948-49 · BAA");
    expect(seasonOptionLabel("1949-50")).toBe("1949-50");
    expect(seasonOptionLabel("2025-26")).toBe("2025-26");
  });
});
