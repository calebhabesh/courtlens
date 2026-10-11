// PC03: production /design first load, kit geometry, contrast and state measurements.
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require(path.join(__dirname, "../dashboard/node_modules/playwright"));
const base = process.argv[2] || "http://127.0.0.1:3200";
const out = path.join(__dirname, "../docs/evidence/pc03");
fs.mkdirSync(path.join(out, "screens"), { recursive: true });

(async () => {
  const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
  const results = { base, capturedAt: new Date().toISOString(), route: "/design", examples: "Illustrative geometry only; no NBA estimates", viewports: [] };
  for (const width of [1440, 390, 375, 844]) {
    const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : width === 844 ? 390 : 844 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    const response = await page.goto(`${base}/design`, { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    await page.locator("#chart-kit .chart-frame").first().waitFor();
    const measure = await page.evaluate(() => {
      const kit = document.querySelector("#chart-kit");
      const box = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y + scrollY, width: r.width, height: r.height }; };
      const visible = e => e.checkVisibility() && e.getBoundingClientRect().width > 0;
      const cv = document.createElement("canvas"); cv.width = cv.height = 1;
      const ctx = cv.getContext("2d");
      const rgba = color => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = color; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data]; };
      const blend = (top, bottom) => top.slice(0, 3).map((c, i) => c * top[3] / 255 + bottom[i] * (1 - top[3] / 255));
      const luminance = rgb => rgb.slice(0, 3).map(c => c / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
      const contrast = e => {
        const parents = []; for (let p = e; p; p = p.parentElement) parents.push(p);
        let background = rgba(getComputedStyle(document.documentElement).getPropertyValue("--color-bg"));
        for (const p of parents.reverse()) background = [...blend(rgba(getComputedStyle(p).backgroundColor), background), 255];
        const foreground = blend(rgba(getComputedStyle(e).color), background);
        const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
        return (values[1] + 0.05) / (values[0] + 0.05);
      };
      const textElements = [...kit.querySelectorAll(".chart-delta, .chart-percentile-cell strong, .chart-percentile-cell small, .chart-timeline-cell small, .chart-meta span")].filter(visible);
      return {
        url: location.pathname + location.search,
        overflowX: document.documentElement.scrollWidth - innerWidth,
        firstResult: box(kit.querySelector(".chart-frame")),
        chartCount: kit.querySelectorAll(".chart-frame").length,
        controls: [...kit.querySelectorAll(".ui-segmented-item, .ui-button")].filter(visible).map(e => ({ label: e.innerText, ...box(e) })),
        numeric: [...kit.querySelectorAll(".chart-percentile-cell, .chart-table .num")].slice(0, 16).map(e => ({ textAlign: getComputedStyle(e).textAlign, digits: getComputedStyle(e).fontVariantNumeric })),
        panelPadding: [...kit.querySelectorAll(".ui-panel-body")].slice(0, 4).map(e => ({ padding: getComputedStyle(e).padding, ...box(e) })),
        contrast: textElements.map(e => ({ text: e.textContent.trim().slice(0, 80), ratio: Number(contrast(e).toFixed(3)) })),
        phoneFlow: getComputedStyle(kit.querySelector(".chart-flow-phone")).display,
        desktopFlow: getComputedStyle(kit.querySelector(".chart-flow-desktop")).display,
        sources: [...kit.querySelectorAll(".chart-meta")].map(e => e.innerText),
      };
    });
    if (width === 1440 || width === 390) {
      await page.screenshot({ path: path.join(out, "screens", `first-load-${width}.png`), animations: "disabled" });
      await page.locator("#chart-kit").screenshot({ path: path.join(out, "screens", `kit-${width}.png`), animations: "disabled" });
      const panels = page.locator("#chart-kit .ui-panel");
      for (let i = 0; i < await panels.count(); i++) await panels.nth(i).screenshot({ path: path.join(out, "screens", `component-${i + 1}-${width}.png`), animations: "disabled" });
      for (const state of ["Loading", "Empty", "Error"]) {
        await page.locator("#chart-kit").getByRole("radio", { name: state, exact: true }).click();
        // The shared segmented indicator uses a JS spring; screenshot animation disabling only
        // stops CSS/Web Animations. Capture its settled state, not a mid-flight indicator.
        await page.waitForTimeout(450);
        await page.screenshot({ path: path.join(out, "screens", `state-${state.toLowerCase()}-${width}.png`), animations: "disabled" });
      }
    }
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.locator("#chart-kit").getByRole("radio", { name: "Ready", exact: true }).click();
    measure.reducedMotion = await page.locator("#chart-kit .chart-data, #chart-kit .chart-graphic, #chart-kit .chart-delta, #chart-kit .chart-percentile-cell").evaluateAll(es => es.map(e => ({ animation: getComputedStyle(e).animationDuration, transition: getComputedStyle(e).transitionDuration })));
    results.viewports.push({ width, status: response.status(), ...measure, errors });
    await page.close();
  }
  fs.writeFileSync(path.join(out, "measurements.json"), JSON.stringify(results, null, 2) + "\n");
  await browser.close();
  const failed = results.viewports.some(v => v.status !== 200 || v.overflowX !== 0 || v.errors.length > 0 || v.chartCount !== 8
    || v.contrast.some(c => !Number.isFinite(c.ratio) || c.ratio < 4.5) || (v.width === 1440 && v.firstResult.y > 400));
  console.log(JSON.stringify(results.viewports.map(v => ({ width: v.width, status: v.status, overflow: v.overflowX, charts: v.chartCount, firstResultY: v.firstResult.y, minimumContrast: Math.min(...v.contrast.map(c => c.ratio)), errors: v.errors })), null, 2));
  process.exitCode = failed ? 1 : 0;
})();
