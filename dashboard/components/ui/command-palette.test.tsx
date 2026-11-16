// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MotionGlobalConfig } from "motion/react";
import type { LookupItem, LookupResponse } from "@/lib/types";
import { readRecentSearches } from "@/lib/recent-searches";
import { GlobalCommandPalette } from "./command-palette";

MotionGlobalConfig.skipAnimations = true;

const push = vi.fn();
vi.mock("next/navigation", () => ({
  usePathname: () => "/stats",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
}));

function player(id: string, name: string, basis: LookupItem["match_basis"] = "prefix"): LookupItem {
  return {
    id, kind: "player", canonical_id: id, display_name: name, match_basis: basis, match_score: 1,
    availability: { has_current_season: true, status: "available", seasons: ["2025-26"] },
    team_association: { basis: "selected_scope", teams: ["BOS"], observed_through: null, season: null, phase: null, before_date: null },
    destination_url: `/players/${id}`,
  };
}

const lookup = vi.fn<(options: { query: string; kinds?: string[] }) => Promise<LookupResponse>>();
vi.mock("@/lib/workbench-api", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/workbench-api")>()),
  queryLookup: (options: { query: string; kinds?: string[] }) => lookup(options),
}));

function respond(items: LookupItem[], total = items.length): LookupResponse {
  return { query: { raw: "", normalized: "", tokens: [], version: "1" }, catalog_version: "t", total_matches: total, items };
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  push.mockClear();
  lookup.mockReset();
  lookup.mockImplementation(async ({ query }) => {
    if (query === "draft") return respond([player("p1", "Drafty McDraft")]);
    if (query === "jay") return respond(Array.from({ length: 8 }, (_, i) => player(`j${i}`, `Jay Player ${i}`)), 40);
    return respond([]);
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function search(text: string) {
  const input = screen.getByRole("combobox", { name: "Search players, teams and pages" });
  fireEvent.change(input, { target: { value: text } });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  return input;
}

const groupNames = () => screen.getAllByRole("group").map(group => group.getAttribute("aria-label"));

describe("GlobalCommandPalette", () => {
  it("shows pages straight away and puts them first when the query names one", async () => {
    render(<GlobalCommandPalette isOpen onClose={() => {}} />);
    await search("draft");
    expect(groupNames()).toEqual(["Pages", "Players"]);
    const pages = within(screen.getByRole("group", { name: "Pages" }));
    expect(pages.getAllByRole("option")[0].textContent).toContain("Draft Classes");
  });

  it("puts players first for a name, capped with a link to the rest", async () => {
    render(<GlobalCommandPalette isOpen onClose={() => {}} />);
    await search("jay");
    expect(groupNames()[0]).toBe("Players");
    const players = within(screen.getByRole("group", { name: "Players" }));
    expect(players.getAllByRole("option")).toHaveLength(6);
    fireEvent.click(players.getByRole("button", { name: "See all" }));
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(screen.getByRole("radio", { name: "Players" }).getAttribute("aria-checked")).toBe("true");
    expect(lookup).toHaveBeenLastCalledWith(expect.objectContaining({ query: "jay", kinds: ["player"] }));
  });

  it("narrows to pages with Tab, without asking the server", async () => {
    render(<GlobalCommandPalette isOpen onClose={() => {}} />);
    const input = await search("shot");
    lookup.mockClear();
    fireEvent.keyDown(input, { key: "Tab" });
    expect(screen.getByRole("radio", { name: "Pages" }).getAttribute("aria-checked")).toBe("true");
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(lookup).not.toHaveBeenCalled();
    const names = screen.getAllByRole("option").map(option => option.textContent ?? "");
    expect(names.some(name => name.includes("Shot Quality"))).toBe(true);
    expect(names.some(name => name.includes("Shot Aftermath"))).toBe(true);
  });

  it("lists every page by section before typing in Pages", async () => {
    render(<GlobalCommandPalette isOpen onClose={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: "Pages" }));
    expect(groupNames()).toEqual(expect.arrayContaining(["Stats", "Live", "Research · Tools", "More"]));
    expect(screen.getAllByRole("option").length).toBeGreaterThan(35);
  });

  it("opens a page with Enter and remembers it as a recent", async () => {
    render(<GlobalCommandPalette isOpen onClose={() => {}} />);
    const input = await search("draft");
    fireEvent.keyDown(input, { key: "Enter" });
    expect(push).toHaveBeenCalledWith("/draft");
    expect(readRecentSearches()[0]).toMatchObject({ kind: "page", destination_url: "/draft", display_name: "Draft Classes" });
  });
});
