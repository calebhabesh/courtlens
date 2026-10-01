import { expect, test } from "@playwright/test";

test.describe("Workbench Dark Research Interface", () => {
  test("overview renders dense dark theme, navigation rail, context bar, and data", async ({ page }) => {
    await page.goto("/");

    // Verify dark mode & brand
    await expect(page.locator("aside.nav-rail")).toBeVisible();
    await expect(page.locator("aside.nav-rail .brand-title")).toHaveText("COURTLOAD");
    await expect(page.locator("aside.nav-rail .brand-subtitle")).toHaveText("Workbench");

    // Verify navigation links
    await expect(page.locator("nav.nav-rail-body a[href='/']")).toBeVisible();
    await expect(page.locator("nav.nav-rail-body a[href='/players']")).toBeVisible();
    await expect(page.locator("nav.nav-rail-body a[href='/teams']")).toBeVisible();
    await expect(page.locator("nav.nav-rail-body a[href='/compare']")).toBeVisible();
    await expect(page.locator("nav.nav-rail-body a[href='/forecasts']")).toBeVisible();
    await expect(page.locator("nav.nav-rail-body a[href='/data-status']")).toBeVisible();
    await expect(page.locator("nav.nav-rail-body a[href='/investigations']")).toBeVisible();
    await expect(page.locator("nav.nav-rail-body a[href='/settings']")).toBeVisible();
    await expect(page.locator("nav.nav-rail-body a[href='/methodology']")).toBeVisible();

    // Verify context bar
    await expect(page.locator(".context-bar")).toBeVisible();
    await expect(page.locator("select[aria-label='Filter by season']")).toHaveValue("2025-26");

    // Verify stat cards
    await expect(page.getByText("Serving Release")).toBeVisible();
    await expect(page.getByText("Eligible Players")).toBeVisible();
    await expect(page.getByText("Cached Portraits")).toBeVisible();

    // Verify player production leaders table
    await expect(page.getByText("Fixture Star")).toBeVisible();
    await expect(page.getByText("Fixture Guard")).toBeVisible();
  });

  test("player explorer allows filtering and links to detail view", async ({ page }) => {
    await page.goto("/players");

    await expect(page.locator("h1.page-title")).toHaveText("Player Explorer");
    await expect(page.getByText("Fixture Star")).toBeVisible();

    // Filter by name
    const searchInput = page.locator("input[placeholder*='Search by name']");
    await searchInput.fill("Guard");
    await page.locator("button[type='submit']").click();

    await expect(page.getByText("Fixture Guard")).toBeVisible();

    // Navigate to player detail
    await page.locator("a[href*='/players/24']").first().click();
    await page.waitForURL("**/players/24**");
    await expect(page.locator("h1.player-identity-name")).toContainText("Fixture Guard");
  });

  test("player detail presents profile summaries, game logs, and lineage trigger", async ({ page }) => {
    await page.goto("/players/23");

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

    await expect(page.locator("h1.page-title")).toHaveText("Team Research");
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
    await page.goto("/compare?playerA=23&playerB=24");

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
    await expect(page.getByText("Active Forecast Policy")).toBeVisible();
    await expect(page.locator(".panel-header .badge:has-text('points-v1-prior_blend')")).toBeVisible();

    // Verify promotion decision banner and gates
    await expect(page.getByText("Promotion Decision:")).toBeVisible();
    await expect(page.getByText("DO_NOT_PROMOTE")).toBeVisible();
    await expect(page.getByText("Gate 1: Validation Improvement >= 5%")).toBeVisible();
    await expect(page.getByText("Gate 2: Final Paired Superiority")).toBeVisible();

    // Verify holdout performance table
    await expect(page.getByText("Out-of-Time Performance on Holdout Block F")).toBeVisible();
    await expect(page.locator("strong.font-mono:has-text('prior_blend')").first()).toBeVisible();
    await expect(page.locator("strong.font-mono:has-text('player_only')").first()).toBeVisible();

    // Verify slices table
    await expect(page.getByText("Prespecified Out-of-Time Error Slices")).toBeVisible();
    await expect(page.getByText("Schedule Rest").first()).toBeVisible();

    // Verify prospective issuance status and ledger table
    await expect(page.getByText("Genuine Prospective Issuance Status")).toBeVisible();
    await expect(page.getByText("Awaiting 2026-27 Tipoff")).toBeVisible();
    await expect(page.getByText("Prospective Forecasts Ledger")).toBeVisible();
    await expect(page.getByRole("link", { name: "Fixture Star" })).toBeVisible();
  });

  test("dense dark research layout fits a 375px mobile viewport without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/");

    const dimensions = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth
    }));

    expect(dimensions.scroll).toBe(dimensions.client);
  });

  test("ask courtload assistant panel renders prompt chips and handles interaction", async ({ page }) => {
    await page.goto("/");

    // Verify Ask CourtLoad card
    await expect(page.getByRole("heading", { name: "Ask CourtLoad" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Raptors Defense" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Scottie Barnes Forecast" })).toBeVisible();

    // Verify typing into textarea
    const textarea = page.locator("textarea[placeholder*='Ask a question']");
    await expect(textarea).toBeVisible();
    await textarea.fill("Compare Scottie Barnes and RJ Barrett");
    await expect(page.getByText("37 / 2000 characters")).toBeVisible();

    // Verify Settings page shows assistant configuration
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Optional AI Assistant (Gemini Adapter)" })).toBeVisible();
    await expect(page.getByText("COURTLOAD_GEMINI_API_KEY")).toBeVisible();
  });
});


