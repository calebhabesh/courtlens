// R04 browser check: every data-value on /research/zts against the API, at 1440 and 390.
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:3180";
const API = "http://localhost:4180/api/zts";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const get = async path => (await fetch(`${API}${path}`)).json();
const summary = await get("");
const board = await get("/leaderboard?season=2025-26&sort=zts_add&limit=1000");
const top = await get("/leaderboard?season=all&sort=zts_add&limit=200");
const player = await get("/player");

const report = { checked: {}, mismatches: [], console: [], overflow: {} };
const eq = (where, got, want) => {
  const g = got === "" ? null : Number(got);
  const w = want ?? null;
  if (!(g === w || (g !== null && w !== null && g === w))) report.mismatches.push({ where, got, want });
};
const count = (key, n) => { report.checked[key] = (report.checked[key] ?? 0) + n; };

async function cells(page, rowSelector) {
  return page.$$eval(rowSelector, rows => rows.map(r => ({
    key: r.getAttribute("data-row") ?? r.getAttribute("data-type") ?? r.getAttribute("data-season") ?? r.getAttribute("data-validation"),
    values: [...r.querySelectorAll("[data-value]")].map(c => ({ field: c.getAttribute("data-field"), value: c.getAttribute("data-value") })),
  })));
}
const byField = (row, field) => row.values.find(v => v.field === field)?.value;

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
for (const width of [1440, 390]) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const page = await context.newPage();
  page.on("console", m => { if (m.type() === "error") report.console.push(`${width} ${m.text()}`); });
  page.on("pageerror", e => report.console.push(`${width} ${e.message}`));
  const overflow = async name => {
    report.overflow[`${name}-${width}`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  };

  // About
  await page.goto(`${BASE}/research/zts`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-board='about'] [data-row]");
  const ref = summary.references["2025-26"];
  for (const row of await cells(page, "table[aria-label='2025-26 league play-type TS'] [data-type]")) {
    if (row.key === "league") { eq("league ts", row.values[0].value, ref.ts); count("league", 1); continue; }
    const t = ref.types.find(x => x.play_type === row.key);
    eq(`type ${row.key} ts`, row.values[0].value, t.ts); eq(`type ${row.key} share`, row.values[1].value, t.share); count("league", 2);
  }
  const rowsById = new Map(board.rows.map(r => [r.player_id, r]));
  for (const row of await cells(page, "[data-pair] [data-row], [data-board='about'] [data-row], table[aria-label='Easiest roles'] [data-row], table[aria-label='Hardest roles'] [data-row]")) {
    const api = rowsById.get(row.key);
    if (!api) { report.mismatches.push({ where: "row not in API", got: row.key }); continue; }
    for (const field of ["rts", "difficulty", "zts", "zts_add"]) {
      const got = byField(row, field);
      if (got !== undefined) { eq(`${row.key} ${field}`, got, api[field]); count("about rows", 1); }
    }
  }
  const shownIds = await page.$$eval("[data-board='about'] [data-row]", rs => rs.map(r => r.getAttribute("data-row")));
  if (JSON.stringify(shownIds) !== JSON.stringify(board.rows.slice(0, 50).map(r => r.player_id))) report.mismatches.push({ where: "about leaderboard order" });
  for (const row of await cells(page, "[data-validation]")) {
    const [target, ...rest] = row.key.split("-");
    const name = rest.join("-");
    const split = summary.validation[target][name.startsWith("Choice") ? "choice" : "test"];
    const block = name.includes("pooled") ? split.pooled : split.by_season[name.replace("Test ", "")];
    const want = [block.metrics.r_rts.value, block.metrics.r_zts.value, block.metrics.delta_r.value, block.metrics.delta_mse?.value ?? null];
    row.values.forEach((v, i) => eq(`validation ${row.key} ${i}`, v.value, want[i]));
    count("validation", row.values.length);
  }
  for (const row of await cells(page, "table[aria-label='Coverage by season'] [data-season]")) {
    const c = summary.coverage[row.key].status;
    const want = [c.known ?? 0, ...["no_rts", "small_sample", "no_play_types", "source_rows_missing", "low_coverage"].map(s => c[s] ?? 0)];
    row.values.forEach((v, i) => eq(`coverage ${row.key} ${i}`, v.value, want[i])); count("coverage", row.values.length);
  }
  const histogram = await page.$$eval("[data-bin]", bins => bins.reduce((sum, b) => sum + Number(b.getAttribute("data-count")), 0));
  eq("histogram total (500+ min)", String(histogram), board.rows.filter(r => (r.minutes ?? 0) >= 500).length); count("histogram", 1);
  await overflow("about");
  await page.screenshot({ path: `${OUT}/r04-zts-about-${width}.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/r04-zts-about-${width}-viewport.png` });

  // Top 200
  await page.goto(`${BASE}/research/zts?tab=top`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-board='top'] [data-row]");
  const topRows = await cells(page, "[data-board='top'] [data-row]");
  if (topRows.length !== top.rows.length) report.mismatches.push({ where: "top rows", got: topRows.length, want: top.rows.length });
  topRows.forEach((row, i) => {
    const api = top.rows[i];
    if (row.key !== `${api.season}:${api.player_id}`) report.mismatches.push({ where: `top order ${i}`, got: row.key });
    const [minutes, usage] = row.values.filter(v => !v.field).map(v => v.value);
    eq(`top ${row.key} minutes`, minutes, api.minutes); eq(`top ${row.key} usage`, usage, api.scoring_usage);
    for (const field of ["rts", "difficulty", "zts", "zts_add"]) eq(`top ${row.key} ${field}`, byField(row, field), api[field]);
    count("top", 6);
  });
  await overflow("top");
  await page.screenshot({ path: `${OUT}/r04-zts-top-${width}.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/r04-zts-top-${width}-viewport.png` });

  // Player (default rule)
  await page.goto(`${BASE}/research/zts?tab=player`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-types] [data-type]");
  for (const row of await cells(page, "[data-types] [data-type]")) {
    if (row.key === "total") {
      const [syn, league, expected] = row.values.map(v => v.value);
      eq("player synergy ts", syn, player.synergy_ts); eq("player league ts", league, player.league_ts); eq("player expected", expected, player.expected_ts);
      count("player", 3); continue;
    }
    const t = player.play_types.find(x => x.play_type === row.key);
    const want = [t.share, t.ts, t.league_ts, t.contribution];
    row.values.forEach((v, i) => eq(`player ${row.key} ${i}`, v.value, want[i])); count("player", row.values.length);
  }
  for (const row of await cells(page, "[data-history] [data-season]")) {
    const h = player.history.find(x => x.season === row.key);
    for (const field of ["rts", "difficulty", "zts"]) eq(`history ${row.key} ${field}`, byField(row, field), h[field]);
    count("player", 3);
  }
  await overflow("player");
  await page.screenshot({ path: `${OUT}/r04-zts-player-${width}.png`, fullPage: true });
  await page.screenshot({ path: `${OUT}/r04-zts-player-${width}-viewport.png` });
  await context.close();
}
await browser.close();
report.total_checked = Object.values(report.checked).reduce((a, b) => a + b, 0);
writeFileSync(`${OUT}/dom-checks.json`, JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify({ checked: report.checked, total: report.total_checked, mismatches: report.mismatches.length, console: report.console.length, overflow: report.overflow }));
if (report.mismatches.length) console.log(JSON.stringify(report.mismatches.slice(0, 10)));
if (report.console.length) console.log(report.console.slice(0, 5));
