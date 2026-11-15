// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GameLink, PlayerLink, SeriesLink, TeamLink } from "./entity-link";

let pathname = "/stats";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
afterEach(() => { cleanup(); pathname = "/stats"; });

describe("entity link components", () => {
  it("renders a real anchor with the entity class", () => {
    render(<PlayerLink id="2544" scope={{ season: "2012-13" }}>LeBron James</PlayerLink>);
    const link = screen.getByRole("link", { name: "LeBron James" });
    expect(link.getAttribute("href")).toBe("/players/2544?season=2012-13");
    expect(link.className).toContain("entity-link");
  });
  it("links the Thunder's 2005-06 row to the franchise, which shows the Sonics", () => {
    render(<TeamLink team="SEA" scope={{ season: "2005-06" }} label="Seattle SuperSonics">SEA</TeamLink>);
    expect(screen.getByRole("link", { name: "Seattle SuperSonics" }).getAttribute("href")).toBe("/teams/1610612760?season=2005-06");
  });
  it("links a folded team by its code", () => {
    render(<TeamLink team="CHS" scope={{ season: "1947-48" }}>CHS</TeamLink>);
    expect(screen.getByRole("link", { name: "CHS" }).getAttribute("href")).toBe("/teams/CHS?season=1947-48");
  });
  it("renders a span when the id is missing", () => {
    const { container } = render(<PlayerLink id={null} className="cell-name">Unknown Player</PlayerLink>);
    expect(screen.queryByRole("link")).toBeNull();
    const span = container.querySelector("span.cell-name");
    expect(span?.textContent).toBe("Unknown Player");
  });
  it("renders a span for a self link", () => {
    pathname = "/players/2544";
    render(<PlayerLink id="2544" scope={{ season: "2012-13" }}>LeBron James</PlayerLink>);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("LeBron James").tagName).toBe("SPAN");
  });
  it("covers games in both id spaces, series, and the prose and stretched variants", () => {
    render(<>
      <GameLink game={{ espnId: "401", date: "2025-01-15" }} variant="stretched">Game</GameLink>
      <GameLink game={{ gameId: "0022", date: "2025-01-15", teams: [{ tricode: "OKC" }, { tricode: "LAL" }] }}>Log game</GameLink>
      <SeriesLink slug="2024-25-west-r1" variant="prose">the series</SeriesLink>
    </>);
    expect(screen.getByRole("link", { name: "Game" }).className).toContain("is-stretched");
    expect(screen.getByRole("link", { name: "Log game" }).getAttribute("href")).toMatch(/^\/live\/open\?date=2025-01-15&game=0022/);
    expect(screen.getByRole("link", { name: "the series" }).className).toContain("is-prose");
  });
});
