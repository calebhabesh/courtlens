// Run from any directory: node verify.cjs http://127.0.0.1:3196
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../../../..");
const { chromium } = require(path.join(root, "dashboard/node_modules/playwright"));
const sharp = require(path.join(root, "dashboard/node_modules/sharp"));
const base = process.argv[2] || "http://127.0.0.1:3196";
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const favicon = read("dashboard/app/icon.svg");
const apple = read("dashboard/app/apple-icon.svg");
const maskable = read("dashboard/public/icons/courtlens-maskable.svg");
const framed = apple.replace('<rect width="32" height="32" fill="#0c0d10" />', '<rect width="32" height="32" rx="7" fill="#0c0d10" />');
const restoreWhite = svg => svg.replace(/\s*<defs>[\s\S]*?<\/defs>/, "").replaceAll("url(#silver)", "#f2f3f5");

(async () => {
  assert.equal(favicon, read("dashboard/public/icon.svg"));
  for (const [source, before] of [[favicon, "favicon-before.svg"], [apple, "apple-before.svg"], [maskable, "maskable-before.svg"]]) {
    assert.equal(restoreWhite(source), fs.readFileSync(path.join(__dirname, before), "utf8"));
  }

  const pngs = [];
  for (const [svg, size, file] of [[apple, 180, "courtlens-apple-180.png"], [framed, 192, "courtlens-192.png"], [framed, 512, "courtlens-512.png"], [maskable, 512, "courtlens-maskable-512.png"]]) {
    const actual = await sharp(path.join(root, "dashboard/public/icons", file)).raw().toBuffer({ resolveWithObject: true });
    const expected = await sharp(Buffer.from(svg)).resize(size, size).raw().toBuffer();
    assert.equal(actual.info.width, size);
    assert.equal(actual.info.height, size);
    assert.deepEqual(actual.data, expected);
    pngs.push({ file, size, matchesSvg: true });
  }

  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || "/usr/bin/chromium" });
  try {
    const page = await browser.newPage({ reducedMotion: "reduce" });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const views = [];
    let mark;
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      const response = await page.goto(`${base}/stats`, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
      await page.evaluate(() => document.fonts.ready);
      const header = page.locator(".courtlens-header");
      await header.screenshot({ path: path.join(__dirname, `header-${width}.png`) });
      await page.screenshot({ path: path.join(__dirname, `stats-${width}.png`) });
      const values = await page.evaluate(() => {
        const header = document.querySelector(".courtlens-header");
        const brand = header.querySelector(".brand");
        const mark = brand.querySelector(".brand-mark-svg svg");
        const gradient = mark.querySelector("linearGradient");
        const bounds = brand.getBoundingClientRect();
        return {
          headerHeight: header.getBoundingClientRect().height,
          brandWidth: bounds.width,
          gap: getComputedStyle(brand).gap,
          noOverflow: document.documentElement.scrollWidth <= innerWidth,
          gradientId: gradient.id,
          stops: [...gradient.querySelectorAll("stop")].map(stop => [stop.getAttribute("offset"), stop.getAttribute("stop-color")]),
          paints: [mark.querySelector("line").getAttribute("stroke"), mark.querySelector('circle[r="1.7"]').getAttribute("fill"), mark.querySelector('circle[r="9.2"]').getAttribute("stroke")],
          svg: mark.outerHTML,
          icon: document.querySelector('link[rel="icon"][href*="v=5"]').getAttribute("href"),
          apple: document.querySelector('link[rel="apple-touch-icon"]').getAttribute("href")
        };
      });
      assert.equal(values.headerHeight, 56);
      assert.equal(values.gap, "4px");
      assert(values.noOverflow);
      assert.equal(values.stops.length, 6);
      assert(values.paints.every(paint => paint === `url(#${values.gradientId})`));
      assert.equal(values.icon, "/icon.svg?v=5");
      assert.equal(values.apple, "/icons/courtlens-apple-180.png?v=5");
      mark = values.svg;
      delete values.svg;
      views.push({ width, ...values });
    }

    await page.getByRole("button", { name: "Toggle navigation drawer" }).click();
    const ids = await page.locator(".brand-mark-svg linearGradient").evaluateAll(gradients => gradients.map(gradient => gradient.id));
    assert(ids.length >= 2);
    assert.equal(new Set(ids).size, ids.length);
    const served = await page.request.get(`${base}/icon.svg?v=5`);
    assert.equal(served.status(), 200);
    assert.equal(await served.text(), favicon);
    const manifestResponse = await page.request.get(`${base}/manifest.webmanifest`);
    const manifest = await manifestResponse.json();
    for (const icon of manifest.icons) {
      assert(icon.src.endsWith("?v=5"));
      const response = await page.request.get(new URL(icon.src, base).href);
      assert.equal(response.status(), 200);
      assert.deepEqual(await response.body(), fs.readFileSync(path.join(root, "dashboard/public", icon.src.split("?")[0])));
    }
    const appleResponse = await page.request.get(`${base}/icons/courtlens-apple-180.png?v=5`);
    assert.deepEqual(await appleResponse.body(), fs.readFileSync(path.join(root, "dashboard/public/icons/courtlens-apple-180.png")));
    assert.deepEqual(errors, []);

    const before = fs.readFileSync(path.join(__dirname, "favicon-before.svg"), "utf8");
    const html = `<html><body style="margin:0;background:#15325a;color:#eef3f8;font:16px sans-serif;padding:24px"><div style="display:flex;align-items:center;gap:12px;font-size:22px;font-weight:600">${mark.replace('width="24" height="24"', 'width="72" height="72"')} CourtLens</div><p>Favicon: white → silver</p>${[16, 32, 64].map(size => `<div style="display:flex;align-items:center;gap:24px;height:88px"><span style="width:48px">${size}px</span>${[before, favicon].map(svg => svg.replace('width="32" height="32"', `width="${size}" height="${size}"`)).join("")}</div>`).join("")}</body></html>`;
    await page.setViewportSize({ width: 460, height: 440 });
    await page.setContent(html);
    await page.screenshot({ path: path.join(__dirname, "silver-preview.png") });
    fs.writeFileSync(path.join(__dirname, "verification.json"), JSON.stringify({ base, measuredAt: new Date().toISOString(), svgGeometryUnchanged: true, faviconCopiesMatch: true, pngs, views, uniqueGradientIds: ids, servedAssetsMatch: true, pageErrors: errors }, null, 2) + "\n");
    console.log("Silver logo, 16/32/64px favicon, PNG parity, served assets and responsive header verified.");
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
