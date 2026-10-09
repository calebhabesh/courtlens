// FO03: count glyph/emoji icons in rendered text and Lucide SVGs that bypass the wrapper, on every
// FO00 route at 1440px. Usage: node scripts/measure_fo03_icons.cjs [baseUrl]
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "../dashboard/node_modules/playwright"));

const base = process.argv[2] || "http://localhost:3100";
const before = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/evidence/fo00/before/measurements.json"), "utf8"));
const out = path.join(__dirname, "../docs/evidence/fo03/icons.json");
// Same ranges as the ESLint rule (D26).
const GLYPH = "[\\u2190-\\u21FF\\u25A0-\\u25FF\\u2600-\\u27BF\\u2B00-\\u2BFF]|[\\u{1F000}-\\u{1FAFF}]";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const routes = {};
  for (const route of Object.keys(before.routes)) {
    try {
      const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(300);
      routes[route] = await page.evaluate((source) => {
        const re = new RegExp(source, "gu");
        const glyphs = {};
        const samples = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
          const parent = node.parentElement;
          if (!parent || parent.closest("script, style, [hidden], [aria-hidden='true']")) continue;
          const style = getComputedStyle(parent);
          if (style.display === "none" || style.visibility === "hidden") continue;
          for (const g of node.textContent.match(re) || []) {
            glyphs[g] = (glyphs[g] || 0) + 1;
            if (samples.length < 5) samples.push(node.textContent.trim().slice(0, 80));
          }
        }
        return {
          glyphs, total: Object.values(glyphs).reduce((a, b) => a + b, 0), samples,
          lucideOutsideWrapper: document.querySelectorAll("svg.lucide:not(.ui-icon)").length,
          wrapperIcons: document.querySelectorAll("svg.ui-icon").length,
        };
      }, GLYPH);
      routes[route].status = response?.status();
    } catch (error) {
      routes[route] = { error: String(error).slice(0, 120) };
    }
    process.stdout.write(`${route} ${routes[route].total ?? routes[route].error}\n`);
  }
  await browser.close();
  const totals = { routes: Object.keys(routes).length, routesWithGlyphs: 0, glyphs: 0, lucideOutsideWrapper: 0, beforeGlyphs: 0 };
  for (const [route, r] of Object.entries(routes)) {
    if (r.total) { totals.routesWithGlyphs++; totals.glyphs += r.total; }
    totals.lucideOutsideWrapper += r.lucideOutsideWrapper || 0;
    const b = before.routes[route]?.desktop?.glyphs || {};
    totals.beforeGlyphs += Object.values(b).reduce((a, c) => a + c, 0);
  }
  fs.writeFileSync(out, JSON.stringify({ base, measuredAt: new Date().toISOString(), totals, routes }, null, 2));
  console.log(JSON.stringify(totals));
})();
