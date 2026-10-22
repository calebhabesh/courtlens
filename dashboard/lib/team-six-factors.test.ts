import { describe, expect, it } from "vitest";
import { ALL_COLUMNS, TEAM_VIEWS, columnRanks, formatValue, sortTeams, standingGroup, viewColumns, withStandings, type SixFactorTeam } from "./team-six-factors";

const rates = { ts_pct: 0.58, tov_per_100: 13, orb_pct: 0.26, ftr: 0.26, fg3a_per_100: 36, fg3_pct: 0.36, opp_ts_pct: 0.57, opp_tov_per_100: 14, drb_pct: 0.74, opp_ftr: 0.25, opp_fg3a_per_100: 35, opp_fg3_pct: 0.35 };
const team = (id: string, net: number | null, extra: Partial<SixFactorTeam> = {}): SixFactorTeam => ({
  team_id: id, tricode: id, name: `Team ${id}`, games_played: 10, wins: 6, losses: 4, possessions: 1000, opp_possessions: 1000,
  points: 1150, opp_points: 1100, ortg: 115, drtg: 110, net, off: 2, o_ts: 1, o_tov: 0.5, o_orb: 0.5, def: 3, d_ts: 2, d_tov: 0.5, d_drb: 0.5,
  net_eff: 3, net_poss: 2, off_luck: 0, def_luck: 0, league_rating: 113, rates,
  sos: 0.5, adj_net: net == null ? null : net + 0.5, expected_wins: 5.5, win_luck: 0.5, close_wins: 2, close_losses: 1,
  standings: { wins: 6, losses: 4, last10_wins: 6, last10_losses: 4, streak: 2 }, trend: [], ...extra,
});
const column = (key: string) => ALL_COLUMNS.find(entry => entry.key === key)!;

describe("team six factors", () => {
  it("matches Databallr's overall column order", () => {
    expect(viewColumns("overall").map(entry => entry.label)).toEqual(["ORTG", "DRTG", "Net", "OFF", "oTS", "oTOV", "ORB", "DEF", "dTS", "dTOV", "DRB", "NetEff", "NetPoss"]);
    expect(TEAM_VIEWS.overall.map(group => group.label)).toEqual(["Ratings", "Offense", "Defense", "Net"]);
  });

  it("ranks best first, lower DRTG first, ties sharing a rank and unknowns unranked", () => {
    const teams = [team("A", 5, { drtg: 108 }), team("B", 5, { drtg: 112 }), team("C", -2, { drtg: 104 }), team("D", null)];
    const net = columnRanks(teams, column("net"), "per_100");
    expect([net.get("A"), net.get("B"), net.get("C"), net.has("D")]).toEqual([1, 1, 3, false]);
    expect(columnRanks(teams, column("drtg"), "per_100").get("C")).toBe(1);
  });

  it("seeds by win percentage with ties broken by net, and counts games back from the leader", () => {
    const standing = (wins: number, losses: number) => ({ wins, losses, last10_wins: 5, last10_losses: 5, streak: -1 });
    const seeded = withStandings([team("A", 1, { standings: standing(40, 20) }), team("B", 4, { standings: standing(40, 20) }), team("C", 9, { standings: standing(35, 26) })]);
    expect(seeded.map(t => [t.team_id, t.seed, t.games_back])).toEqual([["A", 2, 0], ["B", 1, 0], ["C", 3, 5.5]]);
    expect(column("streak").display!(seeded[0])).toBe("L1");
    expect(column("win_pct").display!(seeded[2])).toBe("35–26");
    expect(TEAM_VIEWS.standings.map(group => group.label)).toEqual(["Standings", "Schedule", "Expected"]);
  });

  it("keeps unknown values last in both directions", () => {
    const teams = [team("A", null), team("B", 1), team("C", 3)];
    expect(sortTeams(teams, column("net"), "desc", "per_100").map(t => t.team_id)).toEqual(["C", "B", "A"]);
    expect(sortTeams(teams, column("net"), "asc", "per_100").map(t => t.team_id)).toEqual(["B", "C", "A"]);
  });

  it("turns per-100 terms into points over the span for Totals", () => {
    const t = team("A", 5, { possessions: 2000, opp_possessions: 1800 });
    expect(column("o_ts").value(t, "totals")).toBe(20);
    expect(column("d_ts").value(t, "totals")).toBe(36);
    expect(column("net_eff").value(t, "totals")).toBe(56);
    expect(column("net").value(t, "totals")).toBe(50);
    expect(column("ortg").value(t, "totals")).toBe(1150);
  });

  it("formats signs without a negative zero and shows unknowns as a dash", () => {
    expect(formatValue(2.94, "signed", "per_100")).toBe("+2.9");
    expect(formatValue(-0.04, "signed", "per_100")).toBe("0.0");
    expect(formatValue(-12.6, "signed", "totals")).toBe("-13");
    expect(formatValue(0.5814, "pct", "per_100")).toBe("58.1%");
    expect(formatValue(0.2614, "ratio", "totals")).toBe("0.261");
    expect(formatValue(null, "signed", "per_100")).toBe("—");
  });
});

describe("seasons served as totals", () => {
  it("seed a season before conferences by its division", () => {
    expect(standingGroup({ conference: "Eastern", division: "Atlantic" })).toMatchObject({ label: "Eastern Conference", short: "East" });
    expect(standingGroup({ conference: null, division: "Western" })).toMatchObject({ label: "Western Division", short: "Western Division" });
    expect(standingGroup({ conference: null, division: null })).toBeNull();
  });

  it("show unknown last ten, streak, close games and totals as a dash, never zero", () => {
    const old = team("BOS", 4, { possessions: null, close_wins: null, close_losses: null, o_ts: null,
      standings: { wins: 54, losses: 26, last10_wins: null, last10_losses: null, streak: null } });
    expect(column("last10").display!(old)).toBe("—");
    expect(column("streak").display!(old)).toBe("—");
    expect(column("close").display!(old)).toBe("—");
    expect(column("close").value(old, "per_100")).toBeNull();
    expect(column("win_pct").display!(old)).toBe("54–26");
    // A relative term over unknown possessions has no total.
    expect(column("o_ts").value(team("X", 1, { possessions: null }), "totals")).toBeNull();
  });
});
