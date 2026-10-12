import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExampleBoardsView } from "./example-boards-view";
import type { WorkbenchQueryResponse } from "@/lib/types";

vi.mock("next/navigation", () => ({ usePathname: () => "/rankings", useSearchParams: () => new URLSearchParams() }));
const props = { kind: "rankings" as const, onCopy: vi.fn(), copying: false, copyError: null, copyDisabled: false };
describe("Example board truthful presentation", () => {
  it("preserves zero and unknown reference cells and does not invoke a copy while rendering", () => {
    const data = { query: { season: "2025-26", phase: "regular_season", before_date: "2026-04-13", release_id: "pinned" }, total_eligible_players: 1, warnings: [], items: [{ player_id: "a", player_name: "Observed Player", teams: [], total_minutes: 600, games_played: 20, metrics: { min: 600, gp: 20, min_per_game: null, pts_per_game: 0 }, table_qualified: true }] } as unknown as WorkbenchQueryResponse;
    const html = renderToStaticMarkup(<ExampleBoardsView {...props} data={data} />);
    expect(html).toContain("Season Minutes Leaders");
    expect(html).toMatch(/<strong[^>]*>0<\/strong>/);
    expect(html).toContain("—");
    expect(html).toContain("published box scores");
    expect(props.onCopy).not.toHaveBeenCalled();
  });
  it("unavailable and empty inputs offer recovery and never create placeholder players", () => {
    const unavailable = renderToStaticMarkup(<ExampleBoardsView {...props} data={null} />);
    expect(unavailable).toContain("Retry example");
    expect(unavailable).not.toContain("Copy to my boards");
    const empty = renderToStaticMarkup(<ExampleBoardsView {...props} data={{ query: { season: "2025-26", phase: "regular_season", before_date: "2026-04-13" }, items: [], warnings: [] } as unknown as WorkbenchQueryResponse} />);
    expect(empty).toContain("No observed players in this scope.");
    expect(empty).toContain("Open Stats");
    expect(empty).not.toContain("Season Minutes Leaders");
  });
});
