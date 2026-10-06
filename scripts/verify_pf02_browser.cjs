/* PF02 production foundation measurements. Read-only routes; no provider call. */
const { chromium, expect } = require('../dashboard/node_modules/@playwright/test');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const assert = require('node:assert/strict');
const base = process.env.PF02_URL || 'http://127.0.0.1:3154';
const out = 'docs/evidence/pf02-foundation';
function contrast(a, b) {
  const luminance = color => {
    const values = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  };
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + .05) / (values[1] + .05);
}
(async () => {
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: false, args: ['--window-size=2560,1440', '--ozone-platform=x11'] });
  const context = await browser.newContext({ viewport: null });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const report = { environment: 'Production webpack + real FastAPI/PostgreSQL, headed Chromium under Xvfb', previews: [], checks: [] };
  for (const size of [[2560,1440,'wide'],[1440,900,'desktop'],[375,812,'mobile']]) {
    await page.setViewportSize({width:size[0],height:size[1]});
    for (const [route, label] of [['/stats','stats'],['/research/ask','ask'],['/settings','settings']]) {
      await page.goto(base + route);
      if (label === 'stats') await page.locator('.dense-stats-table tbody tr').first().waitFor();
      if (label === 'ask') {
        await expect(page.getByRole('status').last()).toContainText('Ready for research');
        await expect(page.getByText('Checking AI configuration…', {exact:true})).toHaveCount(0);
      }
      await page.waitForLoadState("networkidle");
      await page.evaluate(() => document.fonts.ready);
      const metrics = await page.evaluate(() => {
        const css = getComputedStyle(document.documentElement);
        const element = document.querySelector('.workbench-content');
        const rect = element.getBoundingClientRect();
        const fields = Array.from(document.querySelectorAll('select')).map(select => {
          const style = getComputedStyle(select);
          return { label: select.getAttribute('aria-label') || select.id, height: select.getBoundingClientRect().height, inset: parseFloat(style.paddingRight), chevron: style.backgroundImage !== 'none' };
        });
        const rgb = token => { const node = document.createElement('span'); node.style.color = css.getPropertyValue(token); document.body.append(node); const result = getComputedStyle(node).color; node.remove(); return result; };
        return { viewport: [innerWidth,innerHeight], dpr: devicePixelRatio, documentWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth,
          content: {left:rect.left,width:rect.width}, shell: Object.fromEntries(['.replica-top-row','.replica-nav-row','.context-bar'].map(selector => [selector,document.querySelector(selector)?.getBoundingClientRect().height ?? null])), theme: Object.fromEntries(['--bg','--surface','--surface-raised','--text','--text-muted','--accent','--border'].map(token => [token,rgb(token)])), fields };
      });
      assert(metrics.documentWidth <= metrics.viewport[0], `${label} ${size[2]} page overflow: ${metrics.documentWidth}`);
      assert.equal(metrics.content.left, 0);
      assert.equal(metrics.content.width, metrics.clientWidth);
      for (const field of metrics.fields) { assert(field.height >= 40); assert(field.inset >= 36); assert(field.chevron); }
      metrics.contrast = {};
      for (const surface of ['--bg','--surface','--surface-raised']) for (const text of ['--text','--text-muted','--accent']) {
        const ratio = contrast(metrics.theme[text],metrics.theme[surface]);
        assert(ratio >= 4.5);
        metrics.contrast[`${text}/${surface}`] = ratio;
      }
      assert(contrast(metrics.theme['--border'],metrics.theme['--surface-raised']) >= 3, JSON.stringify(metrics.theme));
      await page.screenshot({path:`${out}/${label}-${size[2]}.png`,fullPage:true});
      report.previews.push({route,size:size[2],...metrics});
    }
  }
  await page.setViewportSize({width:1440,height:900});
  await page.goto(base+'/stats');
  await page.locator('.player-cell-name').first().waitFor();
  for (const selector of ['.player-cell-name','.replica-actions-group button']) {
    const background = await page.locator(selector).first().evaluate(node => getComputedStyle(node).backgroundColor);
    assert.equal(background,'rgba(0, 0, 0, 0)');
  }
  report.checks.push({name:'plain player-name and Ask button backgrounds'});
  const disabled = page.getByRole('group',{name:'Counting Mode'}).getByRole('button',{name:/^Per 100/});
  await expect(disabled).toBeDisabled();
  assert.equal(await disabled.evaluate(node=>getComputedStyle(node).cursor),'not-allowed');
  report.checks.push({name:'unsupported normalization has native disabled semantics and disabled styling'});
  const trigger = page.getByRole('button',{name:'Research',exact:true});
  await trigger.focus();
  await trigger.press('ArrowDown');
  await expect(page.getByRole('menuitem').first()).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.getByRole('menuitem').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  const focus = await trigger.evaluate(node => { const css=getComputedStyle(node);return {style:css.outlineStyle,width:css.outlineWidth,color:css.outlineColor}; });
  assert.equal(focus.style,'solid'); assert.equal(focus.width,'2px');
  report.checks.push({name:'menu keyboard, Escape focus return and visible focus',focus});
  const ask = page.getByRole('button',{name:'Ask',exact:true});
  await ask.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(ask).toBeFocused();
  report.checks.push({name:'Ask dialog open/close and focus return'});
  await page.setViewportSize({width:375,height:812});
  const mobile = page.getByRole('button',{name:'Toggle navigation drawer'});
  await mobile.click();
  await expect(mobile).toHaveAttribute('aria-expanded','true');
  await page.keyboard.press('Escape');
  await expect(mobile).toBeFocused();
  report.checks.push({name:'mobile menu touch-size trigger and Escape return',bounds:await mobile.boundingBox()});
  await context.close();
  // A fresh context without a Playwright viewport permits real Chromium browser zoom.
  const zoomContext = await browser.newContext({viewport:null});
  const zoomPage = await zoomContext.newPage();
  await zoomPage.goto(base+'/stats');
  const original = await zoomPage.evaluate(() => ({width:innerWidth,dpr:devicePixelRatio}));
  const windows = execFileSync('xdotool', ['search', '--onlyvisible', '--name', 'CourtLoad']).toString().trim().split('\n');
  execFileSync('xdotool', ['windowfocus', '--sync', windows[windows.length - 1]]);
  execFileSync('xdotool', ['key', '--clearmodifiers', 'ctrl+0', ...Array(5).fill('ctrl+plus')]);
  await zoomPage.waitForTimeout(500);
  const zoomed = await zoomPage.evaluate(() => ({width:innerWidth,dpr:devicePixelRatio}));
  assert.equal(zoomed.dpr/original.dpr,2,`Browser zoom not 200%: ${JSON.stringify({original,zoomed})}`);
  for(const [route,label] of [['/stats','stats'],['/research/ask','ask'],['/settings','settings']]) {
    await zoomPage.goto(base+route);
    if(label==='stats') await zoomPage.locator('.dense-stats-table tbody tr').first().waitFor();
    await zoomPage.waitForLoadState('networkidle');
    const dimensions=await zoomPage.evaluate(()=>({viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth}));
    assert(dimensions.documentWidth<=dimensions.viewport[0]);
    if(label==='ask') await expect(zoomPage.getByText('Checking AI configuration…', {exact:true})).toHaveCount(0);
    execFileSync('import', ['-window', windows[windows.length - 1], `${out}/${label}-zoom.png`]);
    report.previews.push({route,size:'actual 200% browser zoom',original,...dimensions});
  }
  assert.deepEqual(errors,[]);
  report.page_errors=errors;
  fs.writeFileSync(`${out}/browser.json`,JSON.stringify(report,null,2)+'\n');
  await browser.close();
  console.log(JSON.stringify({previews:report.previews.length,checks:report.checks,errors}));
})().catch(error=>{console.error(error);process.exit(1);});
