import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import { contractsRefresh, mockContracts } from "./finance-fixture";

test("first load pins the latest refresh and shows the league payroll board", async ({ page }) => {
  await mockContracts(page); await openWorkbench(page, "/contracts");
  await expect.poll(() => new URL(page.url()).searchParams.get("refresh")).toBe(contractsRefresh);
  const board = page.getByRole("list", { name: "Known reported salary by team, highest first" });
  await expect(board.getByRole("listitem")).toHaveCount(30);
  await expect(board.getByRole("listitem").first()).toContainText("NYK");
  await expect(page.getByText("464 / 622")).toBeVisible();
  await expect(page.getByText(/158 active players have no reported 2026-27 salary/)).toBeVisible();
  await board.getByRole("link", { name: "DEN" }).click();
  await expect(page).toHaveURL(/\/contracts\/DEN\?refresh=/);
});

test("team view keeps unknown salaries out of totals and labels options", async ({ page }) => {
  await mockContracts(page); await openWorkbench(page, `/contracts/DEN?refresh=${contractsRefresh}`);
  await expect(page.getByText("14 / 21")).toBeVisible();
  await expect(page.getByText("7 roster salaries are unknown and excluded from every total and chart.")).toBeVisible();
  const timeline = page.getByRole("region", { name: "Contract timeline by period" });
  await expect(timeline.getByRole("row", { name: /Nikola Jokić/ })).toContainText("Player option");
  await expect(timeline.getByRole("row", { name: /Dane Goodwin/ })).toContainText("Unknown");
  const roster = page.getByRole("region", { name: "Roster contracts and impact" });
  await expect(roster.getByRole("row", { name: /Dane Goodwin/ })).toContainText("Blank on source page");
  await expect(roster.getByRole("row", { name: /Nikola Jokić/ })).toContainText("+6.9");
  await page.getByLabel("Choose team").selectOption("MIL");
  await expect(page).toHaveURL(/\/contracts\/MIL\?refresh=/);
  await expect(page.getByRole("heading", { name: "Also on MIL's source page" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Damian Lillard" })).toBeVisible();
});

test("free agency is removed and redirects to contracts", async ({ page }) => {
  await mockContracts(page); await openWorkbench(page, "/free-agency");
  await expect(page).toHaveURL(/\/contracts(\?|$)/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Contracts & Payroll");
});

test("phone width has no page overflow on the team view", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockContracts(page); await openWorkbench(page, `/contracts/DEN?refresh=${contractsRefresh}`);
  await expect(page.getByRole("region", { name: "Roster contracts and impact" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
