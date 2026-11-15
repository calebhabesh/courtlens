import fs from "node:fs";
import { expect, test, type Page, type Request } from "@playwright/test";
import { openWorkbench } from "./workbench-navigation";

// Speed plan SP00 (docs/speed-plan.md): click-to-content time for four journeys, logged as
// `SPEED_NAV {json}`. Against the fixture API it asserts request counts only, so a change in how a
// click fetches its page shows up in CI; timings are never asserted. With SPEED_REAL=1 (and
// PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=<a production build on real data>) it repeats the
// journeys SPEED_RUNS times (default 5) and reports timings; SPEED_NAV_OUT=<file> also writes them as JSON.
// Prefetching only happens in production builds, which is what this suite runs against.

const REAL = Boolean(process.env.SPEED_REAL);
const RUNS = REAL ? Number(process.env.SPEED_RUNS || 5) : 1;

type Journey = "stats-row-to-player" | "player-header-to-team" | "nav-to-stats" | "back-to-team";

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
  run: number;
  from: string;
  to: string;
  /** Click (or popstate, for Back) to the first frame where the destination's content is shown. */
  ms: number;
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

async function journey(page: Page, name: Journey, run: number, path: RegExp, content: string, act: () => Promise<unknown>) {
  const from = new URL(page.url()).pathname;
  await armClock(page);
  const counts = track(page, path);
  await act();
  const ms = await contentShown(page, path, content);
  // Late requests for the same navigation (streamed reads, deferred chunks) still count.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const measurement: Measurement = { journey: name, run, from, to: new URL(page.url()).pathname, ms, ...counts() };
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

test.describe.configure({ mode: "serial" });

test.afterAll(() => {
  if (!REAL) return;
  const summary = Object.fromEntries((["stats-row-to-player", "player-header-to-team", "nav-to-stats", "back-to-team"] as Journey[]).map(name => {
    const times = results.filter(result => result.journey === name).map(result => result.ms).sort((a, b) => a - b);
    return [name, { runs: times.length, median_ms: times[Math.floor(times.length / 2)] ?? null, min_ms: times[0] ?? null, max_ms: times.at(-1) ?? null }];
  }));
  console.log(`SPEED_NAV_SUMMARY ${JSON.stringify(summary)}`);
  if (process.env.SPEED_NAV_OUT) {
    fs.writeFileSync(process.env.SPEED_NAV_OUT, `${JSON.stringify({ spec: "dashboard/e2e/speed-navigation.spec.ts", base_url: test.info().project.use.baseURL, runs: RUNS, summary, results }, null, 2)}\n`);
  }
});

test("click to content: Stats row → player → team, nav → Stats, Back", async ({ page }) => {
  test.setTimeout(120_000 * RUNS);
  await page.setViewportSize({ width: 1440, height: 900 });
  for (let run = 1; run <= RUNS; run++) {
    await openWorkbench(page, "/stats");
    await expect(page.locator(STATS_ROW).first()).toBeVisible();

    const toPlayer = await journey(page, "stats-row-to-player", run, PLAYER, PLAYER_CONTENT, () => page.locator(STATS_ROW).first().click());
    const toTeam = await journey(page, "player-header-to-team", run, TEAM, TEAM_CONTENT, () => page.locator(PLAYER_CONTENT).first().click());
    const toStats = await journey(page, "nav-to-stats", run, STATS, STATS_ROW, () => page.locator('header a[href="/stats"]').first().click());
    const back = await journey(page, "back-to-team", run, TEAM, TEAM_CONTENT, () => page.goBack());

    if (REAL) continue;
    // Today's behaviour (SP00 baseline): every journey is a client-side transition, and each click
    // fetches its destination once. SP03 changes these counts on purpose.
    for (const measurement of [toPlayer, toTeam, toStats, back]) expect(measurement.documents, measurement.journey).toBe(0);
    expect(toPlayer.rsc - toPlayer.prefetch, "Stats row → player").toBe(1);
    expect(toTeam.rsc - toTeam.prefetch, "player header → team").toBe(1);
    expect(toStats.rsc - toStats.prefetch, "nav → Stats").toBe(1);
    // Back is served from the router cache.
    expect(back.rsc, "Back").toBe(0);
  }
});
