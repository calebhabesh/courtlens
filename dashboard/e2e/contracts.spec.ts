import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import { contractsRefresh, mockContracts } from "./finance-fixture";

// Alignment row 14: Databallr's Contracts on the real captured DEN and TOR books.
test("first load opens Select Team; closing it leaves the unfilled page", async ({ page }) => {
  await mockContracts(page); await openWorkbench(page, "/contracts");
  const dialog = page.getByRole("dialog", { name: "Select Team" });
  await expect(dialog.getByRole("button", { name: "Denver Nuggets" })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get("refresh")).toBe(contractsRefresh);
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(page.getByRole("heading", { name: "Select a Team" })).toBeVisible();
  await page.getByRole("button", { name: "Choose Team" }).click();
  await page.getByRole("dialog", { name: "Select Team" }).getByRole("button", { name: "Denver Nuggets" }).click();
  await expect(page).toHaveURL(/team=DEN/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Denver Nuggets Contracts");
});

test("overview reads known salaries against the apron lines and never counts unknowns", async ({ page }) => {
  await mockContracts(page); await openWorkbench(page, `/contracts?team=DEN&refresh=${contractsRefresh}`);
  const total = page.getByRole("region", { name: "Total Payroll" });
  await expect(total).toContainText("$221.1M");
  await expect(total).toContainText("Above 1st Apron");
  await expect(total).toContainText("Below 2nd Apron");
  await expect(total).toContainText("7 blank on the source page, not counted as $0");
  await expect(page.getByRole("note")).toContainText("Dane Goodwin");
  const timeline = page.getByRole("table", { name: "Contract timeline" });
  await expect(timeline.getByRole("row", { name: /N\. Jokić/ }).locator("[data-mark=player-option]")).toHaveText("$62.8M");
  await expect(timeline.getByRole("row", { name: /Goodwin/ })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Payroll flow chart" })).toContainText("Nikola Jokić");
  await expect(page.getByRole("region", { name: "High Earners" })).toContainText("$8M+ only");
});

test("later seasons are projected from the same book without official lines", async ({ page }) => {
  await mockContracts(page); await openWorkbench(page, `/contracts?team=DEN&refresh=${contractsRefresh}`);
  await page.getByLabel("Contract season").selectOption("2027-28");
  await expect(page).toHaveURL(/year=2027-28/);
  await expect(page.getByRole("region", { name: "Cap Utilization" })).toContainText("2027-28 has none yet");
  await expect(page.getByRole("region", { name: "Total Payroll" })).toContainText("Projected from the 2026-27 book");
});

test("Small vs Big splits at the threshold and maps only DARKO-listed players", async ({ page }) => {
  await mockContracts(page); await openWorkbench(page, `/contracts?team=TOR&tab=small-big&refresh=${contractsRefresh}`);
  const small = page.getByRole("region", { name: "Small contract list" });
  await expect(page.getByText("12 of 15 contracts have a DARKO value")).toBeVisible();
  await expect(page.getByRole("region", { name: "Big contract list" })).toContainText("Kawhi Leonard");
  await expect(small.getByRole("row", { name: /Allen Graves/ })).toContainText("N/A");
  await page.getByLabel("Contract threshold in millions").fill("30");
  await expect(page).toHaveURL(/split=30/);
  await expect(small).toContainText("RJ Barrett");
});

test("old team links redirect to the one Contracts page", async ({ page }) => {
  await mockContracts(page); await openWorkbench(page, `/contracts/DEN?refresh=${contractsRefresh}`);
  await expect(page).toHaveURL(/\/contracts\?team=DEN/);
});

test("phone width has no page overflow on the team view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockContracts(page); await openWorkbench(page, `/contracts?team=DEN&refresh=${contractsRefresh}`);
  await expect(page.getByRole("region", { name: "Total Payroll" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
