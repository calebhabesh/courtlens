const {chromium,expect}=require('../dashboard/node_modules/@playwright/test');
const {execFileSync}=require('node:child_process');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:false,args:['--window-size=2560,1440','--ozone-platform=x11']});
 const page=await browser.newPage({viewport:null});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3192/settings');await page.waitForLoadState('networkidle');
 const original=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}));
 const window=execFileSync('xdotool',['search','--onlyvisible','--name','CourtLens']).toString().trim().split('\n').at(-1);
 execFileSync('xdotool',['windowfocus','--sync',window]);execFileSync('xdotool',['key','--clearmodifiers','ctrl+0',...Array(5).fill('ctrl+plus')]);await page.waitForTimeout(500);
 const dimensions=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth}));
 assert.equal(dimensions.dpr/original.dpr,2);assert(dimensions.documentWidth<=dimensions.viewport[0]);
 const checks=[];
 for(const route of ['/stats','/settings','/planner','/research/ask','/roster-shapes','/research/expected-shots','/team-compare','/showcase']) {
  await page.goto('http://127.0.0.1:3192'+route);await page.waitForLoadState('networkidle');
  const geometry=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth}));
  assert(geometry.documentWidth<=geometry.viewport[0],route+' overflow at zoom');checks.push({route,...geometry});
  execFileSync('import',['-window',window,'docs/evidence/pf09-freeze-acceptance/'+route.replaceAll('/','-')+'-zoom.png']);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('docs/evidence/pf09-freeze-acceptance/zoom.json',JSON.stringify({original,...dimensions,checks,errors},null,2)+'\n');await browser.close();console.log(JSON.stringify({actualZoom:'200%',...dimensions,checks}));
})().catch(error=>{console.error(error);process.exit(1);});
