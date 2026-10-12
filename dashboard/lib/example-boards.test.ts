import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeWorkbenchQuery } from "./workbench-api";
import { exampleRankingCopy, exampleTierCopy, loadExampleBoard } from "./example-boards";
import type { PlayerResearchItem, WorkbenchCatalog, WorkbenchQueryResponse } from "./types";

vi.mock("./workbench-api", () => ({ executeWorkbenchQuery: vi.fn() }));
const catalog = { release_id: "sealed", default_season: "2025-26", default_phase: "regular_season", default_before_date: "2026-04-13", stats_scopes: [{ season: "2024-25", phase: "playoffs", default_before_date: "2025-06-23" }] } as WorkbenchCatalog;
const data = {
  query: { release_id: "sealed", season: "2024-25", phase: "playoffs", before_date: "2025-06-23" },
  items: Array.from({ length: 12 }, (_, index): PlayerResearchItem => ({ player_id: String(index), player_name: `Observed ${index}`, teams: [], stints_count: 1, total_minutes: 2000 - index, games_played: 60, sample_sizes: {}, metrics: { pts_per_game: index ? null : 0 } }))
} as WorkbenchQueryResponse;
beforeEach(() => vi.clearAllMocks());

describe("PC12 D fixed-rule example boards", () => {
  it("selects a bounded minutes order with server league percentiles, independent of arbitrary URL filters", async () => {
    vi.mocked(executeWorkbenchQuery).mockResolvedValue(data);
    await loadExampleBoard(catalog, { name: "x", min_games: "80", sort: "pts", window: "last_10", team_id: "TOR" });
    expect(executeWorkbenchQuery).toHaveBeenCalledWith(expect.objectContaining({ season: "2025-26", phase: "regular_season", before_date: "2026-04-13", release_id: "sealed", sort: [{ field: "min", direction: "desc", nulls_last: true }], sample_filters: { min_games: 1, min_minutes: 1 }, page: { limit: 15 }, window: { kind: "season" } }), { table_percentiles: true });
    const query = vi.mocked(executeWorkbenchQuery).mock.calls[0][0];
    expect(query.name).toBeFalsy();
    expect(query.team_scope?.team_id).toBeFalsy();
  });
  it("honors the explicit release, phase and cutoff aliases and historical catalog cutoff", async () => {
    await loadExampleBoard(catalog, { release_id: "retained", season: "2024-25", phase: "playoffs" });
    expect(executeWorkbenchQuery).toHaveBeenLastCalledWith(expect.objectContaining({ release_id: "retained", before_date: "2025-06-23" }), { table_percentiles: true });
    await loadExampleBoard(catalog, { releaseId: "retained", season: "2024-25", phase: "playoffs", before_date: "2025-05-01" });
    expect(executeWorkbenchQuery).toHaveBeenLastCalledWith(expect.objectContaining({ before_date: "2025-05-01" }), { table_percentiles: true });
  });
  it("copies stable IDs, names, returned order and the original scope without modifying analytical values", () => {
    const before = JSON.stringify(data);
    const copy = exampleRankingCopy(data);
    expect(copy.scope).toMatchObject(data.query);
    expect(copy.entries.map(entry => entry.rank)).toEqual(Array.from({ length: 12 }, (_, index) => index + 1));
    expect(copy.entries[0]).toMatchObject({ player_id: "0", player_name: "Observed 0" });
    copy.entries.reverse();
    expect(JSON.stringify(data)).toBe(before);
  });
  it("partitions every observed player once, leaves partial groups partial, and persists semantic color tokens", () => {
    const copy = exampleTierCopy(data);
    expect(copy.tiers.map(tier => tier.player_ids.length)).toEqual([5, 5, 2]);
    expect(copy.tiers.flatMap(tier => tier.player_ids)).toEqual(data.items.map(player => player.player_id));
    expect(copy.tiers[2]).toMatchObject({ label: "Minutes ranks 11–15", color: "var(--color-category-3)" });
    expect(exampleTierCopy({ ...data, items: [] }).tiers.every(tier => !tier.player_ids.length)).toBe(true);
    expect(copy.description).toContain("Playoffs");
    expect(copy.description).not.toContain("sealed");
  });
});
