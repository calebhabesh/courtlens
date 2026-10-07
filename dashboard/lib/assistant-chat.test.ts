import { describe, expect, it } from "vitest";
import { cellText, compactResult, composerKeyAction, examplePrompts, generalKnowledgeParts, groupThreads, scopeChipLabel } from "./assistant-chat";

const header = (id: string, updated_at: string) => ({ thread_id: id, title: id, created_at: updated_at, updated_at });

describe("AR06 chat helpers", () => {
  it("sends on Enter only, keeping Shift+Enter and IME composition for editing", () => {
    expect(composerKeyAction({ key: "Enter", shiftKey: false })).toBe("send");
    expect(composerKeyAction({ key: "Enter", shiftKey: true })).toBeNull();
    expect(composerKeyAction({ key: "Enter", shiftKey: false, isComposing: true })).toBeNull();
    expect(composerKeyAction({ key: "a", shiftKey: false })).toBeNull();
  });

  it("labels the next-question scope from explicit selections only", () => {
    expect(scopeChipLabel({})).toBe("Default scope");
    expect(scopeChipLabel({ season: "2025-26", phase: "regular_season", window: "last_10", before_date: "2026-01-15" })).toBe("2025-26 · Regular season · Last 10 · before 2026-01-15");
  });

  it("groups threads newest first by local day", () => {
    const now = new Date(2026, 9, 6, 15);
    const groups = groupThreads([header("old", new Date(2026, 8, 1).toISOString()), header("today", new Date(2026, 9, 6, 9).toISOString()), header("week", new Date(2026, 9, 2).toISOString()), header("later", new Date(2026, 9, 6, 11).toISOString())], now);
    expect(groups.map(group => [group.label, group.threads.map(thread => thread.thread_id)])).toEqual([["Today", ["later", "today"]], ["Previous 7 days", ["week"]], ["Older", ["old"]]]);
    expect(groupThreads([], now)).toEqual([]);
  });

  it("splits the general-knowledge label without altering the prose", () => {
    expect(generalKnowledgeParts("General knowledge, not from CourtLens data\nSpacing helps drives.")).toEqual({ label: "General knowledge, not from CourtLens data", body: "Spacing helps drives." });
    expect(generalKnowledgeParts("Spacing helps drives.")).toBeNull();
  });

  it("features a forecast prompt in the empty state", () => {
    expect(examplePrompts.some(example => /forecast/i.test(example.prompt))).toBe(true);
  });

  it("compacts multi-row results to lead columns, ten rows and the true total", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ player_id: String(i), player_name: `P${i}`, ast_per_game: i === 0 ? 0 : i === 1 ? null : i, gp: 60 }));
    const view = compactResult("query", rows);
    expect(view?.kind).toBe("table");
    if (view?.kind !== "table") return;
    expect(view.columns).toEqual(["player name", "ast per game", "gp"]);
    expect(view.rows).toHaveLength(10); expect(view.total).toBe(12);
    // Zero stays zero and an absent value stays unknown.
    expect(cellText(view.rows[0]["ast per game"])).toBe("0"); expect(cellText(view.rows[1]["ast per game"])).toBe("Unknown");
  });

  it("shows a single forecast as facts with estimate, interval, cutoff identity and policy first", () => {
    const view = compactResult("forecast", [{ id: "x", player_name: "Nikola Jokić", policy_id: "ewma-20", issued_at_utc: "2026-01-14T12:00:00Z", target_game_date: "2026-01-16", point_estimate: 27.4, interval_lower: 19, interval_upper: 35.2, features_hash: "a", features_json: {} }]);
    expect(view?.kind).toBe("facts");
    if (view?.kind !== "facts") return;
    expect(view.entries.map(([key]) => key)).toEqual(["player name", "point estimate", "interval lower", "interval upper", "target game date", "issued at utc", "policy id"]);
    expect(view.hidden).toBeGreaterThan(0);
  });

  it("skips the leading summary row of a distribution and returns nothing for empty results", () => {
    const view = compactResult("distribution", [{ summary: { mean: 20 } }, { game_date: "2026-01-01", value: 18 }, { game_date: "2026-01-03", value: 22 }]);
    expect(view).toEqual({ kind: "table", columns: ["game date", "value"], rows: [{ "game date": "2026-01-01", value: 18 }, { "game date": "2026-01-03", value: 22 }], total: 2 });
    expect(compactResult("query", [])).toBeNull();
  });
});
