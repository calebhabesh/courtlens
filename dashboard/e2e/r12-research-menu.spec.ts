import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test.describe("Research menu without a landing page", () => {
  test("/research goes to Six-Factor RAPM, and the menu has no Overview", async ({ page }) => {
    await openWorkbench(page, "/research");
    await expect(page).toHaveURL(url => url.pathname === "/research/rapm/six-factor");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const menu = page.getByRole("menu", { name: "Research" });
    await expect(menu.getByRole("menuitem", { name: /Six-Factor RAPM/ })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: /Research Overview/ })).toHaveCount(0);
    await expect(page.locator(".courtlens-dropdown-section-title", { hasText: "Overview" })).toHaveCount(0);
  });

  test("the section headers are blue capitals, apart from the white item names and grey descriptions", async ({ page }) => {
    await openWorkbench(page, "/stats");
    await page.getByRole("button", { name: "Research", exact: true }).click();
    const heading = page.locator(".courtlens-dropdown-section-title", { hasText: "Tools" });
    await expect(heading).toHaveCSS("color", "rgb(128, 191, 255)");
    await expect(heading).toHaveCSS("text-transform", "uppercase");
    await expect(heading).toHaveCSS("font-weight", "700");
  });
});
