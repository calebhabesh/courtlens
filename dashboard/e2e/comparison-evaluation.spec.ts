import { expect, test, type Page } from "@playwright/test";

async function tabTo(page: Page, selector: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await page.locator(selector).evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Keyboard focus did not reach ${selector}`);
}

test("shared-cutoff comparison keeps different target dates and missing context visible", async ({ page }) => {
  await page.goto("/compare");
  await page.getByLabel("Player A").fill("Fixture");
  await page.getByRole("button", { name: "Search" }).first().click();
  await page.getByRole("button", { name: "Fixture Star" }).click();
  await page.getByLabel("Player B").fill("Fixture");
  await page.getByRole("button", { name: "Search" }).last().click();
  await page.getByRole("button", { name: "Fixture Guard" }).click();
  await page.getByRole("button", { name: "Compare players" }).click();

  await expect(page).toHaveURL(/playerA=23&playerB=24/);
  await expect(page.getByText(/2023-01-11 · TOR/)).toBeVisible();
  await expect(page.getByText(/2023-01-12 · BOS/)).toBeVisible();
  await expect(page.getByText("Insufficient opponent coverage")).toBeVisible();
  await expect(page.getByText("Estimate unavailable at this cutoff")).toBeVisible();
  await page.getByRole("button", { name: "Swap players" }).click();
  await page.getByRole("button", { name: "Compare players" }).click();
  await expect(page).toHaveURL(/playerA=24&playerB=23/);
});

test("evaluation presents the no-promotion decision and failed build state", async ({ page }) => {
  await page.goto("/evaluation");
  await expect(page.getByRole("heading", { name: "Evaluation" })).toBeVisible();
  await expect(page.getByText("No challenger promoted")).toBeVisible();
  await expect(page.getByText("7.82", { exact: true })).toBeVisible();
  await expect(page.getByText(/failed · 2026-09-21/)).toBeVisible();
});

test("comparison controls work by keyboard and fit a 375px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/compare");

  await tabTo(page, "#compare-query-0");
  await page.keyboard.type("Fixture");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Fixture Star" }).waitFor();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await tabTo(page, "#compare-query-1");
  await page.keyboard.type("Fixture");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Fixture Guard" }).waitFor();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Tab");
  await page.keyboard.press("Enter");
  await tabTo(page, 'button[type="submit"]');
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Side by side" })).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    client: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(dimensions.scroll).toBe(dimensions.client);
});

test("invalid date preserves selections and recovers to sparse history", async ({ page }) => {
  await page.goto(
    "/compare?playerA=23&playerB=24&date=2023-01-09&snapshotId=snapshot-browser-fixture"
  );

  await expect(page.getByRole("heading", { name: "Unable to compare" })).toBeVisible();
  await expect(page.getByText("Selected: Player 23")).toBeVisible();
  await expect(page.getByLabel("Replay date")).toHaveValue("2023-01-09");
  await page.getByLabel("Replay date").selectOption("2023-01-02");
  await page.getByRole("button", { name: "Compare players" }).click();

  await expect(page.getByText("No reconstructed target")).toHaveCount(2);
  await expect(page.getByText("Fewer than 5 valid games")).toHaveCount(2);
});
