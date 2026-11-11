// RD17 real-data check: the sandbox build on :3180, its API on :4180 (../design-RD10/readonly-proxy.mjs, GET only → the owner's :8000).
// Expected values come from the owner's API directly (GET :8000) and are formatted here, independently of dashboard/lib/zts-defense.ts
// and dashboard/lib/expected-shot-earlier.ts. Pages: Shot Quality → Model → An earlier attempt; zTS → Defense in four scopes; Shot
// Aftermath standalone; the redirects; the Research menu. At 1440 and 390: every drawn value against the served one, console errors,
// page overflow, our grids scrolling sideways, broken images, team logos, and hashes or project codes in the visible text.
// Usage: node real-check.mjs <report.json> <shots dir>
import { chromium } from "/home/ethioking/dev/courtlens/dashboard/node_modules/playwright/index.mjs";
import { writeFileSync } from "node:fs";

const [,, out, shots] = process.argv;
const API = "http://127.0.0.1:8000/api/workbench";
const APP = "http://127.0.0.1:3180";
const get = async path => (await fetch(API + path)).json();
const MINUS = "−";
const signed1 = v => { const t = Math.abs(v).toFixed(1); return Number(t) === 0 ? t : `${v < 0 ? MINUS : "+"}${t}`; };
const signed2 = v => { const t = Math.abs(v).toFixed(2); return Number(t) === 0 ? t : `${v < 0 ? MINUS : "+"}${t}`; };
const f = (v, d) => v == null ? "—" : v.toFixed(d);
const w = v => v == null ? "—" : Math.round(v).toLocaleString("en-US");
const pc = (v, d = 0) => v == null ? "—" : `${(v * 100).toFixed(d)}%`;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const date = iso => { const [y, m, d] = iso.slice(0, 10).split("-").map(Number); return `${MONTHS[m - 1]} ${d}, ${y}`; };
const smallPct = share => { const p = share * 100; const d = Math.abs(p) >= 1 ? 0 : Math.abs(p) >= 0.1 ? 1 : 2; return `${Number(p.toFixed(d))}%`; };

const report = { checked: 0, mismatches: [], pages: [] };
const check = (where, expected, actual) => { report.checked += 1; if (String(expected) !== String(actual)) report.mismatches.push({ where, expected: String(expected), actual: String(actual) }); };

async function pageFacts(page, ours) {
  return page.evaluate(ours => {
    const text = document.querySelector("main")?.innerText ?? "";
    return {
      height: document.documentElement.scrollHeight,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      broken: [...document.images].filter(i => i.complete && i.naturalWidth === 0).map(i => i.src),
      sideways: [...document.querySelectorAll(ours)].map(g => g.querySelector(".stats-scroll-region")).filter(Boolean).map(r => r.scrollWidth - r.clientWidth).filter(x => x > 1),
      hashes: [...new Set(text.match(/\b[0-9a-f]{16,}\b/g) ?? [])],
      codes: [...new Set(text.match(/\bcourt(?:load|lens)-[\w-]+\b/g) ?? [])],
      routeTabs: document.querySelectorAll("main .ui-route-tabs").length,
    };
  }, ours);
}

