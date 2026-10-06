/* Production PF04 task paths: real lookup/analytics; explicit transport fixtures below. */
const {chromium,expect}=require('../dashboard/node_modules/@playwright/test');
const fs=require('node:fs');const assert=require('node:assert/strict');
const out='docs/evidence/pf09-freeze-acceptance/selection',base='http://127.0.0.1:3192';
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
 const page=await browser.newPage({viewport:{width:2560,height:1440}});
 const errors=[],checks=[],timings=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 async function open(path){await page.goto(base+path);await page.waitForLoadState('networkidle');}
 async function choose(label,query,name){const input=page.getByRole('combobox',{name:label,exact:true});const start=performance.now();await input.fill(query);const option=page.getByRole('option').filter({hasText:name});await expect(option).toHaveCount(1);timings.push({label,query,settledMilliseconds:performance.now()-start});await option.click();await expect(page.getByRole('button',{name:`Remove ${name} from ${label}`,exact:true})).toBeVisible();}
 const scope='season=2024-25&phase=regular_season&beforeDate=2025-06-30&window=last_10';
 await open('/compare?'+scope);await choose('Player A','jokic','Nikola Jokić');await choose('Player B','doncic','Luka Dončić');
 await page.screenshot({path:out+'/compare-wide.png',fullPage:true});await page.getByRole('button',{name:'Compare players',exact:true}).click();await page.waitForURL(/playerA=203999.*playerB=1629029/);assert.equal(new URL(page.url()).searchParams.get('window'),'last_10');checks.push('real alias selections submit canonical comparison with full scope');
 await open('/wowy?'+scope);await choose('Team','raptors','Toronto Raptors');await choose('Together players','scottie','Scottie Barnes');await choose('Apart players','quickley','Immanuel Quickley');
 await page.screenshot({path:out+'/wowy-wide.png',fullPage:true});checks.push('real team and independent together/apart selections');
 const together=page.getByRole('combobox',{name:'Together players',exact:true});await together.fill('scottie');await expect(page.getByRole('option').filter({hasText:'Scottie Barnes'})).toHaveCount(0);await together.press('Escape');checks.push('duplicate committed player excluded');
 for(const [w,h,label] of [[1440,900,'desktop'],[375,812,'mobile']]){await page.setViewportSize({width:w,height:h});await page.screenshot({path:`${out}/wowy-${label}.png`,fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push(`WOWY fits ${w}px`);}
 await page.setViewportSize({width:1440,height:900});await open('/matchups?'+scope);await choose('Offensive player','Jokić','Nikola Jokić');await choose('Defender (optional)','Doncic','Luka Dončić');await page.screenshot({path:out+'/matchups.png',fullPage:true});checks.push('two shooting fields accept diacritic and alias');
 for(const [route,label,query,name] of [['/research/trends','Target player','barnes','Scottie Barnes'],['/research/distributions','Target player','doncic','Luka Dončić'],['/research/similarity','Target player','jokic','Nikola Jokić'],['/roster-shapes','Team','toronto','Toronto Raptors'],['/learning','Lesson player','jokic','Nikola Jokić']]){await open(route+'?'+scope);await choose(label,query,name);checks.push(`${route} rendered picker commits canonical entity`);}
 await open('/compare?season=2026-27&phase=regular_season&beforeDate=2026-10-05');const a=page.getByRole('combobox',{name:'Player A',exact:true});await a.fill('jokic');await expect(page.getByRole('option').filter({hasText:'Nikola Jokić'})).toContainText('No appearances');checks.push('discoverable identity without selected-season appearances');
 await a.fill('williams');await expect(page.getByRole('option')).not.toHaveCount(0);await a.press('Enter');await expect(page.locator('input[name="playerA"]')).toHaveValue('');await page.screenshot({path:out+'/ambiguity.png',fullPage:true});checks.push('ambiguous Enter leaves canonical selection empty');
 await a.fill('murphy');await expect(page.getByRole('option').filter({hasText:'Trey Murphy III'})).toBeVisible();checks.push('suffix-stripped name discovery');
 await page.route('**/api/workbench/lookup?**',route=>route.fulfill({status:503,json:{detail:'explicit transport fixture'}}));await a.fill('transport failure');await expect(page.getByText('Search is unavailable.',{exact:false}).first()).toBeVisible();await expect(a).toHaveValue('transport failure');await page.screenshot({path:out+'/error.png',fullPage:true});checks.push('fixture transport error preserves draft');await page.unroute('**/api/workbench/lookup?**');
 assert.deepEqual(errors,[]);
 fs.writeFileSync(out+'/browser.json',JSON.stringify({checks,errors,timings,lookupRequests:requests.filter(u=>u.includes('/lookup?')).length,providerRequests:requests.filter(u=>u.includes('/assistant/turn')),viewports:[[2560,1440],[1440,900],[375,812]],dpr:1},null,2)+'\n');
 await browser.close();console.log(JSON.stringify({checks:checks.length,errors,timings}));
})().catch(e=>{console.error(e);process.exit(1);});
