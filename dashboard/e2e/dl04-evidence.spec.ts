import fs from "node:fs/promises";
import path from "node:path";
import { test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test.describe("DL04 Evidence Screenshot Capture", () => {
  const evidenceDir = path.resolve(process.cwd(), "../docs/evidence/dl04");

  test.beforeAll(async () => {
    await fs.mkdir(evidenceDir, { recursive: true });
  });

  const routes = [
    { name: "stats", path: "/stats" },
    { name: "players", path: "/players" },
    { name: "player-profile", path: "/players/23" },
    { name: "teams", path: "/teams" },
    { name: "team-detail", path: "/teams/100" },
    { name: "team-compare", path: "/team-compare" },
    { name: "compare", path: "/compare" },
  ];

  for (const { name, path: routePath } of routes) {
    test(`captures ${name} at 1440px and 375px`, async ({ page }) => {
      // Desktop 1440x900
      await page.setViewportSize({ width: 1440, height: 900 });
      await openWorkbench(page, routePath);
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(evidenceDir, `${name}-1440.png`),
        fullPage: true,
      });

      // Mobile 375x812
      await page.setViewportSize({ width: 375, height: 812 });
      await openWorkbench(page, routePath);
      await page.waitForTimeout(500);
      await page.screenshot({
        path: path.join(evidenceDir, `${name}-375.png`),
        fullPage: true,
      });
    });
  }
});
