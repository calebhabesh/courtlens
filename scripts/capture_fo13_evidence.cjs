/* FO13: read-only captures of Settings, Data Status, Methodology, What's New, Planner, Stats and Ask against the retained local API through an isolated production build. */
const { chromium } = require('../dashboard/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const base=process.env.FO13_BASE_URL || 'http://localhost:3103';
const api=process.env.FO13_API_URL || 'http://localhost:8001';
const output=path.resolve(process.env.FO13_OUT || 'docs/evidence/fo13');
const only=process.env.FO13_ONLY ? process.env.FO13_ONLY.split(',') : null;
(async()=>{
  const catalog=await fetch(`${api}/api/workbench/catalog`).then(r=>r.json());
  const scope=new URLSearchParams({releaseId:catalog.release_id,season:catalog.default_season,phase:catalog.default_phase,beforeDate:catalog.default_before_date});
  // [name, url, selector that marks the settled main result]
  const states=[
    ['settings','/settings','#display'],
    ['data-status','/data-status','[aria-label="Background jobs table"]'],
    ['methodology','/methodology','#principles'],
    ['methodology-catalog','/methodology#catalog','[aria-label="Metric definitions"]'],
    ['learning','/methodology/learning','#true-shooting'],
    ['whats-new','/whats-new','.ui-article-section'],
    ['blog','/whats-new/blog','.ui-article-section'],
    ['planner','/planner','.planner-auth,.ui-findings,.ui-gated-note'],
    ['stats',`/stats?${scope}`,'.player-explorer-container,.ui-gated-note'],
    ['ask-manual','/research/ask?experience=manual','.conversation'],
    ['schedule-redirect','/schedule','.ui-page']
  ].filter(([name])=>!only || only.includes(name));
  fs.mkdirSync(output,{recursive:true});const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium'});const measurements=[];
  for(const width of [1440,768,390]) for(const [name,url,ready] of states){
    const page=await browser.newPage({viewport:{width,height:width===390?844:900}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'});
    // NEXT_PUBLIC is baked for the isolated mock port. Relay browser reads to the real API;
    // server components use COURTLENS_API_INTERNAL_URL=8001 directly. Every request is a read.
    await page.route('http://localhost:4102/**',async route=>{const response=await route.fetch({url:route.request().url().replace('http://localhost:4102',api),timeout:60000});await route.fulfill({response});});
    await page.goto(base+url,{timeout:90000});await page.waitForLoadState('networkidle',{timeout:90000});await page.evaluate(()=>document.fonts.ready);
    await page.locator(ready).first().waitFor({timeout:60000}).catch(()=>errors.push(`ready selector ${ready} not found`));
    if(url.includes('#')){await page.evaluate(id=>document.getElementById(id)?.scrollIntoView(),url.split('#')[1]);await page.waitForTimeout(300);}
    await page.waitForFunction(()=>[...document.images].filter(i=>{
      if(!i.checkVisibility())return false;
      const r=i.getBoundingClientRect();
      let left=Math.max(0,r.left),right=Math.min(innerWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
      // Lazy images in clipped table columns are not visible even when their boxes are inside
      // the browser viewport. Intersect every scroll/clip ancestor before waiting for them.
      for(let p=i.parentElement;p;p=p.parentElement){
        const s=getComputedStyle(p),b=p.getBoundingClientRect();
        if(/^(auto|scroll|hidden|clip)$/.test(s.overflowX)){left=Math.max(left,b.left);right=Math.min(right,b.right);}
        if(/^(auto|scroll|hidden|clip)$/.test(s.overflowY)){top=Math.max(top,b.top);bottom=Math.min(bottom,b.bottom);}
      }
      return right>left&&bottom>top;
    }).every(i=>i.complete),null,{timeout:45000}).catch(()=>errors.push('visible images still loading'));
    const values=await page.evaluate(anchor=>{
      const root=document.querySelector('.ui-page')||document.querySelector('.stats-workspace');const visible=e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&e.checkVisibility();};
      const text=[...root.querySelectorAll('*')].filter(visible).flatMap(e=>[...e.childNodes].filter(n=>n.nodeType===Node.TEXT_NODE).map(n=>n.textContent)).join(' ');
      const findings=root.querySelector('.ui-findings');
      const main=(anchor ? document.getElementById(anchor) : null) || findings || root.querySelector('.ui-article-body,.player-explorer-container,.planner-auth,.conversation,.ui-board,.research-table,.ui-gated-note');
      const controls=[...root.querySelectorAll('.ui-filter-bar button,.ui-filter-bar input,.ui-filter-bar select')].filter(e=>visible(e)&&e.getAttribute('aria-hidden')!=='true'&&e.type!=='checkbox').map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),height:Math.round(e.getBoundingClientRect().height),fieldHeight:Math.round((e.closest('.lookup-input-wrapper')||e).getBoundingClientRect().height)}));
      const numbers=[...root.querySelectorAll('td.num')].filter(visible).slice(0,40).map(e=>getComputedStyle(e)).filter(s=>s.textAlign!=='right'||!s.fontVariantNumeric.includes('tabular-nums')).length;
      const phoneControls=[...root.querySelectorAll('button,.ui-button,summary,.ui-article-toc-link')].filter(visible).map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim().slice(0,80),height:Math.round((e.closest('.ui-switch')||e).getBoundingClientRect().height)}));
      return {title:root.querySelector('h1')?.textContent,subtitleLines:(()=>{const s=root.querySelector('.ui-page-header-subtitle');return s?Math.round(s.getBoundingClientRect().height/parseFloat(getComputedStyle(s).lineHeight)):0;})(),template:root.dataset.template||null,contentLeft:Math.round((root.querySelector('h1')||root).getBoundingClientRect().left),documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,findingsTop:findings?Math.round(findings.getBoundingClientRect().top):null,mainTop:main?Math.round(main.getBoundingClientRect().top):null,filterBottom:root.querySelector('.ui-filter-bar')?Math.round(root.querySelector('.ui-filter-bar').getBoundingClientRect().bottom):null,afterBarGap:(()=>{const bar=root.querySelector('.ui-filter-bar');if(!bar)return null;const bottom=bar.getBoundingClientRect().bottom;const next=[...root.querySelectorAll('*')].find(e=>!bar.contains(e)&&!e.contains(bar)&&visible(e)&&e.getBoundingClientRect().top>=bottom-1&&getComputedStyle(e).position!=='fixed');return next?Math.round(next.getBoundingClientRect().top-bottom):null;})(),controls,phoneControls,filtersButton:[...root.querySelectorAll('button')].some(e=>visible(e)&&/^Filters/.test(e.textContent)),numbersNotTabularRight:numbers,tocLinks:root.querySelectorAll('.ui-article-toc-link').length,articleMeasure:(()=>{const a=root.querySelector('.ui-article-section:not(.is-wide)');return a?Math.round(a.getBoundingClientRect().width):null;})(),rawDates:(text.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[]).length,uuids:(text.match(/\b[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b/gi)||[]).length,hashes:(text.match(/\b[\da-f]{64}\b/gi)||[]).length,cutoffRules:(text.match(/game_date\s*</g)||[]).length,nativeDates:root.querySelectorAll('input[type="date"]').length,noticeBoxes:root.querySelectorAll('.notice-box').length,loadButtons:[...root.querySelectorAll('button')].filter(e=>visible(e)&&/^(Load|Run|Apply)\b/.test(e.textContent.trim())).length};
    },url.includes('#')?url.split('#')[1]:null);
    measurements.push({name,url,width,finalPath:new URL(page.url()).pathname,...values,errors});await page.screenshot({path:path.join(output,`${name}-${width}.png`)});await page.unrouteAll({behavior:'ignoreErrors'});await page.close();
    console.log(width,name,values.findingsTop,values.mainTop,values.documentWidth-values.viewportWidth,errors.length);
  }
  fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({capturedAt:new Date().toISOString(),base,api,releaseId:catalog.release_id,measurements},null,2)+'\n');await browser.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
