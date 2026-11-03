import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// ESPN's standings (alignment row 23), from real ESPN reads saved as fixtures.
const fixture = (season: string) => JSON.parse(readFileSync(`e2e/fixtures/live-standings-${season}.json`, "utf8"));

async function mock(page: Page) {
  await page.route("**/api/live/standings**", route => {
    const season = new URL(route.request().url()).searchParams.get("season") ?? "2026-27";
    try { return route.fulfill({ json: fixture(season) }); } catch { return route.fulfill({ status: 422, json: { detail: "no fixture" } }); }
  });
}

test("conference tables in seed order with the playoff and play-in lines", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/standings?season=2026-27");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("NBA Standings 2026-27");
  const east = page.getByRole("region", { name: "Eastern Conference", exact: true });
  await expect(east.locator("tbody tr")).toHaveCount(15);
  // ESPN's columns.
  for (const label of ["W", "L", "PCT", "GB", "HOME", "AWAY", "DIV", "CONF", "PPG", "OPP PPG", "DIFF", "STRK", "L10"]) {
    await expect(east.getByRole("columnheader", { name: label, exact: true }).or(east.getByRole("columnheader", { name: `Sort by ${label}` }))).toHaveCount(1);
  }
  // Lines after the 6th and the 10th from 2020-21 on.
  await expect(east.locator("tbody tr[data-line]")).toHaveCount(2);
  await expect(east.locator("tbody tr").nth(5)).toHaveAttribute("data-line", "true");
  await expect(east.locator("tbody tr").first().locator("td").nth(3)).toHaveText("-");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("league and division groupings, sorting and seasons", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/standings?season=2026-27");
  await page.getByRole("radio", { name: "Division" }).click();
  await expect(page).toHaveURL(/group=division/);
  await expect(page.locator(".standings-table")).toHaveCount(6);
  await page.getByRole("radio", { name: "League" }).click();
  await expect(page).toHaveURL(/group=league/);
  await expect(page.locator(".standings-table")).toHaveCount(1);
  await expect(page.locator(".standings-table tbody tr")).toHaveCount(30);
  // Sorting by points per game puts the best scorers first and drops the seeding lines.
  await page.getByRole("button", { name: "Sort by PPG" }).click();
  const ppg = await page.locator(".standings-table tbody tr td:nth-of-type(9)").allTextContents();
  expect(ppg.map(Number)).toEqual([...ppg.map(Number)].sort((a, b) => b - a));
  await page.getByRole("combobox", { name: "Season" }).selectOption("2018-19");
  await expect(page).toHaveURL(/season=2018-19/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("NBA Standings 2018-19");
  // Seeding lines show in seed order only; open the season fresh.
  await page.goto("/standings?season=2018-19&group=conference");
  // Before the play-in: one line, after the 8th.
  const east = page.getByRole("region", { name: "Eastern Conference", exact: true });
  await expect(east.locator("tbody tr[data-line]")).toHaveCount(1);
  await expect(east.locator("tbody tr").nth(7)).toHaveAttribute("data-line", "true");
  // A team links to its page for that season.
  await expect(east.getByRole("link", { name: "Milwaukee Bucks" })).toHaveAttribute("href", "/teams/MIL?season=2018-19");
});

test("phone standings scroll inside their tables", async ({ page }) => {
  await mock(page);
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/standings?season=2026-27");
  await expect(page.locator(".standings-table").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