const browser = await chromium.launch();
async function open(url, width) {
  const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", e => errors.push(String(e).slice(0, 200)));
  await page.goto(APP + url, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(1500);
  return { page, errors };
}
const attr = (page, sel, name) => page.locator(sel).first().getAttribute(name);
const txt = (page, sel) => page.locator(sel).first().innerText();

// ---- A. Shot Quality → Model → An earlier attempt ----------------------------------------------------------------------------
const experiments = await get("/research/experiments");
const entry = experiments.find(e => e.experiment === "courtload-expected-shot-retrospective-v2");
const runs = await get("/research/runs?limit=100");
const result = await get(`/research/runs/${entry.run_id}`);
const sel = result.evaluation.selection;
const gain = 1 - sel.candidate.brier / sel.baseline.brier;
const gate = Number(/Registered minimum:\s*([\d.]+)%/.exec(result.model_card)[1]) / 100;
for (const width of [1440, 390]) {
  const { page, errors } = await open("/research/shooting", width);
  const where = `sq-model ${width}`;
  check(`${where} url`, "/research/shot-quality?tab=model&earlier=open", new URL(page.url()).pathname + new URL(page.url()).search);
  check(`${where} gain`, gain, Number(await attr(page, "[data-field=earlier-line]", "data-gain")));
  check(`${where} gate`, gate, Number(await attr(page, "[data-field=earlier-line]", "data-gate")));
  check(`${where} passed`, String(result.evaluation.selection_passed), await attr(page, "[data-field=earlier-line]", "data-passed"));
  const line = await txt(page, "[data-field=earlier-line]");
  for (const part of [smallPct(gain), `the ${smallPct(gate)} it needed`, date(result.model_fit_through_date), "never calibrated and never tested"]) check(`${where} line has ${part}`, true, line.includes(part));
  check(`${where} sample`, true, (await txt(page, "[data-field=earlier-sample]")).includes(`${sel.candidate.rows.toLocaleString("en-US")} shots from games through ${date(result.report_through_date)}`));
  for (const key of ["brier", "log_loss", "expected_points_mae", "ece", "rows"]) for (const side of ["baseline", "candidate"]) {
    const v = sel[side][key];
    check(`${where} ${key} ${side}`, key === "rows" ? v.toLocaleString("en-US") : v.toFixed(6), (await page.locator(`tr[data-metric="${key}"] td[data-field="${side}"]`).innerText()).trim());
  }
  const res = await txt(page, "[data-field=earlier-result]");
  check(`${where} result word`, true, res.includes(result.evaluation.selection_passed ? "Passed" : "Failed"));
  check(`${where} result ece`, true, res.includes(`(${sel.candidate.ece.toFixed(4)} against ${sel.baseline.ece.toFixed(4)})`));
  const points = ["baseline", "candidate"].reduce((n, s) => n + sel[s].calibration_bins.filter(b => b.rows > 0 && b.mean_probability != null && b.observed_rate != null).length, 0);
  check(`${where} chart points`, points, await page.locator(".sq-earlier svg.chart-reliability [data-series]").count());
  // RD13: axis text drawn at 12 px (font size × the drawing's scale; the viewBox is 480 wide), in the secondary on-background colour.
  const axis = await page.locator(".sq-earlier svg.chart-reliability text").first().evaluate(t => ({ px: parseFloat(getComputedStyle(t).fontSize) * t.ownerSVGElement.getBoundingClientRect().width / 480, fill: getComputedStyle(t).fill }));
  check(`${where} chart axis about 12px`, true, Math.abs(axis.px - 12) <= 0.75);
  report.axis = { ...(report.axis ?? {}), [width]: axis };
  await page.screenshot({ path: `${shots}/rd17-r1-sq-earlier-top-${width}.png` });
  const facts = await pageFacts(page, ".sq-earlier .rs-grid");
  await page.locator("#model-method summary").first().click();
  await page.waitForTimeout(400);
  const ids = await txt(page, ".sq-earlier-ids");
  for (const v of [entry.experiment, result.run.run_id, entry.protocol_sha256, result.manifest_sha256, result.package_manifest_sha256, result.run.binding_sha256, result.run.dataset_content_sha256]) check(`${where} id ${v.slice(0, 12)}`, true, ids.includes(v));
  const others = runs.filter(r => r.experiment === entry.experiment && r.run_id !== entry.run_id).length;
  check(`${where} other runs`, others, Number(await attr(page, "[data-field=earlier-other-runs]", "data-count")));
  const openFacts = await pageFacts(page, ".sq-earlier .rs-grid");
  await page.locator(".sq-earlier").screenshot({ path: `${shots}/rd17-r1-sq-earlier-section-${width}.png` });
  await page.screenshot({ path: `${shots}/rd17-r1-sq-model-full-${width}.png`, fullPage: true });
  report.pages.push({ page: "shot-quality model, earlier attempt", width, consoleErrors: errors, ...facts, overflowWithCaveatsOpen: openFacts.overflow });
  await page.close();
}

// ---- B. zTS → Defense ---------------------------------------------------------------------------------------------------------
const SCOPES = [
  { season: "2025-26", phase: "regular_season", player: null, name: "2025-26-rs" },
  { season: "2024-25", phase: "playoffs", player: null, name: "2024-25-po" },
  { season: "2025-26", phase: "regular_season", player: "203468", name: "2025-26-rs-traded" },
  { season: "2025-26", phase: "regular_season", player: "1631132", name: "2025-26-rs-thin" },
];
const label = (view, key) => view.league.find(r => r.play_type === key)?.label ?? key ?? "—";
for (const s of SCOPES) {
  const view = await get(`/play-types?side=defensive&season=${s.season}&phase=${s.phase}${s.player ? `&playerId=${s.player}` : ""}`);
  const qualifiedSorted = view.players.filter(p => p.qualified && p.adjusted_per_100 != null).sort((a, b) => a.adjusted_per_100 - b.adjusted_per_100 || a.player_name.localeCompare(b.player_name));
  const expectedOrder = [...view.players].sort((a, b) => (a.qualified === b.qualified ? 0 : a.qualified ? -1 : 1)
    || ((a.adjusted_per_100 == null) - (b.adjusted_per_100 == null)) || ((a.adjusted_per_100 ?? 0) - (b.adjusted_per_100 ?? 0)) || a.player_name.localeCompare(b.player_name)).map(p => p.player_id);
  const total = view.league.reduce((n, r) => n + r.possessions, 0);
  for (const width of [1440, 390]) {
    const params = new URLSearchParams({ tab: "defense" });
    if (s.season !== "2025-26") params.set("dSeason", s.season);
    if (s.phase !== "regular_season") params.set("dPhase", s.phase);
    if (s.player) params.set("dPlayer", s.player);
    const { page, errors } = await open(`/research/zts?${params}`, width);
    const where = `zts-defense ${s.name} ${width}`;
    check(`${where} count`, view.players.length, Number(await attr(page, "[data-field=count]", "data-count")));
    check(`${where} pattern lowest`, qualifiedSorted[0].player_id, await attr(page, "[data-field=pattern]", "data-lowest"));
    check(`${where} pattern highest`, qualifiedSorted.at(-1).player_id, await attr(page, "[data-field=pattern]", "data-highest"));
    const pattern = await txt(page, "[data-field=pattern]");
    for (const part of ["A pattern, not a result", `${qualifiedSorted.length.toLocaleString("en-US")} defenders with ${w(view.qualification.possessions)} or more`,
      `(${signed1(qualifiedSorted[0].adjusted_per_100)} per 100 possessions over ${w(qualifiedSorted[0].possessions)})`, `(${signed1(qualifiedSorted.at(-1).adjusted_per_100)} over ${w(qualifiedSorted.at(-1).possessions)})`]) check(`${where} pattern has ${part}`, true, pattern.includes(part));
    // League bars.
    const bars = await page.locator(".ztd-league .rs-leaders-list > li").evaluateAll(lis => lis.map(li => [li.getAttribute("data-row"), li.getAttribute("data-value"), li.querySelector(".rs-leaders-value")?.textContent, li.querySelector("small")?.textContent]));
    check(`${where} bars`, view.league.length, bars.length);
    view.league.forEach((r, i) => {
      check(`${where} bar ${r.play_type} key`, r.play_type, bars[i]?.[0]);
      check(`${where} bar ${r.play_type} value`, r.points_per_possession, Number(bars[i]?.[1]));
      check(`${where} bar ${r.play_type} text`, r.points_per_possession.toFixed(3), bars[i]?.[2]);
      check(`${where} bar ${r.play_type} detail`, `${w(r.possessions)} possessions · ${pc(r.possessions / total)} of all`, bars[i]?.[3]);
    });
    check(`${where} league ppp`, (view.league.reduce((n, r) => n + r.points, 0) / total).toFixed(3), (await txt(page, "[data-field=league-ppp]")).match(/(\d\.\d{3}) points per possession/)?.[1]);
    // Every defender row, in order, in each column group.
    const order = await page.locator(".ztd-grid tbody tr").evaluateAll(trs => trs.map(tr => tr.getAttribute("data-player")));
    check(`${where} row order`, expectedOrder.join(","), order.join(","));
    const groups = width === 390 ? ["Points allowed", "Volume"] : [null];
    for (const g of groups) {
      if (g) await page.getByRole("radiogroup", { name: "Defender columns" }).getByRole("radio", { name: g }).click();
      await page.waitForTimeout(200);
      const cells = await page.locator(".ztd-grid tbody tr").evaluateAll(trs => trs.map(tr => {
        const o = { id: tr.getAttribute("data-player"), q: tr.getAttribute("data-qualified"), logos: tr.querySelectorAll("[data-field=teams] img").length, teams: tr.querySelector("[data-field=teams]")?.textContent };
        for (const td of tr.querySelectorAll("td[data-field]")) o[td.getAttribute("data-field")] = td.textContent.trim();
        return o;
      }));
      const byId = Object.fromEntries(cells.map(c => [c.id, c]));
      for (const p of view.players) {
        const c = byId[p.player_id]; const k = `${where}${g ? ` ${g}` : ""} ${p.player_id}`;
        if (!c) { check(`${k} row`, "present", "missing"); continue; }
        check(`${k} qualified`, String(p.qualified), c.q);
        check(`${k} logos`, p.team_tricodes.length, c.logos);
        check(`${k} teams`, p.team_tricodes.join(""), c.teams);
        if (!g || g === "Points allowed") {
          check(`${k} adjusted`, p.adjusted_per_100 == null ? "—" : signed1(p.adjusted_per_100), c.adjusted_per_100);
          check(`${k} ppp`, f(p.points_per_possession, 2), c.points_per_possession);
          check(`${k} expected`, f(p.expected_points_per_possession, 2), c.expected_points_per_possession);
        }
        if (!g || g === "Volume") {
          check(`${k} poss`, w(p.possessions), c.possessions);
          check(`${k} games`, w(p.games), c.games);
          check(`${k} top`, label(view, p.top_play_type), c.top);
        }
      }
    }
    // The chosen defender.
    const focus = view.focus;
    check(`${where} focus player`, focus.player_id, await attr(page, "[data-field=defender-card]", "data-player"));
    check(`${where} focus rule shown`, Boolean(view.focus_rule), await page.locator("[data-field=focus-rule]").count() > 0);
    check(`${where} thin note`, !focus.qualified, await page.locator("[data-field=thin]").count() > 0);
    for (const [key, text] of [["possessions", w(focus.possessions)], ["points_per_possession", f(focus.points_per_possession, 2)], ["expected_points_per_possession", f(focus.expected_points_per_possession, 2)], ["adjusted_per_100", focus.adjusted_per_100 == null ? "—" : signed1(focus.adjusted_per_100)]]) {
      check(`${where} tile ${key}`, text, (await page.locator(`[data-player-tiles] [data-field=${key}] .zt-tile-value`).innerText()).trim());
    }
    const tgroups = width === 390 ? ["Points allowed", "Volume"] : [null];
    for (const g of tgroups) {
      if (g) await page.getByRole("radiogroup", { name: "Play-type columns" }).getByRole("radio", { name: g }).click();
      await page.waitForTimeout(200);
      const rows = await page.locator(".ztd-types tbody tr").evaluateAll(trs => trs.map(tr => { const o = { type: tr.getAttribute("data-type") }; for (const td of tr.querySelectorAll("td[data-field]")) o[td.getAttribute("data-field")] = td.textContent.trim(); return o; }));
      check(`${where} types count`, focus.breakdown.length, rows.length);
      focus.breakdown.forEach((b, i) => {
        const r = rows[i] ?? {}; const k = `${where}${g ? ` ${g}` : ""} type ${b.play_type}`;
        check(`${k} key`, b.play_type, r.type);
        if (!g || g === "Points allowed") {
          check(`${k} ppp`, f(b.points_per_possession, 2), r.ppp);
          check(`${k} league`, f(b.league_points_per_possession, 2), r.league);
          check(`${k} diff`, b.points_per_possession == null || b.league_points_per_possession == null ? "—" : signed2(b.points_per_possession - b.league_points_per_possession), r.diff);
        }
        if (!g || g === "Volume") {
          check(`${k} poss`, w(b.possessions), r.poss);
          check(`${k} share`, pc(b.share), r.share);
          check(`${k} fg`, pc(b.fg_pct, 1), r.fg);
        }
      });
    }
    // Back to the first column group for the screenshots.
    if (width === 390) { for (const n of ["Defender columns", "Play-type columns"]) await page.getByRole("radiogroup", { name: n }).getByRole("radio", { name: "Points allowed" }).click(); }
    check(`${where} qualification`, view.qualification.possessions, Number(await attr(page, "[data-field=qualification]", "data-possessions")));
    // No good/bad colour anywhere; the gold identity tone is allowed only on the league LeaderBars (RD12: ranked values with no interval).
    check(`${where} green or red`, 0, await page.locator(".zt-defense [data-tone]").count());
    check(`${where} identity outside the league bars`, 0, await page.locator(".zt-defense [data-identity]:not(.ztd-league [data-identity])").count());
    check(`${where} logos loaded`, 0, await page.locator(".zt-defense img").evaluateAll(imgs => imgs.filter(i => i.complete && i.naturalWidth === 0).length));
    const facts = await pageFacts(page, ".zt-defense .rs-grid");
    report.pages.push({ page: `zts defense ${s.name}`, width, consoleErrors: errors, ...facts });
    await page.screenshot({ path: `${shots}/rd17-r1-zts-defense-${s.name}-top-${width}.png` });
    if (s.player === null && s.season === "2025-26") await page.screenshot({ path: `${shots}/rd17-r1-zts-defense-${s.name}-full-${width}.png`, fullPage: true });
    if (s.player) await page.locator("#defender").screenshot({ path: `${shots}/rd17-r1-zts-defense-${s.name}-card-${width}.png` });
    await page.close();
  }
}

// ---- C. Shot Aftermath standalone, D. redirects, E. menu ---------------------------------------------------------------------
for (const width of [1440, 390]) {
  const { page, errors } = await open("/shot-aftermath", width);
  check(`aftermath ${width} url`, "/research/shooting/aftermath", new URL(page.url()).pathname);
  check(`aftermath ${width} h1`, "What happens after the shot?", (await page.getByRole("heading", { level: 1 }).innerText()).trim());
  check(`aftermath ${width} title`, true, (await page.title()).startsWith("Shot Aftermath"));
  const facts = await pageFacts(page, ".sa-page .rs-grid");
  check(`aftermath ${width} route tabs`, 0, facts.routeTabs);
  report.pages.push({ page: "shot aftermath", width, consoleErrors: errors, ...facts });
  await page.screenshot({ path: `${shots}/rd17-r1-aftermath-top-${width}.png` });
  await page.close();
}
for (const [from, to] of [["/research/shooting/adjusted?season=2024-25", "/research/zts?season=2024-25&tab=defense"], ["/research/adjusted-shooting", "/research/zts?tab=defense"], ["/research/expected-shots", "/research/shot-quality?tab=model&earlier=open"], ["/zts", "/research/zts"], ["/shotquality", "/research/shot-quality"]]) {
  const r = await fetch(APP + from, { redirect: "manual" });
  check(`redirect ${from}`, to, r.headers.get("location")?.replace(/^https?:\/\/[^/]+/, ""));
}
{
  const { page, errors } = await open("/stats", 1440);
  await page.getByRole("button", { name: "Research", exact: true }).click();
  await page.waitForTimeout(500);
  const groups = await page.getByRole("menu").first().evaluate(menu => [...menu.querySelectorAll("[role=menuitem]")].map(a => a.getAttribute("href")));
  const want = ["/research/shot-quality", "/research/zts", "/research/shooting/aftermath", "/research/defensive-matchups"];
  const at = groups.indexOf(want[0]);
  check("menu shooting group", want.join(","), groups.slice(at, at + 4).join(","));
  check("menu no Shooting page", false, groups.includes("/research/shooting"));
  await page.screenshot({ path: `${shots}/rd17-r1-menu-1440.png` });
  report.pages.push({ page: "research menu", width: 1440, consoleErrors: errors });
  await page.close();
}
await browser.close();
writeFileSync(out, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ checked: report.checked, mismatches: report.mismatches.slice(0, 30), mismatchCount: report.mismatches.length,
  pages: report.pages.map(p => ({ page: p.page, width: p.width, errors: p.consoleErrors.length, overflow: p.overflow, caveats: p.overflowWithCaveatsOpen, sideways: p.sideways, broken: p.broken?.length, hashes: p.hashes, codes: p.codes, height: p.height })) }, null, 1));
