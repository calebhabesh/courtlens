// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ShowcaseCard } from "./showcase-card";
import { cardStats } from "@/lib/showcase";
import type { PlayerResearchItem } from "@/lib/types";

afterEach(cleanup);

const player: PlayerResearchItem = {
  player_id: "203999", player_name: "Nikola Jokić", teams: ["DEN"], stints_count: 1, games_played: 65,
  total_minutes: 2265, sample_sizes: {}, table_qualified: true,
  metrics: { dpm: 7.519, pts_per_game: 27.7, ast_per_game: 10.7, ts_pct: 0.668 },
  table_percentiles: { dpm: 100, pts_per_game: 99, ast_per_game: 100, ts_pct: 80 }
};

describe("ShowcaseCard (alignment row 9)", () => {
  const stats = cardStats({ sort: "dpm", extras: ["pts", "ast", "ts_pct"], mode: "per_game" });

  it("shows rank, season badge, name and the four card stats with percentiles", () => {
    const { container, getByRole } = render(<ShowcaseCard player={player} rank={1} season="2025-26" stats={stats}
      change={{ kind: "up", by: 2, was: 5, season: "2024-25" }} onOpen={() => undefined} />);
    const text = container.textContent ?? "";
    expect(stats.map(stat => stat.label)).toEqual(["DPM", "PTS", "AST", "TS%"]);
    expect(container.querySelector(".sc-rank")?.textContent).toBe("1");
    expect(container.querySelector(".sc-season")?.textContent).toBe("'26");
    expect(text).toContain("Nikola Jokić");
    expect(text).toContain("+7.5");
    expect(text).toContain("27.7");
    expect(container.querySelector(".sc-change")?.getAttribute("data-tone")).toBe("up");
    expect(getByRole("button").getAttribute("aria-label")).toMatch(/^1\. Nikola Jokić, DPM \+7\.5/);
    expect(container.querySelector(".sc-tip")?.textContent).toBe("Up 2: 5th in 2024-25");
    expect(getByRole("button").getAttribute("aria-label")).toContain("Up 2: 5th in 2024-25.");
  });

  it("opens the player and marks a newcomer", () => {
    const onOpen = vi.fn();
    const { container, getByRole } = render(<ShowcaseCard player={player} rank={3} season="2025-26" stats={stats} change={{ kind: "new", season: "2024-25" }} onOpen={onOpen} />);
    expect(container.querySelector(".sc-change")?.textContent).toBe("New");
    fireEvent.click(getByRole("button"));
    expect(onOpen).toHaveBeenCalledWith(player);
  });
});
