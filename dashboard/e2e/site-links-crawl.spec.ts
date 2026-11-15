import { expect, test, type Page } from "@playwright/test";

// Site links (docs/site-links-plan.md, SL02): every internal link lands on a real page. Runs against
// the owner's dev stack with real data: SITE_LINKS_REAL=1 PLAYWRIGHT_EXTERNAL_SERVER=1.
test.skip(!process.env.SITE_LINKS_REAL, "Requires the real dev stack on :3100 (SITE_LINKS_REAL=1, PLAYWRIGHT_EXTERNAL_SERVER=1).");
test.describe.configure({ mode: "serial" });

const PER_PATTERN = 5;
const NOT_FOUND = /^(Page|Player|Team) Not Found$/;
// Whole-page failure states: the not-found pages, the player error page, Next's error page.
const ERROR_TEXT = /Application error|Unhandled Runtime Error|Profile unavailable|Team details are unavailable|could not open player/;

/** The route pattern an href belongs to (dynamic segments folded), or null for links the crawl skips. */
export function routePattern(href: string): string | null {
  const url = new URL(href, "http://crawl.local");
  if (url.origin !== "http://crawl.local" || url.pathname.startsWith("/api/") || /\.(png|svg|csv|json|pdf)$/.test(url.pathname)) return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const dynamicChild: Record<string, string> = { players: ":id", teams: ":id", playoffs: ":series", contracts: ":team", "roster-shapes": ":team" };
  if (parts[0] === "live" && parts[1] === "games" && parts[2]) return "/live/games/:id";
  if (parts[0] === "live" && /^\d{4}-\d{2}-\d{2}$/.test(parts[1] ?? "")) return "/live/:date";
  if (parts[0] === "investigations" && parts[1] === "saved" && parts[2]) return "/investigations/saved/:id";
  if (parts.length === 2 && dynamicChild[parts[0]]) return `/${parts[0]}/${dynamicChild[parts[0]]}`;
  return `/${parts.join("/")}`;
}

async function settle(page: Page, path: string) {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.locator("main h1, h1").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => undefined);
  // Live cards and other client tables render after their first read.
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
}

async function hrefs(page: Page): Promise<string[]> {
  return page.locator("a[href]").evaluateAll(anchors => anchors.map(anchor => anchor.getAttribute("href") ?? ""));
}

/** Anchors are never nested (site links rules): an anchor inside an anchor or a button, or a
 * button inside an anchor. Returns a short description of each offender. */
export async function nestedInteractive(page: Page): Promise<string[]> {
  return page.evaluate(() => [...document.querySelectorAll("a a, button a, [role=button] a, a button, summary a")]
    .filter(node => !node.closest("[hidden]"))
    .map(node => `${node.tagName.toLowerCase()}.${(node as HTMLElement).className} in ${node.parentElement?.closest("a, button, [role=button], summary")?.className}`));
}

async function pageProblem(page: Page): Promise<string | null> {
  const nested = await nestedInteractive(page);
  if (nested.length) return `nested interactive: ${nested.slice(0, 3).join("; ")}`;
  const title = (await page.locator("h1").first().textContent({ timeout: 5_000 }).catch(() => ""))?.trim() ?? "";
  if (NOT_FOUND.test(title)) return `not found (${title})`;
  const body = await page.locator("body").innerText().catch(() => "");
  const error = body.match(ERROR_TEXT);
  if (error) return `error state (${error[0]})`;
  if (!title) return "no page title";
  return null;
}

