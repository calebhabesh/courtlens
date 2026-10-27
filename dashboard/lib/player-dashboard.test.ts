import { describe, expect, it } from "vitest";
import {
  QUERY_KEYS, cellValue, factorDots, formatCell, formatDifference, panelsParam, parsePanels, rapmYears, readDashboardState,
  findPanel, samePanel, surname, toggleVersus, versusAfterRemove, versusCell, versusLabels, type CellDef,
} from "./player-dashboard";
import type { PlayerDashboardFeeds, PlayerResearchItem, WorkbenchCatalog } from "./types";

const catalog = { seasons: ["2023-24", "2024-25", "2025-26"], default_season: "2025-26" } as unknown as WorkbenchCatalog;
const player = (metrics: Record<string, number | null>, percentiles: Record<string, number | null> = {}) =>
  ({ player_id: "1", player_name: "Victor Wembanyama", teams: ["SAS"], metrics, table_qualified: true, table_percentiles: percentiles }) as unknown as PlayerResearchItem;

describe("panel URL state", () => {
  it("round-trips panels with their season, phase and flags", () => {
    const panels = parsePanels("1641705.2024-25.rs_203999.2025-26.po.bg", "2025-26");
    expect(panels).toEqual([
      { playerId: "1641705", season: "2024-25", phase: "regular_season", advanced: true, rate: "per_36" },
      { playerId: "203999", season: "2025-26", phase: "playoffs", advanced: false, rate: "per_game" },
    ]);
    expect(panelsParam(panels)).toBe("1641705.2024-25.rs_203999.2025-26.po.bg");
    expect(new URLSearchParams({ p: panelsParam(panels)! }).toString()).toBe("p=1641705.2024-25.rs_203999.2025-26.po.bg");
  });

  it("drops malformed entries and caps the panel count", () => {
    expect(parsePanels("abc.2024-25_1.bad", "2025-26")).toEqual([{ playerId: "1", season: "2025-26", phase: "regular_season", advanced: true, rate: "per_36" }]);
    expect(parsePanels("1_2_3_4_5", "2025-26")).toHaveLength(4);
  });

  it("keeps one card per player, season and phase", () => {
    const panels = parsePanels("1.2025-26.rs_2.2025-26.rs_1.2025-26.rs.g_1.2024-25.rs_1.2025-26.po_3_4", "2025-26");
    expect(panels.map(panel => `${panel.playerId}.${panel.season}.${panel.phase}`)).toEqual(["1.2025-26.regular_season", "2.2025-26.regular_season", "1.2024-25.regular_season", "1.2025-26.playoffs"]);
    expect(samePanel(panels[0], { playerId: "1", season: "2025-26", phase: "regular_season" })).toBe(true);
    expect(findPanel(panels, { playerId: "1", season: "2024-25", phase: "regular_season" })).toBe(2);
    expect(findPanel(panels, panels[2], 2)).toBe(-1);
  });

  it("opens on the latest season with a month of regular-season games", () => {
    const opening = { ...catalog, seasons: ["2025-26", "2026-27"], default_season: "2026-27", stats_scopes: [
      { season: "2025-26", phase: "regular_season", coverage_start: "2025-10-21", coverage_end: "2026-04-12" },
      { season: "2026-27", phase: "regular_season", coverage_start: "2026-10-20", coverage_end: "2026-10-20" },
    ] } as unknown as WorkbenchCatalog;
    expect(readDashboardState(new URLSearchParams(), opening).season).toBe("2025-26");
    expect(readDashboardState(new URLSearchParams("season=2026-27"), opening).season).toBe("2026-27");
  });

  it("reads the season, team and a valid head-to-head pair", () => {
    const state = readDashboardState(new URLSearchParams("season=2024-25&teamId=SAS&p=1_2&vs=1.0"), catalog);
    expect(state).toMatchObject({ season: "2024-25", team: "SAS", versus: [1, 0] });
    expect(readDashboardState(new URLSearchParams("season=1999-00&p=1&vs=0.3"), catalog)).toMatchObject({ season: "2025-26", versus: null });
  });
});

