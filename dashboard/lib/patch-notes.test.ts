import { describe, expect, it } from "vitest";
import { PATCH_RELEASES, dateRange, displayText, releaseLine, shortDate } from "./patch-notes";

// Commits and dates are checked against git by scripts/check-patch-notes.mjs (CI clones at depth 1).
describe("patch notes", () => {
  it("lists releases newest first, each entry dated inside its release", () => {
    const ends = PATCH_RELEASES.map(release => release.range.to);
    expect([...ends].sort().reverse()).toEqual(ends);
    for (const release of PATCH_RELEASES) for (const group of release.groups) for (const entry of group.entries) {
      expect(entry.commit).toMatch(/^[0-9a-f]{7}$/);
      expect(entry.date >= release.range.from && entry.date <= release.range.to, `${release.id} ${entry.title}`).toBe(true);
      if (entry.href) expect(entry.href).toMatch(/^\/[a-z0-9/-]*$/);
    }
  });

  it("has no blog entry or link", () => {
    expect(JSON.stringify(PATCH_RELEASES).toLowerCase()).not.toContain("/blog");
  });

  it("formats dates without time-zone shifts", () => {
    expect(shortDate("2026-11-03")).toBe("Nov 3, 2026");
    expect(dateRange({ from: "2026-10-14", to: "2026-11-03" })).toBe("Oct 14 – Nov 3, 2026");
    expect(dateRange({ from: "2026-10-14", to: "2026-10-14" })).toBe("Oct 14, 2026");
    expect(releaseLine(PATCH_RELEASES.find(release => release.id === "pr-42")!)).toBe("PR #42 · merged Nov 3, 2026");
  });

  it("shows no commit hash or ISO date in entry copy", () => {
    expect(displayText("Five players (b27c9e9, 2026-10-16).")).toBe("Five players (Oct 16, 2026).");
    expect(displayText("Held-out seasons (9b53fbb).")).toBe("Held-out seasons.");
    for (const release of PATCH_RELEASES) for (const group of release.groups) for (const entry of group.entries)
      for (const text of [entry.text, ...(entry.bullets ?? [])]) expect(displayText(text), entry.title).not.toMatch(/\b[0-9a-f]{7}\b|\d{4}-\d{2}-\d{2}/);
  });
});