test.describe("links land as specified (SL02)", () => {
  test.setTimeout(180_000);
  // `to`: the path and the parameters that name the shown scope (pages may add their own canonical ones).
  const cases: Array<{ name: string; from: string; to: { path: string; season: string; asked: string | null; phase?: string }; note: RegExp | null }> = [
    { name: "a 2026-27 link for a retired player opens his last season", from: "/players/977?season=2026-27",
      to: { path: "/players/977", season: "2015-16", asked: "2026-27" }, note: /Kobe Bryant has no 2026-27 games; showing the 2015-16 regular season\./ },
    { name: "a playoffs link for playoffs he missed opens that regular season", from: "/players/2544?season=2021-22&phase=playoffs",
      to: { path: "/players/2544", season: "2021-22", asked: "2021-22:playoffs" }, note: /LeBron James has no 2021-22 playoffs games; showing the 2021-22 regular season\./ },
    { name: "a pre-2002-03 New Orleans link opens its first season", from: "/teams/1610612740?season=1999-00",
      to: { path: "/teams/1610612740", season: "2002-03", asked: "1999-00" }, note: /has no 1999-00 games; showing the 2002-03 regular season\./ },
    { name: "a 2005-06 Thunder link opens the Sonics", from: "/teams/1610612760?season=2005-06",
      to: { path: "/teams/1610612760", season: "2005-06", asked: null }, note: null },
    { name: "a folded team's link opens it", from: "/teams/CHS?season=1947-48", to: { path: "/teams/CHS", season: "1947-48", asked: null }, note: null },
    { name: "a folded team's link after it folded opens its last season", from: "/teams/CHS?season=2024-25",
      to: { path: "/teams/CHS", season: "1949-50", asked: "2024-25" }, note: /Chicago Stags has no 2024-25 games; showing the 1949-50 regular season\./ },
  ];
  for (const { name, from, to, note } of cases) {
    test(name, async ({ page }) => {
      await settle(page, from);
      await expect.poll(() => new URL(page.url()).searchParams.get("season"), { timeout: 60_000 }).toBe(to.season);
      const url = new URL(page.url());
      expect(url.pathname).toBe(to.path);
      expect(url.searchParams.get("asked")).toBe(to.asked);
      expect(url.searchParams.get("phase") ?? "regular_season").toBe(to.phase ?? "regular_season");
      await page.locator("h1").first().waitFor();
      expect(await pageProblem(page)).toBeNull();
      if (note) await expect(page.getByRole("note").filter({ hasText: note })).toHaveCount(1);
      else await expect(page.getByRole("note").filter({ hasText: /games; showing the/ })).toHaveCount(0);
    });
  }
  test("the 2005-06 Thunder page is the Sonics", async ({ page }) => {
    await settle(page, "/teams/1610612760?season=2005-06");
    await expect(page.locator("h1").first()).toHaveText(/Seattle SuperSonics/);
  });
  test("unknown ids reach the not-found page with a way back", async ({ page }) => {
    await settle(page, "/players/999999999");
    await expect(page.locator("h1").first()).toHaveText("Player Not Found");
    await expect(page.getByRole("link", { name: "Return to Players" })).toHaveAttribute("href", "/players");
    await settle(page, "/teams/XYZ");
    await expect(page.locator("h1").first()).toHaveText("Team Not Found");
    await expect(page.getByRole("link", { name: "Return to All Teams" })).toHaveAttribute("href", "/teams");
  });
});

