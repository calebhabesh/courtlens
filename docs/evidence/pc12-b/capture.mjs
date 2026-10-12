// First load, no URL parameters. Isolated production build, real local API.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire(new URL("../../../dashboard/package.json", import.meta.url).pathname);
const { chromium } = require("@playwright/test");
const base = process.env.BASE ?? "http://localhost:3412";
const out = new URL(".", import.meta.url).pathname;
mkdirSync(`${out}/screenshots`, {recursive:true});
const routes = [["teams", "/teams"], ["team-profile", "/teams/1610612760"], ["team-compare", "/team-compare"], ["rapm", "/research/rapm"], ["forecasts", "/forecasts"], ["shooting", "/research/shooting"], ["trends", "/research/trends"], ["player-profile", "/players/1629029"], ["contracts", "/contracts/DEN"]];
const browser = await chromium.launch({executablePath:"/usr/bin/chromium"});
const results=[];
for (const [name, route] of routes) for (const [viewport, size] of Object.entries({desktop:{width:1440,height:900},phone:{width:390,height:844}})) {
  const page = await browser.newPage({viewport:size});
  const errors=[],failed=[];
  page.on("pageerror",e=>errors.push(String(e)));
  page.on("console",m=>{if(m.type()==="error")errors.push(m.text());});
  page.on("response",r=>{if(r.status()>=400)failed.push(`${r.status()} ${new URL(r.url()).pathname}`);});
  const started=Date.now();
  await page.goto(base+route,{waitUntil:"networkidle",timeout:90000});
  await page.waitForFunction(()=>document.fonts.status==="loaded");
  await page.waitForTimeout(600);
  const measured=await page.evaluate(()=>{
    const main=document.querySelector("main");
    const headline=main.querySelector('.pc12-headline, .pc12-profile-trajectory, .chart-frame');
    const visual=headline?.querySelector('svg.chart-ranked-bar, .chart-reliability, .trend-svg, .chart-graphic');
    const visible=el=>el.checkVisibility()&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0;
    const text=main.innerText;
    return {h1:main.querySelector('h1')?.textContent,url:location.pathname+location.search,headline_top:headline?.getBoundingClientRect().top??null,first_visual_top:visual?.getBoundingClientRect().top??null,
      first_table_top:main.querySelector('table')?.getBoundingClientRect().top??null,overflow_px:document.documentElement.scrollWidth-innerWidth,
      chart_count:main.querySelectorAll('.chart-frame,.trend-card').length,
      small_targets:[...main.querySelectorAll('button,a,select,input')].filter(visible).filter(el=>!el.closest('table,p,.ui-why,.chart-ranked-label')).filter(el=>el.getBoundingClientRect().height<40).map(el=>({text:el.textContent?.trim().slice(0,60),height:el.getBoundingClientRect().height})),
      iso_dates:(text.match(/\b20\d\d-\d\d-\d\d\b/g)??[]).length,hashes:(text.match(/\b[0-9a-f]{64}\b/g)??[]).length,
      headline:headline?.textContent,others_groups:[...main.querySelectorAll('.chart-frame')].find(el=>el.textContent.includes('Where the known salary goes'))?.textContent.match(/Others[^$]+/g)??[],
      trajectories_visible:[...main.querySelectorAll('.trend-svg')].filter(visible).length,
      provenance:headline?.querySelector('.chart-meta')?.textContent??headline?.querySelector('.section-note')?.textContent,
    };
  });
  await page.screenshot({path:`${out}/screenshots/${name}-${viewport}.png`,fullPage:false});
  await page.screenshot({path:`${out}/screenshots/${name}-${viewport}-full.png`,fullPage:true});
  results.push({route,name,viewport,ready_ms:Date.now()-started,errors,failed_requests:failed,...measured});
  console.log(name,viewport,JSON.stringify({headline_top:measured.headline_top,first_visual_top:measured.first_visual_top,overflow_px:measured.overflow_px,errors,failed}));
  await page.close();
}
await browser.close();
writeFileSync(`${out}/measurements.json`,JSON.stringify({captured_at:new Date().toISOString(),base,results},null,2)+'\n');
