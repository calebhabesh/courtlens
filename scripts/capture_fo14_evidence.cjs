/* FO14: read-only route sweep, WCAG audit, keyboard focus and desktop 200% reflow.
 * The 720 CSS-pixel viewport at deviceScaleFactor 2 models a 1440-pixel desktop at 200% zoom.
 * It checks layout reflow; it does not claim a physical screen-reader or browser-chrome test.
 */
const { chromium } = require('../dashboard/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.FO14_BASE_URL || 'http://localhost:3103';
const api = process.env.FO14_API_URL || 'http://localhost:8001';
const output = path.resolve(process.env.FO14_OUT || 'docs/evidence/fo14');
const only = process.env.FO14_ONLY?.split(',');
const views = process.env.FO14_VIEWS?.split(',') || ['desktop', 'tablet', 'phone', 'zoom'];
const sizes = { desktop: [1440, 900, 1], tablet: [768, 900, 1], phone: [390, 844, 1], zoom: [720, 450, 2] };
const slug = url => url === '/' ? 'root' : url.slice(1).replace(/[^a-zA-Z0-9-]/g, '_');

async function measure(page) {
  return page.evaluate(() => {
    const visible = e => e.checkVisibility() && !e.closest('.sr-only') && e.getBoundingClientRect().width > 1 && e.getBoundingClientRect().height > 1;
    const root = document.querySelector('main');
    const label = e => e.getAttribute('aria-label') || e.textContent.trim().slice(0, 90);
    const text = [...root.querySelectorAll('*')].filter(visible).flatMap(e => [...e.childNodes].filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent)).join(' ');
    const controls = [...document.querySelectorAll('button,summary,.ui-button,main a:not(p a):not(li a),[role="option"],[role="tab"],[role="menuitem"],.control-pill,input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]),select,textarea')].filter(visible);
    const smallTargets = controls.filter(e => { const r = e.getBoundingClientRect(); return r.height < 39.5 || r.width < 39.5; }).map(e => ({ label: label(e), class: e.className, width: e.getBoundingClientRect().width, height: e.getBoundingClientRect().height }));
    const badNumbers = [...root.querySelectorAll('td')].filter(visible).filter(e => {
      const head = e.closest('table')?.tHead?.rows;
      const label = head?.[head.length - 1]?.cells[e.cellIndex]?.textContent.trim() || '';
      return e.matches('.num') || (/^[-+]?\d[\d,.]*%?$/.test(e.textContent.trim()) && !/(^|[ _])id$/i.test(label));
    }).filter(e => { const s = getComputedStyle(e); return s.textAlign !== 'right' || !s.fontVariantNumeric.includes('tabular-nums'); }).map(e => ({ text: e.textContent.trim().slice(0, 40), class: e.className }));
    const pageRoot = root.querySelector('.ui-page,.stats-workspace,.ask-page');
    const main = root.querySelector('.ui-design-grid,.ui-findings,.ui-compare,.ui-profile-hero,.showcase-card-svg,.roster-team-header,.ui-article-body,.player-explorer-container,.research-table,.ui-board,.planner-auth,.floor-result,.finance-summary,.player-hero,.similarity-target-card,.playoff-series-hero-panel,.ui-gated-note,.live-game-grid,.ask-layout,.ask-empty,.conversation');
    const bar = root.querySelector('.ui-filter-bar');
    const gap = bar ? [...pageRoot.querySelectorAll('*')].filter(e => !bar.contains(e) && !e.contains(bar) && visible(e) && e.getBoundingClientRect().top >= bar.getBoundingClientRect().bottom - 1 && getComputedStyle(e).position !== 'fixed').map(e => e.getBoundingClientRect().top - bar.getBoundingClientRect().bottom).sort((a, b) => a - b)[0] : null;
    return {
      title: root.querySelector('h1')?.textContent, h1Count: root.querySelectorAll('h1').length,
      template: pageRoot?.dataset.template, documentWidth: document.documentElement.scrollWidth, viewportWidth: innerWidth,
      mainTop: main ? Math.round(main.getBoundingClientRect().top) : null, afterBarGap: gap == null ? null : Math.round(gap),
      smallTargets, badNumbers, numericCells: root.querySelectorAll('td.num').length,
      clippedLabels: controls.filter(e => e.matches('button,summary,.ui-button,[role="tab"]') && e.scrollWidth > e.clientWidth + 1 && ![e, ...e.querySelectorAll('*')].some(child => getComputedStyle(child).textOverflow === 'ellipsis')).map(label),
      filtersButton: [...root.querySelectorAll('button')].some(e => visible(e) && /^Filters/.test(e.textContent)),
      rawDates: (text.match(/\b\d{4}-\d{2}-\d{2}\b/g) || []).length,
      uuids: (text.match(/\b[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b/gi) || []).length,
      hashes: (text.match(/\b[\da-f]{64}\b/gi) || []).length, cutoffRules: (text.match(/game_date\s*</g) || []).length,
      nativeDates: root.querySelectorAll('input[type="date"]').length,
      loadButtons: controls.filter(e => /^Load\b/.test(e.textContent.trim())).map(label),
      brokenImages: [...document.images].filter(visible).filter(e => e.complete && !e.naturalWidth).map(e => e.getAttribute('src')),
      inlineStyles: [...document.querySelectorAll('[style]')].filter(e => [...e.style].some(key => !key.startsWith('--'))).map(e => ({ tag: e.tagName, class: e.className, style: e.getAttribute('style') }))
    };
  });
}

async function capture(browser, route, view) {
  const [width, height, deviceScaleFactor] = sizes[view];
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('http://localhost:4102/**', async relay => {
    const response = await relay.fetch({ url: relay.request().url().replace('http://localhost:4102', api), timeout: 90000 });
    await relay.fulfill({ response });
  });
  let result;
  try {
    await page.goto(base + route.url, { timeout: 90000 });
    await page.waitForLoadState('networkidle', { timeout: 90000 });
    await page.waitForFunction(() => !document.querySelector('body > div[hidden][id^="S:"]') && document.fonts.status === 'loaded');
    await page.waitForFunction(() => [...document.images].filter(i => {
      if (!i.checkVisibility()) return false;
      const r = i.getBoundingClientRect();
      let left = Math.max(0, r.left), right = Math.min(innerWidth, r.right), top = Math.max(0, r.top), bottom = Math.min(innerHeight, r.bottom);
      for (let p = i.parentElement; p; p = p.parentElement) {
        const s = getComputedStyle(p), b = p.getBoundingClientRect();
        if (/^(auto|scroll|hidden|clip)$/.test(s.overflowX)) { left = Math.max(left, b.left); right = Math.min(right, b.right); }
        if (/^(auto|scroll|hidden|clip)$/.test(s.overflowY)) { top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
      }
      return right > left && bottom > top;
    }).every(i => i.complete), null, { timeout: 45000 });
    const values = await measure(page);
    await page.addScriptTag({ path: require.resolve('../dashboard/node_modules/axe-core/axe.min.js') });
    const audit = await page.evaluate(async () => {
      const a = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } });
      return { violations: a.violations.map(v => ({ id: v.id, impact: v.impact, description: v.description, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })), incomplete: a.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length })), passes: a.passes.length };
    });
    const screenshot = `after/${route.name}--${view}.png`;
    await page.screenshot({ path: path.join(output, screenshot), animations: 'disabled', caret: 'hide' });
    const keyboard = [];
    // A representative route-wide tab pass; complete interactions are tested in the browser suite.
    await page.evaluate(() => { window.scrollTo(0, 0); document.activeElement?.blur(); });
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    const skipFocusedMain = await page.evaluate(() => document.activeElement?.id === 'content');
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press('Tab');
      const entry = await page.evaluate(() => {
        const e = document.activeElement, r = e.getBoundingClientRect(), s = getComputedStyle(e);
        const wrapper = e.closest('.ui-input-wrapper,.ui-select-wrapper,.lookup-input-wrapper,.ask-composer');
        const w = wrapper ? getComputedStyle(wrapper) : null;
        return { tag: e.tagName, label: e.getAttribute('aria-label') || e.textContent.trim().slice(0, 80), visible: r.width > 0 && r.height > 0 && e.checkVisibility(), focusIndicator: s.outlineStyle !== 'none' || s.boxShadow !== 'none' || !!(w && (w.outlineStyle !== 'none' || w.boxShadow !== 'none')), top: Math.round(r.top), bottom: Math.round(r.bottom) };
      });
      // BODY means Tab has reached the browser chrome on a page with fewer than twelve controls.
      if (entry.tag === 'BODY') break;
      keyboard.push(entry);
    }
    result = { name: route.name, url: route.url, view, width, finalPath: new URL(page.url()).pathname, screenshot, ...values, audit, skipFocusedMain, keyboard, errors };
  } catch (e) { result = { name: route.name, url: route.url, view, errors: [...errors, e.message] }; }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.close();
  return result;
}

