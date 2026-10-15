/* Read-only visual checks for the player page's five glass sections below the career table. */
const { chromium, expect } = require('../dashboard/node_modules/@playwright/test');
const { mkdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');

function glassContrast(tokens) {
  const rgb = hex => [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16) / 255);
  const luminance = color => color.map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
  const [r, g, b] = rgb(tokens['--color-bg']);
  const saturation = 1.5;
  const saturated = [
    (0.213 + 0.787 * saturation) * r + (0.715 - 0.715 * saturation) * g + (0.072 - 0.072 * saturation) * b,
    (0.213 - 0.213 * saturation) * r + (0.715 + 0.285 * saturation) * g + (0.072 - 0.072 * saturation) * b,
    (0.213 - 0.213 * saturation) * r + (0.715 - 0.715 * saturation) * g + (0.072 + 0.928 * saturation) * b
  ].map(value => Math.max(0, Math.min(1, value)));
  const tint = rgb(tokens['--color-surface-0']);
  return Object.entries({ filtered: saturated, fallback: [r, g, b] }).map(([mode, backdrop]) => {
    const background = luminance(backdrop.map((value, index) => tint[index] * 0.58 + value * 0.42));
    return { mode, ratios: Object.fromEntries(Object.entries(tokens).filter(([token]) => !['--color-bg', '--color-surface-0'].includes(token)).map(([token, hex]) => {
      const text = luminance(rgb(hex));
      return [token, (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05)];
    })) };
  });
}

async function main() {
  const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3180';
  if ([3100, 8000].includes(Number(new URL(base).port))) throw new Error('Use a sandbox port');
  const playerId = process.env.PLAYER_ID || '202695';
  const output = path.resolve(process.env.EVIDENCE_DIR || 'docs/evidence/alignment/players/overview-glass');
  mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const report = { playerId, widths: [], errors: [] };
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 1440 ? 900 : 844 }, reducedMotion: 'reduce' });
      page.on('pageerror', error => report.errors.push(error.message));
      await page.goto(`${base}/players/${playerId}`, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => document.fonts.status === 'loaded');
      const panels = page.locator('.player-open-section.player-glass');
      await expect(panels).toHaveCount(5);
      await expect(panels.locator('h2')).toHaveText(['Player Impact', 'Recent Form', 'Contract', 'Transactions', 'Career Highs']);
      await expect(panels.locator('h3')).toHaveText(['Current Contract', 'Contract Events']);
      const measured = await page.evaluate(() => {
        const appearance = el => {
          const s = getComputedStyle(el);
          return { fill: s.backgroundColor, image: s.backgroundImage, border: s.borderTopColor,
            radius: s.borderRadius, shadow: s.boxShadow, backdrop: s.backdropFilter };
        };
        const tokens = ['--color-bg', '--color-surface-0', '--color-text', '--color-text-secondary', '--color-accent', '--color-info',
          '--color-status-player-option', '--color-status-team-option', '--color-percentile-text-high', '--color-percentile-text-low'];
        const root = getComputedStyle(document.documentElement);
        return { pageWidth: document.documentElement.scrollWidth,
          colors: Object.fromEntries(tokens.map(token => [token, root.getPropertyValue(token).trim()])),
          headline: appearance(document.querySelector('.player-summary-stat')),
          panels: [...document.querySelectorAll('.player-open-section.player-glass')].map(el => ({
            heading: el.querySelector('h2').textContent, appearance: appearance(el), padding: getComputedStyle(el).padding,
            width: el.getBoundingClientRect().width, nestedGlass: el.querySelectorAll('.player-glass').length,
            contentFilter: getComputedStyle(el.querySelector('h2')).filter,
            overflow: [...el.querySelectorAll('.player-reference-table, .player-form-table')].map(table => ({ client: table.clientWidth, scroll: table.scrollWidth }))
          })) };
      });
      measured.contrast = glassContrast(measured.colors);
      expect(measured.contrast.every(scenario => Object.values(scenario.ratios).every(ratio => ratio >= 4.5))).toBe(true);
      expect(measured.pageWidth).toBe(width);
      for (const panel of measured.panels) {
        expect(panel.appearance).toEqual(measured.headline);
        expect(panel.appearance.image).toBe('none');
        expect(panel.appearance.backdrop).toBe('blur(20px) saturate(1.5)');
        expect(panel.padding).toBe(width === 1440 ? '20px' : '16px');
        expect(panel.nestedGlass).toBe(0);
        expect(panel.contentFilter).toBe('none');
      }
      await page.screenshot({ path: path.join(output, `player-${width}.png`), fullPage: true });
      await page.locator('.player-overview-duo').screenshot({ path: path.join(output, `impact-form-${width}.png`),
        style: '.ui-filter-bar { visibility: hidden !important; }' });
      const contract = page.getByRole('region', { name: 'Contract', exact: true });
      await contract.locator('summary').click();
      await expect(page.getByRole('table', { name: 'Reported salary history' })).toBeVisible();
      const earlier = page.getByRole('region', { name: 'Transactions', exact: true }).locator('summary');
      if (await earlier.count()) await earlier.click();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
      measured.expandedPageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      report.widths.push({ width, ...measured });
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
