import { chromium } from "playwright";
const pages = ["/", "/stats", "/players", "/teams", "/standings", "/wowy", "/stat-line-shift", "/playoffs", "/last-games", "/showcase", "/roster-shapes", "/contracts", "/free-agency", "/compare", "/team-compare", "/methodology", "/players/2544", "/players/1643411", "/teams/1610612747",
  "/similar-players", "/matchups", "/research/win-probability", "/research/projected-impact", "/research/lineup-model", "/research/rapm/six-factor", "/research/backtest", "/research/shot-quality", "/research/zts", "/research/shooting/aftermath", "/research/defensive-matchups", "/research/signal-noise", "/forecasts", "/wingspan", "/draft", "/calculator"];
const browser = await chromium.launch();
const out = {};
for (const path of pages) {
  const context = await browser.newContext();
  // The build's browser API base is localhost:8000 (the owner's pane); send those to this stack.
  await context.route(/^http:\/\/localhost:8000\//, route => route.continue({ url: route.request().url().replace("localhost:8000", "localhost:8180") }));
  const page = await context.newPage();
  const reads = [];
  page.on("response", async r => {
    const u = new URL(r.url());
    if (!u.pathname.startsWith("/api/")) return;
    const h = await r.allHeaders();
    reads.push({ method: r.request().method(), url: u.pathname + u.search, status: r.status(), xcache: h["x-cache"] ?? null, via: u.port === "3180" ? "dashboard-proxy" : "api" });
  });
  await page.goto("http://localhost:3180" + path, { waitUntil: "networkidle", timeout: 90000 });
  await page.waitForTimeout(1500);
  out[path] = reads;
  await context.close();
}
await browser.close();
console.log(JSON.stringify(out, null, 1));
