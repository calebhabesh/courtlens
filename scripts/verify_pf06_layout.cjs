const {chromium}=require('../dashboard/node_modules/@playwright/test');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});const page=await browser.newPage();const checks=[];
 for(const [width,height,label] of [[2560,1440,'wide'],[1440,900,'desktop'],[375,812,'mobile']]){
  await page.setViewportSize({width,height});
  for(const [route,name] of [['/stats','stats'],['/roster-shapes','roster']]){
   await page.goto('http://127.0.0.1:3154'+route);await page.waitForLoadState('networkidle');
   const geometry=await page.evaluate(()=>{const content=document.querySelector('.advanced-research,.workbench-content');return {viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth,padding:content?getComputedStyle(content).padding:null};});
   assert(geometry.documentWidth<=width);
   if(name==='roster')assert.equal(geometry.padding,width===375?'16px':'24px');
   await page.screenshot({path:`docs/evidence/pf06-routes/${name}-${label}.png`,fullPage:true});checks.push({route,label,...geometry});
  }
 }
 fs.writeFileSync('docs/evidence/pf06-routes/layout.json',JSON.stringify({checks},null,2)+'\n');await browser.close();console.log(checks);
})().catch(error=>{console.error(error);process.exit(1);});
