import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { LiveGameData, LiveRead, WinProbabilityLine } from "../lib/live";

// Real reads: a final game through the CourtLens API and the frozen model's line for it.
const game: LiveRead<LiveGameData> = JSON.parse(readFileSync("e2e/fixtures/live-game-401909869.json", "utf8"));
const line: WinProbabilityLine = JSON.parse(readFileSync("e2e/fixtures/win-probability-line.json", "utf8"));

async function mockLive(page: Page, answer: WinProbabilityLine = line) {
  await page.route("**/api/live/**", route => route.request().url().includes("/win-probability") ? route.fulfill({ json: answer }) : route.fulfill({ json: game }));
  await page.route("**/api/live?**", route => route.fulfill({ json: { ...game, data: { games: [game.data!.game] } } }));
}

test("Live: CourtLens beside ESPN with a toggle, swings and the model's identity", async ({ page }) => {
  await mockLive(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/live/games/401909869?date=2026-10-26");
  const panel = page.getByRole("region", { name: "Probabilities & Game Flow" });
  await expect(panel.getByRole("img", { name: /Win probability by CourtLens/ })).toBeVisible();
  await expect(panel.getByRole("img", { name: /Win probability by ESPN Analytics/ })).toBeVisible();
  await expect(panel.getByText(line.model.manifest_sha256.slice(0, 12))).toBeVisible();
  await expect(panel.getByRole("list", { name: "Biggest swings" }).getByRole("listitem")).toHaveCount(line.swings!.length);
  await panel.getByRole("radiogroup", { name: "Model" }).getByRole("radio", { name: "ESPN" }).click();
  await expect(panel.getByRole("img", { name: /Win probability by CourtLens/ })).toHaveCount(0);
  await panel.getByRole("radiogroup", { name: "Model" }).getByRole("radio", { name: "CourtLens" }).click();
  await expect(panel.getByRole("img", { name: /Win probability by ESPN Analytics/ })).toHaveCount(0);
  await panel.getByRole("radiogroup", { name: "Chart" }).getByRole("radio", { name: "Game Flow" }).click();
  await expect(panel.getByRole("img", { name: /Game flow/ })).toBeVisible();
  await expect(panel.getByRole("list", { name: "Biggest swings" })).toBeVisible();
});

test("Live: a game with no sealed inputs shows ESPN and says why", async ({ page }) => {
  await mockLive(page, { status: "no_inputs", model: line.model, reason: "x" });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/live/games/401909869?date=2026-10-26");
  const panel = page.getByRole("region", { name: "Probabilities & Game Flow" });
  await expect(panel.getByRole("img", { name: /Win probability by ESPN Analytics/ })).toBeVisible();
  await expect(panel.getByRole("img", { name: /Win probability by CourtLens/ })).toHaveCount(0);
  await expect(panel).toContainText("no pregame inputs were sealed before tip-off");
  await expect(panel.getByRole("radiogroup", { name: "Model" })).toHaveCount(0);
});

test("Research: scorecard, drift, calibration, negative results, credit label, model card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/win-probability");
  await expect(page.getByRole("heading", { name: "Live scorecard, 2026-27" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Season scorecard" })).toContainText("Prospective");
  await expect(page.getByRole("region", { name: "Season scorecard" })).toContainText("Pre-freeze replay");
  await expect(page.getByRole("figure", { name: "Rolling 30-day calibration error" })).toBeVisible();
  await expect(page.getByRole("figure", { name: /Calibration on the final test/ })).toBeVisible();
  await page.getByRole("radiogroup", { name: "Phase" }).getByRole("radio", { name: "Overtime" }).click();
  await expect(page.getByRole("figure", { name: /final test: Overtime/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What did not work" })).toBeVisible();
  await expect(page.getByText("Lineups and rotation (S4) added nothing.")).toBeVisible();
  await expect(page.getByText("credit assignment, not causal value")).toBeVisible();
  await expect(page.getByRole("region", { name: "Season leaders" }).getByRole("row")).not.toHaveCount(1);
  await expect(page.getByText("courtlens-win-probability-v2-frozen-2026-27").first()).toBeVisible();
  await page.getByRole("radiogroup", { name: "Season" }).getByRole("radio", { name: "2024-25" }).click();
  await expect(page).toHaveURL(/wpaSeason=2024-25/);
});

test("evidence screenshots", async ({ page }) => {
  test.skip(!process.env.R15B_SCREENSHOTS, "Only when recording evidence");
  const out = process.env.R15B_SCREENSHOTS!;
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/research/win-probability");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}/research-1440.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `${out}/research-390.png`, fullPage: true });
  await mockLive(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/live/games/401909869?date=2026-10-26");
  const panel = page.getByRole("region", { name: "Probabilities & Game Flow" });
  await expect(panel.getByRole("img", { name: /Win probability by CourtLens/ })).toBeVisible();
  await panel.screenshot({ path: `${out}/live-panel-1440.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel.getByRole("img", { name: /Win probability by CourtLens/ })).toBeVisible();
  await panel.screenshot({ path: `${out}/live-panel-390.png` });
});

test("Research at phone width has no sideways page scroll", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research/win-probability");
  await expect(page.getByRole("heading", { name: "Model card" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
