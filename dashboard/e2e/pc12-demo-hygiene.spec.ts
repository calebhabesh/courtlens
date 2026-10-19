import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import retained from "./fixtures/pc12-retained-distribution.json";

for (const width of [1440, 768, 390, 375]) {
  test(`PC12 C populated demo entries at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWorkbench(page, "/evaluation");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Evaluation Archive");
    await expect(page.getByRole("figure", { name: "Final-Test Error" })).toContainText("Reference points =");
    await expect(page.getByText("Evaluation unavailable", { exact: false })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    if (width === 1440 || width === 390) await expect(page).toHaveScreenshot(`pc12-c-evaluation-${width}.png`, { animations: "disabled", maxDiffPixelRatio: 0.01 });

    await openWorkbench(page, "/playoffs");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Playoffs");
    await expect(page.getByRole("navigation", { name: "Live sections" }).locator('[aria-current="page"]')).toHaveText("Playoffs");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);

    await openWorkbench(page, "/investigations");
    const examples = page.getByRole("region", { name: "Public investigation examples" });
    await expect(examples.getByRole("link", { name: "Scottie Barnes: Scoring Distribution" })).toBeVisible();
    await expect(page.getByText(/B35[ab]/)).toHaveCount(0);
    await expect(page.getByRole("region", { name: "Legacy saved investigations" })).toHaveCount(0);
    await expect(page.getByText("3 retained examples unavailable.", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    if (width === 1440 || width === 390) await expect(page).toHaveScreenshot(`pc12-c-public-${width}.png`, { animations: "disabled", maxDiffPixelRatio: 0.01 });

    await examples.getByRole("link", { name: "Scottie Barnes: Scoring Distribution" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Scottie Barnes: Scoring Distribution");
    const chart = page.getByRole("figure", { name: "Total Points · Observed Games" });
    await expect(chart).toContainText("Total Points (points)");
    await expect(chart).toContainText("Returned Appearance · newest first");
    await expect(chart).toContainText("5 observed · 0 unknown");
    await expect(chart.locator("circle")).toHaveCount(5);
    await expect(page.getByText(/B35[ab]/)).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    if (width === 1440 || width === 390) await expect(page).toHaveScreenshot(`pc12-c-saved-${width}.png`, { animations: "disabled", maxDiffPixelRatio: 0.01 });
    await page.getByRole("button", { name: "Data Details", exact: true }).first().click();
    await expect(page.getByRole("dialog")).toContainText(retained.title);
    await expect(page.getByRole("dialog")).toContainText(retained.manifest_sha256);
  });
}

test("PC12 C an altered curated manifest keeps its original title and evidence", async ({ page }) => {
  await page.route(`**/assistant/investigations/${retained.id}`, route => route.fulfill({ json: { ...retained, manifest_sha256: "changed" } }));
  await page.goto(`/investigations/saved/${retained.id}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(retained.title);
  await expect(page.getByRole("heading", { name: "Scottie Barnes: Scoring Distribution" })).toHaveCount(0);
});

test("PC12 C explicit incompatible Evaluation stays selected until archive recovery", async ({ page }) => {
  await openWorkbench(page, "/evaluation?snapshotId=incompatible");
  await expect(page.getByText("Evaluation unavailable for the selected snapshot.", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/snapshotId=incompatible/);
  await page.getByRole("link", { name: "Open Evaluation Archive" }).click();
  await expect(page.getByRole("figure", { name: "Final-Test Error" })).toBeVisible();
  expect(new URL(page.url()).searchParams.has("snapshotId")).toBe(false);
});
