/* Production-browser verification of B35b against retained local evidence.
 * Usage: node scripts/verify_b35b_browser.cjs NEW_OUTPUT_DIRECTORY [--reuse-saved]
 * One explicit UI save is exercised; no acquisition/publication/model/provider calls.
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('../dashboard/node_modules/playwright');
const output=process.argv[2];
if(!output||fs.existsSync(output))throw new Error('A new evidence directory is required');
fs.mkdirSync(output,{recursive:true});
const reuse=process.argv.includes("--reuse-saved");
const api=process.env.B35B_API_URL||'http://127.0.0.1:8035';
const site=process.env.B35B_SITE_URL||'http://127.0.0.1:3135';
async function json(url){const response=await fetch(url,{cache:'no-store'});assert.equal(response.status,200);return response.json();}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM_PATH||'/usr/bin/chromium',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();
 const errors=[],mutations=[],requests=[],records=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.on('request',request=>{if(request.url().includes('/api/')){requests.push({method:request.method(),path:new URL(request.url()).pathname});if(request.method()!=='GET')mutations.push({method:request.method(),path:new URL(request.url()).pathname});}});
 try{
  const summaries=await json(api+'/api/workbench/assistant/investigations?limit=100');
  const selected=new Map();for(const item of summaries)for(const op of item.operations)if(!selected.has(op))selected.set(op,item);
  assert.equal(selected.size,12);
  for(const [operation,item]of selected){
   const saved=await json(`${api}/api/workbench/assistant/investigations/${item.id}`);
   await page.goto(`${site}/investigations/saved/${item.id}`);
   await page.getByRole('heading',{name:item.title,exact:true}).waitFor();
   const result=saved.manifest.results.find(result=>result.operation===operation);
   const section=page.getByRole('region',{name:`${operation} result`,exact:true});
   await section.waitFor();
   await section.locator('summary').filter({hasText:'Definitions, inputs and exact evidence'}).click();
   assert.equal(await section.getByRole('region',{name:`${operation} evidence table`,exact:true}).isVisible(),true);
   await page.getByRole('button',{name:'Verify reproduction without AI'}).click();
   await page.getByRole('status').filter({hasText:'PASS · all retained results'}).waitFor({timeout:60000});
   const exportRecords={};
   for(const format of ['JSON','CSV']){
    const waiting=page.waitForEvent('download');await page.getByRole('link',{name:`Export ${format}`,exact:true}).click();const download=await waiting;
    const dest=path.join(output,`${operation}.${format.toLowerCase()}`);await download.saveAs(dest);
    exportRecords[format.toLowerCase()]={bytes:fs.statSync(dest).size,filename:download.suggestedFilename()};
    if(format==='JSON')assert.equal(JSON.parse(fs.readFileSync(dest,'utf8')).manifest_sha256,item.manifest_sha256);
   }
   const link=section.getByRole('link').filter({hasText:/Open/});
   if(result.open_url){assert.equal(await link.getAttribute('href'),result.open_url);const response=await page.goto(site+result.open_url);assert.equal(response.status(),200);}
   records.push({operation,id:item.id,manifest_sha256:item.manifest_sha256,evidence_cells:result.evidence.length,rows:result.rows.length,open_url:result.open_url,reproduction:'match',exports:exportRecords});
  }
  const catalog=await json(api+'/api/workbench/catalog');
  await page.goto(site+'/learning');const lesson=page.getByRole('link',{name:'Run this pinned distribution without AI'});await lesson.waitFor();assert.ok((await lesson.getAttribute('href')).includes('release_id='+catalog.release_id));
  await page.screenshot({path:path.join(output,'learning-desktop.png'),fullPage:true});
  for(const route of ['/blog','/patch-notes','/methodology','/settings']){const response=await page.goto(site+route);assert.equal(response.status(),200);await page.locator('main h1').waitFor();}
  let newHref;
  if(reuse){const item=summaries.find(item=>item.title==='B35b production-browser: scoring distribution');assert.ok(item);newHref='/investigations/saved/'+item.id;}
  else {
  await page.goto(site+'/research/ask?season=2024-25');
  await page.getByText('AI disabled · manual research available',{exact:true}).waitFor();
  await page.getByLabel('Research operation',{exact:true}).selectOption('distribution');
  await page.getByLabel('Operation arguments (JSON)').fill(JSON.stringify({player_id:'1630567',metric:'pts',window_n:5}));
  await page.getByRole('button',{name:'Run manual operation'}).click();
  await page.getByLabel('Investigation title').waitFor({timeout:60000});
  assert.equal(await page.getByLabel('Retain my selected question as durable metadata').isChecked(),false);
  await page.getByLabel('Investigation title').fill('B35b production-browser: scoring distribution');
  await page.getByRole('button',{name:'Save investigation',exact:true}).click();
  const retained=page.getByRole('link',{name:'B35b production-browser: scoring distribution',exact:true});await retained.waitFor({timeout:60000});
  newHref=await retained.getAttribute('href');
  await page.getByRole('button',{name:'Clear conversation'}).click();
  }
  await page.goto(site+newHref);await page.getByRole('heading',{name:'B35b production-browser: scoring distribution',exact:true}).waitFor();
  await page.reload();await page.getByText('The question was not retained.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Verify reproduction without AI'}).click();await page.getByRole('status').filter({hasText:'PASS · all retained results'}).waitFor({timeout:60000});
  await page.setViewportSize({width:375,height:812});await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:path.join(output,'saved-mobile.png'),fullPage:true});
  await page.setViewportSize({width:812,height:375});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>document.documentElement.style.zoom='2');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.evaluate(()=>document.documentElement.style.zoom='');
  await page.goto(site+'/investigations');await page.getByRole('link',{name:'B35b production-browser: scoring distribution',exact:true}).waitFor();await page.getByRole('region',{name:'Legacy saved investigations'}).waitFor();
  await page.screenshot({path:path.join(output,'library-desktop.png'),fullPage:true});
  const manifest=await json(site+'/manifest.webmanifest');assert.equal(manifest.start_url,'/stats');
  const cache=await page.evaluate(async()=>({workers:(await navigator.serviceWorker.getRegistrations()).length,caches:await caches.keys()}));assert.deepEqual(cache,{workers:0,caches:[]});
  assert.equal(errors.length,0,JSON.stringify(errors));
  assert.equal(mutations.filter(req=>!req.path.startsWith('/api/workbench/assistant/') && !(req.method==='POST' && req.path==='/api/workbench/operations/finance')).length,0,JSON.stringify(mutations));
  const newDetail=await json(api+'/api/workbench/assistant/investigations/'+newHref.split('/').at(-1));assert.equal(newDetail.metadata.question_saved,false);
  const after=await json(api+'/api/workbench/assistant/investigations?limit=100');
  const evidence={block:'B35b',recorded_at:new Date().toISOString(),mode:'production browser against real local PostgreSQL API; AI disabled',retained_types:records,new_save:{id:newDetail.id,manifest_sha256:newDetail.manifest_sha256,question_saved:false,reproduced_after_clear_and_reload:true,reused_existing_record:reuse},inventory_before:summaries.length,inventory_after:after.length,learning_release:catalog.release_id,manifest,cache,page_errors:errors,mutations,requests,limits:['Actual OS installation not automated','No real Gemini evaluation','No release-wide source/model acceptance']};
  fs.writeFileSync(path.join(output,'verification.json'),JSON.stringify(evidence,null,2)+'\n');
  process.stdout.write(JSON.stringify({retained_types:records.length,new_save:newDetail.id,page_errors:errors.length,cache})+'\n');
 }finally{await browser.close();}
})().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
