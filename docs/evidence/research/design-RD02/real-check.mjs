// Real-data check for RD02 (ORtg Calculator): every value the lab draws against the owner's API through the
// read-only proxy on 4180 (readonly-proxy.mjs, RD01's), the production build on 3180, at 1440 and 390.
// The lab computes on the page, so its outputs are also checked against Poropudas and Halme's Eq. (11) on the
// served inputs at the start, and on the inputs it draws after every move. Also console errors, page overflow,
// broken images and phone controls under 40 px.
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/calculator";
const [,, out, shots = out] = process.argv;
const api = async path => (await fetch(`${API}${path}`)).json();
const summary = await api("/api/four-factors");
const seasonData = {};
for (const s of summary.seasons) seasonData[s.season] = await api(`/api/four-factors/seasons/${s.season}`);
const eq11 = (efg, ftr, tov, orb, fg, ft, mu) => 100 * (1 - tov) * (ftr + 2 * efg) / (1 - orb * (1 - fg) + mu * ftr / ft);
const sgn = (v, d) => { const r = Number(v.toFixed(d)); const t = Math.abs(r).toFixed(d); return r > 0 ? `+${t}` : r < 0 ? `−${t}` : t; };
const pct = (v, d = 1) => `${(v * 100).toFixed(d)}%`;

// The served row's starting inputs, from its rates (and FT Rate = FTA/FGA from its counts).
function expected(row, mu) {
  const i = row.inputs, c = row.counts, r = row.rebounds_by_miss;
  return {
    inputs: { efg: i.efg, p2: row.fg2, p3: row.fg3, ft: i.ft, ts: row.ts, r3: row.fg3a_rate, fta: c.fta / c.fga, tov: i.tov_pct, orb: i.orb_pct, o2: r.two.orb_rate, o3: r.three.orb_rate, oft: r.ft_end.orb_rate },
    ortg: row.ortg_factors, eq11: eq11(i.efg, i.ftr, i.tov_pct, i.orb_pct, i.fg, i.ft, mu),
    xshot: 1 - i.tov_pct, xeff: i.ftr + 2 * i.efg, xposs: 1 / (1 - i.orb_pct * (1 - i.fg) + mu * i.ftr / i.ft),
    facts: { efg: i.efg, "miss-rate": 1 - i.fg, "shot-value": 2 * i.efg, "ft-value": i.ftr, den: 1 - i.orb_pct * (1 - i.fg) + mu * i.ftr / i.ft, "tov-survival": 1 - i.tov_pct, mu,
      "fg-recycle": (r.two.offensive + r.three.offensive) / c.fga, "ft-recycle": (r.ft_end.offensive + r.and_one.offensive) / c.fga },
    marginals: row.marginals,
  };
}

