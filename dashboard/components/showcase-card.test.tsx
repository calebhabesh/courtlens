// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ShowcaseCard } from "./showcase-card";
import type { PlayerResearchItem } from "@/lib/types";

afterEach(cleanup);

const player: PlayerResearchItem = {
  player_id: "1629029", player_name: "Luka Dončić", teams: ["DAL", "LAL"], stints_count: 2, games_played: 64,
  total_minutes: 2289, metrics: {}, sample_sizes: {}
};

describe("ShowcaseCard (D15/D16)", () => {
  it("shows value, rank and percentile per stat and one context line, with no code-like rules", () => {
    const { container } = render(<ShowcaseCard player={player} focusLabel="Overall" contextLine="2025-26 Regular Season · Through Apr 12, 2026"
      stats={[
        { key: "pts_per_game", label: "PPG", value: "33.5", percentile: 99, rank: 1 },
        { key: "ts_pct", label: "TS%", value: "61.6%", percentile: 77, rank: null },
        { key: "stl_per_game", label: "SPG", value: "—", percentile: null, rank: null }
      ]} />);
    const text = container.textContent ?? "";
    expect(text).toContain("33.5");
    expect(text).toContain("1st");
    expect(text).toContain("99th pct");
    expect(text).toContain("77th pct");
    expect(text).toContain("2025-26 Regular Season · Through Apr 12, 2026");
    expect(text).not.toMatch(/game_date|TEMPORAL DISCIPLINE|Strictly/);
    expect(container.querySelector("svg")?.getAttribute("aria-label")).toContain("Luka Dončić");
    // The current team (last observed stint) drives the logo and accent.
    expect(container.querySelector('image[href^="/team-logos/1610612747"]')).not.toBeNull();
    // Unknown percentile draws no fill bar: two filled bars for three stats.
    expect(container.querySelectorAll('rect[height="6"]')).toHaveLength(5);
  });
});
