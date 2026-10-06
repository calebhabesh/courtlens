/* Final CSS acceptance supplements the retained production interaction run. */
const {chromium,expect}=require('../dashboard/node_modules/@playwright/test');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});
 const page=await browser.newPage();const report={checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
 for(const [width,height,label] of [[2560,1440,'wide'],[1440,900,'desktop'],[375,812,'mobile']]){
  await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:3154/stats?limit=25&identityMode=photos&density=standard');await page.waitForLoadState('networkidle');
  await page.waitForFunction(()=>document.fonts.status==='loaded');
  const region=page.getByRole('region',{name:'Player statistics scroll area',exact:true});
  const filter=page.getByLabel('Filter players by name');await expect(filter).toBeVisible();assert((await filter.boundingBox()).width>=200);
  await region.evaluate(el=>{el.scrollLeft=300;el.scrollTop=150;});
  const geometry=await region.evaluate(el=>{const row=el.querySelector('tbody tr');return {viewport:[innerWidth,innerHeight],documentWidth:document.documentElement.scrollWidth,region:el.getBoundingClientRect().toJSON(),name:row.querySelector('.pinned-col-name').getBoundingClientRect().toJSON(),metrics:[...row.querySelectorAll('td.num')].map(td=>td.getBoundingClientRect().width),rowHeight:row.getBoundingClientRect().height};});
  assert(geometry.documentWidth<=width);assert(geometry.metrics.every(w=>w<=110));assert(Math.abs(geometry.name.x-geometry.region.x-(width>700?88:0))<3);
  await page.screenshot({path:`docs/evidence/pf05-tables/stats-${label}-scrolled.png`,fullPage:true});
  await region.evaluate(el=>{el.scrollLeft=0;el.scrollTop=0;});await page.locator('h1').click();await page.waitForTimeout(200);
  await page.screenshot({path:`docs/evidence/pf05-tables/stats-${label}.png`,fullPage:true});
  report.checks.push({label,...geometry,name_filter_width:(await filter.boundingBox()).width});
 }
 assert.deepEqual(report.errors,[]);fs.writeFileSync('docs/evidence/pf05-tables/layout.json',JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report));
})().catch(e=>{console.error(e);process.exit(1);});
