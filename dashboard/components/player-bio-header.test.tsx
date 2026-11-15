// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { PlayerBioHeader } from "./player-bio-header";
import type { PlayerBio } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams(), usePathname: () => "/players/24" }));
afterEach(cleanup);

const bio: PlayerBio = {
  player_id: "24", season: "2010-11", as_of: "2011-04-10", listing_source: "player_index",
  jersey: null, listed_position: "G", listed_height_inches: null, listed_weight_lbs: null,
  prior_seasons: null, birth_date: null, age: null, country: null, college: null, draft: null,
  undrafted: false, combine: null, limitations: [], current_team: null,
  last_team: { team_id: "1610612738", team_tricode: "BOS", listing_season: "2026-27" },
};

it("names the last indexed team when no active listing exists, even on an older season", () => {
  render(<PlayerBioHeader name="Fixture Guard" playerId="24" team={{ id: "1610612761", tricode: "TOR", name: "Toronto Raptors" }} bio={bio} currentSeason="2025-26" actions={null} />);
  const identity = document.querySelector(".player-bio-identity-team");
  expect(identity?.textContent).toBe("Last with Boston Celtics");
  // Site links D11: the team links to its page in the season he last played for it.
  expect(screen.getByRole("link", { name: "Boston Celtics" }).getAttribute("href")).toBe("/teams/1610612738?season=2026-27");
  expect(screen.queryByText(/Toronto Raptors/)).toBeNull();
});

it("names an active listing without a last-team prefix", () => {
  render(<PlayerBioHeader name="Fixture Guard" playerId="24" team={null} bio={{ ...bio, current_team: { team_id: "1610612761", team_tricode: "TOR", listing_season: "2026-27" } }} currentSeason="2025-26" actions={null} />);
  expect(screen.getByText("Toronto Raptors")).toBeTruthy();
  expect(screen.queryByText(/Last with/)).toBeNull();
});

const reference = {
  source: "Basketball-Reference.com", url: "https://www.basketball-reference.com/players/b/brunsja01.html", as_of: "2026-11-14",
  birthplace: null, high_school: null, shoots: null, debut_date: null, honours: [], awards: {}, all_star_seasons: [],
};

it("shows the college with its logo and location, and the draft team by its full name then", () => {
  render(<PlayerBioHeader name="Fixture Guard" playerId="24" team={null} currentSeason="2025-26" actions={null} bio={{
    ...bio, college: "Villanova",
    // NBA.com's draft record can name the school differently ("California-Los Angeles" for UCLA).
    draft: { year: 2018, round: 2, pick: 33, team_id: "1610612742", team_tricode: "DAL", organization: "Villanova University", organization_type: "College/University" },
    reference: { ...reference, college: { name: "Villanova", school: "Villanova Wildcats", location: "Villanova, Pennsylvania",
      logo_url: "/api/workbench/college-logos/222", source_url: null, attribution: "Sports-Reference.com college basketball schools" } },
  }} />);
  const fact = screen.getByText("College").closest("div")!;
  expect(fact.textContent).toContain("Villanova, Pennsylvania");
  expect(fact.querySelector("img")?.getAttribute("src")).toMatch(/\/api\/workbench\/college-logos\/222$/);
  // The draft names its team in full and no longer repeats the college under it.
  const draft = screen.getByText("Draft").closest("div")!;
  expect(draft.textContent).toContain("Dallas Mavericks");
  expect(draft.textContent).not.toContain("Villanova");
  expect(fact.textContent).not.toContain("University");
});

it("names a pick by the team that made it: Seattle in 2008, a club origin stays under Draft", () => {
  render(<PlayerBioHeader name="Fixture Guard" playerId="24" team={null} currentSeason="2025-26" actions={null} bio={{
    ...bio, college: null,
    draft: { year: 2008, round: 1, pick: 4, team_id: "1610612760", team_tricode: "OKC", organization: "Fixture Club" },
    reference: { ...reference, college: null },
  }} />);
  const draft = screen.getByText("Draft").closest("div")!;
  expect(draft.textContent).toContain("Seattle SuperSonics");
  expect(draft.textContent).toContain("Fixture Club");
  expect(screen.queryByText("College")).toBeNull();
});

it("loads only the hero portrait eagerly at high priority; the watermark, logos and flag are lazy (SP06)", () => {
  // The server HTML (happy-dom never loads an image, so mounted portraits fall back to initials).
  document.body.innerHTML = renderToStaticMarkup(<PlayerBioHeader name="Fixture Guard" playerId="24" team={null} currentSeason="2025-26" actions={null}
    bio={{ ...bio, country: "USA", current_team: { team_id: "1610612761", team_tricode: "TOR", listing_season: "2026-27" } }} />);
  const hero = document.querySelector<HTMLImageElement>("img.player-bio-portrait")!;
  expect(hero.getAttribute("loading")).toBe("eager");
  expect(hero.getAttribute("fetchpriority")).toBe("high");
  expect(hero.getAttribute("src")).toMatch(/\/api\/workbench\/players\/24\/portrait\.webp\?size=288&crop=face-v6$/);
  const others = [...document.querySelectorAll<HTMLImageElement>("img")].filter(img => img !== hero);
  expect(others.length).toBeGreaterThan(1);
  for (const img of others) {
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("fetchpriority")).toBeNull();
    expect(Number(img.getAttribute("width"))).toBeGreaterThan(0);
    expect(Number(img.getAttribute("height"))).toBeGreaterThan(0);
  }
});
