// @vitest-environment happy-dom
import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { Header } from "./header";

vi.mock("next/navigation", () => ({
  usePathname: () => "/stats",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/lib/workbench-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/workbench-api")>();
  return {
    ...actual,
    getWorkbenchCatalog: vi.fn().mockResolvedValue({
      capabilities: {},
      seasons: ["2025-26"],
    }),
    queryLookup: vi.fn().mockResolvedValue({
      query: { raw: "", normalized: "", tokens: [], version: "1" },
      catalog_version: "test",
      total_matches: 0,
      items: [],
    }),
  };
});

afterEach(() => {
  cleanup();
});

describe("Design Language v1 Header Component", () => {
  it("renders single-row sticky header with brand, nav links, and search pill", () => {
    const { container } = render(<Header />);
    const header = container.querySelector("header.courtlens-header");
    expect(header).not.toBeNull();

    // Brand mark and wordmark
    expect(container.querySelector(".brand")).not.toBeNull();
    expect(container.querySelector(".brand-title")).not.toBeNull();

    // Primary direct links
    expect(screen.getByRole("link", { name: "Stats" })).toBeDefined();

    // Dropdown trigger buttons
    const playersTrigger = container.querySelector('[data-dropdown-id="players"]');
    expect(playersTrigger).not.toBeNull();
    const liveTrigger = container.querySelector('[data-dropdown-id="live"]');
    expect(liveTrigger).not.toBeNull();
    const teamsTrigger = container.querySelector('[data-dropdown-id="teams"]');
    expect(teamsTrigger).not.toBeNull();
    const compareTrigger = container.querySelector('[data-dropdown-id="compare"]');
    expect(compareTrigger).not.toBeNull();
    const researchTrigger = container.querySelector('[data-dropdown-id="research"]');
    expect(researchTrigger).not.toBeNull();

    // Search pill
    const searchPill = screen.getByRole("searchbox", { name: "Search players, teams and pages" });
    expect(searchPill).toBeDefined();
    expect(screen.getByText("⌘K")).toBeDefined();

    // Right action buttons
    expect(screen.getByRole("button", { name: "More options" })).toBeDefined();
    expect(screen.getByRole("button", { name: /Ask/ })).toBeDefined();
  });

  it("opens dropdown menu on click and closes on Escape", () => {
    const { container } = render(<Header />);
    const playersBtn = container.querySelector<HTMLButtonElement>('[data-dropdown-id="players"]');
    expect(playersBtn).not.toBeNull();
    expect(playersBtn?.getAttribute("aria-expanded")).toBe("false");

    // Click to open
    act(() => {
      fireEvent.click(playersBtn!);
    });
    expect(playersBtn?.getAttribute("aria-expanded")).toBe("true");

    // Menu should contain directory link
    expect(screen.getByRole("menuitem", { name: "Ranking Boards" })).toBeDefined();

    // Escape closes dropdown
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(playersBtn?.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens More (⋯) menu with the D9 support links", () => {
    render(<Header />);
    const moreBtn = screen.getByRole("button", { name: "More options" });
    expect(moreBtn.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      fireEvent.click(moreBtn);
    });
    expect(moreBtn.getAttribute("aria-expanded")).toBe("true");

    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Data Status" })).toBeDefined();
    for (const name of ["Methodology", "What's New", "Planner"]) {
      expect(screen.getByRole("menuitem", { name })).toBeDefined();
    }

    // Press Escape to close
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(moreBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens command palette dialog when clicking search pill", () => {
    const { container } = render(<Header />);
    const searchPill = screen.getByRole("searchbox", { name: "Search players, teams and pages" });

    act(() => {
      fireEvent.click(searchPill);
    });

    const dialog = screen.getByRole("dialog", { name: "CourtLens global command palette" });
    expect(dialog).not.toBeNull();

    const input = screen.getByRole("combobox", { name: "Search players, teams and pages" });
    expect(input).not.toBeNull();
    expect(container.querySelector("header")?.contains(dialog)).toBe(false);
    expect(dialog.closest(".ui-command-palette-scrim")?.parentElement).toBe(document.body);
  });

  it("opens mobile navigation drawer when clicking mobile toggle", () => {
    const { container } = render(<Header />);
    const mobileToggle = screen.getByRole("button", { name: "Toggle navigation drawer" });
    expect(mobileToggle.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      fireEvent.click(mobileToggle);
    });
    expect(mobileToggle.getAttribute("aria-expanded")).toBe("true");

    // Overlays render at document.body (FO02), outside the header's containing block.
    const drawerPanel = document.querySelector(".replica-mobile-drawer");
    expect(drawerPanel).not.toBeNull();
    expect(container.contains(drawerPanel)).toBe(false);
  });
});

describe("FO02 search and drawer", () => {
  afterEach(() => window.localStorage.clear());

  it("shows Recent above Pages in the empty search state once something was opened", () => {
    window.localStorage.setItem("courtlens-recent-searches-v1", JSON.stringify([{
      id: "team-bos", kind: "team", canonical_id: "1610612738", display_name: "Boston Celtics", match_basis: "exact",
      match_score: 1, destination_url: "/teams/1610612738", portrait_fallback: "BOS",
      availability: { has_current_season: true, status: "available", seasons: [] }
    }]));
    render(<Header />);
    act(() => {
      fireEvent.click(screen.getByRole("searchbox", { name: "Search players, teams and pages" }));
    });
    const headings = Array.from(document.querySelectorAll(".ui-command-group-heading")).map(node => node.textContent);
    expect(headings).toEqual(["Recent", "Pages"]);
    expect(screen.getByRole("option", { name: /Boston Celtics/ })).toBeDefined();
    expect(screen.getByRole("button", { name: "Close search" })).toBeDefined();
  });

  it("drawer lists the same Research groups as the desktop menu, and collapsed sections are inert", () => {
    const { container } = render(<Header />);
    act(() => {
      fireEvent.click(container.querySelector<HTMLButtonElement>('[data-dropdown-id="research"]')!);
    });
    const desktop = Array.from(container.querySelectorAll('[data-dropdown-panel="research"] .courtlens-dropdown-section-title')).map(node => node.textContent);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Toggle navigation drawer" }));
    });
    const drawer = document.querySelector(".replica-mobile-drawer")!;
    const titles = Array.from(drawer.querySelectorAll(".courtlens-mobile-group-title")).map(node => node.textContent);
    // Both derive from lib/nav-model.ts and the same availability filter (the mock declares no sources).
    expect(desktop.length).toBeGreaterThan(2);
    expect(titles).toEqual(desktop);
    const live = Array.from(drawer.querySelectorAll<HTMLButtonElement>(".ui-accordion-trigger")).find(node => node.textContent === "Live")!;
    expect(live.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(live.getAttribute("aria-controls")!)?.hasAttribute("inert")).toBe(true);
  });
});
