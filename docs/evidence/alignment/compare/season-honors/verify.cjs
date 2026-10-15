// From dashboard/: node ../docs/evidence/alignment/compare/season-honors/verify.cjs
// Point COURTLENS_VERIFY_BASE_URL at the production sandbox and its read-only live API proxy.
const { chromium, expect } = require(require('node:path').resolve(process.cwd(), 'node_modules/@playwright/test'));
const { writeFileSync } = require('node:fs');
const { join } = require('node:path');
const base = process.env.COURTLENS_VERIFY_BASE_URL || 'http://127.0.0.1:3180';
const current = '/compare?playerA=1629029&playerB=1628983&season=2025-26&phase=regular_season&beforeDate=2026-04-13';
const historical = '/compare?playerA=201142&playerB=2544&season=2016-17&phase=regular_season&beforeDate=2017-07-01';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const results = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const open = async path => {
        await page.goto(base + path);
        await expect(page.getByRole('table', { name: 'Descriptive comparison' })).toBeVisible();
        await page.waitForFunction(() => document.fonts.status === 'loaded');
        await expect(page.locator('body > div[hidden][id^="S:"]')).toHaveCount(0);
      };
      await open(current);
      await expect(page.getByRole('region', { name: 'Season honors', exact: true })).toContainText('All-Star');
      await page.screenshot({ path: join(__dirname, `current-${width}.png`), fullPage: true });
      const layout = await page.evaluate(() => {
        const card = document.querySelector('.pvp-card').getBoundingClientRect();
        return { overflow: document.documentElement.scrollWidth - innerWidth, cardTop: card.top, cardHeight: card.height, centerOffset: Math.abs(card.x + card.width / 2 - innerWidth / 2) };
      });
      expect(layout.overflow).toBe(0); expect(layout.cardTop).toBeLessThan(400); expect(layout.centerOffset).toBeLessThanOrEqual(2);
      await page.getByRole('button', { name: /^Player B season,/ }).click();
      await expect(page.getByRole('menu')).toHaveCSS('opacity', '1');
      const decorated = page.getByRole('menuitem', { name: '2024-25 MVP winner, NBA champion, All-Star' });
      await expect(decorated).toBeVisible();
      expect(await decorated.locator('svg').count()).toBe(3);
      const colors = await decorated.locator('svg').evaluateAll(elements => elements.map(element => getComputedStyle(element).color));
      expect(colors).toEqual(['rgb(255, 209, 102)', 'rgb(255, 209, 102)', 'rgb(255, 209, 102)']);
      const legend = await page.locator('.pvp-season-legend').getByText('All-Star', { exact: true }).evaluate(element => ({ height: element.getBoundingClientRect().height, lineHeight: parseFloat(getComputedStyle(element).lineHeight) }));
      expect(legend.height).toBeLessThanOrEqual(legend.lineHeight + 1);
      await page.screenshot({ path: join(__dirname, `season-picker-${width}.png`), fullPage: true });
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: /^Change Player A,/ }).click();
      await page.getByRole('combobox', { name: 'Player A', exact: true }).fill('gianna');
      const result = page.getByRole('option', { name: /Giannis Antetokounmpo/ }).first();
      await expect(result).toBeVisible();
      const fullName = await result.locator('.lookup-item-name').evaluate(element => {
        const range = document.createRange(); range.selectNodeContents(element.firstChild);
        const text = range.getBoundingClientRect(), box = element.getBoundingClientRect();
        return { text: element.firstChild.textContent, textRight: text.right, boxRight: box.right };
      });
      expect(fullName.textRight).toBeLessThanOrEqual(fullName.boxRight);
      const searchBox = await page.locator('.lookup-floating-dropdown').boundingBox();
      expect(searchBox.width).toBeCloseTo(Math.min(440, width - 16), 0);
      expect(searchBox.x).toBeGreaterThanOrEqual(0); expect(searchBox.x + searchBox.width).toBeLessThanOrEqual(width);
      await page.screenshot({ path: join(__dirname, `player-search-${width}.png`), fullPage: true });
      await open(historical);
      const axes = await page.evaluate(() => {
        const center = element => { const box = element.getBoundingClientRect(); return box.x + box.width / 2; };
        return { values: [...document.querySelectorAll('.pvp-rows[aria-label="Descriptive comparison"] tbody tr:not(.pvp-group) .pvp-value')].slice(0, 2).map(center), honors: [...document.querySelectorAll('.pvp-honors-side')].map(center) };
      });
      axes.values.forEach((value, index) => expect(axes.honors[index]).toBeCloseTo(value, 0));
      const stripHeight = await page.locator('.pvp-honors').evaluate(element => element.getBoundingClientRect().height);
      const allHonors = page.getByRole('region', { name: 'Season honors', exact: true });
      const durant = allHonors.getByRole('group', { name: 'Kevin Durant, 2016-17 honors' });
      for (const label of ['NBA Champ', 'All-NBA 2nd', 'All-Star', 'MVP 9th']) await expect(durant.getByText(label, { exact: true })).toBeVisible();
      await expect(allHonors.getByRole('button')).toHaveCount(0);
      const historicalBadges = await durant.locator('.ui-badge').evaluateAll(badges => badges.map(badge => {
        const box = badge.getBoundingClientRect(); return { x: box.x + box.width / 2, left: box.left, right: box.right, y: box.y, height: box.height };
      }));
      expect(historicalBadges).toHaveLength(4);
      const rows = new Map();
      historicalBadges.forEach(badge => { const row = rows.get(badge.y); rows.set(badge.y, { left: Math.min(row?.left ?? badge.left, badge.left), right: Math.max(row?.right ?? badge.right, badge.right) }); });
      for (const row of rows.values()) expect((row.left + row.right) / 2).toBeCloseTo(axes.values[0], 0);
      await page.screenshot({ path: join(__dirname, `all-honors-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'More', exact: true }).click();
      const downloading = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: 'Export SVG', exact: true }).click();
      const download = await downloading;
      await download.saveAs(join(__dirname, `honors-export-${width}.svg`));
      await open('/compare?playerA=203507&playerB=1628983&season=2025-26&phase=regular_season&beforeDate=2026-04-13&seasonA=2019-20');
      const badgeAxes = await page.locator('.pvp-honors-side').evaluateAll(sides => sides.map(side => [...side.querySelectorAll('.pvp-honors-strip .ui-badge')].map(badge => {
        const box = badge.getBoundingClientRect(); return { x: box.x + box.width / 2, left: box.left, right: box.right, y: box.y + box.height / 2 };
      })));
      expect(badgeAxes[0]).toHaveLength(5); expect(badgeAxes[1]).toHaveLength(1);
      expect(badgeAxes[0][0].y).toBeCloseTo(badgeAxes[1][0].y, 0);
      await page.screenshot({ path: join(__dirname, `mixed-honors-${width}.png`), fullPage: true });
      const counting = page.getByRole('button', { name: /^Counting mode,/ });
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      const countingBefore = await counting.boundingBox();
      await counting.click();
      await expect(page.getByRole('menu')).toHaveCSS('opacity', '1');
      await page.screenshot({ path: join(__dirname, `counting-menu-${width}.png`), fullPage: true });
      const careerChoice = await page.getByRole('menuitem', { name: 'Career · Per Game', exact: true }).boundingBox();
      expect(careerChoice).not.toBeNull();
      await page.mouse.click(careerChoice.x + careerChoice.width / 2, careerChoice.y + careerChoice.height / 2);
      await expect(counting).toHaveText('Career · Per Game');
      const countingAfter = await counting.boundingBox();
      expect(countingAfter.x).toBeCloseTo(countingBefore.x, 0);
      expect(countingAfter.y).toBeCloseTo(countingBefore.y, 0);
      expect(countingAfter.width).toBe(countingBefore.width);
      await page.screenshot({ path: join(__dirname, `career-mode-${width}.png`), fullPage: true });
      expect(errors).toEqual([]);
      results.push({ width, layout, colors, legend, search: { fullName, box: searchBox }, historical: { honorsHeight: stripHeight, axes, badges: historicalBadges }, mixedBadgeAxes: badgeAxes, counting: { before: countingBefore, after: countingAfter }, pageErrors: errors });
      await page.close();
    }
    writeFileSync(join(__dirname, 'measurements.json'), JSON.stringify(results, null, 2) + '\n');
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
