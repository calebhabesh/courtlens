/* Shared-header geometry and all template loading states, without invoking a provider or writing data. */
const { chromium } = require('../dashboard/node_modules/playwright');
const fs = require('node:fs');
const base = process.env.FO14_FIXTURE_URL || 'http://localhost:3102';
const dir = 'docs/evidence/fo14/states';
(async () => {
  fs.mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium' });
  const records = [];
  try {
    for (const width of [1280, 1440, 1920, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(base + '/stats');
      await page.waitForLoadState('networkidle');
      const header = await page.evaluate(() => {
        const r = document.querySelector('.courtlens-search-pill').getBoundingClientRect();
        return { visible: r.width > 0, offset: r.width ? r.x + r.width / 2 - innerWidth / 2 : null, width: r.width };
      });
      await page.keyboard.press('Control+k');
      await page.getByRole('dialog').waitFor();
      await page.screenshot({ path: `${dir}/search-${width}.png`, animations: 'disabled' });
      const modal = await page.getByRole('dialog').evaluate(e => {
        const r = e.getBoundingClientRect();
        return { width: r.width, offset: r.x + r.width / 2 - innerWidth / 2 };
      });
      await page.keyboard.press('Escape');
      await page.getByRole('dialog').waitFor({ state: 'hidden' });
      if (width < 1280) {
        await page.getByRole('button', { name: 'Toggle navigation drawer' }).focus();
        await page.keyboard.press('Enter');
        await page.getByRole('dialog').waitFor();
        await page.screenshot({ path: `${dir}/navigation-${width}.png`, animations: 'disabled' });
        await page.keyboard.press('Escape');
        await page.getByRole('dialog').waitFor({ state: 'hidden' });
      }
      records.push({ state: 'header/search', width, header, modal });
      await page.close();
    }
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 } });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(base + '/design');
      await page.waitForLoadState('networkidle');
      const controls = page.getByRole('radiogroup', { name: 'Skeleton template' });
      for (const template of ['Explorer', 'Profile', 'Compare', 'Board', 'Research', 'Article']) {
        await controls.getByRole('radio', { name: template, exact: true }).click();
        const skeleton = page.getByRole('status', { name: 'Loading', exact: true });
        await skeleton.screenshot({ path: `${dir}/loading-${template.toLowerCase()}-${width}.png`, animations: 'disabled' });
        const geometry = await skeleton.evaluate(e => ({ width: Math.round(e.getBoundingClientRect().width), filters: !!e.querySelector('.ui-skeleton-filters'), tocDirection: e.querySelector('.ui-skeleton-article-toc') ? getComputedStyle(e.querySelector('.ui-skeleton-article-toc')).flexDirection : null }));
        records.push({ state: `loading-${template.toLowerCase()}`, width, geometry });
      }
      await page.close();
    }
    // Hold the query so the route's own skeleton and failure recovery are captured together.
    for (const width of [1440, 768, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
      let failRequest;
      await page.route('**/api/workbench/operations/similarity', route => new Promise(resolve => {
        failRequest = async () => {
          await route.fulfill({ status: 503, json: { detail: 'FO14 retained query unavailable' } });
          resolve();
        };
      }));
      await page.goto(base + '/research/similarity?playerId=23&season=2025-26&phase=regular_season');
      const loading = page.getByRole('status', { name: 'Matching peers', exact: true });
      await loading.waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${dir}/similarity-loading-${width}.png`, animations: 'disabled' });
      records.push({ state: 'similarity-loading', width, skeletons: await loading.locator('[data-skeleton]').count() });
      await failRequest();
      const retry = page.getByRole('button', { name: 'Retry', exact: true });
      await retry.waitFor();
      await page.screenshot({ path: `${dir}/similarity-error-${width}.png`, animations: 'disabled' });
      records.push({ state: 'similarity-error', width, retry: await retry.boundingBox() });
      await page.close();
    }
  } finally { await browser.close(); }
  fs.writeFileSync(`${dir}/measurements.json`, JSON.stringify(records, null, 2) + '\n');
  console.log(`${records.length} states measured`);
})().catch(error => { console.error(error); process.exitCode = 1; });
