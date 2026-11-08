// Real-data check for RD06 (Learning): every served value the page draws (the league table and the chart for each of its six
// measures) against the owner's API through the read-only proxy on 4180 (readonly-proxy.mjs, GET only), the production build on
// 3180, at 1440 and 390. Also: 23 topic cards and index links, the search, the phone index, console errors, page overflow,
// broken images, phone controls under 40 px (kit controls and, separately, every ButtonLink: prerequisite chips and links) and
// the hero icon's centring. The measured sentences come from lib/research-facts.ts, which Vitest checks against the frozen results.
// Usage: node real-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/methodology/learning";
const [,, out, shots] = process.argv;
const ff = await (await fetch(`${API}/api/four-factors`)).json();
const MEASURES = [
  ["ts", "TS%", s => s.league.ts, v => `${(v * 100).toFixed(1)}%`],
  ["efg", "eFG%", s => s.league.inputs.efg, v => `${(v * 100).toFixed(1)}%`],
  ["tov_pct", "TOV%", s => s.league.inputs.tov_pct, v => `${(v * 100).toFixed(1)}%`],
  ["orb_pct", "ORB%", s => s.league.inputs.orb_pct, v => `${(v * 100).toFixed(1)}%`],
  ["fg3a_rate", "3PA rate", s => s.league.fg3a_rate, v => `${(v * 100).toFixed(1)}%`],
  ["ortg", "ORTG", s => s.league.ortg_factors, v => v.toFixed(1)],
];

