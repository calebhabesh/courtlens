// R05 browser check: every data-value on /research/shot-quality against the API, at 1440 and 390.
// Run from inside a dashboard copy (it imports @playwright/test):
//   node browser-check.mjs <output dir>
import { chromium } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = "http://localhost:3180";
const API = "http://localhost:4180/api/shot-quality";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const get = async path => (await fetch(`${API}${path}`)).json();
const summary = await get("");
const boards = {
  "2025-26": await get("/players?season=2025-26"),
  "2022-23": await get("/players?season=2022-23"),
};
const player = await get("/player");

const report = { checked: {}, mismatches: [], console: [], overflow: {} };
const eq = (where, got, want) => {
  const g = got === "" || got === undefined || got === null ? null : Number(got);
  const w = want ?? null;
  if (g !== w) report.mismatches.push({ where, got, want });
};
const count = (key, n) => { report.checked[key] = (report.checked[key] ?? 0) + n; };

async function rows(page, selector, keyAttr) {
  return page.$$eval(selector, (els, attr) => els.map(r => ({
    key: r.getAttribute(attr),
    values: [...r.querySelectorAll("[data-value]")].map(c => ({ field: c.getAttribute("data-field"), value: c.getAttribute("data-value"), high: c.getAttribute("data-high") })),
  })), keyAttr);
}
const field = (row, name) => row.values.find(v => v.field === name);

function checkPlayerRow(where, row, api) {
  for (const name of ["fga", "fg_pct", "three_share", "pps", "xpps", "shot_making"]) eq(`${where} ${name}`, field(row, name)?.value, api[name]);
  const interval = field(row, "interval");
  eq(`${where} interval low`, interval?.value, api.interval?.[0]);
  eq(`${where} interval high`, interval?.high, api.interval?.[1]);
  return 8;
}

function checkMetricRow(where, row, block, name) {
  const m = block.models[name];
  const d = block.versus_baseline[name];
  const want = { brier: m.brier, log_loss: m.log_loss, points_mae: m.points_mae, ece: m.ece,
    relative_brier: d?.relative_brier.value, relative_brier_interval: d?.relative_brier.interval[0], relative_log_loss: d?.relative_log_loss.value };
  for (const [key, value] of Object.entries(want)) eq(`${where} ${key}`, field(row, key)?.value, value);
  if (d) eq(`${where} relative_brier high`, field(row, "relative_brier_interval")?.high, d.relative_brier.interval[1]);
  return Object.keys(want).length + (d ? 1 : 0);
}

