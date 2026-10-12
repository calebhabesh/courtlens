import { describe, expect, it } from "vitest";
import { category, categoryLabels, parseSort, rankOf, shapeItems, signed, sortTeams, type ShapePlayer, type ShapeTeam } from "./roster-shapes";

const player = (id: string, vor: number | null, fit: ShapePlayer["fit"], primary: number | null): ShapePlayer => ({
  player_id: id, player_name: `P ${id}`, listed_position: null, value: null, value_qualified: false, value_percentile: null,
  reference_minutes: null, reference_games: null, vor, fit, previous_teams: [], unknown_reasons: [],
  archetype: primary === null ? null : { season: "2025-26", minutes: 1, games: 1, small_sample: false, primary, primary_name: "x", membership: [] }
});
const team = (tricode: string, name: string, total: number, returning: number | null): ShapeTeam => ({
  team_id: tricode, team_tricode: tricode, team_name: name, players: 0, sized_players: 0, below_replacement_players: 0, unknown_players: 0,
  total_vor: total, returning_share: returning, archetype_mix: [], roster: []
});

describe("roster shapes", () => {
  it("keeps unknown value unknown and below replacement as a known zero area", () => {
    const items = shapeItems({ ...team("DEN", "Denver", 0, null), roster: [player("1", 3, "returning", 4), player("2", -0.4, "new", 0), player("3", null, "unknown", null)] });
    expect(items.map(i => [i.value, i.category, i.fit])).toEqual([[3, 5, "observed"], [0, 1, "projected"], [null, null, "unknown"]]);
  });
  it("maps only the six fitted clusters to categorical tokens", () => {
    expect([category(0), category(5), category(6), category(null)]).toEqual([1, 6, null, null]);
    expect(categoryLabels([{ cluster: 4, name: "Interior hub", short: "hub", description: "", color_token: null }])[5]).toBe("Interior hub");
  });
  it("sorts Fullest, Best fit (unknown share last) and A–Z with stable name ties", () => {
    const teams = [team("B", "Bravo", 5, null), team("A", "Alpha", 5, 0.5), team("C", "Charlie", 9, 0.9)];
    expect(sortTeams(teams, "fullest").map(t => t.team_tricode)).toEqual(["C", "A", "B"]);
    expect(sortTeams(teams, "fit").map(t => t.team_tricode)).toEqual(["C", "A", "B"]);
    expect(sortTeams(teams, "az").map(t => t.team_tricode)).toEqual(["A", "B", "C"]);
    expect(rankOf(teams, "B")).toBe(3);
    expect([parseSort(null), parseSort("fit"), parseSort("nope")]).toEqual(["fullest", "fit", "fullest"]);
  });
  it("never shows a negative zero", () => {
    expect([signed(-0.04), signed(0.04), signed(-0.06), signed(null)]).toEqual(["0.0", "0.0", "−0.1", "—"]);
  });
});
