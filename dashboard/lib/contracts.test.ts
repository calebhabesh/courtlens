import { describe, expect, it } from "vitest";
import { centsMoney, dollars, earnerDonut, money, nextOption, payrollFlow, positionDonut, seasonStatus, timelineRows, type ContractPlayer } from "./contracts";

const player = (id: string, cents: string | null, group: ContractPlayer["position_group"], seasons: ContractPlayer["seasons"] = [], roster = true): ContractPlayer => ({
  player_id: id, name: `P${id}`, on_index_roster: roster, listed_position: group === "unlisted" ? null : group, position_group: group,
  current_salary_cents: cents, unknown_reason: cents === null ? "salary_blank_in_source" : null, remaining_guaranteed_cents: null,
  seasons, source_url: null, source_locator: null, reference: null,
});

describe("contracts money", () => {
  it("keeps unknown distinct from an observed zero", () => {
    expect(dollars(null)).toBeNull(); expect(dollars("0")).toBe(0); expect(centsMoney(null)).toBe("—");
    expect(money(0)).toBe("$0"); expect(money(5903311400 / 100)).toBe("$59.0M"); expect(money(-1500000)).toBe("−$1.5M");
  });
});

describe("contract timeline", () => {
  it("marks options, hatches a blank current season and leaves later blanks as not listed", () => {
    const rows = timelineRows([
      player("1", "100", "G", [{ season: "2026-27", salary_cents: "100", option: null }, { season: "2027-28", salary_cents: "200", option: "player" }, { season: "2028-29", salary_cents: null, option: null }]),
      player("2", null, "F", [{ season: "2026-27", salary_cents: null, option: null }, { season: "2027-28", salary_cents: null, option: null }]),
      player("3", null, "C"),
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].cells.map(c => c.status)).toEqual(["reported", "player-option"]);
    expect(rows[1].cells).toEqual([{ period: "2026-27", value: null, status: "unknown" }]);
    expect(seasonStatus({ season: "2026-27", salary_cents: "1", option: "team" })).toBe("team-option");
    expect(nextOption(player("1", "1", "G", [{ season: "2027-28", salary_cents: "1", option: "team" }]))).toBe("Team option 2027-28");
  });
});

describe("payroll shares", () => {
  const players = [player("1", "300", "G"), player("2", "100", "F"), player("3", null, "F"), player("4", "50", "C", [], false)];
  it("flows only known roster salary through position groups", () => {
    const { nodes, links } = payrollFlow(players);
    expect(links.find(l => l.target === "group:G")?.value).toBe(3);
    expect(links.find(l => l.target === "group:F")?.value).toBe(1);
    expect(nodes.some(n => n.id === "player:3" || n.id === "player:4")).toBe(false);
  });
  it("labels known counts by position and keeps one unknown earner row with no slice value", () => {
    expect(positionDonut(players).map(i => i.label)).toEqual(["Guards · 1/1 known", "Forwards · 1/2 known"]);
    const earners = earnerDonut(players);
    expect(earners.at(-1)).toMatchObject({ id: "unknown", value: null, label: "1 unknown salaries" });
  });
});
