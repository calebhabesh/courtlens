// UC04 batch 4: measure the controls on the catalogued pages (Compare to Calculator), before and
// after the kit migration. Run from dashboard/ against a fixture build:
//   BASE=http://127.0.0.1:3180 OUT=<dir> LABEL=before node ../docs/evidence/ui-consolidation/uc04-pages/measure-pages.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(`${process.cwd()}/`)("playwright");

const BASE = process.env.BASE ?? "http://127.0.0.1:3180";
const OUT = process.env.OUT;
const LABEL = process.env.LABEL ?? "run";
const SCOPE = "main, .ui-drawer-panel, [role=dialog]";

const collect = scope => {
  const out = [];
  const seen = new Set();
  for (const root of document.querySelectorAll(scope)) {
    for (const el of root.querySelectorAll("button, a, select, summary, [role='radiogroup'], .context-season-stepper, .ui-filter-bar-meta")) {
      if (seen.has(el)) continue;
      seen.add(el);
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden") continue;
      const svgs = [...el.querySelectorAll(":scope svg")].slice(0, 3).map(s => {
        const b = s.getBoundingClientRect();
        return { w: +b.width.toFixed(1), l: +(b.left - r.left).toFixed(1), rt: +(r.right - b.right).toFixed(1), color: getComputedStyle(s).color };
      });
      const name = (el.getAttribute("aria-label") || el.innerText || el.value || el.getAttribute("title") || el.getAttribute("class") || "").trim().replace(/\s+/g, " ").slice(0, 48);
      out.push({
        key: `${el.tagName.toLowerCase()}|${el.getAttribute("role") || ""}|${name}`,
        x: +r.left.toFixed(1), y: +(r.top + scrollY).toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
        pad: `${cs.paddingTop} ${cs.paddingRight} ${cs.paddingBottom} ${cs.paddingLeft}`,
        fs: cs.fontSize, fw: cs.fontWeight, radius: cs.borderRadius, gap: cs.columnGap,
        bg: cs.backgroundColor, color: cs.color, border: `${cs.borderTopWidth} ${cs.borderTopColor}`, shadow: cs.boxShadow,
        state: el.getAttribute("aria-pressed") || el.getAttribute("aria-checked") || el.getAttribute("aria-selected") || el.getAttribute("aria-expanded") || "",
        svgs,
        cls: (el.getAttribute("class") || "").slice(0, 120),
      });
    }
  }
  return out;
};

const settle = async page => {
  await page.waitForFunction(() => document.fonts.status === "loaded" && !document.querySelector('body > div[hidden][id^="S:"]'));
  await page.waitForTimeout(400);
};
const click = (role, name) => async page => { await page.getByRole(role, { name, exact: true }).first().click(); };
// A personal workspace with boards and tier lists (the fixture API does not persist them).
const WORKSPACE = { workspace_id: "default", name: "Fixture", version: 1, views: [], favorites: ["23", "24"], compare_tray: [],
  ranking_boards: [
    { id: "guards", title: "Guards", board_type: "overall", notes: null, entries: [{ player_id: "23", player_name: "Fixture Star" }, { player_id: "24", player_name: "Fixture Guard" }] },
    { id: "wings", title: "Wings", board_type: "overall", notes: null, entries: [] }],
  tier_lists: [
    { id: "starters", title: "Starters", tiers: [{ tier_id: "a", label: "First tier", player_ids: ["23"] }, { tier_id: "b", label: "Second tier", player_ids: [] }] },
    { id: "bench", title: "Bench", tiers: [{ tier_id: "c", label: "Only tier", player_ids: [] }] }],
  preferences: { density: "standard", identity_mode: "photos", counting_mode: "per_game", default_view_id: "overview", table_expanded: false, theme: "dark" },
  created_at: "2026-10-05", updated_at: "2026-10-05" };
// Streamed pages can briefly hold a hidden duplicate of their content; act on the visible copy.
const visible = (page, role, name) => page.getByRole(role, { name }).filter({ visible: true }).first();

