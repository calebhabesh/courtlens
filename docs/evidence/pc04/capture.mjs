import { createRequire } from 'node:module';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const require=createRequire(resolve('dashboard/package.json'));
const {chromium}=require('@playwright/test');
const base=process.env.PC04_BASE_URL || 'http://localhost:3400';
const destination=resolve('docs/evidence/pc04/screens');mkdirSync(destination,{recursive:true});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
const rows=[];
const pages=[['compare','/compare'],['matchups','/matchups'],['wowy','/wowy'],['stat-shift','/stat-line-shift'],['shot-profile','/similar-players/shot-profile'],['shot-aftermath','/research/shooting/aftermath'],['similar-players','/similar-players'],['recent-games','/last-games'],['operation-gallery','/research/operation'],['live','/live'],['contracts','/contracts'],['free-agency','/free-agency']];
for(const width of [1440,390]) {
 const context=await browser.newContext({viewport:{width,height:width===1440?900:844},reducedMotion:'reduce'});
 for(const [name,path] of pages){
  const page=await context.newPage(),errors=[],failures=[];page.on('pageerror',e=>errors.push(e.message));page.on('requestfailed',r=>failures.push({url:r.url(),failure:r.failure()}));
  // Keep personal state empty and read-only during the real published-data audit.
  await page.route('**/api/workspace**',route=>route.fulfill({json:{workspace_id:'default',name:'Default Workspace',version:1,views:[],favorites:[],compare_tray:[],ranking_boards:[],tier_lists:[],preferences:{density:'standard',identity_mode:'photos',counting_mode:'per_game',default_view_id:'overview',table_expanded:false,theme:'dark'},created_at:'2026-10-11',updated_at:'2026-10-11'}}));
  const response=await page.goto(base+path);
  await page.waitForTimeout(2500);await page.evaluate(()=>document.fonts.ready);
  if(!['compare','operation-gallery','contracts','free-agency'].includes(name))await page.locator(name==='live' ? '.live-game-card' : '.pc04-example').first().waitFor({timeout:20000}).catch(()=>{});
  await page.screenshot({path:resolve(destination,`${name}-${width}.png`),fullPage:true});
  const measurements=await page.evaluate(()=>{
    const result=document.querySelector('.pc04-identity-card,.pc04-example,.pc04-operation-card,.live-game-card');
    const table=document.querySelector('.pc04-metric-table');
    return {overflow:document.documentElement.scrollWidth>innerWidth,resultY:result?.getBoundingClientRect().top ?? null,title:document.querySelector('h1')?.textContent,example:document.querySelector('.pc04-example-heading')?.textContent,alerts:[...document.querySelectorAll('[role=alert]')].map(n=>n.textContent),scope:location.search,tabular:table ? getComputedStyle(table).fontVariantNumeric : null};
  });
  rows.push({path,width,status:response.status(),errors,failures,...measurements});
  console.log(`${width} ${path}: y=${measurements.resultY}, overflow=${measurements.overflow}, errors=${errors.length}`);
  if(name==='compare'){
    await page.getByRole('button',{name:'Top 2 by minutes',exact:true}).click();await page.getByRole('table',{name:'Descriptive comparison'}).waitFor();
    await page.screenshot({path:resolve(destination,`compare-selected-${width}.png`),fullPage:true});
    const chips=await page.locator('.chart-delta').evaluateAll(chips=>chips.map(chip=>({label:chip.textContent,identity:chip.dataset.identity,color:getComputedStyle(chip).color})));
    rows.push({path:'/compare (suggestion)',width,overflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),errors,chips});
  }
  await page.close();
 }
 await context.close();
}
await browser.close();writeFileSync(resolve('docs/evidence/pc04/measurements.json'),JSON.stringify({base,verification:'Real published database; no query parameters on entry. Personal state read is stubbed empty.',rows},null,2));
if(rows.some(row=>row.overflow || row.errors.length))process.exitCode=1;
