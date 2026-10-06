const {chromium,expect}=require('../dashboard/node_modules/@playwright/test');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium'});const page=await browser.newPage();const checks=[];
 await page.goto('http://127.0.0.1:3154/teams');await page.waitForLoadState('networkidle');
 await expect(page.getByLabel('Filter by season')).toHaveValue('2025-26');await expect(page.getByLabel('Before date cutoff')).toHaveValue('2026-04-13');checks.push('Teams catalog default season/cutoff');
 await page.getByLabel('Filter by season').selectOption('2024-25');await page.waitForURL(/season=2024-25/);await expect(page.getByLabel('Before date cutoff')).toHaveValue('2025-04-14');checks.push('Team context navigation synchronizes cutoff');
 await page.goto('http://127.0.0.1:3154/playoffs?season=2025-26&phase=regular_season');await page.waitForLoadState('networkidle');await expect(page.getByLabel('Filter by competition phase')).toHaveValue('playoffs');checks.push('Postseason UI matches query phase');
 await page.goto('http://127.0.0.1:3154/research/epv?season=2024-25&phase=playoffs&beforeDate=2025-06-01&releaseId=retained');await page.waitForLoadState('networkidle');await expect(page.getByRole('link',{name:'Stats Explorer',exact:true})).toHaveAttribute('href',/releaseId=retained/);checks.push('Unavailable-tool alternatives preserve pinned context');
 fs.writeFileSync('docs/evidence/pf06-routes/context.json',JSON.stringify({checks},null,2)+'\n');console.log(checks);await browser.close();
})().catch(error=>{console.error(error);process.exit(1);});