(async () => {
  const catalog = await fetch(`${api}/api/workbench/catalog`).then(r => r.json());
  const scope = new URLSearchParams({ releaseId: catalog.release_id, season: catalog.default_season, phase: catalog.default_phase, beforeDate: catalog.default_before_date });
  const prior = JSON.parse(fs.readFileSync('docs/evidence/fo00/before/measurements.json', 'utf8'));
  const books = await fetch(`${api}/api/workbench/operations/finance/books`).then(r => r.json());
  const finance = new URLSearchParams(scope);
  if (books[0]) { finance.set('finance_book_id', books[0].book_id); finance.set('finance_financial_season', '2025-26'); finance.set('finance_known_at', books[0].created_at); finance.set('finance_effective_on', '2025-02-12'); }
  const dynamic = prior.dynamic_samples;
  const overrides = {
    '/compare': `/compare?${scope}&playerA=1630567&playerB=1627742`,
    '/team-compare': `/team-compare?${scope}&teamA=1610612761&teamB=1610612738`,
    '/wowy': `/wowy?${scope}&team_id=TOR&together=1630567`,
    '/stat-line-shift': `/stat-line-shift?${scope}&team_id=TOR&player_id=1630567&together=1627742`,
    '/matchups': `/matchups?${scope}&player_id=1630567&defender_id=1627742`,
    '/roster-shapes': `/roster-shapes?${scope}&team=1610612738`,
    '/last-games': `/last-games?${scope}&playerId=1628389`,
    '/research/trends': `/research/trends?${scope}&playerId=1628389`,
    '/research/distributions': `/research/distributions?${scope}&playerId=1628389`,
    '/contracts': `/contracts?${finance}`, '/contracts/[team]': `/contracts/BOS?${finance}`, '/free-agency': `/free-agency?${finance}`,
    '/research/shooting/aftermath': `/research/shooting/aftermath?${scope}&player_id=1628389`,
  };
  function discover(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? discover(path.join(dir, e.name)) : e.name === 'page.tsx' ? [dir.replace('dashboard/app', '') || '/'] : []);
  }
  const routes = discover('dashboard/app').map(route => ({ name: slug(route), url: overrides[route] || dynamic[route] || (route === '/' ? '/' : `${route}?${scope}`) }));
  routes.push({ name: 'not-found', url: '/fo14-missing-page' }, { name: 'ask-manual', url: '/research/ask?experience=manual' });
  // Keep all FO00 links measurable next to their original screenshots, including redirects.
  for (const old of Object.keys(prior.routes)) {
    const name = slug(old.split('?')[0]);
    if (!routes.some(r => r.name === name)) routes.push({ name, url: old });
  }
  const selected = routes.filter(r => !only || only.includes(r.name));
  fs.mkdirSync(path.join(output, 'after'), { recursive: true });
  const file = path.join(output, 'measurements.json');
  const measurements = only && fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)).measurements.filter(m => !selected.some(r => r.name === m.name) || !views.includes(m.view)) : [];
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium' });
  for (const route of selected) {
    const entries = [];
    // Bound Chromium memory on the owner's active workstation.
    for (let i = 0; i < views.length; i += 2) entries.push(...await Promise.all(views.slice(i, i + 2).map(view => capture(browser, route, view))));
    measurements.push(...entries);
    fs.writeFileSync(file, JSON.stringify({ capturedAt: new Date().toISOString(), base, api, releaseId: catalog.release_id, measurements }, null, 2) + '\n');
    console.log(route.name, entries.map(e => `${e.view}:overflow=${(e.documentWidth || 0)-(e.viewportWidth || 0)},targets=${e.smallTargets?.length},axe=${e.audit?.violations.length},errors=${e.errors.length}`).join(' '));
  }
  await browser.close();
})().catch(e => { console.error(e); process.exitCode = 1; });
