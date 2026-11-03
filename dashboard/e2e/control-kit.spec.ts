import { expect, test } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

for (const width of [1440, 390]) {
  test(`kit geometry, phone targets and native selects at ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await openWorkbench(page, "/design");
    const kit = page.locator("[data-control-kit-showcase]");
    await expect(kit).toBeVisible();
    const measurements = await kit.locator("[data-demo-size][data-demo-variant]").evaluateAll(rows => rows.map(row => {
      const button = row.querySelector('[data-demo-state="Rest"]');
      const icon = row.querySelector('[data-kit="icon-button"]');
      if (!(button instanceof HTMLElement) || !(icon instanceof HTMLElement)) throw new Error("Missing matrix controls");
      const style = getComputedStyle(button);
      return { size: row.getAttribute("data-demo-size"), variant: row.getAttribute("data-demo-variant"), height: button.getBoundingClientRect().height,
        iconHeight: icon.getBoundingClientRect().height, iconWidth: icon.getBoundingClientRect().width,
        padding: style.paddingInlineStart, blockPadding: style.paddingBlockStart, font: style.fontSize,
        gap: style.gap, glyph: button.querySelector("svg")?.getBoundingClientRect().height };
    }));
    expect(measurements).toHaveLength(20);
    for (const measured of measurements) {
      const desktopHeight = measured.size === "xs" ? 28 : measured.size === "sm" ? 32 : measured.size === "md" ? 36 : 40;
      const height = width === 390 ? 40 : desktopHeight;
      expect(measured).toMatchObject({ height, iconHeight: height, iconWidth: height, padding: measured.variant === "text" ? "0px" : measured.size === "xs" ? "8px" : "12px", blockPadding: "0px", font: measured.size === "xs" ? "12px" : "13px", gap: "8px", glyph: measured.size === "xs" ? 14 : 16 });
    }
    for (const size of ["xs", "sm", "md", "lg"]) {
      const group = kit.getByRole("radiogroup", { name: `${size} default view`, exact: true });
      const expected = width === 390 ? 48 : size === "xs" ? 28 : size === "sm" ? 32 : size === "md" ? 36 : 40;
      expect(await group.evaluate(element => element.getBoundingClientRect().height)).toBe(expected);
      expect(await group.getByRole("radio").first().evaluate(element => element.getBoundingClientRect().height)).toBe(expected - 8);
      expect(await group.evaluate(element => getComputedStyle(element).padding)).toBe("4px");
    }
    for (const size of ["sm", "md", "lg"]) {
      const select = kit.getByRole("combobox", { name: `${size} default rest select`, exact: true });
      expect(await select.evaluate(element => element.getBoundingClientRect().height)).toBe(width === 390 ? 40 : size === "sm" ? 32 : size === "md" ? 36 : 40);
      await select.selectOption("playoffs");
      await expect(select).toHaveValue("playoffs");
      await expect(kit.getByRole("combobox", { name: `${size} default disabled select` })).toBeDisabled();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  });
}

test("selected controls keep their accent look on hover and keyboard focus stays visible", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkbench(page, "/design");
  const row = page.locator('[data-demo-size="md"][data-demo-variant="secondary"]');
  const selected = row.getByRole("button", { name: "Selected", exact: true });
  const before = await selected.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color, shadow: getComputedStyle(element).boxShadow }));
  await selected.hover();
  expect(await selected.evaluate(element => ({ background: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color, shadow: getComputedStyle(element).boxShadow }))).toEqual(before);
  expect(before.color).toBe("rgb(255, 209, 102)");
  const rest = row.getByRole("button", { name: "Rest", exact: true });
  await rest.click();
  expect(await rest.evaluate(element => element.matches(":focus-visible"))).toBe(false);
  await page.keyboard.press("Tab");
  const focused = row.getByRole("button", { name: "Hover", exact: true });
  await expect(focused).toBeFocused();
  expect(await focused.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe("none");
  expect(await rest.evaluate(element => getComputedStyle(element).transitionDuration)).toBe("0.001s");
  await row.getByRole("button", { name: "Press", exact: true }).hover();
  await page.mouse.down();
  await expect(row.getByRole("button", { name: "Press", exact: true })).toHaveCSS("scale", "0.98");
  await page.mouse.up();
  const select = page.getByRole("combobox", { name: "md default rest select", exact: true });
  await select.hover();
  await expect(select).toHaveCSS("background-color", "rgb(36, 40, 46)");
});

test("kit triggers open overlays and radios change by keyboard", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openWorkbench(page, "/design");
  const kit = page.locator("[data-control-kit-showcase]");
  const menu = kit.getByRole("button", { name: "md secondary menu", exact: true });
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitem", { name: "Choose table" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(menu).toBeFocused();
  await expect(menu).toHaveAttribute("aria-expanded", "false");
  const group = kit.getByRole("radiogroup", { name: "lg default view", exact: true });
  await group.getByRole("radio", { name: "lg Table" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(group.getByRole("radio", { name: "Cards" })).toBeFocused();
  await expect(group.getByRole("radio", { name: "Cards" })).toHaveAttribute("aria-checked", "true");
  await expect(group.locator(".ui-sliding-indicator")).toHaveCount(1);
  expect(await group.locator(".ui-sliding-indicator").evaluate(element => element.getAnimations().length)).toBe(0);
});