test("crawl: every internal link pattern opens a real page", async ({ page }) => {
  test.setTimeout(45 * 60_000);
  const seeds = ["/live", "/stats", "/players/2544?season=2025-26", "/teams/1610612760?season=2025-26", "/standings", "/playoffs", "/draft", "/contracts"];
  const found = new Map<string, Set<string>>();
  const collect = (list: string[]) => {
    for (const href of list) {
      const pattern = routePattern(href);
      if (!pattern) continue;
      if (!found.has(pattern)) found.set(pattern, new Set());
      found.get(pattern)!.add(href);
    }
  };
  for (const seed of seeds) {
    await settle(page, seed);
    collect(await hrefs(page));
  }
  // A game and a series are seeds too: the first of each the seeds linked to.
  for (const pattern of ["/live/games/:id", "/playoffs/:series"]) {
    const first = [...(found.get(pattern) ?? [])][0];
    if (first) { await settle(page, first); collect(await hrefs(page)); }
  }
  const failures: string[] = [];
  const counts: Record<string, { found: number; opened: number }> = {};
  for (const [pattern, set] of [...found].sort(([a], [b]) => a.localeCompare(b))) {
    const sample = [...set].slice(0, PER_PATTERN);
    counts[pattern] = { found: set.size, opened: sample.length };
    for (const href of sample) {
      const response = await page.goto(href, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch((error: Error) => error);
      if (response instanceof Error) { failures.push(`${href}: ${response.message.split("\n")[0]}`); continue; }
      if (!response || response.status() >= 400) { failures.push(`${href}: HTTP ${response?.status()}`); continue; }
      await page.locator("h1").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => undefined);
      const problem = await pageProblem(page);
      if (problem) failures.push(`${href}: ${problem}`);
    }
  }
  const total = Object.values(counts).reduce((sum, entry) => ({ found: sum.found + entry.found, opened: sum.opened + entry.opened }), { found: 0, opened: 0 });
  console.log(`SITE_LINKS_CRAWL ${JSON.stringify({ patterns: Object.keys(counts).length, ...total, counts })}`);
  console.log(`SITE_LINKS_HREFS ${JSON.stringify(Object.fromEntries([...found].map(([pattern, set]) => [pattern, [...set].sort()])))}`);
  expect(failures).toEqual([]);
});

const ROUTES = ["/calculator", "/compare", "/contracts", "/draft", "/free-agency", "/last-games", "/live", "/live/2026-11-13", "/matchups",
  "/methodology", "/methodology/learning", "/players", "/playoffs", "/research/backtest", "/research/case-studies", "/research/defensive-matchups",
  "/research/defensive-matchups/tracking", "/research/lineup-model", "/research/projected-impact", "/research/rapm", "/research/rapm/six-factor",
  "/research/shooting/aftermath", "/research/shot-quality", "/research/signal-noise", "/research/win-probability", "/research/zts", "/roster-shapes",
  "/showcase", "/similar-players", "/standings", "/stat-line-shift", "/stats", "/stats/tracking", "/team-compare", "/teams", "/wingspan", "/wowy",
  "/players/2544?season=2025-26", "/players/2544?season=2025-26&tab=career", "/teams/1610612760?season=2025-26", "/teams/1610612760?season=2024-25&phase=playoffs",
  "/contracts/OKC", "/roster-shapes/OKC"];

test("no anchor is nested in another target on any page (SL04)", async ({ page }) => {
  test.setTimeout(30 * 60_000);
  const problems: string[] = [];
  const pages = [...ROUTES];
  // A game and a series from the boards, since their ids change.
  await settle(page, "/live/2026-11-13");
  const game = await page.locator('a[href^="/live/games/"]').first().getAttribute("href");
  if (game) pages.push(game);
  await settle(page, "/playoffs?season=2024-25");
  const series = await page.locator('a[href^="/playoffs/"]').first().getAttribute("href");
  if (series) pages.push(series);
  for (const route of pages) {
    await settle(page, route);
    const nested = await nestedInteractive(page);
    if (nested.length) problems.push(`${route}: ${nested.slice(0, 4).join("; ")}`);
  }
  console.log(`SITE_LINKS_NESTED ${JSON.stringify({ pages: pages.length, problems })}`);
  expect(problems).toEqual([]);
});