const S = "releaseId=fixture-release&season=2025-26&beforeDate=2026-04-13";
const PAGES = [
  ["compare", "/compare"],
  ["compare-pair", "/compare?playerA=23&playerB=24&" + S],
  ["compare-fixture", "/compare?snapshotId=snapshot-browser-fixture"],
  ["teams", "/teams?" + S],
  ["team", "/teams/100?" + S],
  ["team-compare", "/team-compare?teamA=100&teamB=200&" + S],
  ["wowy", "/wowy"],
  ["last-games", "/last-games"],
  ["last-games-player", "/last-games?playerId=23"],
  ["live", "/live"],
  ["live-game", "/live/games/123"],
  ["playoffs", "/playoffs?season=2025-26"],
  ["playoff-series", "/playoffs/2024-r1-bos-mia"],
  ["playoff-series-fixture", "/playoffs/fixture-series"],
  ["showcase", "/showcase?playerId=24"],
  ["rankings", "/rankings"],
  ["rankings-new", "/rankings", async page => { await visible(page, "button", "New board").click(); }],
  ["rankings-board", "/rankings", async page => {
    await page.locator("[role=tab], [role=radio]").filter({ hasText: "Guards", visible: true }).first().click();
    await visible(page, "button", /Aggregate boards/).click();
  }, { workspace: true }],
  ["tierlist", "/tierlist"],
  ["tierlist-list", "/tierlist", async page => { await page.locator("[role=tab], [role=radio]").filter({ hasText: "Starters", visible: true }).first().click(); }, { workspace: true }],
  ["roster-shapes", "/roster-shapes?season=2025-26&phase=regular_season&team=fixture"],
  ["roster-shapes-bos", "/roster-shapes/BOS"],
  ["stat-line-shift", "/stat-line-shift?player_id=24&together=23&" + S],
  ["contracts", "/contracts/DEN"],
  ["contracts-books", "/contracts/books"],
  ["matchups", "/matchups"],
  ["similar", "/similar-players?playerId=23"],
  ["shot-profile", "/similar-players/shot-profile?player_id=1"],
  ["aftermath", "/research/shooting/aftermath?player_id=1"],
  ["rapm", "/research/rapm"],
  ["shooting", "/research/shooting"],
  ["wingspan", "/wingspan"],
  ["calculator", "/calculator"],
  ["player-games", "/players/23?tab=games"],
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || "/usr/bin/chromium" });
const results = [];
try {
  for (const width of [1440, 390]) {
    const phone = width === 390;
    const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, colorScheme: "dark", reducedMotion: "reduce", isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
    for (const [name, path, act, opts = {}] of PAGES) {
      if (process.env.STATES && !process.env.STATES.split(",").includes(name)) continue;
      if ((opts.desktopOnly && width !== 1440) || (opts.notDesktop && width === 1440) || (opts.phoneOnly && !phone) || (opts.notPhone && phone)) continue;
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      if (opts.workspace) await page.route("**/api/workspace**", route => route.fulfill({ json: WORKSPACE }));
      try {
        await page.goto(BASE + path, { waitUntil: "networkidle" });
        await settle(page);
        if (act) { await act(page); await page.waitForTimeout(500); }
        const controls = await page.evaluate(collect, SCOPE);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        results.push({ state: name, width, errors, overflow, controls });
        if (OUT) await page.screenshot({ path: `${OUT}/${LABEL}-${name}-${width}.png` });
      } catch (error) {
        results.push({ state: name, width, error: String(error).slice(0, 300) });
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}
if (OUT) writeFileSync(`${OUT}/${LABEL}.json`, JSON.stringify(results, null, 1));
console.log(results.map(r => `${r.state}@${r.width}: ${r.error ?? `${r.controls.length} controls, ${r.errors.length} errors, overflow ${r.overflow}`}`).join("\n"));
