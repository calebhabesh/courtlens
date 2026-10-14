// UC04 batch 2: measure the header and filter bar (ContextBar) controls across pages and widths,
// before and after the kit migration. Run from dashboard/ against a fixture build:
//   BASE=http://127.0.0.1:3180 OUT=<dir> LABEL=before node ../docs/evidence/ui-consolidation/uc04-shell/measure-shell.mjs
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
const { chromium } = createRequire(`${process.cwd()}/`)("playwright");

const BASE = process.env.BASE ?? "http://127.0.0.1:3180";
const OUT = process.env.OUT;
const LABEL = process.env.LABEL ?? "run";
const SCOPE = ".courtlens-header, .ui-filter-bar, .ui-popover-panel, .ui-menu-panel, .ui-date-popover, .ui-drawer-panel, .ui-page-header, [role=menu]";

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

const PAGES = [
  ["stats", "/stats"],
  ["stats-season", "/stats", async page => { await page.getByRole("button", { name: /^Season: / }).first().click(); }, { notPhone: true }],
  ["stats-date", "/stats", async page => { await page.getByRole("button", { name: /^Through date/ }).first().click(); }, { notPhone: true }],
  ["stats-filter-sheet", "/stats", async page => { await page.locator(".filter-bar-toggle-slot > button").click(); }, { phoneOnly: true }],
  ["more-menu", "/stats", click("button", "More options"), { desktopOnly: true }],
  ["nav-drawer", "/stats", click("button", "Toggle navigation drawer"), { notDesktop: true }],
  ["players", "/players"],
  ["player", "/players/23"],
  ["compare", "/compare?playerA=23&playerB=24&releaseId=fixture-release&season=2025-26&beforeDate=2026-04-13"],
  ["teams", "/teams?season=2025-26&beforeDate=2026-04-13"],
  ["team", "/teams/100?season=2025-26&beforeDate=2026-04-13"],
  ["last-games", "/last-games?playerId=23"],
  ["playoffs", "/playoffs?season=2025-26"],
  ["showcase", "/showcase"],
  ["live", "/live"],
  ["trends", "/research/trends?playerId=23"],
  ["rapm", "/research/rapm"],
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || "/usr/bin/chromium" });
const results = [];
try {
  for (const width of [1440, 1024, 390]) {
    const phone = width === 390;
    const context = await browser.newContext({ viewport: { width, height: phone ? 844 : 900 }, colorScheme: "dark", reducedMotion: "reduce", isMobile: phone, hasTouch: phone, deviceScaleFactor: 1 });
    for (const [name, path, act, opts = {}] of PAGES) {
      if ((opts.desktopOnly && width !== 1440) || (opts.notDesktop && width === 1440) || (opts.phoneOnly && !phone) || (opts.notPhone && phone)) continue;
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
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
