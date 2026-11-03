import { describe, expect, it } from "vitest";
import {
  bookYears, centsMoney, dollars, groupTotals, lineStatus, money, nextOption, payrollSlices, smallVsBig, thresholdLines, timelineMarks, yearRoster,
  type ContractPlayer, type TeamContracts, type Thresholds,
} from "./contracts";

const SEASONS = ["2026-27", "2027-28", "2028-29", "2029-30"];
const player = (id: string, cents: string | null, group: ContractPlayer["position_group"], later: (string | null)[] = [], options: (ContractPlayer["seasons"][number]["option"])[] = [], extra: Partial<ContractPlayer> = {}): ContractPlayer => ({
  player_id: id, name: `Player ${id}`, on_index_roster: true, listed_position: group === "unlisted" ? null : group, position_group: group,
  current_salary_cents: cents, unknown_reason: cents === null ? "salary_blank_in_source" : null, remaining_guaranteed_cents: null,
  seasons: SEASONS.map((season, i) => ({ season, salary_cents: i === 0 ? cents : later[i - 1] ?? null, option: options[i] ?? null })),
  source_url: null, source_locator: null, reference: null, ...extra,
});
const book = (players: ContractPlayer[]) => ({ seasons: SEASONS, players } as unknown as TeamContracts);

describe("contracts money", () => {
  it("keeps unknown distinct from an observed zero", () => {
    expect(dollars(null)).toBeNull(); expect(dollars("0")).toBe(0); expect(centsMoney(null)).toBe("—");
    expect(money(0)).toBe("$0"); expect(money(5903311400 / 100)).toBe("$59.0M"); expect(money(-1500000)).toBe("−$1.5M");
  });
});

describe("book years", () => {
  const data = book([player("1", "1000000000", "G", ["1100000000"]), player("2", null, "F")]);
  it("offers the current season and later seasons with a listed salary only", () => {
    expect(bookYears(data)).toEqual(["2026-27", "2027-28"]);
  });
  it("keeps every roster player now and only listed players later", () => {
    expect(yearRoster(data, "2026-27").map(p => p.player_id)).toEqual(["1", "2"]);
    expect(yearRoster(data, "2027-28").map(p => p.player_id)).toEqual(["1"]);
  });
});

describe("apron status", () => {
  const lines = thresholdLines({ cap_cents: "16496100000", tax_cents: "20042800000", first_apron_cents: "20901500000", second_apron_cents: "22168600000" } as Thresholds);
  it("reads Databallr's below/above and distance on known salary", () => {
    expect(lines.map(l => l.label)).toEqual(["Cap", "Tax", "1st Apron", "2nd Apron"]);
    expect(lineStatus(202_546_651, lines[2])).toEqual({ below: true, label: "Below 1st Apron", by: 6_468_349 });
    expect(lineStatus(230_000_000, lines[3])).toMatchObject({ below: false, label: "Above 2nd Apron" });
    expect(thresholdLines(null)).toEqual([]);
  });
});

describe("payroll slices", () => {
  it("orders by position then salary and leaves unknown salaries out", () => {
    const slices = payrollSlices([player("1", "100", "F"), player("2", "300", "G"), player("3", null, "G"), player("4", "200", "F")], "2026-27", "2026-27");
    expect(slices.map(s => s.player.player_id)).toEqual(["2", "4", "1"]);
    expect(groupTotals(slices)).toEqual([{ group: "G", value: 3, players: 1 }, { group: "F", value: 3, players: 2 }]);
  });
});

describe("small vs big", () => {
  const roster = [
    player("1", "4000000000", "F", [], [], { darko_value_dollars: 50_000_000 }),
    player("2", "300000000", "G", [], [], { darko_value_dollars: 20_000_000 }),
    player("3", "400000000", "C", [], [], { darko_value_dollars: null }),
    player("4", null, "G", [], [], { darko_value_dollars: 9_000_000 }),
  ];
  it("splits reported salaries at the threshold; unmapped players count as paid, not as value", () => {
    const { small, big, all } = smallVsBig(roster, 12_000_000);
    expect(small.rows.map(r => r.player.player_id)).toEqual(["2", "3"]);
    expect(small.rows[1].surplus).toBeNull();
    expect(small).toMatchObject({ salary: 7_000_000, mappedSalary: 3_000_000, value: 20_000_000, surplus: 17_000_000, mapped: 1 });
    expect(small.roi).toBeCloseTo(17 / 3);
    expect(big).toMatchObject({ salary: 40_000_000, surplus: 10_000_000, roi: 0.25 });
    // An unknown salary is never a $0 contract.
    expect(all.rows.some(r => r.player.player_id === "4")).toBe(false);
  });
});

describe("contract timeline", () => {
  it("marks options, then FA in the season after the last listed one", () => {
    const p = player("1", "100", "G", ["200", null], [null, "player"]);
    expect(timelineMarks(p, SEASONS, "2026-27").map(c => c.mark)).toEqual(["guaranteed", "player-option", "free-agent", "none"]);
    expect(timelineMarks(player("2", null, "F"), SEASONS, "2026-27").map(c => c.mark)).toEqual(["none", "none", "none", "none"]);
    expect(nextOption(p)).toBe("Player option 2027-28");
  });
});
