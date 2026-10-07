const {chromium,expect}=require('../../../dashboard/node_modules/@playwright/test');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
 try{
 const page=await browser.newPage({viewport:{width:2048,height:1100},hasTouch:true});
 const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/workspace/**',route=>route.request().method()==='GET'?route.continue():route.abort());
 await page.route('http://127.0.0.1:8000/api/workbench/**',async route=>{if(route.request().method()!=='GET')return route.continue();const response=await route.fetch();await route.fulfill({response,headers:{...response.headers(),'access-control-allow-origin':'http://127.0.0.1:3213'}});});
 await page.goto('http://127.0.0.1:3213/stats',{waitUntil:'networkidle'});
 await page.locator('.stats-table-row').first().waitFor();
 const scope=new URL(page.url()).searchParams;
 const global=page.getByRole('combobox',{name:'Search players, teams and pages',exact:true});
 await global.fill('sc');await expect(page.locator('.replica-search-container').getByRole('option').first()).toBeVisible();
 const captions=await page.locator('.replica-search-container .lookup-item-subtitle').allTextContents();
 assert(captions.every(text=>text.length<80 && !text.includes('Observed in selected scope')));
 assert.equal(await page.locator('.lookup-alias-badge').count(),0);
 checks.push({globalCaptions:captions});await page.screenshot({path:`${__dirname}/global-search.png`});
 await global.press('Escape');
 await global.fill('asdf');await expect(page.getByText('No matches for “asdf”. Try a shorter name or another spelling.',{exact:true})).toBeVisible();
 const gap=await page.locator('.replica-search-container').evaluate(e=>e.querySelector('input').getBoundingClientRect().right-e.querySelector('.lookup-clear-btn').getBoundingClientRect().right);assert(gap<=8);
 checks.push({clearRightGap:gap});await page.screenshot({path:`${__dirname}/global-empty.png`});await global.press('Escape');
 const table=page.getByRole('combobox',{name:'Filter players by name',exact:true});
 await table.fill('Scot');const option=page.getByRole('option',{name:/Scottie Barnes/});await expect(option).toBeVisible();
 assert(await option.evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}));
 await page.screenshot({path:`${__dirname}/table-search.png`});await option.click();
 await page.waitForURL(url=>url.searchParams.get('name')==='Scottie Barnes');await expect(page.locator('.stats-table-row')).toHaveCount(1);
 const current=new URL(page.url());assert.equal(current.pathname,'/stats');for(const key of ['releaseId','season','phase','beforeDate','window'])assert.equal(current.searchParams.get(key),scope.get(key));
 await page.locator('.stats-table-row').first().hover();await expect(page.locator('.stats-preview-rail h2')).toHaveText('Scottie Barnes');
 await page.screenshot({path:`${__dirname}/table-selected.png`});checks.push({selection:'Scottie Barnes',scopePreserved:true,previewMatches:true});
 await page.setViewportSize({width:375,height:812});await page.goto('http://127.0.0.1:3213/stats',{waitUntil:'networkidle'});
 await table.fill('Scot');await expect(option).toBeVisible();await option.tap();await page.waitForURL(url=>url.searchParams.get('name')==='Scottie Barnes');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth),375);checks.push({mobileTouchSelection:true});
 assert.deepEqual(errors,[]);fs.writeFileSync(`${__dirname}/search-real.json`,JSON.stringify({checks,errors},null,2)+'\n');console.log(JSON.stringify({checks:checks.length,errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
