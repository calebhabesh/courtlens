const {chromium,expect}=require('../../../dashboard/node_modules/@playwright/test');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs'),assert=require('node:assert/strict');
(async()=>{
 const xvfb=spawn('Xvfb',['-displayfd','1','-screen','0','2560x1440x24','-nolisten','tcp'],{stdio:['ignore','pipe','pipe']});
 let browser;
 try{
 const display=await new Promise((resolve,reject)=>{xvfb.once('error',reject);xvfb.stdout.once('data',data=>resolve(data.toString().trim()));});
 const env={...process.env,DISPLAY:`:${display}`};
 browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:false,env,args:['--window-size=2560,1440','--ozone-platform=x11']});
 const page=await browser.newPage({viewport:null});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3213/stats?density=standard',{waitUntil:'networkidle'});
 const original=await page.evaluate(()=>({width:innerWidth,dpr:devicePixelRatio}));
 const windowId=execFileSync('xdotool',['search','--onlyvisible','--name','CourtLens'],{env}).toString().trim().split('\n').at(-1);
 execFileSync('xdotool',['windowfocus','--sync',windowId],{env});execFileSync('xdotool',['key','--clearmodifiers','ctrl+0',...Array(5).fill('ctrl+plus')],{env});
 await expect.poll(()=>page.evaluate(()=>devicePixelRatio)).toBe(original.dpr*2);
 const dimensions=await page.evaluate(()=>({viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,documentWidth:document.documentElement.scrollWidth}));
 assert(dimensions.documentWidth<=dimensions.viewport[0]);
 const row=page.locator('.stats-table-row').first();await row.focus();await expect(row).toBeFocused();
 const rail=page.getByRole('complementary',{name:'Player preview'});await expect(rail.locator('h2')).toHaveText(await row.locator('.player-cell-name').textContent());
 const region=page.getByRole('region',{name:'Player statistics scroll area',exact:true});await region.focus();await page.keyboard.press('d');
 await expect.poll(()=>region.evaluate(el=>el.scrollLeft)).toBeGreaterThan(0);
 await page.screenshot({path:`${__dirname}/zoom-200.png`,fullPage:true});
 assert.deepEqual(errors,[]);fs.writeFileSync(`${__dirname}/zoom.json`,JSON.stringify({actualBrowserZoom:'200%',original,...dimensions,errors},null,2)+'\n');console.log(dimensions);
 }finally{if(browser)await browser.close();xvfb.kill();}
})().catch(e=>{console.error(e);process.exit(1)});
