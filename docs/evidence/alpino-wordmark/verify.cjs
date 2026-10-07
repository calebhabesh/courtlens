const {chromium,expect}=require('../../../dashboard/node_modules/@playwright/test');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
 try{
 const page=await browser.newPage();const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/workspace/**',r=>r.request().method()==='GET'?r.continue():r.abort());
 const artifact=fs.readFileSync('dashboard/lib/courtlens-wordmark.ts','utf8');const expectedPath=JSON.parse(artifact.match(/WORDMARK_PATH = (.*);/)[1]);
 for(const [width,height] of [[2048,1100],[1440,900],[375,812]]){
  await page.setViewportSize({width,height});await page.goto('http://localhost:3100/stats',{waitUntil:'networkidle'});
  await expect(page.locator('.brand-title .courtlens-wordmark')).toBeVisible();
  const metrics=await page.locator('.brand').evaluate(e=>{const c=e=>{const b=e.getBoundingClientRect();return b.y+b.height/2};const r=e.querySelector('.courtlens-wordmark').getBoundingClientRect();return {centerOffset:c(e.querySelector('.brand-title'))-c(e.querySelector('.brand-mark-svg')),wordmarkWidth:r.width,wordmarkHeight:r.height,documentWidth:document.documentElement.scrollWidth};});
  assert(Math.abs(metrics.centerOffset)<1);assert(metrics.documentWidth<=width);assert.equal(metrics.wordmarkHeight,14);
  assert.equal(await page.locator('.brand-title path').getAttribute('d'),expectedPath);
  assert.equal(await page.locator('.stats-table-brand path').getAttribute('d'),expectedPath);
  checks.push({viewport:[width,height],...metrics});await page.screenshot({path:`${__dirname}/stats-${width}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1440,height:900});
 await page.goto('http://localhost:3100/players/1629029',{waitUntil:'networkidle'});
 assert.equal(await page.locator('.player-detail-container .courtlens-wordmark path').getAttribute('d'),expectedPath);
 const svgEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export SVG',exact:true}).click();const svgDownload=await svgEvent;await svgDownload.saveAs(`${__dirname}/profile.svg`);
 const svg=fs.readFileSync(`${__dirname}/profile.svg`,'utf8');assert(svg.includes(expectedPath));assert(!svg.includes('fontshare.com/wf'));
 const pngEvent=page.waitForEvent('download');await page.getByRole('button',{name:'Export PNG',exact:true}).click();const pngDownload=await pngEvent;await pngDownload.saveAs(`${__dirname}/profile.png`);assert.equal(fs.readFileSync(`${__dirname}/profile.png`).subarray(0,8).toString('hex'),'89504e470d0a1a0a');
 checks.push({profileSvg:'Alpino outline matches header and table',profilePng:'export succeeds'});
 await page.goto('http://localhost:3100/showcase',{waitUntil:'networkidle'});
 const showcasePaths=await page.locator('.showcase-container .courtlens-wordmark path').evaluateAll(paths=>paths.map(p=>p.getAttribute('d')));
 assert.equal(showcasePaths.length,2);assert(showcasePaths.every(path=>path===expectedPath));checks.push({showcase:'header and watermark match Alpino'});
 assert.deepEqual(errors,[]);fs.writeFileSync(`${__dirname}/browser.json`,JSON.stringify({runtime:'Existing development server with real FastAPI/PostgreSQL; read-only',checks,errors},null,2)+'\n');console.log(JSON.stringify({checks:checks.length,errors}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e.message);process.exit(1)});
