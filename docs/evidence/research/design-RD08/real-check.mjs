// Real-data check for RD08 (Draft Classes): every value the page draws against the owner's API through the read-only proxy on 4180
// (readonly-proxy.mjs: GET, plus the Stats query POST), the production build on 3180, at 1440 and 390. 1440 walks all 45 played rookies, all 13 value
// views, every class 1966-2026 and all eight combine measurements; 390 walks a sample. Also the colour rules (green/red only where a
// 95% interval excludes zero and on R09's rookie rule; surplus gold or blue), console errors, overflow, broken images, season-matched
// photos, logos beside codes, phone controls and ButtonLinks under 40 px, and the layout.
// Usage: node real-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/draft";
const [,, out, shots] = process.argv;
const cache = {};
const api = async path => cache[path] ??= await (await fetch(`${API}${path}`)).json();
const catalog = await api("/api/workbench/catalog");
const statsBody = await (await fetch(`${API}/api/workbench/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
  query: { release_id: catalog.release_id, season: "2026-27", phase: "regular_season", before_date: catalog.stats_scopes.find(s => s.season === "2026-27").default_before_date, window: { kind: "season" }, sort: [{ field: "min", direction: "desc" }], page: { limit: 100 } },
  presentation: { draft_year: 2026 } }) })).json();
const statsLines = new Map(statsBody.items.map(i => [i.player_id, i.metrics]));
const summary = await api("/api/draft"), tracker = await api("/api/draft/rookies"), combine = await api("/api/draft/combine");

// The page's formats, written again here so a formatting bug shows up as a mismatch.
const minus = t => /^-0(\.0+)?$/.test(t) ? t.slice(1) : t.replace(/^-/, "−");
const fixed = (v, d = 1) => v == null ? "—" : minus(v.toFixed(d));
const whole = v => v == null ? "—" : minus(Math.round(v).toLocaleString("en-US"));
const pctText = (v, d = 0) => v == null ? "—" : `${(v * 100).toFixed(d)}%`;
const signed = (v, d = 1) => { if (v == null) return "—"; const t = minus(v.toFixed(d)); return Number(v.toFixed(d)) > 0 ? `+${t}` : t; };
const range = (lo, hi, d = 1) => lo == null || hi == null ? "—" : `${minus(lo.toFixed(d))} to ${minus(hi.toFixed(d))}`;
const stat = (s, v) => s === "ts" ? pctText(v, 1) : fixed(v);
const identity = (v, d = 1) => v == null || Number(v.toFixed(d)) === 0 ? null : v > 0 ? "a" : "b";
const season = y => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
const STATS = ["mpg", "pts36", "reb36", "ast36", "stl36", "blk36", "tov36", "ts"];
const rookieTone = (s, c) => {
  if (c.value == null || c.p10 == null || c.p90 == null || c.n < 5 || s === "mpg") return null;
  const high = c.value > c.p90, low = c.value < c.p10;
  return s === "tov36" ? (high ? "bad" : low ? "good" : null) : (high ? "good" : low ? "bad" : null);
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const longDate = iso => { const [y, m, d] = iso.split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const num = v => v === null || v === undefined || v === "" ? null : Number(v);

// One table as { row key: { field: { value, low, high, percentile, text, main, sub, tone, identity, logo } } }, in order.
const readTable = (page, selector) => page.evaluate(sel => [...document.querySelectorAll(`${sel} tbody tr`)].map(tr => ({
  key: tr.dataset.row, data: { ...tr.dataset }, name: tr.querySelector(".player-cell-name")?.textContent ?? null,
  portrait: tr.querySelector("th img.player-portrait")?.getAttribute("src") ?? null, initials: tr.querySelector("th .player-portrait-fallback") ? true : false,
  cells: Object.fromEntries([...tr.querySelectorAll("td[data-field]")].map(td => { const main = td.querySelector(".rs-grid-value"); return [td.dataset.field, {
    value: td.dataset.value, round: td.dataset.round, low: td.dataset.low, high: td.dataset.high, percentile: td.dataset.percentile, text: td.textContent, main: main?.textContent ?? null,
    sub: td.querySelector(".rs-grid-sub")?.textContent ?? null, label: td.querySelector('[data-field="tag"]')?.textContent ?? null, tone: main?.dataset.tone ?? null, identity: main?.dataset.identity ?? null, logo: !!td.querySelector("img, svg, .team-logo") }]; })),
})), selector);

const report = [];
const browser = await chromium.launch();
for (const width of [1440, 390]) {
  const wide = width > 600, tag = wide ? "1440" : "390";
  const page = await browser.newPage({ viewport: { width, height: wide ? 900 : 844 } });
  const errors = [], mismatches = []; let compared = 0, loads = 0;
  const photos = { portraits: 0, initials: 0, wrongSeason: [] }, missingLogos = [];
  const oldPhotos = [];
  let rookieHeader = null; const headerGapReport = {};
  const eq = (what, got, want) => { compared += 1; if (got !== want) mismatches.push({ what, got, want }); };
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  const open = async (q, ready) => { loads += 1; await page.goto(`${WEB}${q}`, { waitUntil: "domcontentloaded", timeout: 120000 }); await page.waitForSelector(ready, { state: "attached", timeout: 60000 }); };
  const photo = (row, wantSeason, wantTeam, what) => {
    if (row.initials) { photos.initials += 1; return; }
    if (!row.portrait) return;
    photos.portraits += 1;
    const url = new URL(row.portrait);
    if (url.searchParams.get("season") !== wantSeason || (wantTeam && url.searchParams.get("team") !== wantTeam)) photos.wrongSeason.push({ what, src: row.portrait, wantSeason, wantTeam });
  };

  // Stats views: every figure against the Stats query's own value, and the header look.
  const pickText = (round, pick) => round == null ? `#${pick}` : `R${round} #${pick}`;
  const headerGaps = selector => page.evaluate(sel => { const t = document.querySelector(sel), f = t.querySelector(".lookup-input-wrapper").getBoundingClientRect(), h = t.tHead.getBoundingClientRect(); return { above: f.top - h.top, below: h.bottom - f.bottom, width: Math.round(f.width), height: Math.round(f.height) }; }, selector);
  const evenGaps = async (what, selector) => { const g = await headerGaps(selector); eq(`${what} search gaps equal`, Math.abs(g.above - g.below) <= 1, true); headerGapReport[what] = g; };
  const checkRookieStats = async view => {
    const rows = await readTable(page, 'table[data-table="rookies"]');
    eq(`stats ${view} rows`, rows.length, tracker.rookies.length);
    const one = v => v === null ? "—" : minus(v.toFixed(1)), int = v => v === null ? "—" : minus(Math.round(v).toLocaleString("en-US")), share = v => v === null ? "—" : `${(v * 100).toFixed(1)}%`;
    const scaled = key => view === "raw" ? key : `${key}_${view}`;
    const columns = [["gp", "gp", int], ["min", "min", int], ["min_per_game", "min_per_game", one], ["ts_pct", "ts_pct", share], ["efg_pct", "efg_pct", share], ["fg2_pct", "fg2_pct", share], ["fg3_pct", "fg3_pct", share], ["ft_pct", "ft_pct", share],
      ...["pts", "reb", "ast", "tov", "fg3a", "fta", "oreb", "dreb", "stl", "blk"].map(k => [k, scaled(k), view === "raw" ? int : one])];
    for (const r of tracker.rookies) {
      const row = rows.find(x => x.key === String(r.pick));
      if (!row) { eq(`stats ${view} ${r.pick} present`, false, true); continue; }
      const line = r.state === "compared" ? statsLines.get(r.player_id) : null;
      if (r.state === "compared") eq(`stats ${view} ${r.pick} line served`, !!line, true);
      for (const [field, metric, text] of columns) {
        const want = line?.[metric] ?? null;
        eq(`stats ${view} ${r.pick} ${field}`, num(row.cells[field].value), want);
        eq(`stats ${view} ${r.pick} ${field} text`, row.cells[field].main ?? row.cells[field].text, text(want));
      }
      for (const [field, want] of [["darko", r.darko?.dpm], ["o_dpm", r.darko?.o_dpm], ["d_dpm", r.darko?.d_dpm], ["rapm", r.rapm?.rapm]]) {
        eq(`stats ${view} ${r.pick} ${field}`, num(row.cells[field].value), want ?? null);
        eq(`stats ${view} ${r.pick} ${field} text`, row.cells[field].text, signed(want));
        if (want != null && Number(want.toFixed(1)) !== 0) eq(`stats ${view} ${r.pick} ${field} sign`, row.cells[field].identity, identity(want));
      }
      photo(row, r.photo_season, r.team, `stats ${view} ${r.pick}`);
      eq(`stats ${view} ${r.pick} pick text`, row.cells.pick.text, pickText(r.round, r.pick));
    }
    const guides = await page.evaluate(() => [...document.querySelectorAll('table[data-table="rookies"] tbody .stats-guide-cell img')].map(i => i.getAttribute("src")));
    for (const src of guides) { photos.portraits += 1; const u = new URL(src, WEB); if (u.searchParams.get("season") !== "2026-27") photos.wrongSeason.push({ what: "guide", src }); }
    eq(`stats ${view} guide cells`, await page.locator('table[data-table="rookies"] tbody tr:first-child .stats-guide-cell').count(), 5);
  };

  const checkRookieTable = async () => {
    const rows = await readTable(page, 'table[data-table="rookies"]');
    eq("rookies rows", rows.length, tracker.rookies.length);
    for (const r of tracker.rookies) {
      const row = rows.find(x => x.data.pick === String(r.pick));
      if (!row) { eq(`rookie ${r.pick} present`, false, true); continue; }
      eq(`rookie ${r.pick} name`, row.name?.includes(r.name) || row.name === r.name, true);
      photo(row, r.photo_season, r.team, `rookie ${r.pick}`);
      eq(`rookie ${r.pick} pool`, num(row.cells.pool.value), r.pool); eq(`rookie ${r.pick} pool text`, row.cells.pool.main, String(r.pool));
      eq(`rookie ${r.pick} darko`, num(row.cells.darko.value), r.darko?.dpm ?? null); eq(`rookie ${r.pick} darko text`, row.cells.darko.text, signed(r.darko?.dpm));
      eq(`rookie ${r.pick} rapm`, num(row.cells.rapm.value), r.rapm?.rapm ?? null); eq(`rookie ${r.pick} rapm text`, row.cells.rapm.text, signed(r.rapm?.rapm));
      if (r.darko?.dpm != null) eq(`rookie ${r.pick} darko sign`, row.cells.darko.identity, identity(r.darko.dpm));
      for (const s of STATS) {
        const c = r.comparison?.stats[s], cell = row.cells[s];
        eq(`rookie ${r.pick} ${s}`, num(cell.value), c?.value ?? null); eq(`rookie ${r.pick} ${s} pct`, num(cell.percentile), c?.percentile ?? null);
        eq(`rookie ${r.pick} ${s} text`, cell.main ?? cell.text, c ? stat(s, c.value) : "—");
        if (c) { eq(`rookie ${r.pick} ${s} sub`, cell.sub, c.value == null ? null : c.percentile == null ? "—" : `p${Math.round(c.percentile)}`); eq(`rookie ${r.pick} ${s} tone`, cell.tone, rookieTone(s, c)); }
      }
      if (r.comparison) eq(`rookie ${r.pick} games`, num(row.cells.games.value), r.comparison.line.games);
    }
  };
  const checkCard = async r => {
    const c = page.locator(`article[data-card="${r.player_id}"]`);
    eq(`card ${r.pick} pick`, num(await c.locator('[data-field="pick"]').getAttribute("data-value")), r.pick); eq(`card ${r.pick} pick text`, await c.locator('[data-field="pick"]').innerText(), pickText(r.round, r.pick));
    eq(`card ${r.pick} games`, num(await c.locator('.dc-card-meta[data-field="games"]').getAttribute("data-value")), r.comparison.line.games);
    eq(`card ${r.pick} darko`, num(await c.locator('[data-field="darko"]').getAttribute("data-value")), r.darko?.dpm ?? null);
    eq(`card ${r.pick} rapm`, num(await c.locator('[data-field="rapm"]').getAttribute("data-value")), r.rapm?.rapm ?? null);
    for (const s of STATS) {
      const st = r.comparison.stats[s], t = c.locator(`.dc-tile[data-stat="${s}"]`);
      eq(`card ${r.pick} ${s}`, await t.locator(".rs-grid-value").innerText(), stat(s, st.value));
      eq(`card ${r.pick} ${s} tone`, await t.locator(".rs-grid-value").getAttribute("data-tone"), rookieTone(s, st));
      eq(`card ${r.pick} ${s} pct`, num(await t.locator(".dc-tile-sub").getAttribute("data-percentile")), st.percentile);
    }
    const detail = await api(`/api/draft/rookies/${r.player_id}`);
    await page.waitForSelector('table[data-table="rookie-comparisons"] tbody tr', { state: "attached", timeout: 30000 }).catch(() => {});
    const past = await readTable(page, 'table[data-table="rookie-comparisons"]');
    const pastYears = past.map(x => num(x.cells.year.value));
    if (wide) { const b = await page.evaluate(() => { const c = document.querySelector(".dc-rookie-card").getBoundingClientRect(), f = document.querySelector(".dc-past-grid .stats-table-frame").getBoundingClientRect(); return Math.abs(c.bottom - f.bottom); }); eq(`past ${r.pick} bottom level with card`, b <= 1, true); }
    eq(`past ${r.pick} newest first`, pastYears.every((y, i) => i === 0 || pastYears[i - 1] >= y), true);
    if (detail.comparisons.length === 0) return;
    eq(`past ${r.pick} rows`, past.length, detail.comparisons.length + 1);
    for (const p of detail.comparisons) {
      const row = past.find(x => x.key === p.player_id);
      if (!row) { eq(`past ${r.pick} ${p.player_id}`, false, true); continue; }
      photo(row, p.photo_season, p.photo_team, `past ${p.player_id}`);
      eq(`past ${p.player_id} games`, num(row.cells.games.value), p.games);
      for (const s of STATS) { eq(`past ${p.player_id} ${s}`, num(row.cells[s].value), p[s]); eq(`past ${p.player_id} ${s} text`, row.cells[s].main ?? row.cells[s].text, stat(s, p[s])); }
    }
  };
  const checkValue = async (span, era, measure) => {
    const rows = span === "rapm" ? summary.value_by_pick.rapm : summary.value_by_pick[span][era][measure];
    const d = span === "rapm" ? 2 : measure === "min" ? 0 : 1;
    const n = v => d === 0 ? whole(v) : fixed(v, d);
    const id = `${span}/${era}/${measure}`;
    const q = new URLSearchParams(); if (span !== "window") q.set("span", span); if (era !== "all") q.set("era", era); if (measure !== "ws") q.set("measure", measure);
    await open(`?${q}`, '[data-chart="value-by-pick"] .slc-dot');
    const dots = await page.evaluate(() => [...document.querySelectorAll('[data-chart="value-by-pick"] .slc-dot')].map(d => ({ s: d.dataset.season, v: d.dataset.value, lo: d.dataset.low, hi: d.dataset.high })));
    eq(`${id} dots`, dots.length, rows.filter(r => r.mean != null).length);
    for (const dot of dots) { const r = rows[Number(dot.s) - 1]; eq(`${id} dot ${dot.s}`, num(dot.v), r.mean); eq(`${id} dot ${dot.s} lo`, num(dot.lo), r.lo); eq(`${id} dot ${dot.s} hi`, num(dot.hi), r.hi); }
    const table = await readTable(page, 'table[data-table="value-by-pick"]');
    eq(`${id} rows`, table.length, rows.length);
    for (const r of rows) {
      const row = table.find(x => x.key === String(r.slot)); if (!row) { eq(`${id} ${r.slot}`, false, true); continue; }
      eq(`${id} ${r.slot} n`, num(row.cells.n.value), r.n); eq(`${id} ${r.slot} mean`, num(row.cells.mean.value), r.mean);
      eq(`${id} ${r.slot} lo`, num(row.cells.mean.low), r.lo); eq(`${id} ${r.slot} hi`, num(row.cells.mean.high), r.hi);
      eq(`${id} ${r.slot} text`, row.cells.mean.main, n(r.mean)); eq(`${id} ${r.slot} interval`, row.cells.mean.sub, d === 0 ? `${whole(r.lo)} to ${whole(r.hi)}` : range(r.lo, r.hi, d));
      eq(`${id} ${r.slot} median`, num(row.cells.median.value), r.median);
      if (span !== "rapm") { eq(`${id} ${r.slot} p90`, num(row.cells.p90.value), r.p90); eq(`${id} ${r.slot} played`, num(row.cells.played.value), r.played_share); eq(`${id} ${r.slot} played text`, row.cells.played.main, pctText(r.played_share)); }
      if (span === "career") eq(`${id} ${r.slot} active`, num(row.cells.active.value), r.active ?? 0);
      if (span === "rapm") eq(`${id} ${r.slot} no rapm`, num(row.cells.no_rapm.value), r.no_rapm ?? 0);
    }
    if (span !== "rapm") {
      const bands = summary.bands.filter(b => b.era === era && b.measure === measure), drawn = await readTable(page, 'table[data-table="bands"]');
      const bd = measure === "min" ? 0 : 1;
      eq(`${id} bands`, drawn.length, bands.length);
      for (const b of bands) {
        const row = drawn.find(x => x.key === b.band); if (!row) { eq(`${id} ${b.band}`, false, true); continue; }
        eq(`${id} ${b.band} a`, num(row.cells.mean_a.value), b.mean_a); eq(`${id} ${b.band} b`, num(row.cells.mean_b.value), b.mean_b);
        eq(`${id} ${b.band} diff`, num(row.cells.diff.value), b.diff); eq(`${id} ${b.band} lo`, num(row.cells.diff.low), b.lo); eq(`${id} ${b.band} hi`, num(row.cells.diff.high), b.hi);
        eq(`${id} ${b.band} text`, row.cells.diff.main, signed(b.diff, bd)); eq(`${id} ${b.band} tone`, row.cells.diff.tone, b.lo > 0 ? "good" : b.hi < 0 ? "bad" : null);
        if (row.cells.verdict) eq(`${id} ${b.band} verdict`, row.cells.verdict.value, b.verdict);
        else eq(`${id} ${b.band} shared verdict`, await page.locator('[data-field="band-verdict"]').getAttribute("data-value"), b.verdict);
      }
    }
  };
  const checkClass = async (year, order) => {
    const data = await api(`/api/draft/classes/${year}`);
    const q = new URLSearchParams(); q.set("year", String(year)); if (order !== "draft") q.set("order", order);
    await open(`?${q}&picks=all`, `table[aria-label="${year} draft class"] tbody tr`);
    const complete = data.status === "complete", effective = complete ? order : "draft";
    const key = effective === "career" ? "redraft_career" : "redraft_window";
    const want = effective === "draft" ? [...data.rows].sort((a, b) => a.pick - b.pick) : [...data.rows].sort((a, b) => (a[key] ?? 1e9) - (b[key] ?? 1e9));
    if ([1966, 1972, 1984, 1996].includes(year) && order === "draft") {
      // Load every photo in this class, so a photo that fails has fallen back to initials before counting.
      await page.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
      await page.waitForTimeout(400);
      const seen = await readTable(page, `table[aria-label="${year} draft class"]`);
      const played = new Set(data.rows.filter(r => r.played).map(r => String(r.pick)));
      oldPhotos.push({ year, played: played.size, playedWithPhoto: seen.filter(r => played.has(r.key) && !r.initials).length, neverPlayedWithPhoto: seen.filter(r => !played.has(r.key) && !r.initials).length, noId: data.rows.filter(r => !r.player_id).length });
    }
    const rows = await readTable(page, `table[aria-label="${year} draft class"]`);
    const id = `class ${year}/${effective}`;
    eq(`${id} rows`, rows.length, want.length);
    eq(`${id} order`, rows.map(r => r.key).join(), want.map(r => String(r.pick)).join());
    eq(`${id} picks`, num(await page.locator('#classes [data-field="picks"]').getAttribute("data-value")), data.picks);
    eq(`${id} played`, num(await page.locator('#classes [data-field="played"]').getAttribute("data-value")), data.played);
    const steals = new Set(data.steals), misses = new Set(data.misses), hasRapm = year >= 2014 && year <= 2022;
    for (const r of want) {
      const row = rows.find(x => x.key === String(r.pick)); if (!row) { eq(`${id} ${r.pick}`, false, true); continue; }
      const c = row.cells, p = `${id} #${r.pick}`;
      eq(`${p} name`, row.name, r.name);
      photo(row, r.photo_season, r.photo_team, p);
      eq(`${p} round`, num(c.pick.round), r.round); eq(`${p} pick text`, c.pick.text, r.round == null ? `#${r.pick}` : `R${r.round} #${r.pick}`); eq(`${p} team`, c.team.value, r.team ?? "");
      if (r.team && !c.team.logo) missingLogos.push(`${year} ${r.team}`);
      eq(`${p} from`, c.organization.value, r.organization ?? "");
      if (complete) eq(`${p} tag`, c.label.label, steals.has(r.pick) ? "Steal" : misses.has(r.pick) ? "Miss" : null); eq(`${p} tag not in from`, c.organization.label, null);
      eq(`${p} ws`, num(c.window_ws.value), (complete ? r.window_ws : r.career_ws) ?? null); eq(`${p} ws text`, c.window_ws.main ?? c.window_ws.text, fixed(complete ? r.window_ws : r.career_ws));
      eq(`${p} min`, num(c.window_min.value), (complete ? r.window_min : r.career_min) ?? null); eq(`${p} min text`, c.window_min.main ?? c.window_min.text, whole(complete ? r.window_min : r.career_min));
      if (complete) {
        eq(`${p} career`, num(c.career_ws.value), r.career_ws); eq(`${p} expected`, num(c.expected.value), r.expected_window_ws);
        eq(`${p} surplus`, num(c.surplus.value), r.surplus_window_ws); eq(`${p} surplus text`, c.surplus.main ?? c.surplus.text, signed(r.surplus_window_ws));
        eq(`${p} surplus sign`, c.surplus.identity, identity(r.surplus_window_ws)); eq(`${p} surplus no green/red`, c.surplus.tone, null);
        if (effective === "draft") eq(`${p} redraft`, num(c.redraft.value), r.redraft_window); else eq(`${p} rank`, num(c.rank.value), r[key]);
      } else eq(`${p} no expected`, c.expected, undefined);
      if (hasRapm) { eq(`${p} rapm`, num(c.rapm.value), r.window_rapm); eq(`${p} rapm text`, c.rapm.main ?? c.rapm.text, signed(r.window_rapm, 2)); eq(`${p} rapm sign`, c.rapm.identity, identity(r.window_rapm, 2)); }
    }
  };
  const checkLists = async () => {
    for (const [name, list, label] of [["steals", summary.steals, "Steals"], ["misses", summary.misses, "Misses"]]) {
      const rows = await readTable(page, `table[data-table="${name}"]`);
      eq(`${label} rows`, rows.length, list.length);
      for (const r of list) {
        const key = `${r.year}-${r.pick}`, row = rows.find(x => x.key === key); if (!row) { eq(`${name} ${key}`, false, true); continue; }
        eq(`${name} ${key} name`, row.name, r.name); photo(row, r.photo_season, r.photo_team, `${name} ${key}`);
        eq(`${name} ${key} pick`, num(row.cells.pick.value), r.pick); eq(`${name} ${key} pick text`, row.cells.pick.text, r.round == null ? `#${r.pick}` : `R${r.round} #${r.pick}`); eq(`${name} ${key} ws`, num(row.cells.window_ws.value), r.window_ws); eq(`${name} ${key} expected`, num(row.cells.expected.value), r.expected_window_ws);
        eq(`${name} ${key} surplus`, num(row.cells.surplus.value), r.surplus_window_ws); eq(`${name} ${key} text`, row.cells.surplus.main, signed(r.surplus_window_ws));
        eq(`${name} ${key} sign`, row.cells.surplus.identity, identity(r.surplus_window_ws)); eq(`${name} ${key} no green/red`, row.cells.surplus.tone, null);
      }
      for (const r of list.slice(0, 3)) {
        const c = page.locator(`article[data-card="${r.year}-${r.pick}"]`);
        for (const [f, v] of [["pick", r.pick], ["window_ws", r.window_ws], ["expected", r.expected_window_ws], ["surplus", r.surplus_window_ws]]) eq(`${name} card ${r.year}-${r.pick} ${f}`, num(await c.locator(`[data-field="${f}"]`).getAttribute("data-value")), v);
      }
    }
    const corr = await readTable(page, 'table[data-table="combine-correlations"]');
    for (const m of [...new Set(summary.combine.correlations.map(c => c.measure))]) {
      const row = corr.find(x => x.key === m), ws = summary.combine.correlations.find(c => c.measure === m && c.outcome === "window_ws"), mins = summary.combine.correlations.find(c => c.measure === m && c.outcome === "window_min");
      if (!row) { eq(`corr ${m}`, false, true); continue; }
      eq(`corr ${m} n`, num(row.cells.n.value), ws.n); eq(`corr ${m} r`, num(row.cells.r_ws.value), ws.r); eq(`corr ${m} lo`, num(row.cells.r_ws.low), ws.lo); eq(`corr ${m} hi`, num(row.cells.r_ws.high), ws.hi);
      eq(`corr ${m} text`, row.cells.r_ws.main, signed(ws.r, 2)); eq(`corr ${m} sub`, row.cells.r_ws.sub, range(ws.lo, ws.hi, 2)); eq(`corr ${m} tone`, row.cells.r_ws.tone, null);
      eq(`corr ${m} rmin`, num(row.cells.r_min.value), mins.r); eq(`corr ${m} rmin lo`, num(row.cells.r_min.low), mins.lo); eq(`corr ${m} rmin hi`, num(row.cells.r_min.high), mins.hi);
    }
  };
  const checkScatter = async measure => {
    await open(measure === "wingspan" ? "" : `?combine=${measure}`, `svg[data-chart="combine"][data-measure="${measure}"] circle`);
    const drawn = await page.evaluate(() => [...document.querySelectorAll('svg[data-chart="combine"] circle')].map(c => `${c.dataset.player}|${c.dataset.x}|${c.dataset.value}`).sort());
    const want = combine.rows.filter(r => r[measure] != null && r.window_ws != null).map(r => `${r.player_id}|${r[measure]}|${r.window_ws}`).sort();
    eq(`scatter ${measure} n`, drawn.length, want.length);
    want.forEach((w, i) => eq(`scatter ${measure} ${i}`, drawn[i], w));
    const c = summary.combine.correlations.find(x => x.measure === measure && x.outcome === "window_ws");
    // Round 6: lengths are marked in feet and inches, and each mark sits where its dots are.
    const axis = await page.evaluate(() => ({
      ticks: [...document.querySelectorAll('svg[data-chart="combine"] text[data-tick]')].map(t => ({ inches: Number(t.dataset.tick), x: Number(t.getAttribute("x")), label: t.textContent })),
      dots: [...document.querySelectorAll('svg[data-chart="combine"] circle')].map(c => ({ value: Number(c.dataset.x), x: Number(c.getAttribute("cx")) })),
    }));
    if (["height", "wingspan", "standing_reach"].includes(measure)) {
      for (const t of axis.ticks) eq(`scatter ${measure} mark ${t.inches}`, t.label, `${Math.floor(t.inches / 12)}′${t.inches % 12}″`);
      const [a, z] = [axis.ticks[0], axis.ticks.at(-1)];
      const off = axis.dots.filter(d => Math.abs(a.x + (d.value - a.inches) / (z.inches - a.inches) * (z.x - a.x) - d.x) > 0.01).length;
      eq(`scatter ${measure} dots on the marks`, off, 0);
      eq(`scatter ${measure} labels clear`, axis.ticks.every((t, i) => i === 0 || t.x - axis.ticks[i - 1].x >= 38), true);
    } else eq(`scatter ${measure} no feet marks`, axis.ticks.some(t => t.label.includes("′")), false);
    eq(`scatter ${measure} r`, (await page.locator('[data-field="combine-r"]').innerText()).startsWith(`r ${signed(c.r, 2)} (95% ${range(c.lo, c.hi, 2)})`), true);
  };

  // Default page: every section at once, then layout and page-wide checks.
  const compared_rookies = tracker.rookies.filter(r => r.state === "compared");
  await open("", 'table[data-table="rookies"] tbody tr');
  await page.waitForSelector('svg[data-chart="combine"] circle', { state: "attached", timeout: 60000 });
  await page.waitForSelector('table[aria-label="2022 draft class"] tbody tr', { state: "attached", timeout: 60000 });
  await page.waitForLoadState("networkidle").catch(() => {});
  await checkRookieStats("per_game");
  await evenGaps("rookies per game", 'table[data-table="rookies"]');
  await evenGaps("class table", 'table[aria-label="2022 draft class"]');
  eq("rookie table title", await page.locator("#rookie-stats").innerText(), "2026-27 rookie stats");
  rookieHeader = await page.evaluate(() => { const b = document.querySelector('table[data-table="rookies"] .lookup-input').getBoundingClientRect(), h = document.querySelector('table[data-table="rookies"] thead').getBoundingClientRect(); return { width: Math.round(b.width), height: Math.round(b.height), gapAbove: Math.round(b.top - h.top), groups: [...document.querySelectorAll('table[data-table="rookies"] .stats-group-th')].map(e => e.textContent) }; });
  await checkCard(compared_rookies[0]);
  await checkLists();
  const total = summary.classes.reduce((s, c) => s + c.picks, 0);
  eq("hero", (await page.locator(".rs-intro-tagline").innerText()).trim(), `Games through ${longDate(tracker.comparison_date)} · ${total.toLocaleString("en-US")} picks · classes 1966–2026`);
  eq("h1", await page.locator("h1").innerText(), "Draft Classes");
  const one = summary.value_by_pick.window.all.ws[0], thirty = summary.value_by_pick.window.all.ws[29];
  eq("headline", await page.locator('[data-field="headline"]').innerText(), `Over the first four seasons, the first pick has returned ${fixed(one.mean)} win shares (95% ${range(one.lo, one.hi)}) and the thirtieth ${fixed(thirty.mean)} (${range(thirty.lo, thirty.hi)}), across classes 1966 to 2022.`);
  eq("compared count", num(await page.locator('[data-field="compared"]').getAttribute("data-value")), compared_rookies.length);
  if (shots) {
    await page.screenshot({ path: `${shots}/draft-default-${tag}.png` });
    await page.screenshot({ path: `${shots}/draft-full-${tag}.png`, fullPage: true });
    for (const id of ["value", "ranges", "classes", "steals", "combine", "reading"]) { await page.evaluate(i => document.getElementById(i).scrollIntoView(), id); await page.waitForTimeout(900); await page.screenshot({ path: `${shots}/draft-${id}-${tag}.png` }); }
    await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(600);
  }
  await page.locator("#about summary").click();
  const coverage = await readTable(page, 'table[data-table="coverage"]');
  eq("coverage rows", coverage.length, summary.classes.length);
  for (const c of summary.classes) {
    const row = coverage.find(x => x.key === String(c.year)); if (!row) { eq(`coverage ${c.year}`, false, true); continue; }
    eq(`coverage ${c.year} status`, row.cells.status.value, c.status); eq(`coverage ${c.year} seasons`, num(row.cells.seasons.value), c.seasons_elapsed);
    eq(`coverage ${c.year} picks`, num(row.cells.picks.value), c.picks); eq(`coverage ${c.year} played`, num(row.cells.played.value), c.played); eq(`coverage ${c.year} active`, num(row.cells.active.value), c.active);
  }
  eq("results hash", await page.locator('[data-field="results-sha"]').getAttribute("data-value"), summary.registration.results_sha256);
  eq("registration hash", await page.locator('[data-field="registration-sha"]').getAttribute("data-value"), summary.registration.content_sha256);
  eq("known error", (await page.locator('[data-field="known-error"]').innerText()).includes("1982 pick 78"), true);
  for (const caveat of summary.caveats) eq(`caveat ${caveat.slice(0, 24)}`, await page.locator("#about li", { hasText: caveat }).count() >= 1, true);
  if (shots) { await page.locator("#about").scrollIntoViewIfNeeded(); await page.waitForTimeout(300); await page.screenshot({ path: `${shots}/draft-about-${tag}.png` }); }

  await page.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
  await page.waitForLoadState("networkidle").catch(() => {});
  const layout = await page.evaluate(w => {
    const text = document.body.innerText;
    const visible = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !e.closest("[aria-hidden='true']"); };
    const small = w < 600 ? [...document.querySelectorAll(".dc-page :is(button, select, input, [role='radio'], summary, a[data-kit])")].filter(visible).filter(e => Math.round(e.getBoundingClientRect().height) < 40 && !e.closest("thead button, th button")).map(e => `${e.tagName} ${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40)} ${e.getBoundingClientRect().height}`) : [];
    const icon = document.querySelector(".dc-hero .ui-page-header-icon").getBoundingClientRect(), svg = document.querySelector(".dc-hero .ui-page-header-icon svg").getBoundingClientRect();
    const cards = [...document.querySelectorAll(".dc-card")];
    return {
      overflow: document.documentElement.scrollWidth - innerWidth,
      broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src).slice(0, 20),
      small, column: Math.round(document.querySelector(".dc-page").getBoundingClientRect().width),
      index: Math.round(document.querySelector(".dc-aside")?.getBoundingClientRect().width ?? 0), indexPhone: getComputedStyle(document.querySelector(".dc-index-phone")).display,
      iconCentred: Math.abs((icon.left + icon.width / 2) - (svg.left + svg.width / 2)) <= 1 && Math.abs((icon.top + icon.height / 2) - (svg.top + svg.height / 2)) <= 1,
      cards: cards.length, watermarks: cards.reduce((n, c) => n + c.querySelectorAll(":scope > img").length, 0),
      tinted: cards.filter(c => c.getAttribute("style")?.includes("--dc-team")).length,
      edgeRails: cards.filter(c => parseFloat(getComputedStyle(c).borderLeftWidth) > 0).length,
      draftballr: /draftballr/i.test(text), arrows: /[→←↑↓]/.test(text), playerSelects: document.querySelectorAll('select[aria-label*="Rookie"], select[aria-label*="Player"]').length,
      noLogoCodes: [...document.querySelectorAll(".dc-team")].filter(t => !t.querySelector("img, svg, .team-logo")).map(t => t.textContent).slice(0, 20),
    };
  }, width);
  if (wide) {
    await page.evaluate(() => window.scrollTo(0, 3000)); await page.waitForTimeout(400);
    layout.indexPinned = await page.evaluate(() => { const r = document.querySelector(".dc-aside-sticky").getBoundingClientRect(); return r.top >= 0 && r.top < 200; });
    layout.current = await page.evaluate(() => document.querySelector('.dc-index-link[aria-current]')?.textContent ?? null);
  }

  // Walks.
  for (const view of ["per_36", "raw"]) { await open(`?stat=${view}`, 'table[data-table="rookies"] td[data-field="gp"]'); await checkRookieStats(view); }
  await open("?stat=past", 'table[data-table="rookies"] td[data-field="pool"]'); await checkRookieTable(); await evenGaps("rookies past picks", 'table[data-table="rookies"]');
  // Default class view: who played, and every Steal or Miss, in order.
  for (const year of wide ? [1966, 1984, 1986, 2003, 2022] : [1984]) {
    const data = await api(`/api/draft/classes/${year}`);
    await open(`?year=${year}`, `table[aria-label="${year} draft class"] tbody tr`);
    const kept = data.rows.filter(r => r.played || data.misses.includes(r.pick) || data.steals.includes(r.pick));
    const seen = await readTable(page, `table[aria-label="${year} draft class"]`);
    eq(`default ${year} rows`, seen.map(r => r.key).join(), [...kept].sort((a, b) => a.pick - b.pick).map(r => String(r.pick)).join());
    const hidden = data.rows.length - kept.length;
    eq(`default ${year} hidden`, num(await page.locator('#classes [data-field="hidden"]').getAttribute("data-value").catch(() => null)), hidden || null);
    const sub = await page.evaluate(sel => [...document.querySelectorAll(`${sel} tbody tr`)].slice(0, 3).map(t => t.querySelector(".player-cell-teams")?.textContent), `table[aria-label="${year} draft class"]`);
    for (const t of sub) eq(`default ${year} subtitle form`, /^[A-Z]{2,3} · \d{4}-\d{2}$/.test(t ?? "") || t === "Never played in the NBA", true);
  }
  const rookiesToCheck = wide ? compared_rookies.slice(1) : compared_rookies.slice(1, 4);
  for (const r of rookiesToCheck) { await open(`?rookie=${r.player_id}`, `article[data-card="${r.player_id}"]`); await checkCard(r); }
  const SPANS = wide ? [["window", "all", "ws"], ["window", "all", "min"], ["window", "multi_round", "ws"], ["window", "multi_round", "min"], ["window", "two_round", "ws"], ["window", "two_round", "min"],
    ["career", "all", "ws"], ["career", "all", "min"], ["career", "multi_round", "ws"], ["career", "multi_round", "min"], ["career", "two_round", "ws"], ["career", "two_round", "min"], ["rapm", "all", "ws"]]
    : [["window", "all", "ws"], ["career", "two_round", "min"], ["rapm", "all", "ws"]];
  for (const [s, e, m] of SPANS) await checkValue(s, e, m);
  const years = wide ? summary.classes.map(c => c.year) : [1966, 1982, 1984, 2003, 2022, 2024, 2026];
  for (const y of years) await checkClass(y, "draft");
  for (const y of wide ? [1966, 1982, 1984, 2003, 2014, 2022] : [1984]) { await checkClass(y, "redraft"); await checkClass(y, "career"); }
  if (shots) { await open("?year=1984&order=redraft", 'table[aria-label="1984 draft class"] tbody tr'); await page.evaluate(() => document.getElementById("classes").scrollIntoView()); await page.waitForTimeout(900); await page.screenshot({ path: `${shots}/draft-1984-redraft-${tag}.png` }); }
  for (const m of wide ? Object.keys(combine.rows[0]).filter(k => ["height", "wingspan", "wingspan_minus_height", "standing_reach", "weight", "max_vertical", "lane_agility", "sprint"].includes(k)) : ["wingspan", "height", "sprint"]) await checkScatter(m);
  // The old tab links still land on their section.
  for (const [tab, id] of [["value", "value"], ["steals", "steals"]]) {
    await open(`?tab=${tab}`, `section#${id}`); await page.waitForTimeout(3300);
    const top = await page.evaluate(i => document.getElementById(i).getBoundingClientRect().top, id);
    eq(`tab=${tab} lands`, top >= 0 && top < 220, true);
  }

  const result = { width, rookieHeader, headerGapReport, compared, loads, mismatches: mismatches.length, errors: [...new Set(errors)].slice(0, 12), photos: { ...photos, wrongSeason: photos.wrongSeason.slice(0, 12), wrongSeasonCount: photos.wrongSeason.length }, oldPhotos, missingLogos: [...new Set(missingLogos)].slice(0, 40), ...layout, firstMismatches: mismatches.slice(0, 30) };
  report.push(result);
  console.log(JSON.stringify({ ...result, firstMismatches: mismatches.slice(0, 12) }, null, 1));
  await page.close();
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