test.describe("Live cards (D2)", () => {
  test.setTimeout(180_000);
  const DAY = "/live/2026-11-13";
  const card = (page: Page) => page.locator(".live-card").first();

  test("each team opens its team page for that season and the rest of the card opens the game, by mouse", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page, DAY);
    const teams = card(page).locator(".live-card-team-link");
    await expect(teams).toHaveCount(2);
    const away = await teams.first().getAttribute("href");
    expect(away).toMatch(/^\/teams\/\w+\?season=2026-27$/);
    await teams.first().locator(".live-card-code").click();
    await expect(page).toHaveURL(new RegExp(`${away!.replace("?", "\\?")}`));
    await page.goBack({ waitUntil: "commit" });
    // A press on the score (covered by the stretched game link) opens the game.
    const score = (await card(page).locator(".live-card-score").first().boundingBox())!;
    await page.mouse.click(score.x + score.width / 2, score.y + score.height / 2);
    await expect(page).toHaveURL(/\/live\/games\/\d+\?date=2026-11-13/);
  });

  test("keyboard: tab order is game, away team, home team; Enter opens each; number keys still open the game", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await settle(page, DAY);
    const links = card(page).locator("a");
    const hrefs = await links.evaluateAll(as => as.map(a => a.getAttribute("href")));
    expect(hrefs[0]).toMatch(/^\/live\/games\//);
    expect(hrefs.slice(1).every(h => h?.startsWith("/teams/"))).toBe(true);
    await links.first().focus();
    const order: string[] = [];
    for (let i = 0; i < 3; i++) {
      order.push(await page.evaluate(() => document.activeElement?.getAttribute("href") ?? ""));
      await page.keyboard.press("Tab");
    }
    expect(order).toEqual(hrefs);
    await links.nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/teams\//);
    await page.goBack({ waitUntil: "commit" });
    await card(page).waitFor();
    await page.locator("body").click({ position: { x: 5, y: 5 } });
    await page.keyboard.press("1");
    await expect(page).toHaveURL(/\/live\/games\/\d+/);
  });

  test("touch at 390: team targets are at least 44px tall, a tap on a team opens the team, a tap elsewhere opens the game", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await settle(page, DAY);
    const team = card(page).locator(".live-card-team-link").first();
    const box = await team.boundingBox();
    expect(box!.height).toBeGreaterThanOrEqual(44);
    await team.tap();
    await expect(page).toHaveURL(/\/teams\//);
    await page.goBack({ waitUntil: "commit" });
    await card(page).waitFor();
    const score = (await card(page).locator(".live-card-score").first().boundingBox())!;
    await page.touchscreen.tap(score.x + score.width / 2, score.y + score.height / 2);
    await expect(page).toHaveURL(/\/live\/games\//);
    await context.close();
  });

  test("axe finds no nested-interactive violation on Live or a game page", async ({ page }) => {
    const results: Record<string, unknown> = {};
    for (const route of [DAY, "/live"]) {
      await settle(page, route);
      await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
      const result = await page.evaluate(async () => {
        const run = await (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: { id: string; nodes: unknown[] }[]; passes: { id: string; nodes: unknown[] }[] }> } }).axe
          .run(document, { runOnly: { type: "rule", values: ["nested-interactive"] } });
        return { violations: run.violations.map(v => ({ id: v.id, nodes: v.nodes.length })), passed: run.passes.map(v => ({ id: v.id, nodes: v.nodes.length })) };
      });
      results[route] = result;
      expect(result.violations).toEqual([]);
    }
    await settle(page, DAY);
    await card(page).locator(".live-card-head").click();
    await page.waitForURL(/\/live\/games\//);
    await settle(page, page.url().replace(/^https?:\/\/[^/]+/, ""));
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const game = await page.evaluate(async () => (await (window as unknown as { axe: { run: (context: Document, options: object) => Promise<{ violations: { id: string }[] }> } }).axe
      .run(document, { runOnly: { type: "rule", values: ["nested-interactive"] } })).violations.map(v => v.id));
    results.game = game;
    console.log(`SITE_LINKS_AXE ${JSON.stringify(results)}`);
    expect(game).toEqual([]);
  });
});

