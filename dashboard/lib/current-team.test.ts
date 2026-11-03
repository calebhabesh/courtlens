import { describe, expect, it } from "vitest";
import { latestStatsSeason, teamMove } from "./current-team";
import type { PlayerResearchItem, WorkbenchCatalog } from "./types";

const row = (teams: string[], now: string | null): PlayerResearchItem => ({
  player_id: "202695", player_name: "Kawhi Leonard", teams, stints_count: teams.length, games_played: 65,
  total_minutes: 2085, metrics: {}, sample_sizes: {},
  current_team: now ? { team_id: "1610612761", team_tricode: now, listing_season: "2026-27" } : null,
} as PlayerResearchItem);

describe("teamMove", () => {
  it("flags an active player listed with a team he has not played for in the latest season", () => {
    const move = teamMove(row(["LAC"], "TOR"), "2025-26", "2025-26");
    expect(move?.tricode).toBe("TOR");
    expect(move?.title).toBe("Played 2025-26 for the LA Clippers. Now listed with the Toronto Raptors (NBA player index).");
  });

  it("dates the index refresh and the known trade without changing row teams", () => {
    const item = row(["LAC"], "TOR");
    item.current_team = { team_id: "1610612761", team_tricode: "TOR", listing_season: "2026-27", index_refreshed_at: "2026-10-01T12:00:00Z", trade_date: "2026-09-14" };
    expect(teamMove(item, "2025-26", "2025-26")?.title).toBe("Played 2025-26 for the LA Clippers. Now listed with the Toronto Raptors (NBA player index). Checked Oct 1, 2026. Traded Sep 14, 2026 (Basketball-Reference).");
    expect(item.teams).toEqual(["LAC"]);
  });

  it("flags a player on no roster today, matching the free-agency tracker (Agbaji: cut by NYK in camp)", () => {
    const item = row(["TOR"], null);
    item.current_status = { state: "free_agent", source: "Wikipedia", move: { kind: "cut", team_tricode: "NYK" } };
    const move = teamMove(item, "2025-26", "2025-26");
    expect(move).toMatchObject({ kind: "free_agent", tricode: null, label: "Free agent", spoken: "now a free agent" });
    expect(move?.title).toBe("Played 2025-26 for the Toronto Raptors. Now on no NBA roster: cut by the New York Knicks in training camp. Source: Wikipedia.");
    expect(teamMove(item, "2024-25", "2025-26")).toBeNull();
  });

  it("names the club abroad and the retirement date", () => {
    const abroad = row(["WAS"], null);
    abroad.current_status = { state: "abroad", move: { kind: "abroad", date: "2026-09-30", club: "Shanghai Sharks", country: "China" } };
    expect(teamMove(abroad, "2025-26", "2025-26")?.title).toBe("Played 2025-26 for the Washington Wizards. Now playing outside the NBA: signed with Shanghai Sharks (China) Sep 30, 2026.");
    const retired = row(["WAS"], null);
    retired.current_status = { state: "retired", move: { kind: "retired", date: "2026-08-12" } };
    expect(teamMove(retired, "2025-26", "2025-26")?.label).toBe("Retired");
  });

  it("stays quiet when the listing matches a team on the row, including a mid-season trade", () => {
    expect(teamMove(row(["DEN"], "DEN"), "2025-26", "2025-26")).toBeNull();
    expect(teamMove(row(["LAC", "TOR"], "TOR"), "2025-26", "2025-26")).toBeNull();
  });

  it("stays quiet for older seasons, season ranges, players without a listing and rows without a team", () => {
    expect(teamMove(row(["LAC"], "TOR"), "2019-20", "2025-26")).toBeNull();
    expect(teamMove(row(["LAC"], "TOR"), null, "2025-26")).toBeNull();
    expect(teamMove(row(["DAL"], null), "2025-26", "2025-26")).toBeNull();
    expect(teamMove(row([], "TOR"), "2025-26", "2025-26")).toBeNull();
  });
});

describe("latestStatsSeason", () => {
  it("is the newest Stats scope, falling back to the default season", () => {
    const scopes = ["2024-25", "2025-26", "2023-24"].map(season => ({ season, phase: "regular_season", coverage_start: "", coverage_end: "", default_before_date: "" }));
    expect(latestStatsSeason({ stats_scopes: scopes, default_season: "2024-25" } as WorkbenchCatalog)).toBe("2025-26");
    expect(latestStatsSeason({ default_season: "2024-25" } as WorkbenchCatalog)).toBe("2024-25");
    expect(latestStatsSeason(null)).toBeNull();
  });
});
