import { expect, test } from "@playwright/test";
import type { HistoricalSlate, LivePlayer } from "../lib/live";
import { openWorkbench } from "./workbench-navigation";

const scope = "/team-compare?teamA=100&teamB=200&releaseId=fixture-release&season=2025-26&beforeDate=2026-04-13&history=1";

function player(team: string, statistics: LivePlayer["statistics"]): LivePlayer {
  return {
    source_id: team, canonical_id: null, team_source_id: team, name: `${team} Player`,
    identity_status: "resolved", reported_nonappearance: false,
    statistics: {
      minutes_seconds: "1800", points: "20", field_goals_made: "5", field_goals_attempted: "10",
      three_pointers_made: "0", three_pointers_attempted: "0", free_throws_made: "0",
      free_throws_attempted: "0", rebounds_total: "0", assists: "0", turnovers: "0", ...statistics,
    },
  };
}

for (const width of [1440, 390]) {
  test(`team game history labels teams, centers metrics and compares each team's FT at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const slate: HistoricalSlate = {
      context: {}, games: [], status: "available", warnings: [],
      players: [player("TOR", { free_throws_made: "13", free_throws_attempted: "17" }), player("BOS", { free_throws_made: "19", free_throws_attempted: "20" })],
    };
    await page.route("**/api/live/historical?*", route => route.fulfill({ json: slate }));
    await openWorkbench(page, scope);
    const game = page.getByRole("button", { name: /^G1 · Mar 1, 2026/ });
    await expect(game).toContainText("Mar 1, 2026");
    await expect(game).toHaveAttribute("aria-pressed", "true");
    const dateOffset = await game.evaluate(button => {
      const date = button.querySelector(".tc-history-game-meta");
      if (!date) throw new Error("Missing game date");
      const row = button.getBoundingClientRect(), label = date.getBoundingClientRect();
      return Math.abs(label.x + label.width / 2 - row.x - row.width / 2);
    });
    expect(dateOffset).toBeLessThan(1);
    await game.focus();
    await page.keyboard.press("Enter");
    const ft = page.getByRole("group", { name: "FT team totals", exact: true });
    await expect(ft.locator('[data-side="a"]')).toHaveAttribute("aria-label", "TOR FT: 13-17 (76%)");
    await expect(ft.locator('[data-side="b"]')).toHaveAttribute("aria-label", "BOS FT: 19-20 (95%)");
    await expect(ft.locator("[data-leading]")).toHaveText("19-20(95%)");
    const zero = page.getByRole("group", { name: "3P team totals", exact: true });
    await expect(zero.locator(".tc-history-total-value")).toHaveText(["0-0", "0-0"]);
    for (const label of ["FG", "3P", "FT", "REB", "AST", "TOV"]) {
      const tile = page.getByRole("group", { name: `${label} team totals`, exact: true });
      await expect(tile.locator(".tc-history-total-team")).toHaveText(["TOR", "BOS"]);
      const centers = await tile.evaluate(element => {
        const textCenter = (node: Element) => {
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
        };
        const [a, b] = element.querySelectorAll(".tc-history-total-value");
        const label = element.querySelector("small");
        if (!a || !b || !label) throw new Error("Missing game total cells");
        const rect = element.getBoundingClientRect();
        const centerA = textCenter(a), centerB = textCenter(b);
        return { metric: textCenter(label), pair: { x: (centerA.x + centerB.x) / 2, y: (centerA.y + centerB.y) / 2 }, tile: rect.x + rect.width / 2 };
      });
      expect(Math.abs(centers.metric.x - centers.pair.x)).toBeLessThan(1);
      expect(Math.abs(centers.metric.y - centers.pair.y)).toBeLessThan(1);
      expect(Math.abs(centers.metric.x - centers.tile)).toBeLessThan(1);
    }
    const pageWidth = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
    expect(pageWidth.scroll).toBe(pageWidth.client);
    if (width === 390) {
      const heights = await page.locator(".tc-draft-matchup").evaluateAll(rows => rows.map(row => row.getBoundingClientRect().height));
      expect(heights.length).toBeGreaterThan(0);
      for (const height of heights) expect(height).toBeLessThanOrEqual(88);
    }
  });
}

test("team game totals preserve missing fields and known zeroes independently", async ({ page }) => {
  const slate: HistoricalSlate = {
    context: {}, games: [], status: "available", warnings: [],
    players: [player("TOR", {}), player("BOS", { rebounds_total: null, field_goals_made: "", free_throws_made: "invalid" })],
  };
  await page.route("**/api/live/historical?*", route => route.fulfill({ json: slate }));
  await openWorkbench(page, scope);
  const reb = page.getByRole("group", { name: "REB team totals", exact: true });
  await expect(reb.locator(".tc-history-total-value")).toHaveText(["0", "—"]);
  await expect(reb.locator("[data-leading]")).toHaveCount(0);
  await expect(page.getByRole("group", { name: "FG team totals", exact: true }).locator(".tc-history-total-value")).toHaveText(["5-10(50%)", "—"]);
  await expect(page.getByRole("group", { name: "FT team totals", exact: true }).locator(".tc-history-total-value")).toHaveText(["0-0", "—"]);
  await expect(page.getByRole("group", { name: "AST team totals", exact: true }).locator(".tc-history-total-value")).toHaveText(["0", "0"]);
});
