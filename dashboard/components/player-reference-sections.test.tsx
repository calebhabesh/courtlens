// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlayerReferenceSections } from "./player-reference-sections";
import fixture from "@/lib/player-reference-fixture.json";
import type { PlayerBio } from "@/lib/types";

// JSON import widens option/scope strings; check the boundary through the real union members.
const reference: NonNullable<PlayerBio["reference"]> = {
  ...fixture,
  current_contract: fixture.current_contract.map(row => ({ ...row, option: row.option === "player" ? "player" : row.option === "team" ? "team" : null })),
  game_highs: fixture.game_highs.map(row => ({ ...row, phase: row.phase === "playoffs" ? "playoffs" : "regular_season", scope: "career" })),
};
afterEach(cleanup);

describe("player reference sections", () => {
  it("puts contract, history, events and totals in one season table", () => {
    render(<PlayerReferenceSections reference={reference} />);
    const table = screen.getByRole("table", { name: "Contract and salary history by season" });
    const rows = within(table).getAllByRole("row").map(row => row.textContent ?? "");
    expect(rows.findIndex(text => text.startsWith("Current Contract"))).toBeLessThan(rows.findIndex(text => text.startsWith("Salary History · 2 Seasons")));
    const current = rows.find(text => text.startsWith("2026-27")) ?? "";
    expect(current).toContain("$2,000,000");
    expect(current).toContain("1.2%");
    // Both dated 2026 events fall in 2026-27, newest first.
    expect(current.indexOf("Signed extension.")).toBeLessThan(current.indexOf("Traded from BOS to TOR."));
    expect(rows.find(text => text.startsWith("2027-28"))).toContain("Player option");
    expect(rows.find(text => text.startsWith("2028-29"))).toContain("Team option");
    expect(rows.find(text => text.startsWith("2028-29"))).toContain("Two-way");
    expect(rows.find(text => text.startsWith("2024-25"))).toContain("$0");
    expect(rows.find(text => text.startsWith("Remaining Guaranteed"))).toContain("$123.45");
    expect(screen.getByText("$123.45").getAttribute("href")).toContain("/contracts/TOR.html");
    expect(rows.find(text => text.startsWith("Career Earnings"))).toContain("$1,000,000");
    expect(screen.getByText(/Career earnings total reported salaries/)).toBeTruthy();
    expect(screen.getByText("Traded from BOS to TOR.").getAttribute("title")).toContain("September 14, 2026");
  });
  it("keeps events outside the listed seasons in their own row", () => {
    render(<PlayerReferenceSections reference={{ ...reference, contract_events: [
      { date: "2019-07-10", type: "signed", description: "Signed rookie deal.", from_team_code: null, to_team_code: null },
      { date: null, type: "note", description: "Undated note.", from_team_code: null, to_team_code: null },
    ] }} />);
    const table = screen.getByRole("table", { name: "Contract and salary history by season" });
    expect(within(table).getByText("Other Contract Events")).toBeTruthy();
    expect(within(table).getByText("Signed rookie deal.")).toBeTruthy();
    expect(within(table).getByText("Undated note.")).toBeTruthy();
  });
  it("keeps phases separate, known zero visible and missing highs unknown", () => {
    render(<PlayerReferenceSections reference={reference} />);
    const table = screen.getByRole("region", { name: "Career highs table" });
    const rows = within(table).getAllByRole("row");
    expect(rows[1].textContent).toContain("Regular season42140");
    expect(rows[2].textContent).toContain("Playoffs32—7");
    expect(within(table).getByRole("link", { name: "42" }).getAttribute("title")).toContain("Jan 2, 2026");
    expect(screen.getAllByRole("link", { name: "Basketball-Reference.com" })).toHaveLength(3);
  });
  it("uses NBA artwork for current BRef aliases and leaves historical codes as text", () => {
    render(<PlayerReferenceSections reference={{ ...reference, current_contract: [
      { season: "2026-27", team: "Brooklyn Nets", team_code: "BRK", salary: "0" },
      { season: "2007-08", team: "Seattle SuperSonics", team_code: "SEA", salary: null },
    ] }} />);
    const table = screen.getByRole("table", { name: "Contract and salary history by season" });
    expect(within(table).getByRole("img", { name: "BKN" })).toBeTruthy();
    expect(within(table).getAllByText("BRK")).toHaveLength(1);
    expect(within(table).getAllByText("SEA")).toHaveLength(1);
    expect(within(table).queryByRole("img", { name: /SEA/ })).toBeNull();
  });
  it("orders transactions newest first and omits absent sections", () => {
    const { container, unmount } = render(<PlayerReferenceSections reference={reference} />);
    expect(container.querySelector('[aria-label="Transaction News"] time')?.getAttribute("datetime")).toBe("2026-09-22");
    unmount();
    render(<PlayerReferenceSections reference={{ ...reference, salary_history: [], current_contract: [], contract_events: [], transactions: [], game_highs: [] }} />);
    expect(screen.queryByRole("heading", { name: "Contract" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Career Highs" })).toBeNull();
  });
});
