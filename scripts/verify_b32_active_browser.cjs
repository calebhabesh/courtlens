/* Real active-source acceptance. No routes are mocked and no source timers accelerated. */
const { chromium } = require('../dashboard/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

(async () => {
  const output = path.resolve(process.argv[2]);
  assert(!fs.existsSync(output), 'New evidence directory required');
  fs.mkdirSync(output, { recursive: true });
  const save = (name, data) => fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2) + '\n');
  const games = process.env.B32_GAMES.split(',');
  const base = process.env.PLAYWRIGHT_BASE_URL;
  const slate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
  const owned = new Set(), requests = [], snapshots = [], errors = [], pending = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    // Two clients selecting the same box prove selected demand coalescing.
    const selections = [games[0], ...games, null];
    const pages = await Promise.all(selections.map(() => context.newPage()));
    for (const [tab, page] of pages.entries()) {
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {
        if (!new URL(response.url()).pathname.startsWith('/api/live')) return;
        const task = (async () => {
          const request = response.request();
          requests.push({ tab, at: Date.now(), url: response.url(), method: request.method(), status: response.status() });
          if (!response.ok() || response.status() === 204) return;
          const data = await response.json();
          if (request.method() === 'POST' && data.id) { owned.add(data.id); save('owned-leases.json', [...owned]); }
          if (request.method() === 'GET' && data.data?.game) snapshots.push({ tab, at: Date.now(), data });
        })().catch(error => errors.push(error.message));
        pending.push(task);
      });
    }
    const started = Date.now();
    await Promise.all(pages.map((page, index) => page.goto(selections[index]
      ? `${base}/live/games/${selections[index]}?date=${slate}` : `${base}/live/${slate}`)));
    for (let i = 0; i < 40; i++) {
      const state = await (await context.request.get(`${base}/api/live?slate_date=${slate}`)).json();
      if (state.active_leases === pages.length) break;
      assert(i < 39, 'All real browser leases must activate');
      await pages[0].waitForTimeout(250);
    }
    for (let i = 0; i < 40; i++) await pages[0].waitForTimeout(5000);
    await Promise.all(pending);
    const changed = [];
    for (const game of games) {
      const values = snapshots.filter(item => item.data.data.game.source_id === game && item.tab === selections.indexOf(game));
      const unique = [...new Map(values.map(value => [value.data.observation_id, value])).values()];
      assert(unique.length >= 2, `Multiple browser-observed source acquisitions for ${game}`);
      assert(unique.every(item => item.data.data.game.status === 'in_progress'));
      const scores = new Set(unique.map(item => JSON.stringify(item.data.data.game.teams.map(team => [team.source_id, team.score]))));
      const clocks = new Set(unique.map(item => JSON.stringify([item.data.data.game.period, item.data.data.game.clock])));
      assert(scores.size >= 2 && clocks.size >= 2, `Real scores and clocks must both change for ${game}`);
      assert(unique.every(item => item.data.data.players?.length > 0));
      for (const item of unique) {
        assert(item.data.data.players.filter(player => player.reported_nonappearance === true)
          .every(player => Object.values(player.statistics).every(value => value === null)));
      }
      changed.push({ game, observations: unique.map(item => ({ id: item.data.observation_id, acquired_at: item.data.acquired_at, game: item.data.data.game, player_rows: item.data.data.players.length })) });
    }
    const apiReads = [];
    for (let i = 0; i < 100; i++) {
      const start = performance.now();
      const response = await context.request.get(`${base}/api/live/games/${games[i % games.length]}?slate_date=${slate}`);
      assert.equal(response.status(), 200);
      apiReads.push(performance.now() - start);
    }
    const p95 = [...apiReads].sort((a, b) => a - b)[94];
    assert(p95 <= 100, `Cached HTTP p95 ${p95}ms exceeds budget`);
    const rendered = [];
    for (const game of games) {
      const index = selections.indexOf(game), page = pages[index];
      const latest = snapshots.filter(item => item.tab === index && item.data.data.game.source_id === game).at(-1).data;
      const section = page.getByRole('region', { name: 'Selected game details', exact: true });
      const body = await section.innerText();
      for (const team of latest.data.game.teams) assert(body.includes(`${team.name}: ${team.score}`));
      assert(body.includes(latest.data.game.clock));
      await page.screenshot({ path: `${output}/game-${game}-desktop.png`, fullPage: true });
      await page.setViewportSize({ width: 375, height: 812 });
      const widths = await page.evaluate(() => ({ body: document.documentElement.scrollWidth, viewport: innerWidth }));
      assert(widths.body <= widths.viewport);
      await page.screenshot({ path: `${output}/game-${game}-mobile.png`, fullPage: true });
      rendered.push({ game, observation_id: latest.observation_id, selected_text: body, widths });
    }
    await Promise.all(pages.map(page => page.getByRole('button', { name: 'Pause updates', exact: true }).click()));
    for (let i = 0; i < 40; i++) {
      const state = await (await context.request.get(`${base}/api/live?slate_date=${slate}`)).json();
      if (state.active_leases === 0) break;
      assert(i < 39, 'All owned leases must release on pause');
      await pages[0].waitForTimeout(250);
    }
    await context.close();
    await Promise.all(pending);
    assert.equal(errors.length, 0, JSON.stringify(errors));
    assert(requests.every(request => request.status >= 200 && request.status < 300));
    save('verification.json', { scope: 'Real Chromium/production Next/FastAPI/PostgreSQL; actual changing preseason games', slate, browser: browser.version(), tabs: pages.length, wall_seconds: (Date.now() - started) / 1000, changed, rendered, cached_reads: 100, proxy_http_p95_ms: p95, apiReads, errors, requests });
  } finally {
    await browser.close();
    await Promise.all(pending);
    save('owned-leases.json', [...owned]);
    save('requests.json', requests);
    save('snapshots.json', snapshots);
    save('errors.json', errors);
  }
})().catch(error => { console.error(error); process.exit(1); });
