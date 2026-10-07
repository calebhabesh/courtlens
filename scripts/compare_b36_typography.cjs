/* B36 read-only comparison. Fonts stay in an OS temporary directory; only
 * rendered screenshots, source identities and measurements enter the evidence.
 * Usage: node scripts/compare_b36_typography.cjs NEW_EVIDENCE_DIRECTORY
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('../dashboard/node_modules/playwright');

const output = process.argv[2];
assert.ok(output && !fs.existsSync(output), 'New evidence directory required');
fs.mkdirSync(output, { recursive: true });
const site = process.env.B36_SITE_URL || 'http://127.0.0.1:3135';
const api = process.env.B36_API_URL || 'http://127.0.0.1:8000';
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'courtlens-b36-fonts-'));
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
async function bytes(url, bound = 1024 * 1024) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, url);
  const result = Buffer.from(await response.arrayBuffer());
  assert.ok(result.length <= bound, 'Acquisition exceeds byte bound');
  return result;
}
async function json(url) { return JSON.parse(await bytes(url)); }

const candidates = [
  { id: 'existing', label: 'Current · Space Grotesk + IBM Plex Mono' },
  { id: 'switzer-clash', label: 'Switzer UI/data + Clash Grotesk headings', sans: 'switzer', mono: 'switzer', heading: 'clash-grotesk' },
  { id: 'public-sans', label: 'Public Sans · tabular data', sans: 'public-sans', mono: 'public-sans', heading: 'public-sans' },
  { id: 'public-jetbrains', label: 'Public Sans + JetBrains Mono data', sans: 'public-sans', mono: 'jet-brains-mono', heading: 'public-sans' }
];

(async () => {
  let browser;
  try {
    const fonts = [];
    for (const slug of ['switzer', 'clash-grotesk', 'public-sans', 'jet-brains-mono']) {
      const metadataUrl = `https://api.fontshare.com/v2/fonts/slug/${slug}`;
      const metadataBytes = await bytes(metadataUrl);
      const metadata = JSON.parse(metadataBytes).font;
      const style = metadata.styles.find(item => item.is_variable && !item.is_italic);
      assert.ok(style, `Upright variable missing: ${slug}`);
      const url = `https:${style.file}.woff2`;
      const font = await bytes(url);
      assert.equal(font.subarray(0, 4).toString(), 'wOF2');
      fs.writeFileSync(path.join(temporary, slug + '.woff2'), font);
      const axis = metadata.axes.find(item => item.property === 'wght');
      fonts.push({ slug, name: metadata.name, version: metadata.version, license: metadata.license_type,
        metadata_url: metadataUrl, metadata_sha256: hash(metadataBytes), url, bytes: font.length,
        sha256: hash(font), weight: `${axis.range_left} ${axis.range_right}`,
        declared_features: metadata.features.map(item => item.tag) });
    }
    browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    await context.route('**/__b36_fonts/*', async route => {
      const slug = path.basename(new URL(route.request().url()).pathname, '.woff2');
      assert.ok(fonts.some(font => font.slug === slug));
      await route.fulfill({ contentType: 'font/woff2', body: fs.readFileSync(path.join(temporary, slug + '.woff2')) });
    });
    const page = await context.newPage();
    const errors = [], requests = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => { if (request.url().includes('/api/')) requests.push({ method: request.method(), url: request.url() }); });
    const licenseRecords = [];
    const licensePage = await context.newPage();
    for (const license of ['itf-ffl', 'sil-ofl']) {
      await licensePage.goto(`https://www.fontshare.com/licenses/${license}`);
      await licensePage.waitForFunction(() => document.body.innerText.length > 5000);
      const text = await licensePage.locator('body').innerText();
      assert.ok(text.length > 5000, 'License shell is not evidence');
      fs.writeFileSync(path.join(output, `license-${license}.txt`), text);
      licenseRecords.push({ url: `https://www.fontshare.com/licenses/${license}`, sha256: hash(text) });
    }
    await licensePage.close();
    const catalog = await json(api + '/api/workbench/catalog');
    const inventoryBefore = await json(api + '/api/workbench/assistant/investigations?limit=100');
    const saved = inventoryBefore.find(item => item.operations.includes('distribution'));
    assert.ok(saved, 'Retained distribution required');
    const retainedFinance = JSON.parse(fs.readFileSync(path.join(__dirname, '../docs/evidence/b29-finance-query.json'))).cases.corrected.result;
    const pinned = new URLSearchParams({ release_id: catalog.release_id, season: '2023-24', phase: 'regular_season', before_date: '2024-04-15' });
    const financeParams = new URLSearchParams({ finance_book_id: retainedFinance.context.book_id,
      finance_financial_season: '2025-26', finance_known_at: retainedFinance.context.known_at,
      finance_effective_on: '2025-02-12', finance_team_id: '1610612761', season: '2024-25' });
    const routes = [
      { id: 'stats', url: '/stats?' + pinned, ready: 'main table tbody tr' },
      { id: 'scatter', url: '/stats?' + pinned + '&viewMode=scatter', ready: 'main svg' },
      { id: 'finance', url: '/contracts/TOR?' + financeParams, ready: 'main table tbody tr' },
      { id: 'conversation', url: '/investigations/saved/' + saved.id, ready: '.conversation-result' }
    ];
    const measurements = [];
    for (const candidate of candidates) {
      for (const route of routes) {
        process.stdout.write(`${candidate.id} / ${route.id}\n`);
        await page.setViewportSize({ width: 1440, height: 1000 });
        const response = await page.goto(site + route.url);
        assert.equal(response.status(), 200);
        if (route.id === 'conversation') await page.getByRole('heading', { name: saved.title, exact: true }).waitFor();
        else await page.locator(route.ready).first().waitFor();
        if (route.id === 'scatter') assert.ok(await page.getByRole('button', { name: 'Scatter Plot' }).getAttribute('class').then(value => value.includes('active')), 'Scatter must render');
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        const baseline = await page.evaluate(() => ({ family: getComputedStyle(document.body).fontFamily,
          table_width: document.querySelector('main table')?.getBoundingClientRect().width ?? null,
          row_height: document.querySelector('main tbody tr')?.getBoundingClientRect().height ?? null }));
        await page.evaluate(() => {
          window.b36Shifts = [];
          window.b36Observer = new PerformanceObserver(list => {
            for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.b36Shifts.push({ value: entry.value, time: entry.startTime });
          });
          window.b36Observer.observe({ type: 'layout-shift', buffered: false });
        });
        if (candidate.sans) {
          const faces = fonts.map(font => `@font-face {font-family:"B36-${font.slug}";src:url("/__b36_fonts/${font.slug}.woff2") format("woff2");font-style:normal;font-weight:${font.weight};font-display:swap;}`).join('\n');
          await page.addStyleTag({ content: faces + `\nhtml {--font-sans:"B36-${candidate.sans}" !important;--font-mono:"B36-${candidate.mono}" !important;}\nh1,h2,h3 {font-family:"B36-${candidate.heading}",sans-serif !important;}\nmain table {font-variant-numeric:tabular-nums;}\n.font-mono {font-variant-ligatures:none;}` });
          await page.evaluate(async candidate => {
            for (const slug of new Set([candidate.sans, candidate.mono, candidate.heading]))
              for (const weight of [400, 500, 600]) await document.fonts.load(`${weight} 14px "B36-${slug}"`);
            await document.fonts.ready;
          }, candidate);
        }
        await page.waitForTimeout(300);
        const metrics = await page.evaluate(candidate => {
          const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
          const families = candidate.sans ? { ui: `B36-${candidate.sans}`, data: `B36-${candidate.mono}`, heading: `B36-${candidate.heading}` } : {
            ui: getComputedStyle(document.body).fontFamily,
            data: getComputedStyle(document.documentElement).getPropertyValue('--font-mono'),
            heading: getComputedStyle(document.querySelector('h1')).fontFamily };
          const numerals = [];
          const glyphs = [];
          for (const [role, family] of Object.entries(families)) for (const weight of [400, 500, 600]) {
            ctx.font = `${weight} 14px ${family.includes('B36-') ? JSON.stringify(family) : family}`;
            ctx.fontKerning = 'none';
            const widths = Array.from('0123456789', digit => ctx.measureText(digit).width);
            // Canvas does not expose font-variant-numeric; DOM below measures tabular CSS.
            const span = document.createElement('span');
            span.style.cssText = `position:fixed;visibility:hidden;font-family:${family.includes('B36-') ? JSON.stringify(family) : family};font-size:14px;font-weight:${weight};font-variant-numeric:tabular-nums;font-kerning:none`;
            document.body.append(span);
            const tabular = Array.from('0123456789', digit => { span.textContent = digit; return span.getBoundingClientRect().width; });
            span.remove();
            numerals.push({ role, weight, default_widths: widths, tabular_widths: tabular, tabular_spread: Math.max(...tabular) - Math.min(...tabular) });
            if (weight === 400) {
              const missing = [];
              for (const char of new Set('Nikola Jokić Luka Dončić Kristaps Porziņģis Alperen Şengün +−%– 1Il0O −12.5% USD 40,000,000'.replaceAll(' ', ''))) {
                const primary = family.includes('B36-') ? JSON.stringify(family) : family;
                ctx.font = `400 32px ${primary},monospace`;
                const mono = ctx.measureText(char).width;
                ctx.font = `400 32px ${primary},serif`;
                const serif = ctx.measureText(char).width;
                if (Math.abs(mono - serif) > 0.01) missing.push(char);
              }
              glyphs.push({ role, fallback_dependent_characters: missing });
            }
          }
          const table = document.querySelector('main table');
          const shifts = window.b36Shifts;
          window.b36Observer.disconnect();
          return { families, numerals, glyphs, swap_layout_shift_sum: shifts.reduce((sum, entry) => sum + entry.value, 0), shifts,
            body_overflow: document.documentElement.scrollWidth > innerWidth,
            table_width: table?.getBoundingClientRect().width ?? null,
            row_height: document.querySelector('main tbody tr')?.getBoundingClientRect().height ?? null,
            table_rows: document.querySelectorAll('main tbody tr').length,
            samples: Array.from(document.querySelectorAll('main th,main td')).slice(0, 30).map(node => node.textContent),
            glyph_sample: 'Nikola Jokić · Luka Dončić · Kristaps Porziņģis · Alperen Şengün · +−%– · 1Il0O · −12.5% · USD 40,000,000' };
        }, candidate);
        assert.equal(metrics.body_overflow, false);
        const screenshot = `${candidate.id}-${route.id}.png`;
        await page.screenshot({ path: path.join(output, screenshot), fullPage: true });
        if (route.id === 'stats') {
          await page.evaluate(({ sample, families }) => {
            const panel = document.createElement('section');
            panel.id = 'b36-specimen';
            panel.style.cssText = 'padding:24px;background:var(--surface);color:var(--text);width:1000px';
            for (const [role, family] of Object.entries(families)) for (const size of [12, 14, 18]) {
              const line = document.createElement('p');
              line.style.cssText = `font-family:${family.includes('B36-') ? JSON.stringify(family) : family};font-size:${size}px;font-variant-numeric:tabular-nums;font-variant-ligatures:none`;
              line.textContent = `${role} ${size}px · ${sample}`;
              panel.append(line);
            }
            document.querySelector('main').append(panel);
          }, { sample: metrics.glyph_sample, families: metrics.families });
          await page.locator('#b36-specimen').screenshot({ path: path.join(output, `${candidate.id}-glyphs.png`) });
          await page.evaluate(() => document.querySelector('#b36-specimen').remove());
        }
        const sizes = [];
        if (route.id === 'stats') {
          for (const size of [{ id: 'mobile', width: 375, height: 812 }, { id: 'landscape', width: 812, height: 375 }, { id: 'zoom', width: 1440, height: 1000, zoom: '2' }]) {
            await page.setViewportSize({ width: size.width, height: size.height });
            await page.evaluate(zoom => { document.documentElement.style.zoom = zoom || ''; }, size.zoom);
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.waitForTimeout(100);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
            assert.equal(overflow, false, `${candidate.id} ${size.id} body overflow`);
            await page.screenshot({ path: path.join(output, `${candidate.id}-${size.id}.png`), fullPage: true });
            sizes.push({ ...size, body_overflow: overflow });
          }
          await page.evaluate(() => { document.documentElement.style.zoom = ''; });
          await page.keyboard.press('Tab');
          metrics.keyboard_focus = await page.evaluate(() => ({ tag: document.activeElement.tagName, text: document.activeElement.textContent }));
          assert.ok(['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(metrics.keyboard_focus.tag), 'Keyboard focus must reach a control');
        }
        measurements.push({ candidate: candidate.id, route: route.id, url: route.url, baseline, ...metrics, sizes, screenshot });
      }
    }
    const inventoryAfter = await json(api + '/api/workbench/assistant/investigations?limit=100');
    assert.deepEqual(inventoryAfter, inventoryBefore);
    assert.deepEqual(errors, []);
    assert.ok(requests.every(request => request.method === 'GET' || (request.method === 'POST' && new URL(request.url).pathname === '/api/workbench/operations/finance')), 'Unexpected mutation/inference');
    const manifest = { block: 'B36a', recorded_at: new Date().toISOString(), browser: browser.version(), site, api,
      mode: 'Existing B35 production build; read-only real retained data; isolated browser CSS font comparison',
      candidates, fonts, licenses: licenseRecords, measurements, requests, page_errors: errors,
      saved_inventory_unchanged: true, release_id: catalog.release_id,
      limits: ['No owner selection or application font change', 'Font-swap shift is an isolated post-hydration experiment, not production CLS',
        'Responsive and keyboard measurements bounded to Stats', 'Screenshots require owner readability review', 'Final local-font packaging and cold-load CLS remain pending'] };
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify(manifest, null, 2) + '\n');
    const panels = [...routes, { id: 'glyphs' }, { id: 'mobile' }, { id: 'zoom' }].map(route => `<h2>${route.id}</h2><div class="grid">${candidates.map(candidate => `<figure><figcaption>${candidate.label}</figcaption><a href="${candidate.id}-${route.id}.png"><img src="${candidate.id}-${route.id}.png" alt="${candidate.label}, ${route.id}" loading="lazy"></a></figure>`).join('')}</div>`).join('');
    fs.writeFileSync(path.join(output, 'index.html'), `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>CourtLens B36 font comparison</title><style>body{margin:24px;background:#20252e;color:#f1f3f6;font:16px system-ui}a{color:#ffd166}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:0}figcaption{padding:12px 0}img{width:100%;border:1px solid #465160}@media(max-width:800px){.grid{grid-template-columns:1fr}}</style><h1>B36 typography comparison</h1><p>Real retained data, same density and colors. Click images for full resolution. Application fonts remain unchanged. Screenshots contain rendered text only; no font binaries are distributed.</p><p><a href="verification.json">Measurements and source hashes</a></p>${panels}</html>\n`);
  } finally {
    if (browser) await browser.close();
    fs.rmSync(temporary, { recursive: true, force: true });
  }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
