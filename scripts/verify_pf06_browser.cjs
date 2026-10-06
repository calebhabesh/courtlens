const {chromium,expect}=require('../dashboard/node_modules/@playwright/test');
const fs=require('node:fs'),assert=require('node:assert/strict');
const directory='docs/evidence/pf06-routes';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});
 const page=await browser.newPage(); const report={routes:[],checks:[],errors:[]};
 page.on('pageerror',e=>report.errors.push(e.message));
 // No Live demand or persistent personal actions in this read-only route audit.
 await page.route('**/api/live/leases**',route=>route.fulfill({status:503,json:{detail:'Live demand intentionally excluded from PF06 read-only audit'}}));
 const inventory=JSON.parse(fs.readFileSync('docs/evidence/pf04-selection/route-inventory.json'));
 const routes=inventory.filter(entry=>!entry.route.includes('[') && entry.route!=='/live').map(entry=>entry.route);
 routes.push('/live?live_mode=history','/players/1630567','/teams/TOR','/contracts/TOR','/live/2026-04-12?live_mode=history','/live/games/unknown?live_mode=history');
 const saved=await (await fetch('http://127.0.0.1:8000/api/workbench/assistant/investigations?limit=1')).json();
 if(saved[0]) routes.push('/investigations/saved/'+saved[0].id);
 const bracket=await (await fetch('http://127.0.0.1:8000/api/workbench/playoffs?season=2025-26')).json();
 const findSeries=value=>{if(!value || typeof value!=='object')return null;if(value.series_id)return value.series_id;return Object.values(value).map(findSeries).find(Boolean);};
 const series=findSeries(bracket);routes.push('/playoffs/'+(series || 'unknown'));

 for (const route of routes) {
  await page.setViewportSize({width:1440,height:900});
  await page.goto('http://127.0.0.1:3154'+route,{waitUntil:'networkidle'});
  await page.waitForFunction(()=>document.fonts.status==='loaded');
  const heading=await page.locator('h1').allTextContents();
  const record={route,heading,states:await page.locator('main [role=alert],main [role=status],main .empty-state').allTextContents(),desktopWidth:await page.evaluate(()=>document.documentElement.scrollWidth)};
  await page.setViewportSize({width:375,height:812});
  record.mobileWidth=await page.evaluate(()=>document.documentElement.scrollWidth);
  record.overflow=record.mobileWidth>375;
  report.routes.push(record);
  fs.writeFileSync(directory+'/browser.json',JSON.stringify(report,null,2)+'\n');
 }
 for (const [route,label] of [['/settings','settings'],['/research/epv','source'],['/roster-shapes','roster'],['/research/expected-shots','research'],['/research/ask','ask'],['/wowy','wowy']]) {
  for(const [width,height,size] of [[2560,1440,'wide'],[1440,900,'desktop'],[375,812,'mobile']]){
   await page.setViewportSize({width,height}); await page.goto('http://127.0.0.1:3154'+route);await page.waitForLoadState('networkidle');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),route+' '+size+' overflow');
   await page.screenshot({path:`${directory}/${label}-${size}.png`,fullPage:true});
   report.checks.push(`${route} ${size} contained layout`);
  }
 }
 await page.setViewportSize({width:1440,height:900});await page.goto('http://127.0.0.1:3154/stats');await page.waitForLoadState('networkidle');
 await page.getByRole('button',{name:'Availability',exact:true}).click();
 await expect(page.getByRole('menuitem',{name:/WOWY/})).toBeVisible();
 const secondary=await page.locator('.availability-menu a').evaluateAll(items=>items.map(item=>new URL(item.href).pathname));
 await page.keyboard.press('Escape');await page.setViewportSize({width:375,height:812});
 await page.getByRole('button',{name:'Toggle navigation drawer'}).click();
 const mobile=await page.locator('.replica-mobile-drawer .replica-mobile-section').filter({has:page.getByText('Availability',{exact:true})}).locator('a').evaluateAll(items=>items.map(item=>new URL(item.href).pathname));
 assert.deepEqual(mobile,secondary); report.checks.push('desktop/mobile secondary availability agrees');
 await expect(page.locator('.replica-mobile-drawer').getByRole('link',{name:'Expected Shots',exact:true})).toBeVisible();report.checks.push('sealed research remains primary');
 assert(report.routes.every(record => !record.overflow && record.desktopWidth <= 1440), "Route audit overflow");
 assert.deepEqual(report.errors,[]);fs.writeFileSync(directory+'/browser.json',JSON.stringify(report,null,2)+'\n');
 await browser.close();console.log(JSON.stringify({routes:report.routes.length,overflows:report.routes.filter(r=>r.overflow),checks:report.checks.length,errors:report.errors}));
})().catch(e=>{console.error(e);process.exit(1);});
