// Real-data check for RD03 (zTS): every value the page draws against the owner's API through the read-only proxy on
// 4180 (readonly-proxy.mjs, RD01's), the production build on 3180, at 1440 and 390. Also console errors, page
// overflow, broken images (photos forced eager and awaited) and phone controls under 40 px.
// Usage: node real-check.mjs <report.json> [<shots dir>]
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";
const API = "http://127.0.0.1:4180", WEB = "http://localhost:3180/research/zts";
const [,, out, shots] = process.argv;
const api = async path => (await fetch(`${API}${path}`)).json();
const summary = await api("/api/zts");
const boards = {}, teams = {}, moves = {}, players = {};
const board = async s => boards[s] ??= await api(`/api/zts/leaderboard?season=${s}&sort=zts_add&limit=1000`);
const player = async (id, s) => players[`${id}:${s}`] ??= await api(`/api/zts/player?${id ? `playerId=${id}&season=${s}` : ""}`);

const known = v => typeof v === "number" && Number.isFinite(v);
function defaultPair(rows) {
  const pool = rows.filter(r => known(r.difficulty) && (r.minutes ?? 0) >= 1000 && (r.scoring_usage ?? 0) >= 25)
    .sort((a, b) => b.difficulty - a.difficulty || a.player_id.localeCompare(b.player_id));
  return pool.length < 2 ? null : [pool[0], pool.at(-1)];
}
function extremes(rows) {
  const pool = rows.filter(r => (r.minutes ?? 0) >= 1000 && known(r.difficulty)).sort((a, b) => a.difficulty - b.difficulty || a.player_id.localeCompare(b.player_id));
  return { easiest: pool.slice(0, 5), hardest: pool.slice(-5).reverse() };
}
const FAMILIES = { creation: ["isolation", "prballhandler", "offscreen", "handoff"], spacing: ["spotup", "postup"], finishing: ["prrollman", "offrebound", "cut", "misc"], transition: ["transition"] };

