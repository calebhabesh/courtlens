// R03 real-data browser check. Run from a dashboard checkout (for @playwright/test) with the
// dashboard on :3180 and the API on :4180:  node browser-check.mjs <out-dir>
// Writes dom-checks.json and screenshots. Values on the page are compared with the API exactly
// (data-value attributes). Stats rows shown with the toggle on are written out for
// verify_stats_toggle.py, which recomputes them from the database.
import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";

const WEB = "http://localhost:3180", API = "http://localhost:4180";
const out = process.argv[2] ?? ".";
const api = async path => (await fetch(`${API}${path}`)).json();
const near = (a, b) => a === b || (typeof a === "number" && typeof b === "number" && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)));
const num = v => v === "" || v == null ? null : Number(v);

const summary = await api("/api/signal-noise");
const example = await api("/api/signal-noise/player");
const browser = await chromium.launch({ executablePath: "/usr/bin/chromium" });
const report = { results_sha256: summary.results_sha256, page: {}, stats: {} };

async function freezeChrome(page) {
  // Full-page captures paint sticky bars mid-page; make them static for the capture only.
  await page.addStyleTag({ content: ".courtlens-header,.replica-header{position:static!important}.skip-link{display:none!important}" });
}

for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${WEB}/research/signal-noise`, { waitUntil: "networkidle" });
  await page.getByRole("table", { name: "Worked example" }).waitFor();
  const dom = await page.evaluate(() => {
    const rows = sel => [...document.querySelectorAll(sel)];
    const cellValues = tr => [...tr.querySelectorAll("[data-value],[data-extrapolated]")].map(td => ({ value: td.getAttribute("data-value"), extrapolated: td.getAttribute("data-extrapolated"), status: td.getAttribute("data-status") }));
    return {
      league: rows('table[aria-label="Stabilization points"] tbody tr').map(tr => ({ stat: tr.dataset.stat, cells: cellValues(tr) })),
      bins: rows('table[aria-label="3P% bins"] tbody tr').map(tr => ({ bin: Number(tr.dataset.bin), cells: cellValues(tr).map(c => c.value) })),
      priors: rows('table[aria-label="Priors for 2026-27"] tbody tr').map(tr => ({ stat: tr.dataset.stat, cells: cellValues(tr).map(c => c.value) })),
      validation: rows('table[aria-label="Does shrinking predict next season better?"] tbody tr').map(tr => ({ stat: tr.dataset.stat, band: tr.dataset.band, cells: cellValues(tr).map(c => c.value) })),
      example: rows('table[aria-label="Worked example"] tbody tr').map(tr => ({ stat: tr.dataset.stat, cells: cellValues(tr).map(c => c.value) })),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  const mismatches = [];
  const check = (what, got, want) => { if (!near(num(got), want ?? null)) mismatches.push({ what, got, want }); };
  const stats = Object.fromEntries(summary.stabilization.stats.map(s => [s.key, s]));
  for (const row of dom.league) {
    const s = stats[row.stat];
    ["0.5", "0.7"].forEach((key, i) => {
      const level = s.levels[key], cell = row.cells[i];
      if (cell.status !== level.status) mismatches.push({ what: `${row.stat} ${key} status`, got: cell.status, want: level.status });
      check(`${row.stat} ${key} n`, cell.value, level.n);
      if (level.status === "not_reached") check(`${row.stat} ${key} extrapolated`, cell.extrapolated, level.extrapolated);
    });
  }
  for (const row of dom.bins) {
    const bin = stats.fg3_pct.bins.find(b => b.bin === row.bin);
    [bin.n, bin.r, bin.rho].forEach((want, i) => check(`fg3 bin ${row.bin}`, row.cells[i], want));
  }
  for (const row of dom.priors) {
    const fit = summary.priors[row.stat].find(p => p.season === "2026-27");
    check(`${row.stat} prior mean`, row.cells[0], fit.mean); check(`${row.stat} prior strength`, row.cells[1], fit.strength);
  }
  for (const row of dom.validation) {
    const block = row.band === "All" ? summary.validation[row.stat].pooled : summary.validation[row.stat].bands.find(b => b.band === row.band);
    check(`${row.stat} ${row.band} mse`, row.cells[0], block.mse.shrunk); check(`${row.stat} ${row.band} gain`, row.cells[1], block.raw_minus_shrunk.value);
  }
  const est = example.estimates;
  for (const row of dom.example) {
    const e = row.stat === "rim_fg_pct" ? example.rim : est[row.stat];
    check(`example ${row.stat} raw`, row.cells[0], e.raw); check(`example ${row.stat} shrunk`, row.cells[1], e.shrunk.value);
  }
  await page.screenshot({ path: `${out}/signal-noise-viewport-${width}.png` });
  await freezeChrome(page);
  await page.screenshot({ path: `${out}/signal-noise-${width}.png`, fullPage: true });
  report.page[width] = {
    compared: dom.league.length * 2 + dom.bins.length * 3 + dom.priors.length * 2 + dom.validation.length * 2 + dom.example.length * 2,
    league_rows: dom.league.length, bin_rows: dom.bins.length, prior_rows: dom.priors.length, validation_rows: dom.validation.length, example_rows: dom.example.length,
    mismatches, console_errors: errors, page_overflow_px: dom.overflow,
  };
  await page.close();
}

const SCOPES = [
  { name: "2025-26 whole season", query: "season=2025-26&phase=regular_season&viewId=shooting", shot: "stats-shrunk-2025-26" },
  { name: "2026-27 default", query: "viewId=shooting", shot: "stats-shrunk-2026-27" },
  { name: "2025-26 team filter", query: "season=2025-26&phase=regular_season&viewId=shooting&teamId=BOS", shot: null },
  { name: "2024-25 playoffs", query: "season=2024-25&phase=playoffs&viewId=shooting", shot: null },
];
for (const width of [1440, 390]) for (const scope of SCOPES) {
  if (width === 390 && !scope.shot) continue;
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const requests = [], errors = [];
  page.on("request", r => { if (r.url().startsWith(API)) requests.push(`${r.method()} ${r.url().slice(API.length)}`); });
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto(`${WEB}/stats?${scope.query}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const read = () => page.evaluate(() => ({
    heads: [...document.querySelectorAll("thead tr.stats-header-tier-2 th")].map(t => t.textContent.trim()).filter(Boolean),
    rows: [...document.querySelectorAll("tbody tr.stats-table-row[data-player-id]")].map(tr => ({ player_id: tr.dataset.playerId,
      cells: Object.fromEntries([...tr.querySelectorAll("td[data-column]")].map(td => [td.dataset.column, td.querySelector(".stat-main-value")?.textContent?.trim() ?? td.textContent.trim()])) })),
  }));
  const before = await read();
  const n0 = requests.length;
  const toggle = page.getByRole("button", { name: "Show shrunk shooting percentages" });
  await toggle.click();
  await page.waitForTimeout(2000);
  const on = await read();
  const urlOn = page.url();
  const note = (await page.locator(".ui-gated-note").allTextContents()).find(t => t.includes("Shrunk") || t.includes("shrink")) ?? null;
  const added = requests.slice(n0);
  const rawChanged = before.rows.flatMap((row, i) => Object.entries(row.cells).filter(([k, v]) => on.rows[i]?.cells[k] !== v).map(([k]) => `${row.player_id}:${k}`));
  if (scope.shot) await page.screenshot({ path: `${out}/${scope.shot}-${width}.png` });
  await toggle.click();
  await page.waitForTimeout(1200);
  const off = await read();
  report.stats[`${scope.name} @${width}`] = {
    query: scope.query, url_on: urlOn, url_off: page.url(), heads_before: before.heads, heads_on: on.heads, note,
    requests_on_toggle: added, stats_query_rerun_on_toggle: added.some(r => r.includes("/api/workbench")),
    off_identical_to_before: JSON.stringify(off) === JSON.stringify(before), raw_cells_changed_when_on: rawChanged,
    rows_on: width === 1440 ? on.rows.map(row => ({ player_id: row.player_id, shown: Object.fromEntries(Object.entries(row.cells).filter(([k]) => k.includes("shrunk") || k.startsWith("rim_") || ["fg3m", "fg3_pct", "ft_pct", "ts_pct"].includes(k))) })) : undefined,
    console_errors: errors,
  };
  await page.close();
}
await browser.close();
writeFileSync(`${out}/dom-checks.json`, JSON.stringify(report, null, 1) + "\n");
const totals = Object.values(report.page).map(p => `${p.compared} compared, ${p.mismatches.length} mismatches, ${p.console_errors.length} errors, overflow ${p.page_overflow_px}`);
console.log(totals.join("\n"));
for (const [k, v] of Object.entries(report.stats)) console.log(k, "| rerun", v.stats_query_rerun_on_toggle, "| off==before", v.off_identical_to_before, "| raw changed", v.raw_cells_changed_when_on.length, "| rows", v.rows_on?.length ?? "-", "| errors", v.console_errors.length);
