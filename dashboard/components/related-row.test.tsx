// @vitest-environment happy-dom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RelatedRow } from "./related-row";
import { teamRelated } from "@/lib/related-links";
import type { WorkbenchCatalog } from "@/lib/types";

let pathname = "/teams/1610612760";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useSearchParams: () => new URLSearchParams() }));
const shared = vi.fn();
vi.mock("@/lib/route-availability", async original => ({ ...(await original<object>()), getSharedCatalog: (...args: unknown[]) => shared(...args) }));
afterEach(() => { cleanup(); shared.mockReset(); pathname = "/teams/1610612760"; });

const catalog = { default_season: "2005-06", default_phase: "regular_season", capabilities: {
  core_stats: { status: "available", seasons: ["2005-06"], phases: ["regular_season"], limitations: [] },
} } as unknown as WorkbenchCatalog;
const links = teamRelated({ teamId: "1610612760", season: "2005-06", phase: "regular_season", playoffSeasons: [] });

describe("RelatedRow", () => {
  it("renders a labelled nav of real links from the page's catalog, without reading the shared one", () => {
    render(<RelatedRow links={links} catalog={catalog} />);
    const nav = screen.getByRole("navigation", { name: "Related" });
    expect(within(nav).getAllByRole("link").map(link => link.textContent)).toEqual(["2005-06 Standings", "Schedule", "Roster Shapes", "Contracts", "Team Compare"]);
    expect(within(nav).getByRole("link", { name: "Schedule" }).getAttribute("href")).toBe("#schedule");
    expect(shared).not.toHaveBeenCalled();
  });
  it("trusts links the server already checked", () => {
    render(<RelatedRow checked links={links.slice(0, 1)} />);
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(shared).not.toHaveBeenCalled();
  });
  it("draws a team with its logo hidden from the accessible name, and a self link as text", () => {
    pathname = "/teams/1610612747";
    render(<RelatedRow checked links={[
      { key: "a", label: "Seattle SuperSonics", href: "/teams/1610612760?season=2005-06", team: { id: "SEA", season: "2005-06" } },
      { key: "b", label: "Los Angeles Lakers", href: "/teams/1610612747?season=2005-06", team: { id: "LAL", season: "2005-06" } },
    ]} />);
    expect(screen.getByRole("link", { name: "Seattle SuperSonics" }).className).toContain("is-block");
    expect(screen.queryByRole("link", { name: "Los Angeles Lakers" })).toBeNull();
  });
  it("renders nothing when the release serves none of the links", () => {
    shared.mockReturnValue(new Promise(() => {}));
    const { container } = render(<RelatedRow links={links.filter(link => link.key === "roster-shapes")} />);
    expect(container.innerHTML).toBe("");
  });
});
