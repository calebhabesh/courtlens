/* PF03 actual production identities; fixture-only asset failure distinguished. */
const { chromium, expect } = require('../dashboard/node_modules/@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = 'http://127.0.0.1:3154';
const out = 'docs/evidence/pf03-branding';
(async () => {
  const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
  const page = await browser.newPage({viewport:{width:2560,height:1440}});
  const errors = [], brandingRequests = [], checks = [];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request', request => {if(request.url().includes('/team-logos/')) brandingRequests.push(request.url());});
  async function stats(params, teams, label) {
    await page.goto(base+'/stats?'+new URLSearchParams({season:'2024-25',phase:'regular_season',beforeDate:'2025-06-30',name:'Dončić',...params}));
    const row = page.locator('.dense-stats-table tbody tr').filter({hasText:'Luka Dončić'});
    await expect(row).toHaveCount(1);
    await expect(row.locator('.pinned-col-teams .team-logo-stack')).toHaveAttribute('aria-label','Teams represented in selected scope: '+teams.join(', '));
    await row.locator('.pinned-col-teams .team-logo-stack').focus();
    await expect(row.locator('.pinned-col-teams .team-logo-stack')).toBeFocused();
    const images = row.locator('.pinned-col-teams .team-logo img');
    await expect(images).toHaveCount(teams.length);
    await expect.poll(()=>images.evaluateAll(nodes=>nodes.every(img=>img.complete && img.naturalWidth>0))).toBe(true);
    await page.screenshot({path:`${out}/${label}.png`,fullPage:true});
    checks.push({name:label,teams});
  }
  await stats({},['DAL','LAL'],'trade-combined-wide');
  await stats({teamId:'DAL'},['DAL'],'trade-team-filter');
  await stats({beforeDate:'2025-02-02'},['DAL'],'trade-historical-cutoff');
  await stats({window:'last_5'},['LAL'],'trade-last-five');
  await stats({identityMode:'logos'},['DAL','LAL'],'trade-logo-mode');
  await expect(page.locator('.player-cell .team-logo-stack')).toHaveAttribute('aria-label','Teams represented in selected scope: DAL, LAL');
  for (const [width,height,label] of [[1440,900,'desktop'],[375,812,'mobile']]) {
    await page.setViewportSize({width,height});
    await stats({},['DAL','LAL'],`trade-${label}`);
    const dimensions=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth}));
    assert(dimensions.documentWidth<=dimensions.width, JSON.stringify(dimensions));
  }
  await page.setViewportSize({width:1440,height:900});
  async function lookup(cutoff, teams, label) {
    await page.goto(base+`/stats?season=2024-25&phase=regular_season&beforeDate=${cutoff}`);
    await page.locator('.dense-stats-table tbody tr').first().waitFor();
    // Wait for workspace hydration before interaction, matching prior fixture evidence.
    await expect(page.locator('body')).not.toContainText('Loading personal workspace…');
    const input = page.getByRole('combobox').first();
    await input.fill('doncic');
    const option = page.getByRole('option').filter({hasText:'Luka Dončić'});
    await expect(option).toHaveCount(1);
    await expect(option.locator('.team-logo-stack')).toHaveAttribute('aria-label','Teams observed in selected scope: '+teams.join(', '));
    await expect.poll(()=>option.locator('.team-logo img').evaluateAll(nodes=>nodes.every(img=>img.complete && img.naturalWidth>0))).toBe(true);
    await page.screenshot({path:`${out}/${label}.png`,fullPage:true});
    checks.push({name:label,teams});
    await input.fill('raptors');
    const team = page.getByRole('option').filter({hasText:'Toronto Raptors'});
    await expect(team.locator('.team-logo img')).toHaveCount(1);
    await expect.poll(()=>team.locator('.team-logo img').evaluate(img=>img.complete && img.naturalWidth>0)).toBe(true);
    await page.screenshot({path:`${out}/team-${label}.png`,fullPage:true});
    checks.push({name:'team '+label,team:'TOR'});
  }
  await lookup('2025-02-02',['DAL'],'lookup-before-trade');
  await lookup('2025-06-30',['DAL','LAL'],'lookup-combined');
  await page.goto(base+'/teams?season=2024-25&phase=regular_season&beforeDate=2025-06-30');
  const teamImages = page.locator('.data-table tbody .team-logo img');
  await expect(teamImages).toHaveCount(30);
  for(const image of await teamImages.all()) await image.scrollIntoViewIfNeeded();
  await expect.poll(()=>teamImages.evaluateAll(nodes=>nodes.every(img=>img.complete && img.naturalWidth>0))).toBe(true);
  await page.screenshot({path:`${out}/teams-table.png`,fullPage:true});
  checks.push({name:'30 real team rows use local artwork'});
  await page.getByRole('button',{name:'Franchise Cards',exact:true}).click();
  await expect(page.locator('.team-logo img')).toHaveCount(30);
  for(const image of await page.locator('.team-logo img').all()) await image.scrollIntoViewIfNeeded();
  await page.screenshot({path:`${out}/teams-cards.png`,fullPage:true});
  checks.push({name:'team cards reuse branding'});
  await page.goto(base+'/teams/TOR?season=2024-25&phase=regular_season&beforeDate=2025-06-30');
  await expect(page.locator('.player-identity-card .team-logo img')).toHaveCount(1);
  checks.push({name:'team profile reuses branding'});
  await page.goto(base+'/compare?playerA=1629029&playerB=1630567&season=2024-25&phase=regular_season&beforeDate=2025-06-30&window=season');
  await expect(page.locator('.team-logo-stack').filter({has:page.locator('.team-logo[aria-label="DAL"]')})).toHaveAttribute('aria-label','Teams represented in selected scope: DAL, LAL');
  await page.screenshot({path:`${out}/comparison.png`,fullPage:true});
  checks.push({name:'comparison cards preserve represented teams'});

  // Historical-code fixture tests artwork policy; retained source covers 2023–26.
  await page.route('**/api/workbench/lookup?**',async route=>{
    const response = await route.fetch();
    const json = await response.json();
    for(const item of json.items || []) if(item.kind==='player') {
      item.team_association = {...item.team_association,teams:['NJN'],basis:'selected_scope'};
      item.subtitle='NJN · Observed in selected scope (historical-code fixture)';
    }
    await route.fulfill({response,json});
  });
  await page.goto(base+'/stats?season=2023-24&phase=regular_season&beforeDate=2024-06-30');
  await page.locator('.dense-stats-table tbody tr').first().waitFor();
  await page.getByRole('combobox').first().fill('donci');
  const historical = page.getByRole('option').filter({hasText:'Luka Dončić'});
  await expect(historical.locator('.team-logo-fallback')).toHaveText('NJN');
  await expect(historical.locator('.team-logo img')).toHaveCount(0);
  await page.screenshot({path:`${out}/historical-code-fallback.png`,fullPage:true});
  checks.push({name:'unknown historical code remains NJN without invented BKN mapping',fixture:true});
  await page.unroute('**/api/workbench/lookup?**');

  // Intentional failure fixture changes only image transport, never analytical response.
  await page.route('**/team-logos/**',route=>route.abort());
  await page.goto(base+'/stats?season=2024-25&phase=regular_season&beforeDate=2025-06-30&name=Dončić');
  await expect(page.locator('.dense-stats-table tbody tr').filter({hasText:'Luka Dončić'})).toHaveCount(1);
  await expect(page.locator('.pinned-col-teams .team-logo-fallback')).toHaveCount(2);
  await expect(page.locator('tbody .pinned-col-teams')).toContainText('DAL');
  await expect(page.locator('tbody .pinned-col-teams')).toContainText('LAL');
  await page.screenshot({path:`${out}/asset-failure.png`,fullPage:true});
  checks.push({name:'failed artwork preserves name, abbreviation and scope',fixture:true});
  assert(brandingRequests.every(url=>url.startsWith(base+'/team-logos/')));
  assert.deepEqual(errors,[]);
  fs.writeFileSync(`${out}/browser.json`,JSON.stringify({environment:'production webpack + real FastAPI/PostgreSQL',checks,errors,brandingRequests},null,2)+'\n');
  await browser.close();
  console.log(JSON.stringify({checks:checks.length,pageErrors:errors.length,localBrandingRequests:brandingRequests.length}));
})().catch(error=>{console.error(error);process.exit(1);});
