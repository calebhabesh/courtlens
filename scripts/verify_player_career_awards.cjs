/* Read-only awards layout verification against a sandbox dashboard, with fixture or local data. */
const { chromium, expect } = require('../dashboard/node_modules/@playwright/test');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

async function main() {
  const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3180';
  if ([3100, 8000].includes(Number(new URL(base).port))) throw new Error('Use a sandbox port');
  const before = process.env.VERIFY_BEFORE === '1';
  const output = path.resolve(process.env.EVIDENCE_DIR || 'docs/evidence/alignment/players/career-awards');
  const playerId = process.env.PLAYER_ID || '202695';
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const report = { playerId, before, widths: [], errors: [] };
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 844 }, reducedMotion: 'reduce' });
      page.on('pageerror', error => report.errors.push(error.message));
      await page.goto(`${base}/players/${playerId}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.fonts.status === 'loaded');
      const scroll = page.getByRole('region', { name: 'Career table scroll area' });
      await expect(scroll).toHaveAttribute('aria-busy', 'false');
      if (!before) {
        await expect(scroll.locator('.stats-header-tier-1').getByRole('columnheader', { name: 'Awards', exact: true })).toHaveText('Awards');
        await expect(scroll.locator('.stats-header-tier-2').getByRole('columnheader', { name: 'Accolades', exact: true })).toHaveCount(1);
      }
      await page.screenshot({ path: path.join(output, `player-${width}.png`), fullPage: true });
      await scroll.scrollIntoViewIfNeeded();
      await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      const row = scroll.locator('tbody .player-career-row').filter({ has: page.locator('.player-career-award') }).first();
      const awardCell = row.locator('td').last();
      const resting = await awardCell.evaluate(el => getComputedStyle(el).backgroundColor);
      await awardCell.hover();
      const measured = await scroll.evaluate(el => {
        const tableRight = el.querySelector('table').getBoundingClientRect().right;
        return [...el.querySelectorAll('tbody .player-career-row')].map(row => {
          const cell = row.lastElementChild;
          const rect = cell.getBoundingClientRect();
          const badges = [...cell.querySelectorAll('.player-career-award')];
          return { season: row.firstElementChild.textContent.trim(), width: rect.width, height: rect.height,
            lines: new Set(badges.map(badge => Math.round(badge.getBoundingClientRect().top))).size,
            labels: badges.map(badge => badge.querySelector('[aria-hidden]')?.textContent || badge.textContent),
            contained: badges.every(badge => { const r = badge.getBoundingClientRect(); return r.left >= rect.left && r.right <= rect.right && r.top >= rect.top && r.bottom <= rect.bottom; }),
            tableEdgeGap: tableRight - rect.right };
        });
      });
      const hover = await awardCell.evaluate(el => getComputedStyle(el).backgroundColor);
      const metricHover = await row.locator('td[data-column]').last().evaluate(el => getComputedStyle(el).backgroundColor);
      const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      if (!before) {
        expect(measured.length).toBeGreaterThan(0);
        expect(measured.every(row => row.contained && Math.abs(row.tableEdgeGap) < 1)).toBe(true);
        expect(measured.some(row => row.lines === 2)).toBe(true);
        expect(hover).toBe(metricHover);
        expect(hover).not.toBe(resting);
        expect(pageWidth).toBe(width);
      }
      await page.locator('.player-career').screenshot({ path: path.join(output, `career-${width}.png`), animations: 'disabled',
        style: '.ui-filter-bar { visibility: hidden !important; }' });
      report.widths.push({ width, pageWidth, resting, hover, metricHover, rows: measured });
      await page.close();
    }
    expect(report.errors).toEqual([]);
    writeFileSync(path.join(output, 'browser-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
