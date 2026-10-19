import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test.describe("Workbench Dark Research Interface", () => {
  test("home opens Stats with dark theme, horizontal navigation, context and data", async ({ page }) => {
    await openWorkbench(page);
    // Wait for streamed route hydration before interacting with the shell.
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/stats\?/);
    await expect(page.getByRole("banner").getByRole("link", { name: "CourtLens Research Workbench home" })).toContainText("CourtLens");
    const navigation = page.getByRole("navigation", { name: "Workspace Navigation" });
    await expect(navigation.getByRole("link", { name: "Stats", exact: true })).toBeVisible();
    for (const name of ["Live", "Players", "Teams", "Compare", "Research"]) {
      await navigation.getByRole("button", { name, exact: true }).click();
      await expect(navigation.getByRole("button", { name, exact: true })).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Escape");
      await expect(navigation.getByRole("button", { name, exact: true })).toHaveAttribute("aria-expanded", "false");
    }
    const moreBtn = page.getByRole("button", { name: "More options" });
    await moreBtn.click();
    await expect(page.getByRole("menuitem", { name: "Data Status" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: /^Season: / })).toContainText("2025-26");
    await expect(page.getByRole("heading", { level: 1, name: "NBA Player Statistics", exact: true })).toBeVisible();
    await expect(page.getByText("Fixture Star", { exact: true })).toBeVisible();
    await expect(page.getByText("Fixture Guard", { exact: true })).toBeVisible();
  });

  test("player explorer allows filtering and links to detail view", async ({ page }) => {
    await openWorkbench(page, "/players");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toHaveText("Player Directory");
    await expect(page.getByRole("link", { name: "Fixture Star", exact: true })).toBeVisible();

    // Filter by name
    const searchInput = page.getByRole("searchbox", { name: "Find player", exact: true });
    await searchInput.fill("Guard");
    await searchInput.press("Enter");
    await expect(page).toHaveURL(/name=Guard/);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("link", { name: "Fixture Guard", exact: true })).toBeVisible();

    // Navigate to player detail
    await page.getByRole("link", { name: "Fixture Guard", exact: true }).click();
    await page.waitForURL("**/players/24**");
    await expect(page.locator("h1")).toContainText("Fixture Guard");
  });

  test("player detail presents profile summaries, game logs, and lineage trigger", async ({ page }) => {
    await openWorkbench(page, "/players/23");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1")).toContainText("Fixture Star");
    await expect(page.getByText("Toronto Raptors").first()).toBeVisible();

    // FO09: the game log is its own profile tab and the URL keeps the tab.
    await page.getByRole("tab", { name: "Game Log" }).click();
    await expect(page).toHaveURL(/tab=games/);
    await expect(page.getByText("Prior Appearance Game Log")).toBeVisible();
    await expect(page.locator("td.font-mono:has-text('Apr 12, 2026')")).toBeVisible();

    // Verify lineage drawer button exists and opens drawer
    const lineageButton = page.locator("button:has-text('Lineage')").first();
    await expect(lineageButton).toBeVisible();
    await lineageButton.click();
    await expect(page.getByText("Source Lineage")).toBeVisible();
  });

  test("team stats list every team and navigate to team detail", async ({ page }) => {
    await openWorkbench(page, "/teams");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("NBA Team Stats");
    await expect(page.locator(".teams-grid tbody tr")).toHaveCount(2);
    await page.getByRole("link", { name: "TOR", exact: true }).click();
    await page.waitForURL("**/teams/100**");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Toronto Raptors");
  });

  test("comparison view displays head-to-head metrics without declaring forced winners", async ({ page }) => {
    await openWorkbench(page, "/compare?playerA=23&playerB=24");
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("heading", {level:1})).toHaveText("Player Comparison");
    await expect(page.getByRole("link", { name: "Fixture Star" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture Guard" })).toBeVisible();

    // Verify no winner banner or decision badge exists
    await expect(page.getByText(/^Winner:/)).not.toBeVisible();
    await expect(page.getByText("Better Player:")).not.toBeVisible();
  });

  test("forecasts view displays active policy, promotion decision, gates, and prespecified slices", async ({ page }) => {
    await page.goto("/forecasts");

    // FO12: the title matches the nav label; the policy leads the key-findings row.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Points Forecasts");
    const findings = page.getByRole("region", { name: "Key findings" });
    await expect(findings).toContainText("Active Forecast Policy");
    await expect(findings).toContainText("prior_blend");

    // Verify promotion decision banner and gates
    await expect(page.getByText("Promotion Decision:").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("DO_NOT_PROMOTE").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Gate 1: Validation Improvement >= 5%").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Gate 2: Final Paired Superiority").filter({ visible: true })).toBeVisible();

    // Verify holdout performance table
    await expect(page.getByText("Out-of-Time Performance on Holdout Block F").filter({ visible: true })).toBeVisible();
    await expect(page.locator("strong.font-mono:has-text('prior_blend')").first()).toBeVisible();
    await expect(page.locator("strong.font-mono:has-text('player_only')").first()).toBeVisible();

    // Verify slices table
    await expect(page.getByText("Prespecified Out-of-Time Error Slices").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Schedule Rest").first().filter({ visible: true })).toBeVisible();

    // Verify prospective issuance status and ledger table
    await expect(page.getByText("Genuine Prospective Issuance Status").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Awaiting 2026-27 Tipoff").filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Prospective Forecasts Ledger").filter({ visible: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture Star" })).toBeVisible();
  });

  test("dense dark research layout fits a 375px mobile viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openWorkbench(page);
    await page.waitForLoadState("networkidle");

    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth
    }));

    expect(dimensions.scroll).toBe(dimensions.client);
  });

  test("Ask drawer offers manual research and links to optional configuration", async ({ page }) => {
    await openWorkbench(page, "/players/23?experience=manual");
    await page.getByRole("button", { name: "Ask", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Research conversation" });
    await expect(dialog.getByRole("heading", { name: "Ask CourtLens" })).toBeVisible();
    await expect(dialog.getByLabel("Research operation", { exact: true })).toBeVisible();
    const textarea = dialog.getByLabel("Research question (optional label)", { exact: true });
    await textarea.fill("Compare Scottie Barnes and RJ Barrett");
    await expect(dialog.getByText("37 / 2000", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.goto("/settings");
    const card = page.getByRole("region", { name: "Assistant configuration", exact: true });
    await expect(card.getByRole("heading", { name: "Assistant", exact: true })).toBeVisible();
    await expect(card).toContainText("Limited mode");
    await expect(card).toContainText("Manual research needs no provider key");
    await card.getByText("Configuration Details", { exact: true }).click();
    await expect(card).toContainText("server-side Gemini key");
  });
});
