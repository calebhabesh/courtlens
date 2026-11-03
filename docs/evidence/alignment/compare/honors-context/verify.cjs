// From dashboard/: node ../docs/evidence/alignment/compare/honors-context/verify.cjs
// Use the production sandbox at 3180 and its read-only live API proxy at 4180.
const { chromium, expect } = require(require('node:path').resolve(process.cwd(), 'node_modules/@playwright/test'));
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const base = process.env.COURTLENS_VERIFY_BASE_URL || 'http://127.0.0.1:3180';
const path = '/compare?playerA=203507&playerB=1628983&season=2020-21&phase=regular_season&beforeDate=2021-05-18';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium', headless: true });
  const results = [];
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: width === 390 ? 844 : 900 }, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const open = async url => {
        await page.goto(base + url);
        await expect(page.getByRole('table', { name: 'Descriptive comparison' })).toBeVisible();
        await page.waitForFunction(() => document.fonts.status === 'loaded');
        await expect(page.locator('body > div[hidden][id^="S:"]')).toHaveCount(0);
      };
      await open(path);
      const honors = page.getByRole('region', { name: 'Season honors', exact: true });
      await expect(honors.getByText('All-Star', { exact: true })).toBeVisible();
      const empty = honors.locator('.pvp-honors-side[data-identity="b"]');
      await expect(empty).toContainText('—');
      await expect(empty).toContainText('No honors recorded in this scope');
      await expect(honors).not.toContainText(/Pending|awards pending|None recorded/i);
      const layout = await page.evaluate(() => {
        const center = element => { const box = element.getBoundingClientRect(); return box.x + box.width / 2; };
        const card = document.querySelector('.pvp-card').getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth - innerWidth,
          cardTop: card.top, cardHeight: card.height,
          values: [...document.querySelectorAll('.pvp-rows[aria-label="Descriptive comparison"] tbody tr:not(.pvp-group) .pvp-value')].slice(0, 2).map(center),
          honors: [...document.querySelectorAll('.pvp-honors-side')].map(center),
          honorsText: document.querySelector('.pvp-honors').innerText,
        };
      });
      expect(layout.overflow).toBe(0);
      layout.values.forEach((value, index) => expect(layout.honors[index]).toBeCloseTo(value, 0));
      await page.screenshot({ path: join(__dirname, `honors-${width}.png`), fullPage: true });

      await page.getByRole('button', { name: 'More', exact: true }).click();
      const downloading = page.waitForEvent('download');
      await page.getByRole('menuitem', { name: 'Export SVG', exact: true }).click();
      const download = await downloading;
      const exportedPath = join(__dirname, `honors-export-${width}.svg`);
      await download.saveAs(exportedPath);
      const exported = readFileSync(exportedPath, 'utf8');
      expect(exported).toContain('All-Star');
      expect(exported).not.toMatch(/Pending|awards pending|None recorded/i);
      const more = page.getByRole('button', { name: 'More', exact: true });
      if (await more.getAttribute('aria-expanded') === 'true') await more.click();
      await expect(page.getByRole('menu')).toHaveCount(0);

      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
      const trigger = page.getByRole('button', { name: /^Counting mode,/ });
      const before = await trigger.boundingBox();
      await trigger.click();
      const menu = page.getByRole('menu');
      await expect(menu).toHaveCSS('opacity', '1');
      const headings = page.locator('.pvp-counting-group');
      const headingStyles = await headings.evaluateAll(elements => elements.map(element => ({
        text: element.textContent, tag: element.tagName,
        background: getComputedStyle(element).backgroundColor,
        color: getComputedStyle(element).color, weight: getComputedStyle(element).fontWeight,
      })));
      expect(headingStyles).toHaveLength(2);
      headingStyles.forEach(heading => {
        expect(heading.tag).toBe('P');
        expect(heading.background).toBe('rgb(21, 23, 27)');
      });
      const menuBackground = await menu.evaluate(element => getComputedStyle(element).backgroundColor);
      expect(menuBackground).not.toBe(headingStyles[0].background);
      await expect(page.getByRole('menuitem', { name: '2020-21', exact: true })).toHaveCount(0);
      const headingBox = await headings.first().boundingBox();
      await page.mouse.click(headingBox.x + headingBox.width / 2, headingBox.y + headingBox.height / 2);
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await page.screenshot({ path: join(__dirname, `counting-menu-${width}.png`), fullPage: true });
      const after = await trigger.boundingBox();
      expect(after.x).toBeCloseTo(before.x, 0); expect(after.y).toBeCloseTo(before.y, 0);
      expect(after.width).toBe(before.width);
      await trigger.focus(); await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menuitem', { name: 'Per Game', exact: true })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(trigger).toBeFocused();

      await open(path.replace('2021-05-18', '2021-02-01'));
      await expect(honors.locator('.ui-badge')).toHaveCount(0);
      await expect(honors.locator('.pvp-honors-empty')).toHaveCount(2);
      await expect(honors).not.toContainText(/Pending|awards pending/i);
      await page.screenshot({ path: join(__dirname, `empty-honors-${width}.png`), fullPage: true });
      expect(errors).toEqual([]);
      results.push({ width, layout, headingStyles, menuBackground, counting: { before, after }, pageErrors: errors });
      await page.close();
    }
    writeFileSync(join(__dirname, 'measurements.json'), JSON.stringify(results, null, 2) + '\n');
    process.stdout.write('Live honors and menu context checks passed at 1440 and 390.\n');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
