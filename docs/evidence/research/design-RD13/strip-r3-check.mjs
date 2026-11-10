// RD13 round 3: on :3100 (read only), at 1440 and 390: no strip label or chart icon outside its column, the track width, the key centred, the axis colour and size,
// a stat name press holds the page still, and a row's chart icon selects that stat and brings the curve under the header. Usage: node strip-r3-check.mjs [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
const b = await chromium.launch(); const D = process.argv[2] ?? ".";
for (const w of [1440, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: 2 });
  const errs = []; p.on("pageerror", e => errs.push(String(e))); p.on("console", m => m.type() === "error" && errs.push(m.text()));
  await p.goto("http://localhost:3100/research/signal-noise", { waitUntil: "load", timeout: 120000 });
  await p.waitForSelector('[data-field="curve-jump"]'); await p.waitForTimeout(1200);
  const row = p.locator('.sn-strip-row[data-stat="fg_pct"]'); await row.scrollIntoViewIfNeeded(); await p.waitForTimeout(500);
  const y0 = await p.evaluate(() => scrollY); await row.getByRole("button", { name: /^Choose/ }).click(); await p.waitForTimeout(700);
  const y1 = await p.evaluate(() => scrollY);
  const m = await p.evaluate(() => {
    const rows = [...document.querySelectorAll('.sn-figure[data-chart="strip"] .sn-strip-row')].map(r => { const n = r.querySelector(".sn-strip-name").getBoundingClientRect(); const bs = [...r.querySelectorAll(".sn-strip-name button")].map(x => x.getBoundingClientRect()); const t = r.querySelector(".sn-track").getBoundingClientRect(); return { over: bs.some(x => x.right > n.right + 0.5), track: Math.round(t.width) }; });
    const key = document.querySelector('.sn-figure[data-chart="strip"] .sn-key').getBoundingClientRect(), fig = document.querySelector('.sn-figure[data-chart="strip"]').getBoundingClientRect();
    const sc = getComputedStyle(document.querySelector(".sn-strip-scale"));
    return { anyOver: rows.some(r => r.over), track: rows[0].track, keyLeftGap: Math.round(key.left - fig.left), keyRightGap: Math.round(fig.right - key.right), axis: [sc.color, sc.fontSize], ov: document.documentElement.scrollWidth - innerWidth, figH: Math.round(fig.height) };
  });
  await p.locator('.sn-figure[data-chart="strip"]').screenshot({ path: `${D}/sn-strip-r3-${w}.png` });
  await p.locator('.sn-strip-row[data-stat="fg2_pct"] [data-field="curve-jump"]').click(); await p.waitForTimeout(1200);
  const after = await p.evaluate(() => ({ top: Math.round(document.getElementById("curve").getBoundingClientRect().top), stat: document.querySelector('[data-chart="curve"]').dataset.stat }));
  console.log(w, JSON.stringify({ y0, y1, ...m, after, errs }));
}
await b.close();
