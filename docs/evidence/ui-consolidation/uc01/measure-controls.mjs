// UC01: measure every visible control on the 13 control-padding survey pages.
// Run from dashboard/ with the dev API and dashboard up: OUT=<dir> node ../docs/evidence/ui-consolidation/uc01/measure-controls.mjs
import { createRequire } from "node:module";
const { chromium } = createRequire(`${process.cwd()}/`)("playwright");
import { writeFileSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100";
const PAGES = [
  ["Stats", "/stats"],
  ["Players", "/players"],
  ["Compare", "/compare"],
  ["Teams", "/teams"],
  ["Team Compare", "/team-compare"],
  ["Recent Games", "/last-games"],
  ["Player profile", null],
  ["RAPM", "/research/rapm"],
  ["WOWY", "/wowy"],
  ["Similar Players", "/similar-players"],
  ["Matchups", "/matchups"],
  ["Showcase", "/showcase"],
  ["Data Status", "/data-status"],
];

const collect = () => {
  const sel = "button, a.button, a[class*='button'], a[class*='pill'], a[class*='chip'], select, summary, [role='button'], [role='tab'], [role='radio'], input[type='search'], input[type='text'], input[type='date']";
  const out = [];
  for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    const svgs = [...el.querySelectorAll("svg")].map(s => {
      const b = s.getBoundingClientRect();
      return { w: +b.width.toFixed(2), l: +(b.left - r.left).toFixed(2), rt: +(r.right - b.right).toFixed(2), cls: s.getAttribute("class") || "" };
    });
    // select chevrons live in a sibling span
    if (el.tagName === "SELECT") {
      const s = el.parentElement?.querySelector(".ui-select-chevron svg");
      if (s) { const b = s.getBoundingClientRect(); svgs.push({ w: +b.width.toFixed(2), l: +(b.left - r.left).toFixed(2), rt: +(r.right - b.right).toFixed(2), cls: s.getAttribute("class") || "" }); }
    }
    const inner = el.firstElementChild ? getComputedStyle(el.firstElementChild) : null;
    out.push({
      tag: el.tagName.toLowerCase(),
      role: el.getAttribute("role") || "",
      cls: (el.getAttribute("class") || "").split(/\s+/).filter(Boolean).join(" "),
      parentCls: (el.parentElement?.getAttribute("class") || "").split(/\s+/).slice(0, 3).join(" "),
      text: (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40),
      w: +r.width.toFixed(2), h: +r.height.toFixed(2),
      pl: cs.paddingLeft, pr: cs.paddingRight, pt: cs.paddingTop, pb: cs.paddingBottom,
      fs: cs.fontSize, fw: cs.fontWeight, lh: cs.lineHeight, radius: cs.borderRadius,
      bg: cs.backgroundColor, color: cs.color, border: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
      gap: cs.columnGap, innerGap: inner ? inner.columnGap : "",
      pressed: el.getAttribute("aria-pressed") || el.getAttribute("aria-checked") || el.getAttribute("aria-selected") || el.getAttribute("aria-expanded") || "",
      disabled: el.disabled || el.getAttribute("aria-disabled") === "true",
      svgs,
    });
  }
  return out;
};

async function run(label, contextOpts) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(contextOpts);
  const page = await ctx.newPage();
  const results = [];
  let profile = null;
  for (const [name, path0] of PAGES) {
    let path = path0 ?? profile;
    if (!path) { results.push({ page: name, error: "no profile url" }); continue; }
    try {
      await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 90000 });
      await page.waitForTimeout(1200);
      if (name === "Players") {
        profile = await page.evaluate(() => [...document.querySelectorAll("a[href^='/players/']")].map(a => a.getAttribute("href")).find(h => /^\/players\/[^/?]+/.test(h)) || null);
      }
      const controls = await page.evaluate(collect);
      results.push({ page: name, path, controls });
      await page.screenshot({ path: `${process.env.OUT}/${label}-${name.replace(/\s+/g, "-").toLowerCase()}.png` });
      console.error(label, name, controls.length);
    } catch (e) {
      results.push({ page: name, path, error: String(e).slice(0, 200) });
      console.error(label, name, "ERROR", String(e).slice(0, 120));
    }
  }
  await browser.close();
  return results;
}

const desktop = await run("desktop", { viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const phone = await run("phone", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2, colorScheme: "dark" });
writeFileSync(`${process.env.OUT}/controls.json`, JSON.stringify({ desktop, phone }, null, 1));
