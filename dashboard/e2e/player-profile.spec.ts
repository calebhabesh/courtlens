import { expect, test } from "@playwright/test";

test("search opens a snapshot-pinned real route and changes replay date", async ({ page }) => {
  await page.goto(`/players?snapshotId=${snapshotId}`);
  await page.getByLabel("Player name").fill("Fixture");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await page.getByRole("link", { name: /Fixture Star/ }).click();

  await expect(page).toHaveURL(/players\/23\?date=2023-01-10&snapshotId=snapshot-browser-fixture/);
  await expect(page.getByRole("heading", { name: "Fixture Star" })).toBeVisible();
  await expect(page.getByText("45.5", { exact: true }).first()).toBeVisible();

  await page.getByLabel("Replay date").selectOption("2023-01-02");
  await page.getByRole("button", { name: "Change date" }).click();
  await expect(page).toHaveURL(/date=2023-01-02/);
  await expect(page.getByRole("heading", { name: "No history before this cutoff" }).first()).toBeVisible();
});

test("unsupported replay date keeps the input and offers recovery", async ({ page }) => {
  await page.goto(`/players/23?date=2023-01-09&snapshotId=${snapshotId}`);

  await expect(page.getByRole("heading", { name: "Replay date not supported" })).toBeVisible();
  await expect(page.locator("main").getByText("2023-01-09 is outside the available replay dates.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Return to player search" })).toBeVisible();
});

const snapshotId = "snapshot-browser-fixture";
