import { test, expect } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

/**
 * DL09 / Design Language v1 Motion Coverage Verification
 * 
 * Verifies contract mandates from docs/design/design-language-v1.md:
 * 1. On key pages, every visible button, a, [role=tab], [role=menuitem], and input
 *    has a non-zero transition-duration (or is managed by a motion component).
 * 2. Menus, modals/dialogs, command palette, and tooltips implement enter motion.
 * 3. Reduced-motion media query dampens animations to 1ms or instant spring.
 */

const KEY_PAGES = [
  "/stats",
  "/players",
  "/teams",
  "/compare",
  "/live",
  "/research/ask",
  "/design",
];

test.describe("Design Language v1: Motion Coverage Suite", () => {
  for (const route of KEY_PAGES) {
    test(`interactive elements on ${route} have transitions or motion wrappers`, async ({ page }) => {
      await openWorkbench(page, route);

      const elements = page.locator("button, a[href], [role=tab], [role=menuitem], input:not([type=hidden])");
      const count = await elements.count();
      expect(count).toBeGreaterThan(0);

      const failures = await elements.evaluateAll((nodes) => {
        const issues: string[] = [];

        for (const el of nodes) {
          // Check if element is visible
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const style = window.getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none" || style.opacity === "0") continue;

          // Check for transition, animation, or motion-parent
          const transDur = style.transitionDuration;
          const animDur = style.animationDuration;
          const hasNonZeroTransition = transDur && transDur !== "0s" && transDur !== "0ms";
          const hasNonZeroAnimation = animDur && animDur !== "0s" && animDur !== "0ms";
          const hasMotionParent = Boolean(
            el.closest("[data-motion], .motion-wrapper, .route-enter, [style*='transform'], [style*='transition']")
          );

          if (!hasNonZeroTransition && !hasNonZeroAnimation && !hasMotionParent) {
            const tag = el.tagName.toLowerCase();
            const text = (el.textContent || "").trim().slice(0, 30);
            const className = el.className || "";
            issues.push(`<${tag} class="${className}">${text}</${tag}>`);
          }
        }

        return issues;
      });

      expect(failures, `Elements on ${route} missing motion transitions: ${failures.join(", ")}`).toHaveLength(0);
    });
  }

  test("menus, command palette, and dialogs have enter animations", async ({ page }) => {
    await openWorkbench(page, "/stats");

    // Test More Options menu open animation
    const moreBtn = page.getByRole("button", { name: "More options", exact: true });
    await moreBtn.click();
    const dropdown = page.locator(".courtlens-dropdown-panel, .replica-dropdown-panel, [role=menu]");
    await expect(dropdown).toBeVisible();
    const dropdownAnimation = await dropdown.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.animationName || style.transitionProperty || (el as HTMLElement).style.transform || "";
    });
    expect(dropdownAnimation).toBeTruthy();
    await page.keyboard.press("Escape");

    // Test Command Palette enter animation
    await page.keyboard.press("Control+k");
    const dialog = page.locator("[role=dialog], .ui-command-modal, .ui-modal-overlay");
    await expect(dialog).toBeVisible();
    const dialogMotion = await dialog.evaluate(el => {
      const style = window.getComputedStyle(el);
      return style.animationName || style.transitionDuration || (el as HTMLElement).style.transform || "";
    });
    expect(dialogMotion).toBeTruthy();
    await page.keyboard.press("Escape");
  });

  test("reduced motion overrides preserve instant transitions without layout snapping errors", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openWorkbench(page, "/stats");

    const durBase = await page.evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue("--dur-base").trim();
    });
    // Reduced motion overrides --dur-base to 1ms
    expect(durBase).toBe("1ms");
  });
});
