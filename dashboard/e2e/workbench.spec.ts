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
    await expect(page.getByRole("menuitem", { name: "Data status" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Settings" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByLabel("Filter by season")).toHaveValue("2025-26");
    await expect(page.getByRole("heading", { name: "Stats Explorer" })).toBeVisible();
    await expect(page.getByText("Fixture Star", { exact: true })).toBeVisible();
    await expect(page.getByText("Fixture Guard", { exact: true })).toBeVisible();
  });

  test("player explorer allows filtering and links to detail view", async ({ page }) => {
    await openWorkbench(page, "/players");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1.page-title")).toHaveText("Player Explorer");
    await expect(page.getByRole("link", { name: "Fixture Star", exact: true })).toBeVisible();

    // Filter by name
    const searchInput = page.getByRole("combobox", { name: "Filter players by name", exact: true });
    await searchInput.fill("Guard");
    await searchInput.press("Enter");
    await expect(page).toHaveURL(/name=Guard/);
    await page.waitForLoadState("networkidle");

    await expect(page.getByRole("link", { name: "Fixture Guard", exact: true })).toBeVisible();

    // Navigate to player detail
    await page.getByRole("button", { name: "Open details for Fixture Guard" }).click();
    await page.getByRole("link", { name: "View Full Profile →" }).click();
    await page.waitForURL("**/players/24**");
    await expect(page.locator("h1.player-identity-name")).toContainText("Fixture Guard");
  });

  test("player detail presents profile summaries, game logs, and lineage trigger", async ({ page }) => {
    await openWorkbench(page, "/players/23");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1.player-identity-name")).toContainText("Fixture Star");
    await expect(page.getByText("Toronto Raptors").first()).toBeVisible();

    // Verify summaries tabs or panels
    await expect(page.getByText("Prior Appearance Game Log")).toBeVisible();
    await expect(page.locator("td.font-mono:has-text('2026-04-12')")).toBeVisible();

    // Verify lineage drawer button exists and opens drawer
    const lineageButton = page.locator("button:has-text('Lineage')").first();
    await expect(lineageButton).toBeVisible();
    await lineageButton.click();
    await expect(page.getByText("Source Lineage")).toBeVisible();
  });

  test("team research lists cohorts and navigates to team detail", async ({ page }) => {
    await page.goto("/teams");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1.page-title")).toHaveText("Team Explorer");
    await expect(page.getByText("Toronto Raptors")).toBeVisible();
    await expect(page.getByText("Boston Celtics")).toBeVisible();

    // Standings notice
    await expect(page.getByText("Official standings notice:")).toBeVisible();

    // Navigate to team detail
    await page.locator("a[href*='/teams/100']").first().click();
    await page.waitForURL("**/teams/100**");
    await expect(page.locator("h1.player-identity-name")).toContainText("Toronto Raptors");
  });

  test("comparison view displays head-to-head metrics without declaring forced winners", async ({ page }) => {
    await openWorkbench(page, "/compare?playerA=23&playerB=24");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1.page-title")).toHaveText("Compare Players");
    await expect(page.getByRole("link", { name: "Fixture Star" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture Guard" })).toBeVisible();

    // Verify no winner banner or decision badge exists
    await expect(page.getByText(/^Winner:/)).not.toBeVisible();
    await expect(page.getByText("Better Player:")).not.toBeVisible();
  });

  test("forecasts view displays active policy, promotion decision, gates, and prespecified slices", async ({ page }) => {
    await page.goto("/forecasts");

    await expect(page.locator("h1.page-title")).toHaveText("Points Forecasts & Protocol");
    await expect(page.locator("main").getByRole("heading", { name: "Active Forecast Policy" })).toBeVisible();
    await expect(page.locator(".panel-header .badge:has-text('points-v1-prior_blend')").filter({ visible: true })).toBeVisible();

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
    await card.getByText("Configuration details", { exact: true }).click();
    await expect(card).toContainText("server-side Gemini key");
  });
});
