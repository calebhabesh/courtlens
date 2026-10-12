import { waitForStreamedPage } from "./workbench-navigation";
import { expect, test, type Page } from "@playwright/test";

async function tabTo(page: Page, selector: string) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await page.keyboard.press("Tab");
    if (await page.locator(selector).evaluate((element) => element === document.activeElement)) return;
  }
  throw new Error(`Keyboard focus did not reach ${selector}`);
}

test("shared-cutoff comparison keeps different target dates and missing context visible", async ({ page }) => {
  await page.goto("/compare?snapshotId=snapshot-browser-fixture");
  await page.waitForLoadState("networkidle");
  await page.getByRole("combobox",{name:"Player A",exact:true}).fill("Fixture");
  await page.getByRole("option").filter({hasText:"Fixture Star"}).click();
  await page.getByRole("combobox",{name:"Player B",exact:true}).fill("Fixture");
  await page.getByRole("option").filter({hasText:"Fixture Guard"}).click();

  await expect(page).toHaveURL(/playerA=23&playerB=24/);
  const evidence = page.getByRole("region", { name: "Side by side" });
  await expect(evidence.getByText(/Jan 11, 2023 · TOR/)).toBeVisible();
  await expect(evidence.getByText(/Jan 12, 2023 · BOS/)).toBeVisible();
  await expect(evidence.getByText("Insufficient opponent coverage")).toBeVisible();
  await expect(evidence.getByText("Estimate unavailable at this cutoff")).toBeVisible();
  await page.getByRole("button", { name: "Swap players" }).click();
  await expect(page).toHaveURL(/playerA=24&playerB=23/);
});

test("evaluation presents the no-promotion decision and failed build state", async ({ page }) => {
  await page.goto("/evaluation");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Evaluation Archive");
  await expect(page.getByText("No challenger promoted").filter({ visible: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Key findings" }).getByText("7.82 ref pts", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/failed · Sep 21, 2026/).filter({ visible: true })).toBeVisible();
});

test("comparison controls work by keyboard and fit a 375px viewport", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/compare?snapshotId=snapshot-browser-fixture");
  await page.waitForLoadState("networkidle");

  for(const label of ["Player A","Player B"]) {
    await tabTo(page, `[role="combobox"][aria-label="${label}"]`);
    await page.keyboard.type(label === "Player A" ? "Fixture Star" : "Fixture Guard");
    await page.getByRole("option").first().waitFor();
    await page.keyboard.press("ArrowDown");await page.keyboard.press("Enter");
  }

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

  await waitForStreamedPage(page);
  await expect(page.getByText("Unable to compare.", {exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Remove Fixture Star from Player A",exact:true})).toBeVisible();
  await expect(page.getByLabel("Replay date")).toHaveValue("2023-01-09");
  await page.getByLabel("Replay date").selectOption("2023-01-02");

  await expect(page.getByText("No reconstructed target")).toHaveCount(2);
  await expect(page.getByText("Fewer than 5 valid games")).toHaveCount(2);
});
