// RD00 round 7 live check on the owner's :3100 (GET only): table pixels painting over the sticky filter bar, both tabs, 1440/1053/390.
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
const [,, base = "http://localhost:3100", tag = "before"] = process.argv;
const b = await chromium.launch();
const out = {};
for (const path of ["/research/rapm/six-factor", "/research/rapm"]) for (const width of [1440, 1053, 390]) {
  const p = await b.newPage({ viewport: { width, height: 800 } });
  await p.goto(base + path, { waitUntil: "networkidle" });
  await p.waitForSelector(".rt-grid tbody tr", { timeout: 90000 });
  await p.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; const t = document.querySelector(".rt-scroll"); window.scrollTo(0, t.getBoundingClientRect().top + scrollY + 120); });
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const bar = document.querySelector(".ui-filter-bar").getBoundingClientRect(), hdr = document.querySelector("header").getBoundingClientRect();
    const pts = []; for (let x = 20; x < innerWidth - 20; x += 40) for (const y of [bar.top + 4, bar.top + bar.height / 2, bar.bottom - 4, hdr.top + hdr.height / 2]) pts.push([x, y]);
    const intruders = pts.filter(([x, y]) => { const e = document.elementFromPoint(x, y); return e && e.closest(".rt-scroll"); }).length;
    return { barTop: Math.round(bar.top), barBottom: Math.round(bar.bottom), intruders };
  });
  out[`${path} ${width}`] = r;
  await p.screenshot({ path: `overlap-${tag}-${path.split("/").pop()}-${width}.png` });
  await p.close();
}
console.log(JSON.stringify(out));
await b.close();
