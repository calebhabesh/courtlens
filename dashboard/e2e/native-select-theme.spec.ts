import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test.use({ hasTouch: true });

test.beforeEach(async ({ page }) => {
  // Other specs can edit the shared fixture workspace; popup captures use fixed preferences.
  await page.route("**/api/workspace**", route => route.fulfill({ json: {
    workspace_id: "default", name: "Default Workspace", version: 1, views: [], favorites: [], compare_tray: [],
    ranking_boards: [], tier_lists: [], created_at: "2026-10-05", updated_at: "2026-10-05",
    preferences: { density: "standard", identity_mode: "photos", counting_mode: "per_game", default_view_id: "overview", table_expanded: false, theme: "dark" }
  } }));
});

// Phase is a segmented control on Stats (Databallr alignment); the team picker is the third select.
for (const label of ["Filter by season", "Filter by NBA team", "Analysis window"]) {
  test(`${label} popup stays readable with a light OS theme`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    // The fixture has one admitted season/phase; retained unavailable context gives each
    // menu an unselected row as well, without inventing additional source coverage.
    const path = label === "Filter by season" ? "/stats?season=2024-25" : "/stats";
    await openWorkbench(page, path);
    const select = page.getByRole("combobox", { name: label, exact: true });
    const colors = await select.evaluate(element => {
      const control = element as HTMLSelectElement;
      return {
        background: getComputedStyle(control).backgroundColor,
        scheme: getComputedStyle(control).colorScheme,
        pickerSurface: getComputedStyle(control, "::picker(select)").backgroundColor,
        options: [...control.options].map(option => ({
          background: getComputedStyle(option).backgroundColor,
          text: getComputedStyle(option).color
        }))
      };
    });
    expect(colors.scheme).toBe("dark");
    expect(colors.background).not.toBe("rgba(0, 0, 0, 0)");
    for (const option of colors.options) {
      expect(option.background).not.toBe("rgba(0, 0, 0, 0)");
      // WCAG normal-text contrast for the actual option colors.
      const luminance = (color: string) => {
        const rgba = color.match(/[\d.]+/g)!.map(Number);
        const surface = colors.pickerSurface.match(/[\d.]+/g)!.slice(0, 3).map(Number);
        const alpha = rgba[3] ?? 1;
        const channels = rgba.slice(0, 3).map((channel, index) => channel * alpha + surface[index] * (1 - alpha)).map(channel => {
          const value = channel / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      };
      const foreground = luminance(option.text);
      const background = luminance(option.background);
      expect((Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
    const value = await select.inputValue();
    await select.click();
    await expect(select).toHaveCSS("appearance", "base-select");
    await expect(page.locator("select:open")).toBeVisible();
    // The UA picker animation is not exposed by Element.getAnimations(); settle its 140ms enter.
    await page.waitForTimeout(200);
    // Table changes can make Chromium scroll the document when focusing the picker.
    // Capture one fixed page position while retaining the open top-layer picker.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.locator("select:open")).toBeVisible();
    // The styled picker stays in the browser's top layer, including in a Filters drawer.
    expect(await page.screenshot({ caret: "hide" })).toMatchSnapshot(`${label.toLowerCase().replaceAll(" ", "-")}-popup.png`);
    await page.keyboard.press("Escape");
    await expect(select).toHaveValue(value);
  });
}

test("styled picker preserves keyboard selection, Escape and outside dismissal", async ({ page }) => {
  await openWorkbench(page, "/stats");
  const window = page.getByRole("combobox", { name: "Analysis window", exact: true });
  await window.focus();
  await window.press("Space");
  await expect(page.locator("select:open")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(window).toHaveValue("season");
  await expect(window).toBeFocused();
  await window.press("Space");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page.waitForURL(url => url.searchParams.get("window") === "last_10");
  await expect(page.getByRole("combobox", { name: "Analysis window", exact: true })).toHaveValue("last_10");
  await page.getByRole("combobox", { name: "Analysis window", exact: true }).click();
  await page.getByRole("heading", { name: "NBA Player Statistics", exact: true }).click();
  await expect(page.locator("select:open")).toHaveCount(0);
});

test("phone picker stays above the Filters drawer and accepts touch selection", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkbench(page, "/stats");
  await page.locator(".ui-filter-bar-toggle").click();
  const window = page.getByRole("combobox", { name: "Analysis window", exact: true }).filter({ visible: true });
  await window.tap();
  const option = window.locator('option[value="last_5"]');
  await expect(option).toBeVisible();
  expect(await option.evaluate(element => {
    const box = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2));
  })).toBe(true);
  const dimensions = await option.boundingBox();
  expect(dimensions!.height).toBeGreaterThanOrEqual(40);
  expect(dimensions!.x).toBeGreaterThanOrEqual(0);
  expect(dimensions!.x + dimensions!.width).toBeLessThanOrEqual(390);
  const duration = await window.evaluate(element => getComputedStyle(element, "::picker(select)").animationDuration);
  expect(duration).toBe("0.001s");
  await option.tap();
  await page.waitForURL(url => url.searchParams.get("window") === "last_5");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
});
