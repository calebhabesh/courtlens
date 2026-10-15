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
  it("shows reported salaries, options, cap share and a separate remaining guarantee", () => {
    render(<PlayerReferenceSections reference={reference} />);
    const contract = screen.getByRole("table", { name: "Current contract salaries" });
    expect(contract.textContent).toContain("$2,000,000");
    expect(contract.textContent).toContain("1.2%");
    expect(contract.textContent).toContain("Player option");
    expect(contract.textContent).toContain("Team option");
    expect(contract.textContent).toContain("Two-way");
    expect(contract.textContent).not.toContain("$123.45");
    expect(screen.getByText("$123.45").getAttribute("href")).toContain("/contracts/TOR.html");
    expect(screen.getByText("Reported career earnings").parentElement?.textContent).toContain("$1,000,000");
    expect(screen.getByText(/Source total may be incomplete/)).toBeTruthy();
    expect(screen.getByText("Signed extension.")).toBeTruthy();
    expect(screen.getByText("Traded from BOS to TOR.").getAttribute("title")).toContain("September 14, 2026");
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
  it("orders transactions newest first and omits absent sections", () => {
    const { container, unmount } = render(<PlayerReferenceSections reference={reference} />);
    expect(container.querySelector('[aria-label="Transactions"] time')?.getAttribute("datetime")).toBe("2026-09-22");
    unmount();
    render(<PlayerReferenceSections reference={{ ...reference, salary_history: [], current_contract: [], contract_events: [], transactions: [], game_highs: [] }} />);
    expect(screen.queryByRole("heading", { name: "Contract" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Career highs" })).toBeNull();
  });
});
