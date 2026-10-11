import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

test.beforeEach(async ({ page }) => {
  // Other specs can edit the shared fixture workspace; popup captures use fixed preferences.
  await page.route("**/api/workspace**", route => route.fulfill({ json: {
    workspace_id: "default", name: "Default Workspace", version: 1, views: [], favorites: [], compare_tray: [],
    ranking_boards: [], tier_lists: [], created_at: "2026-10-05", updated_at: "2026-10-05",
    preferences: { density: "standard", identity_mode: "photos", counting_mode: "per_game", default_view_id: "overview", table_expanded: false, theme: "dark" }
  } }));
});

for (const label of ["Filter by season", "Filter by competition phase", "Analysis window"]) {
  test(`${label} popup stays readable with a light OS theme`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ colorScheme: "light" });
    // The fixture has one admitted season/phase; retained unavailable context gives each
    // menu an unselected row as well, without inventing additional source coverage.
    const path = label === "Filter by season" ? "/stats?season=2024-25"
      : label === "Filter by competition phase" ? "/stats?phase=playoffs" : "/stats";
    await openWorkbench(page, path);
    const select = page.getByRole("combobox", { name: label, exact: true });
    const colors = await select.evaluate(element => {
      const control = element as HTMLSelectElement;
      return {
        background: getComputedStyle(control).backgroundColor,
        scheme: getComputedStyle(control).colorScheme,
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
        const channels = color.match(/[\d.]+/g)!.slice(0, 3).map(Number).map(channel => {
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
    // Capture once at the viewport size: clipping/resizing the screenshot closes Chromium's
    // native popup, and screenshot stabilization would compare the closed control instead.
    expect(await page.screenshot({ caret: "hide" })).toMatchSnapshot(`${label.toLowerCase().replaceAll(" ", "-")}-popup.png`);
    await page.keyboard.press("Escape");
    await expect(select).toHaveValue(value);
  });
}