const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
for (const width of [1440, 390]) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const page = await context.newPage();
  page.on("console", m => { if (m.type() === "error") report.console.push(`${width} ${m.text()}`); });
  page.on("pageerror", e => report.console.push(`${width} ${e.message}`));
  const overflow = async name => {
    report.overflow[`${name}-${width}`] = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  };
  const shoot = async name => {
    await overflow(name);
    await page.screenshot({ path: `${OUT}/r05-shot-quality-${name}-${width}.png`, fullPage: true });
    await page.screenshot({ path: `${OUT}/r05-shot-quality-${name}-${width}-viewport.png` });
  };

  // Players (default season), and one other season by URL.
  for (const season of ["2025-26", "2022-23"]) {
    await page.goto(`${BASE}/research/shot-quality${season === "2025-26" ? "" : `?season=${season}`}`, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-board='players'] [data-row]");
    const board = boards[season];
    const shown = await rows(page, "[data-board='players'] [data-row]", "data-row");
    if (JSON.stringify(shown.map(r => r.key)) !== JSON.stringify(board.rows.map(r => r.player_id))) report.mismatches.push({ where: `${season} board order` });
    shown.forEach((row, i) => count(`players ${season}`, checkPlayerRow(`${season} ${row.key}`, row, board.rows[i])));
    const league = await page.$eval(`[data-league='${season}']`, e => e.getAttribute("data-value"));
    eq(`${season} league term`, league, summary.players.league[season].league_term); count(`players ${season}`, 1);
    if (season === "2025-26") await shoot("players");
  }

  // Model
  await page.goto(`${BASE}/research/shot-quality?tab=model`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-table='slices'] [data-slice]");
  for (const row of await rows(page, "[data-metrics]", "data-metrics")) {
    const [scope, name] = row.key.split(":");
    const block = scope === "selection" ? summary.selection.metrics : scope === "test" ? summary.test.pooled : summary.test.by_season[scope.replace("test-", "")];
    count("model metrics", checkMetricRow(row.key, row, block, name));
  }
  const gates = summary.test.gates;
  for (const row of await rows(page, "[data-gate]", "data-gate")) {
    const g = gates[row.key];
    const want = row.key === "relative_brier" ? [g.value, g.brier_difference_interval[0]] : row.key === "log_loss" ? [g.difference, g.interval[0]] : [g.value];
    row.values.forEach((v, i) => eq(`gate ${row.key} ${i}`, v.value, want[i]));
    if (row.key !== "ece") eq(`gate ${row.key} high`, row.values[1].high, row.key === "relative_brier" ? g.brier_difference_interval[1] : g.interval[1]);
    count("gates", row.values.length + (row.key !== "ece" ? 1 : 0));
  }
  const chosen = summary.selection.chosen;
  for (const row of await rows(page, "[data-table='curve'] [data-bin]", "data-bin")) {
    const i = Number(row.key) - 1;
    const c = summary.test.curves[chosen][i], b = summary.test.curves.baseline[i];
    const want = [c.count, b.mean_predicted, b.observed, c.mean_predicted, c.observed];
    row.values.forEach((v, j) => eq(`curve ${row.key} ${j}`, v.value, want[j])); count("curve", row.values.length);
  }
  const points = await page.$$eval("svg.chart-reliability [data-series]", gs => gs.map(g => ({ s: g.getAttribute("data-series"), i: g.getAttribute("data-bin"), p: g.getAttribute("data-predicted"), o: g.getAttribute("data-observed"), n: g.getAttribute("data-count") })));
  for (const pt of points) {
    const bin = (pt.s === "1" ? summary.test.curves[chosen] : summary.test.curves.baseline)[Number(pt.i)];
    eq(`chart ${pt.s}-${pt.i} predicted`, pt.p, bin.mean_predicted); eq(`chart ${pt.s}-${pt.i} observed`, pt.o, bin.observed); eq(`chart ${pt.s}-${pt.i} count`, pt.n, bin.count);
    count("chart", 3);
  }
  if (points.length !== 40) report.mismatches.push({ where: "chart points", got: points.length, want: 40 });
  for (const row of await rows(page, "[data-slice]", "data-slice")) {
    const [family, ...rest] = row.key.split(":");
    const s = summary.test.slices.find(x => x.family === family && x.label === rest.join(":"));
    const d = s.metrics?.versus_baseline[chosen];
    const want = [s.attempts, s.metrics?.models.baseline?.brier, s.metrics?.models[chosen]?.brier, d?.relative_brier.value, d?.relative_brier.interval[0]];
    row.values.forEach((v, i) => eq(`slice ${row.key} ${i}`, v.value, want[i]));
    if (d) eq(`slice ${row.key} high`, row.values[4].high, d.relative_brier.interval[1]);
    count("slices", row.values.length + (d ? 1 : 0));
  }
  for (const row of await rows(page, "[data-persistence]", "data-persistence")) {
    const p = summary.players.persistence[row.key];
    eq(`persistence ${row.key} r`, row.values[0].value, p.r); eq(`persistence ${row.key} low`, row.values[1].value, p.interval[0]);
    eq(`persistence ${row.key} high`, row.values[1].high, p.interval[1]); count("persistence", 3);
  }
  for (const row of await rows(page, "[data-table='data'] [data-season]", "data-season")) {
    const d = summary.data[row.key];
    const want = [d.rows, d.games, d.join_rate, d.possession_known_rate, d.and_ones, d.assist_in_description.missed_True ?? 0];
    row.values.forEach((v, i) => eq(`data ${row.key} ${i}`, v.value, want[i])); count("data check", row.values.length);
  }
  const uncal = await page.$eval("[data-uncalibrated]", e => e.getAttribute("data-value"));
  eq("uncalibrated relative brier", uncal, summary.test.uncalibrated.versus_baseline[chosen].relative_brier.value); count("model metrics", 1);
  await shoot("model");

  // Player (default rule)
  await page.goto(`${BASE}/research/shot-quality?tab=player`, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-table='history'] [data-season]");
  for (const row of await rows(page, "[data-table='history'] [data-season]", "data-season")) {
    const h = player.seasons.find(x => x.season === row.key);
    count("player", checkPlayerRow(`history ${row.key}`, row, h));
  }
  const rule = await page.$eval("[data-rule='default']", e => e.textContent);
  if (rule !== player.selection_rule) report.mismatches.push({ where: "default rule text" });
  await shoot("player");
  await context.close();
}
await browser.close();
report.total_checked = Object.values(report.checked).reduce((a, b) => a + b, 0);
writeFileSync(`${OUT}/dom-checks.json`, JSON.stringify(report, null, 1) + "\n");
console.log(JSON.stringify({ checked: report.checked, total: report.total_checked, mismatches: report.mismatches.length, console: report.console.length, overflow: report.overflow }));
if (report.mismatches.length) console.log(JSON.stringify(report.mismatches.slice(0, 10)));
if (report.console.length) console.log(report.console.slice(0, 5));
