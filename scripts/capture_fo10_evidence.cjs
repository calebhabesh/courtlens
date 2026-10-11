/* FO10 measured screenshots from the local stack. Read-only finance queries; no source acquisition. */
const { chromium } = require('../dashboard/node_modules/playwright');
const fs = require('node:fs');
const path = require('node:path');
const base = process.env.FO10_BASE_URL || 'http://localhost:3100';
const api = process.env.FO10_API_URL || 'http://localhost:8000';
const output = path.resolve('docs/evidence/fo10');

(async () => {
  const catalog = await fetch(`${api}/api/workbench/catalog`).then(r => r.json());
  const books = await fetch(`${api}/api/workbench/operations/finance/books`).then(r => r.json());
  const book = books[0]; // Explicit pinned test selection, never a product default.
  const scope = new URLSearchParams({releaseId:catalog.release_id,season:catalog.default_season,phase:catalog.default_phase,beforeDate:catalog.default_before_date});
  const finance = new URLSearchParams(scope);
  if(book) {
    finance.set('finance_book_id',book.book_id);finance.set('finance_financial_season','2025-26');finance.set('finance_known_at',book.created_at);finance.set('finance_effective_on','2025-02-12');finance.set('finance_team_id','1610612761');
  }
  const pages = [
    ['teams',`/teams?${scope}`],
    ['team-overview',`/teams/1610612761?${scope}`],
    ['team-factors',`/teams/1610612761?${scope}&tab=factors`],
    ['team-schedule',`/teams/1610612761?${scope}&tab=schedule`],
    ['stat-shift',`/stat-line-shift?${scope}&team_id=TOR&player_id=1630567&together=1627742`],
    ['contracts',`/contracts?${finance}`],
    ['team-contracts',`/contracts/TOR?${finance}`],
    ['free-agency',`/free-agency?${finance}`],
    ['contracts-unpinned','/contracts']
  ];
  fs.mkdirSync(output,{recursive:true});
  const browser = await chromium.launch({executablePath:process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium',headless:true});
  const measurements=[];
  for(const width of [1440,768,390]) for(const [name,url] of pages) {
    const page=await browser.newPage({viewport:{width,height:width===390?844:900}});const errors=[];
    page.on('pageerror',error=>errors.push(error.message));await page.emulateMedia({reducedMotion:'reduce'});
    await page.goto(base+url);await page.waitForLoadState('networkidle');await page.evaluate(()=>document.fonts.ready);
    if(name==='stat-shift') await page.locator('.floor-result,[role="alert"]').first().waitFor();
    if(['contracts','team-contracts','free-agency'].includes(name)&&book) await page.getByRole('region',{name:'Financial query result'}).waitFor();
    await page.waitForFunction(()=>[...document.images].filter(image=>{const r=image.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0&&r.width;}).every(image=>image.complete));
    const values=await page.evaluate(()=>{
      const root=document.querySelector('.ui-page');
      const visible=element=>{const r=element.getBoundingClientRect();return !!(r.width&&r.height&&element.checkVisibility());};
      const text=[...root.querySelectorAll('*')].filter(visible).flatMap(element=>[...element.childNodes].filter(node=>node.nodeType===Node.TEXT_NODE).map(node=>node.textContent)).join(' ');
      const controls=[...root.querySelectorAll('.ui-filter-bar input,.ui-filter-bar select,.ui-filter-bar button,.ui-tab-trigger')].filter(visible).map(element=>({label:element.getAttribute('aria-label')||element.textContent.trim(),height:element.getBoundingClientRect().height}));
      const main=root.querySelector('.team-explorer-stack table,.team-profile-hero,.floor-result,.finance-summary') || root.querySelector('.ui-gated-note');
      const filter=root.querySelector('.ui-filter-bar');
      return {title:root.querySelector('h1')?.textContent,template:root.dataset.template,documentWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,mainTop:main?.getBoundingClientRect().top,filterBottom:filter?.getBoundingClientRect().bottom,controls,filtersButton:[...root.querySelectorAll('button')].some(element=>visible(element)&&/^Filters/.test(element.textContent)),rawDates:(text.match(/\b\d{4}-\d{2}-\d{2}\b/g)||[]).length,uuids:(text.match(/\b[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}\b/gi)||[]).length,hashes:(text.match(/\b[\da-f]{64}\b/gi)||[]).length,cutoffRules:(text.match(/game_date\s*</g)||[]).length,loadButtons:[...root.querySelectorAll('button')].filter(element=>visible(element)&&/^Load/.test(element.textContent.trim())).length,nativeDates:root.querySelectorAll('input[type="date"]').length,noticeBoxes:root.querySelectorAll('.notice-box').length};
    });
    measurements.push({name,url,width,...values,errors});
    await page.screenshot({path:path.join(output,`${name}-${width}.png`),fullPage:false});await page.close();
  }
  fs.writeFileSync(path.join(output,'measurements.json'),JSON.stringify({capturedAt:new Date().toISOString(),base,api,releaseId:catalog.release_id,financeBookId:book?.book_id,measurements},null,2)+'\n');
  await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
