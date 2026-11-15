// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TeamDetailResponse } from "@/lib/types";

const getTeamDetail = vi.fn();
vi.mock("@/lib/workbench-api", () => ({ getTeamDetail: (...args: unknown[]) => getTeamDetail(...args) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/teams/1610612747",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import { RosterAllocationView } from "./roster-allocation-view";

const detail = {
  team: { id: "1610612747", name: "Los Angeles Lakers", tricode: "LAL" },
  record: { wins: 8, losses: 4, games_played: 12 },
  player_cohort: [],
} as unknown as TeamDetailResponse;
const scope = { releaseId: "r1", season: "2026-27", phase: "regular_season", beforeDate: "2026-11-13" };

afterEach(() => { cleanup(); getTeamDetail.mockReset(); });

// Speed plan SP04: the team page already read this team for this scope; the board shows that
// read at once instead of reading it again after mount.
describe("roster board seeded by the team page", () => {
  it("shows the server's team read without reading it again", async () => {
    render(<RosterAllocationView catalog={null} teamId="1610612747" scope={scope} initial={detail} embedded />);
    expect(screen.queryByRole("status", { name: "Loading minutes" })).toBeNull();
    expect(screen.getByText(/No minutes for Los Angeles Lakers in this scope/)).toBeTruthy();
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(getTeamDetail).not.toHaveBeenCalled();
  });

  it("reads the team after mount when no server read is given", async () => {
    getTeamDetail.mockResolvedValue(detail);
    render(<RosterAllocationView catalog={null} teamId="1610612747" scope={scope} embedded />);
    expect(screen.getByRole("status", { name: "Loading minutes" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/No minutes for Los Angeles Lakers in this scope/)).toBeTruthy());
    expect(getTeamDetail).toHaveBeenCalledTimes(1);
    expect(getTeamDetail).toHaveBeenCalledWith("1610612747", scope);
  });
});
