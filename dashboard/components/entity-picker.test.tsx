// @vitest-environment happy-dom
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { EntityPicker } from "./entity-picker";
import type { LookupItem } from "@/lib/types";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));

// Moved from the e2e chip test when Stat Line Shift (row 13) dropped its multi-player pickers.
const player = (n: number) => ({
  id: `player:${n}`, kind: "player", canonical_id: String(n), display_name: `Fixture Player ${n}`,
  subtitle: "FIX · Player", match_basis: "candidate", match_score: 1, matched_alias: null, destination_url: null,
}) as unknown as LookupItem;
const candidates = [1, 2, 3, 4, 5, 6].map(player);

function Harness() {
  const [selected, setSelected] = useState<LookupItem[]>([]);
  return <EntityPicker label="Together players" multiple max={5} candidates={candidates} selected={selected} onChange={setSelected} />;
}

async function choose(name: string) {
  const input = screen.getByRole("combobox", { name: "Together players" });
  fireEvent.change(input, { target: { value: name } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  fireEvent.click(screen.getAllByRole("option").find(option => option.textContent?.includes(name))!);
}

describe("EntityPicker multiple", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); });

  it("removes chips by name, never offers a chosen player again and stops at the maximum", async () => {
    vi.useFakeTimers();
    render(<Harness />);
    for (let n = 1; n <= 5; n++) await choose(`Fixture Player ${n}`);
    const input = screen.getByRole("combobox", { name: "Together players" }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
    expect(screen.getByRole("list", { name: "Selected Together players" }).querySelectorAll("li")).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Remove Fixture Player 3 from Together players" }));
    expect(input.disabled).toBe(false);
    fireEvent.change(input, { target: { value: "Fixture Player" } });
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(screen.getAllByRole("option").map(option => option.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Fixture Player 3")]));
    expect(screen.getAllByRole("option").some(option => option.textContent?.includes("Fixture Player 1"))).toBe(false);
  });
});