const report = [];
const browser = await chromium.launch();
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const errors = [], mismatches = []; let compared = 0;
  const eq = (what, got, want) => { compared += 1; if (got !== want) mismatches.push({ what, got, want }); };
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(WEB, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector("tr[data-row]", { timeout: 60000 });
  const tag = width > 600 ? "1440" : "390";
  if (shots) await page.screenshot({ path: `${shots}/learning-default-${tag}.png`, fullPage: true });

  // Structure.
  eq("topic cards", await page.locator("article[data-topic]").count(), 23);
  eq("tier sections", await page.locator("section.ln-tier").count(), 5);
  eq("no selects", await page.locator("select").count(), 0);
  eq("no workshop", await page.getByText("Investigate historical scoring variation").count(), 0);
  eq("h1", await page.locator("h1").innerText(), "Learning");
  const hero = await page.evaluate(() => {
    const icon = document.querySelector(".ln-hero .ui-page-header-icon").getBoundingClientRect();
    const svg = document.querySelector(".ln-hero .ui-page-header-icon svg").getBoundingClientRect();
    return Math.abs((icon.left + icon.width / 2) - (svg.left + svg.width / 2)) <= 1 && Math.abs((icon.top + icon.height / 2) - (svg.top + svg.height / 2)) <= 1;
  });
  eq("hero icon centred", hero, true);

  // League table: every served value, as data and as text.
  for (const season of ff.seasons) {
    const row = page.locator(`table[aria-label="League averages by season"] tr[data-row="${season.season}"]`);
    for (const [key, , value, text] of MEASURES) {
      const cell = row.locator(`[data-field="${key}"]`);
      eq(`${season.season} ${key} value`, Number(await cell.getAttribute("data-value")), value(season));
      eq(`${season.season} ${key} text`, (await cell.innerText()).trim(), text(value(season)));
    }
  }
  eq("table rows", await page.locator('table[aria-label="League averages by season"] tbody tr').count(), ff.seasons.length);

  // Chart: every measure, every season's point.
  const chart = page.locator(".ln-trends-chart");
  for (const [key, label, value] of MEASURES) {
    await chart.getByRole("radio", { name: label, exact: true }).click();
    await page.waitForFunction(l => document.querySelector(".ln-trends-chart .ln-well-label")?.textContent?.startsWith(`League ${l} by season`), label);
    const dots = await chart.locator(".slc-dot").evaluateAll(nodes => nodes.map(n => [n.getAttribute("data-season"), Number(n.getAttribute("data-value"))]));
    eq(`chart ${key} points`, dots.length, ff.seasons.length);
    ff.seasons.forEach((season, i) => { eq(`chart ${key} ${season.season} season`, dots[i]?.[0], season.season); eq(`chart ${key} ${season.season} value`, dots[i]?.[1], value(season)); });
    if (key === "orb_pct" && shots) await chart.screenshot({ path: `${shots}/learning-chart-orb-${tag}.png` });
  }
  await chart.getByRole("radio", { name: "TS%", exact: true }).click();
  const plot = chart.getByRole("img");
  const box = await plot.boundingBox();
  await page.mouse.move(box.x + box.width - 2, box.y + box.height / 2);
  eq("tooltip last season", (await chart.locator(".slc-tip-season").innerText()).trim(), ff.seasons.at(-1).season);
  eq("tooltip last value", (await chart.locator(".slc-tip-value").innerText()).trim(), `${(ff.seasons.at(-1).league.ts * 100).toFixed(1)}%`);
  if (shots) await chart.screenshot({ path: `${shots}/learning-chart-hover-${tag}.png` });
  await page.mouse.move(0, 0);

  // Myth card.
  if (shots) { const myth = page.locator("article#stabilization"); await myth.scrollIntoViewIfNeeded(); await myth.screenshot({ path: `${shots}/learning-myth-${tag}.png` }); }

  // Images, overflow, phone controls.
  await page.evaluate(() => document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }));
  await page.waitForFunction(() => [...document.images].every(i => i.complete), null, { timeout: 30000 }).catch(() => {});
  const broken = await page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src));
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  let small = [], smallLinks = [];
  if (width < 600) {
    small = await page.evaluate(() => [...document.querySelectorAll("button, select, input, summary")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40 && !e.closest("[hidden]"); }).map(e => `${e.tagName} ${e.getAttribute("aria-label") ?? e.textContent?.trim().slice(0, 30)} ${Math.round(e.getBoundingClientRect().height)}`));
    smallLinks = await page.evaluate(() => [...document.querySelectorAll('a[data-kit="button"]')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height < 40; }).map(e => `${e.textContent?.trim().slice(0, 30)} ${Math.round(e.getBoundingClientRect().height)}`));
    const buttonLinks = await page.locator('a[data-kit="button"]').count();
    eq("ButtonLinks measured", buttonLinks > 50, true);
  }

  // Search.
  const search = page.getByRole("searchbox", { name: "Search topics" });
  await search.fill("rebound");
  await page.waitForFunction(() => document.querySelectorAll("article[data-topic]").length < 23);
  const matched = await page.locator("article[data-topic]").evaluateAll(cards => cards.map(c => c.id));
  eq("search keeps only matching cards", matched.length > 0 && matched.length < 23, true);
  eq("search count line", (await page.getByRole("status").filter({ hasText: "topics match" }).innerText()).trim(), `${matched.length} of 23 topics match “rebound”`);
  if (shots) { await page.evaluate(() => scrollTo(0, 0)); await page.screenshot({ path: `${shots}/learning-search-${tag}.png` }); }
  await search.fill("");
  await page.waitForFunction(() => document.querySelectorAll("article[data-topic]").length === 23);

  // Rounds 2 and 3: the search heads the index column at its width, 24 px above the index; on a phone, above the Topics button.
  const place = await page.evaluate(() => {
    const box = s => document.querySelector(s)?.getBoundingClientRect();
    const search = box(".ln-search"), aside = box(".ln-aside"), index = box(".ln-aside .ln-index"), button = box(".ln-index-phone summary");
    return { searchX: Math.round(search.left), searchW: Math.round(search.width), asideX: Math.round(aside.left), asideW: Math.round(aside.width),
      gap: index && index.height ? Math.round(index.top - search.bottom) : null, buttonGap: button && button.height ? Math.round(button.top - search.bottom) : null, buttonW: button ? Math.round(button.width) : null };
  });
  eq("search x = index column x", place.searchX, place.asideX);
  eq("search width = index column width", place.searchW, place.asideW);
  if (width > 600) eq("gap under search", place.gap, 24); else { eq("search above Topics", place.buttonGap > 0, true); eq("search width = Topics width", place.searchW, place.buttonW); }
  if (shots) { await page.evaluate(() => scrollTo(0, 0)); await page.locator(width > 600 ? ".ln-aside-sticky" : ".ln-body").screenshot({ path: `${shots}/learning-search-placement-${tag}.png`, ...(width > 600 ? {} : { clip: undefined }) }); }

  // Index: desktop marks the topic being read; the phone index opens and closes on a pick.
  if (width > 600) {
    await page.locator(".ln-aside a[href='#rapm']").click();
    await page.waitForFunction(() => document.querySelector(".ln-aside [aria-current]")?.textContent === "RAPM");
    eq("current topic", await page.locator(".ln-aside [aria-current]").innerText(), "RAPM");
    if (shots) await page.screenshot({ path: `${shots}/learning-index-rapm-${tag}.png` });
  } else {
    await page.evaluate(() => scrollTo(0, 0));
    await page.locator(".ln-index-phone summary").click();
    if (shots) await page.screenshot({ path: `${shots}/learning-index-open-${tag}.png` });
    await page.locator(".ln-index-phone a[href='#lineup-sample-size']").click();
    await page.waitForFunction(() => location.hash === "#lineup-sample-size" && !document.querySelector(".ln-index-phone").open);
    eq("phone index closes on pick", await page.evaluate(() => document.querySelector(".ln-index-phone").open), false);
  }

  report.push({ width, compared, mismatches, consoleErrors: errors, overflow, brokenImages: broken, phoneControlsUnder40: small, phoneButtonLinksUnder40: smallLinks });
  await page.close();
}
await browser.close();
const total = report.reduce((n, r) => n + r.compared, 0), bad = report.reduce((n, r) => n + r.mismatches.length, 0);
writeFileSync(out, JSON.stringify({ checkedOn: new Date().toISOString(), api: "GET via readonly-proxy.mjs → :8000", seasons: ff.seasons.map(s => s.season), total, mismatches: bad, scenes: report }, null, 2));
console.log(`compared ${total}, mismatches ${bad}`);
for (const r of report) console.log(r.width, "errors", r.consoleErrors.length, "overflow", r.overflow, "broken", r.brokenImages.length, "small", r.phoneControlsUnder40.length, "smallLinks", r.phoneButtonLinksUnder40.length, JSON.stringify(r.mismatches.slice(0, 5)));
