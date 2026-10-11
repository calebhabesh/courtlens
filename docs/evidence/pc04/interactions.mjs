import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
const require = createRequire(resolve('dashboard/package.json'));
const { chromium } = require('@playwright/test');
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
const base = process.env.PC04_FIXTURE_URL || 'http://localhost:3300';
const rows = [];
for (const width of [1440,390]) {
  const page = await browser.newPage({viewport:{width,height:width === 1440 ? 900 : 844},reducedMotion:'reduce'});
  await page.route('**/api/workbench/players?*',async route => {
    const response = await route.fetch();
    await new Promise(resolve => setTimeout(resolve,1200));
    await route.fulfill({response});
  });
  await page.goto(base+'/wowy');
  const loading = page.getByRole('status',{name:'Loading observed example',exact:true});
  await loading.waitFor();
  const loadingBox = await loading.boundingBox();
  await page.screenshot({path:resolve(`docs/evidence/pc04/screens/loading-${width}.png`)});
  const card = page.getByRole('region',{name:'Observed example context',exact:true});
  await card.waitFor();
  const finalBox = await card.boundingBox();
  const layout = await card.evaluate(node => {
    const styles = getComputedStyle(node), grid = getComputedStyle(node.querySelector('.pc04-example-players'));
    return {padding:styles.padding,gap:grid.gap,headshots:node.querySelectorAll('.ui-identity-media').length,
      colors:[...node.querySelectorAll('[data-value-bar]')].map(bar=>getComputedStyle(bar).fill),
      changeHeight:node.querySelector('button').getBoundingClientRect().height};
  });
  await card.getByRole('button',{name:'Change',exact:true}).click();
  const changeFocus = await page.evaluate(()=>document.activeElement?.getAttribute('role'));
  rows.push({width,loadingBox,finalBox,layout,changeFocus});
  await page.close();
  const error = await browser.newPage({viewport:{width,height:width === 1440 ? 900 : 844}});
  await error.route('**/api/workbench/players?*',route=>route.fulfill({status:503,json:{detail:'UI verification: unavailable'}}));
  await error.goto(base+'/matchups');
  await error.getByRole('button',{name:'Retry',exact:true}).waitFor();
  await error.screenshot({path:resolve(`docs/evidence/pc04/screens/error-${width}.png`)});
  rows.push({width,errorText:await error.locator('.ui-gated-note').first().textContent().catch(()=>error.getByText('Example unavailable. Choose a player or retry.',{exact:true}).textContent()),retryEnabled:await error.getByRole('button',{name:'Retry',exact:true}).isEnabled()});
  await error.close();
}
const compare = await browser.newPage();
await compare.goto(base+'/compare?playerA=23&playerB=24&season=2025-26&phase=regular_season&releaseId=fixture-release&beforeDate=2026-04-13');
await compare.getByRole('radio',{name:'Overall',exact:true}).focus();await compare.keyboard.press('ArrowRight');
const keyboardPreset = new URL(compare.url()).searchParams.get('preset');
const table = await compare.getByRole('table',{name:'Descriptive comparison'}).evaluate(node=>{
  const box=node.getBoundingClientRect(),center=node.querySelector('tbody th').getBoundingClientRect();
  return {centerError:Math.abs(box.x+box.width/2-center.x-center.width/2),numericFont:getComputedStyle(node).fontVariantNumeric,alignment:getComputedStyle(node.querySelector('tbody td')).textAlign};
});
rows.push({keyboardPreset,table});
await browser.close();
writeFileSync(resolve('docs/evidence/pc04/interaction-measurements.json'),JSON.stringify({base,verification:'Deterministic UI fixtures; no real-data claims from these states.',rows},null,2));
if (keyboardPreset !== 'offense' || table.centerError > 2 || rows.some(row=>row.retryEnabled === false || row.changeFocus && row.changeFocus !== 'combobox')) process.exitCode = 1;
