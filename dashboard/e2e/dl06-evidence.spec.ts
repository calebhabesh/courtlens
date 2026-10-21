import fs from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test.describe("DL06 Evidence Screenshot Capture", () => {
  const evidenceDir = path.resolve(process.cwd(), "../docs/evidence/dl06");

  test.beforeAll(async () => {
    await fs.mkdir(evidenceDir, { recursive: true });
  });

  const routes = [
    { name: "shot-profile-twin", path: "/shot-profile-twin" },
    { name: "shot-aftermath", path: "/shot-aftermath" },
    { name: "wowy", path: "/wowy" },
    { name: "matchups", path: "/matchups" },
    { name: "distributions", path: "/research/distributions" },
    { name: "trends", path: "/research/trends" },
    { name: "similarity", path: "/research/similarity" },
    { name: "case-studies", path: "/research/case-studies" },
    { name: "stat-line-shift", path: "/stat-line-shift" },
    { name: "wingspan", path: "/wingspan" },
    { name: "investigations", path: "/investigations" },
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
});
