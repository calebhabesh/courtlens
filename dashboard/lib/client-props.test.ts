import { describe, expect, it } from "vitest";
import { careerTableColumns, careerTableData, pickMetricKeys, playerBioData, statsTableData, tableRow } from "./client-props";
import { ORDERED_COUNTING_MODES, ORDERED_PRESETS } from "./stats-presets";
import { normalizedColumn } from "./stats-query";
import type { PlayerBio, PlayerCareerResponse, PlayerResearchItem, PlayerResearchResponse } from "./types";

const row = (id: string, overrides: Partial<PlayerResearchItem> = {}): PlayerResearchItem => ({
  player_id: id, player_name: `Player ${id}`, teams: ["BOS"], stints_count: 1, games_played: 10, total_minutes: 300,
  portrait_url: null, position: "PG", table_qualified: true,
  metrics: { pts: 200, pts_per_game: 20, ts_pct: 0.6, dpm: null, fg3a: 40 },
  sample_sizes: { pts: 10, ts_pct: 10, fg3a: 10 },
  percentiles: { pts: 90, ts_pct: 70 }, cohort_sample_sizes: { pts: 400, ts_pct: 380 },
  table_percentiles: { pts_per_game: 88, ts_pct: 61, fg3a: null, dpm: null },
  table_cohort_sample_sizes: { pts_per_game: 300, ts_pct: 290, fg3a: 300, dpm: 0 },
  impact_support: { rapm: { qualified: true } as never, dpm: { qualified: false } as never },
  ...overrides
});

describe("pickMetricKeys", () => {
  it("copies only the named keys, keeping nulls and leaving absent keys absent", () => {
    expect(pickMetricKeys({ a: 1, b: null, c: 3 }, new Set(["b", "c", "z"]))).toEqual({ b: null, c: 3 });
  });
  it("leaves a null or missing map as it was", () => {
    expect(pickMetricKeys(null, new Set(["a"]))).toBeNull();
    expect(pickMetricKeys(undefined, new Set(["a"]))).toBeUndefined();
  });
});

describe("statsTableData", () => {
  const data = { items: [row("1"), row("2", { table_percentiles: null })], cohort: { eligible_players: 2 }, next_cursor: "x" } as unknown as PlayerResearchResponse;
  const trimmed = statsTableData(data, ["pts_per_game", "ts_pct", "dpm"]);

  it("keeps rows, their order, whole metrics and every other field", () => {
    expect(trimmed.items.map(item => item.player_id)).toEqual(["1", "2"]);
    expect(trimmed.items[0].metrics).toEqual(data.items[0].metrics);
    expect(trimmed.items[0].teams).toEqual(["BOS"]);
    expect(trimmed.cohort).toBe(data.cohort);
    expect(trimmed.next_cursor).toBe("x");
  });
  it("narrows ranks to the view's columns and sample sizes to the drawer's points", () => {
    expect(trimmed.items[0].table_percentiles).toEqual({ pts_per_game: 88, ts_pct: 61, dpm: null });
    expect(trimmed.items[0].table_cohort_sample_sizes).toEqual({ pts_per_game: 300, ts_pct: 290, dpm: 0 });
    expect(trimmed.items[0].impact_support).toEqual({ dpm: { qualified: false } });
    expect(trimmed.items[0].sample_sizes).toEqual({ pts: 10 });
    expect(trimmed.items[1].table_percentiles).toBeNull();
  });
  it("drops the analytical percentiles no page reads", () => {
    expect("percentiles" in trimmed.items[0]).toBe(false);
    expect("cohort_sample_sizes" in trimmed.items[0]).toBe(false);
  });
  it("does not change the response it was given", () => {
    expect(data.items[0].percentiles).toEqual({ pts: 90, ts_pct: 70 });
    expect(data.items[0].sample_sizes).toEqual({ pts: 10, ts_pct: 10, fg3a: 10 });
  });
});

describe("careerTableData", () => {
  it("keeps every column of every view in every counting mode", () => {
    const keys = careerTableColumns();
    for (const preset of ORDERED_PRESETS) for (const mode of ORDERED_COUNTING_MODES) for (const column of preset.columns) {
      expect(keys.has(normalizedColumn(column, mode.id).key)).toBe(true);
    }
  });
  it("narrows each season and the career row, and keeps empty seasons", () => {
    const career: PlayerCareerResponse = { player_id: "1", release_id: "r", phase: "regular_season",
      seasons: [{ season: "2024-25", item: row("1", { table_percentiles: { pts_per_game: 50, not_a_column: 1 } }) }, { season: "2023-24", item: null }],
      career: row("1") };
    const trimmed = careerTableData(career);
    expect(trimmed.seasons.map(entry => entry.season)).toEqual(["2024-25", "2023-24"]);
    expect(trimmed.seasons[0].item?.table_percentiles).toEqual({ pts_per_game: 50 });
    expect(trimmed.seasons[0].item?.sample_sizes).toEqual({});
    expect(trimmed.seasons[0].item?.metrics).toEqual(row("1").metrics);
    expect(trimmed.seasons[1].item).toBeNull();
    expect(trimmed.career?.metrics).toEqual(row("1").metrics);
    expect(tableRow(row("1"), new Set(), new Set()).table_percentiles).toEqual({});
  });
});

describe("playerBioData", () => {
  it("keeps only the career game highs and the rest of the bio as sent", () => {
    const bio = { player_id: "1", reference: { source: "BBR", game_highs: [
      { scope: "season", season: "2003-04", phase: "regular_season", values: {} },
      { scope: "career", season: null, phase: "regular_season", values: { pts: { value: "61" } } }
    ], awards: [{ season: "2012-13" }] } } as unknown as PlayerBio;
    const trimmed = playerBioData(bio);
    expect(trimmed.reference?.game_highs).toEqual([bio.reference!.game_highs![1]]);
    expect(trimmed.reference?.awards).toBe(bio.reference!.awards);
    expect(bio.reference!.game_highs).toHaveLength(2);
  });
  it("returns a bio without a reference or highs unchanged", () => {
    const bare = { player_id: "1", reference: null } as unknown as PlayerBio;
    expect(playerBioData(bare)).toBe(bare);
  });
});