const latest = summary.seasons.at(-1).season;
const pickTeam = season => [...seasonData[season].teams].sort((a, b) => b.ortg_factors - a.ortg_factors)[0];
const SCENES = [
  { name: "league-latest", season: latest, team: null },
  { name: "league-2016-17", season: "2016-17", team: null },
  { name: "team-best-2018-19", season: "2018-19", team: pickTeam("2018-19").team },
];
const MOVES = ["p3", "tov", "efg", "ts", "orb", "o3", "fta", "r3", "ft", "oft", "p2", "o2"];
const report = [];
const browser = await chromium.launch();
for (const scene of SCENES) for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const errors = [], mismatches = []; let compared = 0;
  const eq = (what, got, want, tol = 0) => { compared += 1; const ok = typeof want === "number" ? Math.abs(Number(got) - want) <= tol : got === want; if (!ok) mismatches.push({ what, got, want }); };
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  const q = new URLSearchParams(); if (scene.season !== latest) q.set("season", scene.season); if (scene.team) q.set("team", scene.team);
  await page.goto(`${WEB}${q.size ? `?${q}` : ""}`, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForSelector('.ol-equation [data-field="ortg"]');
  const head = summary.seasons.find(s => s.season === scene.season), row = scene.team ? seasonData[scene.season].teams.find(t => t.team === scene.team) : head.league;
  const want = expected(row, head.mu);
  const attr = async sel => page.locator(sel).first().getAttribute("data-value");
  const text = async sel => (await page.locator(sel).first().textContent())?.trim();
  if (scene.team) await page.waitForFunction(v => Math.abs(Number(document.querySelector('.ol-equation [data-field="ortg"]').dataset.value) - v) < 1e-3, row.ortg_factors);
  // Start: inputs, rating, terms, decomposition, marginals.
  for (const [k, v] of Object.entries(want.inputs)) { eq(`input ${k} value`, await attr(`.ol-row[data-key="${k}"] [data-field="value"]`), v, 1e-5); eq(`input ${k} text`, await text(`.ol-row[data-key="${k}"] .ol-row-value`), pct(v)); eq(`stepper ${k} text`, await text(`.ol-step[data-key="${k}"] .ol-step-value`), pct(v)); }
  eq("ortg value = served", await attr('.ol-equation [data-field="ortg"]'), want.ortg, 1e-4);
  // The served inputs are rounded to six places, which moves Eq. (11) on them by up to ~2e-4.
  eq("ortg value = Eq. (11) on served inputs", await attr('.ol-equation [data-field="ortg"]'), want.eq11, 5e-4);
  eq("ortg text", await text('.ol-equation [data-field="ortg"]'), want.ortg.toFixed(1));
  eq("league avg text", await text('.ol-equation [data-field="league-ortg"]'), head.league.ortg_factors.toFixed(1));
  eq("vs avg text", await text('.ol-equation [data-field="vs-avg"]'), `${sgn(want.ortg - head.league.ortg_factors, 2)} vs avg`);
  for (const k of ["xshot", "xeff", "xposs"]) { eq(`${k} value`, await attr(`.ol-equation [data-field="${k}"]`), want[k], 1e-5); eq(`${k} text`, await text(`.ol-equation [data-field="${k}"]`), want[k].toFixed(3)); eq(`tile ${k}`, await text(`.ol-tiles [data-field="${k}"]`), want[k].toFixed(3)); }
  eq("tile ortg", await text('.ol-tiles [data-field="ortg"]'), want.ortg.toFixed(1));
  for (const [k, v] of Object.entries(want.facts)) eq(`fact ${k}`, await attr(`.ol-facts [data-field="${k}"]`), v, 1e-5);
  eq("tov marginal = served", await attr('.ol-row[data-key="tov"] [data-field="marginal"]'), want.marginals.tov_pct, 1e-5);
  eq("orb marginal = served", await attr('.ol-row[data-key="orb"] [data-field="marginal"]'), want.marginals.orb_pct, 1e-5);
  // Moves: each stepper's ΔORTG is what one click does, and the rating stays Eq. (11) on the inputs drawn.
  const drawnEq11 = async () => {
    const v = async k => Number(await attr(`.ol-row[data-key="${k}"] [data-field="value"]`));
    const [efg, p2, p3, r3, ft, fta, tov, orb] = await Promise.all(["efg", "p2", "p3", "r3", "ft", "fta", "tov", "orb"].map(v));
    const fg = (1 - r3) * p2 + r3 * p3, ftr = fta * ft;
    return eq11(efg, ftr, tov, orb, fg, ft, head.mu);
  };
  for (const k of MOVES) {
    const before = Number(await attr('.ol-equation [data-field="ortg"]')), shown = Number(await attr(`.ol-step[data-key="${k}"] [data-field="marginal"]`));
    await page.locator(`.ol-step[data-key="${k}"] button`).nth(k === "tov" ? 0 : 1).click();
    const after = Number(await attr('.ol-equation [data-field="ortg"]'));
    eq(`move ${k}: ΔORTG shown = change`, after - before, shown, 1e-9);
    eq(`move ${k}: Eq. (11) on drawn inputs`, after, await drawnEq11(), 1e-6);
  }
  await page.locator(`#ol-p2`).fill(String(Math.round((want.inputs.p2 - 0.03) * 1000) / 1000));
  eq("slider p2: Eq. (11) on drawn inputs", Number(await attr('.ol-equation [data-field="ortg"]')), await drawnEq11(), 1e-6);
  await page.locator(".ol-board-actions button").first().click();
  eq("reset ortg", await attr('.ol-equation [data-field="ortg"]'), want.ortg, 1e-4);
  // Observed tables (collapsed section).
  await page.locator("#observed summary").click();
  const L = head.league;
  const cell = async (table, rowKey, field) => attr(`[data-table="${table}"] tr[data-row="${rowKey}"] [data-field="${field}"]`);
  eq("league ortg", await cell("league", "ortg", "ortg"), L.ortg_factors, 0); eq("league mu", await cell("league", "mu", "mu"), head.mu, 0);
  for (const k of ["efg", "ftr", "tov_pct", "orb_pct", "fg", "ft"]) eq(`league ${k}`, await cell("league", k, k), L.inputs[k], 0);
  for (const [k, v] of Object.entries(L.marginals)) eq(`marginal ${k}`, await cell("marginals", k, "marginal"), v, 0);
  for (const [k, v] of Object.entries(L.rebounds_by_miss)) for (const f of ["misses", "offensive", "defensive", "unrebounded", "orb_rate"]) eq(`rebounds ${k} ${f}`, await cell("rebounds", k, f), v[f], 0);
  for (const s of summary.seasons) { eq(`mu ${s.season}`, await cell("mu", s.season, "mu"), s.mu, 0); eq(`mu ortg ${s.season}`, await cell("mu", s.season, "ortg"), s.league.ortg_factors, 0); }
  await page.waitForSelector('[data-table="teams"]');
  const teamOrder = await page.locator('[data-table="teams"] tbody tr').evaluateAll(rs => rs.map(r => r.dataset.row));
  eq("team order", teamOrder.join(","), [...seasonData[scene.season].teams].sort((a, b) => b.ortg_factors - a.ortg_factors).map(t => t.team).join(","));
  for (const t of seasonData[scene.season].teams) { eq(`team ${t.team} ortg`, await cell("teams", t.team, "ortg"), t.ortg_factors, 0); for (const k of ["efg", "tov_pct", "orb_pct"]) eq(`team ${t.team} ${k}`, await cell("teams", t.team, k), t.inputs[k], 0); }
  await page.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
  await page.waitForTimeout(1000);
  const layout = await page.evaluate(() => {
    const col = document.querySelector(".ol-page").getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - innerWidth, broken: [...document.images].filter(i => i.complete && !i.naturalWidth).length, images: document.images.length,
      column: { x: Math.round(col.x), width: Math.round(col.width) },
      small: innerWidth < 600 ? [...document.querySelectorAll(".ui-page button, .ui-page select, .ui-page input, .ui-page summary, .ui-page a")].filter(e => !e.closest(".ol-prose, .rs-note, p, li")).map(e => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.width && r.height && (r.height < 40 || r.width < 40)).map(({ e, r }) => `${e.tagName} ${e.getAttribute("aria-label") ?? e.textContent.trim().slice(0, 24)} ${Math.round(r.width)}x${Math.round(r.height)}`) : [] };
  });
  // The evidence shot is the scene's fresh start (the moves above change it), with images loaded.
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('.ol-equation [data-field="ortg"]');
  await page.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${shots}/calculator-${scene.name}-${width}.png`, fullPage: true });
  report.push({ scene: scene.name, width, compared, mismatches, errors, ...layout });
  console.log(scene.name, width, "compared", compared, "mismatches", mismatches.length, "errors", errors.length, JSON.stringify(layout));
  await page.close();
}
await browser.close();
writeFileSync(`${out}/real-data-check.json`, JSON.stringify(report, null, 2));
