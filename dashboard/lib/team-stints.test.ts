import { beforeEach, describe, expect, it, vi } from "vitest";
import { executeWorkbenchQuery } from "./workbench-api";
import { getTeamStints, TEAM_IMPACT_COLUMNS, teamStintQuery } from "./team-stints";
import type { PlayerResearchItem, QuerySpec, WorkbenchQueryResponse } from "./types";

vi.mock("./workbench-api", () => ({ executeWorkbenchQuery: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

const base: QuerySpec = {
  release_id: "sealed", season: "2021-22", phase: "regular_season", before_date: "2022-04-11",
  window: { kind: "last_10" }, name: "harden", team_scope: { team_id: "MIL" },
  sample_filters: { min_games: 40 }, predicates: { op: "and", conditions: [] } as unknown as QuerySpec["predicates"],
  view_state: { columns: ["dpm"] }, darko_manifest_sha256: "d", sort: [{ field: "dpm", direction: "desc" }], page: { limit: 50 }
};
const row = (team: string): PlayerResearchItem => ({
  player_id: "201935", player_name: "James Harden", teams: [team], stints_count: 1, games_played: 44, total_minutes: 1627,
  sample_sizes: {}, metrics: { pts_per_game: 22.5, dpm: 3.99, on_ball_pct: 0.3, rapm: 1.2, impact_rts: 0.057, ctov_pct: 0.1, on_net_rating: 3.6 },
  table_percentiles: { pts_per_game: 93, dpm: 97, impact_rts: 89 }, table_qualified: true
});

describe("split-season team rows", () => {
  it("keeps the scope, filters to one team and drops display filters", () => {
    expect(teamStintQuery(base, "BKN")).toEqual({
      release_id: "sealed", season: "2021-22", phase: "regular_season", before_date: "2022-04-11",
      window: { kind: "last_10" }, team_scope: { team_id: "BKN" },
      sort: [{ field: "pts_per_game", direction: "desc" }], page: { limit: 1 }
    });
  });

  it("asks for the per-team impact columns when the impact bundle is known", () => {
    const query = teamStintQuery(base, "LAC", "manifest");
    expect(query.impact_manifest_sha256).toBe("manifest");
    expect(query.view_state?.columns).toEqual(TEAM_IMPACT_COLUMNS);
    expect(TEAM_IMPACT_COLUMNS).toEqual(expect.arrayContaining(["impact_rts", "ctov_pct", "rim_ast_per_game", "on_net_rating"]));
    expect(TEAM_IMPACT_COLUMNS).not.toEqual(expect.arrayContaining(["rapm"]));
  });

  it("reads one league-ranked row per team and blanks season-only ratings", async () => {
    vi.mocked(executeWorkbenchQuery).mockImplementation(async query => ({ items: [row(query.team_scope!.team_id!)] }) as unknown as WorkbenchQueryResponse);
    const rows = await getTeamStints(base, "201935", ["PHI", "BKN", "PHI"]);
    expect(executeWorkbenchQuery).toHaveBeenCalledTimes(2);
    expect(vi.mocked(executeWorkbenchQuery).mock.calls[0][1]).toEqual({ player_ids: ["201935"], table_percentiles: true });
    expect(rows.map(entry => entry.teams[0])).toEqual(["BKN", "PHI"]);
    expect(rows[0].metrics).toEqual({ pts_per_game: 22.5, dpm: null, on_ball_pct: null, rapm: null, impact_rts: 0.057, ctov_pct: 0.1, on_net_rating: 3.6 });
    expect(rows[0].table_percentiles).toEqual({ pts_per_game: 93, dpm: null, impact_rts: 89 });
  });
});
