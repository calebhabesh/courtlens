import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real R09 API answers (e2e/fixtures/draft-*.json): the page must show them exactly.
const read = (name: string) => JSON.parse(readFileSync(`e2e/fixtures/draft-${name}.json`, "utf8"));
const summary = read("summary"), classes = read("classes"), combine = read("combine"), rookies = read("rookies"), rookie = read("rookie");
const path = "/draft";
const STATS = ["mpg", "pts36", "reb36", "ast36", "stl36", "blk36", "tov36", "ts"];
// The page writes an unknown value as an empty data-value.
const served = (value: string | null) => value === null || value === "" ? null : Number(value);

test.describe("R09 Draft Classes", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("opens on the rookie tracker and shows every compared rookie's values and percentiles", async ({ page }) => {
    await openWorkbench(page, path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Draft Classes");
    const table = page.getByRole("table", { name: "2026-27 rookies" });
    await expect(table.locator("tbody tr")).toHaveCount(rookies.rookies.length);
    for (const r of rookies.rookies) {
      const row = table.locator(`tr[data-pick="${r.pick}"]`);
      if (r.state !== "compared") { await expect(row.locator('[data-field="state"]')).toHaveText("No games yet"); continue; }
      for (const stat of STATS) {
        const cell = row.locator(`[data-field="${stat}"]`);
        const c = r.comparison.stats[stat];
        expect(served(await cell.getAttribute("data-value"))).toBe(c.value);
        expect(served(await cell.getAttribute("data-percentile"))).toBe(c.percentile);
        const outside = c.value !== null && c.n >= 5 && (c.value > c.p90 || c.value < c.p10) && stat !== "mpg";
        const tone = await cell.getAttribute("data-tone");
        if (!outside) expect(tone).toBeNull();
        else if (stat === "tov36") expect(tone).toBe(c.value > c.p90 ? "negative" : "positive");
        else expect(tone).toBe(c.value > c.p90 ? "positive" : "negative");
      }
      expect(served(await row.locator('[data-field="darko"]').getAttribute("data-value"))).toBe(r.darko?.dpm ?? null);
    }
    await expect(page.locator('[data-field="compared"]')).toHaveAttribute("data-value", String(rookies.rookies.filter((r: { state: string }) => r.state === "compared").length));
  });

  test("lists the chosen rookie's same-pick predecessors at the same game count", async ({ page }) => {
    await openWorkbench(page, `${path}?rookie=${rookie.rookie.player_id}`);
    const table = page.getByRole("table", { name: /Past number \d+ picks at \d+ games/ });
    await expect(table.locator("tbody tr")).toHaveCount(rookie.comparisons.length + 1);
    for (const c of rookie.comparisons) {
      const row = table.locator(`tr[data-row="${c.player_id}"]`);
      expect(Number(await row.locator('[data-field="games"]').getAttribute("data-value"))).toBe(c.games);
      expect(served(await row.locator('[data-field="pts36"]').getAttribute("data-value"))).toBe(c.pts36);
      expect(c.games).toBeLessThanOrEqual(rookie.rookie.comparison.line.games);
    }
  });

  test("value by pick: chart points and table equal the served slots, and controls live in the URL", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=value`);
    const points = page.locator("circle[data-slot]");
    await expect(points).toHaveCount(60);
    const rows = summary.value_by_pick.window.all.ws;
    for (const point of await points.all()) {
      const slot = Number(await point.getAttribute("data-slot"));
      expect(Number(await point.getAttribute("data-value"))).toBe(rows[slot - 1].mean);
    }
    await page.getByRole("radiogroup", { name: "Classes" }).getByRole("radio", { name: "1989 on" }).click();
    await page.getByRole("radiogroup", { name: "Measure" }).getByRole("radio", { name: "Minutes" }).click();
    await expect(page).toHaveURL(/era=two_round/);
    await expect(page).toHaveURL(/measure=min/);
    const table = page.locator('table[data-table="value-by-pick"]');
    await expect(table).toHaveAttribute("data-era", "two_round");
    const expected = summary.value_by_pick.window.two_round.min;
    for (const slot of [1, 14, 30, 60]) {
      const cell = table.locator(`tr[data-row="${slot}"] [data-field="mean"]`);
      expect(Number(await cell.getAttribute("data-value"))).toBe(expected[slot - 1].mean);
    }
    const bands = page.locator('table[data-table="bands"] tbody tr');
    for (const row of await bands.all()) {
      const cell = row.locator('[data-field="diff"]');
      const low = Number(await cell.getAttribute("data-low")), high = Number(await cell.getAttribute("data-high"));
      expect(await cell.getAttribute("data-tone")).toBe(low > 0 ? "positive" : high < 0 ? "negative" : null);
    }
  });

  test("a complete class is redrafted with logos and the served ranks; a recent class is not", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=classes&year=1984&order=redraft`);
    const table = page.getByRole("table", { name: "1984 draft class" });
    await expect(table.locator("tbody tr")).toHaveCount(classes["1984"].rows.length);
    const first = table.locator("tbody tr").first();
    await expect(first).toHaveAttribute("data-row", String(classes["1984"].rows.find((r: { redraft_window: number }) => r.redraft_window === 1).pick));
    const jordan = table.locator('tr[data-row="3"]');
    await expect(jordan).toContainText("Michael Jordan");
    await expect(jordan.locator('[data-field="team"] img, [data-field="team"] .team-logo').first()).toBeVisible();
    expect(Number(await jordan.locator('[data-field="career_ws"]').getAttribute("data-value"))).toBe(classes["1984"].rows[2].career_ws);
    await openWorkbench(page, `${path}?tab=classes&year=2024`);
    const recent = page.getByRole("table", { name: "2024 draft class" });
    await expect(recent).toHaveAttribute("data-order", "draft");
    await expect(recent.locator('[data-field="expected"]')).toHaveCount(0);
    await expect(page.getByText(/Only 2 of four seasons have been played/)).toBeVisible();
  });

  test("steals, misses and combine correlations equal the served values", async ({ page }) => {
    await openWorkbench(page, `${path}?tab=steals`);
    const steals = page.getByRole("table", { name: "Steals" });
    await expect(steals.locator("tbody tr")).toHaveCount(summary.steals.length);
    for (const s of summary.steals.slice(0, 5)) {
      const row = steals.locator(`tr[data-row="${s.year}-${s.pick}"]`);
      expect(Number(await row.locator('[data-field="surplus"]').getAttribute("data-value"))).toBe(s.surplus_window_ws);
    }
    await expect(page.getByRole("table", { name: "Misses" }).locator("tbody tr")).toHaveCount(summary.misses.length);
    await openWorkbench(page, `${path}?tab=combine`);
    const table = page.getByRole("table", { name: "Combine correlations" });
    for (const c of combine.correlations.filter((x: { outcome: string }) => x.outcome === "window_ws")) {
      expect(Number(await table.locator(`tr[data-row="${c.measure}"] [data-field="r_ws"]`).getAttribute("data-value"))).toBe(c.r);
    }
    const plotted = combine.rows.filter((r: { wingspan: number | null; window_ws: number | null }) => r.wingspan !== null && r.window_ws !== null).length;
    await expect(page.locator("circle[data-player]")).toHaveCount(plotted);
  });

  test("is in the Research menu under Tools with an icon", async ({ page }) => {
    await openWorkbench(page, "/stats");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const item = page.getByRole("menu", { name: "Research" }).getByRole("menuitem", { name: /Draft Classes/ });
    await expect(item).toHaveAttribute("href", "/draft");
    await expect(item.locator("svg").first()).toBeVisible();
  });

  test("the phone layout does not scroll sideways and shows the results hash", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    for (const tab of ["", "?tab=value", "?tab=classes", "?tab=steals", "?tab=combine"]) {
      await openWorkbench(page, `${path}${tab}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Draft Classes");
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
    }
    await expect(page.getByText(summary.registration.results_sha256.slice(0, 16))).toBeVisible();
  });
});
