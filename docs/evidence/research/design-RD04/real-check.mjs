// Real-data check for RD04 (Shot Quality): every value the page draws against the owner's API through the read-only proxy on
// 4180 (RD03's readonly-proxy.mjs, GET only), the production build on 3180, at 1440 and 390. Also the colour rule (green/red
// only where the served interval excludes zero), console errors, page overflow, broken images (photos forced eager and
// awaited) and phone controls under 40 px.
// Usage: node real-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/research/shot-quality";
const [,, out, shots] = process.argv;
const cache = {};
const api = async path => cache[path] ??= await (await fetch(`${API}${path}`)).json();
const board = (season, side) => api(`/api/shot-quality/decomposition/players?season=${season}&side=${side}&sort=ts&minShots=1000`);
const TARGETS = ["ts", "sq", "make", "ft"];
const SIDES = ["offense", "defense", "combined"];
const tone = (lo, hi) => lo == null || hi == null ? null : lo > 0 ? "good" : hi < 0 ? "bad" : null;

const SCENES = [
  { name: "decomposition-offense", q: "", tab: "decomposition", season: "2025-26", side: "offense" },
  { name: "decomposition-defense", q: "side=defense", tab: "decomposition", season: "2025-26", side: "defense" },
  { name: "decomposition-combined-2023-24", q: "side=combined&dSeason=2023-24", tab: "decomposition", season: "2023-24", side: "combined" },
  { name: "decomposition-team-bos", q: "", tab: "decomposition", season: "2025-26", side: "offense", team: "BOS", teamName: "Boston Celtics" },
  { name: "shot-making-latest", q: "tab=shot-making", tab: "shot-making", season: "2025-26" },
  { name: "shot-making-team-den", q: "tab=shot-making", tab: "shot-making", season: "2025-26", team: "DEN", teamName: "Denver Nuggets" },
  { name: "shot-making-2022-23", q: "tab=shot-making&season=2022-23", tab: "shot-making", season: "2022-23" },
  { name: "model", q: "tab=model", tab: "model" },
  { name: "player-default", q: "tab=player", tab: "player" },
  { name: "player-jokic", q: "tab=player&player=203999", tab: "player", id: "203999" },
];

