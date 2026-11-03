/* Read-only live verification. Start a sandbox dashboard/API on 3180/4180 first. */
const { chromium, expect } = require('../dashboard/node_modules/@playwright/test');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

async function main() {
  const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3180';
  if ([3100, 8000].includes(Number(new URL(base).port))) throw new Error('Use a sandbox port');
  const output = path.resolve(process.env.EVIDENCE_DIR || 'docs/evidence/alignment/players/reference-v2');
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const report = { base, widths: [], errors: [] };
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 1000 : 844 } });
      page.on('pageerror', error => report.errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
      await page.goto(`${base}/players/202695`, { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { level: 1, name: 'Kawhi Leonard' })).toBeVisible();
      const contract = page.getByRole('region', { name: 'Contract', exact: true });
      await expect(contract.getByRole('table', { name: 'Current contract salaries' })).toContainText('$50,300,000');
      await expect(contract).toContainText('30.5%');
      await expect(contract).toContainText('Player option');
      await expect(contract).toContainText('Sep 14, 2026');
      await expect(page.getByRole('region', { name: 'Career highs table' })).toContainText('Playoffs');
      await page.screenshot({ path: path.join(output, `leonard-${width}.png`), fullPage: true });
      await contract.screenshot({ style: ".ui-filter-bar { visibility: hidden !important; }", path: path.join(output, `contract-${width}.png`) });
      await contract.locator('summary').click();
      await expect(contract.getByRole('table', { name: 'Reported salary history' })).toBeVisible();
      await contract.screenshot({ style: ".ui-filter-bar { visibility: hidden !important; }", path: path.join(output, `salary-history-${width}.png`) });
      const measured = { width, pageWidth: await page.evaluate(() => document.documentElement.scrollWidth), sourceCredits: await page.locator('.player-reference-credit a').count(), contractText: await contract.innerText() };
      measured.playerCountingHeight = await page.getByRole('radiogroup', { name: 'Counting Mode', exact: true }).evaluate(el => el.getBoundingClientRect().height);
      expect(measured.playerCountingHeight).toBe(width === 1440 ? 32 : 48);
      expect(measured.pageWidth).toBe(width);
      expect(measured.sourceCredits).toBe(3);
      await page.goto(`${base}/players/1628366`, { waitUntil: 'networkidle' });
      await expect(page.locator('.player-bio-identity')).toContainText('Last with Cleveland Cavaliers');
      await page.locator('.player-bio-header').screenshot({ path: path.join(output, `last-with-${width}.png`) });
      await page.goto(`${base}/stats?name=Kawhi`, { waitUntil: 'networkidle' });
      const chip = page.locator('.stats-team-move').first();
      await expect(chip).toHaveAttribute('title', /Index refreshed .+\. Traded Sep 14, 2026 \(Basketball-Reference\)/);
      measured.tooltip = await chip.getAttribute('title');
      measured.statsCountingHeight = await page.getByRole('radiogroup', { name: 'Counting Mode', exact: true }).evaluate(el => el.getBoundingClientRect().height);
      expect(measured.statsCountingHeight).toBe(width === 1440 ? 32 : 48);
      await page.screenshot({ path: path.join(output, `stats-trade-${width}.png`), fullPage: true });
      report.widths.push(measured);
      await page.close();
    }
    expect(report.errors).toEqual([]);
    writeFileSync(path.join(output, 'browser-verification.json'), `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ widths: report.widths.map(({ width, pageWidth, sourceCredits, tooltip }) => ({ width, pageWidth, sourceCredits, tooltip })), errors: report.errors })}\n`);
  } finally {
    await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
