import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real API answers for 2025-26 (cut to a few rows): every tree value is checked against them.
const fixture = JSON.parse(readFileSync("e2e/fixtures/six-factor-page.json", "utf8"));
const path = "/research/rapm/six-factor";
const LEADER = "202695", PARTIAL = "1627751", FACTORS_ONLY = "1626172", ROOKIE = "1642843", NO_ROW = "1643407";
const NODES = ["rapm", "orapm", "drapm", "o_ts", "o_tov", "o_reb", "d_ts", "d_tov", "d_reb"];
const treeOf = (id: string) => id === NO_ROW ? fixture.notInFit : fixture.trees[id];

async function expectTreeMatchesFixture(page: import("@playwright/test").Page, id: string) {
  const tree = treeOf(id);
  await expect(page.getByRole("region", { name: "Impact Tree" }).getByRole("list", { name: new RegExp(`^${tree.player_name} Impact Tree`) })).toBeVisible();
  for (const key of NODES) {
    const served = tree.metrics[key], node = page.locator(`[data-node="${key}"]`);
    await expect(node).toHaveAttribute("data-status", served.status);
    if (served.value === null) {
      await expect(node).not.toHaveAttribute("data-value");
      await expect(node).toContainText("Unknown");
    } else expect(Number(await node.getAttribute("data-value"))).toBe(served.value);
    if (served.low === null) {
      await expect(node).not.toHaveAttribute("data-low");
      await expect(node).toContainText("80% interval unknown");
    } else {
      expect(Number(await node.getAttribute("data-low"))).toBe(served.low);
      expect(Number(await node.getAttribute("data-high"))).toBe(served.high);
    }
  }
}

test.describe("R02 Six-Factor RAPM", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("opens with the explainer in order, the measured R² and the Databallr credit", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Six-Factor RAPM");
    await expect(page.locator(".sf-heading")).toHaveText(["The Framework", "How It Works", "The Six Factors", "Net Efficiency vs Possession Control", "Player Archetypes", "Caveats", "All Ratings", "Impact Tree"]);
    const { reconstruction: fit } = fixture.pages["2025-26"];
    await expect(page.getByText(`R² ${fit.in_sample.value.toFixed(3)}`, { exact: true })).toBeVisible();
    const caveats = page.getByRole("region", { name: "Caveats" });
    await expect(caveats).toContainText("not the commonly quoted 0.985");
    await expect(caveats.getByRole("link", { name: "Databallr" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Six-Factor RAPM sections" }).locator('[aria-current="page"]')).toHaveText("Six-Factor");
  });

  test("factor tabs change the leaderboard, with an interval on every row", async ({ page }) => {
    await openWorkbench(page, path);
    const section = page.getByRole("region", { name: "The Six Factors" });
    await section.getByRole("radio", { name: "dTS" }).click();
    await expect(page).toHaveURL(/factor=d_ts/);
    const rows = section.getByRole("list", { name: /Shooting Defense, ten largest/ }).getByRole("listitem");
    await expect(rows).toHaveCount(10);
    await expect(rows.first()).toContainText(" to ");
  });

  test("the table sorts every way with unknowns last", async ({ page }) => {
    await openWorkbench(page, path);
    const table = page.getByRole("region", { name: "Six-factor ratings with intervals" });
    await table.getByRole("button", { name: "Sort by oREB" }).click();
    const lastRow = table.getByRole("row").last();
    await expect(table.locator("th[aria-sort=descending]")).toContainText("oREB");
    await table.getByRole("button", { name: "Sort by oREB" }).click();
    await expect(table.locator("th[aria-sort=ascending]")).toContainText("oREB");
    await page.getByRole("button", { name: /^Show all/ }).click();
    await expect(lastRow.locator("td").nth(4)).toHaveText("—");
  });

  test("the tree opens on the top RAPM and matches the served values exactly", async ({ page }) => {
    await openWorkbench(page, path);
    await expectTreeMatchesFixture(page, LEADER);
    await expect(page.getByTestId("tree-reconstruction")).toContainText("rebuild this RAPM");
  });

  for (const [name, id, unknown, known] of [
    ["partial data keeps its known nodes and marks the rest unknown", PARTIAL, "o_reb", "rapm"],
    ["factors without RAPM leave the top of the tree unknown", FACTORS_ONLY, "rapm", "o_ts"],
  ] as const) test(name, async ({ page }) => {
    await openWorkbench(page, `${path}?player=${id}`);
    await expectTreeMatchesFixture(page, id);
    await expect(page.locator(`[data-node="${unknown}"]`)).toHaveAttribute("data-status", "below_qualification");
    await expect(page.locator(`[data-node="${known}"]`)).toHaveAttribute("data-status", "estimate");
    await expect(page.getByTestId("tree-reconstruction")).toContainText("unknown");
  });

  test("a rated rookie has a full tree; a rookie with no row is unknown, not zero", async ({ page }) => {
    await openWorkbench(page, `${path}?player=${ROOKIE}`);
    await expectTreeMatchesFixture(page, ROOKIE);
    await openWorkbench(page, `${path}?player=${NO_ROW}`);
    await expectTreeMatchesFixture(page, NO_ROW);
    await expect(page.getByRole("region", { name: "Impact Tree" })).toContainText("every number is unknown, not zero");
    await expect(page.locator('[data-node="rapm"]')).toHaveAttribute("data-status", "not_in_fit");
  });

  test("a season without a fit explains itself and keeps the season picker", async ({ page }) => {
    await openWorkbench(page, `${path}?season=2026-27`);
    await expect(page.getByText(/No one-year fit is served for 2026-27/)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Season" })).toHaveValue("2026-27");
  });

  test("the Stats six-factor preset links here; the RAPM tab stays", async ({ page }) => {
    await openWorkbench(page, "/stats?season=2025-26&viewId=sixfactor&sortMetric=rapm");
    const link = page.getByRole("link", { name: "How Six-Factor RAPM works" });
    await expect(link).toHaveAttribute("href", /^\/research\/rapm\/six-factor\?season=2025-26/);
    await openWorkbench(page, "/research/rapm");
    await expect(page.getByRole("navigation", { name: "Six-Factor RAPM sections" }).locator('[aria-current="page"]')).toHaveText("RAPM Ratings");
  });

  test("fits a phone with no page overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, path);
    await expect(page.locator('[data-node="d_reb"]')).toBeVisible();
    const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    expect(scroll).toBeLessThanOrEqual(inner);
  });
});
