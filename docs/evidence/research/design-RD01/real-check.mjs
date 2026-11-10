// Real-data check for RD01 (Combine & Wingspan), rounds 1–2: every value the page draws against the owner's API through the
// read-only proxy on 4180 (readonly-proxy.mjs), the production build on 3180, at 1440 and 390. Also console
// errors, page overflow, broken images and the layout figures for the evidence README.
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/wingspan";
const [,, out, shots = out] = process.argv;
const api = async path => (await fetch(`${API}${path}`)).json();
const data = await api("/api/wingspan");
const byId = new Map(data.players.map(p => [p.player_id, p]));
const num = v => v === null || v === undefined || v === "" ? null : Number(v);
const sign = v => v == null || v === 0 ? null : v > 0 ? "a" : "b";
// The page's formats (lib/wingspan-format.ts), repeated so drawn text is checked, not only data-value.
const Q = ["", "¼", "½", "¾"];
const inch = v => { const q = Math.round(v * 4); if (Math.abs(q / 4 - v) < 1e-9) { const w = Math.floor(q / 4); return `${w}${Q[q - w * 4]}`; } return v.toFixed(2); };
const len = (v, u) => { if (v == null) return "—"; if (u === "in") return `${v.toFixed(2)}″`; if (u === "m") return `${(v * 2.54 / 100).toFixed(2)} m`; if (u === "cm") return `${(v * 2.54).toFixed(1)} cm`; let f = Math.floor(v / 12), i = v - f * 12; if (Math.round(i * 100) >= 1200) { f += 1; i = 0; } return `${f}′${inch(i)}″`; };
const diff = (v, u) => v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${u === "m" || u === "cm" ? `${(Math.abs(v) * 2.54).toFixed(1)} cm` : `${u === "in" ? Math.abs(v).toFixed(2) : inch(Math.abs(v))}″`}`;
// Signed to d places; a value that rounds to zero prints unsigned and takes no colour.
const rounded = (v, d) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;
const sgn = (v, d) => { const r = rounded(v, d); return r == null ? "—" : `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(d)}`; };
const order = rows => [...rows].sort((a, b) => (b.wingspan ?? 0) - (a.wingspan ?? 0) || a.player_id.localeCompare(b.player_id));
const measured = data.players.filter(p => p.measurement_source != null);

const SCENES = [
  { name: "default", query: "", rows: measured.filter(p => p.active === true), units: "ftin", shoes: false },
  { name: "all-inches-shoes", query: "?status=all&units=in&shoes=1", rows: measured, units: "in", shoes: true },
  { name: "all-cm", query: "?status=all&units=cm", rows: measured, units: "cm", shoes: false },
  { name: "active-m-reported-similar", query: "?units=m&build=1641705&overlay=1641705,1630228", rows: measured.filter(p => p.active === true), units: "m", shoes: false, build: "1641705", overlay: ["1641705", "1630228"] },
  { name: "graph-marks", query: "?mark=1630228,1629627,1628983,1641705,203507,1626164", rows: measured.filter(p => p.active === true), units: "ftin", shoes: false, marks: ["1630228", "1629627", "1628983", "1641705", "203507", "1626164"] },
  { name: "state", query: "?status=all&year=2024&overlay=1630198,203497,1642843&build=203497&x=diff&y=d_dpm", rows: measured.filter(p => p.combine_year === 2024), units: "ftin", shoes: false, year: 2024, build: "203497", overlay: ["1630198", "203497", "1642843"], x: "diff", y: "d_dpm" },
];
const report = [];
const browser = await chromium.launch();
for (const scene of SCENES) for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const errors = [], mismatches = []; let compared = 0;
  const eq = (what, got, want) => { compared += 1; if (!(got === want || (got == null && want == null))) mismatches.push({ what, got, want }); };
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${WEB}${scene.query}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector('[aria-label="Wingspan players"] tbody tr[data-row]', { timeout: 60000 });
  if (scene.build) await page.waitForSelector('table[aria-label="Nearest builds"] tbody tr', { timeout: 60000 });
  if (scene.year) await page.waitForSelector('[aria-label="Combine drills"] tbody tr[data-row]', { timeout: 60000 });

  // Players table: order, every cell's value and text, unknowns and sign colours.
  const want = order(scene.rows);
  const rows = await page.$$eval('[aria-label="Wingspan players"] tbody tr[data-row]', trs => trs.map(tr => ({ id: tr.dataset.row,
    reported: tr.querySelector(".ws-reported") !== null,
    cells: Object.fromEntries([...tr.querySelectorAll("td[data-column]")].map(td => [td.dataset.column, { value: td.getAttribute("data-value"), text: td.querySelector(".rs-grid-value")?.textContent ?? td.textContent.trim(), sub: td.querySelector(".rs-grid-sub")?.textContent ?? null, identity: td.querySelector(".rs-grid-value")?.getAttribute("data-identity") ?? null }])) })));
  eq("row order", rows.map(r => r.id).join(","), want.map(p => p.player_id).join(","));
  const pct = v => v == null ? null : `${Math.round(v)}`;
  for (const r of rows) {
    const p = byId.get(r.id), c = r.cells, h = scene.shoes ? p.height_shoes : p.height;
    eq(`${r.id} height`, num(c.height.value), h); eq(`${r.id} height text`, c.height.text, len(h, scene.units));
    if (!scene.shoes && h != null) eq(`${r.id} height p`, c.height.sub, pct(p.percentiles.height));
    eq(`${r.id} wingspan`, num(c.wingspan.value), p.wingspan); eq(`${r.id} wingspan text`, c.wingspan.text, len(p.wingspan, scene.units));
    eq(`${r.id} diff`, num(c.diff.value), p.diff); eq(`${r.id} diff text`, c.diff.text, diff(p.diff, scene.units));
    if (p.diff != null) { eq(`${r.id} diff tone`, c.diff.identity, sign(p.diff)); eq(`${r.id} diff p`, c.diff.sub, pct(p.percentiles.diff)); }
    for (const k of ["d_dpm_now", "d_dpm"]) {
      eq(`${r.id} ${k}`, num(c[k].value), p[k]);
      if (p[k] == null) eq(`${r.id} ${k} unknown`, c[k].text, "—"); else eq(`${r.id} ${k} tone`, c[k].identity, sign(rounded(p[k], k === "d_dpm" ? 2 : 1)));
    }
    eq(`${r.id} position`, c.position.text, p.position_label ?? p.position ?? "—");
    eq(`${r.id} reported tag`, r.reported, p.measurement_source === "craftednba");
    if (p.measurement_source === "craftednba") eq(`${r.id} reported has no percentile`, c.height.sub ?? c.wingspan.sub ?? c.diff.sub, null);
    if (p.d_dpm_now != null) eq(`${r.id} d_dpm_now text`, c.d_dpm_now.text, sgn(p.d_dpm_now, 1));
  }
  // The table renders every row; compare all of them (no paging).
  const summary = await page.getAttribute('[data-field="summary"]', "data-value");
  eq("summary rows", num(summary), want.length);

  // Position cards and the methodology's averages table.
  for (const a of data.positional_averages) {
    for (const k of ["height", "wingspan", "diff", "weight", "d_dpm"]) eq(`avg ${a.position} ${k}`, num(await page.getAttribute(`table[aria-label="Positional averages"] tr[data-row="${a.position}"] [data-field="${k}"]`, "data-value")), a[k].mean);
    if (a.position === "ALL") continue;
    for (const k of ["height", "wingspan", "diff"]) eq(`card ${a.position} ${k}`, num(await page.getAttribute(`.ws-average[data-row="${a.position}"] [data-field="${k}"]`, "data-value")), a[k].mean);
  }
  // Correlations, within position.
  const corr = await page.$$eval('table[aria-label="Correlations"] tbody tr', trs => trs.map(tr => ({ r: tr.querySelector('[data-field="r"]').dataset.value, low: tr.querySelector('[data-field="r"]').dataset.low, high: tr.querySelector('[data-field="r"]').dataset.high, n: tr.querySelector('[data-field="n"]').dataset.value })));
  [...data.correlations, data.partial].forEach((c, i) => { eq(`corr ${i} r`, num(corr[i]?.r), c.r); eq(`corr ${i} low`, num(corr[i]?.low), c.low); eq(`corr ${i} high`, num(corr[i]?.high), c.high); eq(`corr ${i} n`, num(corr[i]?.n), c.n); });
  for (const w of data.within_position) {
    const cell = `table[aria-label="Correlations within position"] tr[data-row="${w.position}"] [data-pair="${w.x}:${w.y}"]`;
    for (const [attr, key] of [["data-value", "r"], ["data-low", "low"], ["data-high", "high"]]) eq(`within ${w.position} ${w.x} ${key}`, num(await page.getAttribute(cell, attr)), w[key]);
  }

  // Scatter: every point against the served player.
  const x = scene.x ?? "height", y = scene.y ?? "wingspan", rating = x === "d_dpm" || y === "d_dpm";
  const pts = await page.$$eval("circle[data-player]", cs => cs.map(c => [c.dataset.player, c.dataset.x, c.dataset.value]));
  const wantPts = data.players.filter(p => (rating ? p.in_population : p.measurement_source != null) && p[x] != null && p[y] != null);
  eq("scatter points", pts.length, wantPts.length);
  for (const [id, px, py] of pts) { eq(`pt ${id} x`, num(px), byId.get(id)[x]); eq(`pt ${id} y`, num(py), byId.get(id)[y]); }
  const c = data.correlations.find(r => (r.x === x && r.y === y) || (r.x === y && r.y === x));
  eq("scatter r", num(await page.getAttribute('[data-field="scatter-r"]', "data-value")), c?.r ?? null);

  // Similar profiles, overlay and drills when the scene has them.
  if (scene.build) {
    const near = await api(`/api/wingspan/nearest/${scene.build}`);
    const got = await page.$$eval('table[aria-label="Nearest builds"] tbody tr', trs => trs.map(tr => ({ id: tr.dataset.row, d: tr.querySelector('[data-field="distance"]').dataset.value, w: tr.querySelector('[data-field="wingspan"]').dataset.value })));
    eq("nearest count", got.length, near.neighbours.length + 1);
    near.neighbours.forEach((n, i) => { eq(`nearest ${i} id`, got[i + 1]?.id, n.player_id); eq(`nearest ${i} distance`, num(got[i + 1]?.d), n.distance); eq(`nearest ${i} wingspan`, num(got[i + 1]?.w), n.wingspan); });
  }
  if (scene.overlay) for (const id of scene.overlay) for (const k of ["height", "wingspan"])
    eq(`overlay ${id} ${k}`, num(await page.getAttribute(`rect[data-player="${id}"][data-kind="${k}"]`, "data-value")), byId.get(id)[k]);
  if (scene.marks) {
    for (const id of scene.marks) eq(`mark ${id} drawn`, num(await page.getAttribute(`.ws-picked[data-selected="${id}"] circle`, "data-value")), byId.get(id)[y]);
    const ys = await page.$$eval(".ws-picked-label", els => els.map(e => Number(e.getAttribute("y"))).sort((a, b) => a - b));
    eq("mark labels apart", ys.every((v, i) => i === 0 || v - ys[i - 1] >= 17.9), true);
  }
  if (scene.year) {
    const combine = await api(`/api/workbench/combine?draftYear=${scene.year}`);
    const drills = await page.$$eval('[aria-label="Combine drills"] tbody tr[data-row]', trs => trs.map(tr => ({ id: tr.dataset.row, cells: Object.fromEntries([...tr.querySelectorAll("td[data-column]")].map(td => [td.dataset.column, td.getAttribute("data-value")])) })));
    eq("drills count", drills.length, combine.rows.length);
    const rowsByKey = new Map(combine.rows.map(r => [r.row_key, r]));
    const map = { pick: "pick_overall", reach: "standing_reach_inches", weight: "weight_lbs", vert: "max_vertical_inches", lane: "lane_agility_seconds", sprint: "three_quarter_sprint_seconds" };
    for (const d of drills) for (const [col, key] of Object.entries(map)) eq(`drill ${d.id} ${col}`, num(d.cells[col]), rowsByKey.get(d.id)?.[key] ?? null);
  }

  // Page health and layout.
  const health = await page.evaluate(async () => {
    for (const i of document.images) i.loading = "eager";
    await Promise.all([...document.images].map(i => i.complete ? null : new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 60000); })));
    // A portrait the API answers 404 for is swapped for initials in React's onError: let that render first.
    await new Promise(r => setTimeout(r, 1000));
    const col = document.querySelector(".rs-column").getBoundingClientRect(), scroll = document.querySelector('[aria-label="Wingspan players scroll area"]');
    const phoneSmall = innerWidth < 600 ? [...document.querySelectorAll("button, select, input, [role=radio]")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40 && !e.closest("[aria-hidden=true]"); }).length : null;
    return { overflow: document.documentElement.scrollWidth - innerWidth, broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).length,
      images: document.images.length, columnWidth: Math.round(col.width), columnLeft: Math.round(col.left), tableSideways: scroll.scrollWidth - scroll.clientWidth, tableFrame: scroll.clientHeight, controlsUnder40AtPhone: phoneSmall };
  });
  if (scene.name === "default") await page.screenshot({ path: shots.replace(/\.json$/, `-r2-${width}.png`), fullPage: true });
  if (scene.name === "active-m-reported-similar") await page.screenshot({ path: shots.replace(/\.json$/, `-r2-metric-${width}.png`), fullPage: true });
  if (scene.name === "state") await page.screenshot({ path: shots.replace(/\.json$/, `-r2-state-${width}.png`), fullPage: true });
  report.push({ scene: scene.name, width, compared, mismatches: mismatches.length, firstMismatches: mismatches.slice(0, 5), consoleErrors: errors, ...health });
  console.log(scene.name, width, compared, "compared,", mismatches.length, "mismatches,", errors.length, "errors", JSON.stringify(health));
  await page.close();
}
await browser.close();
writeFileSync(out, JSON.stringify({ measured_on: new Date().toISOString(), api: "owner :8000 via read-only proxy :4180", web: WEB, report }, null, 2));
