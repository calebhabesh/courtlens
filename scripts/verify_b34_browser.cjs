// Production browser acceptance against real retained services, without mocked responses or AI.
const {chromium}=require('../dashboard/node_modules/playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
(async()=>{
  const output=path.resolve(process.argv[2]);
  if(fs.existsSync(output))throw new Error('Refusing to overwrite retained evidence');
  fs.mkdirSync(output,{recursive:true});
  const pinned=JSON.parse(process.env.B34_PINNED_CONTEXT);
  const pageUrl=new URL('http://127.0.0.1:3114/research/ask');
  for(const [key,value] of Object.entries(pinned))pageUrl.searchParams.set(key,value);
  const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true});
  const network=[];const errors=[];const workflows=[];
  try{
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();
    page.on('pageerror',error=>errors.push(error.message));
    page.on('response',response=>{if(response.url().includes('/assistant/'))network.push({method:response.request().method(),url:response.url(),status:response.status()});});
    await page.goto(pageUrl.href);
    await page.getByText('AI disabled · manual research available').waitFor();
    const cases=[['workload_shifts',{period_n:10,min_minutes:300,limit:20}],['similarity',{target_player_id:'1630567',window:'last_10',top_k:5}],['distribution',{player_id:'1630567',metric:'pts',window_n:20}],['compare_periods',{player_id:'1630567',mode:'appearances',period_a_n:10,period_b_n:10}],['splits',{player_id:'1630567',split_type:'venue'}]];
    for(const [operation,args] of cases){
      await page.getByLabel('Research operation',{exact:true}).selectOption(operation);
      await page.getByLabel('Operation arguments (JSON)').fill(JSON.stringify(args));
      if(operation==='distribution')await page.getByLabel('Include a minutes distribution with the same window').check();
      const responsePromise=page.waitForResponse(r=>r.url().endsWith('/assistant/turn')&&r.request().method()==='POST');
      const start=Date.now();await page.getByRole('button',{name:'Run manual operation'}).click();
      const answer=await (await responsePromise).json();
      assert.equal(answer.status,'answered');assert.equal(answer.accounting.provider_calls,0);
      await page.getByRole('region',{name:`${operation} data table`}).first().waitFor();
      await page.screenshot({path:path.join(output,`${operation}-desktop.png`),fullPage:true});
      if(operation==='distribution'){
        await page.setViewportSize({width:375,height:812});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:path.join(output,'distribution-mobile.png'),fullPage:true});
        await page.setViewportSize({width:812,height:375});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.setViewportSize({width:1440,height:1000});
      }
      const record={operation,elapsed_ms:Date.now()-start,response:answer,equivalent_views:[]};
      for(const result of answer.results){
        const url=new URL(result.open_url,'http://127.0.0.1:3114');
        assert.equal(url.pathname,'/research/operation');
        assert.equal(url.searchParams.get('operation'),result.operation);
        assert.deepEqual(JSON.parse(url.searchParams.get('arguments')),result.arguments);
        for(const [key,value]of Object.entries(pinned))assert.equal(url.searchParams.get(key),value);
        const reopenedPromise=page.waitForResponse(r=>r.url().endsWith('/assistant/turn')&&r.request().method()==='POST');
        await page.goto(url.href);const reopened=await(await reopenedPromise).json();
        await page.getByRole('region',{name:`${result.operation} data table`}).waitFor();
        assert.equal(reopened.accounting.provider_calls,0);
        assert.equal(reopened.results[0].result_hash,result.result_hash);
        assert.deepEqual(reopened.results[0].arguments,result.arguments);
        assert.deepEqual(reopened.results[0].data,result.data);
        if(result.operation==='distribution'){
          const loaded=page.waitForResponse(r=>r.url().endsWith('/assistant/turn')&&r.request().method()==='POST');await page.reload();
          const refreshed=await(await loaded).json();await page.getByRole('region',{name:'distribution data table'}).waitFor();assert.equal(refreshed.results[0].result_hash,result.result_hash);
        }
        record.equivalent_views.push({operation:result.operation,result_hash:result.result_hash,context_fingerprint:reopened.context_fingerprint,open_url:result.open_url});
      }
      workflows.push(record);
      await page.goto(pageUrl.href);await page.getByText('AI disabled · manual research available').waitFor();
    }
    await page.getByRole('button',{name:'Ask',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.waitFor();
    await page.screenshot({path:path.join(output,'drawer-desktop.png'),fullPage:true});await page.keyboard.press('Escape');await page.getByRole('button',{name:'Ask',exact:true}).focus();
    assert.equal(errors.length,0,errors.join('\n'));
    const ids=workflows.map(w=>w.response.conversation_id);
    // Idempotent cleanup also verifies that none of these manual workflows retain active state.
    for(const id of ids){const r=await context.request.delete(`http://localhost:8000/api/workbench/assistant/conversations/${id}`);assert.ok(r.ok());}
    fs.writeFileSync(path.join(output,'real-browser.json'),JSON.stringify({capture_kind:'real Chromium + production Next + FastAPI + retained PostgreSQL; no network mocks; no Gemini inference',workflows,network,page_errors:errors,viewport_checks:{mobile:375,landscape:812,body_overflow:false},remote_provider_calls:0},null,2)+'\n',{flag:'wx'});
    await context.close();
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exit(1);});
