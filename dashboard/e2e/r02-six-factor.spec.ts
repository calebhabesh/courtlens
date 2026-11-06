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

test.describe("R02 Six-Factor RAPM (design row 18)", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });
  const served = fixture.pages["2025-26"];
  const byId = new Map(served.players.map((p: { player_id: string }) => [p.player_id, p]));

  test("opens with Databallr's explainer order, the measured R² and the credits", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Six-Factor RAPM");
    await expect(page.locator(".rs-heading")).toHaveText(["The Framework", "How It Works", "The Six Factors", "Two Ways to Slice the Grid", "Player Archetypes", "All Ratings", "How to Read the Numbers", "Column Glossary", "Impact Tree", "Caveats & Methodology"]);
    await expect(page.getByText(`R² = ${served.reconstruction.in_sample.value.toFixed(3)}`, { exact: true }).first()).toBeVisible();
    const methods = page.getByRole("region", { name: "Caveats & Methodology" });
    await expect(methods).toContainText("not the commonly quoted 0.985");
    await methods.locator("summary").click();
    await expect(methods.getByRole("link", { name: "Databallr" })).toBeVisible();
    await expect(methods).toContainText("Rosenbaum (2004) and Sill (2010)");
    await expect(page.getByRole("navigation", { name: "Six-Factor RAPM sections" }).locator('[aria-current="page"]')).toHaveText("Six-Factor");
  });

  test("the framework grid and the factor tabs pick the same factor", async ({ page }) => {
    await openWorkbench(page, path);
    await page.getByRole("button", { name: "dTS, Shooting Defense" }).click();
    await expect(page).toHaveURL(/factor=d_ts/);
    const section = page.getByRole("region", { name: "The Six Factors" });
    await expect(section.getByRole("radio", { name: "dTS" })).toHaveAttribute("aria-checked", "true");
    const top = section.getByRole("list", { name: /Shooting Defense, four highest/ }).getByRole("listitem");
    await expect(top).toHaveCount(4);
    const best = [...served.players].filter((p: { metrics: Record<string, { value: number | null }> }) => p.metrics.d_ts.value !== null)
      .sort((a: { metrics: Record<string, { value: number }> }, b: { metrics: Record<string, { value: number }> }) => b.metrics.d_ts.value - a.metrics.d_ts.value)[0];
    expect(Number(await top.first().locator(".rs-value").getAttribute("data-value"))).toBe(best.metrics.d_ts.value);
    await expect(top.first()).toContainText(" to ");
    await section.getByRole("radio", { name: "oREB" }).click();
    await expect(page).toHaveURL(/factor=o_reb/);
    await expect(section.getByRole("heading", { level: 3 })).toContainText("oREB");
  });

  test("archetype cards show the served players and values", async ({ page }) => {
    await openWorkbench(page, path);
    const cards = page.getByRole("list", { name: "Player archetypes" }).getByRole("listitem");
    await expect(cards).toHaveCount(served.archetypes.length);
    for (const [index, card] of served.archetypes.entries()) {
      const player = byId.get(card.player_id) as { player_name: string; metrics: Record<string, { value: number | null; low: number | null }> };
      await expect(cards.nth(index)).toContainText(player.player_name);
      await expect(cards.nth(index)).toContainText(card.rule);
      expect(Number(await cards.nth(index).locator(".sf-archetype-rapm .rs-value").getAttribute("data-value"))).toBe(player.metrics.rapm.value);
    }
  });

  test("the table matches the API, sorts every way with unknowns last, filters and exports", async ({ page }) => {
    await openWorkbench(page, path);
    const table = page.getByRole("region", { name: "Six-factor ratings with intervals" });
    for (const row of await table.locator("tbody tr[data-row]").all()) {
      const player = byId.get((await row.getAttribute("data-row"))!) as { metrics: Record<string, { value: number | null; low: number | null; high: number | null }> };
      const cell = row.locator('td[data-column="rapm"]');
      if (player.metrics.rapm.value === null) await expect(cell).toHaveText("—");
      else {
        expect(Number(await cell.getAttribute("data-value"))).toBe(player.metrics.rapm.value);
        const tone = await cell.locator(".rt-value").getAttribute("data-tone");
        const { low, high } = player.metrics.rapm;
        expect(tone).toBe(low !== null && low > 0 ? "good" : high !== null && high < 0 ? "bad" : null);
      }
    }
    await page.getByRole("radio", { name: "Offense" }).click();
    await table.getByRole("button", { name: "Sort by oREB" }).click();
    await expect(table.locator("th[aria-sort=descending]")).toContainText("oREB");
    await table.getByRole("button", { name: "Sort by oREB" }).click();
    await expect(table.locator("th[aria-sort=ascending]")).toContainText("oREB");
    await expect(table.locator("tbody tr").last().locator('td[data-column="o_reb"]')).toHaveText("—");
    await page.getByRole("searchbox", { name: "Search players", exact: true }).fill("Embiid");
    await expect(table.locator("tbody tr[data-row]")).toHaveCount(1);
    await expect(page.getByText("1 players", { exact: true })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download CSV" }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe("courtlens-six-factor-2025-26-regular_season.csv");
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
    await page.getByRole("link", { name: "Open 2025-26" }).click();
    await expect(page).toHaveURL(/season=2025-26/);
    await expect(page.getByRole("heading", { name: "Impact Tree" })).toBeVisible();
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

  test("reads in a centred column with open sections and an unscrolled table (RD00)", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.locator('[data-node="d_reb"]')).toBeVisible();
    const layout = await page.evaluate(() => {
      const column = document.querySelector(".rs-column")!.getBoundingClientRect();
      const card = getComputedStyle(document.querySelector(".rs-card")!);
      const scroller = document.querySelector(".rt-scroll")!;
      return { width: column.width, left: column.left, right: window.innerWidth - column.right, cardFill: card.backgroundColor, tableScroll: scroller.scrollWidth - scroller.clientWidth };
    });
    expect(layout.width).toBeLessThanOrEqual(992);
    expect(Math.abs(layout.left - layout.right)).toBeLessThanOrEqual(1);
    expect(layout.cardFill).toBe("rgba(0, 0, 0, 0)");
    for (const view of ["Combined", "Offense", "Defense"]) {
      await page.getByRole("radio", { name: view }).click();
      expect(await page.locator(".rt-scroll").evaluate(el => el.scrollWidth - el.clientWidth), view).toBeLessThanOrEqual(0);
    }
  });

  test("the RAPM Ratings tab reads in the same column with the shared, uncoloured table (RD00 round 3)", async ({ page }) => {
    await openWorkbench(page, "/research/rapm");
    const table = page.getByRole("region", { name: "Served impact ratings" });
    await expect(table.locator("tbody tr[data-row]").first()).toBeVisible();
    const layout = await page.evaluate(() => {
      const column = document.querySelector(".rapm-ratings.rs-column")!.getBoundingClientRect();
      const scroller = document.querySelector(".rt-scroll")!;
      return { width: column.width, left: column.left, right: window.innerWidth - column.right, tableScroll: scroller.scrollWidth - scroller.clientWidth,
        toned: document.querySelectorAll('.rt-grid [data-tone="good"], .rt-grid [data-tone="bad"]').length, logos: document.querySelectorAll(".rt-grid .rt-logo").length };
    });
    expect(layout.width).toBeLessThanOrEqual(992);
    expect(Math.abs(layout.left - layout.right)).toBeLessThanOrEqual(1);
    expect(layout.tableScroll).toBeLessThanOrEqual(0);
    expect(layout.toned).toBe(0); // no interval is served on this tab, so nothing is coloured
    expect(layout.logos).toBe(0); // and no team, so no logo column
    await expect(page.getByRole("list", { name: "Colour key" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "B26 preregistered experiment", exact: true })).toBeVisible();
  });

  test("keeps every name inside the pinned player column on a phone (RD00)", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, path);
    await expect(page.locator(".rt-grid tbody tr").first()).toBeVisible();
    const overflowing = await page.locator(".rt-grid tbody .ui-identity-name").evaluateAll(names => names.filter(name => {
      const cell = name.closest("th")!, range = document.createRange();
      range.selectNodeContents(name);
      return range.getBoundingClientRect().right > cell.getBoundingClientRect().right - parseFloat(getComputedStyle(cell).paddingRight) + 0.5;
    }).map(name => name.textContent));
    expect(overflowing).toEqual([]);
  });
});
