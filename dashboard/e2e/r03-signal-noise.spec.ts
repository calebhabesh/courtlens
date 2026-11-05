import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real answers of the R03 API (e2e/fixtures/signal-noise.json): the page must show them exactly.
const fixture = JSON.parse(readFileSync("e2e/fixtures/signal-noise.json", "utf8"));
const stats: { key: string; label: string; levels: Record<string, { status: string; n: number | null; extrapolated: number | null }> }[] = fixture.summary.stabilization.stats;
const path = "/research/signal-noise";

test.describe("R03 Signal vs Noise", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("lists every stat with its served stabilization point, and never presents an extrapolation as reached", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Signal vs Noise");
    const table = page.getByRole("table", { name: "Stabilization points" });
    await expect(table.locator("tbody tr")).toHaveCount(20);
    for (const stat of stats) {
      const cell = table.locator(`tr[data-stat="${stat.key}"] [data-status]`).first();
      const level = stat.levels["0.5"];
      await expect(cell).toHaveAttribute("data-status", level.status);
      if (level.status === "reached") expect(Number(await cell.getAttribute("data-value"))).toBe(level.n);
      else {
        await expect(cell).toContainText("Not reached");
        expect(Number(await cell.getAttribute("data-extrapolated"))).toBe(level.extrapolated);
      }
    }
    await expect(page.getByRole("region", { name: "Key findings" })).toContainText("Not reached");
  });

  test("switches the curve, shows the worked example and credits the methods", async ({ page }) => {
    await openWorkbench(page, path);
    await page.getByRole("combobox", { name: "Stat" }).selectOption("ft_pct");
    await expect(page).toHaveURL(/stat=ft_pct/);
    await expect(page.getByRole("table", { name: "FT% bins" }).locator("tbody tr")).toHaveCount(8);
    const example = page.getByRole("table", { name: "Worked example" });
    const served = fixture.player.estimates.fg3_pct;
    expect(Number(await example.locator('tr[data-stat="fg3_pct"] [data-value]').nth(1).getAttribute("data-value"))).toBe(served.shrunk.value);
    await expect(page.getByText(fixture.player.selection_rule)).toBeVisible();
    for (const credit of ["Spearman 1910", "Efron and Morris (1975)", "Darryl Blackport"]) await expect(page.getByText(credit, { exact: false }).first()).toBeVisible();
  });

  test("is in the Research menu under Methods with an icon", async ({ page }) => {
    await openWorkbench(page, "/research/projected-impact");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const item = page.getByRole("menu", { name: "Research" }).getByRole("menuitem", { name: /Signal vs Noise/ });
    await expect(item).toBeVisible();
    await expect(item.locator("svg")).toBeVisible();
    await item.click();
    await expect(page).toHaveURL(url => url.pathname === path);
  });

  test("the Stats Shrunk toggle is off by default, adds labelled columns without re-running the query, and restores the table", async ({ page }) => {
    const calls: string[] = [];
    page.on("request", request => { if (/\/api\/(workbench|signal-noise)/.test(request.url())) calls.push(`${request.method()} ${new URL(request.url()).pathname}`); });
    await openWorkbench(page, "/stats?season=2025-26&phase=regular_season&viewId=shooting");
    const heads = page.locator("thead tr.stats-header-tier-2 th");
    const toggle = page.getByRole("button", { name: "Show shrunk shooting percentages" });
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    const before = await heads.allTextContents();
    expect(before.join(" ")).not.toContain("Shrunk");
    expect(calls.filter(call => call.includes("signal-noise"))).toEqual([]);
    const seen = calls.length;
    await toggle.click();
    await expect(page.getByRole("columnheader", { name: /3P%-Shrunk/ })).toBeVisible();
    for (const label of ["FT%-Shrunk", "TS%-Shrunk", "Rim FG%", "Rim FG%-Shrunk"]) await expect(page.getByRole("columnheader", { name: new RegExp(label) }).first()).toBeVisible();
    await expect(page).toHaveURL(/shrunk=1/);
    expect(calls.slice(seen)).toEqual(["GET /api/signal-noise/shrinkage"]);
    await expect(page.getByText(/raw columns are unchanged/)).toBeVisible();
    await toggle.click();
    await expect(page).not.toHaveURL(/shrunk=1/);
    await expect.poll(() => heads.allTextContents()).toEqual(before);
  });
});
