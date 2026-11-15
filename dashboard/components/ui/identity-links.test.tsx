// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlayerIdentity, TeamIdentity } from "./identity";
import { GridPlayer } from "../research/stats-grid";
import { TeamCode } from "../playoffs-series-sections";

let pathname = "/stats";
vi.mock("next/navigation", () => ({ usePathname: () => pathname, useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
afterEach(() => { cleanup(); pathname = "/stats"; });

describe("shared cells link by default (site links SL04)", () => {
  it("PlayerIdentity links the name and its team code in the era's season", () => {
    render(<PlayerIdentity playerId="1630567" name="Scottie Barnes" team="TOR" era={{ season: "2024-25", team: "TOR" }} />);
    expect(screen.getByRole("link", { name: "Scottie Barnes" }).getAttribute("href")).toBe("/players/1630567?season=2024-25");
    expect(screen.getByRole("link", { name: "TOR" }).getAttribute("href")).toBe("/teams/1610612761?season=2024-25");
  });
  it("PlayerIdentity with href={null} is plain, team code included", () => {
    render(<PlayerIdentity playerId="1630567" name="Scottie Barnes" team="TOR" href={null} />);
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("PlayerIdentity on the player's own page is plain", () => {
    pathname = "/players/1630567";
    render(<PlayerIdentity playerId="1630567" name="Scottie Barnes" />);
    expect(screen.queryByRole("link", { name: "Scottie Barnes" })).toBeNull();
  });
  it("TeamIdentity links to the franchise in the season", () => {
    render(<TeamIdentity team="SEA" season="2005-06" />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/teams/1610612760?season=2005-06");
  });
  it("GridPlayer links the name as a block link; the logo stays a badge", () => {
    const { container } = render(<GridPlayer playerId="2544" name="LeBron James" team="CLE" season="2003-04" />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe("/players/2544?season=2003-04");
    expect(link.className).toContain("is-block");
    expect(container.querySelectorAll("a")).toHaveLength(1);
  });
  it("series TeamCode links to the playoffs, the regular season for meetings, and is plain inside a control", () => {
    render(<>
      <TeamCode team="1610612760" code="OKC" season="2024-25" />
      <TeamCode team="1610612763" code="MEM" season="2024-25" phase="regular_season" />
      <TeamCode team="1610612747" code="LAL" season="2024-25" link={false} />
    </>);
    const links = screen.getAllByRole("link").map(a => a.getAttribute("href"));
    expect(links).toEqual(["/teams/1610612760?season=2024-25&phase=playoffs", "/teams/1610612763?season=2024-25"]);
  });
});
