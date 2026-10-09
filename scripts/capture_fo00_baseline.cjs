// FO00 baseline: screenshots every route at 1440x900 and 390x844 and records per-page measurements.
// Usage: node scripts/capture_fo00_baseline.cjs [baseURL] [route,route,...]
//   baseURL defaults to http://localhost:3100. With a route list, only those routes are captured and
//   merged into the existing measurements.json (no discovery, no overlay captures).
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "../dashboard/node_modules/@playwright/test"));

// Use localhost: the API CORS allowlist (COURTLENS_CORS_ORIGINS) does not include 127.0.0.1.
const BASE = process.argv[2] || "http://localhost:3100";
const ONLY = process.argv[3] ? process.argv[3].split(",") : null;
const OUT = path.join(__dirname, "../docs/evidence/fo00/before");
const VIEWPORTS = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

const STATIC_ROUTES = [
  "/stats", "/players", "/teams", "/compare", "/team-compare", "/matchups", "/wowy", "/stat-line-shift",
  "/last-games", "/showcase", "/rankings", "/tierlist", "/roster-shapes", "/contracts", "/free-agency",
  "/live", "/playoffs", "/schedule", "/planner", "/data-status", "/settings", "/methodology", "/learning",
  "/blog", "/patch-notes", "/design", "/calculator", "/wingspan", "/forecasts", "/evaluation",
  "/investigations", "/research/ask", "/research/case-studies", "/research/trends", "/research/distributions",
  "/research/similarity", "/shot-profile-twin", "/research/adjusted-shooting", "/research/expected-shots",
  "/shot-aftermath", "/research/rapm", "/six-factor-rapm", "/research/defensive-matchups", "/research/epv",
  "/research/operation", "/", "/live/2026-04-12",
];
// Used when a dynamic route has no link to discover on its listing page.
const FALLBACK = { "/contracts/[team]": "/contracts/BOS" };
// Dynamic routes: [pattern, page to discover a sample link on, href regex]
const DYNAMIC = [
  ["/players/[id]", "/stats", /^\/players\/\d+/],
  ["/teams/[id]", "/teams", /^\/teams\/\d+/],
  ["/contracts/[team]", "/contracts", /^\/contracts\/[^/?#]+/],
  ["/playoffs/[seriesId]", "/playoffs", /^\/playoffs\/[^/?#]+/],
  ["/live/games/[id]", "/live/2026-04-12", /^\/live\/games\/[^/?#]+/],
  ["/investigations/saved/[id]", "/investigations", /^\/investigations\/saved\/[^/?#]+/],
];

const slug = (route) => (route === "/" ? "root" : route.slice(1).replace(/[/[\]?=&]/g, "_"));

async function measure(page) {
  return page.evaluate(() => {
    const visible = (el) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
    const text = document.body.innerText;
    const count = (re) => (text.match(re) || []).length;
    const h1 = [...document.querySelectorAll("h1")].filter(visible).map((h) => h.innerText.trim());
    const buttons = [...document.querySelectorAll("button, a.button, [role=button]")].filter(visible);
    const loadButtons = buttons.map((b) => b.innerText.trim()).filter((t) => /^Load\b/i.test(t));
    const notices = [...document.querySelectorAll(".notice-box, .notice, [role=alert]")].filter(visible).length;
    const glyphRe = /[→✓✕★☆←◀▶↑↓⚠]|[\u{1F300}-\u{1FAFF}]|⚡/gu;
    const glyphs = {};
    for (const g of text.match(glyphRe) || []) glyphs[g] = (glyphs[g] || 0) + 1;
    return {
      title: document.title,
      h1,
      subtitles: [...document.querySelectorAll(".page-subtitle")].filter(visible).map((p) => p.innerText.trim().slice(0, 160)),
      loadButtons,
      nativeDateInputs: [...document.querySelectorAll("input[type=date]")].filter(visible).length,
      notices,
      dateFormats: {
        iso: count(/\b\d{4}-\d{2}-\d{2}\b/g),
        us_slash: count(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g),
        month_day_year: count(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? \d{1,2}, \d{4}\b/g),
      },
      glyphs,
      uuids: count(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi),
      codeRules: count(/game_date\s*</g),
      strictlyPrior: count(/Strictly prior/gi),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      scrollHeight: document.documentElement.scrollHeight,
    };
  });
}

async function settle(page) {
  await page.waitForLoadState("networkidle", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(800);
}

async function captureRoute(page, route, vpName) {
  const started = Date.now();
  try {
    const resp = await page.goto(BASE + route, { timeout: 60000 });
    await settle(page);
    const file = `${slug(route.split("?")[0])}--${vpName}.png`;
    const entry = { status: resp ? resp.status() : null, final_url: page.url().replace(BASE, ""), screenshot: file, load_ms: Date.now() - started, ...(await measure(page)) };
    await page.screenshot({ path: path.join(OUT, file), fullPage: true });
    return entry;
  } catch (e) {
    return { error: e.message.split("\n")[0] };
  }
}

async function captureOnly(browser, outFile) {
  const results = JSON.parse(fs.readFileSync(outFile, "utf8"));
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    for (const route of ONLY) {
      (results.routes[route] ||= {})[vpName] = await captureRoute(page, route, vpName);
      process.stdout.write(`${vpName} ${route} ${results.routes[route][vpName].status ?? results.routes[route][vpName].error}\n`);
    }
    await context.close();
  }
  await browser.close();
  results.supplemented_at = new Date().toISOString();
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2) + "\n");
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: fs.existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined });
  const outFile = path.join(OUT, "measurements.json");
  if (ONLY) return captureOnly(browser, outFile);
  const results = { captured_at: new Date().toISOString(), base_url: BASE, routes: {}, overlays: {}, dynamic_samples: {} };

  const discover = await browser.newPage({ viewport: VIEWPORTS.desktop });
  const routes = [...STATIC_ROUTES];
  for (const [pattern, from, re] of DYNAMIC) {
    try {
      await discover.goto(BASE + from, { timeout: 60000 });
      await settle(discover);
      const hrefs = await discover.$$eval("a[href]", (as) => as.map((a) => a.getAttribute("href")));
      const href = hrefs.find((h) => h && re.test(h)) || FALLBACK[pattern];
      results.dynamic_samples[pattern] = href || null;
      if (href) routes.push(href);
    } catch (e) {
      results.dynamic_samples[pattern] = `error: ${e.message.split("\n")[0]}`;
    }
  }
  const today = new Date().toISOString().slice(0, 10);
  routes.push(`/live/${today}`);
  results.dynamic_samples["/live/[date]"] = `/live/${today}`;
  await discover.close();

  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    for (const route of routes) {
      const entry = (results.routes[route] ||= {});
      entry[vpName] = await captureRoute(page, route, vpName);
      process.stdout.write(`${vpName} ${route} ${entry[vpName].status ?? entry[vpName].error}\n`);
    }

    // Overlay states on a scrolled page (FO02 bug reproduction inputs).
    try {
      await page.goto(BASE + "/stats", { timeout: 60000 });
      await settle(page);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(500);
      await page.keyboard.press("Control+k");
      await page.waitForTimeout(700);
      await page.screenshot({ path: path.join(OUT, `overlay-search-scrolled--${vpName}.png`) });
      results.overlays[`search-scrolled-${vpName}`] = `overlay-search-scrolled--${vpName}.png`;
      await page.keyboard.press("Escape");
      if (vpName === "phone") {
        await page.getByRole("button", { name: "Toggle navigation drawer" }).click();
        await page.waitForTimeout(700);
        await page.screenshot({ path: path.join(OUT, `overlay-drawer-scrolled--${vpName}.png`) });
        results.overlays[`drawer-scrolled-${vpName}`] = `overlay-drawer-scrolled--${vpName}.png`;
      }
    } catch (e) {
      results.overlays[`error-${vpName}`] = e.message.split("\n")[0];
    }
    await context.close();
  }
  await browser.close();
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2) + "\n");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
