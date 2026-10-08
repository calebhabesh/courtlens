import fs from "node:fs/promises";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

declare global {
  interface Window {
    __cls_score: number;
    __long_tasks: Array<{ name: string; duration: number; startTime: number }>;
  }
}

test.describe("DL08 Performance, Loading Skeletons & Action Toasts Evidence", () => {
  const evidenceDir = path.resolve(process.cwd(), "../docs/evidence/dl08");

  test.beforeAll(async () => {
    await fs.mkdir(evidenceDir, { recursive: true });
  });

  const setupPerfObserver = async (page: Page) => {
    await page.addInitScript(() => {
      window.__cls_score = 0;
      window.__long_tasks = [];

      try {
        const clsObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            // Layout shift entry
            const ls = entry as unknown as { hadRecentInput?: boolean; value: number };
            if (!ls.hadRecentInput) {
              window.__cls_score += ls.value;
            }
          }
        });
        clsObserver.observe({ type: "layout-shift", buffered: true });
      } catch {}

      try {
        const longTaskObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            window.__long_tasks.push({
              name: entry.name,
              duration: entry.duration,
              startTime: entry.startTime,
            });
          }
        });
        longTaskObserver.observe({ type: "longtask", buffered: true });
      } catch {}
    });
  };

  const getPageMetrics = async (page: Page) => {
    return await page.evaluate(() => {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      const paint = performance.getEntriesByType("paint");
      const fcp = paint.find((p) => p.name === "first-contentful-paint")?.startTime ?? 0;

      const domEnd = nav?.domContentLoadedEventEnd || 0;
      // Tasks that occurred during initial page load/hydration that took > 50ms
      const initialLoadTasks = (window.__long_tasks || []).filter(
        (t) => t.startTime <= domEnd + 200 && t.duration > 50
      );

      return {
        cls: Number((window.__cls_score || 0).toFixed(4)),
        fcp: Math.round(fcp),
        domInteractive: Math.round(nav?.domInteractive || 0),
        loadComplete: Math.round(nav?.loadEventEnd || 0),
        totalLongTasks: (window.__long_tasks || []).length,
        initialLoadLongTasksOver50ms: initialLoadTasks.length,
        maxInitialLoadTaskDurationMs:
          initialLoadTasks.length > 0 ? Math.round(Math.max(...initialLoadTasks.map((t) => t.duration))) : 0,
        allLongTasks: window.__long_tasks || [],
      };
    });
  };

  // 1. Performance measurements across the 4 key pages
  const targetPages = [
    { name: "stats", path: "/stats" },
    { name: "player-profile", path: "/players/2544" },
    { name: "team-detail", path: "/teams/1610612747" },
    { name: "ask", path: "/research/ask" },
  ];

  for (const { name, path: routePath } of targetPages) {
    test(`measures performance and CLS on ${name} (${routePath})`, async ({ page }) => {
      await setupPerfObserver(page);
      await page.setViewportSize({ width: 1440, height: 900 });

      const startTime = Date.now();
      await openWorkbench(page, routePath);
      await page.waitForTimeout(600); // Allow animations and layout to settle
      const elapsed = Date.now() - startTime;

      const metrics = await getPageMetrics(page);
      console.log(`[PERF ${name}] CLS: ${metrics.cls}, tasks:`, JSON.stringify(metrics.allLongTasks));

      // Assert CLS per contract: CLS <= 0.05
      expect(metrics.cls).toBeLessThanOrEqual(0.05);

      // Now test active animation: reset task log and trigger interactive animation
      await page.evaluate(() => {
        window.__long_tasks = [];
      });

      // Trigger hover / focus animation on visible header element
      const headerItem = page.locator(".courtlens-search-pill, .courtlens-brand").first();
      if (await headerItem.isVisible()) {
        await headerItem.hover();
        await page.waitForTimeout(350); // duration of enter transition
      }

      const animationTasks = await page.evaluate(() => {
        return (window.__long_tasks || []).filter((t) => t.duration > 50);
      });
      expect(animationTasks.length).toBe(0);

      const pagePerf = {
        route: routePath,
        elapsedMs: elapsed,
        ...metrics,
        animationLongTasksOver50ms: animationTasks.length,
        maxAnimationTaskDurationMs:
          animationTasks.length > 0 ? Math.round(Math.max(...animationTasks.map((t) => t.duration))) : 0,
      };
      await fs.writeFile(
        path.join(evidenceDir, `${name}-perf.json`),
        JSON.stringify(pagePerf, null, 2),
        "utf-8"
      );

      // Capture desktop and mobile page state
      await page.screenshot({
        path: path.join(evidenceDir, `${name}-1440.png`),
        fullPage: true,
      });

      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(300);
      await page.screenshot({
        path: path.join(evidenceDir, `${name}-375.png`),
        fullPage: true,
      });
    });
  }

  // 2. Action Toast Verification and Screenshot Capture
  test("verifies action toast notification lifecycle and appearance", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/settings");
    await page.waitForTimeout(500);

    // Click "Acquire more portraits" button to trigger job and toast
    const acquireBtn = page.getByRole("button", { name: "Acquire more portraits" });
    await expect(acquireBtn).toBeVisible();
    await acquireBtn.click();

    // Verify toast appears
    const toast = page.locator(".ui-toast");
    await expect(toast).toBeVisible({ timeout: 5000 });
    await expect(toast.locator(".ui-toast-title")).toContainText("Portrait Job Enqueued");

    // Capture desktop toast screenshot
    await page.screenshot({
      path: path.join(evidenceDir, "toast-action-1440.png"),
      fullPage: false,
    });

    // Dismiss toast via close button
    const closeBtn = toast.locator(".ui-toast-close");
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await expect(toast).not.toBeVisible({ timeout: 2000 });
    }

    // Now test on mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await page.waitForTimeout(300);
    await acquireBtn.click();
    await expect(toast).toBeVisible({ timeout: 5000 });
    await page.screenshot({
      path: path.join(evidenceDir, "toast-action-375.png"),
      fullPage: false,
    });
  });

  // 3. Route transitions and template enter
  test("verifies route enter transition presence without height collapse", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openWorkbench(page, "/stats");

    const routeEnter = page.locator(".route-enter");
    await expect(routeEnter).toBeVisible();

    // Verify it doesn't cause zero height or layout overflow
    const box = await routeEnter.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(400);
    expect(box!.width).toBeGreaterThan(1000);
  });

  // 4. Dedicated Loading Skeleton Visual Capture
  test("captures layout-matching route loading skeletons at 1440px and 375px", async ({ page }) => {
    const skeletonOptions = [
      { name: "stats", label: "Stats" },
      { name: "player", label: "Player" },
      { name: "live", label: "Live" },
      { name: "root", label: "Root" },
    ];

    for (const { name, label } of skeletonOptions) {
      // Desktop 1440x900
      await page.setViewportSize({ width: 1440, height: 900 });
      await openWorkbench(page, "/design");
      await page.waitForTimeout(400);

      const optionBtn = page.getByRole("radio", { name: label });
      await expect(optionBtn).toBeVisible();
      await optionBtn.click();
      await page.waitForTimeout(300);

      const previewPanel = page.locator(".ui-design-skeleton-preview");
      await expect(previewPanel).toBeVisible();

      await previewPanel.screenshot({
        path: path.join(evidenceDir, `skeleton-${name}-1440.png`),
      });

      // Mobile 375x812
      await page.setViewportSize({ width: 375, height: 812 });
      await page.waitForTimeout(300);
      await previewPanel.screenshot({
        path: path.join(evidenceDir, `skeleton-${name}-375.png`),
      });
    }
  });

  // 5. Write performance summary artifact
  test.afterAll(async () => {
    try {
      const files = await fs.readdir(evidenceDir);
      const perfFiles = files.filter((f) => f.endsWith("-perf.json"));
      const combined: Record<string, unknown> = {};
      for (const file of perfFiles) {
        const key = file.replace("-perf.json", "");
        const raw = await fs.readFile(path.join(evidenceDir, file), "utf-8");
        combined[key] = JSON.parse(raw);
      }
      const reportPath = path.join(evidenceDir, "performance-report.json");
      await fs.writeFile(reportPath, JSON.stringify(combined, null, 2), "utf-8");
    } catch {}
  });
});
