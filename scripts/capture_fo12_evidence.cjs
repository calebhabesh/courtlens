/* FO12: read-only captures of the Research pages against the retained local API through an isolated production build. */
const { chromium } = require('../dashboard/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const base=process.env.FO12_BASE_URL || 'http://localhost:3103';
const api=process.env.FO12_API_URL || 'http://localhost:8001';
const output=path.resolve('docs/evidence/fo12');
const only=process.env.FO12_ONLY ? process.env.FO12_ONLY.split(',') : null;
(async()=>{
  const catalog=await fetch(`${api}/api/workbench/catalog`).then(r=>r.json());
  const saved=await fetch(`${api}/api/workbench/assistant/investigations?limit=1&offset=0`).then(r=>r.json());
  const scope=new URLSearchParams({releaseId:catalog.release_id,season:catalog.default_season,phase:catalog.default_phase,beforeDate:catalog.default_before_date});
  // [name, url, selector that marks the settled main result]
  const states=[
    ['rapm',`/research/rapm?${scope}`,'[aria-label="Served impact ratings"]'],
    ['six-factor',`/research/rapm/six-factor`,'.ui-gated-note'],
    ['expected-shots',`/research/shooting`,'[aria-label="Registered research result"]'],
    ['adjusted-shooting',`/research/shooting/adjusted`,'.ui-gated-note'],
    ['aftermath',`/research/shooting/aftermath?${scope}&player_id=1628389`,'.floor-result,[role="alert"]'],
    ['aftermath-empty',`/research/shooting/aftermath?${scope}`,'.ui-gated-note'],
    ['trends',`/research/trends?${scope}&playerId=1628389`,'[aria-label="Metric variance"],[role="alert"]'],
    ['trends-shifts',`/research/trends?${scope}&view=rank`,'[aria-label="League shifts"],[role="alert"]'],
    ...['distribution','splits','opponent','rank'].map(tab=>[`distributions-${tab}`,`/research/distributions?${scope}&playerId=1628389&tab=${tab}`,'.ui-research,[role="alert"]']),
    ['defensive-matchups',`/research/defensive-matchups?${scope}`,'.ui-gated-note'],
    ['spatial-epv',`/research/epv?${scope}`,'.ui-gated-note'],
    ['forecasts','/forecasts','[aria-label="Holdout metrics"],[role="alert"]'],
    ['evaluation','/evaluation','.ui-gated-note,.ui-research'],
    ['case-studies','/research/case-studies','[aria-label="Case study observations"]'],
    ['case-studies-team','/research/case-studies?case=raptors-defense-guardrails','[aria-label="Case study observations"]'],
    ['investigations','/investigations','[aria-label="Saved operations table"],[role="alert"]'],
    ['saved-investigation',`/investigations/saved/${saved[0].id}`,'.ui-research,[role="alert"]'],
    ['calculator','/calculator','[aria-label="Scenario output"]'],
    ['wingspan','/wingspan','[aria-label="Measurement records"],[role="alert"]']
  ].filter(([name])=>!only || only.includes(name));
  fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium'});const measurements=[];
  for(const width of [1440,768,390]) for(const [name,url,ready] of states){
    const page=await browser.newPage({viewport:{width,height:width===390?844:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'});
    // NEXT_PUBLIC is baked for the isolated mock port. Relay browser reads to the real API;
    // server components use COURTLENS_API_INTERNAL_URL=8001 directly. Every request is a read.
    await page.route('http://localhost:4102/**',async route=>{const response=await route.fetch({url:route.request().url().replace('http://localhost:4102',api),timeout:60000});await route.fulfill({response});});
    await page.goto(base+url,{timeout:90000});await page.waitForLoadState('networkidle',{timeout:90000});await page.evaluate(()=>document.fonts.ready);
    await page.locator(ready).first().waitFor({timeout:60000}).catch(()=>errors.push(`ready selector ${ready} not found`));
    await page.waitForFunction(()=>[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.width&&r.top<innerHeight&&r.bottom>0;}).every(i=>i.complete));
    const values=await page.evaluate(()=>{
      const root=document.querySelector('.ui-page');const visible=e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&e.checkVisibility();};
      const text=[...root.querySelectorAll('*')].filter(visible).flatMap(e=>[...e.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent)).join(' ');
      const findings=root.querySelector('.ui-findings');
      const main=findings || root.querySelector('.research-table,.floor-result,.research-grid,.ui-gated-note');
      const controls=[...root.querySelectorAll('.ui-filter-bar button,.ui-filter-bar input,.ui-filter-bar select')].filter(e=>visible(e)&&e.getAttribute('aria-hidden')!=='true'&&e.type!=='checkbox').map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),height:Math.round(e.getBoundingClientRect().height),fieldHeight:Math.round((e.closest('.lookup-input-wrapper')||e).getBoundingClientRect().height)}));
      const numbers=[...root.querySelectorAll('td.num')].filter(visible).slice(0,40).map(e=>getComputedStyle(e)).filter(s=>s.textAlign!=='right'||!s.fontVariantNumeric.includes('tabular-nums')).length;
      return {title:root.querySelector('h1')?.textContent,subtitleLines:(()=>{const s=root.querySelector('.ui-page-header-subtitle');return s?Math.round(s.getBoundingClientRect().height/parseFloat(getComputedStyle(s).lineHeight)):0;})(),template:root.dataset.template,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,findingsTop:findings?Math.round(findings.getBoundingClientRect().top):null,mainTop:main?Math.round(main.getBoundingClientRect().top):null,filterBottom:root.querySelector('.ui-filter-bar')?Math.round(root.querySelector('.ui-filter-bar').getBoundingClientRect().bottom):null,controls,filtersButton:[...root.querySelectorAll('button')].some(e=>visible(e)&&/^Filters/.test(e.textContent)),numbersNotTabularRight:numbers,rawDates:(text.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[]).length,uuids:(text.match(/\b[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b/gi)||[]).length,hashes:(text.match(/\b[\da-f]{64}\b/gi)||[]).length,cutoffRules:(text.match(/game_date\s*</g)||[]).length,nativeDates:root.querySelectorAll('input[type="date"]').length,noticeBoxes:root.querySelectorAll('.notice-box').length,loadButtons:[...root.querySelectorAll('button')].filter(e=>visible(e)&&/^(Load|Run|Apply)\b/.test(e.textContent.trim())).length};
    });
    measurements.push({name,url,width,...values,errors});await page.screenshot({path:path.join(output,`${name}-${width}.png`)});await page.close();
    console.log(width,name,values.findingsTop,values.mainTop,values.documentWidth-values.viewportWidth,errors.length);
  }
  fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({capturedAt:new Date().toISOString(),base,api,releaseId:catalog.release_id,measurements},null,2)+'\n');await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
