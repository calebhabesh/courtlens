import { expect, test, type Locator } from "@playwright/test";
import { readFileSync } from "node:fs";
import { openWorkbench } from "./workbench-navigation";

// Real R10 API answers (e2e/fixtures/r10-*.json): the pages must show them exactly.
const read = (name: string) => JSON.parse(readFileSync(`e2e/fixtures/r10-${name}.json`, "utf8"));
const wingspan = read("wingspan"), nearest = read("wingspan-nearest"), ff = read("four-factors"), seasons = read("four-factors-seasons");
const served = (value: string | null) => value === null || value === "" ? null : Number(value);
const value = async (cell: Locator) => served(await cell.getAttribute("data-value"));

type Player = { player_id: string; measured: boolean; wingspan: number | null; position: string | null; active: boolean | null };
const measured = (wingspan.players as Player[]).filter(p => p.measured)
  .sort((a, b) => (b.wingspan ?? 0) - (a.wingspan ?? 0) || a.player_id.localeCompare(b.player_id));

test.describe("R10 Wingspan beside D-DPM", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("shows every registered correlation, positional average and the headline", async ({ page }) => {
    await openWorkbench(page, "/wingspan");
    const table = page.getByRole("table", { name: "Correlations", exact: true });
    const all = [...wingspan.correlations, wingspan.partial];
    await expect(table.locator("tbody tr")).toHaveCount(all.length);
    for (const [i, c] of all.entries()) {
      const row = table.locator("tbody tr").nth(i);
      expect(await value(row.locator('[data-field="r"]'))).toBe(c.r);
      expect(served(await row.locator('[data-field="interval"]').getAttribute("data-low"))).toBe(c.low);
      expect(served(await row.locator('[data-field="interval"]').getAttribute("data-high"))).toBe(c.high);
      await expect(row.locator('[data-field="verdict"]')).toHaveAttribute("data-value", c.verdict);
      await expect(row.locator("[data-tone]")).toHaveCount(0);
    }
    await expect(page.locator('[data-field="headline"]')).toHaveAttribute("data-value", String(wingspan.correlations[0].r));
    const within = page.getByRole("table", { name: "Correlations within position" });
    await expect(within.locator("tbody tr")).toHaveCount(wingspan.within_position.length);
    const avg = page.getByRole("table", { name: "Positional averages" });
    for (const a of wingspan.positional_averages) {
      const row = avg.locator(`tr[data-row="${a.position}"]`);
      for (const k of ["height", "wingspan", "diff", "weight", "d_dpm"]) {
        expect(await value(row.locator(`[data-field="${k}"]`))).toBe(a[k].mean);
        await expect(row.locator(`[data-field="${k}"]`)).toHaveAttribute("data-n", String(a[k].n));
      }
    }
    await expect(page.locator("circle[data-player]")).toHaveCount(wingspan.population.analysis);
  });

  test("lists players longest wingspan first, filters by position and keeps unknowns blank", async ({ page }) => {
    await openWorkbench(page, "/wingspan");
    const table = page.getByRole("table", { name: "Wingspan players" });
    await expect(table.locator("tbody tr")).toHaveCount(50);
    const ids = await table.locator("tbody tr").evaluateAll(rows => rows.map(r => (r as HTMLElement).dataset.row));
    expect(ids).toEqual(measured.slice(0, 50).map(p => p.player_id));
    const unknown = (wingspan.players as { player_id: string; d_dpm: number | null }[]).find(p => ids.includes(p.player_id) && p.d_dpm === null)!;
    await expect(table.locator(`tr[data-row="${unknown.player_id}"] [data-field="d_dpm"]`)).toHaveAttribute("data-value", "");
    await page.getByRole("combobox", { name: "Position" }).selectOption("PG");
    await expect(page.locator('[data-field="player-count"]')).toHaveAttribute("data-value", String(measured.filter(p => p.position === "PG").length));
    await page.getByRole("combobox", { name: "Status" }).selectOption("active");
    await expect(page.locator('[data-field="player-count"]')).toHaveAttribute("data-value", String(measured.filter(p => p.position === "PG" && p.active === true).length));
  });

  test("shows nearest builds for the first row, then for a chosen player", async ({ page }) => {
    await openWorkbench(page, "/wingspan");
    const first = nearest[measured[0].player_id];
    const table = page.getByRole("table", { name: "Nearest builds" });
    await expect(table.locator("tbody tr")).toHaveCount(first.neighbours.length + 1);
    for (const [i, n] of first.neighbours.entries()) {
      const row = table.locator("tbody tr").nth(i + 1);
      await expect(row).toHaveAttribute("data-row", n.player_id);
      expect(await value(row.locator('[data-field="distance"]'))).toBe(n.distance);
    }
    await openWorkbench(page, "/wingspan?build=203497");
    await expect(table.locator("tbody tr").nth(1)).toHaveAttribute("data-row", nearest["203497"].neighbours[0].player_id);
  });
});

