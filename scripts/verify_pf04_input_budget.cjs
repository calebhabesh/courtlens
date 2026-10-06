const {chromium,expect}=require('../dashboard/node_modules/@playwright/test');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('http://127.0.0.1:3154/compare?season=2024-25&phase=regular_season&beforeDate=2025-06-30');await page.waitForLoadState('networkidle');
 const input=page.getByRole('combobox',{name:'Player A',exact:true}),samples=[];
 for(let n=0;n<20;n++){
   await input.fill('');await page.waitForTimeout(150);
   const [query,name]=n%2 ? ['doncic','Luka Dončić'] : ['jokic','Nikola Jokić'];
   await input.evaluate((element,name)=>{
     window.pf04Measurement=null;
     element.addEventListener('input',()=>{
       const start=performance.now();
       const observer=new MutationObserver(()=>{
         const root=element.closest('.lookup-combobox');
         if([...root.querySelectorAll('[role="option"]')].some(item=>item.textContent.includes(name)) && !root.textContent.includes('Searching…')){
           window.pf04Measurement=performance.now()-start;observer.disconnect();
         }
       });observer.observe(element.closest('.lookup-combobox'),{subtree:true,childList:true,attributes:true});
     },{once:true});
   },name);
   await input.fill(query);await expect.poll(()=>page.evaluate(()=>window.pf04Measurement)).not.toBeNull();
   samples.push(await page.evaluate(()=>window.pf04Measurement));
 }
 const p95=[...samples].sort((a,b)=>a-b)[Math.ceil(samples.length*.95)-1];
 const report={measurement:'Browser input event to rendered matching option; includes debounce/cache/network/React; alternating real aliases, one field; warm browser session',samples_ms:samples,p95_ms:p95,target_ms:200,passes:p95<=200,viewport:[1440,900],dpr:1};fs.writeFileSync('docs/evidence/pf04-selection/input-budget.json',JSON.stringify(report,null,2)+'\n');assert(report.passes,JSON.stringify(report));await browser.close();console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exit(1);});
