// FO02 step 1: confirm (or refute) the containing-block hypothesis for header overlays.
// Usage: node scripts/repro_fo02_overlays.cjs [baseUrl] [outFile]
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "../dashboard/node_modules/playwright"));

const base = process.argv[2] || "http://localhost:3100";
const out = process.argv[3] || path.join(__dirname, "../docs/evidence/fo02/repro.json");

function rect(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
}

async function overlayState(page, label) {
  return page.evaluate(({ label }) => {
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
    const header = document.querySelector("header.courtlens-header");
    const hs = header && getComputedStyle(header);
    const scrim = document.querySelector(".ui-command-palette-scrim");
    const palette = document.querySelector(".ui-command-palette");
    const drawerRoot = document.querySelector(".ui-drawer-root");
    const drawerPanel = document.querySelector(".ui-drawer-panel");
    const inHeader = (el) => Boolean(el && header && header.contains(el));
    const full = (b) => Boolean(b && b.x === 0 && b.y === 0 && b.w === innerWidth && b.h === innerHeight);
    return {
      label,
      viewport: { w: innerWidth, h: innerHeight, scrollY: Math.round(scrollY) },
      header: header && { rect: r(header), backdropFilter: hs.backdropFilter, className: header.className },
      scrim: scrim && { rect: r(scrim), coversViewport: full(r(scrim)), insideHeader: inHeader(scrim), maxWidth: getComputedStyle(scrim).maxWidth, position: getComputedStyle(scrim).position },
      palette: palette && { rect: r(palette) },
      drawerRoot: drawerRoot && { rect: r(drawerRoot), insideHeader: inHeader(drawerRoot) },
      drawerPanel: drawerPanel && { rect: r(drawerPanel), fullHeight: r(drawerPanel).h === innerHeight, maxHeight: getComputedStyle(drawerPanel).maxHeight },
    };
  }, { label });
}

(async () => {
  const browser = await chromium.launch();
  const results = { base, measuredAt: new Date().toISOString(), synthetic: null, app: [] };

  // 1. Minimal synthetic reproduction of the CSS mechanism, independent of app code.
  const syn = await browser.newPage({ viewport: { width: 800, height: 600 } });
  await syn.setContent(`<style>body{margin:0;height:3000px} header{position:sticky;top:0;height:56px} header.blur{backdrop-filter:blur(12px)} .fixed{position:fixed;inset:0}</style>
    <header id=h><div class=fixed id=f></div></header>`);
  const plain = await syn.evaluate(() => { const b = document.getElementById("f").getBoundingClientRect(); return { w: b.width, h: b.height }; });
  await syn.evaluate(() => document.getElementById("h").classList.add("blur"));
  const blurred = await syn.evaluate(() => { const b = document.getElementById("f").getBoundingClientRect(); return { w: b.width, h: b.height }; });
  results.synthetic = { viewport: { w: 800, h: 600 }, fixedChildWithoutFilter: plain, fixedChildWithBackdropFilterParent: blurred };
  await syn.close();

  // 2. The real header: each overlay opened on a fresh page, header unscrolled and scrolled.
  const cases = [];
  for (const width of [1440, 1280, 1024, 390]) {
    const height = width === 390 ? 844 : 900;
    for (const scrolled of [false, true]) {
      cases.push({ width, height, scrolled, overlay: "palette" });
      if (width < 1280) cases.push({ width, height, scrolled, overlay: "drawer" });
    }
  }
  for (const c of cases) {
    const page = await browser.newPage({ viewport: { width: c.width, height: c.height } });
    await page.goto(`${base}/teams`, { waitUntil: "networkidle" });
    if (c.scrolled) { await page.evaluate(() => scrollTo(0, 600)); await page.waitForTimeout(500); }
    const tag = `${c.overlay}-${c.width}${c.scrolled ? "-scrolled" : ""}`;
    const chrome = await page.evaluate(() => {
      const vis = (sel) => { const el = document.querySelector(sel); if (!el) return false; const r = el.getBoundingClientRect(); return getComputedStyle(el).display !== "none" && r.width > 0; };
      const pill = document.querySelector(".courtlens-search-pill")?.getBoundingClientRect();
      const nav = document.querySelector(".courtlens-nav")?.getBoundingClientRect();
      const right = document.querySelector(".courtlens-header-right")?.getBoundingClientRect();
      const overlap = (a, b) => Boolean(a && b && a.width && b.width && a.left < b.right && b.left < a.right);
      return { hamburger: vis(".courtlens-mobile-toggle"), searchIcon: vis(".courtlens-mobile-search-btn"), pill: vis(".courtlens-search-pill"),
        nav: vis(".courtlens-nav"), more: vis(".courtlens-more"), pillOverlapsNav: overlap(pill, nav), pillOverlapsRight: overlap(pill, right) };
    });
    // element.click() opens the overlay without Playwright scrolling the trigger into view first
    // (below 600px the header is not sticky, so a normal click would undo the scroll).
    const trigger = c.overlay === "drawer" ? ".courtlens-mobile-toggle" : chrome.pill ? ".courtlens-search-pill" : ".courtlens-mobile-search-btn";
    await page.evaluate((sel) => document.querySelector(sel).click(), trigger);
    await page.waitForTimeout(600);
    const state = await overlayState(page, tag);
    state.chrome = chrome;
    if (c.overlay === "drawer") {
      state.drawerFocus = await page.evaluate(() => Boolean(document.activeElement?.closest(".ui-drawer-panel")));
      // Focus trap: tab many times, focus must stay in the panel.
      for (let i = 0; i < 40; i++) await page.keyboard.press("Tab");
      state.focusTrapped = await page.evaluate(() => Boolean(document.activeElement?.closest(".ui-drawer-panel")));
      // Readability: the panel is the top element at its own centre (no scrim or blur on top).
      state.panelOnTop = await page.evaluate(() => { const p = document.querySelector(".ui-drawer-panel"); const r = p.getBoundingClientRect();
        const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return Boolean(hit && p.contains(hit)); });
    }
    await page.screenshot({ path: path.join(path.dirname(out), `${tag}.png`) });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    state.closedOnEscape = await page.evaluate(() => !document.querySelector(".ui-drawer-panel, .ui-command-palette"));
    results.app.push(state);
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(out, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
