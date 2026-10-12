import fs from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test.describe("DL07 Evidence Screenshot Capture", () => {
  const evidenceDir = path.resolve(process.cwd(), "../docs/evidence/dl07");

  test.beforeAll(async () => {
    await fs.mkdir(evidenceDir, { recursive: true });
  });

  const routes = [
    { name: "ask", path: "/research/ask" },
    { name: "contracts", path: "/contracts" },
    { name: "settings", path: "/settings" },
    { name: "data-status", path: "/data-status" },
    { name: "methodology", path: "/methodology" },
    { name: "tierlist", path: "/tierlist" },
    { name: "forecasts", path: "/forecasts" },
    { name: "calculator", path: "/calculator" },
    { name: "learning", path: "/learning" },
    { name: "patch-notes", path: "/patch-notes" },
    { name: "blog", path: "/blog" },
  ];

  for (const { name, path: routePath } of routes) {
    test(`captures ${name} at 1440px and 375px`, async ({ page }) => {
      // Desktop 1440x900
      await page.setViewportSize({ width: 1440, height: 900 });
      await openWorkbench(page, routePath);
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(evidenceDir, `${name}-1440.png`),
        fullPage: true,
      });

      // Mobile 375x812
      await page.setViewportSize({ width: 375, height: 812 });
      await openWorkbench(page, routePath);
      await page.waitForTimeout(600);
      await page.screenshot({
        path: path.join(evidenceDir, `${name}-375.png`),
        fullPage: true,
      });
    });
  }

  test("captures ask-drawer attached to player context at 1440px and 375px", async ({ page }) => {
    // Desktop 1440x900
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/players/23");
    await page.waitForTimeout(600);
    const askBtn = page.locator(".courtlens-ask-btn");
    if (await askBtn.isVisible()) {
      await askBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(evidenceDir, "ask-drawer-1440.png"),
        fullPage: true,
      });
    }

    // Mobile 375x812
    await page.setViewportSize({ width: 375, height: 812 });
    await openWorkbench(page, "/players/23");
    await page.waitForTimeout(600);
    const askBtnMobile = page.locator(".courtlens-ask-btn");
    if (await askBtnMobile.isVisible()) {
      await askBtnMobile.click();
      await page.waitForTimeout(400);
      await page.screenshot({
        path: path.join(evidenceDir, "ask-drawer-375.png"),
        fullPage: true,
      });
    }
  });
});
