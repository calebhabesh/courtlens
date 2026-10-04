/* B36b read-only standalone production typography acceptance.
 * Usage: B36_SITE_URL=http://127.0.0.1:3137 node scripts/verify_b36_fonts.cjs NEW_DIRECTORY
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('../dashboard/node_modules/playwright');
const output = process.argv[2];
assert.ok(output && !fs.existsSync(output), 'New evidence directory required');
fs.mkdirSync(output, { recursive: true });
const site = process.env.B36_SITE_URL || 'http://127.0.0.1:3137';
const api = process.env.B36_API_URL || 'http://127.0.0.1:8000';
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
const packaged = JSON.parse(fs.readFileSync(path.join(__dirname, '../dashboard/public/fonts/manifest.json')));
async function json(url) {
  const response = await fetch(url);
  assert.equal(response.status, 200, url);
  return response.json();
}
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const errors = [], requests = [], external = [], fonts = [], pending = [], measurements = [], fallbackChecks = [];
  try {
    assert.equal((await json(api + '/api/workbench/assistant/status')).configured, false);
    const before = await json(api + '/api/workbench/assistant/investigations?limit=100');
    const catalog = await json(api + '/api/workbench/catalog');
    const saved = before.find(item => item.operations.includes('distribution'));
    assert.ok(saved);
    const finance = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/evidence/b29-finance-query.json'))).cases.corrected.result;
    const pinned = new URLSearchParams({ release_id: catalog.release_id, season: '2023-24', phase: 'regular_season', before_date: '2024-04-15' });
    const financeParams = new URLSearchParams({ finance_book_id: finance.context.book_id, finance_financial_season: '2025-26', finance_known_at: finance.context.known_at, finance_effective_on: '2025-02-12', finance_team_id: '1610612761', season: '2024-25' });
    const routes = [
      { id: 'stats', url: '/stats?' + pinned, ready: 'main table tbody tr' },
      { id: 'scatter', url: '/stats?' + pinned + '&viewMode=scatter', ready: 'main svg' },
      { id: 'finance', url: '/contracts/TOR?' + financeParams, ready: 'main table tbody tr' },
      { id: 'conversation', url: '/investigations/saved/' + saved.id, ready: '.conversation-result' }
    ];
    for (const route of routes) {
      // Fresh context + disabled cache: initial navigation, not post-hydration swap.
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        window.fontShifts = [];
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.fontShifts.push({ value: entry.value, time: entry.startTime });
        }).observe({ type: 'layout-shift', buffered: true });
      });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {
        const url = new URL(request.url());
        if (url.pathname.includes('/api/')) requests.push({ method: request.method(), url: request.url() });
        if (![site, api].includes(url.origin)) external.push({ type: request.resourceType(), url: request.url() });
      });
      page.on('response', response => {
        if (response.request().resourceType() === 'font') pending.push((async () => {
          assert.equal(response.status(), 200);
          const data = await response.body();
          const font = packaged.fonts.find(item => item.sha256 === sha(data));
          assert.ok(font, 'Unexpected delivered font ' + response.url());
          assert.equal(new URL(response.url()).origin, site);
          fonts.push({ route: route.id, url: response.url(), sha256: sha(data), bytes: data.length, family: font.name, cache_control: response.headers()['cache-control'] });
        })());
      });
      process.stdout.write(route.id + '\n');
      assert.equal((await page.goto(site + route.url)).status(), 200);
      await page.locator(route.ready).first().waitFor();
      if (route.id === 'conversation') await page.getByRole('heading', { name: saved.title, exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200);
      const metrics = await page.evaluate(() => {
        const root = getComputedStyle(document.documentElement);
        const families = { ui: root.getPropertyValue('--font-sans'), data: root.getPropertyValue('--font-mono') };
        const numerals = [], glyphs = [];
        for (const [role, family] of Object.entries(families)) {
          for (const weight of [400, 500, 600]) {
            const span = document.createElement('span');
            span.style.cssText = `position:fixed;visibility:hidden;font-family:${family};font-size:14px;font-weight:${weight};font-variant-numeric:tabular-nums;font-kerning:none`;
            document.body.append(span);
            const widths = Array.from('0123456789', digit => { span.textContent = digit; return span.getBoundingClientRect().width; });
            span.remove();
            numerals.push({ role, weight, widths, spread: Math.max(...widths) - Math.min(...widths) });
          }
          const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
          const primary = family.split(',')[0], missing = [];
          for (const char of new Set('Jokić Dončić Porziņģis Şengün +−%– 1Il0O')) {
            ctx.font = `400 32px ${primary},monospace`; const a = ctx.measureText(char).width;
            ctx.font = `400 32px ${primary},serif`; const b = ctx.measureText(char).width;
            if (Math.abs(a - b) > .01) missing.push(char);
          }
          glyphs.push({ role, fallback_dependent: missing });
        }
        const shifts = window.fontShifts;
        let max = 0, sum = 0, start = 0, last = 0;
        for (const shift of shifts) {
          if (shift.time - last > 1000 || shift.time - start > 5000) { sum = 0; start = shift.time; }
          sum += shift.value; max = Math.max(max, sum); last = shift.time;
        }
        return { families, numerals, glyphs, cls: max, shifts,
          body_overflow: document.documentElement.scrollWidth > innerWidth,
          row_height: document.querySelector('main tbody tr')?.getBoundingClientRect().height ?? null,
          table_width: document.querySelector('main table')?.getBoundingClientRect().width ?? null,
          table_rows: document.querySelectorAll('main tbody tr').length,
          preloads: [...document.querySelectorAll('link[rel=preload][as=font]')].map(item => item.href),
          mono_ligatures: document.querySelector('.font-mono') ? getComputedStyle(document.querySelector('.font-mono')).fontVariantLigatures : null };
      });
      assert.equal(metrics.body_overflow, false);
      assert.ok(metrics.cls <= .1, `${route.id}: CLS ${metrics.cls}`);
      assert.equal(metrics.preloads.length, 2);
      for (const item of metrics.numerals) assert.ok(item.spread < .02);
      for (const item of metrics.glyphs) assert.deepEqual(item.fallback_dependent, []);
      if (route.id === 'stats') assert.equal(metrics.table_rows, 50);
      await page.screenshot({ path: path.join(output, route.id + '-desktop.png'), fullPage: true });
      if (route.id === 'stats') {
        await page.evaluate(families => {
          const panel = document.createElement('section'); panel.id = 'font-specimen';
          panel.style.cssText = 'padding:24px;background:var(--surface);color:var(--text);width:1000px';
          for (const [role, family] of Object.entries(families)) for (const size of [12, 14, 18]) {
            const line = document.createElement('p');
            line.style.cssText = `font-family:${family};font-size:${size}px;font-variant-numeric:tabular-nums;font-variant-ligatures:none`;
            line.textContent = `${role} ${size}px · Nikola Jokić · Luka Dončić · Kristaps Porziņģis · Alperen Şengün · 1Il0O · −12.5% · USD 40,000,000 · null/unknown`;
            panel.append(line);
          }
          document.querySelector('main').append(panel);
        }, metrics.families);
        await page.locator('#font-specimen').screenshot({ path: path.join(output, 'glyphs.png') });
        await page.evaluate(() => { document.querySelector('#font-specimen').remove(); window.scrollTo(0, 0); });
      }
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(() => document.activeElement.textContent.trim()), 'Skip to content');
      const sizes = [];
      for (const size of [{ id: 'mobile', width: 375, height: 812 }, { id: 'landscape', width: 812, height: 375 }, { id: 'zoom', width: 1440, height: 1000, zoom: '2' }]) {
        await page.setViewportSize(size);
        await page.evaluate(zoom => { document.documentElement.style.zoom = zoom || ''; window.scrollTo(0, 0); }, size.zoom);
        await page.waitForTimeout(100);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        const mainWidth = await page.locator('main').evaluate(node => node.getBoundingClientRect().width);
        const workspaceWidth = await page.locator('main > *').first().evaluate(node => node.getBoundingClientRect().width);
        assert.ok(workspaceWidth <= mainWidth + 1, route.id + '/' + size.id + ' clipped workspace');
        if (route.id === 'finance') {
          const headingWidth = await page.locator('.finance-heading > div').evaluate(node => node.getBoundingClientRect().width);
          assert.ok(headingWidth <= mainWidth + 1, 'Finance heading must wrap');
        }
        assert.equal(overflow, false, route.id + '/' + size.id);
        await page.screenshot({ path: path.join(output, `${route.id}-${size.id}.png`), fullPage: true });
        sizes.push({ ...size, body_overflow: overflow });
      }
      measurements.push({ route: route.id, url: route.url, ...metrics, sizes, keyboard_skip_link: true });
      await Promise.all(pending);
      await context.close();
    }
    for (const mode of ['delayed', 'blocked']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
      await context.addInitScript(() => {
        window.fontShifts = [];
        new PerformanceObserver(list => {
          for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.fontShifts.push({ value: entry.value, time: entry.startTime });
        }).observe({ type: 'layout-shift', buffered: true });
      });
      const page = await context.newPage();
      page.on('pageerror', error => errors.push(error.message));
      let intercepted = 0;
      const interceptedUrls = new Set();
      await page.route('**/*.woff2', async route => {
        intercepted++; interceptedUrls.add(route.request().url());
        if (mode === 'blocked') await route.abort('failed');
        else { await new Promise(resolve => setTimeout(resolve, 1500)); await route.continue(); }
      });
      await page.goto(site + routes[0].url, { waitUntil: 'domcontentloaded' });
      await page.locator(routes[0].ready).first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1200);
      const metrics = await page.evaluate(() => {
        let max = 0, sum = 0, start = 0, last = 0;
        for (const shift of window.fontShifts) {
          if (shift.time - last > 1000 || shift.time - start > 5000) { sum = 0; start = shift.time; }
          sum += shift.value; max = Math.max(max, sum); last = shift.time;
        }
        return { cls: max, shifts: window.fontShifts, rows: document.querySelectorAll('main tbody tr').length,
          overflow: document.documentElement.scrollWidth > innerWidth, text: document.querySelector('main h1').textContent,
          fonts: [...document.fonts].map(font => ({ family: font.family, status: font.status })),
          row_height: document.querySelector('main tbody tr').getBoundingClientRect().height };
      });
      assert.equal(interceptedUrls.size, 2); assert.equal(metrics.rows, 50); assert.equal(metrics.overflow, false);
      assert.ok(metrics.cls <= .1, mode + ' CLS ' + metrics.cls);
      assert.ok(metrics.text.includes('Stats Explorer'));
      await page.screenshot({ path: path.join(output, 'stats-' + mode + '.png'), fullPage: true });
      fallbackChecks.push({ mode, intercepted, unique_fonts: interceptedUrls.size, ...metrics });
      await context.close();
    }
    for (const font of packaged.fonts) {
      assert.ok(fonts.some(item => item.family === font.name));
      const response = await fetch(site + '/fonts/' + font.license_file);
      assert.equal(response.status, 200);
      assert.equal(sha(Buffer.from(await response.arrayBuffer())), font.license_sha256);
    }
    assert.deepEqual(await json(api + '/api/workbench/assistant/investigations?limit=100'), before);
    assert.deepEqual(errors, []);
    assert.ok(!external.some(item => ['font', 'stylesheet'].includes(item.type)), 'External font/CSS dependence');
    assert.ok(requests.every(item => item.method === 'GET' || (item.method === 'POST' && new URL(item.url).pathname === '/api/workbench/operations/finance')));
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ block: 'B36b', recorded_at: new Date().toISOString(), browser: browser.version(), site, api, release_id: catalog.release_id,
      mode: 'Fresh standalone production; cold contexts and disabled cache; real retained services, inference disabled', fonts, measurements, fallback_checks: fallbackChecks, requests, external_requests: external, page_errors: errors, saved_inventory_unchanged: true,
      cls_observation: 'Initial navigation through real-data ready + fonts ready + 1.2 seconds; maximum CLS session window, excludes recent input; bounded lab measurement',
      limits: ['Chromium/Linux only', 'Bounded glyph sample, not all names', 'CSS 200% zoom', 'B32 and language/source/model gates remain open'] }, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