const report = [];
const browser = await chromium.launch();
for (const scene of SCENES) for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const errors = [], mismatches = []; let compared = 0;
  const eq = (what, got, want, tol = 0) => {
    compared += 1;
    const ok = want === null ? got === null : typeof want === "number" ? got !== null && got !== "" && Math.abs(Number(got) - want) <= tol : got === want;
    if (!ok) mismatches.push({ what, got, want });
  };
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${WEB}${scene.q ? `?${scene.q}` : ""}`, { waitUntil: "networkidle", timeout: 120000 });
  // All of a table's cells in one read: { rowKey: { column: { value, low, high, tone } } }.
  const grab = async (rowSel, cellSel) => page.locator(rowSel).evaluateAll((rows, cellSel) => rows.map(r => ({
    key: r.getAttribute("data-row"),
    cells: Object.fromEntries([...r.querySelectorAll(cellSel)].map(c => {
      const t = c.querySelector("[data-tone]") ?? (c.hasAttribute("data-tone") ? c : null);
      const v = c.hasAttribute("data-value") ? c : c.querySelector("[data-value]");
      return [c.getAttribute("data-column") ?? c.getAttribute("data-field"), { value: v?.getAttribute("data-value") ?? null, low: v?.getAttribute("data-low") ?? null, high: v?.getAttribute("data-high") ?? null, tone: t?.getAttribute("data-tone") ?? null }];
    })),
  })), cellSel);
  const attr = async (sel, name = "data-value") => page.locator(sel).first().getAttribute(name);
  // Round 2: the team filter is the logo-grid picker (no dropdown); choose the scene's team through its dialog.
  const pickTeam = async () => {
    eq("no team dropdown", await page.locator(".rt-toolbar select[aria-label='Team']").count(), 0);
    await page.getByRole("button", { name: "Select Team" }).click();
    const dialog = page.getByRole("dialog", { name: "Select Team" });
    eq("picker tiles", await dialog.locator(".team-grid-tile").count() >= 30, true);
    await dialog.getByRole("button", { name: scene.teamName }).click();
    eq("picker closed", await dialog.waitFor({ state: "detached", timeout: 5000 }).then(() => 0, () => 1), 0); // after its close animation
    eq("picker label", await page.getByRole("button", { name: new RegExp(`^Team, ${scene.teamName}`) }).count(), 1);
  };

  if (scene.tab === "decomposition") {
    const summary = await api("/api/shot-quality/decomposition");
    const b = scene.team ? await api(`/api/shot-quality/decomposition/players?season=${scene.season}&side=${scene.side}&sort=ts&minShots=1000&team=${scene.team}`) : await board(scene.season, scene.side);
    await page.waitForSelector(".sq-board tbody tr[data-row]", { timeout: 60000 });
    if (scene.team) await pickTeam();
    const rows = await grab(".sq-board tbody tr[data-row]", "td[data-column]");
    eq("board order", JSON.stringify(rows.map(r => r.key)), JSON.stringify(b.rows.map(r => r.player_id)));
    const byKey = Object.fromEntries(rows.map(r => [r.key, r.cells]));
    for (const r of b.rows) {
      const cells = byKey[r.player_id] ?? {};
      for (const t of TARGETS) {
        eq(`${r.player_id} ${t}`, cells[t]?.value ?? null, r.values[t]);
        eq(`${r.player_id} ${t} low`, cells[t]?.low ?? null, r.intervals[t][0]);
        eq(`${r.player_id} ${t} high`, cells[t]?.high ?? null, r.intervals[t][1]);
        eq(`${r.player_id} ${t} tone`, cells[t]?.tone ?? null, tone(r.intervals[t][0], r.intervals[t][1]));
      }
      eq(`${r.player_id} shots`, cells.shots?.value ?? null, r.shots);
    }
    if (!scene.team) {
      eq("count", await attr(".sq-board [data-count]", "data-count"), String(b.rows.length));
      eq("unknown", await attr(".sq-board [data-unknown]", "data-unknown"), String(b.unknown.length));
    }
    eq("count chip", (await page.locator(".sq-board .rt-toolbar").innerText()).includes(`${b.rows.length.toLocaleString("en-US")} players`), true);
    // How to Read examples: the season's highest oTS and lowest dTS.
    const off = await board(scene.season, "offense"), def = await board(scene.season, "defense");
    eq("offense example", await attr("[data-example='offense']"), Math.max(...off.rows.map(r => r.values.ts)));
    eq("defense example", await attr("[data-example='defense']"), Math.min(...def.rows.map(r => r.values.ts)));
    // Persistence: eight components and the two differences.
    for (const [key, c] of Object.entries(summary.persistence.correlations)) {
      const sel = key.endsWith("sq_minus_make") ? `.sq-well[data-row="${key}"]` : `.sq-ci-row[data-row="${key}"]`;
      eq(`persistence ${key}`, await attr(sel), c.r); eq(`persistence ${key} low`, await attr(sel, "data-low"), c.interval[0]); eq(`persistence ${key} high`, await attr(sel, "data-high"), c.interval[1]);
    }
    eq("verdict", await attr("[data-verdict]", "data-verdict"), summary.persistence.verdict);
    // Caveats (in the DOM while collapsed): the foul example, the shift, additivity and joins by season.
    eq("foul example avg_pts", await attr("[data-example='foul']"), summary.seasons[scene.season].avg_points);
    for (const [s, blk] of Object.entries(summary.seasons)) {
      const shift = await grab(`[data-table="sq-shift"] tbody tr[data-row="${s}"]`, "td[data-column]");
      eq(`shift ${s} avg`, shift[0]?.cells.avg.value ?? null, blk.avg_points); eq(`shift ${s}`, shift[0]?.cells.shift.value ?? null, blk.expected_shift);
      eq(`shift ${s} shots`, shift[0]?.cells.shots.value ?? null, blk.shots); eq(`shift ${s} games`, shift[0]?.cells.games.value ?? null, blk.games);
      const add = (await grab(`[data-table="sq-additivity"] tbody tr[data-row="${s}"]`, "td[data-column]"))[0]?.cells ?? {};
      eq(`additivity ${s} gap`, add.gap?.value ?? null, blk.coefficient_additivity_residual.offense);
      eq(`additivity ${s} r2`, add.r2?.value ?? null, blk.second_stage.offense.r2);
      eq(`additivity ${s} players`, add.players?.value ?? null, blk.second_stage.offense.players);
      for (const t of TARGETS) eq(`width ${s} ${t}`, add[`w-${t}`]?.value ?? null, blk.median_interval_width.offense[t]);
      const d = summary.data[s], joins = (await grab(`[data-table="sq-joins"] tbody tr[data-row="${s}"]`, "td[data-column]"))[0]?.cells ?? {};
      eq(`joins ${s}`, joins.joined?.value ?? null, d.r05_shots.joined); eq(`joins ${s} rate`, joins.rate?.value ?? null, d.r05_shots.join_rate);
      eq(`joins ${s} ft`, joins.ft?.value ?? null, d.free_throws.joined); eq(`joins ${s} no attempt`, joins.noattempt?.value ?? null, d.possessions.counted_possessions_without_attempt);
    }
  }

  if (scene.tab === "shot-making") {
    const b = await api(`/api/shot-quality/players?season=${scene.season}&sort=shot_making&minFga=300${scene.team ? `&team=${scene.team}` : ""}`);
    await page.waitForSelector(".sq-players tbody tr[data-row]", { timeout: 60000 });
    if (scene.team) await pickTeam();
    const rows = await grab(".sq-players tbody tr[data-row]", "td[data-column]");
    eq("board order", JSON.stringify(rows.map(r => r.key)), JSON.stringify(b.rows.map(r => r.player_id)));
    const byKey = Object.fromEntries(rows.map(r => [r.key, r.cells]));
    for (const r of b.rows) {
      const c = byKey[r.player_id] ?? {};
      for (const f of ["fga", "fg_pct", "three_share", "pps", "xpps"]) eq(`${r.player_id} ${f}`, c[f]?.value ?? null, r[f]);
      eq(`${r.player_id} xpps tone`, c.xpps?.tone ?? null, null);
      eq(`${r.player_id} shot_making`, c.shot_making?.value ?? null, r.shot_making);
      eq(`${r.player_id} low`, c.shot_making?.low ?? null, r.interval?.[0] ?? null); eq(`${r.player_id} high`, c.shot_making?.high ?? null, r.interval?.[1] ?? null);
      eq(`${r.player_id} tone`, c.shot_making?.tone ?? null, tone(r.interval?.[0], r.interval?.[1]));
    }
    eq("league term", await attr("[data-league]"), b.league.league_term);
    if (!scene.team) eq("unknown", await attr("[data-league]", "data-unknown"), String(b.unknown.length));
  }

  if (scene.tab === "model") {
    const s = await api("/api/shot-quality");
    await page.waitForSelector("[data-table='gates']", { timeout: 60000 });
    const g = s.test.gates;
    eq("tile brier", await attr("[data-tile='brier'] [data-value]"), g.relative_brier.value);
    eq("tile brier tone", await attr("[data-tile='brier'] [data-tone]", "data-tone"), tone(...g.relative_brier.brier_difference_interval));
    eq("tile ece", await attr("[data-tile='ece'] [data-value]"), g.ece.value);
    eq("tile outcome", await attr("[data-outcome]", "data-outcome"), s.outcome);
    eq("gate brier", await attr("tr[data-gate='relative_brier'] [data-field='value']"), g.relative_brier.value);
    eq("gate brier interval", await attr("tr[data-gate='relative_brier'] [data-column='interval'] [data-value]"), g.relative_brier.brier_difference_interval[0]);
    eq("gate log loss", await attr("tr[data-gate='log_loss'] [data-field='value']"), g.log_loss.difference);
    eq("gate log loss tone", await attr("tr[data-gate='log_loss'] [data-field='value']", "data-tone"), tone(...g.log_loss.interval));
    eq("gate ece", await attr("tr[data-gate='ece'] [data-field='value']"), g.ece.value);
    eq("gate ece tone", await attr("tr[data-gate='ece'] [data-field='value']", "data-tone"), null);
    const metricRows = async (name, rows) => {
      for (const [key, block, model] of rows) {
        const m = block.models[model], d = block.versus_baseline[model];
        const sel = `[data-table="${name}"] tr[data-metrics="${key}"]`;
        for (const f of ["brier", "log_loss", "points_mae", "ece"]) eq(`${key} ${f}`, await attr(`${sel} [data-column="${f}"]`), m[f]);
        if (d) {
          eq(`${key} rel brier`, await attr(`${sel} [data-field="relative_brier"]`), d.relative_brier.value);
          eq(`${key} rel brier tone`, await attr(`${sel} [data-field="relative_brier"]`, "data-tone"), tone(...d.relative_brier.interval));
          eq(`${key} rel log`, await attr(`${sel} [data-field="relative_log_loss"]`), d.relative_log_loss.value);
        }
      }
    };
    const names = ["baseline", "reference", "logistic_spline", "lightgbm_31", "lightgbm_127"];
    await metricRows("test", names.filter(n => s.test.pooled.models[n]).map(n => [`test:${n}`, s.test.pooled, n]));
    await metricRows("selection", names.filter(n => s.selection.metrics.models[n]).map(n => [`selection:${n}`, s.selection.metrics, n]));
    await metricRows("test-seasons", Object.entries(s.test.by_season).flatMap(([season, blk]) => names.filter(n => s.test.pooled.models[n]).map(n => [`test-${season}:${n}`, blk, n])));
    for (const sl of s.test.slices) {
      const sel = `[data-table="slices"] tr[data-slice="${sl.family}:${sl.label}"]`, d = sl.metrics?.versus_baseline[s.selection.chosen]?.relative_brier;
      eq(`slice ${sl.label} shots`, await attr(`${sel} [data-column="shots"]`), sl.attempts);
      eq(`slice ${sl.label} rel`, await attr(`${sel} [data-field="relative_brier"]`), d ? d.value : null);
      if (d) eq(`slice ${sl.label} tone`, await attr(`${sel} [data-field="relative_brier"]`, "data-tone"), tone(...d.interval));
    }
    for (const k of ["shot_making", "pps_minus_league", "xpps"]) {
      eq(`persistence ${k}`, await attr(`[data-table="persistence"] tr[data-persistence="${k}"] [data-column="r"]`), s.players.persistence[k].r);
      eq(`persistence ${k} low`, await attr(`[data-table="persistence"] tr[data-persistence="${k}"] [data-column="interval"]`), s.players.persistence[k].interval[0]);
    }
    const curve = s.test.curves[s.selection.chosen];
    eq("bins", await page.locator("[data-table='curve'] tbody tr[data-bin]").count(), curve.length);
    for (const bin of curve) {
      const sel = `[data-table="curve"] tr[data-bin="${bin.bin}"]`;
      eq(`bin ${bin.bin} count`, await attr(`${sel} [data-column="count"]`), bin.count);
      eq(`bin ${bin.bin} predicted`, await attr(`${sel} [data-column="sp"]`), bin.mean_predicted);
      eq(`bin ${bin.bin} observed`, await attr(`${sel} [data-column="so"]`), bin.observed);
      eq(`bin ${bin.bin} baseline`, await attr(`${sel} [data-column="bp"]`), s.test.curves.baseline[bin.bin - 1].mean_predicted);
    }
    eq("chart points", await page.locator("svg.chart-reliability [data-series]").count(), s.test.curves.baseline.length + curve.length);
    for (const [season, d] of Object.entries(s.data)) {
      const sel = `[data-table="data"] tr[data-season="${season}"]`;
      eq(`data ${season} rows`, await attr(`${sel} [data-column="rows"]`), d.rows); eq(`data ${season} join`, await attr(`${sel} [data-column="join"]`), d.join_rate);
      eq(`data ${season} and-ones`, await attr(`${sel} [data-column="and1"]`), d.and_ones);
    }
    eq("uncalibrated", await attr("[data-uncalibrated]"), s.test.uncalibrated.versus_baseline[s.selection.chosen].relative_brier.value);
  }

  if (scene.tab === "player") {
    const d = await api(`/api/shot-quality/player${scene.id ? `?playerId=${scene.id}` : ""}`);
    await page.waitForSelector("[data-table='history'] tbody tr[data-row]", { timeout: 60000 });
    eq("player", await attr("[data-player]", "data-player"), d.player_id);
    const latest = [...d.seasons].reverse().find(r => r.status === "served") ?? d.seasons.at(-1);
    eq("tile shot_making", await attr("[data-tile='shot_making'] [data-value]"), latest.shot_making);
    eq("tile tone", await attr("[data-tile='shot_making'] [data-field]", "data-tone"), tone(latest.interval?.[0], latest.interval?.[1]));
    for (const f of ["xpps", "pps", "fga"]) eq(`tile ${f}`, await attr(`[data-tile='${f}'] [data-value]`), latest[f]);
    const hist = Object.fromEntries((await grab("[data-table='history'] tbody tr[data-row]", "[data-field]")).map(r => [r.key, r.cells]));
    eq("history seasons", JSON.stringify(Object.keys(hist)), JSON.stringify(d.seasons.map(r => r.season)));
    for (const r of d.seasons) {
      for (const f of ["fga", "fg_pct", "three_share", "pps", "xpps"]) eq(`${r.season} ${f}`, hist[r.season]?.[f]?.value ?? null, r[f]);
      eq(`${r.season} shot_making`, hist[r.season]?.shot_making?.value ?? null, r.shot_making ?? null);
      if (r.shot_making != null) eq(`${r.season} tone`, hist[r.season]?.shot_making?.tone ?? null, tone(r.interval?.[0], r.interval?.[1]));
    }
    await page.waitForSelector("[data-table='splits'] tbody tr[data-row]", { timeout: 60000 });
    const splits = Object.fromEntries((await grab("[data-table='splits'] tbody tr[data-row]", "[data-field]")).map(r => [r.key, r.cells]));
    for (const season of ["2022-23", "2023-24", "2024-25", "2025-26"]) {
      const b = await board(season, "offense"), row = b.rows.find(r => r.player_id === d.player_id);
      for (const t of TARGETS) {
        eq(`split ${season} ${t}`, splits[season]?.[t]?.value ?? null, row ? row.values[t] : null);
        if (row) { eq(`split ${season} ${t} low`, splits[season]?.[t]?.low ?? null, row.intervals[t][0]); eq(`split ${season} ${t} tone`, splits[season]?.[t]?.tone ?? null, tone(...row.intervals[t])); }
      }
      eq(`split ${season} shots`, splits[season]?.shots?.value ?? null, row ? row.shots : null);
    }
  }

  await page.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
  await page.waitForTimeout(1000);
  const page_ = await page.evaluate(w => {
    const broken = [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src);
    const small = w < 600 ? [...document.querySelectorAll("button, select, input, [role='radio'], summary")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40 && !e.closest("[aria-hidden='true']"); }).map(e => `${e.tagName}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40)}:${Math.round(e.getBoundingClientRect().height)}`) : [];
    const col = document.querySelector(".sq-page").getBoundingClientRect();
    // Round 3: the hero icon's glyph centred in its tile, the tile level with the title, and icon + title centred in the column.
    const tile = document.querySelector(".sq-hero .ui-page-header-icon").getBoundingClientRect();
    const glyph = document.querySelector(".sq-hero .ui-page-header-icon svg").getBoundingClientRect();
    const title = document.querySelector(".sq-hero .ui-page-header-title").getBoundingClientRect();
    const mid = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    const icon = { dx: +(mid(glyph).x - mid(tile).x).toFixed(2), dy: +(mid(glyph).y - mid(tile).y).toFixed(2), titleDy: +(mid(title).y - mid(tile).y).toFixed(2),
      groupDx: +(((tile.left + title.right) / 2) - mid(col).x).toFixed(2) };
    return { overflow: document.documentElement.scrollWidth - innerWidth, broken, small, column: Math.round(col.width), left: Math.round(col.left), icon };
  }, width);
  for (const [k, v] of Object.entries(page_.icon)) eq(`hero icon ${k}`, Math.abs(v) <= 1, true);
  report.push({ scene: scene.name, width, compared, mismatches: mismatches.slice(0, 40), mismatchCount: mismatches.length, errors, ...page_ });
  console.log(scene.name, width, compared, "mismatches", mismatches.length, "errors", errors.length, "overflow", page_.overflow, "broken", page_.broken.length, "small", page_.small.length, "col", page_.column, "icon", JSON.stringify(page_.icon));
  if (mismatches.length) console.log(JSON.stringify(mismatches.slice(0, 5)));
  if (shots) {
    const fresh = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
    await fresh.goto(`${WEB}${scene.q ? `?${scene.q}` : ""}`, { waitUntil: "networkidle", timeout: 120000 });
    await fresh.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
    await fresh.waitForTimeout(1000);
    if (scene.team) await fresh.getByRole("button", { name: "Select Team" }).click(), await fresh.waitForTimeout(500);
    await fresh.screenshot({ path: `${shots}/sq-${scene.name}-${width}.png`, fullPage: true });
    await fresh.close();
  }
  await page.close();
}
await browser.close();
const total = report.reduce((a, r) => a + r.compared, 0), bad = report.reduce((a, r) => a + r.mismatchCount, 0);
writeFileSync(out, JSON.stringify({ compared: total, mismatches: bad, scenes: report }, null, 1) + "\n");
console.log("total", total, "mismatches", bad);
