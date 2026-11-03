// The /wowy operation UI was replaced in PC11 by stint-derived pair splits (e2e/pc11-gated-pages.spec.ts);
// these checks cover the shared-floor operations, including Stat Line Shift's.
import { expect, test } from "@playwright/test";
import { firstLoadFixtures } from "./first-load-fixtures";
import { openWorkbench } from "./workbench-navigation";
import { readFileSync } from "node:fs";
const empty = JSON.parse(readFileSync("../docs/evidence/b21-api-smoke.json", "utf8")).response;

test.beforeEach(async ({ page }) => {
  await page.route("**/api/workbench/operations/*", async route => {
    const req = route.request().postDataJSON();
    const response = structuredClone(empty);
    response.operation = route.request().url().split("/").pop();
    response.request = { ...empty.request, ...req };
    const ids = [...req.together, ...req.apart, ...req.exact_unit];
    response.partitions = Array.from({ length: 2 ** ids.length }, (_, mask) => ({
      ...structuredClone(empty.cells[0]), key: `partition-${mask}`,
      present: ids.filter((_: string, index: number) => mask & (1 << index)),
      absent: ids.filter((_: string, index: number) => !(mask & (1 << index)))
    }));
    response.evidence_hash = `fixture-${response.operation}-${req.together?.join("-")}-${req.exact_unit?.join("-")}`;
    response.context = { ...response.context, season: req.season || "2023-24", release_id: req.release_id || "fixture-release", before_date: req.before_date || "2024-04-15" };
    await route.fulfill({ json: response });
  });
});

// Stat Line Shift (row 13 follow-up 6): the page opens on Select Team; closing it leaves the page
// unfilled, and picking a team from there loads the roster in the latest season.
test("stat line shift opens on the team picker and can start unfilled", async ({ page }) => {
  await firstLoadFixtures(page);
  await openWorkbench(page, "/stat-line-shift");
  const dialog = page.getByRole("dialog", { name: "Select Team" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /close/i }).first().click();
  await expect(page.getByText("Select a team to begin")).toBeVisible();
  await expect(page.locator(".sls-tray")).toHaveCount(0);
  await page.locator(".sls-empty").getByRole("button", { name: "Select Team" }).click();
  await page.getByRole("dialog", { name: "Select Team" }).getByRole("button", { name: "Toronto Raptors" }).click();
  await expect(page).toHaveURL(/team=TOR/);
  await expect(page.locator(".sls-tray-item")).toHaveCount(20);
  await expect(page.getByLabel("Season", { exact: true })).toHaveValue("2025-26");
});

// Follow-ups 12–13: the roster drawer spans the screen's foot; picking the chosen team again, or
// Clear Team, returns to the unfilled page and empties the drawer.
test("stat line shift drawer spans the screen and a team can be deselected", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await firstLoadFixtures(page);
  await openWorkbench(page, "/stat-line-shift?team=TOR&season=2025-26");
  const drawer = page.getByRole("complementary", { name: "Roster" });
  const box = (await drawer.boundingBox())!;
  expect([box.x, box.x + box.width, box.y + box.height]).toEqual([0, 1440, 900]);
  await drawer.getByRole("button", { name: "Change Team" }).click();
  await page.getByRole("dialog", { name: "Select Team" }).getByRole("button", { name: "Toronto Raptors" }).click();
  await expect(page.getByText("Select a team to begin")).toBeVisible();
  await expect(drawer).toHaveCount(0);
  await page.locator(".sls-empty").getByRole("button", { name: "Select Team" }).click();
  await page.getByRole("dialog", { name: "Select Team" }).getByRole("button", { name: "Toronto Raptors" }).click();
  await expect(page.locator(".sls-tray-item")).toHaveCount(20);
  await drawer.getByRole("button", { name: "Change Team" }).click();
  await page.getByRole("dialog", { name: "Select Team" }).getByRole("button", { name: "Clear Team" }).click();
  await expect(drawer).toHaveCount(0);
  await expect(page).not.toHaveURL(/team=/);
});

// Customize Stats (follow-up 8) applies only on Save Changes.
test("customize stats saves grouped column choices", async ({ page }) => {
  await firstLoadFixtures(page);
  await openWorkbench(page, "/stat-line-shift?team=TOR&season=2025-26&players=1630567");
  await page.getByRole("button", { name: "Customize Stats" }).click();
  const dialog = page.getByRole("dialog", { name: "Customize Stats" });
  await dialog.getByText("ORTG", { exact: true }).click();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page).not.toHaveURL(/stats=/);
  await page.getByRole("button", { name: "Customize Stats" }).click();
  await dialog.getByRole("button", { name: "Clear All" }).click();
  await expect(dialog.getByRole("button", { name: "Save Changes" })).toBeDisabled();
  await dialog.getByText("PTS", { exact: true }).click();
  await dialog.getByText("ORTG", { exact: true }).click();
  await dialog.getByRole("button", { name: "Save Changes" }).click();
  await expect(page).toHaveURL(/stats=pts%2Cortg|stats=pts,ortg/);
  await expect(page.getByRole("region", { name: "Teammate stat shifts" }).locator("thead")).toContainText("ORTG");
});

// Stat Line Shift (alignment row 13): one subject's teammate table and the two-player cards.
test("stat line shift shows each teammate without and with the subject, then the pair cards", async ({ page }) => {
  await firstLoadFixtures(page);
  await openWorkbench(page, "/stat-line-shift?team=TOR&season=2025-26");
  await expect(page.getByText("Select one or two players")).toBeVisible();
  const tray = page.getByRole("complementary", { name: "Roster" });
  await tray.getByRole("button", { name: /Scottie Barnes/ }).click();
  await expect(page).toHaveURL(/players=1630567/);
  const table = page.getByRole("region", { name: "Teammate stat shifts" });
  await expect(table.locator("tbody tr")).toHaveCount(8);
  await expect(table.locator("tbody tr").first()).toContainText("Brandon Ingram");
  await expect(table.locator("thead")).toContainText("USG");
  await tray.getByRole("button", { name: /Immanuel Quickley/ }).click();
  await expect(page.locator(".sls-card")).toHaveCount(2);
  await expect(page.locator(".sls-card").first()).toContainText("With Immanuel");
  await page.locator(".sls-full-tables").getByRole("button", { name: "Scottie Barnes" }).click();
  await expect(page).toHaveURL(/players=1630567(&|$)/);
});

test("Stats on/off preset opens served per-team rating columns", async ({ page }) => {
  await openWorkbench(page, "/stats?preset=onoff&together=1");
  await expect(page.getByRole("heading", { level: 1, name: "NBA Player Statistics", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "On-Off", exact: true })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("columnheader").filter({ hasText: "Net on/off" })).toBeVisible();
});
