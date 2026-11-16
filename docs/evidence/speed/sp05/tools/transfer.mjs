// SP05: compressed JS and CSS per page from Playwright resource timing (fresh context, empty cache).
// Usage: node transfer.mjs <base> <out.json> <path>... ; run from a dir whose node_modules has playwright.
// "html" = files named in the document (script src, stylesheet, modulepreload); "later" = JS/CSS
// fetched after it, up to network idle + 1.5 s. encoded = compressed body bytes as served.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";
const [base, outFile, ...paths] = process.argv.slice(2);
const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const out = { base, taken_at: new Date().toISOString(), method: "resource timing encodedBodySize, Accept-Encoding gzip/br as Chromium sends", pages: [] };
for (const path of paths) {
  const runs = [];
  for (let run = 0; run < 3; run++) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    let html = "";
    page.on("response", async r => { if (r.request().resourceType() === "document" && !html) html = await r.text().catch(() => ""); });
    await page.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
    await page.waitForTimeout(1500);
    const entries = await page.evaluate(() => performance.getEntriesByType("resource").map(e => ({ name: e.name, type: e.initiatorType, encoded: e.encodedBodySize, decoded: e.decodedBodySize, transfer: e.transferSize })));
    const files = entries.filter(e => /\.(js|css)(\?|$)/.test(new URL(e.name).pathname)).map(e => {
      const p = new URL(e.name).pathname;
      return { path: p, kind: p.endsWith(".css") ? "css" : "js", in_html: html.includes(p), encoded: e.encoded, decoded: e.decoded };
    });
    const sum = (f) => files.filter(f).reduce((a, e) => a + e.encoded, 0);
    runs.push({ js_html: sum(e => e.kind === "js" && e.in_html), css_html: sum(e => e.kind === "css" && e.in_html),
      js_later: sum(e => e.kind === "js" && !e.in_html), css_later: sum(e => e.kind === "css" && !e.in_html),
      decoded_js_css: files.reduce((a, e) => a + e.decoded, 0), files });
    await context.close();
  }
  const r = runs[runs.length - 1];
  out.pages.push({ path, ...r, first_load: r.js_html + r.css_html, all_js_css: r.js_html + r.css_html + r.js_later + r.css_later, runs_first_load: runs.map(x => x.js_html + x.css_html) });
  console.error(`${path}: html-named JS ${r.js_html} + CSS ${r.css_html} = ${r.js_html + r.css_html}; later JS ${r.js_later} CSS ${r.css_later}; all ${r.js_html + r.css_html + r.js_later + r.css_later} (${r.files.length} files)`);
}
await browser.close();
writeFileSync(outFile, JSON.stringify(out, null, 1));
