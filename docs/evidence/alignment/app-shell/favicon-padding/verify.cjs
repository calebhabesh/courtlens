const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../../../..");
const { chromium } = require(path.join(root, "dashboard/node_modules/playwright"));
const base = process.argv[2] || "http://127.0.0.1:3100";
const before = fs.readFileSync(path.join(__dirname, "favicon-before.svg"), "utf8");
const after = fs.readFileSync(path.join(root, "dashboard/app/icon.svg"), "utf8");

(async () => {
  assert.equal(after, before.replace("scale(0.9)", "scale(0.82)"));
  assert.equal(after, fs.readFileSync(path.join(root, "dashboard/public/icon.svg"), "utf8"));
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || "/usr/bin/chromium" });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const views = [];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      const response = await page.goto(`${base}/stats`, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
      await page.evaluate(() => document.fonts.ready);
      const view = await page.evaluate(() => ({
        favicon: document.querySelector('link[rel="icon"][href*="v=6"]').getAttribute("href"),
        siteBackground: getComputedStyle(document.documentElement).getPropertyValue("--color-bg").trim(),
        noOverflow: document.documentElement.scrollWidth <= innerWidth
      }));
      assert.equal(view.favicon, "/icon.svg?v=6");
      assert.equal(view.siteBackground, "#15325a");
      assert(view.noOverflow);
      views.push({ width, ...view });
      await page.screenshot({ path: path.join(__dirname, `stats-${width}.png`) });
    }
    const served = await page.request.get(`${base}/icon.svg?v=6`);
    assert.equal(served.status(), 200);
    assert.equal(await served.text(), after);
    assert.deepEqual(errors, []);

    // External images keep each SVG's gradient definition isolated, like browser favicons.
    const dataUrl = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    await page.setViewportSize({ width: 440, height: 380 });
    await page.setContent(`<body style="margin:0;padding:24px;background:#25272b;color:#f2f3f5;font:15px sans-serif"><p style="margin:0 0 12px">Favicon padding: before / after</p>${[16, 32, 64].map(size => `<div style="display:flex;align-items:center;gap:28px;height:88px"><span style="width:48px">${size}px</span><img src="${dataUrl(before)}" width="${size}" height="${size}"><img src="${dataUrl(after)}" width="${size}" height="${size}"></div>`).join("")}</body>`);
    const backgroundPixels = await page.evaluate(async () => {
      await Promise.all([...document.images].map(image => image.decode()));
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 16;
      const context = canvas.getContext("2d");
      return [...document.images].slice(0, 2).map(image => {
        context.clearRect(0, 0, 16, 16);
        context.drawImage(image, 0, 0, 16, 16);
        return [...context.getImageData(8, 15, 1, 1).data];
      });
    });
    assert(backgroundPixels.every(pixel => JSON.stringify(pixel) === "[21,50,90,255]"));
    await page.screenshot({ path: path.join(__dirname, "comparison.png") });
    const lensMargin = scale => ((16.5 + (14 - 9.2 - 1 - 16.5) * scale) - 3) * 16 / 27;
    fs.writeFileSync(path.join(__dirname, "verification.json"), JSON.stringify({
      base, measuredAt: new Date().toISOString(), beforeScale: 0.9, afterScale: 0.82,
      calculatedLensTopLeftMarginAt16px: { before: lensMargin(0.9), after: lensMargin(0.82) },
      onlyScaleChanged: true, faviconCopiesMatch: true, servedAssetMatches: true,
      backgroundPixels, views, pageErrors: errors
    }, null, 2) + "\n");
    console.log("Favicon padding, 16/32/64px previews, site-blue background and served v6 asset verified.");
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