const SCENES = [
  { name: "about-latest", q: "", season: "2025-26", tab: "about" },
  { name: "about-2018-19", q: "season=2018-19", season: "2018-19", tab: "about" },
  { name: "top-all", q: "tab=top", tab: "top" },
  // Round 5: each compared side has its own season (side B Russell Westbrook 2016-17; side A the 2025-26 default).
  { name: "compare-cross-season", q: "b=201566&bs=2016-17", tab: "compare", season: "2025-26" },
  { name: "player-default", q: "tab=player", tab: "player" },
  { name: "player-jokic-2018-19", q: "tab=player&player=203999&playerSeason=2018-19", tab: "player", id: "203999", season: "2018-19" },
];
const report = [];
const browser = await chromium.launch();
for (const scene of SCENES) for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
  const errors = [], mismatches = []; let compared = 0;
  const eq = (what, got, want, tol = 0) => { compared += 1; const ok = typeof want === "number" ? got !== null && got !== "" && Math.abs(Number(got) - want) <= tol : got === want; if (!ok) mismatches.push({ what, got, want }); };
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto(`${WEB}${scene.q ? `?${scene.q}` : ""}`, { waitUntil: "networkidle", timeout: 120000 });
  const attr = async (sel, name = "data-value") => page.locator(sel).first().getAttribute(name);
  const rowsOf = async sel => page.locator(sel).evaluateAll(l => l.map(r => r.getAttribute("data-row")));
  const cell = async (rowSel, field) => page.locator(`${rowSel} [data-field="${field}"]`).first().getAttribute("data-value");
  const gridRows = name => `[data-table="${name}"] tbody tr[data-row]`;
  const checkRows = async (name, rows, key, fields) => {
    eq(`${name} order`, JSON.stringify(await rowsOf(gridRows(name))), JSON.stringify(rows.map(key)));
    for (const r of rows) for (const f of fields) {
      const got = await cell(`[data-table="${name}"] tbody tr[data-row="${key(r)}"]`, f);
      if (r[f] === null || r[f] === undefined) eq(`${name} ${key(r)} ${f} unknown`, got, null); else eq(`${name} ${key(r)} ${f}`, got, r[f]);
    }
  };
  if (scene.tab === "about") {
    const s = scene.season, ref = summary.references[s], b = await board(s);
    await page.waitForSelector(`[data-table="zts-board"] tbody tr[data-row]`, { timeout: 60000 });
    for (const t of ref.types) eq(`league ${t.play_type}`, await attr(`.zt-league-row[data-type="${t.play_type}"]`), t.ts);
    eq("league avg", await attr(".zt-league-avg"), ref.ts);
    for (const [k, keys] of Object.entries(FAMILIES)) { const rows = ref.types.filter(t => keys.includes(t.play_type)); const sp = rows.reduce((a, t) => a + t.scoring_possessions, 0); eq(`family ${k}`, await attr(`.zt-family[data-family="${k}"]`), rows.reduce((a, t) => a + t.points, 0) / (2 * sp), 1e-12); }
    // Pair: the rule's two players, their four fields, Expected TS, difficulty and play-type shares.
    const pair = defaultPair(b.rows);
    eq("pair order", JSON.stringify(await rowsOf(".zt-compare-side[data-row]")), JSON.stringify(pair.map(r => r.player_id)));
    for (const r of pair) {
      for (const f of ["scoring_usage", "rts", "difficulty", "zts"]) eq(`compare ${r.player_id} ${f}`, await attr(`.zt-compare-row[data-field="${f}"] [data-row="${r.player_id}"]`), r[f]);
      eq(`expected ${r.player_id}`, await attr(`.zt-expected [data-row="${r.player_id}"] [data-field="expected_ts"]`), r.expected_ts);
      eq(`difficulty ${r.player_id}`, await attr(`.zt-expected [data-row="${r.player_id}"] [data-field="difficulty"]`), r.difficulty);
    }
    for (const [i, r] of pair.entries()) {
      const d = await player(r.player_id, s), series = i === 0 ? "a" : "b";
      for (const t of ref.types) { const pt = d.play_types.find(x => x.play_type === t.play_type); eq(`mix ${r.player_id} ${t.play_type}`, await attr(`.zt-mix-row[data-type="${t.play_type}"] .zt-mix-bar[data-series="${series}"]`), pt ? pt.share : null); }
    }
    // Distribution at 500+ minutes.
    const pool = b.rows.filter(r => (r.minutes ?? 0) >= 500 && known(r.difficulty)).map(r => r.difficulty * 100);
    eq("dist count", await attr(".zt-count[data-count]", "data-count"), String(pool.length));
    eq("hard", await attr("[data-bands] [data-field='hard'] [data-value]"), pool.filter(v => v >= 2).length);
    eq("easy", await attr("[data-bands] [data-field='easy'] [data-value]"), pool.filter(v => v <= -2).length);
    eq("middle", await attr("[data-bands] [data-field='middle'] [data-value]"), pool.filter(v => Math.abs(v) < 1).length);
    eq("mean", await attr("[data-bands] [data-field='mean'] [data-value]"), pool.reduce((a, v) => a + v, 0) / pool.length, 1e-9);
    const sorted = [...pool].sort((a, b2) => a - b2), mid = sorted.length / 2;
    eq("median", await attr(".zt-hist-median"), sorted.length % 2 ? sorted[Math.floor(mid)] : (sorted[mid - 1] + sorted[mid]) / 2, 1e-9);
    for (let from = Math.floor(Math.min(...pool)); from <= Math.floor(Math.max(...pool)); from++) eq(`bin ${from}`, await attr(`.zt-hist-bin[data-bin="${from}"]`, "data-count"), String(pool.filter(v => v >= from && v < from + 1).length));
    const ext = extremes(b.rows), small = page.locator('[data-table="zts-small"]');
    for (const [i, list] of [ext.easiest, ext.hardest].entries()) {
      eq(`extremes ${i} order`, JSON.stringify(await small.nth(i).locator("tbody tr[data-row]").evaluateAll(l => l.map(r => r.getAttribute("data-row")))), JSON.stringify(list.map(r => r.player_id)));
      for (const r of list) for (const f of ["scoring_usage", "rts", "difficulty", "zts"]) eq(`extremes ${r.player_id} ${f}`, await small.nth(i).locator(`tbody tr[data-row="${r.player_id}"] [data-field="${f}"]`).getAttribute("data-value"), r[f]);
    }
    eq("scatter points", await attr(".zt-scatter", "data-points"), String(b.rows.filter(r => known(r.rts) && known(r.difficulty)).length));
    for (const [i, t] of ["tracking", "predictive"].entries()) {
      const m = summary.validation[t].test.pooled.metrics, test = page.locator(".zt-test").nth(i);
      eq(`${t} r rts`, await test.locator(".zt-test-row[data-series='rts'] [data-value]").getAttribute("data-value"), m.r_rts.value);
      eq(`${t} r zts`, await test.locator(".zt-test-row[data-series='zts'] [data-value]").getAttribute("data-value"), m.r_zts.value);
      eq(`${t} delta`, await test.locator(".rs-value").getAttribute("data-value"), m.delta_r.value);
      eq(`${t} tone`, await test.locator(".rs-value").getAttribute("data-tone"), m.delta_r.low > 0 ? "good" : m.delta_r.high < 0 ? "bad" : null);
    }
    // Role moves and team difficulty.
    const mv = moves[s] ??= await api(`/api/zts/role-moves?season=${s}`);
    if (mv.status === "available") {
      eq("moves players", JSON.stringify(await page.locator(".zt-moves [role='radio']").evaluateAll(l => l.map(r => r.textContent.trim()))), JSON.stringify(mv.players.map(p => p.player_name.split(" ").slice(-1)[0])));
      await checkRows("zts-moves", mv.players[0].history, r => r.season, ["scoring_usage", "rts", "difficulty", "zts"]);
    }
    const tb = teams[s] ??= await api(`/api/zts/teams?season=${s}`);
    await checkRows("zts-teams", tb.teams, t => t.team_id, ["difficulty", "synergy_ts"]);
    eq("spread players sd", await attr(".zt-spread [data-series='players'][data-sd]", "data-sd"), tb.spread.players.sd);
    eq("spread teams sd", await attr(".zt-spread [data-series='teams'][data-sd]", "data-sd"), tb.spread.teams.sd);
    await page.getByRole("button", { name: `${tb.teams[0].tricode} player roles` }).click();
    await checkRows("zts-team-players", tb.teams[0].players, p => p.player_id, ["share", "difficulty"]);
    await page.getByRole("button", { name: `${tb.teams[0].tricode} player roles` }).click();
    // Leaderboard: first 50, then all.
    await checkRows("zts-board", b.rows.slice(0, 50), r => r.player_id, ["scoring_usage", "rts", "difficulty", "zts", "zts_add"]);
    eq("board count", await attr(".zt-board .zt-count", "data-count"), String(b.rows.length));
    // Caveats: coverage, the registered test by season and the league totals (in the DOM while collapsed).
    for (const [season, c] of Object.entries(summary.coverage)) eq(`coverage ${season} known`, await attr(`[data-table="zts-coverage"] tr[data-season="${season}"] [data-column="known"]`), c.status.known ?? 0);
    for (const t of ["predictive", "tracking"]) for (const [season, blk] of Object.entries(summary.validation[t].test.by_season)) eq(`test ${t} ${season}`, await attr(`[data-validation="${t}-Test ${season}"] [data-column="delta_r"]`), blk.metrics.delta_r.value);
    for (const t of ref.types) eq(`totals ${t.play_type}`, await attr(`[data-table="zts-league"] tr[data-type="${t.play_type}"] [data-column="ts"]`), t.ts);
    if (shots) { await page.getByRole("button", { name: /Show more/ }).click(); await checkRows("zts-board", b.rows, r => r.player_id, ["zts_add"]); }
  }
  if (scene.tab === "top") {
    const top = await api("/api/zts/leaderboard?season=all&sort=zts_add&limit=200");
    await page.waitForSelector(gridRows("zts-top"), { timeout: 60000 });
    await checkRows("zts-top", top.rows, r => `${r.season}:${r.player_id}`, ["minutes", "scoring_usage", "rts", "difficulty", "zts", "zts_add"]);
    for (const r of top.rows.slice(0, 20)) eq(`top rank ${r.player_id}`, await page.locator(`${gridRows("zts-top")}[data-row="${r.season}:${r.player_id}"] [data-rank]`).getAttribute("data-rank"), String(r.rank));
  }
  if (scene.tab === "compare") {
    const latest = await board("2025-26"), old = await board("2016-17");
    await page.waitForSelector(".zt-compare-side[data-series='b'][data-season='2016-17'][data-row]", { timeout: 60000 });
    const pair = defaultPair(latest.rows), russ = old.rows.find(r => r.player_id === "201566");
    eq("side a", await page.locator(".zt-compare-side[data-series='a']").getAttribute("data-row"), pair[0].player_id);
    eq("side b", await page.locator(".zt-compare-side[data-series='b']").getAttribute("data-row"), russ.player_id);
    for (const [series, r] of [["a", pair[0]], ["b", russ]])
      for (const f of ["scoring_usage", "rts", "difficulty", "zts"]) eq(`compare ${series} ${f}`, await attr(`.zt-compare-row[data-field="${f}"] [data-series="${series}"]`), r[f]);
    for (const r of pair) eq(`worked example ${r.player_id}`, await attr(`.zt-expected [data-row="${r.player_id}"] [data-field="difficulty"]`), r.difficulty);
  }
  if (scene.tab === "player") {
    const d = await player(scene.id ?? null, scene.season ?? "2025-26");
    await page.waitForSelector("[data-player-tiles]", { timeout: 60000 });
    for (const f of ["scoring_usage", "rts", "difficulty", "zts"]) eq(`tile ${f}`, await attr(`[data-player-tiles] [data-field="${f}"] [data-value]`), d[f]);
    eq("expected", await attr(".zt-expected [data-field='expected_ts']"), d.expected_ts);
    eq("league ts", await attr(".zt-expected [data-field='league_ts']"), d.league_ts);
    eq("difficulty", await attr(".zt-expected [data-field='difficulty']"), d.difficulty);
    eq("coverage", await attr("[data-coverage]", "data-coverage"), d.coverage);
    for (const t of summary.references[d.season].types) { const pt = d.play_types.find(x => x.play_type === t.play_type); eq(`mix ${t.play_type}`, await attr(`[data-types] .zt-mix-row[data-type="${t.play_type}"] .zt-mix-bar[data-series="a"]`), pt ? pt.share : null); eq(`mix league ${t.play_type}`, await attr(`[data-types] .zt-mix-row[data-type="${t.play_type}"] .zt-mix-bar[data-series="league"]`), pt ? pt.league_share : null); }
    await checkRows("zts-history", d.history, r => r.season, ["scoring_usage", "rts", "difficulty", "zts"]);
  }
  await page.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
  await page.waitForTimeout(1000);
  const page_ = await page.evaluate(w => {
    const broken = [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.currentSrc || i.src);
    const small = w < 600 ? [...document.querySelectorAll("button, select, input, [role='radio'], summary")].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.height < 40 && !e.closest("[aria-hidden='true']"); }).map(e => `${e.tagName}:${(e.getAttribute("aria-label") || e.textContent || "").trim().slice(0, 40)}:${Math.round(e.getBoundingClientRect().height)}`) : [];
    const col = document.querySelector(".zt-page").getBoundingClientRect();
    return { overflow: document.documentElement.scrollWidth - innerWidth, broken, small, column: Math.round(col.width), left: Math.round(col.left) };
  }, width);
  report.push({ scene: scene.name, width, compared, mismatches, errors, ...page_ });
  console.log(scene.name, width, compared, "mismatches", mismatches.length, "errors", errors.length, "overflow", page_.overflow, "broken", page_.broken.length, "small", page_.small.length, "col", page_.column);
  if (shots) {
    // Evidence shots from a freshly loaded page, so focus or scroll state from the checks doesn't leak in.
    const fresh = await browser.newPage({ viewport: { width, height: width > 600 ? 900 : 844 } });
    await fresh.goto(`${WEB}${scene.q ? `?${scene.q}` : ""}`, { waitUntil: "networkidle", timeout: 120000 });
    await fresh.evaluate(async () => { document.querySelectorAll("img").forEach(i => { i.loading = "eager"; }); await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
    await fresh.waitForTimeout(1000);
    await fresh.screenshot({ path: `${shots}/zts-${scene.name}-${width}.png`, fullPage: true });
    await fresh.close();
  }
  await page.close();
}
await browser.close();
const total = report.reduce((a, r) => a + r.compared, 0), bad = report.reduce((a, r) => a + r.mismatches.length, 0);
writeFileSync(out, JSON.stringify({ compared: total, mismatches: bad, scenes: report }, null, 1) + "\n");
console.log("total", total, "mismatches", bad);
