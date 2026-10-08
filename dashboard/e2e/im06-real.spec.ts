import fs from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test.skip(!process.env.IM06_REAL_API, "Requires the IM06 read-only real API and installed sealed bundle.");

const evidence = path.resolve(process.cwd(), "../docs/evidence/im06/screenshots");
const scope = "season=2025-26&phase=regular_season&beforeDate=2026-07-01&window=season&countingMode=per_game";

for (const width of [1440, 375]) {
  for (const [preset, key, label] of [
    ["impact", "rapm", "1Y RAPM"], ["onoff", "onoff_net_rating", "Net on/off"],
    ["sixfactor", "d_ts", "dTS"], ["defense", "pbp_blk_per100", "BLK/100"]
  ]) {
    test(`${preset} served values at ${width}px`, async ({ page, request }) => {
      await fs.mkdir(evidence, { recursive: true });
      const response = await request.get(`${process.env.IM06_REAL_API}/api/workbench/impact?playerId=1641705&season=2025-26&beforeDate=2026-07-01`);
      expect(response.ok()).toBe(true);
      const impact = await response.json();
      const value = impact.players[0].metrics[key];
      expect(value).not.toBeNull();
      await page.setViewportSize({ width, height: 900 });
      await openWorkbench(page, `/stats?${scope}&viewId=${preset}&sortMetric=${key}&name=Victor`);
      await expect(page.getByText("CourtLens model", { exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: "Victor Wembanyama", exact: true }).first()).toBeVisible();
      const headers = page.locator("thead tr").last().locator("th.num");
      const index = await headers.evaluateAll((elements, name) => elements.findIndex(element => element.textContent?.includes(name)), label);
      expect(index).toBeGreaterThanOrEqual(0);
      const cell = page.locator(".stats-metric-cell").nth(index);
      await expect(cell).toContainText(Number(value).toFixed(2));
      await expect(page.getByText(/1,227 \/ 1,230 games admitted/)).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({ path: path.join(evidence, `${preset}-${width}.png`), fullPage: true, animations: "disabled" });
    });
  }
  test(`profile and research at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, `/players/1641705?${scope}`);
    await expect(page.getByRole("region", { name: "Player impact", exact: true })).toContainText("9.12");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(evidence, `profile-${width}.png`), fullPage: true, animations: "disabled" });
    await openWorkbench(page, `/research/rapm?${scope}`);
    await expect(page.getByRole("region", { name: "Served impact ratings" })).toContainText("9.12");
    await expect(page.getByRole("heading", { name: "B26 preregistered experiment", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: path.join(evidence, `research-${width}.png`), fullPage: true, animations: "disabled" });
  });
  test(`earlier cutoff remains unavailable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, `/stats?season=2025-26&phase=regular_season&beforeDate=2025-12-01&window=season&countingMode=per_game&viewId=impact&name=Victor`);
    await expect(page.getByText(/No sealed fit is wholly before this cutoff/)).toBeVisible();
    await expect(page.locator(".stats-metric-cell").first()).toContainText("—");
    await page.screenshot({ path: path.join(evidence, `cutoff-gate-${width}.png`), fullPage: true, animations: "disabled" });
  });
}
