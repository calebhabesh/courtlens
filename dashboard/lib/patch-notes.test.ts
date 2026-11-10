import { describe, expect, it } from "vitest";
import { PATCH_RELEASES, dateRange, monthRange, patchEntries, shortDate } from "./patch-notes";

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
  });

  it("shows visitors plain copy: no commit hash, ISO date or repository wording (RD07 round 4)", () => {
    for (const entry of patchEntries()) for (const text of [entry.title, entry.text])
      expect(text, entry.title).not.toMatch(/\b[0-9a-f]{7}\b|\d{4}-\d{2}-\d{2}|\b(commit|branch|merged?|PR #|lint|progress log|repository)\b/i);
    for (const release of PATCH_RELEASES) expect(`${release.title} ${release.summary}`, release.id).not.toMatch(/\b(commit|branch|merged?|PR #|lint|repository)\b/i);
  });

  it("numbers releases in merge order (RD07): v1.0 first", () => {
    expect(PATCH_RELEASES.map(release => release.number)).toEqual(PATCH_RELEASES.map((_, index) => `v1.${PATCH_RELEASES.length - 1 - index}`));
    expect(patchEntries()).toHaveLength(PATCH_RELEASES.reduce((sum, release) => sum + release.groups.reduce((n, group) => n + group.entries.length, 0), 0));
  });

  it("writes release months as Databallr does", () => {
    expect(monthRange({ from: "2026-11-04", to: "2026-11-08" })).toBe("November 2026");
    expect(monthRange({ from: "2026-10-14", to: "2026-11-03" })).toBe("Oct–Nov 2026");
    expect(monthRange({ from: "2026-12-20", to: "2027-01-03" })).toBe("Dec 2026–Jan 2027");
  });
});
