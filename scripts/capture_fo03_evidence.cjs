// FO03 evidence: surfaces whose glyph icons became wrapper icons, at 1440 and 390.
// Usage: node scripts/capture_fo03_evidence.cjs [baseUrl]
const path = require("path");
const fs = require("fs");
const { chromium } = require(path.join(__dirname, "../dashboard/node_modules/playwright"));

const base = process.argv[2] || "http://localhost:3100";
const outDir = path.join(__dirname, "../docs/evidence/fo03/screens");
fs.mkdirSync(outDir, { recursive: true });
const before = JSON.parse(fs.readFileSync(path.join(__dirname, "../docs/evidence/fo00/before/measurements.json"), "utf8"));
const find = (prefix) => Object.keys(before.routes).find((route) => route.startsWith(prefix));

const shots = [
  { name: "stats", route: "/stats" },
  { name: "player-profile", route: find("/players/") },
  { name: "team-profile", route: find("/teams/") },
  { name: "playoff-series", route: find("/playoffs/2") },
  { name: "compare", route: "/compare" },
  { name: "last-games", route: "/last-games" },
  { name: "data-status", route: "/data-status" },
  { name: "investigations", route: "/investigations" },
  { name: "rankings", route: "/rankings" },
  // Owner gate 1 also reviews the shared filter bar and the /design primitives.
  { name: "filter-bar-teams", route: "/teams" },
  { name: "design", route: "/design" },
];

(async () => {
  const browser = await chromium.launch();
  const captured = [];
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
    for (const shot of shots) {
      await page.goto(`${base}${shot.route}`, { waitUntil: "networkidle", timeout: 45000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(outDir, `${shot.name}-${width}.png`) });
      captured.push(`${shot.name}-${width}`);
    }
    if (width === 1440) {
      // Stats row detail drawer (favorite/tray actions) and the Manage Views modal.
      await page.goto(`${base}/stats`, { waitUntil: "networkidle" });
      const row = page.locator(".player-cell-name").first();
      if (await row.count()) { await row.click(); await page.waitForTimeout(600); await page.screenshot({ path: path.join(outDir, "stats-detail-1440.png") }); captured.push("stats-detail-1440"); await page.keyboard.press("Escape"); }
      await page.goto(`${base}/stats`, { waitUntil: "networkidle" });
      const manage = page.getByRole("button", { name: /Manage Views/ });
      if (await manage.count()) { await manage.first().click(); await page.waitForTimeout(600); await page.screenshot({ path: path.join(outDir, "manage-views-1440.png") }); captured.push("manage-views-1440"); }
    }
    await page.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(outDir, "captures.json"), JSON.stringify({ base, capturedAt: new Date().toISOString(), captured }, null, 2));
  console.log(captured.length, "captures");
})();
