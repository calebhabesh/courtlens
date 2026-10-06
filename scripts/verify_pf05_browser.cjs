/* Production table verification: real analytical API; disposable personal-workspace proxy. */
const { chromium, expect } = require('../dashboard/node_modules/@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const base = 'http://127.0.0.1:3154', api = 'http://127.0.0.1:8000', out = 'docs/evidence/pf05-tables';
(async () => {
  const catalog = await (await fetch(`${api}/api/workbench/catalog`)).json();
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium' });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const report = { checks: [], geometry: [], errors: [], analytics: 'real FastAPI/PostgreSQL', personal: 'disposable in-memory proxy, one off-page favorite' };
  const warnings=[];page.on("console", message=>{if(message.type()==="warning") warnings.push(message.text());});
  page.on('pageerror', e => report.errors.push(e.message));
  const params = new URLSearchParams({releaseId:catalog.release_id,season:catalog.default_season,phase:catalog.default_phase,beforeDate:catalog.default_before_date,limit:'25'});
  async function open(extra='') { if(!extra.includes('identityMode')) extra+='&identityMode=photos'; await page.goto(`${base}/stats?${params}${extra}`); await page.waitForLoadState('networkidle'); }
  async function expected(field='pts_per_game', direction='desc', limit=25, cursor=null, name=null, player_ids=null) {
    const response=await fetch(`${api}/api/workbench/query`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:{release_id:catalog.release_id,season:catalog.default_season,phase:catalog.default_phase,before_date:catalog.default_before_date,window:{kind:'season'},sort:[{field,direction}],page:{limit,cursor},name},presentation:{player_ids}})});
    assert.equal(response.status,200);return response.json();
  }
  async function values(data,field,label){
    await expect(page.getByLabel("Sort table by metric")).toHaveValue(field);
    const rows=page.locator('.dense-stats-table tbody tr');await expect(rows).toHaveCount(data.items.length);
    const headers=await page.locator('.stats-header-tier-2 th').allTextContents();const index=headers.findIndex(x=>x.trim()===label);
    assert(index>=0,`${label} missing: ${headers}`);
    for(let i=0;i<data.items.length;i++){
      const row=rows.nth(i),item=data.items[i],cell=row.locator('td').nth(index);
      await expect(row.locator('.player-cell-name')).toHaveText(item.player_name);
      assert.equal(Number(await row.locator('.pinned-col-rank').innerText()),data.output_offset+i+1);
      assert.equal(Number((await cell.locator('.stat-main-value').innerText()).replaceAll(',','')),item.metrics[field]);
      assert.equal(Number(await cell.locator('.stat-pct-sublabel').innerText()),item.percentiles[field]);
    }
    report.checks.push({values:field,direction:data.query.sort_direction,rows:data.items.length,offset:data.output_offset});
  }
  await open();const data=await expected();await values(data,'pts_per_game','PPG');
  const table=page.locator('.dense-stats-table');const first=table.locator('tbody tr').first();
  await expect(first.locator('.stats-guide-cell')).toHaveCount(3);
  assert.deepEqual(await page.locator('.stats-group-th').allTextContents(),['Profile','Counting','Defense','Efficiency']);
  for(const [mode,label] of [['logos','Logos'],['initials','Initials'],['none','None'],['photos','Photos']]){
    await page.getByRole('group',{name:'Group guides',exact:true}).getByRole('button',{name:label,exact:true}).click();
    await page.waitForURL(url=>url.searchParams.get('identityMode')===mode);await page.waitForLoadState('networkidle');
    await expect(first.locator('.stats-guide-cell')).toHaveCount(mode==='none'?0:3);
    if(mode==='logos') await expect(first.locator('.stats-guide-cell .team-logo-stack')).toHaveCount(3);
    if(mode==='initials') await expect(first.locator('.stats-guide-initials')).toHaveCount(3);
    await expect(first.locator('.stats-primary-portrait')).toHaveCount(1);
    const counts=await table.evaluate(t=>({head:[...t.tHead.rows].map(r=>[...r.cells].reduce((sum,c)=>sum+c.colSpan,0)),body:t.tBodies[0].rows[0].cells.length}));
    assert(counts.head.every(n=>n===counts.body));report.checks.push({guide:mode,columns:counts.body});
  }
  await page.reload();await page.waitForLoadState('networkidle');await expect(first.locator('.stats-guide-cell')).toHaveCount(3);
  await open('&viewId=shooting&identityMode=logos');await expect(first.locator('.stats-guide-cell')).toHaveCount(4);report.checks.push({shooting_guides:true});
  await open();
  const sort=page.getByRole('button',{name:'Sort by PPG',exact:true});await sort.focus();await sort.press('Enter');
  await page.waitForURL(/sortDirection=asc/);await page.waitForLoadState('networkidle');await expect(sort.locator('..')).toHaveAttribute('aria-sort','ascending');
  await values(await expected('pts_per_game','asc'),'pts_per_game','PPG');
  await sort.focus();await sort.press('Space');await page.waitForURL(/sortDirection=desc/);await page.waitForLoadState('networkidle');await values(data,'pts_per_game','PPG');
  for(const [mode,field,label] of [['Totals','pts','PTS'],['Per 36','pts_per_36','PTS/36'],['Per Game','pts_per_game','PPG']]){
    await page.getByRole('button',{name:mode,exact:true}).click();await page.waitForURL(url=>url.searchParams.get('countingMode')===({Totals:'raw','Per 36':'per_36','Per Game':'per_game'})[mode]);await page.waitForLoadState('networkidle');await values(await expected(field),field,label);
  }
  const firstName=data.items[0].player_name;
  await page.getByRole('button',{name:'Next Page →',exact:true}).click();await page.waitForLoadState('networkidle');await values(await expected('pts_per_game','desc',25,data.next_cursor),'pts_per_game','PPG');
  const cursor=new URL(page.url()).searchParams.get('cursor');
  await page.getByRole('group',{name:'Group guides',exact:true}).getByRole('button',{name:'None',exact:true}).click();await page.waitForURL(/identityMode=none/);assert.equal(new URL(page.url()).searchParams.get('cursor'),cursor);
  const scroll=page.getByRole('region',{name:'Player statistics scroll area',exact:true});await scroll.focus();await page.keyboard.press('w');await page.waitForURL(/density=compact/);assert.equal(new URL(page.url()).searchParams.get('cursor'),cursor);await expect(scroll).toHaveClass(/density-compact/);
  await scroll.focus();await page.keyboard.press('e');await page.waitForURL(/density=standard/);await expect(scroll).toHaveClass(/density-standard/);
  await scroll.focus();await page.keyboard.press('t');assert.equal(await scroll.evaluate(el=>getComputedStyle(el).maxHeight),'none');await page.keyboard.press('t');
  report.checks.push({presentation_preserves_cursor:true,density_and_expansion:true});
  await page.getByRole('button',{name:'← First Page',exact:true}).click();await page.waitForLoadState('networkidle');await values(data,'pts_per_game','PPG');
  await page.getByLabel('Results per page').selectOption('100');await page.waitForLoadState('networkidle');await values(await expected('pts_per_game','desc',100),'pts_per_game','PPG');
  await page.getByLabel('Filter players by name').fill(firstName);await page.getByLabel('Filter players by name').press('Enter');await page.waitForLoadState('networkidle');await values(await expected('pts_per_game','desc',100,null,firstName),'pts_per_game','PPG');
  await page.goBack();await page.waitForLoadState('networkidle');await expect(page.getByLabel('Filter players by name')).toHaveValue('');report.checks.push({name_back_sync:true});
  await open('&favorites=1');const workspace=await(await fetch('http://127.0.0.1:8155/api/workbench/workspace')).json();
  await values(await expected('pts_per_game','desc',25,null,null,workspace.favorites),'pts_per_game','PPG');report.checks.push({off_page_favorite:workspace.favorites});
  await open();
  // C on a focused row fires once. C in an editable field or elsewhere never mutates selection.
  await first.focus();await page.keyboard.press('c');await expect(first.getByRole('checkbox')).toBeChecked();
  await expect(page.locator('.compare-tray-badge')).toHaveText('1/8');
  await page.getByLabel('Filter players by name').fill('c');await page.getByLabel('Filter players by name').press('c');await expect(page.locator('.compare-tray-badge')).toHaveText('1/8');
  await page.locator('h1').click();await page.keyboard.press('c');await expect(page.locator('.compare-tray-badge')).toHaveText('1/8');
  const second=table.locator('tbody tr').nth(1);await second.getByRole('checkbox').check();await expect(page.locator('.compare-tray-badge')).toHaveText('2/8');
  await page.getByRole('button',{name:'Next Page →',exact:true}).click();await page.waitForLoadState('networkidle');
  await expect(page.locator('.compare-tray-chip-name').first()).toHaveText(firstName);assert(!(await page.locator('.compare-tray').innerText()).includes(data.items[0].player_id));
  const href=await page.locator('.compare-tray-actions a').getAttribute('href');for(const [k,v] of params) if(k!=='limit') assert.equal(new URL(href,base).searchParams.get(k),v);
  await page.getByRole('button',{name:'← First Page',exact:true}).click();await page.waitForLoadState('networkidle');
  const detail=first.getByRole('button',{name:`Open details for ${firstName}`});await detail.click();const dialog=page.getByRole('dialog',{name:firstName,exact:true});await expect(dialog).toBeVisible();
  await page.keyboard.press('Tab');assert(await dialog.evaluate(d=>d.contains(document.activeElement)));
  await page.keyboard.press('Shift+Tab');assert(await dialog.evaluate(d=>d.contains(document.activeElement)));
  await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);await expect(detail).toBeFocused();
  report.checks.push({single_C:true,editable_ignored:true,tray_off_page_names:true,drawer_focus:true,comparison_context:true});
  await page.getByRole('button',{name:`Remove ${firstName} from compare tray`,exact:true}).click();await expect(page.locator('.compare-tray-badge')).toHaveText('1/8');
  await page.locator('.compare-tray-actions').getByRole('button',{name:'Clear',exact:true}).click();await expect(page.locator('.compare-tray')).toHaveCount(0);
  // All applicable presets: guide boundaries stay aligned and metric cells remain bounded.
  for(const preset of ['overview','shooting','defense','trueshooting','advanced','playmaking','rebounding','impact','sixfactor']){
    await open(`&viewId=${preset}`);
    const alignment=await table.evaluate(t=>({headers:[...t.tHead.rows].map(r=>[...r.cells].reduce((n,c)=>n+c.colSpan,0)),body:t.tBodies[0].rows[0].cells.length}));
    assert(alignment.headers.every(n=>n===alignment.body));report.checks.push({preset,alignment});
    const guideCount=(await page.locator('.stats-group-th').count())-1;
    for(const [mode,label] of [['logos','Logos'],['initials','Initials'],['none','None'],['photos','Photos']]) {
      await page.getByRole('group',{name:'Group guides',exact:true}).getByRole('button',{name:label,exact:true}).click();
      await page.waitForURL(url=>url.searchParams.get('identityMode')===mode);await page.waitForLoadState('networkidle');
      await expect(first.locator('.stats-guide-cell')).toHaveCount(mode==='none'?0:guideCount);
      assert.equal(await first.locator('.stats-guide-cell [tabindex]').count(),0);
    }
    report.checks.push({preset,all_guide_modes:true});
  }
  // Independently reconcile every displayed cell in all three modes and nine presets.
  for (const preset of ['overview','shooting','defense','trueshooting','advanced','playmaking','rebounding','impact','sixfactor']) {
    for (const mode of ['per_game','raw','per_36']) {
      await open(`&viewId=${preset}&countingMode=${mode}`);
      const field=mode==='raw'?'pts':mode==='per_36'?'pts_per_36':'pts_per_game';
      const actual=await expected(field);
      const options=await page.getByLabel('Sort table by metric').locator('option').evaluateAll(nodes=>nodes.map(node=>({field:node.value,label:node.textContent.split(' (')[0]})));
      const headers=await page.locator('.stats-header-tier-2 th').allTextContents();
      for(let i=0;i<3;i++) {
        const row=table.locator('tbody tr').nth(i),item=actual.items[i];await expect(row.locator('.player-cell-name')).toHaveText(item.player_name);
        for(const option of options) {
          const index=headers.findIndex(label=>label.trim()===option.label);if(index<0) continue;
          const cell=row.locator('td').nth(index);const text=await cell.locator('.stat-main-value').innerText();
          const value=item.metrics[option.field];
          if(value==null) assert.equal(text,'—');
          else if(text.endsWith('%')) assert.equal(Number(text.slice(0,-1)),Number((value*100).toFixed(1)));
          else if(['gp','min','pts','reb','oreb','dreb','ast','stl','blk','tov','pf','fgm','fga','fg3m','fg3a','ftm','fta'].includes(option.field)) assert.equal(Number(text.replaceAll(',','')),Math.round(value));
          else assert.equal(Number(text.replaceAll(',','')),Number(value.toFixed(option.field==='ftr'?3:1)));
          const percentile=item.percentiles[option.field];if(percentile!=null) assert.equal(Number(await cell.locator('.stat-pct-sublabel').innerText()),percentile);
        }
      }
      report.checks.push({preset,mode,independent_metric_rows:3});
    }
  }
  await open();
  for(const [width,height,label] of [[2560,1440,'wide'],[1440,900,'desktop'],[375,812,'mobile']]){
    await page.setViewportSize({width,height});await page.waitForTimeout(100);
    const region=page.getByRole('region',{name:'Player statistics scroll area',exact:true});
    await region.evaluate(el=>{el.scrollLeft=300;el.scrollTop=150;});
    const geometry=await region.evaluate(el=>{const row=el.querySelector('tbody tr'),name=row.querySelector('.pinned-col-name').getBoundingClientRect();return {viewport:[innerWidth,innerHeight],documentWidth:document.documentElement.scrollWidth,region:el.getBoundingClientRect().toJSON(),scrollWidth:el.scrollWidth,name:name.toJSON(),metrics:[...row.querySelectorAll('td.num')].map(td=>td.getBoundingClientRect().width),rowHeight:row.getBoundingClientRect().height};});
    assert(geometry.documentWidth<=width);assert(geometry.metrics.every(w=>w<=110));assert(Math.abs(geometry.name.x-geometry.region.x-(width>700?88:0))<3);assert(geometry.rowHeight>=48);
    report.geometry.push(geometry);await page.screenshot({path:`${out}/stats-${label}-scrolled.png`,fullPage:true});
    await region.evaluate(el=>{el.scrollLeft=0;el.scrollTop=0;});await page.screenshot({path:`${out}/stats-${label}.png`,fullPage:true});
    if(geometry.scrollWidth>geometry.region.width){await region.evaluate(el=>{el.scrollLeft=0;});await region.focus();const previous=await region.evaluate(el=>el.scrollLeft);await page.keyboard.press('d');assert((await region.evaluate(el=>el.scrollLeft))>previous);}
  }
  await page.setViewportSize({width:1440,height:900});await page.goto(`${base}/teams?${params}`);await page.waitForLoadState('networkidle');
  const teamSort=page.getByRole('button',{name:'Sort by Win%',exact:true}).first();await teamSort.focus();await teamSort.press('Space');await expect(teamSort.locator('..')).toHaveAttribute('aria-sort','ascending');report.checks.push({teams_keyboard_sort:true});
  assert.deepEqual(report.errors,[]);assert.deepEqual(warnings,[]);report.console_warnings=warnings;fs.writeFileSync(`${out}/browser.json`,JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify(report));
})().catch(error=>{console.error(error);process.exit(1);});
