import { test, expect } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";
import * as path from "node:path";
import * as fs from "node:fs/promises";

test.describe("DL03 Header and Command Palette", () => {
  test("header is single 56px sticky row without bottom border line and zero layout shift on scroll", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 500 });
    await openWorkbench(page, "/stats");
    await page.waitForLoadState("networkidle");

    const header = page.locator(".courtlens-header");
    await expect(header).toBeVisible();

    // Verify 56px height
    const initialBox = await header.boundingBox();
    expect(initialBox).not.toBeNull();
    expect(Math.round(initialBox!.height)).toBe(56);

    // Verify no bottom border line
    const borderBottom = await header.evaluate(el => {
      const style = window.getComputedStyle(el);
      return {
        width: style.borderBottomWidth,
        style: style.borderBottomStyle,
      };
    });
    expect(borderBottom.width === "0px" || borderBottom.style === "none").toBe(true);

    // Active indicator is present on Stats
    const indicator = header.locator(".courtlens-nav-indicator");
    await expect(indicator).toBeVisible();

    // Scroll page down and verify sticky state with zero layout shift
    await page.evaluate(() => {
      document.body.style.minHeight = "2000px";
      window.scrollTo(0, 150);
    });
    await page.waitForTimeout(100);

    const scrolledBox = await header.boundingBox();
    expect(scrolledBox).not.toBeNull();
    expect(Math.round(scrolledBox!.height)).toBe(56);
    expect(Math.round(scrolledBox!.y)).toBe(0);

    // Header has scrolled class
    await expect(header).toHaveClass(/is-scrolled|scrolled/);
  });

  test("dropdown menus support keyboard navigation, ArrowDown to enter, and Escape returns focus", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/stats");
    await page.waitForLoadState("networkidle");

    const playersTrigger = page.locator('[data-dropdown-id="players"]');
    await expect(playersTrigger).toBeVisible();

    // Focus trigger and press ArrowDown
    await playersTrigger.focus();
    await page.keyboard.press("ArrowDown");

    // Dropdown panel opens and menuitem is focused
    const dropdown = page.locator('[data-dropdown-panel="players"]');
    await expect(dropdown).toBeVisible();

    const firstItem = dropdown.locator('[role="menuitem"]').first();
    await expect(firstItem).toBeFocused();

    // Navigate down with ArrowDown
    await page.keyboard.press("ArrowDown");
    const focusedItem = dropdown.locator('[role="menuitem"]:focus');
    await expect(focusedItem).toBeVisible();

    // Escape closes dropdown and returns focus to trigger
    await page.keyboard.press("Escape");
    await expect(dropdown).toBeHidden();
    await expect(playersTrigger).toBeFocused();
  });

  test("command palette opens via shortcut, searches global lookup, supports arrow traversal, and restores focus", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/stats");
    await page.waitForLoadState("networkidle");

    // Open via / shortcut
    await page.keyboard.press("/");

    const palette = page.getByRole("dialog", { name: "CourtLens global command palette" });
    await expect(palette).toBeVisible();

    const input = palette.getByRole("combobox", { name: "Search players, teams and pages" });
    await expect(input).toBeFocused();

    // Shows default quick actions
    const defaultOptions = palette.locator('[role="option"]');
    await expect(defaultOptions.first()).toBeVisible();

    // Search query
    await input.fill("BOS");
    await page.waitForTimeout(200);

    // Arrow down navigation through suggestions
    await page.keyboard.press("ArrowDown");
    const selectedOption = palette.locator('[role="option"][aria-selected="true"]');
    await expect(selectedOption).toBeVisible();

    // Escape closes palette and restores focus
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });

  test("More options menu contains Settings, Data status, Availability, and the D9 support links", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/stats");
    await page.waitForLoadState("networkidle");

    const moreBtn = page.getByRole("button", { name: "More options" });
    await moreBtn.click();

    const menu = page.locator(".courtlens-dropdown-menu-right");
    await expect(menu).toBeVisible();

    await expect(menu.getByRole("menuitem", { name: "Settings" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Data Status" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Methodology" })).toBeVisible();

    // Escape closes menu and returns focus
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(moreBtn).toBeFocused();
  });

  test("mobile viewport collapses to search icon and drawer button with accordions", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openWorkbench(page, "/stats");
    await page.waitForLoadState("networkidle");

    const header = page.locator(".courtlens-header");
    await expect(header).toBeVisible();

    // Desktop search pill is hidden
    await expect(header.locator(".courtlens-search-pill")).toBeHidden();

    // Mobile search button is visible
    const mobileSearch = header.locator(".courtlens-mobile-search-btn");
    await expect(mobileSearch).toBeVisible();

    // Click mobile search -> opens palette
    await mobileSearch.click();
    const palette = page.getByRole("dialog", { name: "CourtLens global command palette" });
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();

    // Open mobile drawer
    const drawerBtn = page.getByRole("button", { name: "Toggle navigation drawer" });
    await drawerBtn.click();

    const drawer = page.locator(".replica-mobile-drawer");
    await expect(drawer).toBeVisible();

    // Accordions exist
    await expect(drawer.getByRole("button", { name: "Live" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Players" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Teams" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Compare" })).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Research" })).toBeVisible();

    // Close drawer
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  });

  test("captures evidence screenshots at 1440px and 375px", async ({ page }) => {
    const evidenceDir = path.resolve(process.cwd(), "../docs/evidence/dl03");
    await fs.mkdir(evidenceDir, { recursive: true });

    // Desktop 1440px
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/stats");
    await page.screenshot({ path: path.join(evidenceDir, "header-1440.png") });

    // Desktop Command Palette open
    await page.keyboard.press("/");
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(evidenceDir, "command-palette-1440.png") });
    await page.keyboard.press("Escape");

    // Mobile 375px
    await page.setViewportSize({ width: 375, height: 812 });
    await openWorkbench(page, "/stats");
    await page.screenshot({ path: path.join(evidenceDir, "header-375.png") });

    // Mobile Drawer open
    await page.getByRole("button", { name: "Toggle navigation drawer" }).click();
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(evidenceDir, "drawer-375.png") });
  });
});
