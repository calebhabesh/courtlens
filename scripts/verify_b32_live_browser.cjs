// Real Chromium + Next + FastAPI + PostgreSQL. Called by verify_b32_live.py.
// No mocked network responses; accepts only a new evidence directory.
const {chromium}=require('../dashboard/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
(async()=>{
  const output=path.resolve(process.argv[2] || '');
  if(!process.argv[2] || fs.existsSync(output)) throw new Error('New evidence directory required; refusing overwrite');
  fs.mkdirSync(output,{recursive:true});
  const base=process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3140';
  const date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium',headless:true});
  const requests=[];
  const ownedLeases=new Set();
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const pages=await Promise.all([context.newPage(),context.newPage(),context.newPage()]);
    for(const [tab,page] of pages.entries()) page.on('response',async r=>{if(new URL(r.url()).pathname.startsWith('/api/live')){requests.push({tab,url:r.url(),method:r.request().method(),status:r.status()});if(r.request().method()==='POST' && r.ok()){const data=await r.json().catch(()=>null);if(data?.id)ownedLeases.add(data.id);}}});
    await Promise.all(pages.map(page=>page.goto(`${base}/live/${date}?releaseId=5bbb6035-6794-4bb0-b894-7208f52ef7ad&season=2024-25`)));
    for(const page of pages) await page.getByRole('region',{name:'Game slate'}).getByRole('link').first().waitFor();
    const started=Date.now();
    let active;
    for(let attempt=0;attempt<50;attempt++) {
      active=await (await context.request.get(`${base}/api/live?slate_date=${date}`)).json();
      if(active.active_leases>=3)break;
      await pages[0].waitForTimeout(100);
    }
    if(active.active_leases<3) throw new Error('Three browser leases did not activate; '+JSON.stringify(requests));
    const visibility=await Promise.all(pages.map(page=>page.evaluate(()=>document.visibilityState)));
    // Wait in short intervals so the supervising agent can provide progress updates.
    for(let i=0;i<13;i++) await pages[0].waitForTimeout(5000);
    const after=await (await context.request.get(`${base}/api/live?slate_date=${date}`)).json();
    if(after.active_leases<3) throw new Error('Browser heartbeats failed to retain demand');
    await pages[0].screenshot({path:output+'/live-desktop.png',fullPage:true});
    await pages[0].getByRole('button',{name:'Pause updates'}).click();
    await pages[1].goto(`${base}/definitions`);
    await pages[2].close();
    for(let i=0;i<50;i++) {
      const status=await (await context.request.get(`${base}/api/live?slate_date=${date}`)).json();
      if(status.active_leases===0) break;
      if(i===49)throw new Error('Browser demand not released');
      await pages[0].waitForTimeout(100);
    }
    const released=await (await context.request.get(`${base}/api/live?slate_date=${date}`)).json();
    // Cached game detail and retained finalized facts do not create acquisition demand while paused.
    const liveBody=await pages[0].locator('main').innerText();
    if(!liveBody.includes('not yet observed') || !liveBody.includes('Scheduled'))throw new Error('Scheduled gate/missingness absent');
    const scheduledUnknown=after.data.games.every(g=>g.status!=='scheduled'||g.teams.every(t=>t.score===null));
    if(!scheduledUnknown)throw new Error('Scheduled source placeholder leaked');
    await pages[0].goto(`${base}/live/games/0022301188?date=2024-04-14&live_mode=history&releaseId=2e99f37c-231a-4748-9f48-5b9ffa99f228&season=2023-24`);
    await pages[0].getByRole('region',{name:'Selected game details'}).getByText(/Finalized research/).first().waitFor();
    const historical=await (await context.request.get(`${base}/api/live/historical?slate_date=2024-04-14&game_id=0022301188&releaseId=2e99f37c-231a-4748-9f48-5b9ffa99f228&season=2023-24`)).json();
    if(historical.games.length!==1||historical.games[0].provisional||!historical.players?.length)throw new Error('Retained final detail absent');
    const selected=await pages[0].getByRole('region',{name:'Selected game details'}).innerText();
    for(const team of historical.games[0].teams) if(!selected.includes(String(team.score)))throw new Error('Final UI/API scores disagree');
    await pages[0].screenshot({path:output+'/historical-final-desktop.png',fullPage:true});
    await pages[0].setViewportSize({width:375,height:812});
    const mobile=await pages[0].evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    if(mobile.scrollWidth>mobile.width)throw new Error('Mobile body overflow');
    await pages[0].screenshot({path:output+'/historical-final-mobile.png',fullPage:true});
    await pages[0].setViewportSize({width:812,height:375});
    const landscape=await pages[0].evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
    if(landscape.scrollWidth>landscape.width)throw new Error('Landscape body overflow');
    const finalStatus=await (await context.request.get(`${base}/api/live?slate_date=${date}`)).json();
    if(finalStatus.active_leases!==0)throw new Error('Historical UI activated Live');
    fs.writeFileSync(output+'/real-browser.json',JSON.stringify({capture_kind:'real Chromium; production Next; FastAPI; PostgreSQL; real opt-in ESPN scheduled source; no mocked responses',tabs:3,visibility,wall_seconds:(Date.now()-started)/1000,active_leases:active.active_leases,leases_after_65s:after.active_leases,released_leases:released.active_leases,scheduledUnknown,liveBody,historical,selected,mobile,landscape,requests,real_in_game_freshness:'not_yet_observed',final_reconciliation:'not_yet_observed'},null,2)+'\n',{flag:'wx'});
    await context.close();
  } finally {await browser.close();fs.writeFileSync(output+'/requests.json',JSON.stringify(requests,null,2)+'\n',{flag:'wx'});fs.writeFileSync(output+'/owned-leases.json',JSON.stringify([...ownedLeases])+'\n',{flag:'wx'});}
})().catch(error=>{console.error(error);process.exit(1);});
