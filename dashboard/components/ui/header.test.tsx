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

  it("opens More (⋯) menu and displays Settings, Data status, and Help items", () => {
    render(<Header />);
    const moreBtn = screen.getByRole("button", { name: "More options" });
    expect(moreBtn.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      fireEvent.click(moreBtn);
    });
    expect(moreBtn.getAttribute("aria-expanded")).toBe("true");

    expect(screen.getByRole("menuitem", { name: "Settings" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Data status" })).toBeDefined();
    expect(screen.getByRole("menuitem", { name: "Definitions & Glossary" })).toBeDefined();

    // Press Escape to close
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(moreBtn.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens command palette dialog when clicking search pill", () => {
    render(<Header />);
    const searchPill = screen.getByRole("searchbox", { name: "Search players, teams and pages" });

    act(() => {
      fireEvent.click(searchPill);
    });

    const dialog = screen.getByRole("dialog", { name: "CourtLens global command palette" });
    expect(dialog).not.toBeNull();

    const input = screen.getByRole("combobox", { name: "Search players, teams and pages" });
    expect(input).not.toBeNull();
  });

  it("opens mobile navigation drawer when clicking mobile toggle", () => {
    const { container } = render(<Header />);
    const mobileToggle = screen.getByRole("button", { name: "Toggle navigation drawer" });
    expect(mobileToggle.getAttribute("aria-expanded")).toBe("false");

    act(() => {
      fireEvent.click(mobileToggle);
    });
    expect(mobileToggle.getAttribute("aria-expanded")).toBe("true");

    const drawerPanel = container.querySelector(".replica-mobile-drawer");
    expect(drawerPanel).not.toBeNull();
  });
});
