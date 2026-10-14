import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const { chromium } = createRequire(new URL("../../../../dashboard/package.json", import.meta.url))("playwright");
const baseURL = process.env.UC02_BASE_URL || "http://localhost:3100";
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || "/usr/bin/chromium", headless: true });
const measurements = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, colorScheme: "dark", reducedMotion: "reduce", isMobile: width === 390, hasTouch: width === 390 });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${baseURL}/design`);
    await page.waitForFunction(() => document.fonts.status === "loaded" && !document.querySelector('body > div[hidden][id^="S:"]'));
    const kit = page.locator("[data-control-kit-showcase]");
    await kit.waitFor();
    await page.waitForTimeout(200);
    const panels = await kit.locator(".ui-panel").all();
    for (const [index, panel] of panels.entries()) {
      await panel.screenshot({ path: fileURLToPath(new URL(`panel-${index + 1}-${width}.png`, import.meta.url)), animations: "disabled" });
    }
    const c13 = page.locator("[data-c13-comparison]");
    await c13.screenshot({ path: fileURLToPath(new URL(`c13-${width}.png`, import.meta.url)), animations: "disabled" });
    const values = await kit.locator("button,summary,select,a,[data-kit=segmented]").evaluateAll(elements => elements.map(element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return { element: element.tagName, label: element.getAttribute("aria-label") || element.textContent.trim(), kind: element.getAttribute("data-kit"), size: element.closest("[data-demo-size]")?.getAttribute("data-demo-size"), variant: element.closest("[data-demo-variant]")?.getAttribute("data-demo-variant"), state: element.getAttribute("data-demo-state"), width: box.width, height: box.height, padding: style.padding, font: style.fontSize, gap: style.gap, background: style.backgroundColor, color: style.color, duration: style.transitionDuration };
    }));
    measurements.push({ width, errors, overflow: await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), controls: values });
    await context.close();
  }
  await writeFile(new URL("measurements.json", import.meta.url), JSON.stringify(measurements, null, 2) + "\n");
  console.log(measurements.map(({ width, errors, overflow, controls }) => ({ width, errors, overflow, controls: controls.length })));
} finally {
  await browser.close();
}
