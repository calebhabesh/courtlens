// FO04 evidence: Player Showcase screens, centering measurements and export checks.
// Usage: node scripts/capture_fo04_evidence.cjs [baseUrl]
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "../dashboard/node_modules/playwright"));

const base = process.argv[2] || "http://localhost:3100";
const outDir = path.join(__dirname, "../docs/evidence/fo04");
fs.mkdirSync(path.join(outDir, "screens"), { recursive: true });

async function measure(page) {
  return page.evaluate(() => {
    const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height, cx: r.left + r.width / 2 }; };
    const main = rect(".ui-board-main"), card = rect(".showcase-card-frame"), playback = rect(".showcase-playback");
    const header = document.querySelector(".ui-page-header-title")?.textContent;
    const tiles = [...document.querySelectorAll(".showcase-card-svg g > text")].map((t) => t.textContent);
    return {
      viewport: innerWidth, header,
      cardOffsetFromMain: main && card ? +(card.cx - main.cx).toFixed(2) : null,
      playbackOffsetFromCard: card && playback ? +(playback.cx - card.cx).toFixed(2) : null,
      cardTop: card ? Math.round(card.top + scrollY) : null,
      cardWidth: card ? Math.round(card.width) : null,
      horizontalScroll: document.documentElement.scrollWidth > innerWidth,
      ranks: tiles.filter((t) => /^\d+(st|nd|rd|th)$/.test(t)),
      percentiles: tiles.filter((t) => / pct$/.test(t)),
      contextLine: [...document.querySelectorAll(".showcase-card-svg text")].map((t) => t.textContent).find((t) => /Through /.test(t)),
      subtitleLines: (() => { const el = document.querySelector(".ui-page-header-subtitle"); if (!el) return 0; const lh = parseFloat(getComputedStyle(el).lineHeight); return Math.round(el.getBoundingClientRect().height / lh); })(),
      actionsOnTitleRow: (() => { const t = document.querySelector(".ui-page-header-title")?.getBoundingClientRect(); const a = document.querySelector(".ui-page-header-actions")?.getBoundingClientRect(); return Boolean(t && a && a.top < t.bottom && a.bottom > t.top); })(),
      headshots: document.querySelectorAll(".showcase-card-svg image, .ui-identity-portrait, .showcase-roster-item .player-portrait, .showcase-roster-item .player-portrait-fallback").length,
      glyphs: (document.body.innerText.match(/[\u2190-\u21FF\u25A0-\u25FF\u2600-\u27BF\u2B00-\u2BFF]/g) || []).length,
      codeRules: /game_date|Strictly prior/.test(document.body.innerText),
      loadButtons: [...document.querySelectorAll("button")].filter((b) => /^Load/i.test(b.textContent.trim())).length,
      controlHeights: [...document.querySelectorAll(".ui-filter-bar button:not(.ui-segmented-item), .ui-filter-bar select, .ui-filter-bar .ui-segmented-control")].filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().height)),
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const results = { base, measuredAt: new Date().toISOString(), views: {}, exports: {} };
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, acceptDownloads: true });
    const page = await context.newPage();
    page.on("pageerror", (error) => console.error("pageerror:", error.message.slice(0, 200)));
    page.on("console", (message) => { if (message.type() === "error") console.error("console:", message.text().slice(0, 200)); });
    await page.goto(`${base}/showcase`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.querySelectorAll(".showcase-card-svg g > rect[rx='12']").length > 0, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    results.views[`overall-${width}`] = await measure(page);
    await page.screenshot({ path: path.join(outDir, "screens", `showcase-${width}.png`), fullPage: width === 390 });
    if (width === 1440) {
      await page.getByRole("radio", { name: "Scoring" }).click();
      await page.waitForTimeout(1500);
      results.views["scoring-1440"] = await measure(page);
      await page.screenshot({ path: path.join(outDir, "screens", "showcase-scoring-1440.png") });
      // ArrowRight outside any control advances the card (inside Focus it moves between options).
      await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
      const before = await page.locator(".showcase-counter").textContent();
      await page.keyboard.press("ArrowRight");
      await page.waitForTimeout(800);
      results.keyboardAdvance = { before, after: await page.locator(".showcase-counter").textContent() };
      results.views["next-1440"] = await measure(page);
      await page.screenshot({ path: path.join(outDir, "screens", "showcase-next-1440.png") });
      // Exports: open the menu, download both formats, inspect the files.
      for (const [label, ext] of [["PNG image", "png"], ["SVG file", "svg"]]) {
        await page.getByRole("button", { name: /Export/ }).click();
        await page.getByRole("menuitem", { name: label }).waitFor();
        const pending = page.waitForEvent("download", { timeout: 20000 });
        await page.getByRole("menuitem", { name: label }).click();
        const download = await pending;
        const file = path.join(outDir, `export-sample.${ext}`);
        await download.saveAs(file);
        const bytes = fs.readFileSync(file);
        const info = { filename: download.suggestedFilename(), bytes: bytes.length };
        if (ext === "svg") {
          const text = bytes.toString("utf8");
          info.hasContextLine = /Through [A-Z][a-z]{2} \d{1,2}, \d{4}/.test(text);
          info.inlinedImages = (text.match(/href="data:/g) || []).length;
          info.externalImages = (text.match(/<image[^>]+href="(?!data:)/g) || []).length;
          info.cssVariables = /var\(--/.test(text);
        } else {
          info.pngSignature = bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
        }
        results.exports[ext] = info;
      }
      // A searched player outside the roster is added and selected via ?playerId=.
      await page.goto(`${base}/showcase?playerId=1628401`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
      results.views["deep-link-1440"] = { ...(await measure(page)), selected: await page.locator(".showcase-roster-item.is-active .showcase-roster-name").textContent().catch(() => null) };
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, "measurements.json"), JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
})();
