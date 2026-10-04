// Usage: node scripts/verify_b30_finance_browser.cjs NEW_EVIDENCE_DIRECTORY
// Reads retained books through real local servers. Refuses existing output directories.
const path=require('node:path');
const {chromium}=require('../dashboard/node_modules/playwright');
const fs=require('fs');
(async()=>{
const repo=path.resolve(__dirname,'..');
const output=path.resolve(process.argv[2] || '');
if(!process.argv[2] || fs.existsSync(output)) throw new Error('New evidence directory required; refusing overwrite');
fs.mkdirSync(output,{recursive:true});
const base=process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3100';
const retained=JSON.parse(fs.readFileSync(repo+'/docs/evidence/b29-finance-query.json','utf8'));
const result=retained.cases.corrected.result;
const browser=await chromium.launch({executablePath:process.env.PW_CHROMIUM_PATH || '/usr/bin/chromium',headless:true});
try {
const page=await browser.newPage({viewport:{width:1440,height:1000}});
let requests=[];
page.on('response',async r=>{if(r.url().includes('/operations/finance')) requests.push({url:r.url(),status:r.status(),method:r.request().method()});});
const params=new URLSearchParams({finance_book_id:result.context.book_id,finance_financial_season:'2025-26',finance_known_at:result.context.known_at,finance_effective_on:'2025-02-12',finance_team_id:'1610612761',season:'2024-25'});
await page.goto(base+'/contracts/TOR?'+params);
await page.getByRole('region',{name:'Financial query result'}).waitFor();
await page.getByRole('button',{name:'Brandon Ingram',exact:true}).waitFor();
const body=await page.getByRole('region',{name:'Financial query result'}).innerText();
if(!body.includes('USD 40000000')||!body.includes('Unknown'))throw new Error('Real contract result mismatch');
await page.screenshot({path:output+'/contracts-desktop.png',fullPage:true});
await page.getByRole('button',{name:'Brandon Ingram',exact:true}).click();
await page.getByRole('dialog').waitFor();
const drawer=await page.getByRole('dialog').innerText();
if(!drawer.includes('Correction:')||!drawer.includes('Unknown'))throw new Error('Missing retained correction');
await page.screenshot({path:output+'/contract-drawer.png',fullPage:true});
await page.getByLabel('Basketball season',{exact:true}).fill('2024-25');
await page.getByLabel('Basketball exclusive cutoff').fill('2025-04-15');
await page.getByRole('button',{name:'Load player Stats'}).click();
await page.getByRole('region',{name:'Embedded player Stats'}).waitFor();
const embeddedStats=await page.getByRole('region',{name:'Embedded player Stats'}).innerText();
if(!embeddedStats.includes('Basketball season 2024-25'))throw new Error('Stats context mismatch');
await page.keyboard.press('Escape');
await page.getByRole('navigation',{name:'Finance views'}).getByRole('link',{name:'Free agency',exact:true}).click();
await page.getByRole('region',{name:'Financial query result'}).waitFor();
await page.setViewportSize({width:375,height:812});
await page.screenshot({path:output+'/free-agency-mobile.png',fullPage:true});
const mobileOverflow=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
if(mobileOverflow.scrollWidth>mobileOverflow.width)throw new Error('Mobile body overflow');
await page.getByLabel('Known at (UTC / explicit offset)').fill('2025-02-12T00:00:00Z');
await page.getByRole('button',{name:'Run financial query'}).click();
await page.getByRole('region',{name:'Financial query result'}).getByText('No represented contracts match this scope.',{exact:false}).waitFor();
const record={capture_kind:'real Chromium browser; network Next.js and FastAPI; retained PostgreSQL books; no mocked finance responses',book_id:result.context.book_id,result_sha256:result.result_sha256,contract_body:body,drawer_body:drawer,embeddedStats,mobileOverflow,requests,as_of_empty:true,import_job_mutations:'not executed in this read-only real-browser smoke'};
fs.writeFileSync(output+'/real-browser.json',JSON.stringify(record,null,2)+'\n',{flag:'wx'});
} finally {await browser.close();}
})().catch(err=>{console.error(err);process.exit(1);});
