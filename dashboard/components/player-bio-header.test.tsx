// @vitest-environment happy-dom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PlayerBioHeader } from "./player-bio-header";
import type { PlayerBio } from "@/lib/types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
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
  expect(screen.getByText("Last with Boston Celtics")).toBeTruthy();
  expect(screen.queryByText("Last with Toronto Raptors")).toBeNull();
});

it("names an active listing without a last-team prefix", () => {
  render(<PlayerBioHeader name="Fixture Guard" playerId="24" team={null} bio={{ ...bio, current_team: { team_id: "1610612761", team_tricode: "TOR", listing_season: "2026-27" } }} currentSeason="2025-26" actions={null} />);
  expect(screen.getByText("Toronto Raptors")).toBeTruthy();
  expect(screen.queryByText(/Last with/)).toBeNull();
});
