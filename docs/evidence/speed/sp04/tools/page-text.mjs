// SP04: each page's visible main text after load (real data), plus every browser API read with
// its POST body and timing. Usage: node page-text.mjs <base> <out.json> [extra paths...]
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
const [base, outFile, ...extra] = process.argv.slice(2);
const urls = JSON.parse(readFileSync(process.env.URLS_JSON ?? "../../scripts/speed/urls.json", "utf8"));
const pages = [...urls.pages.map(p => ({ name: p.name, path: p.path })), ...extra.map(p => ({ name: p, path: p }))];
const browser = await chromium.launch();
const out = { base, taken_at: new Date().toISOString(), pages: [] };
for (const { name, path } of pages) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const reads = [];
  const started = new Map();
  page.on("request", r => started.set(r, performance.now()));
  page.on("requestfinished", async r => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/") || u.pathname.includes("/portrait") || u.pathname.includes("college-logos")) return;
    const resp = await r.response();
    const h = resp ? await resp.allHeaders() : {};
    const t = r.timing();
    reads.push({ method: r.method(), url: u.pathname + u.search, port: u.port, status: resp?.status(), xcache: h["x-cache"] ?? null,
      server_timing: h["server-timing"] ?? null, start_ms: Math.round(t.startTime - out_t0), ms: Math.round(t.responseEnd),
      body: r.postData() ? JSON.parse(r.postData()) : undefined });
  });
  let out_t0 = Date.now();
  await page.goto(base + path, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1500);
  await page.waitForLoadState("networkidle");
  const text = await page.evaluate(() => (document.querySelector("main") ?? document.body).innerText);
  out.pages.push({ name, path, url: page.url().replace(base, ""), text, reads });
  console.error(name, text.length, "chars,", reads.length, "browser reads");
  await context.close();
}
await browser.close();
writeFileSync(outFile, JSON.stringify(out, null, 1));
