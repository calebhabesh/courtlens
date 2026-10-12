// @vitest-environment happy-dom
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ResearchTrendCharts } from "./research-trend-charts";
import type { PlayerGameLogItem } from "@/lib/types";

afterEach(cleanup);
it("breaks the observation path at unknowns and excludes them from the mean", () => {
  const base = {appearance: "appeared", minutes: 10, points: 5, stats: {field_goals_attempted: 4}};
  const games = [
    {...base, game_id: "3", game_date: "2026-01-03"},
    {...base, game_id: "2", game_date: "2026-01-02", minutes: null, points: null, stats: {}},
    {...base, game_id: "1", game_date: "2026-01-01", minutes: 0, points: 0},
  ] as PlayerGameLogItem[];
  const {container} = render(<ResearchTrendCharts games={games} playerName="Observed Player" />);
  const cards = container.querySelectorAll(".trend-card");
  expect(cards[0].textContent).toContain("5.0");
  expect(cards[0].textContent).toContain("2 known");
  const path = cards[0].querySelector("path")!.getAttribute("d")!;
  expect(path.match(/M /g)).toHaveLength(2);
  expect(path).not.toContain("L ");
  expect(cards[0].querySelectorAll("circle")).toHaveLength(2);
  expect(container.textContent).toContain("Gaps stay unknown");
});
