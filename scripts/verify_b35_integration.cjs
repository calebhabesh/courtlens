/* Read-only real-service content/navigation and packaged-asset acceptance.
 * Usage: node scripts/verify_b35_integration.cjs NEW_EVIDENCE_DIRECTORY
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require('../dashboard/node_modules/playwright');
const output = process.argv[2];
if (!output || fs.existsSync(output)) throw new Error('New evidence directory required');
fs.mkdirSync(output, { recursive: true });
const site = process.env.B35_SITE_URL || 'http://127.0.0.1:3135';
const api = process.env.B35_API_URL || 'http://127.0.0.1:8000';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const page = await browser.newPage();
  const errors = [], failed = [], assets = new Map(), links = new Set(), pages = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => failed.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (response.url().includes('/_next/static/')) assets.set(response.url(), response.status()); });
  try {
    const config = await (await fetch(api + '/api/workbench/assistant/status')).json();
    assert.equal(config.configured, false, 'Run the verification API with Gemini disabled');
    for (const route of ['/methodology', '/learning', '/blog', '/patch-notes', '/settings', '/investigations']) {
      const response = await page.goto(site + route);
      assert.equal(response.status(), 200);
      await page.locator('main h1').waitFor();
      // Wait for actual local state, including client-rendered evidence inventory.
      if (route === '/investigations') await page.getByRole('region', { name: 'Legacy saved investigations' }).waitFor();
      if (route === '/settings') await page.getByRole('heading', { name: 'Install CourtLens' }).waitFor();
      const destinations = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => node.href));
      for (const url of destinations) if (new URL(url).origin === site) links.add(url);
      pages.push({ route, heading: await page.locator('main h1').innerText(), local_links: destinations.filter(url => new URL(url).origin === site).length });
    }
    const catalog = await (await fetch(api + '/api/workbench/catalog')).json();
    const pinned = new URLSearchParams({ release_id: catalog.release_id, season: '2023-24', phase: 'regular_season', before_date: '2024-04-15' });
    await page.goto(site + '/methodology?' + pinned);
    const menuLinks = [];
    for (const name of ['Live', 'Players', 'Teams', 'Compare', 'Research', 'Help']) {
      await page.getByRole('navigation', { name: 'Workspace Navigation' }).getByRole('button', { name, exact: true }).click();
      await page.getByRole('menu').waitFor();
      const destinations = await page.getByRole('menuitem').evaluateAll(nodes => nodes.filter(node => node.tagName === 'A').map(node => node.href));
      assert.ok(destinations.length > 0);
      for (const url of destinations) {
        const target = new URL(url);
        for (const [key, value] of pinned) assert.equal(target.searchParams.get(key), value, url);
        links.add(url);
        menuLinks.push({ menu: name, url });
      }
      await page.keyboard.press('Escape');
    }
    const checkedLinks = [];
    const analyticalLinks = [];
    for (const url of [...links].sort()) {
      const response = await fetch(url);
      assert.equal(response.status, 200, url);
      checkedLinks.push({ url, status: response.status, final_url: response.url });
      const target = new URL(url);
      if (target.pathname === '/players' || target.pathname === '/stats') {
        const endpoint = new URL('/api/workbench/players', api);
        endpoint.search = target.search;
        const analytical = await fetch(endpoint);
        assert.equal(analytical.status, 200, endpoint.href);
        const data = await analytical.json();
        analyticalLinks.push({ url, api_url: endpoint.href, status: analytical.status, rows: data.items?.length ?? null });
      }
    }
    const packagedAssets = [];
    assert.ok(assets.size > 0);
    for (const [url, status] of assets) {
      assert.equal(status, 200, url);
      const response = await fetch(url);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.ok(bytes.length > 0);
      packagedAssets.push({ path: new URL(url).pathname, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), cache_control: response.headers.get('cache-control') });
    }
    const manifest = await (await fetch(site + '/manifest.webmanifest')).json();
    for (const icon of manifest.icons) {
      const response = await fetch(site + icon.src);
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(bytes.subarray(1, 4).toString(), 'PNG');
      assert.equal(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`, icon.sizes);
      packagedAssets.push({ path: icon.src, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') });
    }
    assert.deepEqual(errors, []);
    const cancelledRsc = failed.filter(request => request.error === 'net::ERR_ABORTED' && new URL(request.url).searchParams.has('_rsc'));
    assert.deepEqual(failed.filter(request => !cancelledRsc.includes(request)), []);
    fs.writeFileSync(path.join(output, 'verification.json'), JSON.stringify({ block: 'B35c', recorded_at: new Date().toISOString(), status: 'passed', site, api, pages, analytical_links: analyticalLinks, pinned_navigation_links: menuLinks, checked_links: checkedLinks, assets: packagedAssets, page_errors: errors, failed_requests: failed.filter(request => !cancelledRsc.includes(request)), cancelled_rsc_requests: cancelledRsc, ai_configured: config.configured, limits: ['Linked destinations HTTP-checked; detailed feature behavior uses its separately recorded block evidence', 'Live view not hydrated; no new live source acquisition', 'No provider inference'] }, null, 2) + '\n');
    process.stdout.write(JSON.stringify({ pages: pages.length, local_links: checkedLinks.length, assets: packagedAssets.length, page_errors: errors.length }) + '\n');
  } finally { await browser.close(); }
})().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
