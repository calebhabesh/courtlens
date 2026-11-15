// SP06 finding: Stats portraits: how many <img> the server HTML carries and their markup bytes, how
// many stay in the DOM after hydration, and the portrait bytes loaded (from responses, so
// cross-origin sizes count) at first view and after scrolling to the end (1440x900, DPR 1 and 2).
import { chromium } from "playwright";
const base = process.argv[2];
const html = await (await fetch(base + "/stats")).text();
const tags = html.match(/<img[^>]*\/portrait[^>]*>/g) ?? [];
const guides = tags.filter(t => !t.includes("stats-primary-portrait"));
console.log("server HTML:", tags.length, "portrait <img>,", tags.reduce((a, t) => a + Buffer.byteLength(t), 0), "bytes;",
  guides.length, "not primary,", guides.reduce((a, t) => a + Buffer.byteLength(t), 0), "bytes");
const browser = await chromium.launch();
for (const dpr of [1, 2]) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
  const page = await context.newPage();
  const loaded = new Map();
  page.on("response", async r => { if (/\/portrait/.test(r.url())) { try { loaded.set(r.url(), (await r.body()).length); } catch {} } });
  await page.goto(base + "/stats", { waitUntil: "networkidle" });
  const dom = () => page.evaluate(() => {
    const all = [...document.querySelectorAll("img")].filter(i => /\/portrait/.test(i.src));
    return { in_dom: all.length, primary: all.filter(i => i.classList.contains("stats-primary-portrait")).length,
      visible: all.filter(i => i.offsetParent !== null).length };
  });
  const sum = () => ({ requests: loaded.size, bytes: [...loaded.values()].reduce((a, b) => a + b, 0),
    widths: [...loaded.keys()].reduce((o, u) => { const w = u.match(/size=(\d+)/)?.[1]; o[w] = (o[w] || 0) + 1; return o; }, {}) });
  console.log(`DPR ${dpr} first view`, JSON.stringify({ ...await dom(), ...sum() }));
  for (let y = 0; y < 40; y++) { await page.evaluate(() => { window.scrollBy(0, 800); document.querySelectorAll("*").forEach(el => { if (el.scrollHeight > el.clientHeight + 50 && getComputedStyle(el).overflowY.match(/auto|scroll/)) el.scrollTop += 800; }); }); await page.waitForTimeout(60); }
  await page.waitForLoadState("networkidle");
  console.log(`DPR ${dpr} after scroll`, JSON.stringify({ ...await dom(), ...sum() }));
  await context.close();
}
await browser.close();
