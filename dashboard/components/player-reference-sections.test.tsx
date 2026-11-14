// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PlayerReferenceSections } from "./player-reference-sections";
import fixture from "@/lib/player-reference-fixture.json";
import type { PlayerBio, PlayerSalary } from "@/lib/types";

// JSON import widens option/scope strings; check the boundary through the real union members.
const reference: NonNullable<PlayerBio["reference"]> = {
  ...fixture,
  current_contract: fixture.current_contract.map(row => ({ ...row, option: row.option === "player" ? "player" : row.option === "team" ? "team" : null })),
  game_highs: fixture.game_highs.map(row => ({ ...row, phase: row.phase === "playoffs" ? "playoffs" : "regular_season", scope: "career" })),
};
afterEach(cleanup);

describe("player reference sections", () => {
  it("puts contract, history, events and totals in one season table, newest first", () => {
    render(<PlayerReferenceSections reference={reference} />);
    const table = screen.getByRole("table", { name: "Contract and salary history by season" });
    const rows = within(table).getAllByRole("row").map(row => row.textContent ?? "");
    const seasons = rows.map(text => text.slice(0, 7)).filter(text => /^\d{4}-\d{2}$/.test(text));
    expect(seasons).toEqual([...seasons].sort().reverse());
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
  it("leaves out a column with nothing reported for this player", () => {
    const plain = (rows: PlayerSalary[] = []) => rows.map(row => ({ ...row, option: null, guarantee: null, share_of_cap: null }));
    render(<PlayerReferenceSections reference={{ ...reference, current_contract: plain(reference.current_contract), salary_history: plain(reference.salary_history) }} />);
    const table = screen.getByRole("table", { name: "Contract and salary history by season" });
    const headers = within(table).getAllByRole("columnheader").map(cell => cell.textContent);
    expect(headers).not.toContain("% of Cap");
    expect(headers).not.toContain("Option / Guarantee");
    expect(headers).not.toContain("Terms");
    // The totals keep their place under Salary.
    expect(within(table).getAllByRole("row").find(row => row.textContent?.startsWith("Career Earnings"))?.textContent).toContain("$1,000,000");
  });
  it("shows a guarantee settled by the remaining total, and no terms on played seasons", () => {
    const guarantee = { amount: "2000000", status: "full" as const, source_url: "https://www.basketball-reference.com/contracts/TOR.html", as_of: "2026-11-13T00:00:00Z", basis: "total_equals_non_option_salaries" as const };
    render(<PlayerReferenceSections reference={{ ...reference, current_contract: (reference.current_contract ?? []).map((row, i) => i === 0 ? { ...row, guarantee } : row),
      salary_history: (reference.salary_history ?? []).map(row => ({ ...row, option: "team" as const })) }} />);
    const table = screen.getByRole("table", { name: "Contract and salary history by season" });
    const link = within(table).getByRole("link", { name: "Fully guaranteed" });
    expect(link.getAttribute("title")).toContain("outside an option year");
    // The history's options never show: a played season's terms no longer apply.
    const history = within(table).getAllByRole("row").filter(row => row.textContent?.startsWith("2024-25"));
    expect(history.every(row => !row.textContent?.includes("Team option"))).toBe(true);
  });
  it("brackets each contract's seasons and notes a signing it cannot bracket", () => {
    render(<PlayerReferenceSections reference={{ ...reference,
      contract_spans: [{ start_season: "2026-27", end_season: "2028-29", end_basis: "current_contract", signed_date: "2026-07-01", kind: "signing",
        length_stated: false, team_code: "TOR", description: "Signed 3-yr contract", current: true }],
      unplaced_signings: [{ signed_date: "2024-08-01", season: "2024-25", kind: "extension", description: "Signed a contract extension" }],
    }} />);
    const table = screen.getByRole("table", { name: "Contract and salary history by season" });
    const cells = within(table).getAllByRole("cell").filter(cell => cell.classList.contains("player-contract-span"));
    // The newest season carries the label and the bracket's top cap; the oldest its bottom cap.
    expect(cells.map(cell => cell.getAttribute("data-edge")).slice(0, 3)).toEqual(["top", "middle", "bottom"]);
    expect(cells[0].textContent).toContain("Current · Signed 3-yr contract");
    expect(cells[0].textContent).toContain("2026-27 to 2028-29");
    const note = within(table).getByText("Signed a contract extension");
    expect(note.closest("tr")?.textContent?.startsWith("2024-25")).toBe(true);
    expect(within(table).getByText(/start not reported/)).toBeTruthy();
  });
  it("names the cap's source on each share", () => {
    render(<PlayerReferenceSections reference={{ ...reference, current_contract: (reference.current_contract ?? []).map((row, i) => i === 0
      ? { ...row, cap_source: "basketball_reference" as const, cap_source_url: "https://www.basketball-reference.com/contracts/salary-cap-history.html" } : row) }} />);
    expect(screen.getByText("1.2%").getAttribute("title")).toContain("Basketball-Reference's cap history");
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
    const rows = within(table).getAllByRole("row").map(row => row.textContent ?? "");
    // Grouped as Scoring (PTS, FGM, 3PM, FTM), Counting (REB, AST, STL, BLK), Other (MIN, GmSc).
    expect(rows[0]).toBe("PhaseScoringCountingOther");
    expect(rows).toContain(`Regular Season${["42", "—", "—", "—", "14", "0", "—", "—", "48:30", "—"].join("")}`);
    expect(rows).toContain(`Playoffs${["32", "—", "—", "—", "—", "7", "—", "—", "—", "—"].join("")}`);
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
    expect(screen.queryByRole("heading", { name: "Contracts" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Career Highs" })).toBeNull();
  });
});