test.describe("R10 ORtg calculator inputs", () => {
  test.beforeEach(async ({ page }) => { await page.setViewportSize({ width: 1440, height: 900 }); });

  test("shows the latest season's league inputs, marginals, rebounds and teams", async ({ page }) => {
    await openWorkbench(page, "/calculator");
    const s = ff.seasons.at(-1), L = s.league;
    const league = page.getByRole("table", { name: "League inputs" });
    expect(await value(league.locator('tr[data-row="ortg"] [data-value]'))).toBe(L.ortg_factors);
    expect(await value(league.locator('tr[data-row="mu"] [data-value]'))).toBe(s.mu);
    for (const k of ["efg", "ftr", "tov_pct", "orb_pct", "fg", "ft"]) expect(await value(league.locator(`tr[data-row="${k}"] [data-value]`))).toBe(L.inputs[k]);
    const marginals = page.getByRole("table", { name: "Marginal value" });
    for (const [k, v] of Object.entries(L.marginals)) expect(await value(marginals.locator(`tr[data-row="${k}"] [data-value]`))).toBe(v);
    const rebounds = page.getByRole("table", { name: "Offensive rebounds by miss" });
    for (const [k, v] of Object.entries(L.rebounds_by_miss as Record<string, { orb_rate: number | null }>)) expect(await value(rebounds.locator(`tr[data-row="${k}"] [data-field="orb_rate"]`))).toBe(v.orb_rate);
    const teams = page.getByRole("table", { name: `Team inputs ${s.season}` });
    await expect(teams.locator("tbody tr")).toHaveCount(seasons[s.season].teams.length);
    for (const t of seasons[s.season].teams) expect(await value(teams.locator(`tr[data-row="${t.team}"] [data-field="ortg"]`))).toBe(t.ortg_factors);
    await expect(page.getByRole("table", { name: "mu by season" }).locator("tbody tr")).toHaveCount(ff.seasons.length);
  });

  test("switches season and compares 2024-25 with the paper", async ({ page }) => {
    await openWorkbench(page, "/calculator");
    await page.getByRole("combobox", { name: "Season" }).selectOption("2024-25");
    const s = ff.seasons.find((x: { season: string }) => x.season === "2024-25");
    await expect(page.getByRole("table", { name: "League inputs" }).locator('tr[data-row="ortg"] [data-value]')).toHaveAttribute("data-value", String(s.league.ortg_factors));
    await expect(page.getByRole("table", { name: "Team inputs 2024-25" }).locator("tbody tr")).toHaveCount(30);
    const paper = page.getByRole("table", { name: "Against the paper" });
    expect(await value(paper.locator('tr[data-row="mu"] [data-field="paper"]'))).toBe(0.425);
    expect(await value(paper.locator('tr[data-row="mu"] [data-field="courtlens"]'))).toBe(s.mu);
  });
});
