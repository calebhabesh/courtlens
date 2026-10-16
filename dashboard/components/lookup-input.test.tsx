// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { LookupInput } from "./lookup-input";
import { queryLookup } from "@/lib/workbench-api";
import type { LookupItem } from "@/lib/types";
import { storageKeys } from "@/lib/storage-keys";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
vi.mock("@/lib/workbench-api", async importOriginal => ({
  ...(await importOriginal<typeof import("@/lib/workbench-api")>()),
  queryLookup: vi.fn(),
}));

const jokic = {
  id: "player:203999", kind: "player", canonical_id: "203999", display_name: "Nikola Jokić",
  subtitle: "DEN · Player", match_basis: "prefix", match_score: 1, matched_alias: null,
  destination_url: "/players/203999", availability: { has_current_season: true, status: "available", seasons: ["2025-26"] },
} as unknown as LookupItem;

function respond(items: LookupItem[]) {
  vi.mocked(queryLookup).mockResolvedValue({ items, total_matches: items.length } as never);
}

async function settle() {
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
}

describe("LookupInput before typing", () => {
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.mocked(queryLookup).mockReset(); });

  it("opens no dropdown on focus when there is nothing to suggest", async () => {
    vi.useFakeTimers();
    respond([]);
    render(<LookupInput label="Search players" value="" onChange={() => {}} onSelect={() => {}} kinds={["player"]} />);
    fireEvent.focus(screen.getByRole("combobox"));
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(screen.getByRole("combobox").getAttribute("aria-expanded")).toBe("false");
  });

  it("leads with recent picks, then the season leaders, and never repeats or offers an excluded player (row 3, 64)", async () => {
    vi.useFakeTimers();
    const leader = (id: string, name: string) => ({ ...jokic, id: `player:${id}`, canonical_id: id, display_name: name, match_basis: "leader" }) as unknown as LookupItem;
    window.localStorage.setItem(storageKeys.recentSearches, JSON.stringify([jokic, { ...jokic, id: "player:23", canonical_id: "23", display_name: "Excluded Star" }]));
    respond([leader("1628983", "Shai Gilgeous-Alexander"), leader("203999", "Nikola Jokić")]);
    render(<LookupInput label="Search players" value="" season="2024-25" onChange={() => {}} onSelect={() => {}} kinds={["player"]} excludedIds={["23"]} />);
    fireEvent.focus(screen.getByRole("combobox"));
    await settle();
    const list = screen.getByRole("listbox");
    expect([...list.querySelectorAll(".lookup-group-header, .lookup-item-name")].map(node => node.textContent)).toEqual([
      "Recent", "Nikola Jokić", "Season leaders · 2024-25", "Shai Gilgeous-Alexander"
    ]);
    window.localStorage.removeItem(storageKeys.recentSearches);
  });

  it("with openOnFocus off, focus alone keeps results closed until the field is pressed (row 3, 69)", async () => {
    vi.useFakeTimers();
    respond([{ ...jokic, match_basis: "leader" } as unknown as LookupItem]);
    render(<LookupInput label="Search players" value="" season="2030-31" openOnFocus={false} onChange={() => {}} onSelect={() => {}} kinds={["player"]} />);
    fireEvent.focus(screen.getByRole("combobox"));
    await settle();
    expect(screen.queryByRole("listbox")).toBeNull();
    fireEvent.click(screen.getByRole("combobox"));
    await settle();
    expect(screen.getByRole("listbox").textContent).toContain("Nikola Jokić");
  });

  it("still shows matches once a name is typed", async () => {
    vi.useFakeTimers();
    respond([jokic]);
    render(<LookupInput label="Search players" value="jok" onChange={() => {}} onSelect={() => {}} kinds={["player"]} />);
    fireEvent.focus(screen.getByRole("combobox"));
    await settle();
    expect(screen.getByRole("option").textContent).toContain("Nikola Jokić");
  });

  it("lists every verified nickname after the name, and none for generated aliases", async () => {
    vi.useFakeTimers();
    respond([
      { ...jokic, matched_alias: "Joker", nicknames: ["Joker", "The Big Honey"] },
      { ...jokic, canonical_id: "1", display_name: "Vic Law", matched_alias: null, nicknames: [] },
    ] as LookupItem[]);
    render(<LookupInput label="Search players" value="big honey" onChange={() => {}} onSelect={() => {}} kinds={["player"]} />);
    fireEvent.focus(screen.getByRole("combobox"));
    await settle();
    const captions = Array.from(document.querySelectorAll(".lookup-alias-badge")).map(node => node.textContent);
    expect(captions).toEqual(["aka Joker, The Big Honey"]);
  });
});