test.describe("Back returns to the same filters and scroll position", () => {
  test.setTimeout(180_000);
  const cases = [
    { name: "Stats", path: "/stats?season=2024-25&phase=regular_season&sort=pts&order=desc", link: 'a.stats-player-link[href^="/players/"]' },
    { name: "Standings", path: "/standings?season=2018-19", link: 'a[href^="/teams/"]' },
    { name: "Live", path: "/live/2026-11-13", link: 'a.live-card-team-link' },
  ];
  for (const { name, path, link } of cases) {
    test(name, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 700 });
      await settle(page, path);
      const before = new URL(page.url());
      await page.mouse.wheel(0, 240);
      await page.waitForTimeout(500);
      const scrolled = await page.evaluate(() => scrollY);
      expect(scrolled).toBeGreaterThan(50);
      // Press a link already on screen, as a reader would (a locator click would scroll it into view first).
      const boxes = await page.locator(link).evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect()).map(r => ({ x: r.x, y: r.y, w: r.width, h: r.height })));
      const box = boxes.find(b => b.h > 0 && b.y > 80 && b.y + b.h < 700 - 10);
      expect(box).toBeTruthy();
      await page.mouse.click(box!.x + Math.min(8, box!.w / 2), box!.y + box!.h / 2);
      await page.waitForURL(url => url.pathname !== before.pathname, { timeout: 60_000 });
      await page.goBack({ waitUntil: "commit" });
      await expect.poll(() => new URL(page.url()).search).toBe(before.search);
      await expect.poll(() => page.evaluate(() => scrollY), { timeout: 15_000 }).toBeGreaterThan(scrolled - 40);
      const restored = await page.evaluate(() => scrollY);
      console.log(`SITE_LINKS_BACK ${JSON.stringify({ name, url: before.pathname + before.search, scrolled, restored })}`);
      expect(Math.abs(restored - scrolled)).toBeLessThanOrEqual(40);
    });
  }
});

// SL05: every Related link on the four hubs opens a real page (all of them, not a sample), and a
// link to a section lands on that section.
test("Related rows on the four hubs: every link opens a real page (SL05)", async ({ page }) => {
  test.setTimeout(20 * 60_000);
  await settle(page, "/live/2026-11-13");
  const game = await page.locator('a[href^="/live/games/"]').first().getAttribute("href");
  await settle(page, "/playoffs?season=2024-25");
  const series = await page.locator('a[href^="/playoffs/"]').first().getAttribute("href");
  const hubs = ["/players/2544?season=2024-25", "/teams/1610612760?season=2024-25", ...(game ? [game] : []), ...(series ? [series] : [])];
  expect(hubs).toHaveLength(4);
  const rows: Record<string, Array<{ label: string; href: string }>> = {};
  for (const hub of hubs) {
    await settle(page, hub);
    const row = page.getByRole("navigation", { name: "Related" });
    await row.waitFor({ timeout: 60_000 });
    // Release-bound links join once the shared catalog is read.
    await page.waitForTimeout(1_000);
    rows[hub] = await row.locator("a").evaluateAll(anchors => anchors.map(anchor => ({ label: anchor.textContent?.trim() ?? "", href: anchor.getAttribute("href") ?? "" })));
  }
  console.log(`SITE_LINKS_RELATED ${JSON.stringify(rows)}`);
  const failures: string[] = [];
  for (const [hub, links] of Object.entries(rows)) {
    expect(links.length, hub).toBeGreaterThan(2);
    for (const { href } of links) {
      const target = href.startsWith("#") ? `${hub}${href}` : href;
      const response = await page.goto(target, { waitUntil: "domcontentloaded", timeout: 90_000 }).catch((error: Error) => error);
      if (response instanceof Error) { failures.push(`${hub} → ${href}: ${response.message.split("\n")[0]}`); continue; }
      if (response && response.status() >= 400) { failures.push(`${hub} → ${href}: HTTP ${response.status()}`); continue; }
      await page.locator("h1").first().waitFor({ state: "visible", timeout: 60_000 }).catch(() => undefined);
      const problem = await pageProblem(page);
      if (problem) failures.push(`${hub} → ${href}: ${problem}`);
      const section = href.split("#")[1];
      if (section && !(await page.locator(`#${section}`).count())) failures.push(`${hub} → ${href}: no #${section} section`);
    }
  }
  expect(failures).toEqual([]);
});
