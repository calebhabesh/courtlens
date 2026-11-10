// RD13: the worked example's portrait on Signal vs Noise, on real data through the read-only proxy (../design-RD10/readonly-proxy.mjs), at 1440 and 390.
// For each example: the photo is the season's (its URL carries that season and team), circular, not cut by any box that doesn't scroll, and the logo beside
// the team code is drawn. A control makes the card clip and pushes the photo past its corner, and the check must then find the photo cut.
// Usage: node photo-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const [,, out, shots] = process.argv;
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/research/signal-noise";
const EXAMPLES = [["", "default"], ["?player=201939&exampleSeason=2014-15", "curry-2014-15"], ["?player=201939&exampleSeason=2025-26", "curry-2025-26"], ["?player=76003&exampleSeason=1984-85", "abdul-jabbar-1984-85"], ["?player=2544&exampleSeason=2003-04", "james-2003-04"], ["?player=2544&exampleSeason=2018-19", "james-2018-19"]];
const report = [];
let faults = 0;
const browser = await chromium.launch();
for (const width of [1440, 390]) for (const [query, name] of EXAMPLES) {
  const params = new URLSearchParams(query.slice(1));
  const ex = await (await fetch(`${API}/api/signal-noise/player${params.get("player") ? `?playerId=${params.get("player")}&season=${params.get("exampleSeason")}` : ""}`)).json();
  const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 }, deviceScaleFactor: 2 });
  const errors = []; page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${WEB}${query}`, { waitUntil: "load", timeout: 120000 });
  await page.waitForSelector(`.sn-card[data-player="${ex.player_id}"] .ui-identity-media :is(.player-portrait, .player-portrait-fallback)`, { state: "attached", timeout: 60000 });
  await page.waitForTimeout(1200);
  const measure = () => page.evaluate(() => {
    const ring = 2;
    const photo = document.querySelector(".sn-card .ui-identity-media :is(.player-portrait, .player-portrait-fallback)");
    const r = photo.getBoundingClientRect();
    let clippedBy = null;
    for (let e = photo.parentElement; e && e !== document.body; e = e.parentElement) {
      const c = getComputedStyle(e);
      if (![c.overflowX, c.overflowY].some(v => v !== "visible")) continue;
      if (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1) break;
      const b = e.getBoundingClientRect();
      if (r.left - ring < b.left - 0.5 || r.top - ring < b.top - 0.5 || r.right + ring > b.right + 0.5 || r.bottom + ring > b.bottom + 0.5) { clippedBy = String(e.className).slice(0, 60); break; }
    }
    return { src: photo.getAttribute("src"), fallback: photo.classList.contains("player-portrait-fallback"), loaded: photo.tagName !== "IMG" || (photo.complete && photo.naturalWidth > 0),
      circle: parseFloat(getComputedStyle(photo).borderRadius) >= r.width / 2, size: Math.round(r.width), clippedBy,
      logos: [...document.querySelectorAll(".sn-card .sn-card-team img")].filter(i => i.complete && i.naturalWidth > 0).length };
  });
  const m = await measure();
  const team = ex.teams[0] ?? null;
  const seasonOk = m.fallback || (m.src ?? "").includes(`season=${ex.season}`), teamOk = m.fallback || !team || (m.src ?? "").includes(`team=${team}`);
  if (shots && name === "default") await page.locator(".sn-card").screenshot({ path: `${shots}/sn-card-${width}.png` });
  // The control: the card clips and the photo is pushed past its top-left corner (overflow there can't scroll), so the check must find it cut.
  await page.addStyleTag({ content: ".sn-card { overflow: hidden; } .sn-card > .ui-identity { margin: -24px 0 0 -24px; }" });
  const control = (await measure()).clippedBy;
  const ok = m.loaded && m.circle && !m.clippedBy && seasonOk && teamOk && m.logos === ex.teams.length && control !== null && errors.length === 0;
  if (!ok) faults += 1;
  report.push({ width, name, player: ex.player_name, season: ex.season, team, ...m, seasonOk, teamOk, controlCaught: control !== null, errors, ok });
  await page.close();
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify({ faults, checks: report }, null, 1));
console.log(`${report.length} portraits, ${faults} faults`);
for (const r of report) if (!r.ok) console.log(JSON.stringify(r));
