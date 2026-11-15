import fs from "node:fs";
import { expect, test, type Locator, type Page, type Request } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Speed plan SP00 (docs/speed-plan.md): click-to-content time for four journeys, logged as
// `SPEED_NAV {json}`. Against the fixture API it asserts request counts only, so a change in how a
// click fetches its page shows up in CI; timings are never asserted. With SPEED_REAL=1 (and
// PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=<a production build on real data>) it repeats the
// journeys SPEED_RUNS times (default 5) and reports timings; SPEED_NAV_OUT=<file> also writes them as JSON.
// SP03 adds the prefetched variant of the three click journeys: the pointer rests on the link until
// its intent prefetch has finished, then clicks.
// Prefetching only happens in production builds, which is what this suite runs against.
// SP05 adds each journey's long tasks (PerformanceObserver "longtask", start and duration in ms
// from the click), the method of SP03's traces.

const REAL = Boolean(process.env.SPEED_REAL);
const RUNS = REAL ? Number(process.env.SPEED_RUNS || 5) : 1;

type Journey = "stats-row-to-player" | "player-header-to-team" | "nav-to-stats" | "back-to-team"
  | "stats-row-to-player-prefetched" | "player-header-to-team-prefetched" | "nav-to-stats-prefetched";
const JOURNEYS: Journey[] = ["stats-row-to-player", "player-header-to-team", "nav-to-stats", "back-to-team",
  "stats-row-to-player-prefetched", "player-header-to-team-prefetched", "nav-to-stats-prefetched"];

interface Counts {
  /** Full document loads: a client-side transition makes none. */
  documents: number;
  /** React Server Component requests for the destination, made after the click. */
  rsc: number;
  /** Of those, prefetches (`next-router-prefetch`). */
  prefetch: number;
  /** Browser reads of the API after the click. */
  api: number;
}

interface Measurement extends Counts {
  journey: Journey;
  /** Page renders of the destination sent while the pointer rested on the link (prefetched journeys). */
  hoverPrefetch?: number;
  run: number;
  from: string;
  to: string;
  /** Click (or popstate, for Back) to the first frame where the destination's content is shown. */
  ms: number;
  /** Main-thread tasks over 50 ms that started between the click and the content: [start, duration] in ms from the click. */
  longTasks: [number, number][];
}

const results: Measurement[] = [];

function track(page: Page, destination: RegExp) {
  const requests: Request[] = [];
  const listener = (request: Request) => requests.push(request);
  page.on("request", listener);
  return (): Counts => {
    page.off("request", listener);
    const headers = requests.map(request => ({ request, headers: request.headers() }));
    const rsc = headers.filter(({ request, headers: h }) => (h.rsc === "1" || new URL(request.url()).searchParams.has("_rsc")) && destination.test(new URL(request.url()).pathname));
    return {
      documents: requests.filter(request => request.resourceType() === "document").length,
      rsc: rsc.length,
      prefetch: rsc.filter(({ headers: h }) => h["next-router-prefetch"] === "1").length,
      api: requests.filter(request => new URL(request.url()).pathname.startsWith("/api/") && request.resourceType() !== "document").length
    };
  };
}

// Records when the user acted, in the page's clock, before the action happens.
async function armClock(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __speedT0?: number };
    delete w.__speedT0;
    const lt = window as unknown as { __speedLongTasks?: [number, number][] };
    if (!lt.__speedLongTasks) {
      lt.__speedLongTasks = [];
      try {
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) lt.__speedLongTasks!.push([entry.startTime, entry.duration]);
        }).observe({ type: "longtask" });
      } catch { /* long tasks are not observable in this browser */ }
    }
    const mark = (event: Event) => { w.__speedT0 ??= event.timeStamp; };
    document.addEventListener("click", mark, { capture: true, once: true });
    window.addEventListener("popstate", mark, { once: true });
  });
}

// The destination is shown: its URL, no loading skeleton, no staged hidden copy, a filled h1 and
// the journey's own content. Checked every animation frame; returns ms since the armed event.
async function contentShown(page: Page, path: RegExp, content: string): Promise<number> {
  const handle = await page.waitForFunction(({ source, selector }) => {
    const w = window as unknown as { __speedT0?: number };
    if (w.__speedT0 === undefined || !new RegExp(source).test(location.pathname)) return false;
    if (document.querySelector('[aria-busy="true"]') || document.querySelector('body > div[hidden][id^="S:"]')) return false;
    const heading = document.querySelector("main h1");
    if (!heading?.textContent?.trim() || !document.querySelector(selector)) return false;
    return performance.now() - w.__speedT0;
  }, { source: path.source, selector: content }, { polling: "raf", timeout: 60_000 });
  return Math.round(Number(await handle.jsonValue()));
}

async function journey(page: Page, name: Journey, run: number, path: RegExp, content: string, act: () => Promise<unknown>, hoverPrefetch?: number) {
  const from = new URL(page.url()).pathname;
  await armClock(page);
  const counts = track(page, path);
  await act();
  const ms = await contentShown(page, path, content);
  const longTasks = await page.evaluate((shown) => {
    const w = window as unknown as { __speedT0?: number; __speedLongTasks?: [number, number][] };
    const t0 = w.__speedT0 ?? 0;
    return (w.__speedLongTasks ?? []).filter(([start]) => start >= t0 && start - t0 <= shown)
      .map(([start, duration]) => [Math.round(start - t0), Math.round(duration)] as [number, number]);
  }, ms);
  // Late requests for the same navigation (streamed reads, deferred chunks) still count.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const measurement: Measurement = { journey: name, run, from, to: new URL(page.url()).pathname, ms, longTasks, ...counts(), ...(hoverPrefetch === undefined ? {} : { hoverPrefetch }) };
  results.push(measurement);
  console.log(`SPEED_NAV ${JSON.stringify(measurement)}`);
  return measurement;
}

