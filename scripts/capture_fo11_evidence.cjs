/* FO11: read-only captures against the retained local API through an isolated production build. */
const { chromium } = require('../dashboard/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const base=process.env.FO11_BASE_URL || 'http://localhost:3103';
const api=process.env.FO11_API_URL || 'http://localhost:8001';
const output=path.resolve('docs/evidence/fo11');
(async()=>{
  const catalog=await fetch(`${api}/api/workbench/catalog`).then(r=>r.json());
  const scope=new URLSearchParams({releaseId:catalog.release_id,season:catalog.default_season,phase:catalog.default_phase,beforeDate:catalog.default_before_date});
  const states=[['players-bars',`/compare?${scope}&playerA=1630567&playerB=1627742`],['players-table',`/compare?${scope}&playerA=1630567&playerB=1627742&compareView=table`],['players-empty',`/compare?${scope}`],
    ...['overview','factors','three_point','roster','peers'].map(tab=>[`teams-${tab}`,`/team-compare?${scope}&teamA=1610612761&teamB=1610612738&tab=${tab}`]),
    ['wowy',`/wowy?${scope}&team_id=TOR&together=1630567`],['wowy-unit',`/wowy?${scope}&team_id=TOR&exact_unit=1630567,1627742`],['wowy-empty',`/wowy?${scope}`],['matchups',`/matchups?${scope}&player_id=1630567&defender_id=1627742`],['matchups-empty',`/matchups?${scope}`]];
  fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium'});const measurements=[];
  for(const width of [1440,768,390]) for(const [name,url] of states){
    const page=await browser.newPage({viewport:{width,height:width===390?844:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'});
    // NEXT_PUBLIC is baked for the isolated mock port. Relay browser reads to the real API;
    // server components use COURTLENS_API_INTERNAL_URL=8001 directly. No API mutation is made.
    await page.route('http://localhost:4102/**',async route=>{const response=await route.fetch({url:route.request().url().replace('http://localhost:4102',api)});await route.fulfill({response});});
    await page.goto(base+url);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);
    if(['wowy','wowy-unit','matchups'].includes(name)) await page.locator('.floor-result,[role="alert"]').first().waitFor();
    await page.waitForFunction(()=>[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width&&r.top<innerHeight&&r.bottom>0;}).every(i=>i.complete));
    const values=await page.evaluate(()=>{
      const root=document.querySelector('.ui-page');const visible=e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&e.checkVisibility();};
      const text=[...root.querySelectorAll('*')].filter(visible).flatMap(e=>[...e.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent)).join(' ');
      const main=root.querySelector('.ui-compare,.floor-result') || root.querySelector('.ui-gated-note');
      const controls=[...root.querySelectorAll('.ui-filter-bar button,.ui-filter-bar input,.ui-filter-bar select,.fo11-selectors button,.fo11-selectors input')].filter(e=>visible(e)&&e.getAttribute('aria-hidden')!=='true').map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),height:e.getBoundingClientRect().height,fieldHeight:(e.closest('.lookup-input-wrapper')||e).getBoundingClientRect().height}));
      return {title:root.querySelector('h1')?.textContent,template:root.dataset.template,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,mainTop:main?.getBoundingClientRect().top,filterBottom:root.querySelector('.ui-filter-bar')?.getBoundingClientRect().bottom,controls,filtersButton:[...root.querySelectorAll('button')].some(e=>visible(e)&&/^Filters/.test(e.textContent)),rawDates:(text.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[]).length,uuids:(text.match(/\b[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b/gi)||[]).length,hashes:(text.match(/\b[\da-f]{64}\b/gi)||[]).length,cutoffRules:(text.match(/game_date\s*</g)||[]).length,nativeDates:root.querySelectorAll('input[type="date"]').length,noticeBoxes:root.querySelectorAll('.notice-box').length};
    });
    measurements.push({name,url,width,...values,errors});await page.screenshot({path:path.join(output,`${name}-${width}.png`)});await page.close();
  }
  fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({capturedAt:new Date().toISOString(),base,api,releaseId:catalog.release_id,measurements},null,2)+'\n');await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
