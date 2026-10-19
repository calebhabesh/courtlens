import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

const SCOPE = "releaseId=fixture-release&season=2025-26&beforeDate=2026-04-13";
const noOverflow = async (page: import("@playwright/test").Page, width: number) =>
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);

test("six-factor table keeps unknowns last, sorts and applies window and 3P luck", async ({ page }) => {
  await openWorkbench(page, `/teams?${SCOPE}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("NBA Team Stats");
  const rows = page.locator(".teams-grid tbody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText("TOR");
  // BOS has no defensive split: its cells read "—", and it stays last whichever way Net sorts.
  await expect(rows.last().locator("td").nth(7)).toContainText("—");
  await page.getByRole("button", { name: "Sort by Net", exact: true }).click();
  await expect(page).toHaveURL(/sort=net&dir=asc/);
  await expect(rows.last()).toContainText("BOS");
  await expect(page.locator(".teams-grid thead")).toContainText("oTS");
  await page.getByRole("radio", { name: "Last 30 Days", exact: true }).click();
  await expect(page).toHaveURL(/window=30/);
  await expect(page.locator(".teams-note")).toContainText("Last 30 Days: 40 games");
  await page.getByRole("button", { name: /^3P luck/ }).click();
  await page.getByRole("menuitem", { name: "League 3P%" }).first().click();
  await expect(page).toHaveURL(/offenseLuck=1/);
  await expect(rows.first().locator("td").first()).toContainText("114.4");
  await expect(rows.first().locator("a")).toHaveAttribute("href", /\/teams\/100\?season=2025-26&phase=regular_season&beforeDate=2026-04-13/);
});

test("conference selector shows the league's marks and ranks within the conference", async ({ page }) => {
  await openWorkbench(page, `/teams?${SCOPE}`);
  await expect(page.getByRole("img", { name: "Eastern Conference" })).toBeVisible();
  await page.getByRole("radio", { name: "Eastern Conference" }).click();
  await expect(page).toHaveURL(/conf=east/);
  await expect(page.locator(".teams-grid tbody tr")).toHaveCount(2);
  await expect(page.locator(".teams-note")).toContainText("Ranks are within the Eastern Conference.");
  await page.getByRole("radio", { name: "Western Conference" }).click();
  await expect(page.locator(".teams-empty")).toHaveText("No Western Conference teams in this scope.");
});

test("standings view seeds by record and the venue selector asks for one venue", async ({ page }) => {
  await openWorkbench(page, `/teams?${SCOPE}`);
  await page.getByRole("radio", { name: "Standings", exact: true }).click();
  await expect(page).toHaveURL(/view=standings/);
  const rows = page.locator(".teams-grid tbody tr");
  // BOS's better record seeds it first though TOR has the better net rating.
  await expect(rows.first()).toContainText("BOS");
  await expect(rows.first().locator("td").nth(1)).toContainText("55–17");
  await expect(rows.last().locator("td").nth(2)).toContainText("10.0");
  await expect(rows.last().locator("td").nth(4)).toContainText("W3");
  await expect(page.locator(".teams-grid thead")).toContainText("AdjNet");
  await expect(rows.last().locator("td").nth(7)).toContainText("+5.6");
  await expect(rows.last().locator("td").nth(10)).toContainText("9–7");
  const request = page.waitForRequest(r => r.url().includes("/teams/six-factors") && r.url().includes("venue=home"));
  await page.getByRole("radio", { name: "Home", exact: true }).click();
  await request;
  await expect(page).toHaveURL(/venue=home/);
  await expect(page.locator(".teams-note")).toContainText("Home games only");
});

for (const width of [1440, 390]) {
  test(`Team Stats views, cards and totals survive reload at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, `/teams?${SCOPE}`);
    await expect(page.locator(".teams-grid tbody tr")).toHaveCount(2);
    await noOverflow(page, width);
    await page.getByRole("radio", { name: "Defense", exact: true }).click();
    await expect(page.locator(".teams-grid thead")).toContainText("Opponent Rates");
    await expect(page).toHaveURL(/view=defense/);
    await page.getByRole("radio", { name: "Totals", exact: true }).click();
    await expect(page).toHaveURL(/counting=totals/);
    await page.getByRole("radio", { name: "Cards", exact: true }).click();
    await expect(page).toHaveURL(/layout=cards/);
    await page.reload();
    await expect(page.getByRole("radio", { name: "Cards", exact: true })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("radio", { name: "Totals", exact: true })).toHaveAttribute("aria-checked", "true");
    const cards = page.locator(".teams-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText("Toronto Raptors");
    await expect(cards.first().locator(".net-trend svg")).toBeVisible();
    await noOverflow(page, width);
  });

  test(`Team profile shows the team's Stats table, six factors, game log and peers at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, `/teams/100?${SCOPE}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Toronto Raptors");
    await expect(page.locator(".team-profile-head .ui-page-header-subtitle")).toContainText("45–27 · 2nd in the East · Net +5.2 (#1)");
    await expect(page.getByRole("region", { name: "Standing table" })).toContainText("+5.6");
    await expect(page.getByRole("region", { name: "Six factors table" })).toContainText("Offense");
    await expect(page.getByRole("region", { name: "Home and away table" })).toContainText("Home");
    await expect(page.getByRole("region", { name: "Net rating trend" }).locator(".net-trend svg")).toBeVisible();
    const game = page.getByRole("region", { name: "Recent games table" }).locator("tbody tr").filter({ hasText: "Mar 1, 2026" });
    await expect(game).toContainText("BOS");
    // A missing score stays unknown, never a loss or a zero margin.
    await expect(game.locator("td").nth(1)).toHaveText("—");
    await expect(game.locator("td").nth(3)).toHaveText("—");
    await expect(page.getByRole("region", { name: "Similar teams" })).toContainText("Boston Celtics");
    await noOverflow(page, width);
  });
}
