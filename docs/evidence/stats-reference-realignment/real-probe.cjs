const {chromium}=require('../../../dashboard/node_modules/playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const evidence=__dirname;
(async()=>{
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
  const page=await browser.newPage({viewport:{width:2048,height:1100}});
  const errors=[],measurements=[],checks=[];
  page.on('pageerror',e=>errors.push(e.message));
  // The harness remains read-only against the real personal workspace.
  await page.route('**/api/workspace/**',route=>route.request().method()==='GET'?route.continue():route.abort());
  await page.goto('http://127.0.0.1:3213/stats?density=standard',{waitUntil:'networkidle'});
  await page.locator('.stats-table-row').first().waitFor();
  const url=new URL(page.url()),params=url.searchParams;
  const query={release_id:params.get('releaseId'),season:params.get('season'),phase:params.get('phase'),before_date:params.get('beforeDate'),entity_kind:'player',window:{kind:params.get('window')},team_scope:{team_id:null,participation_only:true},sort:[{field:'pts_per_game',direction:'desc',nulls_last:true}],page:{limit:50}};
  const response=await page.request.post('http://127.0.0.1:8000/api/workbench/query',{data:{query,presentation:{player_ids:null}}});
  assert.equal(response.status(),200);const real=await response.json();
  assert.equal(real.items.length,50);
  const row=page.locator('.stats-table-row').first(),rail=page.getByRole('complementary',{name:'Player preview'});
  assert.equal(await row.getAttribute('data-player-id'),real.items[0].player_id);
  const points=await row.locator('.stat-main-value').nth(3).textContent();
  assert.equal(points,real.items[0].metrics.pts_per_game.toFixed(1));
  assert.equal(await row.locator('.stat-pct-sublabel').nth(3).textContent(),String(real.items[0].percentiles.pts_per_game));
  checks.push({check:'Real API first-row player/PPG/percentile reconciliation',player:real.items[0].player_name,points,percentile:real.items[0].percentiles.pts_per_game,eligible:real.total_eligible_players});
  await page.screenshot({path:`${evidence}/reference-initial.png`});
  await row.hover();await page.screenshot({path:`${evidence}/reference-hover.png`});
  assert.deepEqual(await rail.locator('dd strong').allTextContents(),await row.locator('.stat-main-value').allTextContents());
  await rail.getByRole('button',{name:'Pin player preview',exact:true}).click();
  await page.locator('.stats-table-row').nth(1).hover();
  assert.equal(await rail.locator('h2').textContent(),real.items[0].player_name);
  await page.screenshot({path:`${evidence}/reference-pinned.png`});
  checks.push({check:'Real hover values match every visible metric; pin holds while hovering another row',passed:true});
  for(const [width,height,label] of [[2560,1440,'wide'],[1440,900,'desktop'],[375,812,'mobile'],[1280,900,'narrow-css']]){
    await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:3213/stats?density=standard',{waitUntil:'networkidle'});
    const geometry=await page.evaluate(()=>{const q=s=>document.querySelector(s).getBoundingClientRect();const rail=document.querySelector('.stats-preview-rail');return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},documentWidth:document.documentElement.scrollWidth,rowHeight:q('.stats-table-row').height,region:q('.stats-scroll-region').width,table:q('.dense-stats-table').width,railWidth:getComputedStyle(rail).display==='none'?0:rail.getBoundingClientRect().width,identityWidths:[...document.querySelector('.stats-table-row').children].slice(0,3).map(c=>c.getBoundingClientRect().width),metricWidths:[...document.querySelector('.stats-table-row').querySelectorAll('.stats-metric-cell')].map(c=>c.getBoundingClientRect().width),footer:q('.stats-pagination-footer').bottom}});
    assert.equal(geometry.documentWidth,width);assert.equal(geometry.rowHeight,40);assert.equal(geometry.railWidth,width>=1200?250:0);
    measurements.push({label,...geometry});await page.screenshot({path:`${evidence}/${label}-initial.png`,fullPage:true});
    if(width>=1200){await page.locator('.stats-table-row').first().focus();await page.screenshot({path:`${evidence}/${label}-focus.png`});assert.equal(await page.locator('.stats-table-row').first().evaluate(r=>r===document.activeElement),true);}
    else{const region=page.getByRole('region',{name:'Player statistics scroll area'});await region.evaluate(el=>el.scrollLeft=el.scrollWidth);await page.locator('.stats-table-row').first().getByRole('button',{name:`Open details for ${real.items[0].player_name}`}).click();await page.getByRole('dialog',{name:real.items[0].player_name,exact:true}).waitFor();await page.screenshot({path:`${evidence}/mobile-detail.png`});await page.getByRole('button',{name:'Close player details sidebar'}).click();}
  }
  await page.setViewportSize({width:1440,height:900});
  const presets=['overview','shooting','defense','trueshooting','advanced','playmaking','rebounding','impact','sixfactor'];
  for(const preset of presets){await page.goto(`http://127.0.0.1:3213/stats?viewId=${preset}&density=standard`,{waitUntil:'networkidle'});const r=page.locator('.stats-table-row').first();await r.focus();assert.deepEqual(await rail.locator('dd strong').allTextContents(),await r.locator('.stat-main-value').allTextContents());const alignment=await page.locator('.dense-stats-table').evaluate(t=>({headers:[...t.tHead.rows].map(r=>[...r.cells].reduce((n,c)=>n+c.colSpan,0)),body:t.tBodies[0].rows[0].cells.length}));assert(alignment.headers.every(n=>n===alignment.body));const metricWidths=await r.locator(".stats-metric-cell").evaluateAll(cells=>cells.map(cell=>cell.getBoundingClientRect().width));assert(Math.max(...metricWidths)<=141);checks.push({preset,alignment,maxMetricWidth:Math.max(...metricWidths),previewMatchesRow:true});}
  for(const mode of ['raw','per_36']){await page.goto(`http://127.0.0.1:3213/stats?countingMode=${mode}`,{waitUntil:'networkidle'});const r=page.locator('.stats-table-row').first();await r.focus();assert.deepEqual(await rail.locator('dd strong').allTextContents(),await r.locator('.stat-main-value').allTextContents());checks.push({countingMode:mode,previewMatchesRow:true});}
  for(const mode of ['photos','logos','initials','none']){await page.goto(`http://127.0.0.1:3213/stats?identityMode=${mode}`,{waitUntil:'networkidle'});assert.equal(await page.locator('.stats-table-row').first().locator('.stats-guide-cell').count(),mode==='none'?0:3);checks.push({guides:mode,passed:true});}
  assert.deepEqual(errors,[]);
  fs.writeFileSync(`${evidence}/real-browser.json`,JSON.stringify({runtime:'Isolated production standalone Next + existing real FastAPI/PostgreSQL; read-only',query,measurements,checks,errors},null,2)+'\n');
  console.log(JSON.stringify({checks:checks.length,viewports:measurements.length,errors}));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