const PLAYER = /^\/players\/[^/]+$/;
const TEAM = /^\/teams\/[^/]+$/;
const STATS = /^\/stats$/;
const STATS_ROW = 'main a[href^="/players/"]';
const TEAM_CONTENT = "main h1";
const PLAYER_CONTENT = 'main a[href^="/teams/"]';
const NAV_STATS = 'header a[href="/stats"]';

// A full prefetch is one page render (an RSC request without the prefetch header) plus route-tree
// lookups (`Next-Router-Segment-Prefetch: /_tree`, no API read).
const isPageRender = (request: Request, path: RegExp) => {
  const h = request.headers();
  return (h.rsc === "1" || new URL(request.url()).searchParams.has("_rsc")) && h["next-router-segment-prefetch"] !== "/_tree" && path.test(new URL(request.url()).pathname);
};

// Rests the pointer on the link until its intent prefetch has finished; returns how many page
// renders of the destination it sent.
async function restOn(page: Page, link: Locator, path: RegExp): Promise<number> {
  const sent: Request[] = [];
  const listener = (request: Request) => { if (isPageRender(request, path)) sent.push(request); };
  page.on("request", listener);
  const finished = page.waitForEvent("requestfinished", { predicate: request => isPageRender(request, path), timeout: 30_000 });
  await link.hover();
  await finished;
  page.off("request", listener);
  return sent.length;
}

async function prefetched(page: Page, name: Journey, run: number, path: RegExp, content: string, link: Locator) {
  const hoverPrefetch = await restOn(page, link, path);
  return journey(page, name, run, path, content, () => link.click(), hoverPrefetch);
}

test.describe.configure({ mode: "serial" });

test.afterAll(() => {
  if (!REAL) return;
  const summary = Object.fromEntries(JOURNEYS.map(name => {
    const times = results.filter(result => result.journey === name).map(result => result.ms).sort((a, b) => a - b);
    return [name, { runs: times.length, median_ms: times[Math.floor(times.length / 2)] ?? null, min_ms: times[0] ?? null, max_ms: times.at(-1) ?? null }];
  }));
  console.log(`SPEED_NAV_SUMMARY ${JSON.stringify(summary)}`);
  if (process.env.SPEED_NAV_OUT) {
    fs.writeFileSync(process.env.SPEED_NAV_OUT, `${JSON.stringify({ spec: "dashboard/e2e/speed-navigation.spec.ts", base_url: test.info().project.use.baseURL, runs: RUNS, summary, results }, null, 2)}\n`);
  }
});

test("click to content: Stats row → player → team, nav → Stats, Back; then the same clicks after a prefetch", async ({ page }) => {
  test.setTimeout(180_000 * RUNS);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (let run = 1; run <= RUNS; run++) {
    // Each block starts from a document load, so the router cache and the once-per-window record are
    // empty. The prefetched block starts on the player page the Stats row opens: a page loaded as a
    // document is kept by the router, so starting on /stats would leave nav → Stats nothing to fetch.
    await openWorkbench(page, "/stats");
    const playerHref = await page.locator(STATS_ROW).first().getAttribute("href");
    await openWorkbench(page, playerHref ?? "/stats");
    await expect(page.locator(PLAYER_CONTENT).first()).toBeVisible();
    const pToTeam = await prefetched(page, "player-header-to-team-prefetched", run, TEAM, TEAM_CONTENT, page.locator(PLAYER_CONTENT).first());
    const pToStats = await prefetched(page, "nav-to-stats-prefetched", run, STATS, STATS_ROW, page.locator(NAV_STATS).first());
    // The second row: the first row's player page was this block's document load, which the router keeps.
    const pToPlayer = await prefetched(page, "stats-row-to-player-prefetched", run, PLAYER, PLAYER_CONTENT, page.locator(STATS_ROW).nth(1));

    await openWorkbench(page, "/stats");
    await expect(page.locator(STATS_ROW).first()).toBeVisible();

    const toPlayer = await journey(page, "stats-row-to-player", run, PLAYER, PLAYER_CONTENT, () => page.locator(STATS_ROW).first().click());
    const toTeam = await journey(page, "player-header-to-team", run, TEAM, TEAM_CONTENT, () => page.locator(PLAYER_CONTENT).first().click());
    const toStats = await journey(page, "nav-to-stats", run, STATS, STATS_ROW, () => page.locator(NAV_STATS).first().click());
    const back = await journey(page, "back-to-team", run, TEAM, TEAM_CONTENT, () => page.goBack());

    if (REAL) continue;
    // Every journey is a client-side transition. A click with no prefetch before it fetches its
    // destination once (Playwright's click does not rest on the link, so no intent prefetch fires).
    for (const measurement of [toPlayer, toTeam, toStats, back, pToPlayer, pToTeam, pToStats]) expect(measurement.documents, measurement.journey).toBe(0);
    expect(toPlayer.rsc - toPlayer.prefetch, "Stats row → player").toBe(1);
    expect(toTeam.rsc - toTeam.prefetch, "player header → team").toBe(1);
    expect(toStats.rsc - toStats.prefetch, "nav → Stats").toBe(1);
    // Back is served from the router cache.
    expect(back.rsc, "Back").toBe(0);
    // SP03: resting on the link renders the destination once, and the click after it sends nothing.
    for (const measurement of [pToPlayer, pToTeam, pToStats]) {
      expect(measurement.hoverPrefetch, `${measurement.journey}: page renders on hover`).toBe(1);
      expect(measurement.rsc, `${measurement.journey}: page requests after the click`).toBe(0);
    }
  }
});
