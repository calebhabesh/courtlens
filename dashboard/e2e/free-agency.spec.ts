import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import { mockFreeAgency } from "./finance-fixture";

// Alignment row 14: NBA.com's 2026 class as sealed on 2026-10-19 (238 players), kept current with Wikipedia's
// moves (revision 1381121598) and ESPN's rosters, both from 2026-10-20.
test("tracker tiles, status chips, search and class filters", async ({ page }) => {
  await mockFreeAgency(page); await openWorkbench(page, "/free-agency");
  const summary = page.getByRole("region", { name: "Tracker summary" });
  await expect(summary).toContainText("Tracked234");
  await expect(summary).toContainText("Abroad29");
  await expect(summary).toContainText("71%");
  const table = page.getByRole("region", { name: "Free agents" });
  await expect(table.getByRole("row")).toHaveCount(236);
  // Default sort: NBA.com points per game, highest first; Westbrook (retired per NBA.com's note) is left out.
  await expect(table.getByRole("row").nth(2)).toContainText("Jeff Green");
  await expect(table.getByRole("row", { name: /Russell Westbrook/ })).toHaveCount(0);
  // NBA.com still lists Russell's July trade to MEM; Wikipedia has him signing in China on Sep 30.
  const russell = table.getByRole("row", { name: /D'Angelo Russell/ });
  await expect(russell).toContainText("Abroad");
  await expect(russell).toContainText("Shanghai Sharks (China) ·\u00a0Sep\u00a030");
  await expect(russell).toContainText("NBA.com: Signed");
  // NBA.com says unsigned; Wikipedia dates his Utah deal (Oct 17) and ESPN's Jazz roster agrees.
  const bradley = table.getByRole("row", { name: /Tony Bradley/ });
  await expect(bradley).toContainText("UTA");
  await expect(bradley).toContainText("Signed ·\u00a0Oct\u00a017");
  await expect(bradley).toContainText("NBA.com: Unsigned");
  // Cut by NYK in camp: unsigned, as NBA.com says, so the note is not flagged.
  const brown = table.getByRole("row", { name: /Bruce Brown/ });
  await expect(brown).toContainText("Cut by NYK in camp");
  await expect(brown.locator(".fa-roster-flag")).toHaveCount(0);
  await expect(summary).toContainText("Rosters as of");
  await expect(summary).toContainText("Wikipedia as of");
  await expect(summary.locator(".fa-summary-note[data-stale]")).toHaveCount(0);
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: /Signed/ }).click();
  await expect(page).toHaveURL(/status=signed/);
  await expect(table.getByRole("row")).toHaveCount(75);
  await expect(table.getByRole("row", { name: /LeBron James/ })).toContainText("PHI");
  await page.getByLabel("Search player, team, or source note").fill("traded");
  await expect(page).toHaveURL(/q=traded/);
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: /Abroad/ }).click();
  await expect(table.getByRole("row", { name: /D'Angelo Russell/ })).toContainText("Russell traded to MEM");
  await page.getByLabel("Search player, team, or source note").fill("");
  await expect(page).not.toHaveURL(/q=/);
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: /All/ }).click();
  await expect(page).not.toHaveURL(/status=/);
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: /Retired/ }).click();
  await expect(table.getByRole("row")).toHaveCount(6);
  await expect(table.getByRole("row", { name: /Russell Westbrook/ })).toContainText("Retired");
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: /Changed Since Tracker/ }).click();
  await expect(table.getByRole("row")).toHaveCount(48);
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: /All/ }).click();
  await expect(page).not.toHaveURL(/status=/);
  await page.getByRole("radio", { name: "RFA" }).click();
  await expect(page).toHaveURL(/class=rfa/);
  await expect(table.getByRole("row")).toHaveCount(86);
  // Deal terms are not on the source: every row reads unknown.
  await expect(table.locator(".fa-terms").first()).toHaveText("—");
});

test("an unconfigured tracker says so instead of showing an empty market", async ({ page }) => {
  await mockFreeAgency(page, false); await openWorkbench(page, "/free-agency");
  await expect(page.getByText("No free-agent tracker snapshot is installed yet.")).toBeVisible();
  await expect(page.getByRole("region", { name: "Free agents" })).toHaveCount(0);
});

test("phone width keeps the table in its own scroll region", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockFreeAgency(page); await openWorkbench(page, "/free-agency");
  await expect(page.getByRole("region", { name: "Free agents" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
