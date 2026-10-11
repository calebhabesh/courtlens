import { expect, test, type Page } from "@playwright/test";
import type { SavedDetail, SaveRequest } from "../lib/saved-operations";
import type { Result } from "../lib/conversation";
const hash="a".repeat(64), savedId="22222222-2222-4222-8222-222222222222";
const context={release_id:"retained-release",season:"2024-25",phase:"regular_season",before_date:"2025-04-15",window:"season"};
const operations=["query","definition","profile","compare","team","forecast","distribution","compare_periods","splits","similarity","workload_shifts","finance"];
const results:Result[]=operations.map((operation,index)=>({step_id:`step-${index}`,operation,operation_version:"retained-v1",arguments:{metric:"pts"},operation_hash:hash,result_hash:hash,data:{},rows:[{value:0},{value:null}],evidence:[{evidence_id:`cell-${index}`,result_hash:hash,operation_hash:hash,operation_version:"retained-v1",context_fingerprint:hash,entity_id:"1630567",row_identity:"/rows/0",path:"/rows/0/value",metric:"pts",metric_version:"basketball-v2",unit:"points",value:0,sample:{n:20},input_identity:context,null_reason:null}],open_url:`/stats?releaseId=${context.release_id}&season=${context.season}&beforeDate=${context.before_date}`,eligible_count:2,limitations:["Descriptive; retained bounds"]}));
// A detail uses at most eight steps. Separate records cover all twelve operation types.
function detail(operation="distribution"):SavedDetail{return {id:savedId,title:"Retained scoring",created_at:"2026-10-04T12:00:00Z",manifest_sha256:hash,metadata:{question_saved:false,question:null},manifest:{schema_version:"courtload-saved-operation-v1",context,context_fingerprint:hash,plan:{steps:[]},origin_plan:{steps:[]},origin_manifest_sha256:hash,metric_version:"basketball-v2",result_scope:"complete_stats_cohort_and_declared_operation_bounds",results:results.filter(result=>result.operation===operation),limitations:["Upstream aggregate rounding remains explicit"]}};}
async function mock(page:Page,{failure=false,mismatch=false,operation="distribution"}={}){
  const saves:SaveRequest[]=[];const reads:string[]=[];let first=failure;let reproductions=0;
  await page.route("**/api/workbench/assistant/**",async route=>{
    const path=new URL(route.request().url()).pathname;reads.push(path);
    if(path.endsWith("/status"))return route.fulfill({json:{configured:false,model:"fixture"}});
    if(path.endsWith("/operations"))return route.fulfill({json:[]});
    if(path.endsWith("/turn")){const req=route.request().postDataJSON();return route.fulfill({json:{schema_version:"courtload-conversation-v1",status:"answered",conversation_id:"11111111-1111-4111-8111-111111111111",turn_id:req.request_id,context,context_fingerprint:hash,interpretation:"Executed without AI",plan:req.plan,results:detail().manifest.results,choices:[],limitations:[],manifest:{hash},accounting:{provider_calls:0}}});}
    if(route.request().method()==="DELETE")return route.fulfill({json:{cleared:true}});
    if(path.endsWith("/investigations")&&route.request().method()==="POST"){
      const req=route.request().postDataJSON() as SaveRequest;saves.push(req);
      if(first){first=false;return route.fulfill({status:503,json:{detail:"Transient save failure"}});}
      return route.fulfill({json:{...detail(),title:req.title,metadata:{question_saved:req.include_question,question:req.include_question?"Selected server question":null}}});
    }
    if(path.endsWith("/investigations")){const value=detail();return route.fulfill({json:[{...value,context,operations:[operation],question_saved:false}]});}
    if(path.endsWith("/reproduce")){reproductions++;return route.fulfill({json:{id:savedId,manifest_sha256:hash,match:!mismatch,reason:mismatch?"Unsupported retained version":null,provider_calls:0,operations:[{step_id:"step",operation,match:!mismatch,saved_result_sha256:hash,recomputed_result_sha256:mismatch?"b".repeat(64):hash}]}});}
    if(path.endsWith("/export"))return route.fulfill({body:"retained bytes",headers:{"Content-Disposition":"attachment; filename=retained.json","Cache-Control":"no-store"}});
    return route.fulfill({json:detail(operation)});
  });return {saves,reads,get reproductions(){return reproductions;}};
}
test("explicit save excludes question by default, reuses identity after failure and survives clearing",async({page})=>{
  const calls=await mock(page,{failure:true});await page.goto("/research/ask?experience=manual");await expect(page.getByText("AI disabled · manual research available",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Run manual operation"}).click();
  const opt=page.getByLabel("Retain my selected question as durable metadata");await expect(opt).not.toBeChecked();
  await page.getByLabel("Investigation title").fill("Pinned scoring");await page.getByRole("button",{name:"Save investigation",exact:true}).click();
  await expect(page.getByRole("alert").filter({hasText:"Transient save failure"})).toContainText("Transient save failure");await expect(page.getByRole("alert").filter({hasText:"Transient save failure"})).toBeFocused();await page.getByRole("button",{name:"Retry saving investigation"}).click();
  await expect(page.getByRole("link",{name:"Pinned scoring"})).toBeVisible();expect(calls.saves).toHaveLength(2);expect(calls.saves[0]).toEqual(calls.saves[1]);expect(calls.saves[0].include_question).toBe(false);expect(Object.keys(calls.saves[0]).sort()).toEqual(["request_id","conversation_id","turn_id","context_fingerprint","title","include_question"].sort());
  await page.getByRole("button",{name:"Clear conversation"}).click();await page.goto(`/investigations/saved/${savedId}`);await expect(page.getByText("The question was not retained.",{exact:false})).toBeVisible();await page.reload();await expect(page.getByRole("heading",{name:"Retained scoring"})).toBeVisible();
});
test("question opt-in is independent from execution and title",async({page})=>{
  const calls=await mock(page);await page.goto("/research/ask?experience=manual");await expect(page.getByText("AI disabled · manual research available",{exact:true})).toBeVisible();await page.getByRole("button",{name:"Run manual operation"}).click();await page.getByLabel("Investigation title").fill("Chosen title");await page.getByLabel("Retain my selected question as durable metadata").check();await page.getByRole("button",{name:"Save investigation",exact:true}).click();await expect(page.getByRole("link",{name:"Chosen title"})).toBeVisible();expect(calls.saves[0].include_question).toBe(true);
});
test("combined library keeps legacy section and opens exact retained namespace",async({page})=>{
  await mock(page);await page.goto("/investigations");await expect(page.getByRole("region",{name:"Legacy saved investigations"})).toBeVisible();await page.getByRole("link",{name:"Retained scoring"}).click();await expect(page).toHaveURL(new RegExp(`/investigations/saved/${savedId}`));await expect(page.getByRole("heading",{name:"Retained scoring"})).toBeVisible();
});
for(const operation of operations)test(`${operation} retained result exposes evidence, pinned reopening, exports and reproduction`,async({page})=>{
  const calls=await mock(page,{operation});await page.goto(`/investigations/saved/${savedId}`);await expect(page.getByRole("region",{name:`${operation} data table · pts`})).toContainText("Unknown");
  await page.getByText("Definitions, inputs and exact evidence (1 cells)").click();await expect(page.getByRole("region",{name:`${operation} evidence table`})).toContainText("points");await expect(page.getByRole("link",{name:"Open in Stats"})).toHaveAttribute("href",new RegExp("releaseId=retained-release.*beforeDate=2025-04-15"));
  await expect(page.getByRole("link",{name:"Export JSON",exact:true})).toHaveAttribute("href",new RegExp(`${savedId}/export\\?format=json`));const download=page.waitForEvent("download");await page.getByRole("link",{name:"Export JSON",exact:true}).click();await download;
  await page.getByRole("button",{name:"Verify reproduction without AI"}).click();await expect(page.getByRole("status").filter({hasText:"Provider calls"})).toContainText("PASS");expect(calls.reproductions).toBe(1);expect(calls.reads.some(path=>path.endsWith("/turn"))).toBe(false);
});
test("reproduction mismatch keeps exports and retained evidence usable on narrow screens",async({page})=>{
  await mock(page,{mismatch:true});await page.setViewportSize({width:375,height:812});await page.emulateMedia({reducedMotion:"reduce"});await page.goto(`/investigations/saved/${savedId}`);await page.getByRole("button",{name:"Verify reproduction without AI"}).click();await expect(page.getByRole("status").filter({hasText:"Provider calls"})).toContainText("MISMATCH · Unsupported retained version");await expect(page.getByRole("link",{name:"Export CSV"})).toBeVisible();await page.getByRole("region",{name:"distribution data table · pts"}).focus();await expect(page.getByRole("region",{name:"distribution data table · pts"})).toBeFocused();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath("saved-mobile.png"),fullPage:true});await page.setViewportSize({width:812,height:375});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("original content, live catalog version and installation metadata are local and truthful",async({page,request})=>{
  await page.goto("/whats-new/blog");await expect(page.getByRole("heading",{name:"Evidence before narrative"})).toBeVisible();await page.goto("/whats-new");await expect(page.getByRole("heading",{name:"Patch notes: retained analytical operations"})).toBeVisible();await page.goto("/methodology/learning");await expect(page.getByRole("heading",{name:"Investigate historical scoring variation"})).toBeVisible();await expect(page.getByRole("combobox",{name:"Lesson player",exact:true})).toBeVisible();
  await page.goto("/methodology");await expect(page.getByText(/Canonical Metric Catalog/)).toContainText("(courtlens-stats-v3)");await expect(page.getByText("20 Metrics",{exact:true}).filter({visible:true})).toBeVisible();await page.goto("/settings");await expect(page.getByRole("heading",{name:"Install CourtLens"})).toBeVisible();
  const manifestResponse=await request.get("/manifest.webmanifest");expect(manifestResponse.ok()).toBe(true);const manifest=await manifestResponse.json();expect(manifest.start_url).toBe("/stats");expect(manifest.display).toBe("standalone");
  for(const icon of manifest.icons){const response=await request.get(icon.src);expect(response.ok()).toBe(true);expect(response.headers()["content-type"]).toContain("image/png");const bytes=await response.body();const n=Number(icon.sizes.split("x")[0]);expect(bytes.readUInt32BE(16)).toBe(n);expect(bytes.readUInt32BE(20)).toBe(n);}
  expect(await page.evaluate(async()=>({workers:(await navigator.serviceWorker.getRegistrations()).length,caches:await caches.keys()}))).toEqual({workers:0,caches:[]});
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute("href","/manifest.webmanifest");
});
test("saved-operation pagination preserves boundaries and failed pages stay explicit",async({page})=>{
  await mock(page);let fail=true;
  await page.route("**/assistant/investigations?**",async route=>{
    const offset=Number(new URL(route.request().url()).searchParams.get("offset"));
    if(offset===50&&fail){fail=false;return route.fulfill({status:503,json:{detail:"Saved library unavailable"}});}
    return route.fulfill({json:Array.from({length:offset===0?50:1},(_,i)=>({id:`record-${offset+i}`,title:`Saved row ${offset+i}`,created_at:"2026-10-04",manifest_sha256:hash,context,operations:["query"],question_saved:false}))});
  });
  await page.goto("/investigations");await expect(page.getByRole("link",{name:"Saved row 49",exact:true})).toBeVisible();await page.getByRole("button",{name:"Next saved operations"}).click();await expect(page.getByRole("alert").filter({hasText:"Saved library unavailable"})).toBeVisible();await expect(page.getByRole("link",{name:"Saved row 49",exact:true})).toHaveCount(0);await page.getByRole("button",{name:"Retry library"}).click();await expect(page.getByRole("link",{name:"Saved row 50",exact:true})).toBeVisible();await expect(page.getByRole("button",{name:"Next saved operations"})).toBeDisabled();await page.getByRole("button",{name:"Previous saved operations"}).click();await expect(page.getByRole("link",{name:"Saved row 0",exact:true})).toBeVisible();
});
test("install prompt accepts a browser event and exposes installed state",async({page})=>{
  await page.goto("/settings");await page.getByRole("heading",{name:"Install CourtLens"}).waitFor();await page.waitForLoadState("networkidle");
  await page.evaluate(()=>{const event=new Event("beforeinstallprompt",{cancelable:true});Object.assign(event,{prompt:async()=>{},userChoice:Promise.resolve({outcome:"accepted"})});window.dispatchEvent(event);});
  await page.getByRole("button",{name:"Install local app"}).click();await expect(page.getByRole("status").filter({hasText:"Installation accepted"})).toBeVisible();await page.evaluate(()=>window.dispatchEvent(new Event("appinstalled")));await expect(page.getByRole("status").filter({hasText:"Running as a standalone app"})).toBeVisible();await expect(page.getByRole("button",{name:"Install local app"})).toHaveCount(0);
});
