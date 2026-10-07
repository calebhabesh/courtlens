// Run from the repository root after restoring and migrating the CourtLens stack.
const { chromium, expect } = require('../../../dashboard/node_modules/@playwright/test');
const fs = require('node:fs');
const assert = require('node:assert/strict');

(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const report = { checks: [], errors: [], dashboard: 'http://127.0.0.1:3100' };
    page.on('pageerror', error => report.errors.push(error.message));
    const response = await page.request.get(
      'http://127.0.0.1:8000/api/workbench/players?season=2025-26&limit=5'
    );
    assert(response.ok());
    const data = await response.json();
    assert.equal(data.context.release_id, '5bbb6035-6794-4bb0-b894-7208f52ef7ad');
    assert.equal(data.context.dataset_id, '17251a08-a4eb-4f46-b356-999fcf37c65d');
    assert(data.total_eligible_players > 0);
    assert(data.items.length === 5);
    report.release_id = data.context.release_id;
    report.dataset_id = data.context.dataset_id;
    report.eligible_players = data.total_eligible_players;
    report.leading_player = { name: data.items[0].player_name, games: data.items[0].games_played };
    report.checks.push('Real API returns five admitted players from the retained release');

    await page.goto(report.dashboard + '/stats?season=2025-26&limit=25');
    await expect(page.locator('.stats-table-row').first()).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.brand-title')).toHaveText('CourtLens');
    const rows = page.locator('.stats-table-row');
    report.visible_rows = await rows.count();
    assert(report.visible_rows > 0);
    // Bound the browser's rendered content to an actual API player, without any request mocks.
    await expect(page.locator('body')).toContainText(data.items[0].player_name);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: 'docs/evidence/rn02/stats-desktop.png', fullPage: true });
    report.checks.push('Desktop Stats renders actual admitted rows and the CourtLens name');

    await page.setViewportSize({ width: 375, height: 812 });
    await expect(rows.first()).toBeVisible();
    await page.screenshot({ path: 'docs/evidence/rn02/stats-mobile.png', fullPage: true });
    report.checks.push('Mobile Stats retains the actual table');

    await page.goto(report.dashboard + '/players/1629029?season=2025-26');
    await expect(page.getByRole('heading', { name: /Luka Dončić/ })).toBeVisible({ timeout: 30000 });
    report.checks.push('Real player detail loads through the container-to-container API URL');
    assert.deepEqual(report.errors, []);
    fs.writeFileSync('docs/evidence/rn02/browser.json', JSON.stringify(report, null, 2) + '\n');
    console.log(report);
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
