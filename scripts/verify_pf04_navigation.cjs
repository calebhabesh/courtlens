const {chromium,expect}=require('../dashboard/node_modules/@playwright/test');
const fs=require('node:fs');const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'/usr/bin/chromium'}),page=await browser.newPage({viewport:{width:1440,height:900}}),checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const scope='season=2024-25&phase=regular_season&beforeDate=2025-06-30&window=last_10';
 await page.goto('http://127.0.0.1:3154/team-compare?teamA=1610612761&teamB=1610612738&'+scope);await page.waitForLoadState('networkidle');
 await page.getByRole('combobox',{name:'Team B',exact:true}).fill('lakers');await page.getByRole('option').filter({hasText:'Los Angeles Lakers'}).click();await page.waitForURL(/teamB=1610612747/);await expect(page.getByRole('button',{name:'Remove Los Angeles Lakers from Team B',exact:true})).toBeVisible();assert.equal(new URL(page.url()).searchParams.get('window'),'last_10');checks.push('real team comparison selection preserves window');
 await page.goBack();await expect(page.getByRole('button',{name:'Remove Boston Celtics from Team B',exact:true})).toBeVisible();checks.push('team comparison Back reconciles committed selections');
 for(const [route,label] of [['last-games','Switch player'],['showcase','Add or jump to player']]){
   await page.goto('http://127.0.0.1:3154/'+route+'?playerId=203999&'+scope);await page.waitForLoadState('networkidle');
   await page.getByRole('combobox',{name:label,exact:true}).fill('scottie');await page.getByRole('option').filter({hasText:'Scottie Barnes'}).click();await page.waitForURL(/playerId=1630567/);assert.equal(new URL(page.url()).searchParams.get('window'),'last_10');checks.push(`${route} action selection preserves canonical destination/context`);
 }
 assert.deepEqual(errors,[]);fs.writeFileSync('docs/evidence/pf04-selection/navigation.json',JSON.stringify({checks,errors},null,2)+'\n');await browser.close();console.log(JSON.stringify({checks:checks.length,errors}));
})().catch(e=>{console.error(e);process.exit(1);});
