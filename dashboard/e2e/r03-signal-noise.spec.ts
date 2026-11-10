import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real answers of the R03 API (e2e/fixtures/signal-noise.json): the page must show them exactly. Layout from RD13.
const fixture = JSON.parse(readFileSync("e2e/fixtures/signal-noise.json", "utf8"));
const stats: { key: string; label: string; levels: Record<string, { status: string; n: number | null; extrapolated: number | null }> }[] = fixture.summary.stabilization.stats;
const path = "/research/signal-noise";

test.describe("R03 Signal vs Noise", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("draws every stat with its served stabilization point, and never presents an extrapolation as reached (RD13)", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Signal vs Noise");
    for (const family of ["percentage", "per_36"] as const) {
      if (family === "per_36") await page.getByRole("radio", { name: "Per 36 minutes" }).click();
      const familyStats = stats.filter(stat => (fixture.summary.stabilization.stats as { key: string; family: string }[]).find(s => s.key === stat.key)?.family === family);
      const strip = page.locator(`[data-chart="strip"][data-family="${family}"] .sn-strip-row`);
      await expect(strip).toHaveCount(familyStats.length);
      const grid = page.getByRole("table", { name: "Stabilization points" });
      await expect(grid.locator("tbody tr")).toHaveCount(familyStats.length);
      for (const stat of familyStats) {
        const level = stat.levels["0.5"];
        const row = page.locator(`.sn-strip-row[data-stat="${stat.key}"]`);
        await expect(row).toHaveAttribute("data-status", level.status);
        if (level.status === "reached") expect(Number(await row.getAttribute("data-value"))).toBe(level.n);
        else {
          await expect(row).toContainText("Not reached");
          await expect(row.locator(".sn-track-dot")).toHaveCount(0);
          await expect(grid.locator(`tr[data-stat="${stat.key}"]`)).toContainText("Not reached");
          expect(Number(await grid.locator(`tr[data-stat="${stat.key}"] [data-field="level-0.5"]`).getAttribute("data-extrapolated"))).toBe(level.extrapolated);
        }
      }
    }
    // No hashes or project codes in the visible body; they live in the collapsed About.
    const visible = await page.locator("main").innerText();
    for (const code of [fixture.summary.results_sha256.slice(0, 16), "courtlens-signal-noise", "R03"]) expect(visible).not.toContain(code);
    await expect(page.locator("#about")).toContainText(fixture.summary.results_sha256.slice(0, 16));
    // The example season and the curve stat (grouped by family) are the page's two selects.
    expect(await page.locator("select").count()).toBe(2);
  });

  test("3P%'s curve draws its bins but no fitted line; a reached stat draws both", async ({ page }) => {
    await openWorkbench(page, path);
    const curve = page.locator('[data-chart="curve"]');
    await expect(curve).toHaveAttribute("data-stat", "fg3_pct");
    await expect(curve).toHaveAttribute("data-fitted", "not-drawn");
    await expect(curve.locator(".sn-bin")).toHaveCount(8);
    await expect(page.locator('[data-field="curve-not-drawn"]')).toBeVisible();
    await expect(curve.locator('[data-field="curve-mark"]')).toHaveCount(0);
    await page.getByLabel("Curve stat").selectOption("ft_pct");
    await expect(page).toHaveURL(/stat=ft_pct/);
    await expect(curve).toHaveAttribute("data-fitted", "drawn");
    // The strip's marks on the curve: each reached level at its served point and interval, and the typical season.
    const ft = fixture.summary.stabilization.stats.find((s: { key: string }) => s.key === "ft_pct");
    for (const level of ["0.5", "0.7"]) {
      const mark = curve.locator(`[data-field="curve-mark"][data-level="${level}"]`);
      expect(Number(await mark.getAttribute("data-n"))).toBe(ft.levels[level].n);
      expect(Number(await mark.getAttribute("data-low"))).toBe(ft.levels[level].interval.low);
      expect(Number(await mark.getAttribute("data-high"))).toBe(ft.levels[level].interval.high);
    }
    expect(Number(await curve.locator('[data-field="curve-typical"]').getAttribute("data-n"))).toBe(ft.median_sample);
    await expect(page.locator('[data-field="curve-line"]')).toContainText("free-throw attempts");
    await expect(page.getByRole("table", { name: "FT% bins", includeHidden: true }).locator("tbody tr")).toHaveCount(8);
  });

  test("a stat name in the strip selects its curve without moving the page; the chart icon beside it goes there", async ({ page }) => {
    await openWorkbench(page, path);
    const row = page.locator('.sn-strip-row[data-stat="fg_pct"]');
    await row.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    await row.getByRole("button", { name: "Choose FG% for the reliability curve" }).click();
    await expect(page).toHaveURL(/stat=fg_pct/);
    await expect(page.locator('[data-chart="curve"]')).toHaveAttribute("data-stat", "fg_pct");
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    await page.locator('.sn-strip-row[data-stat="fg2_pct"]').getByRole("button", { name: "Go to the 2P% curve" }).click();
    await expect(page.locator('[data-chart="curve"]')).toHaveAttribute("data-stat", "fg2_pct");
    await expect.poll(() => page.evaluate(() => Math.abs(document.getElementById("curve")!.getBoundingClientRect().top))).toBeLessThan(200);
  });

  test("shows the worked example in a card with search in place, and credits the methods", async ({ page }) => {
    await openWorkbench(page, path);
    const card = page.locator(".sn-card");
    await expect(card).toHaveAttribute("data-player", fixture.player.player_id);
    await expect(card.getByRole("link", { name: fixture.player.player_name })).toBeVisible();
    await expect(page.locator('.sn-card [data-team="POR"] img')).toHaveCount(1);
    const example = page.getByRole("table", { name: "Worked example" });
    expect(Number(await example.locator('tr[data-stat="fg3_pct"] [data-field="shrunk"]').getAttribute("data-value"))).toBe(fixture.player.estimates.fg3_pct.shrunk.value);
    await expect(page.getByText(fixture.player.selection_rule)).toBeVisible();
    await card.getByRole("button", { name: `Replace ${fixture.player.player_name}` }).click();
    await expect(card.getByRole("combobox", { name: "Search players" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(card.getByRole("link", { name: fixture.player.player_name })).toBeVisible();
    await page.getByRole("radiogroup", { name: "Season path" }).getByRole("radio", { name: "FT%" }).click();
    await expect(page.locator('[data-chart="path"]')).toHaveAttribute("data-path", "ft_pct");
    await page.locator("#about summary").click();
    for (const credit of ["Spearman 1910", "Efron and Morris (1975)", "Darryl Blackport"]) await expect(page.getByText(credit, { exact: false }).first()).toBeVisible();
  });

  test("the what-if starts at the served shrunk value and follows the sliders with the served prior", async ({ page }) => {
    await openWorkbench(page, path);
    const box = page.locator('[data-chart="what-if"]');
    const e = fixture.player.estimates.fg3_pct;
    await expect(box).toHaveAttribute("data-stat", "fg3_pct");
    expect(Number(await box.getAttribute("data-shrunk"))).toBeCloseTo(e.shrunk.value, 12);
    await expect(box.getByRole("button", { name: /season$/ })).toHaveCount(0);
    await box.getByRole("slider", { name: /Attempts/ }).fill("400");
    await expect(box).toHaveAttribute("data-attempts", "400");
    const makes = Math.round((e.makes / e.attempts) * 400);
    expect(Number(await box.getAttribute("data-shrunk"))).toBeCloseTo((makes + e.prior.alpha) / (400 + e.prior.alpha + e.prior.beta), 12);
    await expect(box.locator('[data-field="whatif-counts"]')).toHaveText(`${makes} / 400`);
    await box.getByRole("button", { name: `${fixture.player.player_name}'s season` }).click();
    await expect(box).toHaveAttribute("data-attempts", String(e.attempts));
    await box.getByRole("radio", { name: "FT%" }).click();
    await expect(box).toHaveAttribute("data-stat", "ft_pct");
    expect(Number(await box.getAttribute("data-shrunk"))).toBeCloseTo(fixture.player.estimates.ft_pct.shrunk.value, 12);
  });

  test("on a phone the shrinkage test shows gains or errors, never a sideways-scrolling table", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openWorkbench(page, path);
    const test = page.getByRole("table", { name: "Shrinkage test" });
    await expect(test.locator('tbody tr[data-stat="fg3_pct"] [data-field="raw_minus_shrunk"]')).toHaveCount(1);
    await expect(test.locator('tbody tr[data-stat="fg3_pct"] [data-field="mse-raw"]')).toHaveCount(0);
    await page.getByRole("radio", { name: "Errors, RMSE" }).click();
    await expect(test.locator('tbody tr[data-stat="fg3_pct"] [data-field="mse-raw"]')).toHaveCount(1);
    await expect(test.locator('tbody tr[data-stat="fg3_pct"] [data-field="raw_minus_shrunk"]')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test("the shrinkage test colours a gain only where its 95% interval excludes zero", async ({ page }) => {
    await openWorkbench(page, path);
    const test = page.getByRole("table", { name: "Shrinkage test" });
    await expect(test.locator("tbody tr")).toHaveCount(5);
    await page.getByRole("radio", { name: "Under 50" }).click();
    await expect(page).toHaveURL(/band=under/);
    for (const stat of ["fg3_pct", "ts_pct"]) {
      const cell = test.locator(`tr[data-stat="${stat}"] [data-field="prior_minus_shrunk"]`);
      expect(Number(await cell.getAttribute("data-low"))).toBeLessThan(0);
      await expect(cell.locator("[data-tone]")).toHaveCount(0);
    }
    await expect(test.locator('tr[data-stat="fg3_pct"] [data-field="raw_minus_shrunk"] [data-tone="good"]')).toHaveCount(1);
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