describe("head-to-head selection", () => {
  it("pairs the first two swaps and replaces the older pick on a third", () => {
    let step = toggleVersus(null, null, 0);
    expect(step).toEqual({ versus: null, pending: 0 });
    step = toggleVersus(step.versus, step.pending, 2);
    expect(step).toEqual({ versus: [0, 2], pending: null });
    expect(toggleVersus(step.versus, step.pending, 1)).toEqual({ versus: [2, 1], pending: null });
    expect(toggleVersus([0, 2], null, 2)).toEqual({ versus: null, pending: 0 });
  });

  it("closing a panel shifts the pair or ends it", () => {
    expect(versusAfterRemove([1, 3], 0)).toEqual([0, 2]);
    expect(versusAfterRemove([1, 3], 3)).toBeNull();
  });

  it("credits the leader, lower winning where lower is better", () => {
    expect(versusCell(5, 3)).toEqual({ difference: 2, leader: "a" });
    expect(versusCell(0.1, 0.2, true)).toEqual({ difference: expect.closeTo(-0.1), leader: "a" });
    expect(versusCell(1, 1)).toEqual({ difference: 0, leader: null });
    expect(versusCell(null, 1)).toEqual({ difference: null, leader: null });
  });

  it("formats a margin like its cell", () => {
    expect(formatDifference(-0.043, "signedPct1")).toBe("+4.3%");
    expect(formatDifference(1035, "thousands")).toBe("+1.0k");
    expect(formatDifference(-1.25, "signed1")).toBe("+1.3");
  });
});

describe("cells", () => {
  it("formats Databallr's value styles", () => {
    expect(formatCell(4.04, "signed1")).toBe("+4.0");
    expect(formatCell(-0.5, "signed1")).toBe("−0.5");
    expect(formatCell(1934, "thousands")).toBe("1.9k");
    expect(formatCell(0.0431, "signedPct1")).toBe("+4.3%");
    expect(formatCell(0.32, "rate2")).toBe(".32");
    expect(formatCell(null, "num1")).toBe("—");
  });

  it("gives one dot per point of impact, between one and five", () => {
    expect([factorDots(0.1), factorDots(-1.8), factorDots(4.3), factorDots(9), factorDots(null)]).toEqual([1, 2, 4, 5, 0]);
  });

  it("reads query and feed cells, flipping undirected low-is-good percentiles", () => {
    const foul: CellDef = { id: "foul", label: "FOUL%", key: "pbp_foul_frequency", format: "pct1", lower: true, invert: true, tip: "" };
    expect(cellValue(foul, "per_36", player({ pbp_foul_frequency: 0.03 }, { pbp_foul_frequency: 80 }), null)).toMatchObject({ value: 0.03, percentile: 20 });
    const feeds = { player: { per_36: { potential_ast: 9.2 }, per_game: { potential_ast: 7 }, percentiles: { per_36: { potential_ast: 85 }, per_game: { potential_ast: 70 } } } } as unknown as PlayerDashboardFeeds;
    const potast: CellDef = { id: "potast", label: "POTAST", key: { per_36: "feed:per_36:potential_ast", per_game: "feed:per_game:potential_ast" }, format: "num1", tip: "" };
    expect(cellValue(potast, "per_game", null, { ...feeds, cohort: { qualified_players: 380, rule: "500+ tracked minutes" } })).toEqual({ value: 7, percentile: 70, cohort: "380 players with 500+ tracked minutes" });
    expect(cellValue(potast, "per_36", null, null)).toMatchObject({ value: null, percentile: null });
  });

  it("asks the Stats query for every panel column and no feed key", () => {
    expect(QUERY_KEYS).toEqual(expect.arrayContaining(["dpm", "rapm_3y", "rapm", "o_ts", "ast_per_36", "ast_per_game", "pbp_foul_frequency"]));
    expect(QUERY_KEYS.some(key => key.startsWith("feed:"))).toBe(false);
  });

  it("picks the longest RAPM window every player has", () => {
    expect(rapmYears(player({ rapm_3y: 1, rapm_2y: 1 }))).toBe(3);
    expect(rapmYears(player({ rapm_3y: 1, rapm_2y: 1 }), player({ rapm_2y: 2 }))).toBe(2);
    expect(rapmYears(player({}))).toBe(1);
  });

  it("names a player by surname, skipping suffixes", () => {
    expect([surname("Victor Wembanyama"), surname("Jaren Jackson Jr."), surname("Nenê")]).toEqual(["Wembanyama", "Jackson", "Nenê"]);
  });
});

describe("head-to-head labels", () => {
  it("adds the season, then the phase, when both sides share a surname", () => {
    const tatum = (season: string, phase: "regular_season" | "playoffs" = "regular_season") => ({ name: "Jayson Tatum", season, phase });
    expect(versusLabels({ name: "Jaylen Brown", season: "2025-26", phase: "regular_season" }, tatum("2025-26"))).toEqual({ a: "Brown", b: "Tatum" });
    expect(versusLabels(tatum("2024-25"), tatum("2025-26"))).toEqual({ a: "Tatum 24-25", b: "Tatum 25-26" });
    expect(versusLabels(tatum("2025-26"), tatum("2025-26", "playoffs"))).toEqual({ a: "Tatum RS", b: "Tatum PO" });
  });
});
