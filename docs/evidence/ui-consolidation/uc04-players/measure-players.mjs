// UC04 batch 3: measure the Players directory, player profile and their drawers' controls,
// before and after the kit migration. Run from dashboard/ against a fixture build:
//   BASE=http://127.0.0.1:3180 OUT=<dir> LABEL=before node ../docs/evidence/ui-consolidation/uc04-players/measure-players.mjs
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
  ["players", "/players"],
  ["players-rules", "/players", async page => { await page.locator(".table-percentile-legend summary").first().click(); }],
  ["players-fixture", "/players?snapshotId=snapshot-browser-fixture"],
  ["player", "/players/23"],
  ["player-back", "/stats", async page => {
    await page.locator(".stats-player-link", { hasText: "Fixture Star" }).first().click();
    await page.waitForURL(url => url.pathname === "/players/23");
    await page.getByRole("button", { name: /Back to table/ }).waitFor();
  }],
  ["player-games", "/players/23", async page => { await page.getByRole("tab", { name: "Game Log" }).click(); }],
  ["player-lineage", "/players/23", async page => {
    await page.getByRole("tab", { name: "Game Log" }).click();
    await page.getByRole("button", { name: "Lineage", exact: true }).first().click();
  }],
  ["player-fixture", "/players/23?date=2023-01-09&snapshotId=snapshot-browser-fixture"],
  ["player-missing", "/players/99999?date=2023-01-09&snapshotId=snapshot-browser-fixture"],
  ["teams", "/teams?season=2025-26&beforeDate=2026-04-13"],
];

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || "/usr/bin/chromium" });
const results = [];
try {
  for (const width of [1440, 390]) {
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
