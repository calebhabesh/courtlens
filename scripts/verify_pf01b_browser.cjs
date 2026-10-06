/* Production UI verification against real API values; no application mutation. */
const { chromium, expect } = require('../dashboard/node_modules/@playwright/test');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const base = process.env.PF01B_DASHBOARD_URL || 'http://127.0.0.1:3152';
const api = process.env.PF01B_API_URL || 'http://127.0.0.1:8000';
const out = 'docs/evidence/pf01b-dashboard';
(async () => {
  const catalog = await (await fetch(`${api}/api/workbench/catalog`)).json();
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const report = { environment: 'Production Next webpack; real FastAPI/PostgreSQL', viewport: [1440,900], checks: [] };
  async function waitTable() { await page.locator('.dense-stats-table tbody tr').first().waitFor(); }
  async function expected(field, limit = 25, cursor = null, name = null, player_ids = null) {
    const query = { release_id: catalog.release_id, season: catalog.default_season, phase: catalog.default_phase,
      before_date: catalog.default_before_date, window: { kind: 'season' }, sort: [{ field, direction: 'desc' }],
      page: { limit, cursor }, name };
    const response = await fetch(`${api}/api/workbench/query`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, presentation: { player_ids } }) });
    assert.equal(response.status, 200);
    return response.json();
  }
  async function verifyRows(data, field, label) {
    await waitTable();
    const select = page.getByLabel('Sort table by metric');
    await select.waitFor();
    await expect(select).toHaveValue(field);
    await expect(page.locator('.stats-results-meta')).toContainText(field.toUpperCase());
    const headers = await page.locator('.dense-stats-table thead tr').last().locator('th').allTextContents();
    const index = headers.findIndex(text => text.trim().startsWith(label));
    assert(index >= 0, `Missing column ${label}: ${headers}`);
    const rows = page.locator('.dense-stats-table tbody tr');
    assert.equal(await rows.count(), data.items.length);
    for (let i = 0; i < data.items.length; i++) {
      const row = rows.nth(i), item = data.items[i];
      assert((await row.locator('td').nth(2).innerText()).includes(item.player_name));
      assert.equal(Number(await row.locator('td').nth(1).innerText()), data.output_offset + i + 1);
      const cell = row.locator('td').nth(index);
      assert.equal(Number((await cell.locator('.stat-main-value').innerText()).replaceAll(',', '')), item.metrics[field]);
      assert.equal(Number(await cell.locator('.stat-pct-sublabel').innerText()), item.percentiles[field]);
    }
    report.checks.push({ field, rows: data.items.length, offset: data.output_offset, eligible: data.total_eligible_players, output: data.total_output_players });
  }
  const params = new URLSearchParams({ releaseId: catalog.release_id, season: catalog.default_season, phase: catalog.default_phase, beforeDate: catalog.default_before_date, limit: '25' });
  await page.goto(`${base}/stats`);
  await waitTable();
  const resolvedUrl = new URL(page.url());
  for (const [key, value] of Object.entries({ releaseId: catalog.release_id, season: catalog.default_season, phase: catalog.default_phase, beforeDate: catalog.default_before_date, window: 'season', countingMode: 'per_game' })) assert.equal(resolvedUrl.searchParams.get(key), value);
  report.checks.push({ defaults_bound_to_url: true });
  await page.goto(`${base}/players?${params}`);
  await expect(page.getByRole('heading', { name: 'Player Explorer', exact: true })).toBeVisible();
  await verifyRows(await expected('pts_per_game'), 'pts_per_game', 'PPG');
  report.checks.push({ players_shared_contract: true });
  await page.goto(`${base}/stats?${params}`);
  let data = await expected('pts_per_game');
  await verifyRows(data, 'pts_per_game', 'PPG');
  assert((await page.locator('.context-sample').innerText()).includes(`${data.total_eligible_players} eligible players`));
  await page.screenshot({ path: `${out}/stats-desktop.png`, fullPage: true });
  for (const [width, height, label] of [[2560,1440,'wide'],[375,812,'mobile']]) {
    await page.setViewportSize({ width, height });
    await page.screenshot({ path: `${out}/stats-${label}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  report.screenshot_viewports = [[1440,900],[2560,1440],[375,812]];

  await page.getByRole('button', { name: 'Next Page →', exact: true }).click();
  await page.waitForURL(/cursor=/);
  await verifyRows(await expected('pts_per_game', 25, data.next_cursor), 'pts_per_game', 'PPG');
  await page.getByRole('button', { name: 'Totals', exact: true }).click();
  await page.waitForURL(/countingMode=raw/);
  await verifyRows(await expected('pts'), 'pts', 'PTS');
  await page.getByRole('button', { name: 'Per 36', exact: true }).click();
  await page.waitForURL(/countingMode=per_36/);
  await verifyRows(await expected('pts_per_36'), 'pts_per_36', 'PTS/36');
  await page.getByRole('button', { name: 'Per Game', exact: true }).click();
  await page.waitForURL(/countingMode=per_game/);
  await verifyRows(await expected('pts_per_game'), 'pts_per_game', 'PPG');
  await page.getByLabel('Results per page').selectOption('100');
  await page.waitForURL(/limit=100/);
  await verifyRows(await expected('pts_per_game', 100), 'pts_per_game', 'PPG');
  const name = data.items[0].player_name;
  await page.getByLabel('Filter players by name').fill(name);
  await page.getByLabel('Filter players by name').press('Enter');
  await page.waitForURL(/name=/);
  await verifyRows(await expected('pts_per_game', 100, null, name), 'pts_per_game', 'PPG');
  await page.goto(`${base}/stats?${params}&favorites=1`);
  const workspace = await (await fetch(`${api}/api/workbench/workspace`)).json();
  const favorites = await expected('pts_per_game', 25, null, null, workspace.favorites);
  await page.locator('.stats-results-meta').waitFor();
  assert((await page.locator('.stats-results-meta').innerText()).includes(`${favorites.total_output_players} matching players`));
  if (favorites.items.length) await verifyRows(favorites, 'pts_per_game', 'PPG');
  else assert((await page.locator('.dense-stats-table tbody').innerText()).includes('No players'));
  report.checks.push({ favorites: workspace.favorites, matching: favorites.total_output_players, eligible: favorites.total_eligible_players });
  await page.screenshot({ path: `${out}/stats-favorites.png`, fullPage: true });
  await page.getByRole('button', { name: /Favorites/ }).click();
  await page.waitForURL(url => !url.searchParams.has('favorites'));
  await verifyRows(await expected('pts_per_game'), 'pts_per_game', 'PPG');
  await page.getByRole('button', { name: /Favorites/ }).click();
  await page.waitForURL(/favorites=1/);
  if (favorites.items.length) await verifyRows(favorites, 'pts_per_game', 'PPG');
  await page.goto(`${base}/stats?${params}&favorites=1&name=no-such-player-pf01b`);
  await expect(page.locator('.stats-results-meta')).toContainText(`0 matching players · ${favorites.total_eligible_players} eligible players`);
  report.checks.push({ favorites_toggle_and_empty_output: true });

  await page.goto(`${base}/stats?${params}`);
  await waitTable();
  await page.getByLabel('Before date cutoff').fill('2025-11-01');
  await page.getByLabel('Before date cutoff').press('Enter');
  await page.waitForURL(/beforeDate=2025-11-01/);
  await page.goBack();
  await expect(page.getByLabel('Before date cutoff')).toHaveValue(catalog.default_before_date);
  await page.goForward();
  await expect(page.getByLabel('Before date cutoff')).toHaveValue('2025-11-01');
  await page.getByLabel('Filter by season').selectOption('2023-24');
  await page.waitForURL(/season=2023-24/);
  const prior = catalog.stats_scopes.find(s => s.season === '2023-24' && s.phase === catalog.default_phase);
  assert.equal(await page.getByLabel('Before date cutoff').inputValue(), prior.default_before_date);
  report.checks.push({ context_back_forward: true, season_default_cutoff: prior.default_before_date });
  await page.getByLabel('Filter by competition phase').selectOption('playoffs');
  await page.waitForURL(/phase=playoffs/);
  const playoffs = catalog.stats_scopes.find(s => s.season === '2023-24' && s.phase === 'playoffs');
  await expect(page.getByLabel('Before date cutoff')).toHaveValue(playoffs.default_before_date);
  await page.getByLabel('Analysis window').selectOption('last_5');
  await page.waitForURL(/window=last_5/);
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.waitForURL(/\/settings/);
  const navigated = new URL(page.url());
  assert.equal(navigated.searchParams.get('releaseId'), catalog.release_id);
  assert.equal(navigated.searchParams.get('season'), '2023-24');
  assert.equal(navigated.searchParams.get('phase'), 'playoffs');
  assert.equal(navigated.searchParams.get('beforeDate'), playoffs.default_before_date);
  assert.equal(navigated.searchParams.get('window'), 'last_5');
  report.checks.push({ phase_default_cutoff: playoffs.default_before_date, navigation_context: true });

  await page.goto(`${base}/stats?season=1999-00&phase=preseason&window=date_range`);
  assert.equal(await page.getByLabel('Filter by season').inputValue(), '1999-00');
  assert.equal(await page.getByLabel('Filter by competition phase').inputValue(), 'preseason');
  assert.equal(await page.getByLabel('Analysis window').inputValue(), 'date_range');
  assert((await page.locator('.notice-box').innerText()).includes('No observed Stats coverage'));
  report.checks.push({ unsupported_selection_preserved: true });
  await page.goto(`${base}/compare?playerA=1629029&playerB=203999&${params}&window=last_5`);
  const form = page.locator('form.compare-controls');
  await form.waitFor();
  for (const [key, value] of params) {
    if (key === 'limit') continue;
    assert.equal(await form.locator(`input[name="${key}"]`).inputValue(), value);
  }
  await page.getByRole('button', { name: 'Compare players', exact: true }).click();
  await page.waitForURL(url => url.searchParams.get('window') === 'last_5' && url.searchParams.has('snapshotId'));
  assert.equal(new URL(page.url()).searchParams.get('beforeDate'), catalog.default_before_date);
  report.checks.push({ comparison_form_context: true });
  assert.deepEqual(errors, []);
  report.page_errors = errors;
  fs.writeFileSync(`${out}/browser.json`, JSON.stringify(report, null, 2) + '\n');
  await browser.close();
  console.log(JSON.stringify(report));
})().catch(error => { console.error(error); process.exit(1); });
